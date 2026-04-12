package com.handsomew.system.gateway;

import com.handsomew.system.auth.web.AuthHeaderUtils;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Flux;

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

    @GetMapping("/agents/sessions/{sessionId}/messages")
    public Object getSessionMessages(@PathVariable String sessionId,
                                     @RequestHeader(value = "Authorization", required = false) String authorization,
                                     @RequestParam Map<String, String> query) {
        return forwardJson(HttpMethod.GET, "/agents/sessions/" + sessionId + "/messages", authorization, null, query);
    }

    @PostMapping(path = "/agents/{agentType}/chat/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<Flux<DataBuffer>> chatStream(@PathVariable String agentType,
                                                       @RequestHeader(value = "Authorization", required = false) String authorization,
                                                       @RequestBody String body) {
        String token = authHeaderUtils.extractBearerToken(authorization);
        Flux<DataBuffer> flux = aiWebClient.post()
                .uri("/agents/" + agentType + "/chat/stream")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body)
                .retrieve()
                .bodyToFlux(DataBuffer.class);
        return ResponseEntity.ok()
                .contentType(MediaType.TEXT_EVENT_STREAM)
                .body(flux);
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
