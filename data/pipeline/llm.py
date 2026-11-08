"""EVREN istemcisi: OpenAI uyumlu `/chat/completions`, metin ve görüntü modeli (§0.5, §7).

Adres ve anahtar API'ninkiyle aynı değişkenlerden gelir; modeller ayrı seçilir:

    ASSISTANT_BASE_URL   EVREN adresi (…/v1)
    ASSISTANT_API_KEY    anahtar; hiçbir yerde yazdırılmaz
    INTAKE_TEXT_MODEL    taslak kayıt ve kitap haritası (yoksa gemma-4-31b; aşağıda neden)
    VISION_MODEL         fotoğraf konusu ve kitabe okuma (yoksa qwen3-vl-30b, API'nin varsayılanı)
    INTAKE_LLM_TIMEOUT   bir isteğin süresi, sn (yoksa 120)
    INTAKE_LLM_INTERVAL  iki istek arası en az süre, sn (yoksa 1): oran sınırına takılmamak için
    INTAKE_LLM_THINKING  `true`: modelin cevaptan önce düşünmesine izin ver (yoksa kapalı)

Düşünme neden kapalı: `qwen3.8-flash-next` düşünmeye bırakılınca bir sohbet taslağında 6000 token'ın
hepsini düşünmeye harcayıp boş cevap verdi (136 sn, `reasoning_budget_exhausted`). EVREN bunu yalnızca
`chat_template_kwargs: {"enable_thinking": false}` ile kapatıyor; `reasoning_effort`, `/no_think` ve
`enable_thinking` alanı yok sayılıyor (2026-11-08 denemesi).

Geçici hatalarda (429, 5xx, zaman aşımı, bağlantı kopması) artan bekleme ile yeniden dener;
sunucu `Retry-After` verirse ona uyar. Kalıcı hatalarda (400, 401, 403, 404) hemen durur.
Başka bir sağlayıcı eklenmez.
"""

from __future__ import annotations

import base64
import json
import re
import ssl
import sys
import threading
import time
import urllib.error
import urllib.request
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from typing import Any

DEFAULT_VISION_MODEL = "qwen3-vl-30b"
# Sohbet taslağında EVREN modelleri aynı sonucu verdi; en hızlısı bu (14 sn, qwen3.8-flash-next 46-48 sn,
# glm-5.3 72 sn). Plan §7: bir tur 30 sn'yi aşmamalı. Asistanın modeli (ASSISTANT_MODEL) değişmez.
DEFAULT_TEXT_MODEL = "gemma-4-31b"
RETRY_STATUS = {408, 409, 425, 429, 500, 502, 503, 504}
MAX_BACKOFF = 60.0


class LlmError(RuntimeError):
    """Model cevap vermedi ya da cevabı kullanılamadı. Mesajda anahtar yoktur."""

    def __init__(self, message: str, status: int | None = None, retryable: bool = False):
        super().__init__(message)
        self.status = status
        self.retryable = retryable


@dataclass
class Reply:
    text: str
    model: str
    ms: int
    usage: dict[str, Any] = field(default_factory=dict)
    attempts: int = 1


# Taşıyıcı: (url, başlıklar, gövde, zaman aşımı) → (durum, başlıklar, gövde). Testlerde sahtesi verilir.
Transport = Callable[[str, dict[str, str], bytes, float], tuple[int, Mapping[str, str], bytes]]


def _ssl_context() -> ssl.SSLContext:
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def urllib_transport(url: str, headers: dict[str, str], body: bytes, timeout: float) -> tuple[int, Mapping[str, str], bytes]:
    request = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=timeout, context=_ssl_context()) as response:
            return response.status, dict(response.headers), response.read()
    except urllib.error.HTTPError as error:
        return error.code, dict(error.headers or {}), error.read() or b""


@dataclass
class LlmConfig:
    base_url: str
    api_key: str | None
    text_model: str
    vision_model: str
    timeout: float = 120.0
    retries: int = 4
    min_interval: float = 1.0
    thinking: bool = False

    @classmethod
    def from_env(cls, env: Mapping[str, str]) -> "LlmConfig":
        base_url = (env.get("ASSISTANT_BASE_URL") or "").rstrip("/")
        text_model = env.get("INTAKE_TEXT_MODEL") or DEFAULT_TEXT_MODEL
        if not base_url:
            raise LlmError("ASSISTANT_BASE_URL tanımlı değil (apps/api/.env)")
        return cls(
            base_url=base_url,
            api_key=env.get("ASSISTANT_API_KEY") or None,
            text_model=text_model,
            vision_model=env.get("VISION_MODEL") or DEFAULT_VISION_MODEL,
            timeout=float(env.get("INTAKE_LLM_TIMEOUT") or 120),
            min_interval=float(env.get("INTAKE_LLM_INTERVAL") or 1),
            thinking=(env.get("INTAKE_LLM_THINKING") or "").lower() == "true",
        )


class Evren:
    def __init__(
        self,
        config: LlmConfig,
        transport: Transport = urllib_transport,
        sleep: Callable[[float], None] = time.sleep,
        on_retry: Callable[[str], None] | None = None,
    ):
        self.config = config
        self._transport = transport
        self._sleep = sleep
        # Yeniden denemeler sessiz geçmesin: worker bunu günlüğüne yazar.
        self._on_retry = on_retry or (lambda message: print(f"[evren] {message}", file=sys.stderr, flush=True))
        self._lock = threading.Lock()
        self._last = 0.0

    def chat(
        self,
        messages: list[dict[str, Any]],
        *,
        model: str | None = None,
        max_tokens: int | None = None,
        temperature: float = 0.0,
        json_mode: bool = False,
    ) -> Reply:
        """Bir sohbet isteği; geçici hatalarda yeniden dener. `json_mode` sağlayıcıdan JSON ister."""
        chosen = model or self.config.text_model
        payload: dict[str, Any] = {"model": chosen, "messages": messages, "temperature": temperature}
        if max_tokens:
            payload["max_tokens"] = max_tokens
        if json_mode:
            payload["response_format"] = {"type": "json_object"}
        if not self.config.thinking:
            payload["chat_template_kwargs"] = {"enable_thinking": False}
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        if self.config.api_key:
            headers["Authorization"] = f"Bearer {self.config.api_key}"
        url = f"{self.config.base_url}/chat/completions"

        last_error: LlmError | None = None
        for attempt in range(1, self.config.retries + 2):
            self._pace()
            started = time.monotonic()
            try:
                status, reply_headers, raw = self._transport(url, headers, body, self.config.timeout)
            except (TimeoutError, OSError) as error:  # zaman aşımı, bağlantı kopması
                last_error = LlmError(f"EVREN'e ulaşılamadı ({type(error).__name__}, {self.config.timeout:.0f} sn)", retryable=True)
                self._retrying(attempt, last_error)
                self._backoff(attempt, None)
                continue
            ms = int((time.monotonic() - started) * 1000)
            if status == 200:
                return self._parse(raw, chosen, ms, attempt)
            retryable = status in RETRY_STATUS
            last_error = LlmError(f"EVREN {status} döndü: {_short(raw)}", status=status, retryable=retryable)
            if not retryable:
                raise last_error
            self._retrying(attempt, last_error)
            self._backoff(attempt, _header(reply_headers, "retry-after"))
        assert last_error is not None
        raise last_error

    def vision(self, prompt: str, image: bytes, mime: str = "image/jpeg", *, system: str | None = None, model: str | None = None, max_tokens: int | None = None, json_mode: bool = False) -> Reply:
        """Bir fotoğrafla soru: görüntü modeline `image_url` (data URI) olarak gider."""
        data_uri = f"data:{mime};base64,{base64.b64encode(image).decode('ascii')}"
        messages: list[dict[str, Any]] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": [{"type": "image_url", "image_url": {"url": data_uri}}, {"type": "text", "text": prompt}]})
        return self.chat(messages, model=model or self.config.vision_model, max_tokens=max_tokens, json_mode=json_mode)

    def _retrying(self, attempt: int, error: LlmError) -> None:
        if attempt <= self.config.retries:
            self._on_retry(f"{error}; yeniden deneniyor ({attempt}/{self.config.retries})")

    def _pace(self) -> None:
        with self._lock:
            wait = self._last + self.config.min_interval - time.monotonic()
            if wait > 0:
                self._sleep(wait)
            self._last = time.monotonic()

    def _backoff(self, attempt: int, retry_after: str | None) -> None:
        if attempt > self.config.retries:
            return
        delay = min(MAX_BACKOFF, 2.0 ** attempt)
        if retry_after:
            try:
                delay = min(MAX_BACKOFF, max(delay, float(retry_after)))
            except ValueError:
                pass
        self._sleep(delay)

    @staticmethod
    def _parse(raw: bytes, model: str, ms: int, attempt: int) -> Reply:
        try:
            data = json.loads(raw.decode("utf-8"))
            text = data["choices"][0]["message"].get("content") or ""
        except (ValueError, KeyError, IndexError, TypeError) as error:
            raise LlmError(f"EVREN cevabı okunamadı: {_short(raw)}") from error
        usage = data.get("usage") or {}
        if not text.strip():
            spent = (usage.get("completion_tokens_details") or {}).get("reasoning_tokens")
            hint = f"; {spent} token düşünmeye gitti" if spent else ""
            raise LlmError(f"EVREN boş cevap verdi{hint}")
        return Reply(text=text, model=data.get("model") or model, ms=ms, usage=usage, attempts=attempt)


_THINK = re.compile(r"<think>.*?</think>", re.S)
_FENCE = re.compile(r"```(?:json)?\s*(.*?)```", re.S)


def parse_json(text: str) -> Any:
    """Modelin cevabından JSON: düşünme bloğu (`<think>`), kod çiti ve öndeki/arkadaki yazı atılır."""
    cleaned = _THINK.sub("", text).strip()
    fenced = _FENCE.search(cleaned)
    if fenced:
        cleaned = fenced.group(1).strip()
    try:
        return json.loads(cleaned)
    except ValueError:
        pass
    # Önce açılan parantezden (nesne ya da liste), ona denk kapanana kadar.
    pairs = [(cleaned.find(opener), opener, closer) for opener, closer in (("{", "}"), ("[", "]"))]
    for start, opener, closer in sorted(pair for pair in pairs if pair[0] >= 0):
        depth, in_string, escaped = 0, False, False
        for index in range(start, len(cleaned)):
            char = cleaned[index]
            if in_string:
                if escaped:
                    escaped = False
                elif char == "\\":
                    escaped = True
                elif char == '"':
                    in_string = False
            elif char == '"':
                in_string = True
            elif char == opener:
                depth += 1
            elif char == closer:
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(cleaned[start:index + 1])
                    except ValueError:
                        break
    raise LlmError("Model cevabında JSON bulunamadı")


def _header(headers: Mapping[str, str], name: str) -> str | None:
    for key, value in headers.items():
        if key.lower() == name:
            return value
    return None


def _short(raw: bytes, limit: int = 200) -> str:
    text = raw.decode("utf-8", errors="replace").strip().replace("\n", " ")
    return text[:limit] + ("…" if len(text) > limit else "")
