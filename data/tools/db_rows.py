"""Eser JSON'u + medya manifesti → veritabanı satırları.

README Bölüm 5'teki tabloların TEK eşleme kaynağı. Hem veri görüntüleyici
(build_viewer.py) hem de içe aktarma bu modülü kullanır; böylece sitede görünen
satırlar ile DB'ye giden satırlar aynıdır.

TABLES: her tablonun sütunları, DDL'deki sırayla. DB'nin kendisinin ürettiği
sütunlar (identity id, uuid, now()) satırlarda GENERATED değeriyle gelir.
"""
import json
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent
GENERATED = {"$generated": True}  # DB üretir (identity, gen_random_uuid(), now())

TABLES = {
    # lookup / ortak
    "region": ["code", "label_tr", "label_en"],
    "city": ["code", "region_code", "plate", "label_tr", "label_en"],
    "asset_type": ["code", "label_tr", "label_en", "ambient_sound"],
    "era": ["code", "label_tr", "label_en"],
    "relation_type": ["code", "label_tr", "label_en"],
    "timeline_event_type": ["code", "label_tr", "label_en"],
    "source": ["id", "type", "title_tr", "title_en", "publisher", "year", "isbn", "url", "is_official", "extra"],
    # eser
    "asset": [
        "id", "status", "type_code", "secondary_types", "parent_id", "era_code", "tags",
        "name_tr", "name_en", "subtitle_tr", "subtitle_en", "alternate_names", "summary_tr", "summary_en",
        "city_code", "district", "neighborhood", "address", "lat", "lng", "coord_source", "coord_verified",
        "dating_display_tr", "dating_display_en", "start_year", "end_year", "hijri_year", "century",
        "dating_basis_tr", "dating_basis_en", "dating_confidence",
        "founder_name", "founder_role", "founder_confidence",
        "architect_name", "architect_candidates", "architect_confidence",
        "waqf_name", "waqf_deed", "waqf_conditions_tr", "waqf_conditions_en",
        "waqf_land_note_tr", "waqf_land_note_en", "waqf_confidence",
        "visit_setting", "visit_duration_min", "visit_duration_source", "entrance_fee", "visit_notes_tr", "visit_notes_en",
        "a11y_wheelchair", "a11y_step_free", "a11y_ramp", "a11y_toilet", "a11y_verified",
        "a11y_notes_tr", "a11y_notes_en", "audio_description_tr", "audio_description_en",
        "ambient_sound_key", "ambient_caption_tr", "ambient_caption_en",
        "media_folder", "prepared_by", "reviewed_by", "todos", "data_quality_notes", "source_json",
        "created_at", "updated_at",
    ],
    "asset_section": ["asset_id", "slug", "sort_order", "title_tr", "title_en", "body_tr", "body_en", "confidence"],
    "asset_legend": ["asset_id", "slug", "sort_order", "title_tr", "title_en", "body_tr", "body_en", "source_verdict"],
    "asset_fact": ["asset_id", "key", "sort_order", "label_tr", "label_en", "value", "value_num", "unit", "note_tr", "note_en", "confidence"],
    "asset_person": ["asset_id", "sort_order", "name", "role_tr", "role_en"],
    "timeline_event": ["asset_id", "slug", "year", "date", "hijri", "type_code", "title_tr", "title_en", "note_tr", "note_en", "confidence"],
    "asset_highlight": ["asset_id", "sort_order", "feature", "title_tr", "title_en", "hint_tr", "hint_en", "section_slug"],
    "asset_relation": ["id", "source_asset_id", "target_asset_id", "type_code", "description_tr", "description_en", "confidence"],
    "visitor_tip": ["id", "asset_id", "text_tr", "text_en", "origin", "collected_at"],
    "exhibition": ["id", "asset_id", "name_tr", "name_en", "venue", "start_date", "end_date"],
    "source_citation": ["id", "asset_id", "entity", "entity_key", "source_id", "pages"],
    "media": [
        "id", "sha256", "kind", "original_key", "original_bytes", "width", "height", "aspect_ratio",
        "dominant_color", "lqip", "captured_at", "capture_lat", "capture_lng", "credit", "photographer",
        "license", "source_id", "source_provider", "source_ref", "status", "created_at", "updated_at",
    ],
    "media_variant": ["media_id", "format", "width", "height", "bytes", "key"],
    "asset_media": [
        "asset_id", "media_key", "media_id", "sort_order", "is_cover", "subject", "focal_x", "focal_y",
        "caption_tr", "caption_en", "alt_tr", "alt_en", "archive_year", "archive_year_approx",
        "overlay_opacity", "overlay_aspect", "shooting_hint_tr", "shooting_hint_en",
    ],
    "inscription": [
        "asset_id", "slug", "sort_order", "location_tr", "location_en", "language", "script", "transliteration",
        "translation_tr", "translation_en", "author", "hijri_year", "gregorian", "note_tr", "note_en", "ar_target_media_key",
    ],
    "contribution": [
        "id", "asset_id", "user_id", "kind", "media_id", "body", "status", "reviewed_by", "reviewed_at", "reject_reason", "created_at",
    ],
    "asset_revision": ["asset_id", "version", "data", "changed_by", "changed_at"],
}

# Bir esere ait tablolar (görüntüleyicide eser sayfasında gösterilir), DDL sırasıyla
ASSET_TABLES = [
    "asset", "asset_section", "asset_legend", "asset_fact", "asset_person", "timeline_event",
    "asset_highlight", "asset_relation", "visitor_tip", "exhibition", "source_citation",
    "media", "media_variant", "asset_media", "inscription", "contribution", "asset_revision",
]
SHARED_TABLES = ["region", "city", "asset_type", "era", "relation_type", "timeline_event_type", "source"]

ENUM_TABLES = {
    "region": "regions", "era": "eras", "relation_type": "relation_types", "timeline_event_type": "timeline_event_types",
}


def media_ref(sha256):
    """media.id DB'de uuid'dir; satırlar arasında bağı göstermek için hash'ten okunur bir yer tutucu."""
    return {"$media": sha256[:10]}


def _t(obj, lang):
    return (obj or {}).get(lang)


def shared_rows():
    enums = json.loads((DATA / "enums.json").read_text(encoding="utf-8"))
    sources = json.loads((DATA / "sources.json").read_text(encoding="utf-8"))["sources"]
    rows = {}
    for table, key in ENUM_TABLES.items():
        rows[table] = [{"code": r["code"], "label_tr": r["label"]["tr"], "label_en": r["label"].get("en")} for r in enums[key]]
    rows["city"] = [
        {"code": r["code"], "region_code": r["region"], "plate": r.get("plate"), "label_tr": r["label"]["tr"], "label_en": r["label"].get("en")}
        for r in enums["cities"]
    ]
    rows["asset_type"] = [
        {"code": r["code"], "label_tr": r["label"]["tr"], "label_en": r["label"].get("en"), "ambient_sound": r.get("ambient_sound")}
        for r in enums["asset_types"]
    ]
    known = {"id", "type", "title", "publisher", "year", "isbn", "url", "is_official"}
    rows["source"] = [
        {
            "id": s["id"], "type": s["type"], "title_tr": s["title"]["tr"], "title_en": s["title"].get("en"),
            "publisher": s.get("publisher"), "year": s.get("year"), "isbn": s.get("isbn"), "url": s.get("url"),
            "is_official": s.get("is_official", False), "extra": {k: v for k, v in s.items() if k not in known},
        }
        for s in sources
    ]
    return {t: rows[t] for t in SHARED_TABLES}


def asset_rows(a, manifest):
    """Tek eserin tüm tablolardaki satırları. manifest: media-manifest.json içindeki bu esere ait sözlük."""
    aid = a["id"]
    M, L = a["meta"], a["location"]
    D, F, AR, W = (a.get(k) or {} for k in ("dating", "founder", "architect", "waqf"))
    V, X, S = (a.get(k) or {} for k in ("visit", "accessibility", "ambient_sound"))
    coords = L.get("coordinates") or {}  # taslaklarda olmayabilir (yalnızca viewer; DB'ye taslak girmez)
    rows = {t: [] for t in ASSET_TABLES}

    rows["asset"].append({
        "id": aid, "status": M["status"], "type_code": a["type"], "secondary_types": a.get("secondary_types", []),
        "parent_id": a.get("parent_id"), "era_code": a.get("era"), "tags": a.get("tags", []),
        "name_tr": a["name"]["tr"], "name_en": a["name"].get("en"),
        "subtitle_tr": _t(a.get("subtitle"), "tr"), "subtitle_en": _t(a.get("subtitle"), "en"),
        "alternate_names": a.get("alternate_names", []),
        "summary_tr": a["summary"]["tr"], "summary_en": a["summary"].get("en"),
        "city_code": L["city"], "district": L["district"], "neighborhood": L.get("neighborhood"), "address": L.get("address"),
        "lat": coords.get("lat"), "lng": coords.get("lng"), "coord_source": coords.get("source"), "coord_verified": coords.get("verified"),
        "dating_display_tr": _t(D.get("display"), "tr"), "dating_display_en": _t(D.get("display"), "en"),
        "start_year": D.get("start_year"), "end_year": D.get("end_year"), "hijri_year": D.get("hijri_year"), "century": D.get("century"),
        "dating_basis_tr": _t(D.get("basis"), "tr"), "dating_basis_en": _t(D.get("basis"), "en"), "dating_confidence": D.get("confidence"),
        "founder_name": F.get("name"), "founder_role": F.get("role"), "founder_confidence": F.get("confidence"),
        "architect_name": AR.get("name"), "architect_candidates": AR.get("candidates", []), "architect_confidence": AR.get("confidence"),
        "waqf_name": W.get("name"), "waqf_deed": W.get("deed"),
        "waqf_conditions_tr": _t(W.get("conditions"), "tr"), "waqf_conditions_en": _t(W.get("conditions"), "en"),
        "waqf_land_note_tr": _t(W.get("land_note"), "tr"), "waqf_land_note_en": _t(W.get("land_note"), "en"),
        "waqf_confidence": W.get("confidence"),
        "visit_setting": V.get("setting"), "visit_duration_min": V.get("estimated_duration_min"),
        "visit_duration_source": V.get("estimated_duration_source"), "entrance_fee": V.get("entrance_fee"),
        "visit_notes_tr": _t(V.get("notes"), "tr"), "visit_notes_en": _t(V.get("notes"), "en"),
        "a11y_wheelchair": X.get("wheelchair_access", "unknown"), "a11y_step_free": X.get("step_free_entrance", "unknown"),
        "a11y_ramp": X.get("ramp", "unknown"), "a11y_toilet": X.get("accessible_toilet", "unknown"),
        "a11y_verified": X.get("verified", False),
        "a11y_notes_tr": _t(X.get("notes"), "tr"), "a11y_notes_en": _t(X.get("notes"), "en"),
        "audio_description_tr": _t(X.get("audio_description"), "tr"), "audio_description_en": _t(X.get("audio_description"), "en"),
        "ambient_sound_key": S.get("sound_key"), "ambient_caption_tr": _t(S.get("caption"), "tr"), "ambient_caption_en": _t(S.get("caption"), "en"),
        "media_folder": a.get("media_folder"), "prepared_by": M.get("prepared_by"), "reviewed_by": M.get("reviewed_by"),
        "todos": M.get("todos", []), "data_quality_notes": M.get("data_quality_notes", []), "source_json": a,
        "created_at": GENERATED, "updated_at": GENERATED,
    })

    def cite(entity, key, refs):
        for r in refs or []:
            rows["source_citation"].append({
                "id": GENERATED, "asset_id": aid, "entity": entity, "entity_key": key,
                "source_id": r["source_id"], "pages": r.get("pages"),
            })

    for entity in ("location", "dating", "founder", "architect", "waqf"):
        cite(entity, "", (a.get(entity) or {}).get("source_refs"))

    for s in a["sections"]:
        rows["asset_section"].append({
            "asset_id": aid, "slug": s["id"], "sort_order": s["order"], "title_tr": s["title"]["tr"], "title_en": s["title"].get("en"),
            "body_tr": s["body"]["tr"], "body_en": s["body"].get("en"), "confidence": s["confidence"],
        })
        cite("section", s["id"], s["source_refs"])
    for i, g in enumerate(a.get("legends", [])):
        rows["asset_legend"].append({
            "asset_id": aid, "slug": g["id"], "sort_order": i, "title_tr": g["title"]["tr"], "title_en": g["title"].get("en"),
            "body_tr": g["body"]["tr"], "body_en": g["body"].get("en"), "source_verdict": g["source_verdict"],
        })
        cite("legend", g["id"], g["source_refs"])
    for i, f in enumerate(a.get("facts", [])):
        value = f["value"]
        rows["asset_fact"].append({
            "asset_id": aid, "key": f["key"], "sort_order": i, "label_tr": f["label"]["tr"], "label_en": f["label"].get("en"),
            "value": str(value), "value_num": value if isinstance(value, (int, float)) else None, "unit": f.get("unit"),
            "note_tr": _t(f.get("note"), "tr"), "note_en": _t(f.get("note"), "en"), "confidence": f["confidence"],
        })
        cite("fact", f["key"], f["source_refs"])
    for i, p in enumerate(a.get("people", [])):
        rows["asset_person"].append({"asset_id": aid, "sort_order": i, "name": p["name"], "role_tr": p["role"]["tr"], "role_en": p["role"].get("en")})
    for e in a.get("timeline", []):
        rows["timeline_event"].append({
            "asset_id": aid, "slug": e["id"], "year": e["year"], "date": e.get("date"), "hijri": e.get("hijri"), "type_code": e["type"],
            "title_tr": e["title"]["tr"], "title_en": e["title"].get("en"),
            "note_tr": _t(e.get("note"), "tr"), "note_en": _t(e.get("note"), "en"), "confidence": e["confidence"],
        })
        cite("timeline", e["id"], e["source_refs"])
    for i, h in enumerate(a.get("highlights", [])):
        rows["asset_highlight"].append({
            "asset_id": aid, "sort_order": i, "feature": h["feature"], "title_tr": h["title"]["tr"], "title_en": h["title"].get("en"),
            "hint_tr": h["hint"]["tr"], "hint_en": h["hint"].get("en"), "section_slug": h.get("section_id"),
        })
    for r in a.get("relations", []):
        rows["asset_relation"].append({
            "id": GENERATED, "source_asset_id": aid, "target_asset_id": r["target_id"], "type_code": r["type"],
            "description_tr": r["description"]["tr"], "description_en": r["description"].get("en"), "confidence": r["confidence"],
        })
        cite("relation", f"{r['target_id']}:{r['type']}", r["source_refs"])
    for tip in V.get("visitor_tips", []):
        rows["visitor_tip"].append({
            "id": GENERATED, "asset_id": aid, "text_tr": tip["text"]["tr"], "text_en": tip["text"].get("en"),
            "origin": tip["origin"], "collected_at": tip.get("collected_at"),
        })
    for ex in a.get("exhibitions", []):
        rows["exhibition"].append({
            "id": GENERATED, "asset_id": aid, "name_tr": ex["name"]["tr"], "name_en": ex["name"].get("en"),
            "venue": ex.get("venue"), "start_date": ex.get("start_date"), "end_date": ex.get("end_date"),
        })

    for m in a["media"] + a.get("archive_media", []):
        mm = (manifest or {}).get(m["id"])
        if mm is None:
            raise KeyError(f"{aid}/{m['id']}: manifestte yok; önce media_pipeline.py çalıştırılmalı")
        exif, gps = mm["exif"], mm["exif"].get("gps") or {}
        ref = media_ref(mm["sha256"])
        rows["media"].append({
            "id": ref, "sha256": mm["sha256"], "kind": m["type"], "original_key": mm["original"]["key"],
            "original_bytes": mm["original"]["bytes"], "width": mm["original"]["width"], "height": mm["original"]["height"],
            "aspect_ratio": mm["aspect_ratio"], "dominant_color": mm["dominant_color"], "lqip": mm["lqip"],
            "captured_at": exif.get("captured_at"), "capture_lat": gps.get("lat"), "capture_lng": gps.get("lng"),
            "credit": m["credit"], "photographer": m.get("photographer"), "license": m["license"], "source_id": m.get("source_id"),
            "source_provider": m["source"]["provider"], "source_ref": m["source"].get("file_id") or m["source"].get("url"),
            "status": "published", "created_at": GENERATED, "updated_at": GENERATED,
        })
        for v in mm["variants"]:
            rows["media_variant"].append({
                "media_id": ref, "format": v["format"], "width": v["width"], "height": v["height"], "bytes": v["bytes"], "key": v["key"],
            })
        fp, ov = m.get("focal_point") or {}, m.get("overlay") or {}
        rows["asset_media"].append({
            "asset_id": aid, "media_key": m["id"], "media_id": ref, "sort_order": m.get("order", 0), "is_cover": m.get("is_cover", False),
            "subject": m.get("subject"), "focal_x": fp.get("x"), "focal_y": fp.get("y"),
            "caption_tr": m["caption"]["tr"], "caption_en": m["caption"].get("en"), "alt_tr": m["alt"]["tr"], "alt_en": m["alt"].get("en"),
            "archive_year": m.get("year"), "archive_year_approx": m.get("year_approx"),
            "overlay_opacity": ov.get("opacity"), "overlay_aspect": ov.get("aspect_ratio"),
            "shooting_hint_tr": _t(ov.get("shooting_hint"), "tr"), "shooting_hint_en": _t(ov.get("shooting_hint"), "en"),
        })

    for i, n in enumerate(a.get("inscriptions", [])):
        d = n.get("date") or {}
        rows["inscription"].append({
            "asset_id": aid, "slug": n["id"], "sort_order": i, "location_tr": n["location"]["tr"], "location_en": n["location"].get("en"),
            "language": n["language"], "script": n.get("script"), "transliteration": n.get("transliteration"),
            "translation_tr": _t(n.get("translation"), "tr"), "translation_en": _t(n.get("translation"), "en"),
            "author": n.get("author"), "hijri_year": d.get("hijri_year"), "gregorian": d.get("gregorian"),
            "note_tr": _t(n.get("note"), "tr"), "note_en": _t(n.get("note"), "en"), "ar_target_media_key": n.get("ar_target_media_id"),
        })
        cite("inscription", n["id"], n["source_refs"])

    rows["asset_revision"].append({"asset_id": aid, "version": 1, "data": a, "changed_by": "import", "changed_at": GENERATED})

    for table, table_rows in rows.items():  # TABLES ile birebir aynı sütunlar (eksik/fazla yok)
        for row in table_rows:
            if list(row) != TABLES[table]:
                raise AssertionError(f"{table}: sütunlar TABLES ile uyuşmuyor: {set(row) ^ set(TABLES[table])}")
    return rows


def load_all(include_drafts=False):
    """Tüm eserleri ve manifesti okur.

    Varsayılan: taslaklar (meta.status = draft) atlanır; koordinatsız/fotoğrafsız olabilirler ve
    uygulamada görünmezler, in_review'a geçince içe aktarmaya girerler. Görüntüleyici
    (build_viewer.py) include_drafts=True ile hepsini gösterir.
    """
    manifest_path = DATA / "build" / "media-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
    assets = [json.loads(f.read_text(encoding="utf-8")) for f in sorted((DATA / "eserler").rglob("*.json"))]
    if not include_drafts:
        assets = [a for a in assets if a["meta"]["status"] != "draft"]
    return assets, manifest
