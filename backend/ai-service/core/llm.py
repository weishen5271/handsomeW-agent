import json
import os
from typing import Any, Iterator, Literal, Optional

from litellm import acompletion, completion
from openai import OpenAI

from core.base import LLMResponse, ToolCallRequest

SUPPORTED_PROVIDERS = Literal[
    "openai",
    "deepseek",
    "qwen",
    "modelscope",
    "kimi",
    "zhipu",
    "ollama",
    "vllm",
    "local",
    "auto",
    "custom",
]


class MyAgentsLLM:
    def __init__(
        self,
        model: Optional[str] = None,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        provider: Optional[SUPPORTED_PROVIDERS] = None,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        timeout: Optional[int] = None,
        **kwargs,
    ):
        self.model = model or os.getenv("LLM_MODEL_ID")
        self.api_key = api_key or os.getenv("LLM_API_KEY")
        self.base_url = base_url or os.getenv("LLM_BASE_URL")
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.timeout = timeout or int(os.getenv("LLM_TIMEOUT", "60"))
        self.provider = provider
        self._provider_explicit = provider is not None
        self.extra_headers = kwargs.get("extra_headers", {})

        if not all([self.model, self.api_key, self.base_url]):
            raise ValueError("Model ID, API key, and base URL must be provided.")

        if self.provider is None:
            self.provider = self._auto_detect_provider(self.api_key, self.base_url)

    def _auto_detect_provider(self, api_key: str, base_url: str) -> str:
        if os.getenv("OPENAI_API_KEY"):
            return "openai"
        if os.getenv("DEEPSEEK_API_KEY"):
            return "deepseek"
        if os.getenv("DASHSCOPE_API_KEY"):
            return "qwen"
        if os.getenv("MODELSCOPE_API_KEY"):
            return "modelscope"
        if os.getenv("KIMI_API_KEY") or os.getenv("MOONSHOT_API_KEY"):
            return "kimi"
        if os.getenv("ZHIPU_API_KEY") or os.getenv("GLM_API_KEY"):
            return "zhipu"
        if os.getenv("OLLAMA_API_KEY") or os.getenv("OLLAMA_HOST"):
            return "ollama"
        if os.getenv("VLLM_API_KEY") or os.getenv("VLLM_HOST"):
            return "vllm"

        actual_api_key = api_key or os.getenv("LLM_API_KEY") or ""
        if actual_api_key.startswith("ms-"):
            return "modelscope"
        if actual_api_key.lower() in {"ollama", "vllm", "local"}:
            return actual_api_key.lower()

        actual_base_url = (base_url or os.getenv("LLM_BASE_URL") or "").lower()
        if "api.openai.com" in actual_base_url:
            return "openai"
        if "api.deepseek.com" in actual_base_url:
            return "deepseek"
        if "dashscope.aliyuncs.com" in actual_base_url:
            return "qwen"
        if "api-inference.modelscope.cn" in actual_base_url:
            return "modelscope"
        if "api.moonshot.cn" in actual_base_url:
            return "kimi"
        if "open.bigmodel.cn" in actual_base_url:
            return "zhipu"
        if ":11434" in actual_base_url or "ollama" in actual_base_url:
            return "ollama"
        if "vllm" in actual_base_url:
            return "vllm"
        if "localhost" in actual_base_url or "127.0.0.1" in actual_base_url:
            return "local"

        return "auto"

    def _resolve_credentials(self, api_key: str, base_url: str) -> tuple[str, str]:
        if self.provider == "openai":
            return (
                api_key or os.getenv("OPENAI_API_KEY") or os.getenv("LLM_API_KEY"),
                base_url or os.getenv("LLM_BASE_URL") or "https://api.openai.com/v1",
            )
        if self.provider == "deepseek":
            return (
                api_key or os.getenv("DEEPSEEK_API_KEY") or os.getenv("LLM_API_KEY"),
                base_url or os.getenv("LLM_BASE_URL") or "https://api.deepseek.com",
            )
        if self.provider == "qwen":
            return (
                api_key or os.getenv("DASHSCOPE_API_KEY") or os.getenv("LLM_API_KEY"),
                base_url
                or os.getenv("LLM_BASE_URL")
                or "https://dashscope.aliyuncs.com/compatible-mode/v1",
            )
        if self.provider == "modelscope":
            return (
                api_key or os.getenv("MODELSCOPE_API_KEY") or os.getenv("LLM_API_KEY"),
                base_url or os.getenv("LLM_BASE_URL") or "https://api-inference.modelscope.cn/v1/",
            )
        if self.provider == "kimi":
            return (
                api_key
                or os.getenv("KIMI_API_KEY")
                or os.getenv("MOONSHOT_API_KEY")
                or os.getenv("LLM_API_KEY"),
                base_url or os.getenv("LLM_BASE_URL") or "https://api.moonshot.cn/v1",
            )
        if self.provider == "zhipu":
            return (
                api_key
                or os.getenv("ZHIPU_API_KEY")
                or os.getenv("GLM_API_KEY")
                or os.getenv("LLM_API_KEY"),
                base_url or os.getenv("LLM_BASE_URL") or "https://open.bigmodel.cn/api/paas/v4",
            )
        if self.provider == "ollama":
            return (
                api_key or os.getenv("OLLAMA_API_KEY") or os.getenv("LLM_API_KEY") or "ollama",
                base_url or os.getenv("OLLAMA_HOST") or os.getenv("LLM_BASE_URL") or "http://localhost:11434/v1",
            )
        if self.provider == "vllm":
            return (
                api_key or os.getenv("VLLM_API_KEY") or os.getenv("LLM_API_KEY") or "vllm",
                base_url or os.getenv("VLLM_HOST") or os.getenv("LLM_BASE_URL") or "http://localhost:8000/v1",
            )
        if self.provider == "local":
            return (
                api_key or os.getenv("LLM_API_KEY") or "local",
                base_url or os.getenv("LLM_BASE_URL") or "http://localhost:8000/v1",
            )

        return api_key or os.getenv("LLM_API_KEY"), base_url or os.getenv("LLM_BASE_URL")

    def _create_client(self) -> OpenAI:
        return OpenAI(api_key=self.api_key, base_url=self.base_url, timeout=self.timeout)

    def _get_default_model(self) -> str:
        defaults = {
            "openai": "gpt-4o-mini",
            "deepseek": "deepseek-chat",
            "qwen": "qwen-plus",
            "modelscope": "Qwen/Qwen2.5-72B-Instruct",
            "kimi": "moonshot-v1-8k",
            "zhipu": "glm-4",
            "ollama": "llama3.2",
            "vllm": "meta-llama/Llama-2-7b-chat-hf",
            "local": "local-model",
        }
        return defaults.get(self.provider or "auto", self.model or "gpt-4o-mini")

    def think(self, messages: list[dict[str, str]], temperature: Optional[float] = None) -> Iterator[str]:
        try:
            client = self._create_client()
            response = client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=temperature if temperature is not None else self.temperature,
                stream=True,
            )
            for chunk in response:
                content = chunk.choices[0].delta.content or ""
                if content:
                    yield content
        except Exception as e:
            print(f"Error calling LLM API: {e}")
            return

    def _normalize_messages(self, messages: list[Any]) -> list[dict[str, Any]]:
        normalized: list[dict[str, Any]] = []
        for msg in messages:
            if hasattr(msg, "to_dict") and callable(msg.to_dict):
                normalized.append(msg.to_dict())
            elif isinstance(msg, dict):
                normalized.append(msg)
            else:
                raise TypeError(f"Unsupported message type: {type(msg)}")
        return normalized

    async def invoke(
        self,
        messages: list[dict[str, str]],
        tools: list[dict[str, str]] = None,
        **kwargs,
    ) -> LLMResponse:
        try:
            normalized_messages = self._normalize_messages(messages)
            response = await self._chat(
                model=self.model,
                messages=normalized_messages,
                tools=tools,
                temperature=kwargs.get("temperature", self.temperature),
                max_tokens=kwargs.get("max_tokens", self.max_tokens),
                **{k: v for k, v in kwargs.items() if k not in ["temperature", "max_tokens"]},
            )
            return response
        except Exception as e:
            raise Exception(f"LLM call failed: {str(e)}")

    def stream_invoke(self, messages: list[dict[str, str]], **kwargs) -> Iterator[str]:
        temperature = kwargs.get("temperature")
        yield from self.think(messages, temperature)

    async def _chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        model: str | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
        **kwargs,
    ) -> LLMResponse | None:
        payload = self._build_payload(
            messages=messages,
            tools=tools,
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            **kwargs,
        )

        try:
            response = await acompletion(**payload)
            return self._parse_response(response)
        except Exception as e:
            # Fallback for provider/model routing mismatches on OpenAI-compatible endpoints.
            fallback_payload = dict(payload)
            model_name = str(fallback_payload.get("model", ""))
            should_retry = False

            if "custom_llm_provider" in fallback_payload:
                fallback_payload.pop("custom_llm_provider", None)
                should_retry = True

            if model_name.startswith("dashscope/"):
                fallback_payload["model"] = model_name.split("/", 1)[1]
                should_retry = True

            if should_retry:
                try:
                    response = await acompletion(**fallback_payload)
                    return self._parse_response(response)
                except Exception:
                    pass

            print(f"Error calling LLM API: {e}")
            raise

    def invoke_blocking(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        model: str | None = None,
        max_tokens: int | None = None,
        temperature: float | None = None,
        **kwargs,
    ) -> LLMResponse:
        normalized_messages = self._normalize_messages(messages)
        payload = self._build_payload(
            messages=normalized_messages,
            tools=tools,
            model=model,
            max_tokens=max_tokens or self.max_tokens or 4096,
            temperature=temperature if temperature is not None else self.temperature,
            **kwargs,
        )
        try:
            response = completion(**payload)
            return self._parse_response(response)
        except Exception as e:
            fallback_payload = dict(payload)
            model_name = str(fallback_payload.get("model", ""))
            should_retry = False

            if "custom_llm_provider" in fallback_payload:
                fallback_payload.pop("custom_llm_provider", None)
                should_retry = True

            if model_name.startswith("dashscope/"):
                fallback_payload["model"] = model_name.split("/", 1)[1]
                should_retry = True

            if should_retry:
                try:
                    response = completion(**fallback_payload)
                    return self._parse_response(response)
                except Exception:
                    pass

            raise Exception(f"LLM blocking call failed: {str(e)}")

    def _build_payload(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        model: str | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
        **kwargs,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": model or self.model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }

        if self.api_key:
            payload["api_key"] = self.api_key
        if self.base_url:
            payload["api_base"] = self.base_url
        if self.extra_headers:
            payload["extra_headers"] = self.extra_headers
        # LiteLLM expects `custom_llm_provider` instead of `provider`.
        # Most third-party endpoints here are OpenAI-compatible and should route via `openai`.
        if self.provider and self._provider_explicit:
            provider_map = {
                "openai": "openai",
                "deepseek": "openai",
                "qwen": "openai",
                "modelscope": "openai",
                "kimi": "openai",
                "zhipu": "openai",
                "vllm": "openai",
                "local": "openai",
                "custom": "openai",
                "ollama": "ollama",
            }
            payload["custom_llm_provider"] = provider_map.get(self.provider, self.provider)
        if self.timeout:
            payload["timeout"] = self.timeout
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"

        payload.update(kwargs)
        return payload

    def _parse_response(self, response: Any) -> LLMResponse:
        choice = response.choices[0]
        message = choice.message

        tool_calls = []
        if hasattr(message, "tool_calls") and message.tool_calls:
            for tc in message.tool_calls:
                args = tc.function.arguments
                if isinstance(args, str):
                    try:
                        args = json.loads(args)
                    except json.JSONDecodeError:
                        args = {"raw": args}

                tool_calls.append(
                    ToolCallRequest(
                        id=tc.id,
                        name=tc.function.name,
                        arguments=args,
                    )
                )

        usage = {}
        if hasattr(response, "usage") and response.usage:
            usage = {
                "prompt_tokens": response.usage.prompt_tokens,
                "completion_tokens": response.usage.completion_tokens,
                "total_tokens": response.usage.total_tokens,
            }

        reasoning_content = getattr(message, "reasoning_content", None)

        return LLMResponse(
            content=message.content,
            tool_calls=tool_calls,
            finish_reason=choice.finish_reason or "stop",
            usage=usage,
            reasoning_content=reasoning_content,
        )


if __name__ == '__main__':
    try:
        llm_client = MyAgentsLLM()
        example_messages = [
            {"role": "system", "content": "You are a helpful assistant that writes Python code."},
            {"role": "user", "content": "Write a quicksort in Python."},
        ]

        print("--- LLM Stream ---")
        print("".join(llm_client.think(example_messages)))
    except ValueError as e:
        print(e)
