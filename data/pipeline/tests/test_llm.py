"""EVREN istemcisi: ağa çıkmadan, sahte bir taşıyıcıyla."""

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from llm import Evren, LlmConfig, LlmError, parse_json  # noqa: E402

CONFIG = LlmConfig(base_url="https://evren.example/v1", api_key="KEY-123", text_model="text-m", vision_model="vision-m", retries=3, min_interval=0)


def ok(content, model="text-m"):
    return 200, {}, json.dumps({"model": model, "choices": [{"message": {"content": content}}], "usage": {"total_tokens": 7}}).encode()


class FakeTransport:
    def __init__(self, *replies):
        self.replies = list(replies)
        self.calls = []

    def __call__(self, url, headers, body, timeout):
        self.calls.append({"url": url, "headers": headers, "body": json.loads(body), "timeout": timeout})
        reply = self.replies.pop(0)
        if isinstance(reply, BaseException):
            raise reply
        return reply


class Chat(unittest.TestCase):
    def setUp(self):
        self.sleeps = []

    def client(self, transport):
        return Evren(CONFIG, transport=transport, sleep=self.sleeps.append, on_retry=lambda message: None)

    def test_sends_model_messages_and_key(self):
        transport = FakeTransport(ok("merhaba"))
        reply = self.client(transport).chat([{"role": "user", "content": "selam"}], max_tokens=50)
        self.assertEqual(reply.text, "merhaba")
        self.assertEqual(reply.usage, {"total_tokens": 7})
        call = transport.calls[0]
        self.assertEqual(call["url"], "https://evren.example/v1/chat/completions")
        self.assertEqual(call["headers"]["Authorization"], "Bearer KEY-123")
        self.assertEqual(call["body"]["model"], "text-m")
        self.assertEqual(call["body"]["max_tokens"], 50)
        self.assertEqual(call["body"]["temperature"], 0.0)
        self.assertNotIn("response_format", call["body"])
        self.assertEqual(call["body"]["chat_template_kwargs"], {"enable_thinking": False})

    def test_thinking_can_be_allowed(self):
        transport = FakeTransport(ok("x"))
        config = LlmConfig(**{**CONFIG.__dict__, "thinking": True})
        Evren(config, transport=transport, sleep=self.sleeps.append).chat([{"role": "user", "content": "x"}])
        self.assertNotIn("chat_template_kwargs", transport.calls[0]["body"])

    def test_empty_answer_says_why(self):
        reply = (200, {}, json.dumps({"choices": [{"message": {"content": ""}}], "usage": {"completion_tokens_details": {"reasoning_tokens": 6000}}}).encode())
        with self.assertRaises(LlmError) as caught:
            self.client(FakeTransport(reply)).chat([{"role": "user", "content": "x"}])
        self.assertIn("6000", str(caught.exception))

    def test_retries_are_reported(self):
        said = []
        client = Evren(CONFIG, transport=FakeTransport((503, {}, b"busy"), ok("x")), sleep=self.sleeps.append, on_retry=said.append)
        client.chat([{"role": "user", "content": "x"}])
        self.assertEqual(len(said), 1)
        self.assertIn("503", said[0])

    def test_retries_temporary_errors_then_succeeds(self):
        transport = FakeTransport((503, {}, b"busy"), TimeoutError(), (429, {"Retry-After": "7"}, b"slow down"), ok("tamam"))
        reply = self.client(transport).chat([{"role": "user", "content": "x"}])
        self.assertEqual(reply.text, "tamam")
        self.assertEqual(reply.attempts, 4)
        self.assertEqual(self.sleeps, [2.0, 4.0, 8.0])  # 429'da Retry-After (7) artan beklemeden kısa: 8

    def test_retry_after_longer_than_backoff_is_honoured(self):
        transport = FakeTransport((429, {"retry-after": "30"}, b""), ok("tamam"))
        self.client(transport).chat([{"role": "user", "content": "x"}])
        self.assertEqual(self.sleeps, [30.0])

    def test_gives_up_after_retries(self):
        transport = FakeTransport(*[(502, {}, b"bad gateway")] * 4)
        with self.assertRaises(LlmError) as caught:
            self.client(transport).chat([{"role": "user", "content": "x"}])
        self.assertEqual(caught.exception.status, 502)
        self.assertEqual(len(transport.calls), 4)

    def test_permanent_errors_stop_at_once(self):
        for status in (400, 401, 403, 404):
            with self.subTest(status=status):
                transport = FakeTransport((status, {}, b"no"))
                with self.assertRaises(LlmError) as caught:
                    self.client(transport).chat([{"role": "user", "content": "x"}])
                self.assertEqual(len(transport.calls), 1)
                self.assertNotIn("KEY-123", str(caught.exception))

    def test_unreadable_reply(self):
        transport = FakeTransport((200, {}, b"<html>oops</html>"))
        with self.assertRaises(LlmError):
            self.client(transport).chat([{"role": "user", "content": "x"}])

    def test_vision_sends_image_to_vision_model(self):
        transport = FakeTransport(ok('{"subject": "door"}', model="vision-m"))
        reply = self.client(transport).vision("Ne görüyorsun?", b"\xff\xd8jpeg", system="Kurallar", json_mode=True)
        body = transport.calls[0]["body"]
        self.assertEqual(body["model"], "vision-m")
        self.assertEqual(body["response_format"], {"type": "json_object"})
        self.assertEqual(body["messages"][0], {"role": "system", "content": "Kurallar"})
        image, text = body["messages"][1]["content"]
        self.assertTrue(image["image_url"]["url"].startswith("data:image/jpeg;base64,"))
        self.assertEqual(text, {"type": "text", "text": "Ne görüyorsun?"})
        self.assertEqual(parse_json(reply.text), {"subject": "door"})

    def test_config_from_env(self):
        config = LlmConfig.from_env({"ASSISTANT_BASE_URL": "https://e/v1/", "ASSISTANT_MODEL": "chat-m", "ASSISTANT_API_KEY": "k"})
        self.assertEqual((config.base_url, config.text_model, config.vision_model), ("https://e/v1", "gemma-4-31b", "qwen3-vl-30b"), "asistanın modeli worker'ı etkilemez")
        config = LlmConfig.from_env({"ASSISTANT_BASE_URL": "https://e/v1", "ASSISTANT_MODEL": "chat-m", "INTAKE_TEXT_MODEL": "big-m", "VISION_MODEL": "v"})
        self.assertEqual((config.text_model, config.vision_model, config.api_key), ("big-m", "v", None))
        with self.assertRaises(LlmError):
            LlmConfig.from_env({"ASSISTANT_MODEL": "m"})  # adres yok


class ParseJson(unittest.TestCase):
    def test_plain_fenced_thinking_and_wrapped(self):
        cases = {
            '{"a": 1}': {"a": 1},
            '```json\n{"a": [1, 2]}\n```': {"a": [1, 2]},
            '<think>önce düşüneyim {"yanlış": true}</think>\n{"a": "b"}': {"a": "b"},
            'İşte kayıt: {"ad": "Cami {eski}", "n": 2} umarım işine yarar': {"ad": "Cami {eski}", "n": 2},
            'Liste: [{"k": 1}, {"k": 2}] bitti': [{"k": 1}, {"k": 2}],
            '{"metin": "tırnak \\" ve } parantez"}': {"metin": 'tırnak " ve } parantez'},
        }
        for text, expected in cases.items():
            with self.subTest(text=text):
                self.assertEqual(parse_json(text), expected)

    def test_no_json(self):
        for text in ("", "Bunu yapamam.", "{yarım", "<think>{\"a\":1}</think>"):
            with self.subTest(text=text), self.assertRaises(LlmError):
                parse_json(text)


if __name__ == "__main__":
    unittest.main()
