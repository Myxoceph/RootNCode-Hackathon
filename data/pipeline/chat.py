"""Sohbetten Kabul: yönetim panelindeki sohbetin mesajlarını ve fotoğraflarını taslak esere çevirir.

Model yalnızca **düzenler**: yetkilinin yazdığını şemanın alanlarına ve bölümlerine böler. Bilginin
doğruluğunu kanıtlayacak bir kaynak olmadığından, burada her değer mesajın kendisiyle denetlenir:

1. EVREN mesajları `prompts/asset-structure.md` ile alanlara ayırır; her değerin geçtiği cümleyi
   birebir alıntılar. Cevap biçime uymazsa bir kez düzeltmesi istenir.
2. Alıntı mesajda yoksa, ya da değer (yıl, ad) alıntıda geçmiyorsa uyarı: "metinde yok". Değer silinmez;
   uzman görür ve karar verir.
3. Bölüm ve özet metinlerinin kelimeleri mesajlarda aranır; payı düşükse uyarı.
4. Fotoğraflar: konusu ve alt metni görüntü modelinden (`prompts/photo-subject.md`), konumu orijinal
   dosyanın EXIF'inden.
5. Yerel veritabanındaki eserlerle benzer ad ya da 300 m içinde: "zaten var olabilir".
6. Kayıt `validate.py`'nin şemasıyla ve çapraz kontrolleriyle denetlenir; hatalar onayı engeller.

Ayrıntılar: docs/plans/yigit-veri-dongusu.md §1.
"""

from __future__ import annotations

import datetime as dt
import io
import json
import math
import re
import sys
import time
import unicodedata
from collections.abc import Callable
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

from config import PROMPTS, REPO
from intake_contract import clip_validation, field_names, photo_subjects, supports_message_refs, supports_missing
from llm import Evren, LlmError, parse_json
from stages import Draft

DATA = REPO / "data"
sys.path.insert(0, str(DATA / "tools"))
import validate as dataset  # noqa: E402  data/tools/validate.py: şema ve çapraz kontroller

CHAT_SOURCE = "vagabonds-panel"
ENTRY_KEY = "chat"
ENUMS = json.loads((DATA / "enums.json").read_text(encoding="utf-8"))
ASSET_TYPES = {item["code"] for item in ENUMS["asset_types"]}
ERAS = {item["code"] for item in ENUMS["eras"]}
CONFIDENCE = {"certain", "probable", "disputed", "legend"}
LANGUAGES = {"ar", "fa", "tr-ottoman", "tr", "el", "la", "hy", "other"}
CITY_REGION = {item["code"]: item["region"] for item in ENUMS["cities"]}
# Bölüm/özet: olgular (sayılar, özel adlar) mesajlarda birebir geçmeli; öbür kelimelerin en az bu payı.
# Model cümleyi yeniden kurunca "yer almaktadır", "bulunmaktadır" gibi dolgular eklenir: düz oran (eski
# %85) gerçek sohbetlerde bölümlerin çoğunu atıyordu (Muradiye denemesi: dört bölümden üçü, %62-81).
COVERAGE_MIN = 0.7
# Bölüm metninde olgu sayılmayan, dilin kendi dolgusu (bağlaçlar, "yer almaktadır"): orana ve özel ad
# denetimine girmez. Yalnızca dil bilgisi: "yapı", "iç", "günümüzde" gibi bir şey söyleyen kelimeler değil.
FILLER = set("""
yer almaktadır almaktadır alır alan bulunmaktadır bulunur bulunan bulunuyor olarak olan olup olmuştur
olmaktadır sahiptir sahip dikkat çeker çekmektedir çeken oluşur oluşmaktadır edilmiştir eden etmektedir
ayrıca ancak ise ile için gibi kadar daha çok bir bu şu o bunun şekilde biçimde ve de da ki ne hem
""".split())
# Bir kişinin işin yalnızca bir kısmını yaptığını gösteren sözler (alıntıda).
# Yalnızca mimar için: binanın değil kişinin işini anlatan etken fiiller ("tamamlandı" değil "tamamladı").
PARTIAL = re.compile(r"\b(planı|planını|tasarımı|projesi|başlattı|başlatmış|tamamladı|tamamlamış|başka mimar\w*|birlikte yaptı\w*)\b")
# Görüntü modeli bundan az eminse konu "other" yazılır: mühür ve kapak seçimi yanlış bir konuya dayanmasın.
PHOTO_SUBJECT_MIN = 0.5
DUPLICATE_NAME = 0.86
DUPLICATE_NEAR_M = 300
DUPLICATE_NEAR_NAME = 0.6
VISION_SIDE = 1280
STRUCTURE_MAX_TOKENS = 6000
PHOTO_MAX_TOKENS = 1500


# ── Metin ───────────────────────────────────────────────────────────────────────────────────

_TR_UPPER = str.maketrans({"İ": "i", "I": "ı"})
_PUNCT = re.compile(r"[^\w\s]", re.UNICODE)
_SPACE = re.compile(r"\s+")


def norm(text: str) -> str:
    """Karşılaştırma için: Türkçe küçük harf, tırnak/tire/boşluk farkları ve noktalama atılır."""
    text = unicodedata.normalize("NFKC", text or "").translate(_TR_UPPER).lower()
    text = _PUNCT.sub(" ", text)
    return _SPACE.sub(" ", text).strip()


_QUOTES = str.maketrans({"’": "'", "‘": "'", "`": "'", "´": "'", "“": '"', "”": '"', "„": '"', "«": '"', "»": '"', "–": "-", "—": "-", "‐": "-", "\u00a0": " "})


def qnorm(text: str) -> str:
    """Alıntı karşılaştırması: yalnızca boşluk, büyük/küçük harf ve tırnak/tire biçimi farkı yok sayılır."""
    text = unicodedata.normalize("NFKC", text or "").translate(_QUOTES).translate(_TR_UPPER).lower()
    return _SPACE.sub(" ", text).strip()


def words(text: str, least: int = 4) -> list[str]:
    return [word for word in norm(text).split() if len(word) >= least or word.isdigit()]


def _word_found(word: str, pool: set[str]) -> bool:
    """Türkçe ekler: "camii" ↔ "caminin", "yaptırdı" ↔ "yaptırılmış". Kökün ilk 4+ harfi yeter."""
    if word in pool:
        return True
    if word.isdigit():
        return False
    stem = word[: max(4, len(word) - 4)]
    return any(other.startswith(stem) or word.startswith(other[: max(4, len(other) - 4)]) for other in pool if len(other) >= 4)


def coverage(text: str, source: str) -> float:
    """`text`'in kelimelerinden ne kadarı `source`'ta geçiyor (0-1)."""
    mine = words(text)
    if not mine:
        return 1.0
    pool = set(words(source, least=1))
    return sum(_word_found(word, pool) for word in mine) / len(mine)


ELLIPSIS = re.compile(r"\s*(?:\.\.\.|…|\[\.\.\.\])\s*")
# Bir dönemin mesajda söylendiğini gösteren kelimeler: alıntıda biri geçmeli.
ERA_WORDS = {
    "selcuklu": ("selçuklu",),
    "beylikler": ("beylik",),
    "erken-osmanli": ("erken osmanlı", "erken dönem osmanlı", "kuruluş dönemi"),
    "klasik-osmanli": ("klasik osmanlı", "klasik dönem"),
    "gec-osmanli": ("geç osmanlı", "geç dönem osmanlı"),
    "cumhuriyet": ("cumhuriyet",),
}
# Modelin eksik dediği alan adı → kayıttaki yeri.
MISSING_POINTERS = {
    "district": "/location/district", "neighborhood": "/location/neighborhood", "address": "/location/address",
    "coordinates": "/location/coordinates", "start_year": "/dating/start_year", "end_year": "/dating/end_year",
    "hijri_year": "/dating/hijri_year", "century": "/dating/century", "founder": "/founder", "architect": "/architect",
    "dating": "/dating", "era": "/era", "summary": "/summary", "sections": "/sections", "inscriptions": "/inscriptions",
}
_TR_SLUG = str.maketrans({"ç": "c", "ğ": "g", "ı": "i", "ö": "o", "ş": "s", "ü": "u", "â": "a", "î": "i", "û": "u"})


def slug(text: str) -> str:
    text = unicodedata.normalize("NFKC", text or "").translate(_TR_UPPER).lower().translate(_TR_SLUG)
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


# ── Modelin cevabının biçimi ────────────────────────────────────────────────────────────────

_REF = {"message": {"type": "integer", "minimum": 1}, "quote": {"type": "string", "minLength": 1}}
_VALUE = {"type": ["object", "null"], "required": ["value", "message", "quote"], "properties": {"value": {"type": "string", "minLength": 1}, **_REF}}
STRUCTURE_SCHEMA = {
    "type": "object",
    "required": ["name", "type", "summary", "sections", "missing"],
    "properties": {
        "name": {"type": "object", "required": ["tr", "message", "quote"], "properties": {"tr": {"type": "string", "minLength": 1}, "en": {"type": ["string", "null"]}, **_REF}},
        "type": {"type": "object", "required": ["value", "message", "quote"], "properties": {"value": {"type": "string"}, **_REF}},
        "district": _VALUE,
        "neighborhood": _VALUE,
        "address": _VALUE,
        "era": _VALUE,
        "dating": {
            "type": ["object", "null"],
            "required": ["display", "confidence", "message", "quote"],
            "properties": {
                "display": {"type": "string", "minLength": 1},
                "start_year": {"type": ["integer", "null"]},
                "end_year": {"type": ["integer", "null"]},
                "hijri_year": {"type": ["integer", "null"]},
                "century": {"type": ["integer", "null"]},
                "confidence": {"enum": sorted(CONFIDENCE)},
                **_REF,
            },
        },
        "founder": {"type": ["object", "null"], "required": ["name", "confidence", "message", "quote"], "properties": {"name": {"type": "string", "minLength": 1}, "role": {"type": ["string", "null"]}, "confidence": {"enum": sorted(CONFIDENCE)}, **_REF}},
        "architect": {"type": ["object", "null"], "required": ["name", "confidence", "message", "quote"], "properties": {"name": {"type": "string", "minLength": 1}, "confidence": {"enum": sorted(CONFIDENCE)}, "others": {"type": "array", "items": {"type": "object", "required": ["name", "message", "quote"], "properties": {"name": {"type": "string", "minLength": 1}, "note": {"type": ["string", "null"]}, **_REF}}}, **_REF}},
        "summary": {"type": "object", "required": ["tr"], "properties": {"tr": {"type": "string"}, "en": {"type": ["string", "null"]}}},
        "sections": {"type": "array", "items": {"type": "object", "required": ["title", "body"], "properties": {"title": {"type": "string", "minLength": 1}, "body": {"type": "string", "minLength": 1}, "messages": {"type": "array", "items": {"type": "integer"}}}}},
        "inscriptions": {"type": "array", "items": {"type": "object", "required": ["language", "message", "quote"], "properties": {"location": {"type": ["string", "null"]}, "language": {"enum": sorted(LANGUAGES)}, "transliteration": {"type": ["string", "null"]}, "translation_tr": {"type": ["string", "null"]}, **_REF}}},
        "missing": {"type": "array", "items": {"type": "string"}},
        "conflicts": {"type": "array", "items": {"type": "object", "required": ["field", "quotes"], "properties": {"field": {"type": "string"}, "quotes": {"type": "array", "items": {"type": "string"}}}}},
    },
}


def structure_problems(answer: Any) -> list[str]:
    from jsonschema import Draft202012Validator

    validator = Draft202012Validator(STRUCTURE_SCHEMA)
    return [f"{'/'.join(map(str, error.absolute_path)) or '(kök)'}: {error.message}" for error in validator.iter_errors(answer)][:20]


# ── Denetimler ──────────────────────────────────────────────────────────────────────────────


@dataclass
class Findings:
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    missing: list[str] = field(default_factory=list)
    refs: list[dict[str, Any]] = field(default_factory=list)  # sözleşmedeki source_refs: {field, message, quote}


def check_quote(name: str, pointer: str, item: dict[str, Any], messages: list[str], values: list[Any], found: Findings) -> bool:
    """Alıntı mesajda kelimesi kelimesine mi (boşluk, büyük/küçük harf, tırnak ve tire biçimi dışında), değer
    alıntıda mı. Değilse "kaynaksız" uyarısı ve False: çağıran değeri taslağa koymaz."""
    quote, number = item.get("quote") or "", item.get("message")
    # Model birkaç cümleyi "…" ile birleştirebilir: her parça ayrı ayrı birebir aranır.
    parts = [qnorm(part) for part in ELLIPSIS.split(quote) if qnorm(part)]
    if not parts:
        found.warnings.append(f"kaynaksız: {name} için alıntı yok, taslağa eklenmedi")
        return False
    texts = [qnorm(text) for text in messages]

    def holds(text: str) -> bool:
        return all(part in text for part in parts)

    where = number if isinstance(number, int) and 1 <= number <= len(messages) and holds(texts[number - 1]) else None
    if where is None:
        where = next((index + 1 for index, text in enumerate(texts) if holds(text)), None)
    if where is None and all(any(part in text for text in texts) for part in parts):
        where = next(index + 1 for index, text in enumerate(texts) if parts[0] in text)
    if where is None:
        found.warnings.append(f"kaynaksız: {name}, alıntı mesajlarda birebir geçmiyor, taslağa eklenmedi: \"{quote[:120]}\"")
        return False
    for value in values:
        if value is None or value == "":
            continue
        text = str(value)
        if isinstance(value, int) or text.isdigit():
            if text not in re.findall(r"\d+", quote):
                found.warnings.append(f"kaynaksız: {name}, '{text}' alıntıda geçmiyor, taslağa eklenmedi")
                return False
        elif coverage(text, quote) < 1.0:
            found.warnings.append(f"kaynaksız: {name}, '{text[:80]}' alıntıda geçmiyor, taslağa eklenmedi")
            return False
    found.refs.append({"field": pointer, "message": where - 1, "quote": quote[:500]})
    return True


def facts(text: str) -> list[str]:
    """Metnin olguları: sayılar ve büyük harfle başlayan bütün kelimeler (cümle başındakiler de: bir
    özel ad Türkçede çoğu zaman cümleyi açar), dolgu kelimeleri dışında."""
    found: list[str] = []
    for match in re.finditer(r"\w+", text or ""):
        word = match.group(0)
        if word.isdigit() or (word[0].isupper() and norm(word) not in FILLER):
            found.append(word)
    return found


def grounded_text(name: str, text: str, source: str, found: Findings) -> bool:
    """Bölüm ya da özet: sayıları ve özel adları mesajlarda geçmeli (yeni yıl, kişi, yer eklenemez);
    öbür kelimelerin (dolgu dışında) en az %60'ı mesajlarda olmalı. Değilse taslağa girmez."""
    pool = set(words(source, least=1))
    # Kısa bir kelime ("İç") mesajda ekiyle geçer ("İçi"): kök eşleşmesi 4 harften kısa kelimelere bakmaz.
    new = [word for word in facts(text) if not (_word_found(norm(word), pool) or (len(norm(word)) < 4 and any(other.startswith(norm(word)) for other in pool)))]
    if new:
        shown = ", ".join(dict.fromkeys(new))
        found.warnings.append(f"kaynaksız: {name}, mesajlarda olmayan ad ya da sayı var ({shown[:120]}); taslağa eklenmedi")
        return False
    prose = " ".join(word for word in norm(text).split() if word not in FILLER)
    share = coverage(prose, source)
    if share < COVERAGE_MIN:
        found.warnings.append(f"kaynaksız: {name}, kelimelerin yalnızca %{round(share * 100)}'i mesajlarda var; taslağa eklenmedi")
        return False
    return True


def _without_title(text: str) -> str:
    """İlk satır noktalamasız bir başlıksa (eserin adı) onsuz metin."""
    text = text.strip()
    lines = text.split("\n", 1)
    first = lines[0].strip()
    # Bir başlık: kısa, noktalamasız, sayısız ("Muradiye Camii"). "Cami 1583'te yapıldı" bir cümledir.
    if len(lines) == 2 and lines[1].strip() and len(first) <= 60 and len(first.split()) <= 6 and not re.search(r"[.!?,;:\d]", first):
        return lines[1].strip()
    return text


def told_text(messages: list[str], limit: int = 6000) -> str:
    """Mesajların kendisi, başlık satırı ve "Alan: …" cevapları dışında: modelin bölümleri kalmadığında."""
    parts = []
    for index, text in enumerate(messages):
        text = _without_title(text) if index == 0 else text.strip()
        lines = [line.strip() for line in text.split("\n") if line.strip() and not is_answer_line(line.strip())]
        if lines:
            parts.append(" ".join(lines))
    return "\n\n".join(parts)[:limit].strip()


UNKNOWN = re.compile(r"^\s*(bilinmiyor|bilinmemektedir|belli değil|belirsiz|yok|bilgi yok)\b", re.I)
INSCRIPTION_LABEL = re.compile(r"^kitabe (\d+)$")


def answer_field(head: str) -> str | None:
    """Bir cevap satırının başlığı ("Mimar", "Kitabeler", "Kitabe 2") → taslaktaki alan. Adlar panelle aynı
    tablodan (sözleşmenin INTAKE_FIELD_NAMES'i); "Mimar" hem /architect hem /architect/name'dir, kısası seçilir."""
    key = norm(head)
    match = INSCRIPTION_LABEL.match(key)
    if match:
        return f"/inscriptions/{int(match.group(1)) - 1}"
    pointers = [pointer for pointer, label in field_names().items() if norm(label) == key]
    return min(pointers, key=len) if pointers else None


def is_answer_line(line: str) -> bool:
    head, sep, _ = line.partition(":")
    return bool(sep) and answer_field(head) is not None


def told_unknown(messages: list[str]) -> list[tuple[str, str]]:
    """Yetkilinin "bilinmiyor" dediği alanlar ("Mimar: Bilinmiyor; kitabede adı geçmiyor."): soru kapanır.
    Sonraki bir mesaj o alanı yeniden anıyorsa (adıyla ya da "Mimar: …" cevabıyla) kapanmaz: yeni bilgi
    gelmiş olabilir, model onu alıntılayamadıysa soru durmalı."""
    found: list[tuple[str, str]] = []
    for index, text in enumerate(messages):
        for line in text.split("\n"):
            head, sep, rest = line.strip().partition(":")
            pointer = answer_field(head) if sep else None
            if not pointer or not UNKNOWN.match(rest):
                continue
            word = norm(head).split()[0]
            later = any(word in norm(other) for other in messages[index + 1 :])
            if not later:
                found.append((pointer, head.strip()))
    return found


def first_sentence(messages: list[str], limit: int = 400) -> str:
    """İlk mesajın ilk cümlesi. İlk satır noktalamasız bir başlıksa (eserin adı) o atlanır."""
    for text in messages:
        text = _without_title(text)
        if text:
            match = re.match(r"(.+?[.!?])(\s|$)", text, re.S)
            return (match.group(1) if match else text)[:limit].strip()
    return ""


# ── Fotoğraf ────────────────────────────────────────────────────────────────────────────────


def exif_location(path: Path) -> tuple[float, float] | None:
    """Fotoğrafın EXIF'indeki GPS (enlem, boylam), yoksa None. İşlenmiş dosyada yoktur: orijinal okunur."""
    try:
        from PIL import Image

        with Image.open(path) as image:
            gps = image.getexif().get_ifd(0x8825)
    except Exception:  # noqa: BLE001 — okunamayan dosya konumsuz sayılır
        return None
    if not gps or 2 not in gps or 4 not in gps:
        return None

    def degrees(parts, ref):
        value = float(parts[0]) + float(parts[1]) / 60 + float(parts[2]) / 3600
        return -value if ref in ("S", "W") else value

    try:
        return degrees(gps[2], gps.get(1, "N")), degrees(gps[4], gps.get(3, "E"))
    except (TypeError, ValueError, ZeroDivisionError, IndexError):
        return None


def small_jpeg(path: Path, side: int = VISION_SIDE) -> bytes:
    """Görüntü modeline giden kopya: en uzun kenar `side`, JPEG; konum bilgisi taşımaz."""
    from PIL import Image, ImageOps

    with Image.open(path) as image:
        image = ImageOps.exif_transpose(image).convert("RGB")
        image.thumbnail((side, side))
        out = io.BytesIO()
        image.save(out, "JPEG", quality=85)
        return out.getvalue()


def distance_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lng1, lat2, lng2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    return 6371000 * 2 * math.asin(math.sqrt(h))


# ── Adım ────────────────────────────────────────────────────────────────────────────────────


def load_prompt(name: str) -> tuple[str, str]:
    """İstem dosyası: ilk satır `version: …`, gerisi metin."""
    text = (PROMPTS / name).read_text(encoding="utf-8")
    first, _, rest = text.partition("\n")
    if not first.startswith("version:"):
        raise ValueError(f"{name}: ilk satır 'version: …' olmalı")
    return first.split(":", 1)[1].strip(), rest.strip()


@dataclass
class KnownAsset:
    id: str
    name: str
    city: str
    lat: float | None
    lng: float | None


def known_assets_from_db(conn) -> list[KnownAsset]:
    """Yerel veritabanındaki eserler (yalnızca okuma): tekrar uyarısı ve id çakışması için."""
    rows = conn.execute("select id, name_tr, city_code, lat, lng from public.asset").fetchall()
    return [KnownAsset(*row) for row in rows]


class ChatStages:
    """Sohbet işinin tek adımı: mesajlar + fotoğraflar → tek taslak (`entry_key = 'chat'`)."""

    def __init__(self, evren: Evren, known: Callable[[], list[KnownAsset]], today: Callable[[], dt.date] = dt.date.today):
        self.evren = evren
        self.known = known
        self.today = today

    # Kitap adımları bu sınıfın işi değil.
    def map_book(self, job):
        raise NotImplementedError("Kitap haritası (H2) henüz yok")

    def draft_entry(self, job, entry):
        raise NotImplementedError("Kitap taslağı (H4) henüz yok")

    def draft_chat(self, job: dict[str, Any]) -> Draft:
        started = time.monotonic()
        chat = job["input"] or {}
        messages = [message["text"] for message in chat.get("messages", [])]
        if not messages or not any(text.strip() for text in messages):
            raise ValueError("Sohbette mesaj yok")
        city = job["city"]
        cache = self.known()
        self.known_now = lambda: cache  # bu taslak boyunca bir kez okunur
        answer, model, repaired, version = self._structure(messages)
        found = Findings()
        record = self._record(job, answer, messages, found)
        media, record_media = self._photos(chat.get("files", []), record, found)
        record["media"] = record_media
        self._locate(chat.get("files", []), record, found)
        duplicate = self._duplicate(record, city, chat.get("assetId"), found)
        errors, warnings = self._validate(record)
        validation: dict[str, Any] = {"errors": found.errors + errors, "warnings": found.warnings + [w for w in warnings if w not in found.warnings]}
        for pointer, label in told_unknown(messages):
            if any(m == pointer or m.startswith(pointer + "/") for m in found.missing):
                found.missing = [m for m in found.missing if not (m == pointer or m.startswith(pointer + "/"))]
                validation["warnings"].append(f"{label}: yetkili bilinmediğini yazdı; boş kalıyor")
        if supports_missing():
            validation["missing"] = found.missing
        else:
            validation["warnings"] += [f"eksik: {pointer}" for pointer in found.missing]
        return Draft(
            asset_id=record["id"],
            record=record,
            media=media,
            source_refs=found.refs if supports_message_refs() else [],
            validation=clip_validation(validation),
            ai={"model": model, "promptVersion": version, "confidence": None, "repaired": repaired, "ms": int((time.monotonic() - started) * 1000)},
            duplicate_of=duplicate,
        )

    def _structure(self, messages: list[str]) -> tuple[dict[str, Any], str, bool, str]:
        version, system = load_prompt("asset-structure.md")
        user = "\n\n".join(f"### Mesaj {index + 1}\n{text.strip()}" for index, text in enumerate(messages))
        conversation = [{"role": "system", "content": system}, {"role": "user", "content": user}]
        reply = self.evren.chat(conversation, max_tokens=STRUCTURE_MAX_TOKENS)
        problems: list[str]
        try:
            answer = parse_json(reply.text)
            problems = structure_problems(answer)
        except LlmError as error:
            answer, problems = None, [str(error)]
        if not problems:
            return answer, reply.model, False, version
        # Bir kez düzeltme: aynı konuşma, hatalar listelenerek.
        conversation += [
            {"role": "assistant", "content": reply.text[:20000]},
            {"role": "user", "content": "Cevabın istenen biçime uymuyor:\n- " + "\n- ".join(problems) + "\nYalnızca düzeltilmiş JSON nesnesini döndür."},
        ]
        fixed = self.evren.chat(conversation, max_tokens=STRUCTURE_MAX_TOKENS)
        answer = parse_json(fixed.text)
        problems = structure_problems(answer)
        if problems:
            raise ValueError("Model cevabı düzeltmeden sonra da biçime uymuyor: " + "; ".join(problems[:5]))
        return answer, fixed.model, True, version

    def _record(self, job: dict[str, Any], answer: dict[str, Any], messages: list[str], found: Findings) -> dict[str, Any]:
        city = job["city"]
        all_text = "\n".join(messages)
        today = self.today().isoformat()
        ref = lambda item: [{"source_id": CHAT_SOURCE, "pages": f"mesaj {item.get('message')}"}]  # noqa: E731
        for name in answer.get("missing", []):
            if isinstance(name, str) and name.strip():
                pointer = MISSING_POINTERS.get(name.strip().strip("/"), "/" + name.strip().strip("/").replace(".", "/"))
                if pointer not in found.missing:
                    found.missing.append(pointer)

        # Sert kural (plan §7, "Alıntı kuralı"): alıntısı mesajda kelimesi kelimesine geçmeyen değer taslağa
        # girmez, "kaynaksız" uyarısı olur. Silinemeyen tek zorunlu alan, ad: kalır ama onayı engeller.
        name = answer["name"]
        if not check_quote("name", "/name/tr", name, messages, [name["tr"]], found):
            found.errors.append("name: eserin adı mesajlarda bulunamadı; adı mesajdaki gibi düzelt")
        kind = answer["type"]["value"]
        if kind not in ASSET_TYPES:
            found.warnings.append(f"type: '{kind}' tür listesinde yok, 'diger' yazıldı")
            kind = "diger"
        elif not check_quote("type", "/type", answer["type"], messages, [], found):
            kind = "diger"

        location: dict[str, Any] = {"region": CITY_REGION.get(city, ""), "city": city, "district": ""}
        district = answer.get("district")
        if district and check_quote("district", "/location/district", district, messages, [district["value"]], found):
            location["district"] = slug(district["value"])
        elif "/location/district" not in found.missing:
            found.missing.append("/location/district")
        for key in ("neighborhood", "address"):
            item = answer.get(key)
            location[key] = item["value"] if item and check_quote(key, f"/location/{key}", item, messages, [item["value"]], found) else None

        era = answer.get("era")
        era_code = None
        if era:
            if era["value"] not in ERAS:
                found.warnings.append(f"era: '{era['value']}' dönem listesinde yok, boş bırakıldı")
            elif not any(qnorm(word) in qnorm(era.get("quote") or "") for word in ERA_WORDS.get(era["value"], ())):
                found.warnings.append(f"kaynaksız: era '{era['value']}' alıntıda adıyla söylenmiyor, model tahmin etmiş olabilir; boş bırakıldı")
            elif check_quote("era", "/era", era, messages, [], found):
                era_code = era["value"]

        dating = answer.get("dating")
        dating_record = None
        if dating:
            years = [dating.get(key) for key in ("start_year", "end_year", "hijri_year")]
            if check_quote("dating", "/dating", dating, messages, years, found):
                dating_record = {
                    "display": {"tr": dating["display"], "en": None},
                    "start_year": dating.get("start_year"),
                    "end_year": dating.get("end_year"),
                    "hijri_year": dating.get("hijri_year"),
                    "century": dating.get("century"),
                    "confidence": dating["confidence"],
                    "source_refs": ref(dating),
                }

        people = {}
        for key in ("founder", "architect"):
            item = answer.get(key)
            people[key] = None
            # "Mimar Sinan, Mimar Mahmud Ağa, Mimar Davud Ağa": bir alanda bir kişi. İlki ad, öbürleri aday.
            if key == "architect" and item and isinstance(item.get("name"), str) and ", " in item["name"]:
                parts = [part.strip() for part in item["name"].split(",") if part.strip()]
                if parts:
                    item = {**item, "name": parts[0], "others": [*(item.get("others") or []), *({"name": n, "message": item.get("message"), "quote": item.get("quote")} for n in parts[1:])]}
            if item and check_quote(key, f"/{key}/name", item, messages, [item["name"]], found):
                confidence = item["confidence"]
                # "Planı Sinan'ın; inşaatı başka mimarlar yürüttü": işin bir kısmı. Kesin denemez.
                if key == "architect" and confidence == "certain" and PARTIAL.search(qnorm(item.get("quote") or "")):
                    confidence = "probable"
                    found.warnings.append(f"{key}: alıntı işin yalnızca bir kısmını söylüyor; güven 'probable' yapıldı")
                person = {"name": item["name"], "confidence": confidence, "source_refs": ref(item)}
                if key == "founder" and item.get("role"):
                    person["role"] = item["role"]
                if key == "architect":
                    others = []
                    for other in item.get("others") or []:
                        if isinstance(other, dict) and other.get("name") and check_quote(f"architect[{other['name']}]", "/architect/candidates", other, messages, [other["name"]], found):
                            others.append({"name": other["name"], **({"note": other["note"]} if other.get("note") else {})})
                    if others:
                        person["candidates"] = others
                people[key] = person

        summary = (answer.get("summary") or {}).get("tr", "").strip()
        if summary and not grounded_text("summary", summary, all_text, found):
            summary = ""
        if not summary:
            # Mesajın kendi ilk cümlesi: kaynağı belli, uzman sonra düzeltir.
            summary = first_sentence(messages)
            if summary:
                found.warnings.append("summary: modelin özeti kullanılmadı; ilk mesajın ilk cümlesi yazıldı")
            else:
                found.missing.append("/summary")

        sections, seen = [], set()
        for section in answer.get("sections", []):
            if not grounded_text(f"sections[{section['title']}]", section["body"], all_text, found):
                continue
            order = len(sections) + 1
            section_id = slug(section["title"]) or f"bolum-{order}"
            while section_id in seen:
                section_id += "-2"
            seen.add(section_id)
            numbers = [number for number in section.get("messages", []) if isinstance(number, int)] or [1]
            sections.append({
                "id": section_id,
                "order": order,
                "title": {"tr": section["title"], "en": None},
                "body": {"tr": section["body"], "en": None},
                "confidence": "certain",
                "source_refs": [{"source_id": CHAT_SOURCE, "pages": "mesaj " + ", ".join(map(str, sorted(set(numbers))))}],
            })
        if not sections:
            # Bölümlerin hiçbiri denetimden geçmedi: mesajların kendisi tek bölüm olur (kaynağı belli, şema
            # boş bölüm listesini kabul etmez). Uzman onaylarken bölümlere ayırır.
            told = told_text(messages)
            if told:
                sections.append({
                    "id": "genel-bakis",
                    "order": 1,
                    "title": {"tr": "Genel Bakış", "en": None},
                    "body": {"tr": told, "en": None},
                    "confidence": "certain",
                    "source_refs": [{"source_id": CHAT_SOURCE, "pages": "mesaj " + ", ".join(str(i + 1) for i, t in enumerate(messages) if t.strip())}],
                })
                found.warnings.append("sections: modelin bölümleri kullanılmadı; mesajların kendisi tek bölüm olarak yazıldı")
            else:
                found.missing.append("/sections")

        inscriptions = []
        for item in answer.get("inscriptions", []):
            number = len(inscriptions) + 1
            if not check_quote(f"inscriptions[{number}]", f"/inscriptions/{number - 1}", item, messages, [], found):
                continue
            inscriptions.append({
                "id": f"kitabe-{number}",
                "location": {"tr": item.get("location") or "Belirtilmedi", "en": None},
                "language": item["language"],
                "transliteration": item.get("transliteration"),
                "translation": {"tr": item["translation_tr"], "en": None} if item.get("translation_tr") else None,
                "source_refs": ref(item),
            })
        for conflict in answer.get("conflicts", []):
            found.warnings.append(f"{conflict['field']}: mesajlar çelişiyor: " + " | ".join(f"\"{quote[:100]}\"" for quote in conflict["quotes"]))

        chat = job.get("input") or {}
        proposed = chat.get("assetId") or "-".join(part for part in (city, location["district"], slug(name["tr"])) if part)
        todos = ["Sohbetten düzenlendi: her alanı mesajla karşılaştırıp onayla."]
        todos += [f"Eksik: {pointer}" for pointer in found.missing]
        return {
            "schema_version": "1.0",
            "id": proposed,
            "meta": {
                "status": "draft",
                "created_at": today,
                "updated_at": today,
                "prepared_by": "veri-dongusu",
                "reviewed_by": None,
                "from": "panel-sohbet",
                "text_origin": f"Yönetim panelindeki sohbetten (iş {job['id']}) düzenlendi; mesajlarda olmayan bilgi eklenmedi.",
                "todos": todos,
            },
            "name": {"tr": name["tr"], "en": name.get("en")},
            "type": kind,
            "era": era_code,
            "location": location,
            "dating": dating_record,
            "founder": people["founder"],
            "architect": people["architect"],
            "summary": {"tr": summary or name["tr"], "en": (answer.get("summary") or {}).get("en")},
            "sections": sections,
            "inscriptions": inscriptions,
            "accessibility": {"wheelchair_access": "unknown", "step_free_entrance": "unknown", "ramp": "unknown", "accessible_toilet": "unknown", "verified": False, "notes": None},
            "media": [],
        }

    def _photos(self, files: list[dict[str, Any]], record: dict[str, Any], found: Findings) -> tuple[list[dict], list[dict]]:
        version, template = load_prompt("photo-subject.md")
        subjects = photo_subjects()
        prompt = template.replace("{subjects}", ", ".join(subjects)).replace("{name}", record["name"]["tr"]).replace("{type}", record["type"])
        media, record_media = [], []
        for file in files:
            if not file.get("key"):
                found.warnings.append(f"fotoğraf '{file.get('name')}': henüz işlenmedi (key yok), taslağa eklenmedi")
                continue
            subject, confidence, alt, inscription = None, None, None, False
            try:
                reply = self.evren.vision(prompt, small_jpeg(REPO / file["path"] if not Path(file["path"]).is_absolute() else Path(file["path"])), max_tokens=PHOTO_MAX_TOKENS)
                seen = parse_json(reply.text)
                subject = seen.get("subject") if seen.get("subject") in subjects else "other"
                confidence = min(1.0, max(0.0, float(seen.get("confidence") or 0)))
                if seen.get("building") is False or confidence < PHOTO_SUBJECT_MIN:
                    subject = "other"
                alt = (seen.get("alt_tr") or "").strip()[:600] or None
                inscription = bool(seen.get("inscription"))
            except (LlmError, OSError, ValueError, TypeError) as error:
                found.warnings.append(f"fotoğraf '{file.get('name')}': konusu okunamadı ({type(error).__name__})")
            number = len(record_media) + 1
            media.append({"key": file["key"], "width": file.get("width") or 1, "height": file.get("height") or 1, "subject": subject, "subjectConfidence": confidence, "alt": alt, "caption": None, "pdfPage": None, "arTargetCandidate": inscription})
            record_media.append({
                "id": f"m{number:02d}",
                "type": "photo",
                "is_cover": False,
                "order": number,
                "source": {"provider": "local", "path": file["path"], "original_name": file.get("name") or file["path"].rsplit("/", 1)[-1]},
                **({"subject": subject} if subject else {}),
                "caption": {"tr": record["name"]["tr"], "en": None},
                "alt": {"tr": alt or f"{record['name']['tr']} fotoğrafı", "en": None},
                "credit": "Vagabonds yönetim paneli",
                "license": "belirsiz",
            })
        if record_media:
            cover = next((item for item in record_media if item.get("subject") in ("exterior", "aerial")), record_media[0])
            cover["is_cover"] = True
            record["meta"]["todos"].append("Fotoğrafların lisansı ve çekeni (credit) yazılmadı; onaylarken doldur. Alt metinleri model önerdi, kontrol et.")
        return media, record_media

    def _locate(self, files: list[dict[str, Any]], record: dict[str, Any], found: Findings) -> None:
        for file in files:
            path = Path(file["path"]) if Path(file["path"]).is_absolute() else REPO / file["path"]
            spot = exif_location(path)
            if spot is None:
                continue
            lat, lng = spot
            if not (35.5 <= lat <= 42.5 and 25.5 <= lng <= 45.0):
                found.warnings.append(f"fotoğraf '{file.get('name')}': konumu Türkiye dışında ({lat:.4f}, {lng:.4f}), kullanılmadı")
                continue
            record["location"]["coordinates"] = {"lat": round(lat, 6), "lng": round(lng, 6), "source": "photo_exif", "verified": False, "verification_note": f"'{file.get('name')}' fotoğrafının konum bilgisinden; fotoğraf eserin yanında çekilmemiş olabilir"}
            return
        if "/location/coordinates" not in found.missing:
            found.missing.append("/location/coordinates")

    def _duplicate(self, record: dict[str, Any], city: str, target: str | None, found: Findings) -> str | None:
        name = norm(record["name"]["tr"])
        spot = record["location"].get("coordinates")
        best: tuple[float, str] | None = None
        for asset in self.known_now():
            if asset.id == target:
                continue
            similar = SequenceMatcher(None, name, norm(asset.name or "")).ratio()
            near = spot and asset.lat is not None and asset.lng is not None and distance_m((spot["lat"], spot["lng"]), (asset.lat, asset.lng)) <= DUPLICATE_NEAR_M
            if asset.id == record["id"] or (asset.city == city and similar >= DUPLICATE_NAME) or (near and similar >= DUPLICATE_NEAR_NAME):
                if best is None or similar > best[0]:
                    best = (similar, asset.id)
        if best:
            found.warnings.append(f"zaten var olabilir: {best[1]} (ad benzerliği %{round(best[0] * 100)})")
            return best[1]
        return None

    def _validate(self, record: dict[str, Any]) -> tuple[list[str], list[str]]:
        schema_errors = [f"{'/'.join(map(str, error.absolute_path)) or '(kök)'}: {error.message}" for error in dataset.VALIDATOR.iter_errors(record)]
        if schema_errors:
            return schema_errors[:200], []
        known_ids = {asset.id for asset in self.known_now()}
        errors, warnings = dataset.cross_check(record, Path(f"{record['id']}.json"), known_ids)
        return errors[:200], warnings[:200]
