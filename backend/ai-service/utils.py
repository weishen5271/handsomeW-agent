from pathlib import Path


def find_project_root(start_dir: Path, max_levels: int = 5) -> Path:
    """向上查找项目根目录"""
    current_dir = start_dir

    for level in range(max_levels):
        # 检查是否有项目根目录的标识文件
        if (current_dir / "README.md").exists() or \
                (current_dir / "pyproject.toml").exists() or \
                (current_dir / "requirements.txt").exists() or \
                (current_dir / ".git").exists():
            return current_dir
        # 向上移动一级目录
        if current_dir.parent == current_dir:  # 到达根目录
            break
        current_dir = current_dir.parent
    # 如果没找到，返回当前工作目录
    return start_dir