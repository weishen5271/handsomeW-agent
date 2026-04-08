# Graph RAG 与数字孪生业务结合方案

> 本文档描述如何将项目现有的 Graph RAG 能力从菜谱场景改造为工业设备/数字孪生业务场景，并与 Agent 系统深度集成。

---

## 一、项目现状

### 1.1 现有架构

```
handsomeW-agent/
├── backend/
│   ├── agent/                    # Agent 实现
│   │   ├── react_agent.py        # ReAct 模式 Agent
│   │   ├── base_agent.py         # 抽象基类
│   │   └── ...
│   ├── api/
│   │   ├── agent_service.py      # Agent 服务 (RAG 集成当前禁用)
│   │   ├── routes.py             # API 路由
│   │   └── digital_twin_*.py     # 数字孪生 API
│   ├── core/
│   │   ├── llm.py                # 多 Provider LLM 客户端
│   │   ├── context.py            # Prompt 上下文构建
│   │   └── skill.py              # Skill 加载器
│   ├── tools/                    # 工具系统
│   │   └── builtin/              # 内置工具
│   │       ├── file_tool.py
│   │       ├── search_tool.py
│   │       └── ...
│   ├── graph_rag/                # Graph RAG 核心模块
│   │   ├── config.py             # 配置管理
│   │   ├── runtime.py            # 运行时主控制器
│   │   └── rag_modules/           # RAG 子模块
│   │       ├── graph_data_preparation.py    # 数据准备 (菜谱)
│   │       ├── milvus_index_construction.py  # 向量索引
│   │       ├── hybrid_retrieval.py           # 混合检索
│   │       ├── graph_rag_retrieval.py        # 图 RAG 检索
│   │       ├── intelligent_query_router.py   # 智能查询路由
│   │       └── generation_integration.py     # 生成集成
│   └── rag/
│       └── graph_rag_bridge.py   # Agent 与 GraphRAG 桥接层
```

### 1.2 Graph RAG 现状

| 模块 | 状态 | 说明 |
|------|------|------|
| Neo4j 数据层 | ✅ 已有 | 菜谱数据（Recipe/Ingredient/CookingStep） |
| Milvus 向量索引 | ✅ 已有 | 文档向量化存储和检索 |
| 混合检索 | ✅ 已有 | 实体级 + 主题级双层检索 |
| 图 RAG 检索 | ✅ 已有 | 多跳遍历、子图提取、图推理 |
| 智能查询路由 | ✅ 已有 | 自动选择检索策略 |
| Agent 集成 | ❌ 禁用 | `_build_prompt_with_rag()` 未启用 |
| 业务适配 | ❌ 菜谱 | 当前数据模型面向菜谱领域 |

---

## 二、业务场景分析

### 2.1 目标场景：工业设备知识管理

将 Graph RAG 改造服务于数字孪生/工业制造业场景，核心业务实体如下：

| 实体类型 | 说明 | 示例 |
|----------|------|------|
| **Equipment** | 生产设备 | 主电机、输送带控制器、液压单元 |
| **Sensor** | 传感器 | 振动传感器、温度传感器、压力传感器 |
| **ProductionLine** | 生产线/产线 | 1号生产线、2号生产线 |
| **Process** | 工艺流程 | 加工、装配、检测 |
| **FaultMode** | 故障模式 | 过载、振动异常、温度过高 |
| **MaintenanceRecord** | 维护记录 | 保养、维修、点检 |
| **SparePart** | 备件 | 轴承、密封圈、润滑油 |
| **Alarm** | 告警记录 | 温度告警、压力告警 |
| **Document** | 设备文档 | 操作手册、维护指南 |

### 2.2 核心关系设计

```
设备 (Equipment)
    │
    ├──[CONTAINS]──▶ 传感器 (Sensor)           # 设备包含传感器
    ├──[LOCATED_AT]──▶ 产线 (ProductionLine)   # 设备位于某产线
    ├──[DEPENDS_ON]──▶ 设备 (Equipment)        # 设备依赖关系（上下游）
    ├──[EXHIBITS]──▶ 故障模式 (FaultMode)      # 设备表现出故障模式
    ├──[CAUSES]──▶ 告警 (Alarm)               # 故障导致告警
    ├──[REQUIRES]──▶ 维护记录 (MaintenanceRecord)  # 设备需要维护
    ├──[USES]──▶ 备件 (SparePart)             # 设备使用备件
    └──[HAS_DOC]──▶ 文档 (Document)            # 设备有相关文档

产线 (ProductionLine)
    │
    └──[HAS]──▶ 设备 (Equipment)              # 产线拥有设备

传感器 (Sensor)
    │
    └──[BELONGS_TO]──▶ 设备 (Equipment)       # 传感器归属设备

故障模式 (FaultMode)
    │
    └──[AFFECTS]──▶ 设备 (Equipment)          # 故障影响设备
```

### 2.3 典型问答场景

| 场景 | 用户问题示例 | 检索策略 |
|------|-------------|----------|
| **设备查询** | "2号生产线的设备有哪些？" | 实体级 + 产线级 |
| **状态查询** | "主电机的健康状态如何？" | 实体级检索 |
| **故障诊断** | "主电机振动异常的可能原因？" | 多跳推理（图检索）|
| **影响分析** | "如果振动传感器故障，会影响哪些设备？" | 下游遍历 |
| **维护查询** | "液压单元上次保养是什么时候？" | 实体级 + 关系检索 |
| **告警分析** | "温度告警涉及哪些设备？" | 关系路径检索 |
| **备件查询** | "主电机需要更换哪些备件？" | 实体级 + 关系检索 |
| **文档查询** | "输送带控制器的操作手册在哪？" | 向量检索 + 过滤 |
| **根因分析** | "3号生产线效率下降的原因？" | 多跳 + 聚类分析 |
| **配置咨询** | "新建产线需要哪些关键设备？" | 参考现有配置 + 推理 |

---

## 三、Graph RAG 改造方案

### 3.1 核心实体数据结构（改造后）

#### 3.1.1 图节点

```python
# 设备节点
Equipment {
    node_id: str,          # "M-102"
    name: str,             # "主电机"
    type: str,             # "动力设备"
    status: str,           # "Normal" | "Warning" | "Critical"
    health: int,           # 0-100
    location: str,         # "2号生产线"
    model_file: str,       # "motor_main.glb"
    metadata: dict         # {vendor, power_kw, ...}
}

# 传感器节点
Sensor {
    node_id: str,          # "S-05"
    name: str,            # "振动传感器"
    type: str,            # "振动传感器"
    sampling_hz: int,     # 5000
    status: str,
    equipment_id: str,     # 归属设备 "M-102"
}

# 生产线节点
ProductionLine {
    node_id: str,          # "PL-01"
    name: str,             # "1号生产线"
    location: str,          # "A车间"
    capacity: int,         # 产能
}

# 故障模式节点
FaultMode {
    node_id: str,          # "FM-001"
    name: str,             # "振动异常"
    symptoms: str,         # "振幅超标、频谱峰值偏移"
    root_causes: str,      # "轴承磨损、不平衡、基础松动"
    solutions: str,        # "更换轴承、动平衡、紧固基础"
}
```

#### 3.1.2 关系类型

| 关系类型 | 起点 | 终点 | 属性 |
|----------|------|------|------|
| `CONTAINS` | Equipment | Sensor | - |
| `LOCATED_AT` | Equipment | ProductionLine | - |
| `DEPENDS_ON` | Equipment | Equipment | upstream/downstream |
| `EXHIBITS` | Equipment | FaultMode | occurrence_time, severity |
| `CAUSES` | FaultMode | Alarm | occurrence_time |
| `REQUIRES` | Equipment | MaintenanceRecord | maintenance_type, interval |
| `USES` | Equipment | SparePart | quantity, unit |
| `AFFECTS` | FaultMode | Equipment | - |
| `BELONGS_TO` | Sensor | Equipment | - |
| `HAS` | ProductionLine | Equipment | - |

### 3.2 需要改造的文件清单

| 文件 | 改造内容 | 工作量 |
|------|---------|--------|
| `graph_data_preparation.py` | 改写 Cypher 查询，从设备数据构建文档 | 4-6h |
| `milvus_index_construction.py` | 调整 Schema 字段（设备类型、产线、状态等）| 1-2h |
| `graph_indexing.py` | 实体/关系 Key-Value 适配设备实体 | 2-3h |
| `hybrid_retrieval.py` | 关键词提取模板适配工业场景 | 2-3h |
| `graph_rag_retrieval.py` | 多跳查询类型适配设备故障分析 | 3-4h |
| `intelligent_query_router.py` | 查询路由关键词适配工业问答 | 1-2h |
| `generation_integration.py` | Prompt 模板改为工业知识问答 | 1-2h |
| `runtime.py` | 数据加载逻辑适配设备图谱 | 1h |
| `config.py` | 新增设备类型配置项 | 1h |
| `graph_rag_bridge.py` | 字段名适配（recipe_name → equipment_name）| 1h |

### 3.3 详细改造设计

#### 3.3.1 `graph_data_preparation.py` - 核心改造

**改造要点：**

1. **新增设备类型数据类**
```python
@dataclass
class EquipmentNode:
    node_id: str
    labels: List[str]
    name: str
    properties: Dict[str, Any]

@dataclass
class SensorNode:
    node_id: str
    labels: List[str]
    name: str
    properties: Dict[str, Any]
```

2. **改写 Neo4j 查询**
```python
# 加载设备节点
def load_equipment_data(self):
    query = """
    MATCH (e:Equipment)
    OPTIONAL MATCH (e)-[:LOCATED_AT]->(p:ProductionLine)
    OPTIONAL MATCH (e)-[:CONTAINS]->(s:Sensor)
    RETURN e.nodeId as nodeId, labels(e) as labels, e.name as name,
           properties(e) as properties,
           p.name as production_line,
           collect(DISTINCT {name: s.name, type: s.type}) as sensors
    """

# 加载故障模式
def load_fault_modes(self):
    query = """
    MATCH (f:FaultMode)
    MATCH (f)-[AFFECTS]->(e:Equipment)
    RETURN f.nodeId, f.name, f.symptoms, f.root_causes, f.solutions,
           collect(e.name) as affected_equipment
    """
```

3. **构建设备文档**
```python
def build_equipment_documents(self) -> List[Document]:
    content_parts = [f"# {equipment_name}"]

    # 基本信息
    content_parts.append(f"\n## 基本信息")
    content_parts.append(f"设备类型: {equipment_type}")
    content_parts.append(f"位置: {location}")
    content_parts.append(f"状态: {status} (健康度: {health}%)")

    # 传感器列表
    if sensors:
        content_parts.append(f"\n## 传感器列表")
        for sensor in sensors:
            content_parts.append(f"- {sensor['name']} ({sensor['type']})")

    # 故障模式
    if fault_modes:
        content_parts.append(f"\n## 常见故障模式")
        for fault in fault_modes:
            content_parts.append(f"- {fault['name']}: {fault['symptoms']}")

    # 维护记录
    if maintenance_records:
        content_parts.append(f"\n## 维护记录")
        for record in maintenance_records:
            content_parts.append(f"- {record['date']}: {record['type']} - {record['description']}")

    # 备件清单
    if spare_parts:
        content_parts.append(f"\n## 备件清单")
        for part in spare_parts:
            content_parts.append(f"- {part['name']}: {part['quantity']}{part['unit']}")

    return Document(page_content="\n".join(content_parts), metadata={...})
```

#### 3.3.2 `milvus_index_construction.py` - Schema 改造

```python
fields = [
    # 基础字段
    FieldSchema(name="id", dtype=DataType.VARCHAR, max_length=150, is_primary=True),
    FieldSchema(name="vector", dtype=DataType.FLOAT_VECTOR, dim=self.dimension),
    FieldSchema(name="text", dtype=DataType.VARCHAR, max_length=15000),

    # 设备相关字段（改造后）
    FieldSchema(name="node_id", dtype=DataType.VARCHAR, max_length=100),
    FieldSchema(name="equipment_name", dtype=DataType.VARCHAR, max_length=300),  # 原 recipe_name
    FieldSchema(name="equipment_type", dtype=DataType.VARCHAR, max_length=100),
    FieldSchema(name="production_line", dtype=DataType.VARCHAR, max_length=200),
    FieldSchema(name="location", dtype=DataType.VARCHAR, max_length=200),
    FieldSchema(name="status", dtype=DataType.VARCHAR, max_length=50),
    FieldSchema(name="health", dtype=DataType.INT64),  # 健康度 0-100
    FieldSchema(name="sensor_types", dtype=DataType.VARCHAR, max_length=500),
    FieldSchema(name="fault_modes", dtype=DataType.VARCHAR, max_length=1000),
    FieldSchema(name="category", dtype=DataType.VARCHAR, max_length=100),  # 保留兼容
    FieldSchema(name="doc_type", dtype=DataType.VARCHAR, max_length=50),  # equipment/fault/maintenance
]
```

#### 3.3.3 `graph_rag_retrieval.py` - 查询类型改造

```python
class QueryType(Enum):
    # 保留原有
    ENTITY_RELATION = "entity_relation"
    MULTI_HOP = "multi_hop"
    SUBGRAPH = "subgraph"
    PATH_FINDING = "path_finding"
    CLUSTERING = "clustering"

    # 新增工业场景
    FAULT_DIAGNOSIS = "fault_diagnosis"        # 故障诊断
    IMPACT_ANALYSIS = "impact_analysis"        # 影响分析（上游/下游）
    MAINTENANCE_QUERY = "maintenance_query"    # 维护查询
    ALARM_CAUSE = "alarm_cause_analysis"       # 告警根因分析
    SPARE_PART_QUERY = "spare_part_query"      # 备件查询
    DOCUMENT_SEARCH = "document_search"        # 文档检索
```

#### 3.3.4 `intelligent_query_router.py` - 路由关键词改造

```python
def _rule_based_analysis(self, query: str) -> QueryAnalysis:
    # 工业场景关键词
    complexity_keywords = [
        "为什么", "如何", "原因", "分析", "影响",
        "比较", "区别", "诊断", "排查", "解决"
    ]
    relation_keywords = [
        "依赖", "连接", "关联", "上游", "下游",
        "影响", "传导", "路径", "关系", "联动"
    ]
    fault_keywords = ["故障", "异常", "报警", "告警", "损坏", "失效"]
    maintenance_keywords = ["保养", "维护", "维修", "检修", "点检", "更换"]

    # 故障诊断类 - 优先图检索
    if any(kw in query for kw in fault_keywords):
        return QueryAnalysis(
            query_complexity=0.8,
            relationship_intensity=0.7,
            reasoning_required=True,
            entity_count=len(query.split()),
            recommended_strategy=SearchStrategy.GRAPH_RAG,
            confidence=0.8,
            reasoning="检测到故障相关关键词，优先使用图检索进行根因分析"
        )

    # 影响分析类 - 图检索
    if any(kw in query for kw in ["影响", "下游", "上游", "传导"]):
        return QueryAnalysis(
            query_complexity=0.7,
            relationship_intensity=0.9,
            reasoning_required=True,
            entity_count=1,
            recommended_strategy=SearchStrategy.GRAPH_RAG,
            confidence=0.85,
            reasoning="影响分析需要多跳遍历，优先图检索"
        )

    # 维护查询类 - 传统检索
    if any(kw in query for kw in maintenance_keywords):
        return QueryAnalysis(
            query_complexity=0.3,
            relationship_intensity=0.3,
            reasoning_required=False,
            entity_count=1,
            recommended_strategy=SearchStrategy.HYBRID_TRADITIONAL,
            confidence=0.75,
            reasoning="维护查询偏事实检索，优先传统混合检索"
        )

    # 默认组合策略
    return QueryAnalysis(
        query_complexity=0.5,
        relationship_intensity=0.5,
        reasoning_required=True,
        entity_count=len(query.split()),
        recommended_strategy=SearchStrategy.COMBINED,
        confidence=0.6,
        reasoning="默认使用组合检索策略"
    )
```

#### 3.3.5 `generation_integration.py` - Prompt 改造

```python
SYSTEM_PROMPT_TEMPLATE = """你是一个工业设备知识图谱问答助手，专门回答关于制造业设备和数字孪生系统的问题。

## 你的能力
1. **设备信息查询**：位置、状态、运行参数、健康度
2. **故障诊断**：分析异常原因、给出排查建议
3. **影响分析**：分析设备故障对上下游的影响范围
4. **维护咨询**：维护历史、保养计划、备件更换
5. **告警分析**：告警根因、处置建议
6. **设备文档**：操作手册、维护指南检索

## 回答原则
1. 优先基于知识图谱检索结果回答
2. 如果检索结果不足，明确说明不确定性，不要编造
3. 对于故障诊断，给出可能的原因和排查步骤
4. 对于影响分析，列出受影响的设备清单
5. 结合设备关系图谱，给出系统性的分析

## 输出格式
- 关键信息用 **加粗**
- 列表清晰分点
- 涉及设备关系时，用箭头表示：上游设备 → 当前设备 → 下游设备
"""

# 示例问题参考
EXAMPLE_QUESTIONS = [
    "主电机的健康状态如何？",
    "2号生产线的设备有哪些？",
    "振动传感器故障会影响哪些设备？",
    "液压单元异常的可能原因有哪些？",
    "主电机上次保养是什么时候？",
    "如果网关故障，哪些设备会受影响？"
]
```

---

## 四、Agent 系统集成方案

### 4.1 当前架构问题

```
AgentService._build_prompt_with_rag()  ← 当前返回 enabled=False
                                         RAG 结果未拼入 Prompt
```

### 4.2 集成方案对比

| 方案 | 集成方式 | 改动量 | 灵活性 | 适用场景 |
|------|---------|--------|--------|----------|
| **方案A** | RAG 结果拼入 System Prompt | 小 | 低 | 简单查询、FAQ |
| **方案B** | 新增 GraphRAG Tool | 中 | 高 | 复杂推理、Tool 协作 |
| **方案C** | Skill 封装 + Tool 组合 | 大 | 最高 | 高级故障诊断 |

### 4.3 方案A：RAG 增强 Prompt（快速集成）

#### 业务流程

```
用户提问: "主电机的健康状态如何？"
    │
    ▼
AgentService.run()
    │
    ├── _build_prompt_with_rag()  ← 启用
    │   │
    │   ▼
    │   GraphRAGBridge.build_context("主电机的健康状态如何？")
    │   │
    │   ▼
    │   GraphRAGRuntime.query()
    │   │
    │   ▼
    │   智能查询路由 → 图检索 + 向量检索
    │   │
    │   ▼
    │   返回检索结果:
    │   "主电机(M-102): 健康度68%, 状态Warning,
    │    位于2号生产线, 上游传感器:振动传感器,
    │    相关告警: 温度偏高..."
    │
    ▼
effective_prompt = """
You are a helpful ReAct assistant.

以下是从设备知识图谱检索的信息：
1. [M-102] (entity_level) 主电机: 健康度68%, 状态Warning
2. [S-05] (vector_search) 振动传感器: 位于1号生产线

如果检索证据不足，请明确说明。
"""
    │
    ▼
ReactAgent.run(effective_prompt)
    │
    ▼
最终回答
```

#### 实施代码

```python
# agent_service.py 改造

def _build_prompt_with_rag(
    self,
    user_input: str,
    system_prompt: str | None,
    enable_rag: bool,
    llm: MyAgentsLLM,
) -> tuple[str, dict[str, Any]]:
    base_prompt = system_prompt or DEFAULT_SYSTEM_PROMPT

    if not enable_rag:
        return base_prompt, {"enabled": False, "reason": "disabled_by_user"}

    try:
        from rag.graph_rag_bridge import GraphRAGBridge
        bridge = GraphRAGBridge()

        if not bridge.is_ready:
            return base_prompt, {"enabled": False, "reason": "graph_rag_not_ready"}

        rag_result = bridge.build_context(user_input, llm_client=llm)

        if not rag_result.metadata.get("enabled"):
            return base_prompt, {"enabled": False, "reason": "retrieval_disabled"}

        # 将 RAG 结果拼入 System Prompt
        enhanced_prompt = f"""{base_prompt}

【知识库检索结果】
{rag_result.context_text}

请结合上述检索结果回答用户问题。如果检索结果不足以回答，请明确说明。
"""
        return enhanced_prompt, rag_result.metadata

    except Exception as exc:
        logger.warning(f"RAG 增强失败: {exc}")
        return base_prompt, {"enabled": False, "reason": f"error: {exc}"}
```

### 4.4 方案B：GraphRAG Tool（推荐）

#### Tool 设计

```python
# tools/builtin/graph_rag_tool.py

from tools.builtin.base_tool import Tool

class GraphRAGTool(Tool):
    name = "query_equipment_knowledge"
    description = """查询设备知识图谱，用于：
    - 设备基本信息（位置、状态、参数）
    - 故障诊断和原因分析
    - 设备关系查询（上下游、依赖）
    - 维护记录查询
    - 备件清单查询
    - 告警影响分析

    输入: 查询问题的文本描述
    """

    parameters = {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "查询问题，如'主电机振动异常的原因'"
            },
            "query_type": {
                "type": "string",
                "enum": ["auto", "fault_diagnosis", "impact_analysis",
                         "maintenance", "spare_parts", "relationship"],
                "description": "查询类型，auto 自动识别",
                "default": "auto"
            },
            "top_k": {
                "type": "integer",
                "description": "返回结果数量",
                "default": 5
            }
        },
        "required": ["query"]
    }

    async def execute(
        self,
        query: str,
        query_type: str = "auto",
        top_k: int = 5
    ) -> str:
        from rag.graph_rag_bridge import GraphRAGBridge

        bridge = GraphRAGBridge()
        result = bridge.build_context(query, llm_client=None)

        if not result.metadata.get("enabled"):
            return f"知识图谱查询失败: {result.metadata.get('reason', 'unknown')}"

        sources = result.metadata.get("sources", [])
        lines = [f"检索到 {len(sources)} 条相关信息:"]

        for idx, src in enumerate(sources[:top_k], 1):
            equipment_name = src.get("equipment_name", src.get("recipe_name", "未知"))
            retrieval_level = src.get("retrieval_level", "unknown")
            score = src.get("score", 0)
            lines.append(f"{idx}. [{equipment_name}] ({retrieval_level}) 相关度:{score:.2f}")

        lines.append(f"\n{result.context_text}")
        return "\n".join(lines)
```

#### 注册到 ContextBuilder

```python
# react_agent.py

def _register_default_tools(self):
    self.context.add_tools(ReadFileTool())
    self.context.add_tools(WriteFileTool())
    self.context.add_tools(SearchTool())
    self.context.add_tools(GraphRAGTool())  # 新增
    self.context.add_tools(ListSkillsTool(loader=self.skill_loader))
    self.context.add_tools(GetSkillTool(loader=self.skill_loader))
    self.context.add_tools(ShellExecTool())
```

#### ReAct 业务流程

```
用户: "如果振动传感器S-05故障，会影响哪些设备？"

Agent 思考链:
1. LLM 识别需要查询设备上下游关系
2. Action: query_equipment_knowledge
   arguments: {"query": "振动传感器S-05的上下游设备关系",
               "query_type": "impact_analysis"}
3. Tool 执行返回: "S-05 上游影响: 主电机M-102"
4. LLM 综合信息生成回答
```

### 4.5 方案C：Skill 封装（高级场景）

```
skills/
└── equipment_diagnostic/
    └── SKILL.md
```

```markdown
# equipment_diagnostic Skill

## 触发条件
- "设备.*异常|故障|报警"
- ".*会不会影响|影响范围"
- ".*怎么修|维护|保养"
- ".*原因|为什么"

## 能力
1. 故障诊断
2. 影响分析
3. 维护查询
4. 备件推荐

## 调用流程
1. GraphRAGTool 查询故障信息
2. GraphRAGTool 查询维护历史
3. ReadFileTool 读取维护手册
4. 综合生成回答

## 示例
用户: "主电机振动异常怎么处理？"
-> 查询故障模式 -> 查询维护记录 -> 读取手册 -> 回答
```

---

## 五、典型业务场景完整流程

### 场景1：设备故障诊断

```
用户: "2号生产线的液压单元健康度下降，可能原因有哪些？"

┌─────────────────────────────────────────────────────────────┐
│ Agent (React)                                               │
├─────────────────────────────────────────────────────────────┤
│ Thought: 需要分析液压单元的故障历史、传感器数据和上下游关系   │
│                                                             │
│ Action 1: query_equipment_knowledge                         │
│   query: "液压单元 H-22 故障原因分析"                       │
│   query_type: fault_diagnosis                              │
│                                                             │
│ Tool 返回:                                                   │
│   - 故障模式: 压力不足、液压油温升                          │
│   - 根因: 液压油污染、密封件老化                           │
│   - 关联设备: 主电机M-102 (下游)                           │
├─────────────────────────────────────────────────────────────┤
│ Thought: 已获取故障模式，现在查询维护记录确认历史             │
│                                                             │
│ Action 2: query_equipment_knowledge                          │
│   query: "液压单元 H-22 维护记录"                           │
│   query_type: maintenance_query                             │
│                                                             │
│ Tool 返回:                                                   │
│   - 上次保养: 2024-03-15 (30天前)                          │
│   - 保养内容: 更换液压油                                   │
├─────────────────────────────────────────────────────────────┤
│ Final Response:                                             │
│   "液压单元H-22健康度下降的可能原因：                        │
│    1. 液压油污染或油量不足（压力传感器示数波动）            │
│    2. 密封件老化导致内泄（运行3000小时后常见）             │
│    3. 液压油温过高（冷却系统效率下降）                     │
│                                                             │
│  建议措施：                                                  │
│    - 检查液压油液位和质量                                   │
│    - 查看是否有渗漏痕迹                                     │
│    - 历史维护记录显示上次换油30天前，建议检查油品          │
│                                                             │
│  相关设备：主电机M-102位于其下游，需关注联动影响"           │
└─────────────────────────────────────────────────────────────┘
```

### 场景2：设备影响分析

```
用户: "工业网关G-04故障会影响哪些设备？"

┌─────────────────────────────────────────────────────────────┐
│ Agent (React)                                               │
├─────────────────────────────────────────────────────────────┤
│ Thought: 需要查询G-04的上下游依赖关系                       │
│                                                             │
│ Action: query_equipment_knowledge                           │
│   query: "工业网关 G-04 的下游设备有哪些？"                │
│   query_type: impact_analysis                               │
│                                                             │
│ Tool 返回:                                                   │
│   - 直接下游: 输送带控制器 C-201                            │
│   - 间接下游: 主电机 M-102 (通过C-201依赖)                  │
│   - 影响范围: 2号生产线部分设备                             │
├─────────────────────────────────────────────────────────────┤
│ Final Response:                                             │
│   "工业网关G-04故障影响范围：                                │
│                                                             │
│   直接影响（上游依赖）：                                     │
│   → 输送带控制器 C-201 (直接下游)                          │
│                                                             │
│   间接影响：                                                 │
│   → 主电机 M-102 (依赖C-201，间接下游)                     │
│                                                             │
│   建议：                                                     │
│   1. 立即检查G-04的网络连接和供电                          │
│   2. 确认C-201是否仍可本地运行                              │
│   3. 准备切换到备用网络通道（如有）                         │
│   4. 通知维护团队准备备件                                   │
└─────────────────────────────────────────────────────────────┘
```

### 场景3：新建产线设备配置咨询

```
用户: "新建一条汽车零部件组装线，需要哪些关键设备？"

┌─────────────────────────────────────────────────────────────┐
│ Agent (React)                                               │
├─────────────────────────────────────────────────────────────┤
│ Thought: 这是规划类问题，需要参考现有产线配置                │
│                                                             │
│ Action 1: query_equipment_knowledge                         │
│   query: "现有产线的关键设备配置"                           │
│   query_type: entity_relation                               │
│                                                             │
│ Tool 返回:                                                   │
│   - 1号生产线: 数控机床、机器人、输送带、传感器系统         │
│   - 2号生产线: 注塑机、机械臂、检测设备                     │
│   - 设备关系: 加工→装配→检测→包装                         │
├─────────────────────────────────────────────────────────────┤
│ Thought: 用户需要更具体的设备选型建议                       │
│                                                             │
│ Action 2: SearchTool (搜索行业标准)                          │
│   query: "汽车零部件组装线设备配置国标                     │
│                                                             │
│ Final Response:                                             │
│   "参考现有产线配置，建议汽车零部件组装线包含：             │
│                                                             │
│   核心设备：                                                 │
│   - 加工设备: 数控机床/加工中心                             │
│   - 搬运设备: 工业机器人/机械臂                             │
│   - 传输设备: 输送带/滚筒线                                 │
│   - 传感设备: 视觉传感器/位置传感器                         │
│   - 控制设备: PLC控制器/工业网关                           │
│                                                             │
│   关键关系规划：                                             │
│   原料入库 → 数控加工 → 质量检测 → 机器人装配 → 成品入库   │
│                                                             │
│   建议先定义工艺流程，再根据产能需求选型设备规格"          │
└─────────────────────────────────────────────────────────────┘
```

---

## 六、实施计划

### 6.1 分阶段实施

| 阶段 | 任务 | 工作量 | 交付物 |
|------|------|--------|--------|
| **Phase 1** | 改造 `graph_data_preparation.py`，适配设备数据模型 | 4-6h | 设备文档构建器 |
| **Phase 2** | 改造 `milvus_index_construction.py` Schema | 1-2h | 设备向量索引 |
| **Phase 3** | 改造检索模块（hybrid + graph_rag_retrieval）| 4-6h | 工业检索能力 |
| **Phase 4** | 改造 `intelligent_query_router` 工业路由 | 2-3h | 智能查询路由 |
| **Phase 5** | 改造 `generation_integration` Prompt | 1-2h | 工业问答 Prompt |
| **Phase 6** | 集成测试与调优 | 4-8h | 端到端验证 |
| **Phase 7** | Agent 集成（方案A：启用 `_build_prompt_with_rag`）| 1-2h | RAG 增强 Prompt |
| **Phase 8** | Agent 集成（方案B：新增 GraphRAG Tool）| 2-3h | GraphRAG Tool |

### 6.2 优先级建议

| 优先级 | 方案 | 实施内容 | 业务价值 |
|--------|------|---------|---------|
| **P0** | Phase 1-6 | 完成 Graph RAG 核心改造 | 支持工业设备知识管理 |
| **P1** | Phase 7 | 启用 `_build_prompt_with_rag()` | 快速集成，覆盖80%查询 |
| **P2** | Phase 8 | 新增 `GraphRAGTool` | 复杂推理、Tool 协作能力 |

### 6.3 数据准备

在实施改造前，需要准备以下数据：

1. **Neo4j 数据导入**
   - 设备节点（Equipment）
   - 传感器节点（Sensor）
   - 生产线节点（ProductionLine）
   - 故障模式节点（FaultMode）
   - 关系边（DEPENDS_ON、CONTAINS 等）

2. **参考 PostgreSQL 数据**
   - 现有 `digital_assets` 表可作为数据源
   - `asset_relations` 表提供设备关系
   - 需要编写数据同步脚本到 Neo4j

3. **Milvus 索引构建**
   - 向量化模型：`BAAI/bge-small-zh-v1.5`（已有配置）
   - 维度：512（已有配置）

---

## 七、配置说明

### 7.1 环境变量（backend/.env）

```bash
# Neo4j
NEO4J_URI=bolt://127.0.0.1:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=please_change_me
NEO4J_DATABASE=neo4j

# Milvus
MILVUS_HOST=127.0.0.1
MILVUS_PORT=19530
MILVUS_COLLECTION_NAME=equipment_knowledge  # 改名区分菜谱
MILVUS_DIMENSION=512

# 模型
EMBEDDING_MODEL=BAAI/bge-small-zh-v1.5

# 检索
TOP_K=6

# 生成
TEMPERATURE=0.7
MAX_TOKENS=1024

# 子任务 (LLM 调用)
KEYWORD_EXTRACTION_TEMPERATURE=0.2
KEYWORD_EXTRACTION_MAX_TOKENS=512
QUERY_ANALYSIS_TEMPERATURE=0.2
QUERY_ANALYSIS_MAX_TOKENS=512
GRAPH_QUERY_TEMPERATURE=0.2
GRAPH_QUERY_MAX_TOKENS=512

# 文档处理
CHUNK_SIZE=500
CHUNK_OVERLAP=50
MAX_GRAPH_DEPTH=3
```

### 7.2 新增配置项

```python
# config.py 新增

@dataclass
class GraphRAGConfig:
    # ... 现有配置 ...

    # 新增工业场景配置
    equipment_types: List[str] = field(default_factory=lambda: [
        "动力设备", "控制单元", "传感器", "通信设备",
        "液压设备", "气动设备", "加工设备", "搬运设备"
    ])
    default_production_line: str = "1号生产线"
    fault_severity_levels: List[str] = field(default_factory=lambda: [
        "Normal", "Warning", "Critical"
    ])
    maintenance_types: List[str] = field(default_factory=lambda: [
        "保养", "维修", "点检", "大修"
    ])
```

---

## 八、文件改动汇总

```
backend/
├── graph_rag/
│   ├── config.py                       # 新增工业配置项
│   ├── runtime.py                      # 数据加载逻辑适配
│   └── rag_modules/
│       ├── graph_data_preparation.py   # 改造：设备数据模型
│       ├── milvus_index_construction.py # 改造：设备 Schema
│       ├── graph_indexing.py          # 改造：实体/关系 Key-Value
│       ├── hybrid_retrieval.py         # 改造：工业关键词提取
│       ├── graph_rag_retrieval.py      # 改造：工业查询类型
│       ├── intelligent_query_router.py # 改造：工业路由关键词
│       └── generation_integration.py  # 改造：工业 Prompt
│
├── rag/
│   └── graph_rag_bridge.py            # 字段名适配
│
├── tools/builtin/
│   └── graph_rag_tool.py              # 新增：GraphRAG Tool
│
├── skills/
│   └── equipment_diagnostic/          # 新增：设备诊断 Skill
│       └── SKILL.md
│
└── api/
    └── agent_service.py               # 改造：启用 RAG 集成
```

---

## 九、风险与注意事项

| 风险 | 应对措施 |
|------|---------|
| Neo4j 数据初始化慢 | 分批导入，建立增量同步机制 |
| 向量化模型选择 | 优先使用已有的 `bge-small-zh-v1.5` |
| 查询延迟高 | 优化 Cypher 查询，添加索引 |
| 多跳遍历深度过大 | 限制 `max_graph_depth` |
| 数据不一致 | PostgreSQL → Neo4j 定期同步脚本 |

---

## 十、后续扩展方向

1. **实时数据集成**：对接 SCADA/PLC 系统，实时更新设备状态
2. **时序故障预测**：结合历史数据预测设备故障
3. **多工厂协同**：支持跨工厂设备知识图谱
4. **自然语言生成报表**：自动生成设备健康报告
5. **语音交互**：对接语音识别，支持现场语音查询

---

*文档版本: v1.0*
*最后更新: 2026-04-08*
