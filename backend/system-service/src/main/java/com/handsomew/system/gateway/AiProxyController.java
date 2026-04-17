package com.handsomew.system.gateway;

import com.handsomew.system.auth.web.AuthHeaderUtils;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.core.io.buffer.DataBufferUtils;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.util.Map;

@RestController
public class AiProxyController {

    private final WebClient aiWebClient;
    private final AuthHeaderUtils authHeaderUtils;

    public AiProxyController(WebClient aiWebClient, AuthHeaderUtils authHeaderUtils) {
        this.aiWebClient = aiWebClient;
        this.authHeaderUtils = authHeaderUtils;
    }

    @GetMapping("/llm-config")
    public Object getLlmConfig(@RequestHeader(value = "Authorization", required = false) String authorization) {
        return forwardJson(HttpMethod.GET, "/llm-config", authorization, null, null);
    }

    @PutMapping("/llm-config")
    public Object putLlmConfig(@RequestHeader(value = "Authorization", required = false) String authorization,
                               @RequestBody String body) {
        return forwardJson(HttpMethod.PUT, "/llm-config", authorization, body, null);
    }

    @GetMapping("/skill-config")
    public Object getSkillConfig(@RequestHeader(value = "Authorization", required = false) String authorization) {
        return forwardJson(HttpMethod.GET, "/skill-config", authorization, null, null);
    }

    @PutMapping("/skill-config")
    public Object putSkillConfig(@RequestHeader(value = "Authorization", required = false) String authorization,
                                 @RequestBody String body) {
        return forwardJson(HttpMethod.PUT, "/skill-config", authorization, body, null);
    }

    @DeleteMapping("/skill-config/{name}")
    public Object deleteSkillConfig(@PathVariable String name,
                                    @RequestHeader(value = "Authorization", required = false) String authorization) {
        return forwardJson(HttpMethod.DELETE, "/skill-config/" + name, authorization, null, null);
    }

    @GetMapping("/skill-shop")
    public Object getSkillShop(@RequestHeader(value = "Authorization", required = false) String authorization,
                               @RequestParam Map<String, String> query) {
        return forwardJson(HttpMethod.GET, "/skill-shop", authorization, null, query);
    }

    @PostMapping("/skill-shop/add")
    public Object addSkillShop(@RequestHeader(value = "Authorization", required = false) String authorization,
                               @RequestBody String body) {
        return forwardJson(HttpMethod.POST, "/skill-shop/add", authorization, body, null);
    }

    @GetMapping("/agents/sessions")
    public Object getSessions(@RequestHeader(value = "Authorization", required = false) String authorization,
                              @RequestParam Map<String, String> query) {
        return forwardJson(HttpMethod.GET, "/agents/sessions", authorization, null, query);
    }

    @PostMapping("/agents/sessions")
    public Object createSession(@RequestHeader(value = "Authorization", required = false) String authorization) {
        return forwardJson(HttpMethod.POST, "/agents/sessions", authorization, null, null);
    }

    @DeleteMapping("/agents/sessions/{sessionId}")
    public Object deleteSession(@PathVariable String sessionId,
                                @RequestHeader(value = "Authorization", required = false) String authorization) {
        return forwardJson(HttpMethod.DELETE, "/agents/sessions/" + sessionId, authorization, null, null);
    }

    @GetMapping("/agents/sessions/{sessionId}/messages")
    public Object getSessionMessages(@PathVariable String sessionId,
                                     @RequestHeader(value = "Authorization", required = false) String authorization,
                                     @RequestParam Map<String, String> query) {
        return forwardJson(HttpMethod.GET, "/agents/sessions/" + sessionId + "/messages", authorization, null, query);
    }

    @PostMapping("/agents/sessions/{sessionId}/messages/{memoryId}/pin")
    public Object togglePin(@PathVariable String sessionId,
                            @PathVariable String memoryId,
                            @RequestHeader(value = "Authorization", required = false) String authorization) {
        return forwardJson(HttpMethod.POST, "/agents/sessions/" + sessionId + "/messages/" + memoryId + "/pin", authorization, null, null);
    }

    @GetMapping("/agents/sessions/{sessionId}/context-docs")
    public Object getContextDocs(@PathVariable String sessionId,
                                 @RequestHeader(value = "Authorization", required = false) String authorization) {
        return forwardJson(HttpMethod.GET, "/agents/sessions/" + sessionId + "/context-docs", authorization, null, null);
    }

    @PostMapping(path = "/agents/sessions/{sessionId}/context-docs", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Object uploadContextDoc(@PathVariable String sessionId,
                                   @RequestParam("file") MultipartFile file,
                                   @RequestHeader(value = "Authorization", required = false) String authorization) throws IOException {
        String token = authHeaderUtils.extractBearerToken(authorization);
        MultipartBodyBuilder builder = new MultipartBodyBuilder();
        builder.part("file", file.getResource())
                .filename(file.getOriginalFilename())
                .contentType(MediaType.parseMediaType(file.getContentType() == null ? MediaType.TEXT_PLAIN_VALUE : file.getContentType()));

        return aiWebClient.post()
                .uri("/agents/sessions/" + sessionId + "/context-docs")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .accept(MediaType.APPLICATION_JSON)
                .bodyValue(builder.build())
                .retrieve()
                .bodyToMono(new ParameterizedTypeReference<Object>() {})
                .block();
    }

    @DeleteMapping("/agents/sessions/{sessionId}/context-docs/{docId}")
    public Object deleteContextDoc(@PathVariable String sessionId,
                                   @PathVariable String docId,
                                   @RequestHeader(value = "Authorization", required = false) String authorization) {
        return forwardJson(HttpMethod.DELETE, "/agents/sessions/" + sessionId + "/context-docs/" + docId, authorization, null, null);
    }

    @PostMapping(path = "/agents/{agentType}/chat/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<StreamingResponseBody> chatStream(@PathVariable String agentType,
                                                            @RequestHeader(value = "Authorization", required = false) String authorization,
                                                            @RequestBody String body) {
        String token = authHeaderUtils.extractBearerToken(authorization);

        StreamingResponseBody stream = (OutputStream outputStream) ->
                aiWebClient.post()
                        .uri("/agents/" + agentType + "/chat/stream")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .accept(MediaType.TEXT_EVENT_STREAM)
                        .bodyValue(body)
                        .retrieve()
                        .bodyToFlux(DataBuffer.class)
                        .doOnNext(buffer -> {
                            try {
                                byte[] bytes = new byte[buffer.readableByteCount()];
                                buffer.read(bytes);
                                outputStream.write(bytes);
                                outputStream.flush();
                            } catch (IOException e) {
                                throw new UncheckedIOException(e);
                            } finally {
                                DataBufferUtils.release(buffer);
                            }
                        })
                        .blockLast();

        return ResponseEntity.ok()
                .contentType(MediaType.TEXT_EVENT_STREAM)
                .header(HttpHeaders.CACHE_CONTROL, "no-cache")
                .header(HttpHeaders.CONNECTION, "keep-alive")
                .header("X-Accel-Buffering", "no")
                .body(stream);
    }

    @PostMapping("/agents/{agentType}/chat")
    public Object chat(@PathVariable String agentType,
                       @RequestHeader(value = "Authorization", required = false) String authorization,
                       @RequestBody String body) {
        return forwardJson(HttpMethod.POST, "/agents/" + agentType + "/chat", authorization, body, null);
    }

    @GetMapping("/digital-twin/assets/{assetId}/knowledge-graph")
    public Object assetKnowledgeGraph(@PathVariable String assetId,
                                      @RequestHeader(value = "Authorization", required = false) String authorization) {
        return forwardJson(HttpMethod.GET, "/digital-twin/assets/" + assetId + "/knowledge-graph", authorization, null, null);
    }

    private Object forwardJson(HttpMethod method, String path, String authorization, String body, Map<String, String> query) {
        String token = authHeaderUtils.extractBearerToken(authorization);
        WebClient.RequestBodyUriSpec spec = aiWebClient.method(method);
        WebClient.RequestHeadersSpec<?> requestSpec = spec.uri(uriBuilder -> {
                    uriBuilder.path(path);
                    if (query != null) {
                        query.forEach(uriBuilder::queryParam);
                    }
                    return uriBuilder.build();
                })
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .accept(MediaType.APPLICATION_JSON);
        if (body != null && !body.isBlank() && requestSpec instanceof WebClient.RequestBodySpec bodySpec) {
            requestSpec = bodySpec.contentType(MediaType.APPLICATION_JSON).bodyValue(body);
        }
        return requestSpec.retrieve()
                .bodyToMono(new ParameterizedTypeReference<Object>() {})
                .block();
    }
}
