#!/usr/bin/env python3
"""Eser JSON dosyalarını doğrular.

Kullanım:
    pip install jsonschema
    python3 data/tools/validate.py              # data/eserler altındaki tüm dosyalar
    python3 data/tools/validate.py dosya.json   # tek dosya

İki aşama:
  1. JSON Schema (data/schema/eser.schema.json): alanlar, tipler, zorunlular.
  2. Çapraz kontroller: kod alanları enums.json'da var mı, source_id'ler
     sources.json'da var mı, id'ler tekrar ediyor mu, ilişki hedefleri mevcut mu.
"""
import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator

DATA = Path(__file__).resolve().parent.parent
ENUMS = json.loads((DATA / "enums.json").read_text(encoding="utf-8"))
SOURCES = json.loads((DATA / "sources.json").read_text(encoding="utf-8"))
SCHEMA = json.loads((DATA / "schema" / "eser.schema.json").read_text(encoding="utf-8"))
VALIDATOR = Draft202012Validator(SCHEMA)


def codes(name):
    return {item["code"] for item in ENUMS[name]}


SOURCE_IDS = {s["id"] for s in SOURCES["sources"]}


def iter_source_refs(node):
    """Kayıt içindeki tüm source_refs dizilerini ve tekil source_id alanlarını gezer."""
    if isinstance(node, dict):
        for key, value in node.items():
            if key == "source_refs":
                for ref in value:
                    yield ref["source_id"]
            elif key == "source_id" and isinstance(value, str):
                yield value
            else:
                yield from iter_source_refs(value)
    elif isinstance(node, list):
        for item in node:
            yield from iter_source_refs(item)


def cross_check(rec, path, all_ids):
    errors, warnings = [], []

    def check(value, enum_name, where):
        if value is not None and value not in codes(enum_name):
            errors.append(f"{where}: '{value}' {enum_name} listesinde yok (enums.json)")

    # Dosya adı = id
    if path.stem != rec["id"]:
        errors.append(f"dosya adı '{path.stem}' ile id '{rec['id']}' aynı olmalı")

    loc = rec["location"]
    check(loc["region"], "regions", "location.region")
    check(loc["city"], "cities", "location.city")
    city = next((c for c in ENUMS["cities"] if c["code"] == loc["city"]), None)
    if city and city["region"] != loc["region"]:
        errors.append(f"location.region '{loc['region']}', {loc['city']} ilinin bölgesi değil ({city['region']})")
    if not rec["id"].startswith(loc["city"] + "-"):
        errors.append(f"id '{loc['city']}-' ile başlamalı")
    if not loc["coordinates"]["verified"]:
        warnings.append("koordinat doğrulanmamış")

    check(rec["type"], "asset_types", "type")
    for t in rec.get("secondary_types", []):
        check(t, "asset_types", "secondary_types")
    check(rec.get("era"), "eras", "era")
    for i, ev in enumerate(rec.get("timeline", [])):
        check(ev["type"], "timeline_event_types", f"timeline[{i}].type")
    for i, rel in enumerate(rec.get("relations", [])):
        check(rel["type"], "relation_types", f"relations[{i}].type")
        if rel["target_id"] not in all_ids:
            warnings.append(f"relations[{i}]: hedef '{rel['target_id']}' henüz veri setinde yok")

    for sid in iter_source_refs(rec):
        if sid not in SOURCE_IDS:
            errors.append(f"source_id '{sid}' sources.json'da yok")

    # Tekrarsız id'ler
    for field in ("sections", "legends", "inscriptions", "timeline"):
        ids = [x["id"] for x in rec.get(field, [])]
        dup = {i for i in ids if ids.count(i) > 1}
        if dup:
            errors.append(f"{field}: tekrar eden id {sorted(dup)}")
    media_ids = [m["id"] for m in rec["media"] + rec.get("archive_media", [])]
    if len(media_ids) != len(set(media_ids)):
        errors.append("media: tekrar eden id")
    keys = [f["key"] for f in rec.get("facts", [])]
    if len(keys) != len(set(keys)):
        errors.append("facts: tekrar eden key")

    # İç referanslar
    section_ids = {s["id"] for s in rec["sections"]}
    for h in rec.get("highlights", []):
        if h.get("section_id") and h["section_id"] not in section_ids:
            errors.append(f"highlights: section_id '{h['section_id']}' yok")
    for ins in rec.get("inscriptions", []):
        mid = ins.get("ar_target_media_id")
        if mid and mid not in media_ids:
            errors.append(f"inscriptions[{ins['id']}]: media '{mid}' yok")

    covers = [m for m in rec["media"] if m.get("is_cover")]
    if len(covers) != 1:
        errors.append(f"media: tam olarak 1 kapak fotoğrafı olmalı (şu an {len(covers)})")
    for m in rec["media"]:
        if not m["alt"].get("en"):
            warnings.append(f"media[{m['id']}]: İngilizce alt metin eksik")

    # Yayına çıkacak kayıtta ek şartlar
    if rec["meta"]["status"] == "published":
        if not rec["meta"].get("reviewed_by"):
            errors.append("published kayıtta meta.reviewed_by dolu olmalı")
        for s in rec["sections"]:
            if not s["body"].get("en"):
                errors.append(f"published kayıtta sections[{s['id']}] İngilizce metin eksik")

    return errors, warnings


def main(argv):
    files = [Path(a) for a in argv] or sorted((DATA / "eserler").rglob("*.json"))
    records = {}
    failed = False
    for f in files:
        try:
            records[f] = json.loads(f.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            print(f"✗ {f}: geçersiz JSON: {e}")
            failed = True
    all_ids = {r.get("id") for r in records.values()}

    for f, rec in records.items():
        schema_errors = [
            f"{'/'.join(map(str, e.absolute_path)) or '(kök)'}: {e.message}"
            for e in VALIDATOR.iter_errors(rec)
        ]
        if schema_errors:
            errors, warnings = schema_errors, []
        else:
            errors, warnings = cross_check(rec, f, all_ids)
        mark = "✗" if errors else "✓"
        print(f"{mark} {f.relative_to(DATA) if f.is_relative_to(DATA) else f}")
        for e in errors:
            print(f"    HATA  {e}")
        for w in warnings:
            print(f"    uyarı {w}")
        failed |= bool(errors)

    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main(sys.argv[1:])
