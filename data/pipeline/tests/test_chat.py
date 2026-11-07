"""Sohbetten Kabul: mesajlar → taslak. EVREN sahte; denetimler (uydurma, kapsam, tekrar, konum) gerçek."""

import copy
import datetime as dt
import json
import sys
import tempfile
import unittest
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from chat import ChatStages, KnownAsset, coverage, exif_location, norm, slug  # noqa: E402
from config import REPO, load_env  # noqa: E402
from db import LocalOnlyError, connect  # noqa: E402
from llm import Reply  # noqa: E402

import worker  # noqa: E402

MESSAGES = [
    "Kurşunlu Camii, Bursa'nın Osmangazi ilçesinde, Kurşunlu Mahallesi'nde bulunur. Cami 1490 yılında Hacı Ahmed Bey tarafından yaptırılmıştır.",
    "Caminin mimarı bilinmemektedir. Tek kubbeli, kesme taştan yapılmış bir yapıdır. Son cemaat yeri beş kubbelidir. Klasik Osmanlı dönemine aittir.",
]

GOOD = {
    "name": {"tr": "Kurşunlu Camii", "en": None, "message": 1, "quote": "Kurşunlu Camii, Bursa'nın Osmangazi ilçesinde, Kurşunlu Mahallesi'nde bulunur."},
    "type": {"value": "cami", "message": 1, "quote": "Kurşunlu Camii, Bursa'nın Osmangazi ilçesinde"},
    "district": {"value": "Osmangazi", "message": 1, "quote": "Bursa'nın Osmangazi ilçesinde"},
    "neighborhood": {"value": "Kurşunlu Mahallesi", "message": 1, "quote": "Kurşunlu Mahallesi'nde bulunur"},
    "address": None,
    "era": {"value": "klasik-osmanli", "message": 2, "quote": "Klasik Osmanlı dönemine aittir."},
    "dating": {"display": "1490", "start_year": 1490, "end_year": 1490, "hijri_year": None, "century": None, "confidence": "certain", "message": 1, "quote": "Cami 1490 yılında Hacı Ahmed Bey tarafından yaptırılmıştır."},
    "founder": {"name": "Hacı Ahmed Bey", "role": None, "confidence": "certain", "message": 1, "quote": "Cami 1490 yılında Hacı Ahmed Bey tarafından yaptırılmıştır."},
    "architect": None,
    "summary": {"tr": "Kurşunlu Camii, Osmangazi'de 1490 yılında Hacı Ahmed Bey tarafından yaptırılmış tek kubbeli bir camidir.", "en": None},
    "sections": [
        {"title": "Genel Bakış", "body": "Kurşunlu Camii, Bursa'nın Osmangazi ilçesinde, Kurşunlu Mahallesi'nde bulunur. Cami 1490 yılında Hacı Ahmed Bey tarafından yaptırılmıştır.", "messages": [1]},
        {"title": "Mimari", "body": "Tek kubbeli, kesme taştan yapılmış bir yapıdır. Son cemaat yeri beş kubbelidir. Caminin mimarı bilinmemektedir.", "messages": [2]},
    ],
    "inscriptions": [],
    "missing": ["architect", "address"],
    "conflicts": [],
}


class FakeEvren:
    def __init__(self, *texts, vision='{"subject": "exterior", "confidence": 0.9, "alt_tr": "Tek kubbeli taş bir cami.", "inscription": false}'):
        self.texts = list(texts)
        self.vision_text = vision
        self.calls = []

    def chat(self, messages, **kwargs):
        self.calls.append(messages)
        return Reply(text=self.texts.pop(0), model="fake-text", ms=5)

    def vision(self, prompt, image, mime="image/jpeg", **kwargs):
        self.calls.append(prompt)
        return Reply(text=self.vision_text, model="fake-vision", ms=5)


def job(messages=MESSAGES, files=(), asset_id=None):
    return {"id": str(uuid.uuid4()), "kind": "chat", "title": "Deneme", "city": "bursa", "input": {"messages": [{"text": text, "at": None, "by": None} for text in messages], "files": list(files), "assetId": asset_id}}


def stages(*answers, known=(), **kwargs):
    texts = [answer if isinstance(answer, str) else json.dumps(answer, ensure_ascii=False) for answer in answers]
    return ChatStages(FakeEvren(*texts, **kwargs), known=lambda: list(known), today=lambda: dt.date(2026, 11, 8))


class Text(unittest.TestCase):
    def test_norm_and_slug(self):
        self.assertEqual(norm("  İSTANBUL’un “Camii” —  1490! "), "istanbul un camii 1490")
        self.assertEqual(slug("Kurşunlu Camii (Hacı Ahmed)"), "kursunlu-camii-haci-ahmed")
        self.assertEqual(slug("Ördekli Hamamı"), "ordekli-hamami")

    def test_coverage_allows_turkish_suffixes(self):
        self.assertEqual(coverage("Caminin mimarı bilinmiyor", "Cami mimarı bilinmemektedir"), 1.0)
        self.assertLess(coverage("Mimar Sinan tarafından muhteşem bir şekilde yapılmıştır", "Cami 1490 yılında yaptırılmıştır"), 0.5)


class Draft(unittest.TestCase):
    def test_grounded_answer_makes_a_valid_record(self):
        draft = stages(GOOD).draft_chat(job())
        record = draft.record
        self.assertEqual(draft.asset_id, "bursa-osmangazi-kursunlu-camii")
        self.assertEqual(record["location"], {"region": "marmara", "city": "bursa", "district": "osmangazi", "neighborhood": "Kurşunlu Mahallesi", "address": None})
        self.assertEqual(record["dating"]["start_year"], 1490)
        self.assertEqual(record["dating"]["source_refs"], [{"source_id": "vagabonds-panel", "pages": "mesaj 1"}])
        self.assertEqual(record["meta"]["status"], "draft")
        self.assertEqual(draft.validation["errors"], [])
        self.assertFalse([w for w in draft.validation["warnings"] if "uydurma" in w or "mesajlarda var" in w], draft.validation["warnings"])
        self.assertEqual(draft.ai["promptVersion"], "asset-structure-1")
        self.assertFalse(draft.ai["repaired"])

    def test_invented_year_is_flagged(self):
        answer = copy.deepcopy(GOOD)
        answer["dating"].update(start_year=1485, display="1485")
        draft = stages(answer).draft_chat(job())
        self.assertTrue(any("dating" in w and "1485" in w for w in draft.validation["warnings"]), draft.validation["warnings"])

    def test_quote_not_in_the_messages_is_flagged(self):
        answer = copy.deepcopy(GOOD)
        answer["architect"] = {"name": "Mimar Sinan", "confidence": "certain", "message": 2, "quote": "Caminin mimarı Mimar Sinan'dır."}
        draft = stages(answer).draft_chat(job())
        self.assertTrue(any(w.startswith("architect: alıntılanan cümle mesajlarda yok") for w in draft.validation["warnings"]), draft.validation["warnings"])

    def test_section_with_added_knowledge_is_flagged(self):
        answer = copy.deepcopy(GOOD)
        answer["sections"][1]["body"] += " Yapı, Mimar Sinan'ın çıraklık döneminin en muhteşem eserlerinden biri sayılır ve İznik çinileriyle süslenmiştir."
        draft = stages(answer).draft_chat(job())
        self.assertTrue(any(w.startswith("sections[Mimari]") for w in draft.validation["warnings"]), draft.validation["warnings"])

    def test_quote_joined_with_an_ellipsis_is_found(self):
        answer = copy.deepcopy(GOOD)
        answer["dating"]["quote"] = "Cami 1490 yılında Hacı Ahmed Bey … tarafından yaptırılmıştır."
        draft = stages(answer).draft_chat(job())
        self.assertFalse([w for w in draft.validation["warnings"] if w.startswith("dating")], draft.validation["warnings"])

    def test_guessed_era_is_left_empty(self):
        answer = copy.deepcopy(GOOD)
        answer["era"] = {"value": "erken-osmanli", "message": 1, "quote": "Cami 1490 yılında Hacı Ahmed Bey tarafından yaptırılmıştır."}
        draft = stages(answer).draft_chat(job())
        self.assertIsNone(draft.record["era"])
        self.assertTrue(any(w.startswith("era:") for w in draft.validation["warnings"]))
        self.assertEqual(stages(GOOD).draft_chat(job()).record["era"], "klasik-osmanli", "mesajda söylenen dönem kalır")

    def test_unknown_type_and_era(self):
        answer = copy.deepcopy(GOOD)
        answer["type"]["value"] = "mosque"
        answer["era"]["value"] = "osmanli"
        draft = stages(answer).draft_chat(job())
        self.assertEqual(draft.record["type"], "diger")
        self.assertIsNone(draft.record["era"])

    def test_missing_fields_are_listed(self):
        answer = copy.deepcopy(GOOD)
        answer["district"] = None
        draft = stages(answer).draft_chat(job())
        everything = json.dumps(draft.validation, ensure_ascii=False)
        self.assertIn("/location/district", everything)
        self.assertIn("/architect", everything)
        self.assertEqual(draft.asset_id, "bursa-kursunlu-camii")

    def test_one_repair_then_success(self):
        draft = stages("Elbette! İşte kayıt: {\"name\": \"yarım", GOOD).draft_chat(job())
        self.assertTrue(draft.ai["repaired"])

    def test_still_wrong_after_repair_fails_the_job(self):
        with self.assertRaises(ValueError):
            stages("{}", "{\"name\": 1}").draft_chat(job())

    def test_duplicate_by_name_in_the_same_city(self):
        known = [KnownAsset("bursa-osmangazi-kursunlu-cami", "Kurşunlu Cami", "bursa", None, None)]
        draft = stages(GOOD, known=known).draft_chat(job())
        self.assertEqual(draft.duplicate_of, "bursa-osmangazi-kursunlu-cami")

    def test_no_message_fails(self):
        with self.assertRaises(ValueError):
            stages(GOOD).draft_chat(job(messages=["  "]))


class Photos(unittest.TestCase):
    def photo(self, folder, gps=None):
        from PIL import Image

        path = Path(folder) / f"p{uuid.uuid4().hex[:6]}.jpg"
        image = Image.new("RGB", (640, 480), (120, 110, 90))
        exif = Image.Exif()
        if gps:
            lat, lng = gps
            exif[0x8825] = {1: "N", 2: (float(int(lat)), float(int((lat % 1) * 60)), round(((lat * 60) % 1) * 60, 2)), 3: "E", 4: (float(int(lng)), float(int((lng % 1) * 60)), round(((lng * 60) % 1) * 60, 2))}
        image.save(path, "JPEG", exif=exif)
        return path

    def test_exif_location_and_media(self):
        with tempfile.TemporaryDirectory() as folder:
            with_gps = self.photo(folder, gps=(40.18775, 29.06828))
            plain = self.photo(folder)
            self.assertIsNone(exif_location(plain))
            lat, lng = exif_location(with_gps)
            self.assertAlmostEqual(lat, 40.18775, places=3)
            files = [
                {"path": str(plain), "name": "a.jpg", "mime": "image/jpeg", "key": "assets/x/m01/1280.jpg", "width": 640, "height": 480, "message": 0},
                {"path": str(with_gps), "name": "b.jpg", "mime": "image/jpeg", "key": "assets/x/m02/1280.jpg", "width": 640, "height": 480, "message": 0},
                {"path": str(plain), "name": "c.jpg", "mime": "image/jpeg", "key": None, "width": None, "height": None, "message": 1},
            ]
            draft = stages(GOOD).draft_chat(job(files=files))
        coords = draft.record["location"]["coordinates"]
        self.assertEqual((coords["source"], coords["verified"]), ("photo_exif", False))
        self.assertEqual(len(draft.media), 2)
        self.assertEqual(draft.media[0]["subject"], "exterior")
        self.assertEqual([m["is_cover"] for m in draft.record["media"]], [True, False])
        self.assertTrue(any("c.jpg" in w and "işlenmedi" in w for w in draft.validation["warnings"]))
        self.assertEqual(draft.validation["errors"], [])

    def test_duplicate_close_by(self):
        with tempfile.TemporaryDirectory() as folder:
            path = self.photo(folder, gps=(40.18775, 29.06828))
            files = [{"path": str(path), "name": "b.jpg", "mime": "image/jpeg", "key": "k", "width": 640, "height": 480, "message": 0}]
            known = [KnownAsset("bursa-osmangazi-kursunlu-camii-ve-turbesi", "Kurşunlu Camii ve Türbesi", "bursa", 40.1879, 29.0684)]
            draft = stages(GOOD, known=known).draft_chat(job(files=files))
        self.assertEqual(draft.duplicate_of, "bursa-osmangazi-kursunlu-camii-ve-turbesi")


INTAKE = REPO / "apps" / "api" / "prisma" / "migrations" / "20261108090000_intake" / "migration.sql"
# Yiğit'e önerilen migration (yigit-veri-dongusu.md §1.2); o gelince bu test onu kullanır.
PROPOSED = """
ALTER TABLE intake_job DROP CONSTRAINT intake_job_kind_check;
ALTER TABLE intake_job ADD CONSTRAINT intake_job_kind_check CHECK (kind IN ('pdf', 'chat'));
ALTER TABLE intake_job ALTER COLUMN file_path DROP NOT NULL;
ALTER TABLE intake_job ADD CONSTRAINT intake_job_file_check CHECK ((kind = 'pdf') = (file_path IS NOT NULL));
ALTER TABLE intake_job ADD COLUMN input jsonb;
ALTER TABLE intake_job ADD CONSTRAINT intake_job_input_check CHECK ((kind = 'chat') = (input IS NOT NULL));
ALTER TABLE intake_draft DROP CONSTRAINT intake_draft_check;
ALTER TABLE intake_draft ADD CONSTRAINT intake_draft_job_check CHECK ((kind = 'inscription') = (job_id IS NULL));
"""


class ChatJobOnLocalDb(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.schema = f"intake_test_{uuid.uuid4().hex[:8]}"
        try:
            cls.conn = connect(load_env(), schema=cls.schema)
        except LocalOnlyError:
            raise
        except Exception as error:  # noqa: BLE001
            raise unittest.SkipTest(f"yerel veritabanı yok: {type(error).__name__}")
        cls.conn.execute(f'create schema "{cls.schema}"')
        cls.conn.execute(INTAKE.read_text(encoding="utf-8"))
        cls.conn.execute(PROPOSED)

    @classmethod
    def tearDownClass(cls):
        cls.conn.execute(f'drop schema if exists "{cls.schema}" cascade')
        cls.conn.close()

    def test_chat_job_becomes_one_pending_field_draft_and_reruns_in_place(self):
        from psycopg.types.json import Jsonb

        chat_input = job()["input"]
        job_id = self.conn.execute("insert into intake_job (kind, title, city, input) values ('chat', 'Kurşunlu', 'bursa', %s) returning id", (Jsonb(chat_input),)).fetchone()[0]
        steps = stages(GOOD, GOOD)
        self.assertTrue(worker.work_once(self.conn, steps))
        self.assertEqual(self.conn.execute("select status, progress_done, progress_total from intake_job where id = %s", (job_id,)).fetchone(), ("done", 1, 1))
        rows = self.conn.execute("select kind, entry_key, asset_id, status from intake_draft where job_id = %s", (job_id,)).fetchall()
        self.assertEqual(rows, [("field_asset", "chat", "bursa-osmangazi-kursunlu-camii", "pending")])
        # Yetkili yeni mesaj yazdı: API işi yeniden kuyruğa koyar, taslak yerinde yenilenir.
        self.conn.execute("update intake_job set status = 'queued' where id = %s", (job_id,))
        self.assertTrue(worker.work_once(self.conn, steps))
        self.assertEqual(self.conn.execute("select count(*) from intake_draft where job_id = %s", (job_id,)).fetchone()[0], 1)

    def test_pdf_jobs_still_need_a_file(self):
        import psycopg

        with self.assertRaises(psycopg.errors.CheckViolation):
            self.conn.execute("insert into intake_job (kind, title, city) values ('pdf', 'x', 'bursa')")


if __name__ == "__main__":
    unittest.main()
