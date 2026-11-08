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

from config import REPO, load_env  # noqa: E402
from db import LocalOnlyError, connect  # noqa: E402
from publish import NO_DISTRICT, Paths, PublishError, publish, publish_once  # noqa: E402

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
        self.paths = Paths(eserler=self.folder / "eserler", manifest=self.folder / "m.json", media=self.folder / "media")
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
