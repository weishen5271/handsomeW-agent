import json
import os
import re
import shutil
from pathlib import Path

BUILTIN_SKILLS_DIR = Path(__file__).parent.parent / "skills"


class SkillsLocader:
    def __init__(self, workspace: Path, builtin_skills_dir: Path = None):
        self.workspace = workspace
        self.workspace_skills = workspace / "skills"
        self.builtin_skills = builtin_skills_dir or BUILTIN_SKILLS_DIR

    def list_skills(self, filter_unavailable: bool = True) -> list[dict[str, str]]:
        skills = []
        if self.workspace_skills.exists():
            for skill_dir in self.workspace_skills.iterdir():
                if not skill_dir.is_dir():
                    continue
                skill_file = skill_dir / "SKILL.md"
                if skill_file.exists():
                    skills.append(
                        {"name": skill_dir.name, "path": str(skill_file), "source": "workspace"}
                    )

        if self.builtin_skills and self.builtin_skills.exists():
            for skill_dir in self.builtin_skills.iterdir():
                if not skill_dir.is_dir():
                    continue
                skill_file = skill_dir / "SKILL.md"
                if skill_file.exists() and not any(s["name"] == skill_dir.name for s in skills):
                    skills.append(
                        {"name": skill_dir.name, "path": str(skill_file), "source": "builtin"}
                    )

        if filter_unavailable:
            return [s for s in skills if self._check_requirements(self._get_skill_meta(s["name"]))]
        return skills

    def load_skill(self, skill_name: str):
        workspace_skill_file = self.workspace_skills / skill_name / "SKILL.md"
        if workspace_skill_file.exists():
            return workspace_skill_file.read_text(encoding="utf-8")
        builtin_skill_file = self.builtin_skills / skill_name / "SKILL.md"
        if builtin_skill_file.exists():
            return builtin_skill_file.read_text(encoding="utf-8")
        return None

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
    skill_loader = SkillsLocader(Path("."))
    skills = skill_loader.load_skill_summary()
    print(skills)
