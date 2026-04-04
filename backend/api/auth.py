from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from psycopg import IntegrityError

from api.schemas import (
    AuthResponse,
    UserCreateRequest,
    UserLoginRequest,
    UserPublic,
    UserRegisterRequest,
    UserListResponse,
    UserUpdateRequest,
)
from api.user_store import (
    create_session,
    create_user,
    delete_user,
    get_user_by_token,
    list_users,
    register_user,
    revoke_session,
    update_user,
    verify_user_password,
)

router = APIRouter(tags=["auth"])


def _extract_bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="缺少认证请求头")

    prefix = "Bearer "
    if not authorization.startswith(prefix):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="认证格式无效")

    token = authorization[len(prefix) :].strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="缺少访问令牌")

    return token


def get_current_user(authorization: str | None = Header(default=None)) -> dict:
    token = _extract_bearer_token(authorization)
    user = get_user_by_token(token)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="登录状态无效或已过期")
    return user


def get_current_admin(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="需要管理员权限")
    return current_user


@router.post("/auth/register", response_model=AuthResponse)
async def register(payload: UserRegisterRequest) -> AuthResponse:
    try:
        user = register_user(payload.username, payload.password)
    except IntegrityError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="用户名已存在") from exc

    token = create_session(user["id"])
    return AuthResponse(token=token, user=UserPublic(**user))


@router.post("/auth/login", response_model=AuthResponse)
async def login(payload: UserLoginRequest) -> AuthResponse:
    user = verify_user_password(payload.username, payload.password)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户名或密码错误")

    token = create_session(user["id"])
    return AuthResponse(token=token, user=UserPublic(**user))


@router.post("/auth/logout")
async def logout(authorization: str | None = Header(default=None)) -> dict[str, str]:
    token = _extract_bearer_token(authorization)
    revoke_session(token)
    return {"status": "ok"}


@router.get("/auth/me", response_model=UserPublic)
async def me(current_user: dict = Depends(get_current_user)) -> UserPublic:
    return UserPublic(**current_user)


@router.get("/users", response_model=UserListResponse)
async def get_users(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    _: dict = Depends(get_current_admin),
) -> UserListResponse:
    items, total = list_users(page=page, page_size=page_size)
    return UserListResponse(
        items=[UserPublic(**user) for user in items],
        page=page,
        page_size=page_size,
        total=total,
    )


@router.post("/users", response_model=UserPublic)
async def create_user_by_admin(payload: UserCreateRequest, _: dict = Depends(get_current_admin)) -> UserPublic:
    try:
        user = create_user(username=payload.username, password=payload.password, role=payload.role)
    except IntegrityError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="用户名已存在") from exc

    return UserPublic(**user)


@router.patch("/users/{user_id}", response_model=UserPublic)
async def update_user_by_admin(
    user_id: int,
    payload: UserUpdateRequest,
    current_admin: dict = Depends(get_current_admin),
) -> UserPublic:
    if payload.role == "user" and current_admin["id"] == user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不能将自己降级为普通用户")

    try:
        updated = update_user(
            user_id=user_id,
            username=payload.username,
            role=payload.role,
            password=payload.password,
        )
    except IntegrityError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="用户名已存在") from exc

    if updated is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")

    return UserPublic(**updated)


@router.delete("/users/{user_id}")
async def delete_user_by_admin(user_id: int, current_admin: dict = Depends(get_current_admin)) -> dict[str, str]:
    if current_admin["id"] == user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不能删除当前登录用户")

    deleted = delete_user(user_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")

    return {"status": "deleted"}
