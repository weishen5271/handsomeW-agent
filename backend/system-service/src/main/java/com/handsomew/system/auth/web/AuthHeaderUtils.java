package com.handsomew.system.auth.web;

import com.handsomew.system.common.error.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
public class AuthHeaderUtils {

    public String extractBearerToken(String authorization) {
        if (authorization == null || authorization.isBlank()) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "缺少认证请求头");
        }
        String prefix = "Bearer ";
        if (!authorization.startsWith(prefix)) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "认证格式无效");
        }
        String token = authorization.substring(prefix.length()).trim();
        if (token.isEmpty()) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "缺少访问令牌");
        }
        return token;
    }
}
