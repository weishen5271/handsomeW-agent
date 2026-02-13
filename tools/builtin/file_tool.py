
from .base_tool import Tool
from typing import List,Dict
from pathlib import Path


def _resolve_path(path: str, allowed_dir: Path | None = None) -> Path:
    """Resolve path and optionally enforce directory restriction."""
    resolved = Path(path).expanduser().resolve()
    if allowed_dir and not str(resolved).startswith(str(allowed_dir.resolve())):
        raise PermissionError(f"Path {path} is outside allowed directory {allowed_dir}")
    return resolved


class ReadFileTool(Tool):
      def __init__(self):
          self.name = "read_file"
          self.description = "Read the contents of a file at the given path."
      def execute(self,input:Dict)->str:
          input_path = input["path"]
          file_path = _resolve_path(input_path)
          if not file_path.exists():
              raise FileNotFoundError(f"File not found: {file_path}")
          if not file_path.is_file():
              raise FileExistsError(f"Path {file_path} is not a file.")
          content = file_path.read_text(encoding="utf-8")
          return content


class WriteFileTool(Tool):
    def __init__(self):
          self.name = "write_file"
          self.description = "Write the contents of a file at the given path."
    def execute(self,input:Dict)->str:
        pass

