import os
from typing import Any, Dict

from .base_tool import Tool

try:
    from tavily import TavilyClient
except ImportError:  # Optional dependency
    TavilyClient = None


class SearchTool(Tool):
    def __init__(self):
        self.api_key = (os.getenv("TAVILY_API_KEY") or "").strip()
        self.name = "search_web"
        self.description = "使用 Tavily 执行网页搜索，返回标题和链接摘要。"
        self.parameters = {
            "type": "object",
            "properties": {
                "keyword": {
                    "type": "string",
                    "description": "要搜索的关键词或短语",
                }
            },
            "required": ["keyword"],
        }

    def execute(self, input: Dict[str, Any], limit: int = 10) -> str:
        keyword = str(input.get("keyword") or "").strip()
        if not keyword:
            raise ValueError("缺少 keyword 参数")
        if TavilyClient is None:
            raise RuntimeError("未安装 tavily 依赖，无法使用 search_web 工具")
        if not self.api_key:
            raise RuntimeError("缺少 TAVILY_API_KEY，无法使用 search_web 工具")

        client = TavilyClient(api_key=self.api_key)
        response = client.search(keyword, max_results=max(1, min(limit, 10)))
        results = response.get("results", []) if isinstance(response, dict) else []
        if not results:
            return "未找到相关搜索结果"

        lines = []
        for idx, result in enumerate(results, start=1):
            title = str(result.get("title") or "无标题").strip()
            url = str(result.get("url") or "").strip()
            content = str(result.get("content") or "").strip()
            snippet = f" - {content}" if content else ""
            lines.append(f"{idx}. {title} - {url}{snippet}")
        return "\n".join(lines)
