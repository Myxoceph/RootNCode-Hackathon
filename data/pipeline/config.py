"""Veri Döngüsü hattının ayarları: API ile aynı ortam değişkenleri, aynı `.env` dosyasından.

Değerler önce ortamdan okunur; ortamda yoksa `apps/api/.env`'den. Böylece worker'ı ayrıca
ayarlamak gerekmez ve API ile hat aynı veritabanını, aynı EVREN anahtarını kullanır.
Hiçbir değer (özellikle anahtar) yazdırılmaz.
"""

from __future__ import annotations

import os
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
API_ENV = REPO / "apps" / "api" / ".env"
# Kitap PDF'leri ve çıkan fotoğraflar: git'e girmez (data/.gitignore: build/cache, build/media).
INTAKE_CACHE = REPO / "data" / "build" / "cache" / "intake"
MEDIA_ROOT = REPO / "data" / "build" / "media"
PROMPTS = Path(__file__).resolve().parent / "prompts"


def read_env_file(path: Path) -> dict[str, str]:
    """`KEY=VALUE` satırları; yorumlar, boş satırlar ve `export ` öneki atlanır, tırnaklar soyulur."""
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[len("export "):]
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        elif " #" in value:
            value = value.split(" #", 1)[0].rstrip()
        values[key] = value
    return values


def load_env(path: Path = API_ENV) -> dict[str, str]:
    """Ortam, `.env`'in üstüne yazar: komutun başına verilen değer dosyadakini geçersiz kılar."""
    merged = read_env_file(path)
    merged.update(os.environ)
    return merged
