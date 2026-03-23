import json
import os
import re
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen

from fastapi import APIRouter, Depends, HTTPException, Query

from api.auth import get_current_user
from api.schemas import (
    SkillShopAddRequest,
    SkillShopListResponse,
    SkillShopItem,
    UserLLMConfigRequest,
    UserLLMConfigResponse,
    UserSkillConfigItem,
    UserSkillConfigUpdateRequest,
)
from api.user_store import (
    add_user_skill,
    delete_user_skill,
    get_user_llm_config,
    list_user_skills,
    upsert_user_llm_config,
    upsert_user_skills_enabled,
)

router = APIRouter(tags=["llm-config"])
SKILL_SHOP_TIMEOUT_SECONDS = 8
SKILL_SHOP_DEFAULT_LIMIT = 12
SKILL_SHOP_MAX_LIMIT = 50
SKILL_SHOP_USER_AGENT = "handsomeW-agent/0.1"
SKILL_SHOP_GITHUB_TOPIC = "codex-skill"


def _to_response(config: dict) -> UserLLMConfigResponse:
    return UserLLMConfigResponse(
        user_id=config["user_id"],
        provider=config["provider"],
        model=config["model"],
        base_url=config["base_url"],
        api_key_set=bool(config.get("api_key")),
        created_at=config["created_at"],
        updated_at=config["updated_at"],
    )


@router.get("/llm-config", response_model=UserLLMConfigResponse | None)
async def get_current_user_llm_config(current_user: dict = Depends(get_current_user)) -> UserLLMConfigResponse | None:
    config = get_user_llm_config(current_user["id"])
    if config is None:
        return None
    return _to_response(config)


@router.put("/llm-config", response_model=UserLLMConfigResponse)
async def update_current_user_llm_config(
    payload: UserLLMConfigRequest,
    current_user: dict = Depends(get_current_user),
) -> UserLLMConfigResponse:
    api_key = payload.api_key
    if isinstance(api_key, str):
        api_key = api_key.strip()
    config = upsert_user_llm_config(
        user_id=current_user["id"],
        provider=payload.provider.strip(),
        model=payload.model.strip(),
        base_url=payload.base_url.strip(),
        api_key=api_key,
    )
    return _to_response(config)


def _http_get_json(url: str) -> dict | list:
    req = Request(url, headers={"User-Agent": SKILL_SHOP_USER_AGENT, "Accept": "application/json"})
    with urlopen(req, timeout=SKILL_SHOP_TIMEOUT_SECONDS) as resp:
        raw = resp.read().decode("utf-8")
    return json.loads(raw)


def _http_get_text(url: str) -> str:
    req = Request(url, headers={"User-Agent": SKILL_SHOP_USER_AGENT, "Accept": "text/plain"})
    with urlopen(req, timeout=SKILL_SHOP_TIMEOUT_SECONDS) as resp:
        return resp.read().decode("utf-8")


def _sanitize_skill_name(name: str) -> str:
    safe = re.sub(r"[^a-zA-Z0-9_-]+", "-", name).strip("-").lower()
    return safe or "skill"


def _safe_str(value: object) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _pick_first_str(source: dict, keys: list[str]) -> str:
    for key in keys:
        val = source.get(key)
        txt = _safe_str(val)
        if txt:
            return txt
    return ""


def _parse_int(value: object) -> int:
    if isinstance(value, int):
        return max(0, value)
    if isinstance(value, float):
        return max(0, int(value))
    text = _safe_str(value).replace(",", "")
    if not text:
        return 0
    try:
        return max(0, int(float(text)))
    except Exception:
        return 0


def _parse_repo_owner_and_name(repo_url: str) -> tuple[str, str] | None:
    try:
        parsed = urlparse(repo_url)
    except Exception:
        return None
    if parsed.netloc not in {"github.com", "www.github.com"}:
        return None
    parts = [p for p in parsed.path.strip("/").split("/") if p]
    if len(parts) < 2:
        return None
    return parts[0], parts[1]


def _load_shop_from_index_url(index_url: str) -> list[dict]:
    payload = _http_get_json(index_url)
    data = payload.get("skills", []) if isinstance(payload, dict) else payload
    if not isinstance(data, list):
        return []
    items: list[dict] = []
    for one in data:
        if not isinstance(one, dict):
            continue
        external_id = str(one.get("external_id", "")).strip()
        name = str(one.get("name", "")).strip()
        repo_url = str(one.get("repo_url", "")).strip()
        skill_md_url = str(one.get("skill_md_url", "")).strip()
        if not external_id:
            if repo_url:
                external_id = f"repo:{repo_url}"
            elif skill_md_url:
                external_id = f"md:{skill_md_url}"
            elif name:
                external_id = f"name:{name}"
        if not name:
            continue
        items.append(
            {
                "external_id": external_id,
                "name": name,
                "source": "remote-index",
                "description": str(one.get("description", "")).strip(),
                "repo_url": repo_url,
                "skill_md_url": skill_md_url,
                "icon_url": "",
                "tag": "",
                "version": "",
                "downloads": 0,
                "stars": 0,
            }
        )
    return items


def _map_github_repo_to_skill_item(repo: dict, source: str) -> dict | None:
    full_name = _pick_first_str(repo, ["full_name"])
    default_branch = _pick_first_str(repo, ["default_branch"]) or "main"
    html_url = _pick_first_str(repo, ["html_url"])
    if not full_name or not html_url:
        return None
    repo_name = full_name.split("/")[-1]
    skill_md_url = f"https://raw.githubusercontent.com/{full_name}/{default_branch}/SKILL.md"
    return {
        "external_id": f"github:{full_name}",
        "name": repo_name,
        "source": source,
        "description": _pick_first_str(repo, ["description"]),
        "repo_url": html_url,
        "skill_md_url": skill_md_url,
        "icon_url": "",
        "tag": "",
        "version": "",
        "downloads": _parse_int(repo.get("stargazers_count")),
        "stars": _parse_int(repo.get("stargazers_count")),
    }


def _load_shop_from_github_topic(q: str, page: int, page_size: int) -> tuple[list[dict], bool, int | None]:
    topic = os.getenv("SKILL_SHOP_GITHUB_TOPIC", SKILL_SHOP_GITHUB_TOPIC).strip() or SKILL_SHOP_GITHUB_TOPIC
    safe_page = max(1, page)
    safe_page_size = max(1, min(page_size, SKILL_SHOP_MAX_LIMIT))
    query_parts = [f"topic:{topic}"]
    if q:
        query_parts.append(f"{q} in:name,description,readme")
    query_text = " ".join(query_parts)
    url = (
        "https://api.github.com/search/repositories"
        f"?q={quote(query_text)}&sort=stars&order=desc&per_page={safe_page_size}&page={safe_page}"
    )
    payload = _http_get_json(url)
    repos = payload.get("items", []) if isinstance(payload, dict) else []
    if not isinstance(repos, list):
        return [], False, None

    total_count_raw = payload.get("total_count") if isinstance(payload, dict) else None
    total_count = int(total_count_raw) if isinstance(total_count_raw, int) else None

    items: list[dict] = []
    for repo in repos:
        if not isinstance(repo, dict):
            continue
        mapped = _map_github_repo_to_skill_item(repo, source=f"github-topic:{topic}")
        if mapped:
            items.append(mapped)

    capped_total = min(total_count, 1000) if isinstance(total_count, int) else None
    has_more = len(items) >= safe_page_size
    if isinstance(capped_total, int):
        has_more = (safe_page * safe_page_size) < capped_total
    return items, has_more, capped_total


def _extract_skillhub_list(payload: dict | list) -> tuple[list[dict], int | None]:
    if isinstance(payload, list):
        return [one for one in payload if isinstance(one, dict)], None
    if not isinstance(payload, dict):
        return [], None

    total = payload.get("total")
    if not isinstance(total, int):
        total = payload.get("total_count")
    if not isinstance(total, int):
        total = payload.get("count")
    if not isinstance(total, int):
        total = payload.get("total_items")
    if not isinstance(total, int):
        total = payload.get("totalElements")
    if not isinstance(total, int):
        total = None

    candidates = [
        payload.get("items"),
        payload.get("skills"),
        payload.get("list"),
        payload.get("data"),
        payload.get("results"),
        payload.get("records"),
        payload.get("rows"),
    ]
    for node in candidates:
        if isinstance(node, list):
            return [one for one in node if isinstance(one, dict)], total
        if isinstance(node, dict):
            for key in ("items", "skills", "list", "results", "records", "rows"):
                nested = node.get(key)
                if isinstance(nested, list):
                    nested_total = node.get("total")
                    if isinstance(nested_total, int):
                        total = nested_total
                    return [one for one in nested if isinstance(one, dict)], total
    return [], total


def _map_skillhub_item_to_skill_item(one: dict) -> dict | None:
    raw_id = _pick_first_str(one, ["id", "skill_id", "uuid", "external_id"])
    name = _pick_first_str(one, ["name", "title", "skill_name", "display_name"])
    if not name:
        return None
    external_id = f"clawhub:{raw_id}" if raw_id else f"clawhub:name:{name}"
    repo_url = _pick_first_str(one, ["repo_url", "repository_url", "github_url", "url", "detail_url"])
    skill_md_url = _pick_first_str(one, ["skill_md_url", "content_url", "raw_url", "markdown_url"])
    icon_url = _pick_first_str(one, ["icon_url", "icon", "logo", "logo_url", "avatar_url"])
    tag = _pick_first_str(one, ["tag", "category", "scene", "type"])
    version = _pick_first_str(one, ["version", "latest_version", "release_version"])
    downloads = _parse_int(one.get("downloads") or one.get("download_count") or one.get("install_count"))
    stars = _parse_int(one.get("stars") or one.get("star_count") or one.get("favorite_count"))
    return {
        "external_id": external_id,
        "name": name,
        "source": "clawhub",
        "description": _pick_first_str(one, ["description", "desc", "summary", "introduce"]),
        "repo_url": repo_url,
        "skill_md_url": skill_md_url,
        "icon_url": icon_url,
        "tag": tag,
        "version": version,
        "downloads": downloads,
        "stars": stars,
    }


def _build_skillhub_list_url(q: str, page: int, page_size: int) -> str:
    # Retained for backward compatibility.
    urls = _build_skillhub_list_urls(q=q, page=page, page_size=page_size)
    return urls[0] if urls else ""


def _append_query(url: str, params: dict[str, str | int]) -> str:
    if not params:
        return url
    joined = "&".join([f"{quote(str(k))}={quote(str(v))}" for k, v in params.items()])
    sep = "&" if "?" in url else "?"
    return f"{url}{sep}{joined}"


def _build_skillhub_list_urls(q: str, page: int, page_size: int) -> list[str]:
    clawhub_env = os.getenv("SKILL_SHOP_CLAWHUB_LIST_URL", "").strip()
    legacy_env = os.getenv("SKILL_SHOP_SKILLHUB_LIST_URL", "").strip()
    bases = [clawhub_env, legacy_env]
    base_candidates: list[str] = []
    for one in bases:
        if one and one not in base_candidates:
            base_candidates.append(one)

    safe_page = max(1, page)
    safe_page_size = max(1, min(page_size, SKILL_SHOP_MAX_LIMIT))
    offset = (safe_page - 1) * safe_page_size
    query = q.strip()

    param_strategies: list[dict[str, str | int]] = [
        {"page": safe_page, "page_size": safe_page_size, **({"q": query} if query else {})},
        {"page": safe_page, "limit": safe_page_size, **({"search": query} if query else {})},
        {"offset": offset, "limit": safe_page_size, **({"keyword": query} if query else {})},
        {"size": safe_page_size, "page": safe_page, **({"query": query} if query else {})},
        {},
    ]

    result: list[str] = []
    for base in base_candidates:
        for params in param_strategies:
            url = _append_query(base, params)
            if url not in result:
                result.append(url)
    return result


def _load_shop_from_skillhub(q: str, page: int, page_size: int) -> tuple[list[dict], bool, int | None]:
    urls = _build_skillhub_list_urls(q=q, page=page, page_size=page_size)
    last_total: int | None = None
    for url in urls:
        try:
            payload = _http_get_json(url)
        except Exception:
            continue
        raw_items, total = _extract_skillhub_list(payload)
        if isinstance(total, int):
            last_total = total
        items: list[dict] = []
        for one in raw_items:
            mapped = _map_skillhub_item_to_skill_item(one)
            if mapped:
                items.append(mapped)
        if items:
            has_more = len(items) >= max(1, min(page_size, SKILL_SHOP_MAX_LIMIT))
            if isinstance(total, int):
                has_more = page * page_size < total
            return items, has_more, total
    return [], False, last_total


def _paginate_items(items: list[dict], page: int, page_size: int) -> tuple[list[dict], bool]:
    safe_page = max(1, page)
    safe_page_size = max(1, min(page_size, SKILL_SHOP_MAX_LIMIT))
    start = (safe_page - 1) * safe_page_size
    end = start + safe_page_size
    sliced = items[start:end]
    has_more = end < len(items)
    return sliced, has_more


def _filter_shop_items(items: list[dict], q: str) -> list[dict]:
    query = q.strip().lower()
    if not query:
        return items
    result: list[dict] = []
    for one in items:
        haystack = " ".join(
            [
                str(one.get("name", "")),
                str(one.get("source", "")),
                str(one.get("description", "")),
                str(one.get("repo_url", "")),
                str(one.get("skill_md_url", "")),
            ]
        ).lower()
        if query in haystack:
            result.append(one)
    return result


def _load_remote_skill_shop(q: str, page: int, page_size: int) -> tuple[list[dict], bool, int | None]:
    try:
        return _load_shop_from_github_topic(q=q, page=page, page_size=page_size)
    except Exception:
        pass

    index_url = os.getenv("SKILL_SHOP_INDEX_URL", "").strip()
    if index_url:
        try:
            all_items = _load_shop_from_index_url(index_url)
            filtered = _filter_shop_items(all_items, q=q)
            sliced, has_more = _paginate_items(filtered, page=page, page_size=page_size)
            return sliced, has_more, len(filtered)
        except Exception:
            return [], False, None
    return [], False, None


def _load_github_item_by_external_id(target: str) -> dict | None:
    if target.startswith("github:"):
        full_name = target.split(":", 1)[1].strip()
        if not full_name:
            return None
    elif target.startswith("repo:"):
        repo_url = target.split(":", 1)[1].strip()
        parsed = _parse_repo_owner_and_name(repo_url)
        if not parsed:
            return None
        full_name = f"{parsed[0]}/{parsed[1]}"
    else:
        return None

    try:
        payload = _http_get_json(f"https://api.github.com/repos/{full_name}")
    except Exception:
        return None
    if not isinstance(payload, dict):
        return None
    topic = os.getenv("SKILL_SHOP_GITHUB_TOPIC", SKILL_SHOP_GITHUB_TOPIC).strip() or SKILL_SHOP_GITHUB_TOPIC
    return _map_github_repo_to_skill_item(payload, source=f"github-topic:{topic}")


def _find_index_item_by_external_id(target: str) -> dict | None:
    index_url = os.getenv("SKILL_SHOP_INDEX_URL", "").strip()
    if not index_url:
        return None
    try:
        all_items = _load_shop_from_index_url(index_url)
    except Exception:
        return None
    return next((one for one in all_items if str(one.get("external_id", "")).strip() == target), None)


def _resolve_skill_markdown_urls(item: dict) -> list[str]:
    urls: list[str] = []
    skill_md_url = str(item.get("skill_md_url", "")).strip()
    repo_url = str(item.get("repo_url", "")).strip()
    if skill_md_url:
        urls.append(skill_md_url)
    parsed = _parse_repo_owner_and_name(repo_url) if repo_url else None
    if parsed:
        owner, repo = parsed
        urls.append(f"https://raw.githubusercontent.com/{owner}/{repo}/main/SKILL.md")
        urls.append(f"https://raw.githubusercontent.com/{owner}/{repo}/master/SKILL.md")
    return list(dict.fromkeys(urls))


def _install_remote_skill(item: dict) -> tuple[str, str]:
    if _safe_str(item.get("content")):
        skill_name = _sanitize_skill_name(str(item.get("name", "")).strip())
        return skill_name, str(item.get("content", ""))

    urls = _resolve_skill_markdown_urls(item)
    if not urls:
        raise HTTPException(status_code=400, detail="该 skill 缺少可下载的 SKILL.md 地址")

    content = ""
    for one in urls:
        try:
            data = _http_get_text(one)
        except Exception:
            continue
        if data.strip():
            content = data
            break

    if not content:
        raise HTTPException(status_code=400, detail="无法从远程仓库下载 SKILL.md")

    skill_name = _sanitize_skill_name(str(item.get("name", "")).strip())
    return skill_name, content


@router.get("/skill-config", response_model=list[UserSkillConfigItem])
async def get_current_user_skill_config(current_user: dict = Depends(get_current_user)) -> list[UserSkillConfigItem]:
    skills = list_user_skills(current_user["id"])
    return [UserSkillConfigItem(**one) for one in skills]


@router.put("/skill-config", response_model=list[UserSkillConfigItem])
async def update_current_user_skill_config(
    payload: UserSkillConfigUpdateRequest,
    current_user: dict = Depends(get_current_user),
) -> list[UserSkillConfigItem]:
    next_skills = upsert_user_skills_enabled(
        user_id=current_user["id"],
        skill_enabled_map={item.name: item.enabled for item in payload.skills},
    )
    # Keep output stable and complete after update.
    merged = list_user_skills(current_user["id"]) if not next_skills else next_skills
    return [UserSkillConfigItem(**one) for one in merged]


@router.delete("/skill-config/{skill_name}")
async def delete_current_user_skill(
    skill_name: str,
    current_user: dict = Depends(get_current_user),
) -> dict[str, str]:
    target = skill_name.strip()
    if not target:
        raise HTTPException(status_code=400, detail="Skill 名称不能为空")
    deleted = delete_user_skill(user_id=current_user["id"], name=target)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Skill 不存在: {target}")
    return {"status": "deleted"}


@router.get("/skill-shop", response_model=SkillShopListResponse)
async def list_skill_shop(
    q: str = Query(default="", max_length=200),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=SKILL_SHOP_DEFAULT_LIMIT, ge=1, le=SKILL_SHOP_MAX_LIMIT),
    current_user: dict = Depends(get_current_user),
) -> SkillShopListResponse:
    discovered, has_more, total = _load_remote_skill_shop(q=q.strip(), page=page, page_size=page_size)
    added_names = {_sanitize_skill_name(str(one.get("name", ""))) for one in list_user_skills(current_user["id"])}
    items: list[SkillShopItem] = []
    for one in discovered:
        normalized_name = _sanitize_skill_name(str(one.get("name", "")))
        items.append(
            SkillShopItem(
                external_id=str(one.get("external_id", "")),
                name=str(one.get("name", "")),
                source=str(one.get("source", "")),
                description=str(one.get("description", "")),
                repo_url=str(one.get("repo_url", "")),
                skill_md_url=str(one.get("skill_md_url", "")),
                icon_url=str(one.get("icon_url", "")),
                tag=str(one.get("tag", "")),
                version=str(one.get("version", "")),
                downloads=_parse_int(one.get("downloads")),
                stars=_parse_int(one.get("stars")),
                available=True,
                missing_requirements="",
                added=normalized_name in added_names,
            )
        )
    return SkillShopListResponse(items=items, page=page, page_size=page_size, has_more=has_more, total=total)


@router.post("/skill-shop/add", response_model=UserSkillConfigItem)
async def add_skill_from_shop(
    payload: SkillShopAddRequest,
    current_user: dict = Depends(get_current_user),
) -> UserSkillConfigItem:
    target = payload.external_id.strip()
    selected = _find_index_item_by_external_id(target)
    if selected is None:
        selected = _load_github_item_by_external_id(target)
    if selected is None:
        discovered, _, _ = _load_remote_skill_shop(q="", page=1, page_size=SKILL_SHOP_MAX_LIMIT)
        selected = next((one for one in discovered if str(one.get("external_id", "")).strip() == target), None)
    if selected is None:
        raise HTTPException(status_code=404, detail=f"Skill 不存在或已下线: {target}")

    skill_name, skill_content = _install_remote_skill(selected)
    skill_path = str(selected.get("skill_md_url", "")).strip() or str(selected.get("repo_url", "")).strip()
    if not skill_path:
        skill_path = f"db://skill/{skill_name}"

    row = add_user_skill(
        user_id=current_user["id"],
        name=skill_name,
        path=skill_path,
        source=f"shop:{str(selected.get('source', '')).strip()}",
        description=str(selected.get("description", "")),
        content=skill_content,
        enabled=payload.enabled,
    )
    return UserSkillConfigItem(**row)
