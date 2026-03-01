from tavily import TavilyClient
from .base_tool import Tool
from typing import Dict
import os
class SearchTool(Tool):

    def __init__(self):
        self.api_key = os.getenv("TAVILY_API_KEY")
        self.description = "一个基于Tavily的实战网页搜索引擎工具。"
        self.parameters = {
            "type": "object",
            "properties": {
                "input": {
                    "type": "string",
                    "description": "要搜索的关键词或者短语",
                }
            },
            "required": ["input"]
        }
        self.name = "search tool"

    def execute(self,input:Dict,limit:int=10) -> str:
        """
            一个基于Tavily的实战网页搜索引擎工具。
            它会智能地解析搜索结果，优先返回直接答案或知识图谱信息。
        """
        keyword = input.get("keyword",None)
        if not keyword:
            return "请输入搜索关键词"
        print(f"🔍 正在执行 tavily 搜索,搜索关键词: {keyword}")
        # 1. 从环境变量获取API密钥并实例化客户端
        client = TavilyClient(api_key=self.api_key)

        # 2. 执行搜索
        response = client.search(keyword)
        # 3. 处理并打印结果
        print(f"查询: {response['query']}")
        print(f"响应时间: {response['response_time']}秒\n")
        # 将返回的结果转换为字符串
        results_str = "\n".join([f"{i+1}. {result['title']} - {result['url']}" for i, result in enumerate(response['results'])])
        return results_str


if __name__ == '__main__':
    from dotenv import load_dotenv
    load_dotenv()
    search = SearchTool()
    print(search.execute({"keyword":"今天北京的天气怎么样"}))
