"""Yayın adımı (H6): geçici bir veri seti klasöründe; gerçek data/eserler'e ve manifeste dokunulmaz."""

import datetime as dt
import json
import shutil
import sys
import tempfile
import unittest
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from config import INTAKE_CACHE, REPO, load_env  # noqa: E402
from db import LocalOnlyError, connect  # noqa: E402
from publish import INSCRIPTION_SOURCE, NO_DISTRICT, Paths, PublishError, publish, publish_inscription, publish_once  # noqa: E402

import test_chat  # noqa: E402

TODAY = dt.date(2026, 11, 9)


def approved_record(**changes):
    """Sohbet adımının gerçek çıktısı; API onayda en üste `status` yazar."""
    record = test_chat.stages(test_chat.GOOD).draft_chat(test_chat.job()).record
    record.update(changes)
    record["status"] = "published"
    return record


class Publish(unittest.TestCase):
    def setUp(self):
        self.folder = Path(tempfile.mkdtemp())
        self.paths = Paths(eserler=self.folder / "eserler", manifest=self.folder / "media-manifest.json", media=self.folder / "media")
        self.paths.eserler.mkdir()
        self.imported = []

    def tearDown(self):
        shutil.rmtree(self.folder, ignore_errors=True)

    def run_publish(self, record, asset_id="bursa-osmangazi-kursunlu-camii", in_db=False, importer=None):
        return publish(record, asset_id, "Ayşe Uzman", lambda _id: in_db, importer or self.imported.append, self.paths, TODAY)

    def test_an_asset_without_coordinates_is_published(self):
        record = approved_record()
        self.assertNotIn("coordinates", record["location"])
        path = self.run_publish(record)
        self.assertEqual(path, self.paths.eserler / "bursa" / "osmangazi" / "bursa-osmangazi-kursunlu-camii.json")
        written = json.loads(path.read_text(encoding="utf-8"))
        self.assertNotIn("status", written, "API'nin üst düzey status'u veri setine girmez")
        self.assertEqual(written["meta"]["status"], "published")
        self.assertEqual(written["meta"]["reviewed_by"], "Ayşe Uzman")
        self.assertEqual(written["meta"]["updated_at"], "2026-11-09")
        self.assertEqual(self.imported, ["bursa-osmangazi-kursunlu-camii"])

    def test_an_asset_without_a_district_goes_to_its_own_folder(self):
        record = approved_record()
        record["location"]["district"] = ""
        path = self.run_publish(record, asset_id="bursa-kursunlu-camii")
        self.assertEqual(path.parent.name, NO_DISTRICT)

    def test_an_existing_id_is_never_overwritten(self):
        other = self.paths.eserler / "bursa" / "osmangazi" / "bursa-osmangazi-kursunlu-camii.json"
        other.parent.mkdir(parents=True)
        other.write_text("{\"elle\": true}", encoding="utf-8")
        with self.assertRaises(PublishError):
            self.run_publish(approved_record())
        self.assertEqual(other.read_text(encoding="utf-8"), "{\"elle\": true}")
        with self.assertRaises(PublishError):
            self.run_publish(approved_record(), asset_id="bursa-osmangazi-yeni-cami", in_db=True)
        self.assertEqual(self.imported, [])

    def test_an_import_failure_leaves_nothing_behind(self):
        self.paths.manifest.write_text("{\"x\": {}}", encoding="utf-8")

        def broken(_id):
            raise RuntimeError("veritabanı kapalı")

        with self.assertRaises(PublishError) as caught:
            self.run_publish(approved_record(), importer=broken)
        self.assertIn("veritabanı kapalı", str(caught.exception))
        self.assertEqual(list(self.paths.eserler.rglob("*.json")), [])
        self.assertEqual(list(self.paths.eserler.iterdir()), [], "açılan klasörler de geri alınır")
        self.assertEqual(self.paths.manifest.read_text(encoding="utf-8"), "{\"x\": {}}")

    def test_an_invalid_record_is_not_published(self):
        record = approved_record()
        record["type"] = "uzay-gemisi"
        with self.assertRaises(PublishError) as caught:
            self.run_publish(record)
        self.assertIn("validate.py", str(caught.exception))
        self.assertEqual(list(self.paths.eserler.rglob("*.json")), [])

    def test_photos_are_processed_into_the_asset_layout(self):
        from PIL import Image

        incoming = REPO / "data" / "build" / "cache" / "intake" / f"test-{uuid.uuid4().hex[:8]}"
        incoming.mkdir(parents=True)
        try:
            photo = incoming / "1.jpg"
            Image.new("RGB", (900, 600), (140, 120, 100)).save(photo, "JPEG")
            record = approved_record()
            record["media"] = [{
                "id": "m01", "type": "photo", "is_cover": True, "order": 1,
                "source": {"provider": "local", "path": str(photo.relative_to(REPO)), "original_name": "1.jpg"},
                "caption": {"tr": "Kurşunlu Camii", "en": None}, "alt": {"tr": "Taş bir cami.", "en": None},
                "credit": "Vagabonds yönetim paneli", "license": "belirsiz",
            }]
            self.run_publish(record)
        finally:
            shutil.rmtree(incoming, ignore_errors=True)
        manifest = json.loads(self.paths.manifest.read_text(encoding="utf-8"))
        variants = manifest["bursa-osmangazi-kursunlu-camii"]["m01"]["variants"]
        self.assertTrue(all(v["key"].startswith("assets/bursa-osmangazi-kursunlu-camii/m01-") for v in variants))
        self.assertTrue(all((self.paths.media / v["key"]).exists() for v in variants))


# Gerçek bir eser (kitabesi olan), geçici klasöre kopyalanır.
ASSET = "bursa-osmangazi-hz-uftade-turbesi"


def expert_reading(**changes):
    """Uzmanın onayda yazdığı kitabe (InscriptionDraft)."""
    reading = {
        "language": "tr-ottoman", "script": "talik", "transliteration": "Hilâfet menzilet Abdü'l-mecîd Hân",
        "translationTr": "Halifelik makamındaki Abdülmecid Han", "translationEn": None, "uncertain": [], "location": "kapının üstü",
    }
    reading.update(changes)
    return reading


class PublishInscription(unittest.TestCase):
    def setUp(self):
        from PIL import Image

        self.folder = Path(tempfile.mkdtemp())
        self.paths = Paths(eserler=self.folder / "eserler", manifest=self.folder / "media-manifest.json", media=self.folder / "media")
        source = next((REPO / "data" / "eserler").rglob(f"{ASSET}.json"))
        self.file = self.paths.eserler / source.relative_to(REPO / "data" / "eserler")
        self.file.parent.mkdir(parents=True)
        shutil.copyfile(source, self.file)
        self.paths.manifest.write_text(json.dumps({ASSET: {"m01": {"sha256": "x"}}}), encoding="utf-8")
        self.draft_id = str(uuid.uuid4())
        photo = self.paths.media / "intake" / self.draft_id
        photo.mkdir(parents=True)
        for width in (480, 1280):
            Image.new("RGB", (width, width * 2 // 3), (150, 130, 110)).save(photo / f"{width}.jpg", "JPEG")
        self.media = [{"key": f"intake/{self.draft_id}/1280.jpg", "width": 1280, "height": 853, "subject": "inscription", "arTargetCandidate": True}]
        self.imported = []

    def tearDown(self):
        shutil.rmtree(self.folder, ignore_errors=True)
        shutil.rmtree(INTAKE_CACHE / self.draft_id, ignore_errors=True)

    def run_publish(self, reading=None, importer=None, media=None):
        return publish_inscription(reading or expert_reading(), media or self.media, self.draft_id, ASSET, "Ayşe Uzman", importer or self.imported.append, self.paths, TODAY)

    def test_the_inscription_and_its_photo_are_added_to_the_asset(self):
        before = json.loads(self.file.read_text(encoding="utf-8"))
        self.assertEqual(self.run_publish(), self.file)
        after = json.loads(self.file.read_text(encoding="utf-8"))
        self.assertEqual(len(after["inscriptions"]), len(before["inscriptions"]) + 1)
        added = after["inscriptions"][-1]
        photo = after["media"][-1]
        self.assertEqual(added["id"], f"gonullu-{self.draft_id.replace('-', '')[:8]}")
        self.assertEqual(added["language"], "tr-ottoman")
        self.assertEqual(added["translation"], {"tr": "Halifelik makamındaki Abdülmecid Han", "en": None})
        self.assertEqual(added["location"]["tr"], "kapının üstü")
        self.assertEqual(added["source_refs"], [{"source_id": INSCRIPTION_SOURCE}])
        self.assertIn("Ayşe Uzman", added["note"]["tr"])
        self.assertEqual(added["ar_target_media_id"], photo["id"])
        self.assertEqual((photo["subject"], photo["license"]), ("inscription", "ziyaretci-katkisi"))
        self.assertNotIn(photo["id"], {m["id"] for m in before["media"]})
        # Fotoğraf eserin düzeninde işlenir; manifestteki eski fotoğraflar kalır.
        manifest = json.loads(self.paths.manifest.read_text(encoding="utf-8"))
        self.assertIn("m01", manifest[ASSET])
        self.assertTrue(all(v["key"].startswith(f"assets/{ASSET}/{photo['id']}-") for v in manifest[ASSET][photo["id"]]["variants"]))
        self.assertEqual(self.imported, [ASSET])

    def test_no_ar_target_unless_the_photo_would_do(self):
        self.run_publish(media=[{**self.media[0], "arTargetCandidate": False}])
        after = json.loads(self.file.read_text(encoding="utf-8"))
        self.assertIsNone(after["inscriptions"][-1]["ar_target_media_id"])
        self.assertEqual(after["media"][-1]["subject"], "inscription", "fotoğraf yine eklenir")

    def test_an_unread_inscription_is_not_published(self):
        original = self.file.read_text(encoding="utf-8")
        for reading in (expert_reading(language=None), expert_reading(transliteration=None, translationTr=" ")):
            with self.subTest(reading=reading), self.assertRaises(PublishError):
                self.run_publish(reading)
        self.assertEqual(self.file.read_text(encoding="utf-8"), original)

    def test_a_failure_puts_everything_back(self):
        original = self.file.read_text(encoding="utf-8")
        manifest = self.paths.manifest.read_text(encoding="utf-8")

        def broken(_id):
            raise RuntimeError("veritabanı kapalı")

        with self.assertRaises(PublishError):
            self.run_publish(importer=broken)
        self.assertEqual(self.file.read_text(encoding="utf-8"), original)
        self.assertEqual(self.paths.manifest.read_text(encoding="utf-8"), manifest)
        self.assertEqual(list((self.paths.media / "assets").rglob("*.jpg")) if (self.paths.media / "assets").exists() else [], [])
        self.assertFalse((INTAKE_CACHE / self.draft_id).exists())

    def test_published_once(self):
        self.run_publish()
        with self.assertRaises(PublishError):
            self.run_publish()

    def test_an_asset_not_in_the_dataset(self):
        with self.assertRaises(PublishError):
            publish_inscription(expert_reading(), self.media, self.draft_id, "bursa-yok-boyle-bir-eser", None, self.imported.append, self.paths, TODAY)


class PublishQueue(unittest.TestCase):
    """Onaylı taslakların kuyruğu, yerel veritabanında kendine ait bir şemada."""

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
        for migration in test_chat.intake_migrations():
            cls.conn.execute(migration.read_text(encoding="utf-8"))

    @classmethod
    def tearDownClass(cls):
        cls.conn.execute(f'drop schema if exists "{cls.schema}" cascade')
        cls.conn.close()

    def setUp(self):
        self.conn.execute("delete from intake_job")
        self.folder = Path(tempfile.mkdtemp())
        self.paths = Paths(eserler=self.folder / "eserler", manifest=self.folder / "m.json", media=self.folder / "media", ar_targets=self.folder / "ar-targets.json")
        self.paths.eserler.mkdir()
        self.said = []

    def tearDown(self):
        shutil.rmtree(self.folder, ignore_errors=True)

    def approved(self, asset_id="bursa-osmangazi-kursunlu-camii"):
        from psycopg.types.json import Jsonb

        job_id = self.conn.execute("insert into intake_job (kind, title, city, input) values ('chat', 'x', 'bursa', %s) returning id", (Jsonb(test_chat.job()["input"]),)).fetchone()[0]
        record = approved_record()
        record["meta"]["reviewed_by"] = "Ayşe Uzman"
        return self.conn.execute(
            """insert into intake_draft (kind, status, job_id, entry_key, asset_id, record, reviewed_at)
               values ('field_asset', 'approved', %s, 'chat', %s, %s, now()) returning id""",
            (job_id, asset_id, Jsonb(record)),
        ).fetchone()[0]

    def state(self, draft_id):
        return self.conn.execute("select applied_at is not null, apply_error from intake_draft where id = %s", (draft_id,)).fetchone()

    def test_nothing_to_publish(self):
        self.assertFalse(publish_once(self.conn, {}, self.said.append, self.paths, importer=lambda _id: None))

    def test_an_approved_draft_is_published_once(self):
        draft_id = self.approved()
        imported = []
        self.assertTrue(publish_once(self.conn, {}, self.said.append, self.paths, importer=imported.append))
        self.assertEqual(self.state(draft_id), (True, None))
        self.assertEqual(imported, ["bursa-osmangazi-kursunlu-camii"])
        self.assertIn("koordinatsız", self.said[-1])
        self.assertFalse(publish_once(self.conn, {}, self.said.append, self.paths, importer=imported.append), "yayınlanan yeniden yayınlanmaz")

    def test_an_approved_inscription_is_published_into_its_asset(self):
        from psycopg.types.json import Jsonb
        from PIL import Image

        source = next((REPO / "data" / "eserler").rglob(f"{ASSET}.json"))
        target = self.paths.eserler / source.relative_to(REPO / "data" / "eserler")
        target.parent.mkdir(parents=True)
        shutil.copyfile(source, target)
        draft_id = str(uuid.uuid4())
        (self.paths.media / "intake" / draft_id).mkdir(parents=True)
        Image.new("RGB", (900, 600), (150, 130, 110)).save(self.paths.media / "intake" / draft_id / "1280.jpg", "JPEG")
        media = [{"key": f"intake/{draft_id}/1280.jpg", "width": 900, "height": 600, "subject": "inscription", "subjectConfidence": None,
                  "alt": None, "caption": None, "pdfPage": None, "arTargetCandidate": False}]
        self.conn.execute(
            """insert into intake_draft (id, kind, status, asset_id, record, media, reviewed_at)
               values (%s, 'inscription', 'approved', %s, %s, %s, now())""",
            (draft_id, ASSET, Jsonb(expert_reading()), Jsonb(media)),
        )
        imported = []
        try:
            self.assertTrue(publish_once(self.conn, {}, self.said.append, self.paths, importer=imported.append, compile_ar=self.never))
        finally:
            shutil.rmtree(INTAKE_CACHE / draft_id, ignore_errors=True)
        self.assertEqual(self.state(draft_id), (True, None))
        self.assertEqual(imported, [ASSET])
        self.assertIn("kitabe eklendi", self.said[-1])

    def never(self, asset_id):
        self.fail(f"AR'a uygun olmayan fotoğraf derlenmemeli ({asset_id})")

    def inscription_draft(self, ar_target):
        from psycopg.types.json import Jsonb
        from PIL import Image

        source = next((REPO / "data" / "eserler").rglob(f"{ASSET}.json"))
        target = self.paths.eserler / source.relative_to(REPO / "data" / "eserler")
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        draft_id = str(uuid.uuid4())
        self.addCleanup(shutil.rmtree, INTAKE_CACHE / draft_id, True)
        (self.paths.media / "intake" / draft_id).mkdir(parents=True)
        Image.new("RGB", (900, 600), (150, 130, 110)).save(self.paths.media / "intake" / draft_id / "1280.jpg", "JPEG")
        media = [{"key": f"intake/{draft_id}/1280.jpg", "width": 900, "height": 600, "subject": "inscription", "arTargetCandidate": ar_target}]
        self.conn.execute(
            "insert into intake_draft (id, kind, status, asset_id, record, media, reviewed_at) values (%s, 'inscription', 'approved', %s, %s, %s, now())",
            (draft_id, ASSET, Jsonb(expert_reading()), Jsonb(media)),
        )
        return draft_id

    def test_a_scannable_inscription_is_compiled_and_imported_again(self):
        draft_id = self.inscription_draft(ar_target=True)
        imported, compiled = [], []

        def compile_ar(asset_id):
            compiled.append(asset_id)
            media_id = json.loads(next(self.paths.eserler.rglob(f"{asset_id}.json")).read_text(encoding="utf-8"))["inscriptions"][-1]["ar_target_media_id"]
            self.paths.ar_targets.write_text(json.dumps({"targets": {asset_id: {media_id: {"sha256": "x", "key": "k", "bytes": 1}}}}), encoding="utf-8")

        publish_once(self.conn, {}, self.said.append, self.paths, importer=imported.append, compile_ar=compile_ar)
        self.assertEqual(self.state(draft_id), (True, None))
        self.assertEqual(compiled, [ASSET])
        self.assertEqual(imported, [ASSET, ASSET], "derlemeden sonra eser yeniden aktarılır")
        self.assertIn("taranabilir", self.said[-1])

    def test_a_failed_compile_keeps_the_inscription_published(self):
        draft_id = self.inscription_draft(ar_target=True)
        imported = []
        publish_once(self.conn, {}, self.said.append, self.paths, importer=imported.append, compile_ar=lambda _id: "Chrome bulunamadı")
        self.assertEqual(self.state(draft_id), (True, None), "kitabe yayında kalır")
        self.assertEqual(imported, [ASSET])
        self.assertIn("Chrome bulunamadı", self.said[-1])
        self.assertIn(f"--inscriptions-of={ASSET}", self.said[-1])

    def test_a_failure_is_written_and_not_retried_on_its_own(self):
        draft_id = self.approved()

        def broken(_id):
            raise RuntimeError("aktarılamadı")

        publish_once(self.conn, {}, self.said.append, self.paths, importer=broken)
        applied, error = self.state(draft_id)
        self.assertFalse(applied)
        self.assertIn("aktarılamadı", error)
        self.assertFalse(publish_once(self.conn, {}, self.said.append, self.paths, importer=broken))


if __name__ == "__main__":
    unittest.main()
