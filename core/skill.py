import os
from pathlib import Path
import re
import shutil

BUILTIN_SKILLS_DIR = Path(__file__).parent.parent / "skills"
class SkillsLocader:
    def __init__(self,workspace:Path,builtin_skills_dir:Path = None):
        self.workspace = workspace
        self.workspace_skills = workspace / "skills"
        self.builtin_skills = builtin_skills_dir or BUILTIN_SKILLS_DIR

    def list_skills(self, filter_unavailable: bool = True) -> list[dict[str, str]]:
        """
        List all available skills.

        Args:
            filter_unavailable: If True, filter out skills with unmet requirements.

        Returns:
            List of skill info dicts with 'name', 'path', 'source'.
        """
        skills = []
        # Workspace skills (highest priority)
        if self.workspace_skills.exists():
            for skill_dir in self.workspace_skills.iterdir():
                if skill_dir.is_dir():
                    skill_file = skill_dir / "SKILL.md"
                    if skill_file.exists():
                        skills.append({"name": skill_dir.name, "path": str(skill_file), "source": "workspace"})
        # Built-in skills
        if self.builtin_skills and self.builtin_skills.exists():
            for skill_dir in self.builtin_skills.iterdir():
                if skill_dir.is_dir():
                    skill_file = skill_dir / "SKILL.md"
                    if skill_file.exists() and not any(s["name"] == skill_dir.name for s in skills):
                        skills.append({"name": skill_dir.name, "path": str(skill_file), "source": "builtin"})

        # Filter by requirements
        if filter_unavailable:
            return [s for s in skills]
        return skills

    def load_skill(self, skill_name:str):
        """
         Load a skill by name.

         Args:
             name: Skill name (directory name).

         Returns:
             Skill content or None if not found.
         """
        workspace_skill_file = self.workspace / skill_name / "SKILL.md"
        if workspace_skill_file.exists():
            return workspace_skill_file.read_text(encoding="utf-8")
        builtin_skill_file = self.builtin_skills / skill_name / "SKILL.md"
        if builtin_skill_file.exists():
            return builtin_skill_file.read_text(encoding="utf-8")
        return None

    def load_skill_summary(self) -> str:
        all_skills = self.list_skills()
        if not all_skills:
            return ""
        # 将所有skill的summary拼接成xml

        def escape_xml(s: str) -> str:
            return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

        lines = ["<skills>"]
        for s in all_skills:
            name = escape_xml(s["name"])
            path = s["path"]
            desc = escape_xml(self._get_skill_description(s["name"]))
            skill_meta = self._get_skill_meta(s["name"])
            available = self._check_requirements(skill_meta)

            lines.append(f"  <skill available=\"{str(available).lower()}\">")
            lines.append(f"    <name>{name}</name>")
            lines.append(f"    <description>{desc}</description>")
            lines.append(f"    <location>{path}</location>")

            # Show missing requirements for unavailable skills
            if not available:
                missing = self._get_missing_requirements(skill_meta)
                if missing:
                    lines.append(f"    <requires>{escape_xml(missing)}</requires>")

            lines.append(f"  </skill>")
        lines.append("</skills>")

        return "\n".join(lines)
    def _get_skill_description(self, name: str) -> str:
        """
        Get skill description from SKILL.md.

        :param name: Skill name.
        :return: Skill description.
        """
        skill_meta = self._get_skill_meta(name)
        if skill_meta and "description" in skill_meta:
            return skill_meta["description"]
        return name


    def _get_skill_meta(self, name: str) -> dict | None:
        """
        Get skill metadata from SKILL.md.

        :param name: Skill name.
        :return: Skill metadata dict.
        """
        content = self.load_skill(name)
        if not content:
            return None
        if  content.startswith("---"):
            # 利用正则表达式进行解析
            meta_match = re.search(r"---\n(.*?)\n---", content, re.DOTALL)
            if meta_match:
                meta_str = meta_match.group(1)
                meta_lines = meta_str.strip().split("\n")
                skill_meta = {}
                for line in meta_lines:
                    if ":" in line:
                        key, value = line.split(":", 1)
                        skill_meta[key.strip()] = value.strip()
                return skill_meta
        return None

    def _get_missing_requirements(self, skill_meta: dict) -> str:
        """
        生成缺失依赖的详细描述，用于友好的错误提示
        """
        missing = []
        requires = skill_meta.get("requires", {})
        for b in requires.get("bins", []):
            if not shutil.which(b):
                missing.append(f"CLI: {b}")
        for env in requires.get("env", []):
            if not os.environ.get(env):
                missing.append(f"ENV: {env}")
        return ", ".join(missing)

    def _check_requirements(self, skill_meta: dict) -> bool:
        """
        Check if skill requirements are met.
         检查技能是否满足要求（二进制文件、环境变量）。
        :param skill_meta: Skill metadata dict.
        :return: True if requirements are met, False otherwise.
        """
        if skill_meta and "requires" in skill_meta:
            requires = skill_meta["requires"]
            for b in requires.get("bin",[]):
                if not shutil.which(b):
                    return False
            for env in requires.get("env",[]):
                if not os.environ.get(env):
                    return False
            return True
        return False


if __name__ == '__main__':
    skill_loader = SkillsLocader(Path("."))
    skills = skill_loader.load_skill_summary()
    print(skills)
