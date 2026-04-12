package com.handsomew.system.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "handsomew.minio")
public class MinioProperties {

    private String endpoint = "";
    private String accessKey = "";
    private String secretKey = "";
    private String bucket = "models";
    private boolean secure = false;
    private String publicEndpoint = "";
    private int presignedExpireSeconds = 3600;

    public String getEndpoint() {
        return endpoint;
    }

    public void setEndpoint(String endpoint) {
        this.endpoint = endpoint;
    }

    public String getAccessKey() {
        return accessKey;
    }

    public void setAccessKey(String accessKey) {
        this.accessKey = accessKey;
    }

    public String getSecretKey() {
        return secretKey;
    }

    public void setSecretKey(String secretKey) {
        this.secretKey = secretKey;
    }

    public String getBucket() {
        return bucket;
    }

    public void setBucket(String bucket) {
        this.bucket = bucket;
    }

    public boolean isSecure() {
        return secure;
    }

    public void setSecure(boolean secure) {
        this.secure = secure;
    }

    public String getPublicEndpoint() {
        return publicEndpoint;
    }

    public void setPublicEndpoint(String publicEndpoint) {
        this.publicEndpoint = publicEndpoint;
    }

    public int getPresignedExpireSeconds() {
        return presignedExpireSeconds;
    }

    public void setPresignedExpireSeconds(int presignedExpireSeconds) {
        this.presignedExpireSeconds = presignedExpireSeconds;
    }
}
