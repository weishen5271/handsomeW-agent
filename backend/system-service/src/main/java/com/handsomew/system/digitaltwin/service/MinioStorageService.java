package com.handsomew.system.digitaltwin.service;

import com.handsomew.system.common.error.ApiException;
import com.handsomew.system.config.MinioProperties;
import io.minio.*;
import io.minio.http.Method;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.time.LocalDate;
import java.util.UUID;

@Service
public class MinioStorageService {

    private final MinioProperties properties;

    public MinioStorageService(MinioProperties properties) {
        this.properties = properties;
    }

    public UploadedResource uploadModel(MultipartFile file) {
        validateConfigured();
        try {
            ensureBucket();
            String originalName = file.getOriginalFilename() == null ? "upload.bin" : file.getOriginalFilename();
            String objectKey = buildObjectKey(LocalDate.now().getYear(), "resources", UUID.randomUUID().toString().replace("-", "") + "-" + originalName);
            byte[] bytes = file.getBytes();
            client().putObject(
                    PutObjectArgs.builder()
                            .bucket(properties.getBucket())
                            .object(objectKey)
                            .stream(new ByteArrayInputStream(bytes), bytes.length, -1)
                            .contentType(file.getContentType() == null ? "application/octet-stream" : file.getContentType())
                            .build()
            );
            return new UploadedResource(
                    objectKey,
                    buildDirectUrl(objectKey),
                    bytes.length,
                    file.getContentType() == null ? "application/octet-stream" : file.getContentType(),
                    originalName
            );
        } catch (Exception ex) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "MinIO 上传失败: " + ex.getMessage());
        }
    }

    public String previewUrl(String objectKey) {
        validateConfigured();
        try {
            return client().getPresignedObjectUrl(
                    GetPresignedObjectUrlArgs.builder()
                            .method(Method.GET)
                            .bucket(properties.getBucket())
                            .object(objectKey)
                            .expiry(properties.getPresignedExpireSeconds())
                            .build()
            );
        } catch (Exception ex) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "生成预览地址失败: " + ex.getMessage());
        }
    }

    private void ensureBucket() throws Exception {
        boolean exists = client().bucketExists(BucketExistsArgs.builder().bucket(properties.getBucket()).build());
        if (!exists) {
            client().makeBucket(MakeBucketArgs.builder().bucket(properties.getBucket()).build());
        }
    }

    private void validateConfigured() {
        if (properties.getEndpoint() == null || properties.getEndpoint().isBlank()
                || properties.getAccessKey() == null || properties.getAccessKey().isBlank()
                || properties.getSecretKey() == null || properties.getSecretKey().isBlank()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "MinIO 未配置，请设置 MINIO_ENDPOINT / MINIO_ACCESS_KEY / MINIO_SECRET_KEY");
        }
    }

    private String buildDirectUrl(String objectKey) {
        String publicEndpoint = (properties.getPublicEndpoint() == null || properties.getPublicEndpoint().isBlank())
                ? properties.getEndpoint()
                : properties.getPublicEndpoint();
        String scheme = properties.isSecure() ? "https" : "http";
        return scheme + "://" + publicEndpoint + "/" + properties.getBucket() + "/" + objectKey.replace(" ", "%20");
    }

    private String buildObjectKey(int year, String assetId, String filename) {
        return "models/" + year + "/" + assetId + "/" + filename.replace("\\", "/").substring(filename.replace("\\", "/").lastIndexOf('/') + 1);
    }

    private MinioClient client() {
        return MinioClient.builder()
                .endpoint(properties.getEndpoint())
                .credentials(properties.getAccessKey(), properties.getSecretKey())
                .build();
    }

    public record UploadedResource(
            String objectKey,
            String url,
            long fileSize,
            String contentType,
            String originalFileName
    ) {
    }
}
