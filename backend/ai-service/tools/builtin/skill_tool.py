import json
from typing import Any, Dict

from .base_tool import Tool
from core.skill import SkillsLocader


class ListSkillsTool(Tool):
    def __init__(self, loader: SkillsLocader | None = None):
        self.name = "list_skills"
        self.description = "List all available skills and their SKILL.md locations."
        self.parameters = {
            "type": "object",
            "properties": {},
            "required": [],
        }
        self._loader = loader or SkillsLocader()

    def execute(self, input: Dict[str, Any]) -> str:
        _ = input
        skills = self._loader.list_skills(filter_unavailable=False)
        return json.dumps(skills, ensure_ascii=False)


class GetSkillTool(Tool):
    def __init__(self, loader: SkillsLocader | None = None):
        self.name = "get_skill"
        self.description = "Load SKILL.md content by skill name."
        self.parameters = {
            "type": "object",
            "properties": {
                "skill_name": {
                    "type": "string",
                    "description": "Skill directory name, e.g. weather",
                }
            },
            "required": ["skill_name"],
        }
        self._loader = loader or SkillsLocader()

    def execute(self, input: Dict[str, Any]) -> str:
        skill_name = input["skill_name"]
        content = self._loader.load_skill(skill_name)
        if not content:
            raise FileNotFoundError(f"Skill not found: {skill_name}")
        return content
