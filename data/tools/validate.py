#!/usr/bin/env python3
"""Eser ve şehir JSON dosyalarını doğrular.

Kullanım:
    pip install jsonschema
    python3 data/tools/validate.py              # data/eserler altındaki tüm dosyalar
    python3 data/tools/validate.py dosya.json   # tek dosya

İki aşama:
  1. JSON Schema (data/schema/eser.schema.json): alanlar, tipler, zorunlular.
  2. Çapraz kontroller: kod alanları enums.json'da var mı, source_id'ler
     sources.json'da var mı, id'ler tekrar ediyor mu, ilişki hedefleri mevcut mu.

Şehir dosyaları (data/sehirler/<il>.json, yöresel lezzetler) da aynı iki aşamayla,
data/schema/sehir.schema.json'a göre doğrulanır; ortam sesleri (data/sounds.json)
data/schema/sound.schema.json'a göre.
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
CITY_VALIDATOR = Draft202012Validator(json.loads((DATA / "schema" / "sehir.schema.json").read_text(encoding="utf-8")))
SOUND_VALIDATOR = Draft202012Validator(json.loads((DATA / "schema" / "sound.schema.json").read_text(encoding="utf-8")))


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
    if "coordinates" not in loc:
        warnings.append("koordinat yok (haritada ve yakındaki eserlerde görünmez)")
    elif not loc["coordinates"]["verified"]:
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
    if not rec["media"]:
        warnings.append("fotoğraf yok (uygulamada yer tutucu görsel gösterilir)")
    elif len(covers) != 1:
        errors.append(f"media: tam olarak 1 kapak fotoğrafı olmalı (şu an {len(covers)})")
    for m in rec["media"]:
        if not m["alt"].get("en"):
            warnings.append(f"media[{m['id']}]: İngilizce alt metin eksik")

    # Yayına çıkacak kayıtta ek şartlar
    if rec["meta"]["status"] == "published":
        if not rec["meta"].get("reviewed_by"):
            errors.append("published kayıtta meta.reviewed_by dolu olmalı")
        # Yönetim panelindeki sohbetten gelen kayıt (Veri Döngüsü): metin yetkilinin yazdığıdır, model çeviri
        # yapmaz. İngilizcesi onaydan sonra eklenir; o zamana kadar uygulama Türkçesini gösterir (API: pick).
        from_chat = rec["meta"].get("from") == "panel-sohbet"
        for s in rec["sections"]:
            if not s["body"].get("en"):
                (warnings if from_chat else errors).append(f"published kayıtta sections[{s['id']}] İngilizce metin eksik")

    return errors, warnings


def cross_check_city(data, path, districts, seen_dish_ids):
    """Şehir dosyası (sehirler/<il>.json): il kodu, lezzet id'leri, kaynaklar, güven kodları, ilçeler."""
    errors, warnings = [], []
    city = data["city"]
    if path.stem != city:
        errors.append(f"dosya adı '{path.stem}' ile city '{city}' aynı olmalı")
    if city not in codes("cities"):
        errors.append(f"city '{city}' cities listesinde yok (enums.json)")
    for i, dish in enumerate(data["dishes"]):
        where = f"dishes[{i}] {dish['id']}"
        if not dish["id"].startswith(f"{city}-"):
            errors.append(f"{where}: id '{city}-' ile başlamalı")
        if dish["id"] in seen_dish_ids:
            errors.append(f"{where}: id tekrar ediyor")
        seen_dish_ids.add(dish["id"])
        if dish["confidence"] not in codes("confidence"):
            errors.append(f"{where}: confidence '{dish['confidence']}' confidence listesinde yok (enums.json)")
        for sid in iter_source_refs(dish):
            if sid not in SOURCE_IDS:
                errors.append(f"{where}: source_id '{sid}' sources.json'da yok")
        if dish["district"] is not None and dish["district"] not in districts.get(city, set()):
            warnings.append(f"{where}: ilçe '{dish['district']}' bu ilin hiçbir eserinde geçmiyor (yazım?)")
    return errors, warnings


def validate_cities(files):
    """Şehir dosyalarını doğrular; ilçe yazımı eserlerdeki location.district ile karşılaştırılır. Hata varsa True."""
    districts = {}
    for f in (DATA / "eserler").rglob("*.json"):
        loc = json.loads(f.read_text(encoding="utf-8")).get("location") or {}
        districts.setdefault(loc.get("city"), set()).add(loc.get("district"))
    seen, failed = set(), False
    for f in files:
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            print(f"✗ {f}: geçersiz JSON: {e}")
            failed = True
            continue
        schema_errors = [
            f"{'/'.join(map(str, e.absolute_path)) or '(kök)'}: {e.message}" for e in CITY_VALIDATOR.iter_errors(data)
        ]
        errors, warnings = (schema_errors, []) if schema_errors else cross_check_city(data, f, districts, seen)
        print(f"{'✗' if errors else '✓'} {f.relative_to(DATA) if f.is_relative_to(DATA) else f}")
        for e in errors:
            print(f"    HATA  {e}")
        for w in warnings:
            print(f"    uyarı {w}")
        failed |= bool(errors)
    return failed


def validate_sounds(path):
    """sounds.json: şema, tekrarsız anahtar, dosya adı = anahtar, altyazı sırası, CC BY'de yazar. Hata varsa True."""
    data = json.loads(path.read_text(encoding="utf-8"))
    errors = [f"{'/'.join(map(str, e.absolute_path)) or '(kök)'}: {e.message}" for e in SOUND_VALIDATOR.iter_errors(data)]
    warnings = []
    if not errors:
        used = {t["ambient_sound"] for t in ENUMS["asset_types"] if t.get("ambient_sound")}
        for f in (DATA / "eserler").rglob("*.json"):
            sound = json.loads(f.read_text(encoding="utf-8")).get("ambient_sound")
            if sound:
                used.add(sound["sound_key"])
        seen = set()
        for i, s in enumerate(data["sounds"]):
            where = f"sounds[{i}] {s['key']}"
            if s["key"] in seen:
                errors.append(f"{where}: anahtar tekrar ediyor")
            seen.add(s["key"])
            if s["file"].rsplit("/", 1)[-1].rsplit(".", 1)[0] != s["key"]:
                errors.append(f"{where}: dosya adı anahtarla aynı olmalı (sounds/{s['key']}.mp3)")
            times = [c["at"] for c in s["captions"]]
            if times != sorted(times) or times[-1] >= s["duration_seconds"]:
                errors.append(f"{where}: altyazılar artan sırada ve ses bitmeden olmalı")
            if s["license"] == "CC-BY-4.0" and not s["author"]:
                errors.append(f"{where}: CC BY kayıtta author zorunlu")
            if s["key"] not in used:
                warnings.append(f"{where}: hiçbir eser ya da eser türü bu anahtarı kullanmıyor")
    print(f"{'✗' if errors else '✓'} {path.relative_to(DATA) if path.is_relative_to(DATA) else path}")
    for e in errors:
        print(f"    HATA  {e}")
    for w in warnings:
        print(f"    uyarı {w}")
    return bool(errors)


def main(argv):
    paths = [Path(a).resolve() for a in argv]
    city_files = [p for p in paths if p.parent.name == "sehirler"] if argv else sorted((DATA / "sehirler").glob("*.json"))
    files = [p for p in paths if p.parent.name != "sehirler"] if argv else sorted((DATA / "eserler").rglob("*.json"))
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

    failed |= validate_cities(city_files)
    if not argv or any(p.name == "sounds.json" for p in paths):
        failed |= validate_sounds(DATA / "sounds.json")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main(sys.argv[1:])
