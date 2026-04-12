import io
import os
import posixpath
from dataclasses import dataclass
from datetime import timedelta
from urllib.parse import quote

from minio import Minio
from minio.error import S3Error


@dataclass(frozen=True)
class UploadedObject:
    object_key: str
    url: str
    file_size: int
    content_type: str
    original_file_name: str


class MinioStorage:
    def __init__(self) -> None:
        endpoint = (os.getenv("MINIO_ENDPOINT") or "").strip()
        access_key = (os.getenv("MINIO_ACCESS_KEY") or "").strip()
        secret_key = (os.getenv("MINIO_SECRET_KEY") or "").strip()
        bucket = (os.getenv("MINIO_BUCKET") or "models").strip()
        secure = (os.getenv("MINIO_SECURE") or "false").strip().lower() == "true"
        if not endpoint or not access_key or not secret_key:
            raise RuntimeError("MinIO 未配置，请设置 MINIO_ENDPOINT / MINIO_ACCESS_KEY / MINIO_SECRET_KEY")

        self._bucket = bucket
        self._endpoint = endpoint
        self._secure = secure
        self._public_endpoint = (os.getenv("MINIO_PUBLIC_ENDPOINT") or endpoint).strip()
        self._use_presigned = (os.getenv("MINIO_USE_PRESIGNED_URL") or "false").strip().lower() == "true"
        self._presigned_expire_seconds = max(int(os.getenv("MINIO_PRESIGNED_EXPIRE_SECONDS") or "3600"), 60)
        self._client = Minio(
            endpoint=endpoint,
            access_key=access_key,
            secret_key=secret_key,
            secure=secure,
        )

    def _ensure_bucket(self) -> None:
        if self._client.bucket_exists(self._bucket):
            return
        self._client.make_bucket(self._bucket)

    def _build_direct_url(self, object_key: str) -> str:
        scheme = "https" if self._secure else "http"
        return f"{scheme}://{self._public_endpoint}/{self._bucket}/{quote(object_key)}"

    def upload_model(
        self,
        object_key: str,
        file_bytes: bytes,
        content_type: str,
        original_file_name: str,
    ) -> UploadedObject:
        try:
            self._ensure_bucket()
            self._client.put_object(
                bucket_name=self._bucket,
                object_name=object_key,
                data=io.BytesIO(file_bytes),
                length=len(file_bytes),
                content_type=content_type,
            )
            if self._use_presigned:
                url = self._client.presigned_get_object(
                    bucket_name=self._bucket,
                    object_name=object_key,
                    expires=timedelta(seconds=self._presigned_expire_seconds),
                )
            else:
                url = self._build_direct_url(object_key)
        except S3Error as exc:
            raise RuntimeError(f"MinIO 上传失败: {exc}") from exc

        return UploadedObject(
            object_key=object_key,
            url=url,
            file_size=len(file_bytes),
            content_type=content_type,
            original_file_name=original_file_name,
        )

    def get_preview_url(self, object_key: str) -> str:
        try:
            return self._client.presigned_get_object(
                bucket_name=self._bucket,
                object_name=object_key,
                expires=timedelta(seconds=self._presigned_expire_seconds),
            )
        except S3Error as exc:
            raise RuntimeError(f"生成预览地址失败: {exc}") from exc

    @staticmethod
    def build_object_key(year: int, asset_id: str, filename: str) -> str:
        safe_asset_id = (asset_id or "unassigned").strip() or "unassigned"
        safe_filename = filename.strip().replace("\\", "/").split("/")[-1]
        return posixpath.join("models", str(year), safe_asset_id, safe_filename)
