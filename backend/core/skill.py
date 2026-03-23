import json
import os
import re
import shutil
from typing import Iterable


class SkillsLocader:
    def __init__(
        self,
        skills: list[dict[str, str]] | None = None,
        allowed_skill_names: Iterable[str] | None = None,
    ):
        self.allowed_skill_names = set(allowed_skill_names) if allowed_skill_names is not None else None
        self._skills_by_name: dict[str, dict[str, str]] = {}
        for one in skills or []:
            name = str(one.get("name", "")).strip()
            if not name:
                continue
            self._skills_by_name[name] = {
                "name": name,
                "path": str(one.get("path", "")).strip(),
                "source": str(one.get("source", "")).strip(),
                "description": str(one.get("description", "")).strip(),
                "content": str(one.get("content", "")),
            }

    def list_skills(self, filter_unavailable: bool = True) -> list[dict[str, str]]:
        skills = [
            {"name": one["name"], "path": one["path"], "source": one["source"]}
            for one in self._skills_by_name.values()
        ]
        if self.allowed_skill_names is not None:
            skills = [s for s in skills if s["name"] in self.allowed_skill_names]

        if filter_unavailable:
            return [s for s in skills if self._check_requirements(self._get_skill_meta(s["name"]))]
        return skills

    def load_skill(self, skill_name: str):
        if self.allowed_skill_names is not None and skill_name not in self.allowed_skill_names:
            return None

        row = self._skills_by_name.get(skill_name)
        if row is None:
            return None
        content = row.get("content", "")
        return content or None

    def list_skills_detail(self, filter_unavailable: bool = False) -> list[dict[str, str | bool]]:
        details: list[dict[str, str | bool]] = []
        for skill in self.list_skills(filter_unavailable=False):
            skill_meta = self._get_skill_meta(skill["name"])
            available = self._check_requirements(skill_meta)
            requires = self._get_missing_requirements(skill_meta) if not available else ""
            one: dict[str, str | bool] = {
                "name": skill["name"],
                "path": skill["path"],
                "source": skill["source"],
                "description": self._get_skill_description(skill["name"]),
                "available": available,
                "missing_requirements": requires,
            }
            details.append(one)

        if filter_unavailable:
            return [item for item in details if bool(item["available"])]
        return details

    def load_skill_summary(self) -> str:
        all_skills = self.list_skills(filter_unavailable=False)
        if not all_skills:
            return ""

        def escape_xml(s: str) -> str:
            return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

        lines = ["<skills>"]
        for s in all_skills:
            name = escape_xml(s["name"])
            path = s["path"]
            desc = escape_xml(self._get_skill_description(s["name"]))
            skill_meta = self._get_skill_meta(s["name"])
            available = self._check_requirements(skill_meta)

            lines.append(f'  <skill available="{str(available).lower()}">')
            lines.append(f"    <name>{name}</name>")
            lines.append(f"    <description>{desc}</description>")
            lines.append(f"    <location>{path}</location>")

            if not available:
                missing = self._get_missing_requirements(skill_meta)
                if missing:
                    lines.append(f"    <requires>{escape_xml(missing)}</requires>")

            lines.append("  </skill>")
        lines.append("</skills>")
        return "\n".join(lines)

    def _get_skill_description(self, name: str) -> str:
        skill_meta = self._get_skill_meta(name)
        if skill_meta and "description" in skill_meta:
            return skill_meta["description"]
        return name

    def _get_skill_meta(self, name: str) -> dict | None:
        content = self.load_skill(name)
        if not content or not content.startswith("---"):
            return None

        meta_match = re.search(r"^---\n(.*?)\n---\n?", content, re.DOTALL)
        if not meta_match:
            return None

        meta_str = meta_match.group(1)
        meta_lines = meta_str.strip().split("\n")
        skill_meta: dict = {}
        for line in meta_lines:
            if ":" not in line:
                continue
            key, value = line.split(":", 1)
            key = key.strip()
            value = value.strip()
            if key == "metadata":
                try:
                    skill_meta[key] = json.loads(value)
                except Exception:
                    skill_meta[key] = value
            else:
                skill_meta[key] = value
        return skill_meta

    def _extract_requires(self, skill_meta: dict | None) -> dict:
        if not skill_meta:
            return {"bins": [], "env": []}

        top = skill_meta.get("requires")
        if isinstance(top, dict):
            bins = top.get("bins", []) or top.get("bin", [])
            env = top.get("env", [])
            return {"bins": bins, "env": env}

        metadata = skill_meta.get("metadata")
        if isinstance(metadata, dict):
            req = metadata.get("nanobot", {}).get("requires", {})
            bins = req.get("bins", []) or req.get("bin", [])
            env = req.get("env", [])
            return {"bins": bins, "env": env}

        return {"bins": [], "env": []}

    def _get_missing_requirements(self, skill_meta: dict) -> str:
        missing = []
        requires = self._extract_requires(skill_meta)
        for b in requires.get("bins", []):
            if not shutil.which(b):
                missing.append(f"CLI: {b}")
        for env in requires.get("env", []):
            if not os.environ.get(env):
                missing.append(f"ENV: {env}")
        return ", ".join(missing)

    def _check_requirements(self, skill_meta: dict) -> bool:
        requires = self._extract_requires(skill_meta)
        for b in requires.get("bins", []):
            if not shutil.which(b):
                return False
        for env in requires.get("env", []):
            if not os.environ.get(env):
                return False
        return True


if __name__ == "__main__":
    skill_loader = SkillsLocader()
    skills = skill_loader.load_skill_summary()
    print(skills)
