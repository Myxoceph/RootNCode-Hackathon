#!/usr/bin/env python3
"""Eser JSON'larındaki fotoğrafları yayına hazırlar.

Kullanım:
    pip install pillow certifi
    python3 data/tools/media_pipeline.py                 # tüm eserler
    python3 data/tools/media_pipeline.py bursa-osmangazi-ulucami

Her media[] / archive_media[] kaydı için:
  1. Orijinali kaynaktan (Google Drive) indirir → data/build/cache/ (tekrar indirmez)
  2. sha256 hesaplar (içerik kimliği; aynı dosya iki kez yüklenmez)
  3. EXIF yönünü uygular, boyutları ve EXIF'teki çekim tarihi + GPS'i okur
  4. 480 / 1280 / 2560 px genişlikte WebP + JPEG sürümler üretir (büyütmez),
     tüm metadata'yı (GPS dahil) siler
  5. Yer tutucu (LQIP, 16 px) ve baskın renk üretir
  6. data/build/media/ altına depolama yoluyla aynı düzende yazar ve
     data/build/media-manifest.json'u günceller

Git'e yalnızca build/media-manifest.json girer; görseller (build/media, build/cache) girmez.
Repoyu yeni çeken biri bu betiği çalıştırınca manifestteki görseller aynı yollarla yeniden
üretilir; manifest değişmez. Yeni ya da değişen fotoğraf varsa manifest güncellenir ve commit edilir.
Depolamaya yükleme: `rclone sync data/build/media <remote>:<bucket>` ya da `aws s3 sync`.
"""
import base64
import hashlib
import io
import json
import ssl
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageOps

DATA = Path(__file__).resolve().parent.parent
BUILD = DATA / "build"
CACHE = BUILD / "cache" / "originals"
OUT = BUILD / "media"
MANIFEST = BUILD / "media-manifest.json"

WIDTHS = [480, 1280, 2560]
FORMATS = {"webp": {"quality": 80, "method": 6}, "jpg": {"quality": 82, "optimize": True, "progressive": True}}
PIPELINE_VERSION = 2

Image.MAX_IMAGE_PIXELS = 200_000_000  # envanter fotoğrafları 50 MP'yi aşabiliyor

try:  # python.org kurulumlu macOS'ta sistem sertifikaları görünmüyor
    import certifi
    SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CTX = ssl.create_default_context()


def download(source):
    if source["provider"] != "google_drive":
        raise ValueError(f"desteklenmeyen kaynak: {source['provider']}")
    target = CACHE / source["file_id"]
    if target.exists():
        return target.read_bytes()
    url = f"https://drive.usercontent.google.com/download?id={source['file_id']}&export=download&confirm=t"
    with urllib.request.urlopen(url, timeout=120, context=SSL_CTX) as resp:
        data = resp.read()
    if data[:15].lower().startswith(b"<!doctype html") or data[:5].lower() == b"<html":
        raise RuntimeError("Drive dosya yerine HTML döndürdü (paylaşım izni ya da kota)")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return data


def read_exif(img):
    exif = img.getexif()
    info = {"captured_at": None, "gps": None, "camera": None}
    sub = exif.get_ifd(0x8769)
    raw_date = sub.get(36867) or exif.get(306)  # DateTimeOriginal, sonra DateTime
    if raw_date:
        try:
            info["captured_at"] = datetime.strptime(str(raw_date).strip(), "%Y:%m:%d %H:%M:%S").isoformat()
        except ValueError:
            pass
    gps = exif.get_ifd(0x8825)
    if gps.get(2) and gps.get(4):
        def deg(v, ref):
            x = float(v[0]) + float(v[1]) / 60 + float(v[2]) / 3600
            return round(-x if ref in ("S", "W") else x, 6)
        lat, lng = deg(gps[2], gps.get(1, "N")), deg(gps[4], gps.get(3, "E"))
        if lat or lng:  # bazı dosyalarda GPS alanı var ama 0,0 (konum yok demek)
            info["gps"] = {"lat": lat, "lng": lng}
    make, model = exif.get(271), exif.get(272)
    if make or model:
        info["camera"] = " ".join(str(x).strip() for x in (make, model) if x)
    return info


def encode(img, fmt):
    buf = io.BytesIO()
    img.save(buf, "WEBP" if fmt == "webp" else "JPEG", **FORMATS[fmt])
    return buf.getvalue()


def process(asset_id, item):
    source = item["source"]
    original = download(source)
    sha = hashlib.sha256(original).hexdigest()

    img = Image.open(io.BytesIO(original))
    exif = read_exif(img)
    orig_format = (img.format or "").lower()
    img = ImageOps.exif_transpose(img).convert("RGB")
    width, height = img.size

    # İçerik değişirse yol da değişir → CDN'de "immutable" önbellek güvenli.
    base = f"assets/{asset_id}/{item['id']}-{sha[:10]}"
    variants = []
    for w in WIDTHS:
        if w > width and variants:
            break
        w = min(w, width)
        resized = img if w == width else img.resize((w, round(height * w / width)), Image.LANCZOS)
        for fmt in FORMATS:
            key = f"{base}/{w}.{fmt}"
            data = encode(resized, fmt)
            (OUT / key).parent.mkdir(parents=True, exist_ok=True)
            (OUT / key).write_bytes(data)
            variants.append({"key": key, "format": fmt, "width": resized.width, "height": resized.height, "bytes": len(data)})

    tiny = img.resize((16, max(1, round(16 * height / width))), Image.LANCZOS)
    lqip = "data:image/webp;base64," + base64.b64encode(encode(tiny, "webp")).decode()
    r, g, b = img.resize((1, 1), Image.LANCZOS).getpixel((0, 0))

    return {
        "sha256": sha,
        "source": source,
        "original": {
            "key": f"originals/{sha}.{'jpg' if orig_format == 'jpeg' else orig_format}",
            "format": orig_format,
            "width": width,
            "height": height,
            "bytes": len(original),
        },
        "aspect_ratio": round(width / height, 4),
        "variants": variants,
        "lqip": lqip,
        "dominant_color": f"#{r:02x}{g:02x}{b:02x}",
        "exif": exif,
        "pipeline_version": PIPELINE_VERSION,
        "processed_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


def main(argv):
    files = sorted((DATA / "eserler").rglob("*.json"))
    if argv:
        files = [f for f in files if f.stem in argv]
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else {}
    failed = 0

    for f in files:
        rec = json.loads(f.read_text(encoding="utf-8"))
        asset_id = rec["id"]
        entry = manifest.setdefault(asset_id, {})
        for item in rec["media"] + rec.get("archive_media", []):
            if item["type"] not in ("photo", "archive_photo", "drawing"):
                continue
            prev = entry.get(item["id"])
            up_to_date = prev and prev["source"] == item["source"] and prev["pipeline_version"] == PIPELINE_VERSION
            if up_to_date and all((OUT / v["key"]).exists() for v in prev["variants"]):
                print(f"  = {asset_id}/{item['id']} (değişmedi)")
                continue
            try:
                result = process(asset_id, item)
                if up_to_date and result["sha256"] == prev["sha256"]:
                    # Manifest git'ten geldi, dosyalar bu makinede yoktu: aynı yollarla yeniden üretildi,
                    # manifest olduğu gibi kalır (gereksiz git farkı oluşmaz).
                    print(f"  ↻ {asset_id}/{item['id']} (dosyalar manifestteki yollarla yeniden üretildi)")
                    continue
                entry[item["id"]] = result
                m = entry[item["id"]]
                print(f"  ✓ {asset_id}/{item['id']}  {m['original']['width']}×{m['original']['height']}  "
                      f"{m['original']['bytes'] // 1024} KB → {len(m['variants'])} sürüm")
            except Exception as e:  # tek bir dosya tüm işi durdurmasın
                failed += 1
                print(f"  ✗ {asset_id}/{item['id']}: {e}")
        # JSON'dan silinmiş medyaları manifestten de çıkar
        live = {m["id"] for m in rec["media"] + rec.get("archive_media", [])}
        for stale in set(entry) - live:
            del entry[stale]

    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"manifest: {MANIFEST.relative_to(DATA)}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main(sys.argv[1:])
