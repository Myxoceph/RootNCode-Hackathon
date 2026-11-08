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

from chat import ChatStages, Findings, KnownAsset, coverage, exif_location, first_sentence, grounded_text, norm, slug  # noqa: E402
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
        self.assertEqual(draft.ai["promptVersion"], "asset-structure-2")
        self.assertFalse(draft.ai["repaired"])

    def test_invented_year_never_enters_the_draft(self):
        answer = copy.deepcopy(GOOD)
        answer["dating"].update(start_year=1485, display="1485")
        draft = stages(answer).draft_chat(job())
        self.assertIsNone(draft.record["dating"])
        self.assertTrue(any(w.startswith("kaynaksız: dating") and "1485" in w for w in draft.validation["warnings"]), draft.validation["warnings"])

    def test_value_whose_quote_is_not_in_the_messages_never_enters_the_draft(self):
        answer = copy.deepcopy(GOOD)
        answer["architect"] = {"name": "Mimar Sinan", "confidence": "certain", "message": 2, "quote": "Caminin mimarı Mimar Sinan'dır."}
        draft = stages(answer).draft_chat(job())
        self.assertIsNone(draft.record["architect"])
        self.assertNotIn("Sinan", json.dumps(draft.record, ensure_ascii=False))
        self.assertTrue(any(w.startswith("kaynaksız: architect") for w in draft.validation["warnings"]), draft.validation["warnings"])

    def test_a_reworded_quote_is_not_verbatim(self):
        answer = copy.deepcopy(GOOD)
        answer["founder"]["quote"] = "Cami 1490'da Hacı Ahmed Bey tarafından yaptırıldı."
        draft = stages(answer).draft_chat(job())
        self.assertIsNone(draft.record["founder"])

    def test_every_quote_left_in_the_draft_is_verbatim_in_a_message(self):
        """Plan §7 "Alıntı kuralı": taslakta kalan her değerin alıntısı mesajda kelimesi kelimesine geçer."""
        from chat import ELLIPSIS, qnorm

        answer = copy.deepcopy(GOOD)
        answer["architect"] = {"name": "Mimar Sinan", "confidence": "certain", "message": 2, "quote": "Mimar Sinan yaptı."}
        answer["dating"]["quote"] = "Cami 1490 yılında yapıldı."
        draft = stages(answer).draft_chat(job())
        texts = [qnorm(text) for text in MESSAGES]
        self.assertTrue(draft.source_refs)
        for ref in draft.source_refs:
            for part in ELLIPSIS.split(ref["quote"]):
                if qnorm(part):
                    self.assertTrue(any(qnorm(part) in text for text in texts), ref)
        fields = {ref["field"] for ref in draft.source_refs}
        self.assertNotIn("/architect/name", fields)
        self.assertNotIn("/dating", fields)

    def test_section_with_added_knowledge_never_enters_the_draft(self):
        answer = copy.deepcopy(GOOD)
        answer["sections"][1]["body"] += " Yapı, Mimar Sinan'ın çıraklık döneminin en muhteşem eserlerinden biri sayılır ve İznik çinileriyle süslenmiştir."
        draft = stages(answer).draft_chat(job())
        self.assertEqual([section["title"]["tr"] for section in draft.record["sections"]], ["Genel Bakış"])
        self.assertTrue(any(w.startswith("kaynaksız: sections[Mimari]") for w in draft.validation["warnings"]), draft.validation["warnings"])

    def test_a_section_retold_in_plain_turkish_stays(self):
        # Muradiye denemesi (2026-11-08): model mesajı dolgu kelimelerle yeniden kurdu, eski %85 kuralı bölümü attı.
        source = "Muradiye Camii\nManisa'da, Şehzadeler ilçesinde, şehir merkezinde. Tek kubbeli, son cemaat yeri revaklı bir camidir. İçi İznik çinileriyle süslü. Avlusunda bir şadırvan var."
        body = "Muradiye Camii, Manisa'nın Şehzadeler ilçesinde, şehir merkezinde yer almaktadır. Tek kubbeli, son cemaat yeri revaklı bir camidir. İç mekan İznik çinileriyle süslüdür ve avlusunda bir şadırvan bulunmaktadır."
        found = Findings()
        self.assertTrue(grounded_text("sections[Genel Bakış]", body, source, found), found.warnings)

    def test_a_new_name_or_year_in_a_section_throws_it_out(self):
        source = "Muradiye Camii\nYapımı 1583'te başladı, 1586'da bitti. Planı Mimar Sinan'ın."
        for body in ("Yapımı 1583'te başladı, 1586'da bitti; 1590'da onarıldı.", "Planı Mimar Sinan'ın, kalfası Mimar Davud Ağa'dır."):
            found = Findings()
            self.assertFalse(grounded_text("sections[Tarihçe]", body, source, found), body)
            self.assertIn("mesajlarda olmayan ad ya da sayı", found.warnings[0])

    def test_first_sentence_skips_a_title_line(self):
        self.assertEqual(first_sentence(["Muradiye Camii\nManisa'da, Şehzadeler ilçesinde. Tek kubbeli."]), "Manisa'da, Şehzadeler ilçesinde.")
        self.assertEqual(first_sentence(["Cami 1490'da yapıldı. Tek kubbeli."]), "Cami 1490'da yapıldı.")

    def test_several_architects_are_one_name_and_candidates(self):
        messages = [*MESSAGES, "Planı Mimar Sinan'ın. İnşaatı Mimar Mahmud Ağa başlattı, Mimar Davud Ağa tamamladı."]
        quote = "Planı Mimar Sinan'ın. İnşaatı Mimar Mahmud Ağa başlattı, Mimar Davud Ağa tamamladı."
        joined = copy.deepcopy(GOOD)
        joined["architect"] = {"name": "Mimar Sinan, Mimar Mahmud Ağa, Mimar Davud Ağa", "confidence": "certain", "message": 3, "quote": quote}
        apart = copy.deepcopy(GOOD)
        apart["architect"] = {"name": "Mimar Sinan", "confidence": "certain", "message": 3, "quote": quote, "others": [
            {"name": "Mimar Mahmud Ağa", "note": "inşaatı başlattı", "message": 3, "quote": quote},
            {"name": "Mimar Davud Ağa", "note": "tamamladı", "message": 3, "quote": quote},
        ]}
        for answer in (joined, apart):
            architect = stages(answer).draft_chat(job(messages=messages)).record["architect"]
            self.assertEqual(architect["name"], "Mimar Sinan")
            self.assertEqual(architect["confidence"], "probable", "yalnızca planı: kesin değil")
            self.assertEqual([c["name"] for c in architect["candidates"]], ["Mimar Mahmud Ağa", "Mimar Davud Ağa"])

    def test_no_section_left_keeps_the_messages_as_one(self):
        # Kayhan Hamamı denemesi: tek satırlık sohbet, bölüm kalmadı, şema "sections boş olamaz" dedi.
        answer = copy.deepcopy(GOOD)
        answer["sections"] = [{"title": "Genel Bakış", "body": "Osmanlı mimarisinin muhteşem bir örneği olan bu yapı Mimar Sinan eseridir.", "messages": [1]}]
        draft = stages(answer).draft_chat(job())
        self.assertEqual([s["title"]["tr"] for s in draft.record["sections"]], ["Genel Bakış"])
        self.assertIn("Hacı Ahmed Bey", draft.record["sections"][0]["body"]["tr"])
        self.assertNotIn("/sections", draft.validation["missing"])
        self.assertFalse([e for e in draft.validation["errors"] if "sections" in e], draft.validation["errors"])

    def test_an_answered_unknown_closes_the_question(self):
        messages = [*MESSAGES, "Mimar: Bilinmiyor; kitabede mimar adı geçmiyor."]
        draft = stages(GOOD).draft_chat(job(messages=messages))
        self.assertNotIn("/architect", draft.validation["missing"])
        self.assertIn("/architect", stages(GOOD).draft_chat(job()).validation["missing"], "cevaplanmadıkça soru durur")
        self.assertTrue(any("bilinmediğini" in w for w in draft.validation["warnings"]))

    def test_an_ungrounded_name_blocks_approval(self):
        answer = copy.deepcopy(GOOD)
        answer["name"]["quote"] = "Yeni Cami güzeldir."
        draft = stages(answer).draft_chat(job())
        self.assertTrue(any(e.startswith("name:") for e in draft.validation["errors"]))

    def test_an_ungrounded_summary_falls_back_to_the_first_sentence(self):
        answer = copy.deepcopy(GOOD)
        answer["summary"]["tr"] = "Mimar Sinan'ın İznik çinileriyle süslediği muhteşem bir yapıdır."
        draft = stages(answer).draft_chat(job())
        self.assertEqual(draft.record["summary"]["tr"], MESSAGES[0].split(". ")[0] + ".")

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
        self.assertTrue(any(w.startswith("kaynaksız: era") for w in draft.validation["warnings"]))
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

    def test_a_photo_without_a_building_has_no_subject(self):
        with tempfile.TemporaryDirectory() as folder:
            files = [{"path": str(self.photo(folder)), "name": "a.jpg", "mime": "image/jpeg", "key": "k", "width": 640, "height": 480, "message": 0}]
            for seen in ('{"building": false, "subject": "portal", "confidence": 0.8, "alt_tr": "Düz renk üzerinde yazı.", "inscription": false}',
                         '{"building": true, "subject": "portal", "confidence": 0.2, "alt_tr": "Bulanık.", "inscription": false}'):
                draft = stages(GOOD, vision=seen).draft_chat(job(files=files))
                self.assertEqual(draft.media[0]["subject"], "other", seen)

    def test_duplicate_close_by(self):
        with tempfile.TemporaryDirectory() as folder:
            path = self.photo(folder, gps=(40.18775, 29.06828))
            files = [{"path": str(path), "name": "b.jpg", "mime": "image/jpeg", "key": "k", "width": 640, "height": 480, "message": 0}]
            known = [KnownAsset("bursa-osmangazi-kursunlu-camii-ve-turbesi", "Kurşunlu Camii ve Türbesi", "bursa", 40.1879, 29.0684)]
            draft = stages(GOOD, known=known).draft_chat(job(files=files))
        self.assertEqual(draft.duplicate_of, "bursa-osmangazi-kursunlu-camii-ve-turbesi")


MIGRATIONS = REPO / "apps" / "api" / "prisma" / "migrations"


def intake_migrations():
    """Yiğit'in intake migration'ları, sırasıyla (20261108090000_intake, …_intake_chat …)."""
    return sorted(MIGRATIONS.glob("2026*_intake*/migration.sql"))


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
        for migration in intake_migrations():
            cls.conn.execute(migration.read_text(encoding="utf-8"))

    @classmethod
    def tearDownClass(cls):
        cls.conn.execute(f'drop schema if exists "{cls.schema}" cascade')
        cls.conn.close()

    def setUp(self):
        self.conn.execute("delete from intake_job")

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

    def test_a_message_arriving_while_drafting_is_not_lost(self):
        from psycopg.types.json import Jsonb

        job_id = self.conn.execute("insert into intake_job (kind, title, city, input) values ('chat', 'Kurşunlu', 'bursa', %s) returning id", (Jsonb(job()["input"]),)).fetchone()[0]
        inner = stages(GOOD)
        conn = self.conn

        class MessageMeanwhile:
            def draft_chat(self, chat_job):
                # Taslak yazılırken (API'nin 409'una rağmen bir şekilde) girdi değişti ve iş yeniden kuyruğa girdi.
                conn.execute("update intake_job set status = 'queued', updated_at = now() where id = %s", (job_id,))
                return inner.draft_chat(chat_job)

        self.assertTrue(worker.work_once(self.conn, MessageMeanwhile()))
        self.assertEqual(self.conn.execute("select status from intake_job where id = %s", (job_id,)).fetchone()[0], "queued", "done yazılmaz, iş yeniden alınır")

    def test_pdf_jobs_still_need_a_file(self):
        import psycopg

        with self.assertRaises(psycopg.errors.CheckViolation):
            self.conn.execute("insert into intake_job (kind, title, city) values ('pdf', 'x', 'bursa')")


if __name__ == "__main__":
    unittest.main()
