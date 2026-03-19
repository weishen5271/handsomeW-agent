import re
import shlex
import subprocess
from pathlib import Path
from typing import Any, Dict

from .base_tool import Tool
from utils import find_project_root


class ShellExecTool(Tool):
    def __init__(self):
        self.name = "exec_shell"
        self.description = (
            "Execute a shell command in workspace with safety restrictions "
            "(allowlist, timeout, and risky-pattern blocking)."
        )
        self.parameters = {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "Shell command to execute.",
                },
                "timeout_sec": {
                    "type": "integer",
                    "description": "Execution timeout in seconds (default 20, max 60).",
                    "minimum": 1,
                    "maximum": 60,
                },
            },
            "required": ["command"],
        }
        self.workspace = find_project_root(Path.cwd()).resolve()
        self.allowed_bins = {
            "curl",
            "python",
            "python3",
            "node",
            "npm",
            "npx",
            "pip",
            "uv",
            "git",
        }
        self.block_patterns = [
            r"\brm\b",
            r"\bdel\b",
            r"\brmdir\b",
            r"\bshutdown\b",
            r"\breboot\b",
            r"\bmkfs\b",
            r":\(\)\{:\|:&\};:",
            r">\s*/dev/",
        ]

    def _extract_bin(self, command: str) -> str:
        try:
            parts = shlex.split(command, posix=False)
        except Exception:
            parts = command.strip().split()
        if not parts:
            raise ValueError("Empty command.")
        return Path(parts[0]).name.lower()

    def _assert_safe(self, command: str) -> None:
        lowered = command.lower()
        for pattern in self.block_patterns:
            if re.search(pattern, lowered):
                raise PermissionError(f"Command blocked by safety policy: {pattern}")
        bin_name = self._extract_bin(command)
        if bin_name not in self.allowed_bins:
            raise PermissionError(
                f"Command '{bin_name}' is not in allowlist: {sorted(self.allowed_bins)}"
            )

    def execute(self, input: Dict[str, Any]) -> str:
        command = (input.get("command") or "").strip()
        timeout_sec = int(input.get("timeout_sec", 20))
        timeout_sec = max(1, min(timeout_sec, 60))
        if not command:
            raise ValueError("Missing required field: command")

        self._assert_safe(command)

        completed = subprocess.run(
            command,
            shell=True,
            cwd=str(self.workspace),
            capture_output=True,
            text=True,
            timeout=timeout_sec,
        )
        stdout = (completed.stdout or "").strip()
        stderr = (completed.stderr or "").strip()
        return (
            f"exit_code: {completed.returncode}\n"
            f"cwd: {self.workspace}\n"
            f"stdout:\n{stdout}\n\n"
            f"stderr:\n{stderr}"
        )
