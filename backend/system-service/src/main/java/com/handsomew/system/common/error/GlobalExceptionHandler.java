package com.handsomew.system.common.error;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import java.util.LinkedHashMap;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<Map<String, Object>> handleApiException(ApiException ex) {
        return ResponseEntity.status(ex.getStatus()).body(Map.of("detail", ex.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidationException(MethodArgumentNotValidException ex) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("detail", ex.getBindingResult().getFieldErrors().stream()
                .map(error -> {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("loc", new Object[]{"body", error.getField()});
                    item.put("msg", error.getDefaultMessage());
                    return item;
                })
                .toList());
        return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY).body(body);
    }

    @ExceptionHandler(WebClientResponseException.class)
    public ResponseEntity<Map<String, Object>> handleWebClientException(WebClientResponseException ex) {
        String body = ex.getResponseBodyAsString();
        String detail = (body == null || body.isBlank()) ? ex.getMessage() : body;
        return ResponseEntity.status(ex.getStatusCode()).body(Map.of("detail", detail));
    }
}
