"""
图索引模块
实现适配工业设备/数字孪生场景的实体与关系索引。
"""

import logging
import re
from collections import defaultdict
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List

from langchain_core.documents import Document

logger = logging.getLogger(__name__)


def _normalize_key(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip()).lower()


def _tokenize(text: str) -> List[str]:
    if not text:
        return []
    raw_tokens = re.findall(r"[A-Za-z0-9\-_]+|[\u4e00-\u9fff]{2,}", text)
    seen = set()
    tokens: List[str] = []
    for token in raw_tokens:
        key = _normalize_key(token)
        if not key or key in seen:
            continue
        seen.add(key)
        tokens.append(key)
    return tokens


@dataclass
class EntityKeyValue:
    entity_name: str
    index_keys: List[str]
    value_content: str
    entity_type: str
    metadata: Dict[str, Any]


@dataclass
class RelationKeyValue:
    relation_id: str
    index_keys: List[str]
    value_content: str
    relation_type: str
    source_entity: str
    target_entity: str
    metadata: Dict[str, Any]


class GraphIndexingModule:
    """为设备实体和关系构建轻量级内存索引。"""

    def __init__(self, config, llm_client):
        self.config = config
        self.llm_client = llm_client
        self.entity_kv_store: Dict[str, EntityKeyValue] = {}
        self.relation_kv_store: Dict[str, RelationKeyValue] = {}
        self.key_to_entities: Dict[str, List[str]] = defaultdict(list)
        self.key_to_relations: Dict[str, List[str]] = defaultdict(list)

    def build_from_documents(self, documents: Iterable[Document]) -> None:
        self.entity_kv_store.clear()
        self.relation_kv_store.clear()
        self.key_to_entities.clear()
        self.key_to_relations.clear()

        for doc in documents:
            metadata = dict(doc.metadata or {})
            node_id = metadata.get("node_id")
            if not node_id:
                continue

            entity_name = (
                metadata.get("entity_name")
                or metadata.get("equipment_name")
                or metadata.get("name")
                or node_id
            )
            entity_type = metadata.get("node_type", "Equipment")
            index_keys = self._build_entity_keys(entity_name, metadata)
            entity = EntityKeyValue(
                entity_name=entity_name,
                index_keys=index_keys,
                value_content=doc.page_content,
                entity_type=entity_type,
                metadata=metadata,
            )
            self.entity_kv_store[node_id] = entity
            for key in index_keys:
                if node_id not in self.key_to_entities[key]:
                    self.key_to_entities[key].append(node_id)

            for relation in metadata.get("relations", []) or []:
                self._add_relation(node_id, entity_name, relation)

        logger.info(
            "图索引构建完成，实体 %d 个，关系 %d 个",
            len(self.entity_kv_store),
            len(self.relation_kv_store),
        )

    def get_entities_by_key(self, key: str) -> List[EntityKeyValue]:
        normalized = _normalize_key(key)
        entity_ids = self.key_to_entities.get(normalized, [])
        return [self.entity_kv_store[eid] for eid in entity_ids if eid in self.entity_kv_store]

    def get_relations_by_key(self, key: str) -> List[RelationKeyValue]:
        normalized = _normalize_key(key)
        relation_ids = self.key_to_relations.get(normalized, [])
        return [self.relation_kv_store[rid] for rid in relation_ids if rid in self.relation_kv_store]

    def _build_entity_keys(self, entity_name: str, metadata: Dict[str, Any]) -> List[str]:
        candidates: List[str] = [entity_name]
        for field in (
            "node_id",
            "equipment_type",
            "production_line",
            "location",
            "status",
            "category",
            "type",
        ):
            value = metadata.get(field)
            if value:
                candidates.append(str(value))

        for bucket in ("sensor_names", "fault_modes", "spare_parts", "document_titles", "aliases", "keywords"):
            for value in metadata.get(bucket, []) or []:
                candidates.append(str(value))

        keys: List[str] = []
        seen = set()
        for candidate in candidates:
            normalized = _normalize_key(candidate)
            if normalized and normalized not in seen:
                seen.add(normalized)
                keys.append(normalized)
            for token in _tokenize(candidate):
                if token not in seen:
                    seen.add(token)
                    keys.append(token)
        return keys

    def _add_relation(self, source_id: str, source_name: str, relation: Dict[str, Any]) -> None:
        relation_type = str(relation.get("type", "RELATED_TO"))
        target_id = str(relation.get("target_id") or relation.get("target_name") or "")
        target_name = str(relation.get("target_name") or target_id or "未知对象")
        relation_id = f"{source_id}:{relation_type}:{target_id or target_name}"
        content = f"{source_name} -[{relation_type}]-> {target_name}"
        metadata = {
            "source_name": source_name,
            "target_name": target_name,
            "source_id": source_id,
            "target_id": target_id,
            **{k: v for k, v in relation.items() if k not in {"type", "target_id", "target_name"}},
        }
        index_keys = self._build_relation_keys(source_name, target_name, relation_type, metadata)
        item = RelationKeyValue(
            relation_id=relation_id,
            index_keys=index_keys,
            value_content=content,
            relation_type=relation_type,
            source_entity=source_id,
            target_entity=target_id or target_name,
            metadata=metadata,
        )
        self.relation_kv_store[relation_id] = item
        for key in index_keys:
            if relation_id not in self.key_to_relations[key]:
                self.key_to_relations[key].append(relation_id)

    def _build_relation_keys(
        self,
        source_name: str,
        target_name: str,
        relation_type: str,
        metadata: Dict[str, Any],
    ) -> List[str]:
        candidates = [source_name, target_name, relation_type]
        candidates.extend(str(v) for v in metadata.values() if isinstance(v, (str, int, float)))
        keys: List[str] = []
        seen = set()
        for candidate in candidates:
            normalized = _normalize_key(str(candidate))
            if normalized and normalized not in seen:
                seen.add(normalized)
                keys.append(normalized)
            for token in _tokenize(str(candidate)):
                if token not in seen:
                    seen.add(token)
                    keys.append(token)
        return keys
