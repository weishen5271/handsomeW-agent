# 数字孪生知识图谱示例数据

本目录提供一套最小可运行的工业设备/数字孪生图谱示例数据。

## 文件说明

- `production_lines.csv`: 产线节点
- `equipments.csv`: 设备节点
- `sensors.csv`: 传感器节点
- `fault_modes.csv`: 故障模式节点
- `spare_parts.csv`: 备件节点
- `alarms.csv`: 告警节点
- `maintenance_records.csv`: 维护记录节点
- `documents.csv`: 文档节点
- `rel_*.csv`: 各类关系

## 典型实体

- `PL-02`: 2号生产线
- `M-102`: 主电机
- `C-201`: 输送带控制器
- `HU-330`: 液压单元
- `S-05`: 振动传感器
- `FM-001`: 振动异常

## 导入方式

使用项目内脚本：

```bash
cd /Users/shenwei/PycharmProjects/handsomeW-agent
python backend/scripts/import_digital_twin_graph.py --data-dir data/graph_import
```

脚本默认读取 `backend/.env` 中的 `NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD / NEO4J_DATABASE`。

## 导入后建议验证

```cypher
MATCH (e:Equipment) RETURN count(e);
MATCH (s:Sensor) RETURN count(s);
MATCH (p:ProductionLine) RETURN count(p);
MATCH (:Equipment)-[:LOCATED_AT]->(:ProductionLine) RETURN count(*);
MATCH (:Equipment)-[:CONTAINS]->(:Sensor) RETURN count(*);
MATCH (:Equipment)-[:EXHIBITS]->(:FaultMode) RETURN count(*);
```
