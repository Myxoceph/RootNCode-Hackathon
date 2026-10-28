#!/usr/bin/env python3
"""Eserlere koordinat önerir ve (--write ile) yazar.

Kullanım:
    python3 data/tools/geocode.py            # rapor: hangi eser hangi kaynaktan, kalanlar
    python3 data/tools/geocode.py --write    # koordinatı olmayan kayıtlara yazar

Kaynaklar, öncelik sırasıyla:
  1. photo_exif: eserin fotoğraflarının (build/media-manifest.json) EXIF GPS'lerinin medyanı; yoksa
     drive_photo_map.py'nin kitap sayfası eşleşmesiyle esere bağladığı Drive fotoğraflarınınki
     (build/cache/drive/photo-map.json; GPS'ler medyandan 500 m'den fazla dağılıyorsa kullanılmaz).
     Çoğu drone çekimi olduğundan nokta binadan birkaç on metre sapabilir.
  2. osm: OpenStreetMap'te (Hatay'da 2023 depremleri öncesi veri de) aynı ilçede, adı ve türü tutan TEK aday. İlçe başına bir Overpass
     sorgusu atılır, yanıt build/cache/osm/ altında saklanır; tekrar çalıştırmak ağa çıkmaz
     (yenilemek için önbelleği silin). Veri © OpenStreetMap katkıcıları, ODbL.
  3. parent: kendi eşleşmesi olmayan külliye alt yapısı, parent'ın noktasını alır.
Elle girilmiş koordinatlara dokunulmaz. Yazılan her koordinat `verified: false`'tur.
"""
import json
import re
import statistics
import subprocess
import sys
import time
import unicodedata
from math import asin, cos, radians, sin, sqrt
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent
CACHE = DATA / "build" / "cache" / "osm"
MANIFEST = DATA / "build" / "media-manifest.json"
DRIVE_MAP = DATA / "build" / "cache" / "drive" / "photo-map.json"
# Fotoğraflar bu kadar dağınıksa (geniş açılı ya da uzaktan çekimler) nokta güvenilmez sayılır
MAX_EXIF_SPREAD_METERS = 500
OVERPASS = "https://overpass-api.de/api/interpreter"
USER_AGENT = "vagabonds-geocode/1.0 (KOK&KOD hackathon data tool)"

# Hatay'da 2023 depremlerinde yıkılan yapıların çoğu OSM'den silindi; deprem öncesi veri de sorgulanır
PRE_QUAKE = {"hatay": "2023-02-01T00:00:00Z"}

# Kayıttaki ilçe → OSM'deki ilçe (admin_level 6) adı
OSM_DISTRICT = {"Payas": "Dörtyol"}
PROVINCE = {"bursa": "Bursa", "hatay": "Hatay"}

# Ad tam tutmadığı için otomatik eşleşmeyen, OSM'deki ad ve ilçeyle elle teyit edilmiş eşleşmeler
OSM_PICK = {
    "bursa-kestel-vani-mehmed-efendi-camii": "way/323608590",          # Vani Mehmet Camii
    "bursa-kestel-vani-mehmed-efendi-camii-haziresi": "way/323608590",
    "bursa-osmangazi-abdal-mehmet-camii": "way/407481861",            # Abdal Cami
    "bursa-osmangazi-aynali-camii": "way/1234567922",                 # Hoca Tabip Aynalı Camii
    "bursa-osmangazi-candarli-ibrahim-pasa-camii": "way/360467909",   # Hoca Müslihiddin Mahkeme Camii
    "bursa-osmangazi-ebu-ishak-kazeruni-camii": "way/343619718",      # Ebu İshak Camii
    "bursa-osmangazi-ertugrul-bey-camii": "way/999333753",
    "bursa-osmangazi-haci-ali-sevinc-camii": "way/407487659",         # Hacı Sevinç Camii
    "bursa-osmangazi-hatice-isfendiyar-sultan-camii": "way/343627351",
    "bursa-osmangazi-hz-uftade-turbesi": "way/328018250",
    "bursa-osmangazi-ii-murad-turbesi": "way/472072853",              # II. Murad Külliyesi Sultan Türbeleri
    "bursa-osmangazi-ismail-hakki-tekkesi-camii": "way/699099605",    # İsmail Hakkı Bursevi Camii
    "bursa-osmangazi-kozahan-mescidi": "way/1271698329",
    "bursa-osmangazi-orhan-bey-camii": "way/255187109",               # Gazi Orhan Camii
    "bursa-yildirim-mucelliddin-omer-aga-camii": "way/247424181",
    "hatay-antakya-ahmediye-camii": "way/1139502102",
    "hatay-antakya-ulu-camii": "way/339347928",                      # Antakya Ulu Camii
    "hatay-yayladagi-senkoy-ahmet-kusayri-camii": "way/1142031721",   # Şeyh Ahmet Kuseyri Camii
}


def overpass(city, district, date=None):
    """İlçedeki adlı tarihî/dinî yapıları döndürür (önbellekli). `date`: o günkü OSM verisi."""
    osm_district = OSM_DISTRICT.get(district, district)
    f = CACHE / f"{city}-{slug(osm_district)}{'-' + date[:10] if date else ''}.json"
    if f.exists():
        return json.loads(f.read_text(encoding="utf-8"))
    if date:
        # Overpass'ta area tarihli sorguyla çalışmaz: ilçenin güncel verisinin kapsadığı kutu kullanılır
        now = overpass(city, district)
        lats, lngs = [e["lat"] for e in now], [e["lng"] for e in now]
        scope = f"({min(lats) - 0.01},{min(lngs) - 0.01},{max(lats) + 0.01},{max(lngs) + 0.01})"
        head = f'[out:json][timeout:180][date:"{date}"];'
    else:
        scope = "(area.ilce)"
        head = f"""[out:json][timeout:120];
area["name"="{PROVINCE[city]}"]["admin_level"="4"]->.il;
area["name"="{osm_district}"]["admin_level"="6"](area.il)->.ilce;"""
    q = f"""{head}
(
  nwr["name"]["amenity"~"^(place_of_worship|public_bath|fountain|drinking_water|school|library|marketplace)$"]{scope};
  nwr["name"]["historic"]{scope};
  nwr["name"]["building"~"^(mosque|church|religious|shrine|public)$"]{scope};
  nwr["name"]["tourism"~"^(attraction|museum|hotel|guest_house)$"]{scope};
);
out center tags;"""
    # urllib yerine curl: macOS'taki eski Python'un TLS'i Overpass'la el sıkışamıyor
    for attempt in range(1, 6):
        res = subprocess.run(["curl", "-sf", "--max-time", "180", "-A", USER_AGENT,
                              "--data-urlencode", f"data={q}", OVERPASS], capture_output=True)
        if res.returncode == 0:
            break
        print(f"  overpass {district}: curl {res.returncode}, {attempt * 15} sn sonra tekrar", file=sys.stderr)
        time.sleep(attempt * 15)
    else:
        sys.exit(f"overpass {district}: yanıt alınamadı")
    body = res.stdout
    elements = json.loads(body)["elements"]
    out = []
    for e in elements:
        lat = e.get("lat", e.get("center", {}).get("lat"))
        lng = e.get("lon", e.get("center", {}).get("lon"))
        if lat is None:
            continue
        out.append({"osm": f"{e['type']}/{e['id']}", "lat": lat, "lng": lng, "tags": e["tags"]})
    CACHE.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    time.sleep(5)  # Overpass'a nazik davran
    return out


def slug(s):
    s = s.replace("ı", "i").replace("İ", "i")
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def haversine(a, b):
    la1, lo1, la2, lo2 = map(radians, (a[0], a[1], b[0], b[1]))
    h = sin((la2 - la1) / 2) ** 2 + cos(la1) * cos(la2) * sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371000 * asin(sqrt(h))


def median_point(pts):
    """(medyan nokta, nokta sayısı) ya da dağılım çok büyükse None."""
    if not pts:
        return None
    mid = (statistics.median(p[0] for p in pts), statistics.median(p[1] for p in pts))
    if max(haversine(mid, p) for p in pts) > MAX_EXIF_SPREAD_METERS:
        return None
    return mid, len(pts)


def exif_point(manifest, drive_map, asset_id):
    """Önce kayda bağlı fotoğrafların, yoksa Drive eşleşmesindeki fotoğrafların GPS'i: (nokta, sayı, kaynak notu)."""
    own = [(e["exif"]["gps"]["lat"], e["exif"]["gps"]["lng"])
           for e in manifest.get(asset_id, {}).values() if (e.get("exif") or {}).get("gps")]
    if own:
        hit = median_point(own)
        return hit and (*hit, "fotoğrafın")
    drive = [(p["gps"]["lat"], p["gps"]["lng"]) for p in drive_map.get(asset_id, []) if p.get("gps")]
    hit = median_point(drive)
    return hit and (*hit, "Drive fotoğrafının (kitap sayfası eşleşmesiyle)")


# Ad içindeki tür sözcüğü → kategori. Cami ve mescit aynı kategoridir (adlar ikisi arasında değişebiliyor).
KIND_WORDS = {
    "M": ("camii", "cami", "camisi", "mescidi", "mescid", "mescit", "mosque"),
    "T": ("turbesi", "turbe", "turbeleri", "kumbeti", "makami", "ziyareti", "turbes"),
    "H": ("hamami", "hamam", "kaplicasi"),
    "C": ("cesmesi", "cesme", "cesmeleri", "sebili"),
    "HAN": ("hani", "han", "kervansarayi", "bedesteni", "bedesten", "arastasi", "carsisi"),
    "MED": ("medresesi", "medrese", "darussifasi", "imareti", "mektebi", "kutuphanesi", "tekkesi", "zaviyesi", "dergahi"),
    "K": ("kulliyesi",),
    "CH": ("kilisesi", "kilise", "church"),
}
WORD_KIND = {w: k for k, ws in KIND_WORDS.items() for w in ws}
TYPE_KIND = {"cami": "M", "mescit": "M", "turbe": "T", "hazire": "T", "hamam": "H", "cesme": "C",
             "han": "HAN", "kervansaray": "HAN", "bedesten": "HAN", "medrese": "MED", "imaret": "MED",
             "mektep": "MED", "tekke": "MED", "darussifa": "MED", "kulliye": "K"}
STOP = {"ve", "ile", "haziresi", "hazire", "hz"}
SPELL = {"mehmed": "mehmet", "ahmed": "ahmet", "muhammed": "muhammet", "mahmud": "mahmut",
         "davud": "davut", "yakub": "yakup", "eyub": "eyup", "seyyid": "seyit", "seyid": "seyit",
         "alaaddin": "alaeddin", "nureddin": "nurettin", "murad": "murat", "kuseyri": "kusayri"}


def variants(name):
    """"Acem Reis (Arap Dede) Camii" → kendisi + "Acem Reis Camii" + "Arap Dede Camii"."""
    out = [name]
    m = re.match(r"(.*?)\s*\((.*?)\)\s*(.*)", name)
    if m:
        out += [f"{m[1]} {m[3]}", f"{m[2]} {m[3]}"]
    return out


def name_variants(rec):
    names = [rec["name"]["tr"]] + [a["tr"] for a in rec.get("alternate_names") or [] if a.get("tr")]
    return [v for n in names for v in variants(n)]


def parse(name):
    """Ad → (kategori ya da None, çekirdek ad)."""
    toks = [SPELL.get(t, t) for t in slug(name).split("-") if t]
    kind = next((WORD_KIND[t] for t in reversed(toks) if t in WORD_KIND), None)
    core = " ".join(t for t in toks if t not in WORD_KIND and t not in STOP and not t.isdigit())
    return kind, core


def osm_kind(tags):
    if tags.get("amenity") == "place_of_worship":
        return "M" if tags.get("religion", "muslim") == "muslim" else "CH"
    if tags.get("historic") == "tomb":
        return "T"
    if tags.get("amenity") == "public_bath":
        return "H"
    if tags.get("amenity") in ("fountain", "drinking_water"):
        return "C"
    return None


def osm_index(elements):
    idx = {}
    for e in elements:
        t = e["tags"]
        for key in ("name", "name:tr", "alt_name", "old_name", "official_name"):
            for n in (v for x in (t.get(key) or "").split(";") if x.strip() for v in variants(x)):
                kind, core = parse(n)
                kind = kind or osm_kind(t)
                if core and kind:
                    idx.setdefault((kind, core), []).append(e)
    return idx


def osm_match(rec, idx):
    """Tek, net bir OSM adayı (aynı yapıya ait öğeler 150 m içinde kümelenir) ya da None."""
    rec_kind = TYPE_KIND.get(rec["type"])
    found = {}
    for n in name_variants(rec):
        kind, core = parse(n)
        kind = kind or rec_kind
        if not core or not kind:
            continue
        for e in idx.get((kind, core), []):
            found[e["osm"]] = e
    if not found:
        return None, []
    cands = list(found.values())
    first = cands[0]
    if all(haversine((first["lat"], first["lng"]), (c["lat"], c["lng"])) < 150 for c in cands):
        best = next((c for c in cands if not c["osm"].startswith("node")), first)  # bina alanı > nokta
        return best, cands
    return None, cands


def main(argv):
    write = "--write" in argv
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    drive_map = json.loads(DRIVE_MAP.read_text(encoding="utf-8")) if DRIVE_MAP.exists() else {}
    files = sorted((DATA / "eserler").rglob("*.json"))
    recs = {f: json.loads(f.read_text(encoding="utf-8")) for f in files}
    by_id = {r["id"]: r for r in recs.values()}
    idx_cache = {}
    result, ambiguous, deltas = {}, {}, []
    for r in recs.values():
        loc = r["location"]
        if loc.get("coordinates"):
            c = loc["coordinates"]
            result[r["id"]] = ("manual", c["lat"], c["lng"], None, c.get("source", "manual"))
            continue
        key = (loc["city"], OSM_DISTRICT.get(loc["district"], loc["district"]))
        if key not in idx_cache:
            els = overpass(loc["city"], loc["district"])
            if loc["city"] in PRE_QUAKE:
                seen = {e["osm"] for e in els}
                els = els + [e for e in overpass(loc["city"], loc["district"], PRE_QUAKE[loc["city"]])
                             if e["osm"] not in seen]
            idx_cache[key] = osm_index(els)
        hit, cands = osm_match(r, idx_cache[key])
        if r["id"] in OSM_PICK:
            hit = next(e for es in idx_cache[key].values() for e in es if e["osm"] == OSM_PICK[r["id"]])
        ex = exif_point(manifest, drive_map, r["id"])
        if ex:
            (lat, lng), n, what = ex
            note = f"{n} {what} EXIF GPS medyanı; drone konumu olabilir, binadan sapabilir."
            if hit:
                d = haversine((lat, lng), (hit["lat"], hit["lng"]))
                deltas.append((round(d), r["id"]))
                note += f" OSM {hit['osm']} ile arası {d:.0f} m."
            result[r["id"]] = ("photo_exif", lat, lng, note, "photo_exif")
        elif hit:
            result[r["id"]] = ("osm", hit["lat"], hit["lng"],
                               f"OpenStreetMap {hit['osm']} ('{hit['tags'].get('name')}'), ad ve ilçe eşleşmesiyle; sahada doğrulanmalı.",
                               "osm")
        elif cands:
            ambiguous[r["id"]] = cands
    # Kendi noktası olmayan alt yapı parent'ınkini, külliye de ilk alt yapısınınkini alır
    for _ in range(2):
        for r in recs.values():
            if r["id"] in result:
                continue
            pid = r.get("parent_id")
            src = result.get(pid) if pid else None
            if not src and r["type"] == "kulliye":
                kid = next((k for k, v in by_id.items() if v.get("parent_id") == r["id"] and k in result), None)
                src = result.get(kid) if kid else None
                pid = kid
            if src:
                # şemada "parent" kaynağı yok: noktanın asıl kaynağı yazılır, not miras alındığını söyler
                result[r["id"]] = ("parent", src[1], src[2],
                                   f"Kendi konumu bulunamadı; bağlı olduğu yapının ({pid}) noktası kullanıldı.",
                                   src[4])

    # Rapor
    import collections
    per = collections.Counter((by_id[i]["location"]["city"], v[0]) for i, v in result.items())
    total = collections.Counter(r["location"]["city"] for r in recs.values())
    for city in sorted(total):
        got = sum(n for (c, _), n in per.items() if c == city)
        print(f"{city}: {got}/{total[city]}  " + ", ".join(f"{s} {n}" for (c, s), n in sorted(per.items()) if c == city))
    if deltas:
        ds = sorted(d for d, _ in deltas)
        print(f"EXIF↔OSM mesafesi ({len(ds)} eser): medyan {statistics.median(ds)} m, en büyük {ds[-3:]}")
        for d, i in sorted(deltas)[-5:]:
            print(f"   {d} m  {i}")
    print(f"belirsiz (birden fazla uzak aday): {len(ambiguous)}")
    if "-v" in argv:
        for i, cs in ambiguous.items():
            print(" ", i, [(c["tags"].get("name"), c["osm"]) for c in cs][:4])
        missing = [r["id"] for r in recs.values() if r["id"] not in result and r["id"] not in ambiguous]
        print("bulunamayan:", len(missing))
        for m in missing:
            print("  ", m)

    if write:
        n = 0
        for f, r in recs.items():
            v = result.get(r["id"])
            if not v or v[0] == "manual" or r["location"].get("coordinates"):
                continue
            r["location"]["coordinates"] = {"lat": round(v[1], 6), "lng": round(v[2], 6),
                                            "source": v[4], "verified": False, "verification_note": v[3]}
            f.write_text(json.dumps(r, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            n += 1
        print(f"yazıldı: {n} kayıt")


if __name__ == "__main__":
    main(sys.argv[1:])
