"""
图索引模块
实现实体和关系的键值对结构 (K,V)
K: 索引键（简短词汇或短语）
V: 详细描述段落（包含相关文本片段）
"""

import json
import logging
from typing import Dict, List, Tuple, Any, Optional
from dataclasses import dataclass
from collections import defaultdict

from langchain_core.documents import Document

logger = logging.getLogger(__name__)

@dataclass
class EntityKeyValue:
    """实体键值对"""
    entity_name : set
    index_keys : List[str]
    value_content: str
    entity_type : str
    metadata : Dict[str,Any]

    
@dataclass 
class RelationKeyValue:
    """关系键值对"""
    relation_id: str
    index_keys: List[str]  # 多个索引键（可包含全局主题）
    value_content: str     # 关系描述内容
    relation_type: str     # 关系类型
    source_entity: str     # 源实体
    target_entity: str     # 目标实体
    metadata: Dict[str, Any]



class GraphIndexingModule:
    """
    图索引模块
    核心功能：
    1. 为实体创建键值对（名称作为唯一索引键）
    2. 为关系创建键值对（多个索引键，包含全局主题）
    3. 去重和优化图操作
    4. 支持增量更新
    """

    def __init__(self, config, llm_client):
        self.config = config
        self.llm_client = llm_client

        # 键值对存储
        self.entity_kv_store: Dict[str,EntityKeyValue] = {}
        self.relation_kv_store : Dict[str,RelationKeyValue] = {}

        # 索引映射：key -> entity/relation IDs
        self.key_to_entities: Dict[str, List[str]] = defaultdict(list) # defaultdict(list) 是 Python collections 模块中的一个特殊字典，它解决了访问不存在的键时抛出 KeyError 的问题。
        self.key_to_relations: Dict[str, List[str]] = defaultdict(list)

    def get_entities_by_key(self,key:str) -> List[EntityKeyValue]:
        """根据索引键获取实体"""
        entity_ids = self.key_to_entities.get(key,[])
        return [self.entity_kv_store[eid] for eid in entity_ids if eid in self.entity_kv_store]
    def get_relations_by_key(self, key: str) -> List[RelationKeyValue]:
        """根据索引键获取关系"""
        relation_ids = self.key_to_relations.get(key, [])
        return [self.relation_kv_store[rid] for rid in relation_ids if rid in self.relation_kv_store]