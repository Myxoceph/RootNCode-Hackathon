"""Worker'ın durum makinesi, yerel veritabanında, kendine ait geçici bir şemada.

Her test sınıfı bir şema açar (`intake_test_<rastgele>`), Yiğit'in migration'ını oraya kurar ve sonunda
şemayı siler: `public`'teki tablolara ve verilere dokunulmaz. Yerel veritabanı yoksa testler atlanır.
"""

import sys
import unittest
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from config import REPO, load_env  # noqa: E402
from db import LocalOnlyError, connect  # noqa: E402
from stages import Draft, MapResult  # noqa: E402

import worker  # noqa: E402

MIGRATIONS = sorted((REPO / "apps" / "api" / "prisma" / "migrations").glob("2026*_intake*/migration.sql"))


def entry(key, pages, parent=None):
    return {"key": key, "titleTr": key.replace("-", " ").title(), "titleEn": None, "district": "karatay", "printedPages": None, "pdfPages": pages, "parentKey": parent, "proposedId": f"konya-karatay-{key}"}


BOOK_MAP = [entry("ulu-camii", [10, 12]), entry("ulu-camii-sadirvani", [12, 12], "ulu-camii"), entry("kadi-hamami", [13, 15])]


class FakeStages:
    """Harita üç eser; her eserin taslağı. `stop_at` o eserde worker'ın kapandığını taklit eder."""

    def __init__(self, book_map=BOOK_MAP, stop_at=None, fail_at=None, bad_media=False):
        self.book_map = book_map
        self.stop_at = stop_at
        self.fail_at = fail_at
        self.bad_media = bad_media
        self.drafted = []

    def map_book(self, job):
        return MapResult(layout={"spread": True, "columns": ["tr", "en"], "pageOffset": 0}, book_map=self.book_map)

    def draft_entry(self, job, item):
        if item["key"] == self.stop_at:
            self.stop_at = None
            raise KeyboardInterrupt
        if item["key"] == self.fail_at:
            raise RuntimeError("PDF okunamadı")
        self.drafted.append(item["key"])
        media = [{"key": f"assets/{item['proposedId']}/m01-abc/1280.jpg", "width": 1280, "height": 853, "subject": "portal" if not self.bad_media else "kapı", "subjectConfidence": 0.8, "alt": None, "caption": None, "pdfPage": item["pdfPages"][0]}]
        return Draft(
            asset_id=item["proposedId"],
            record={"id": item["proposedId"], "name": {"tr": item["titleTr"]}},
            media=media,
            source_refs=[{"field": "/name/tr", "pages": [item["pdfPages"][0]]}],
            ai={"model": "fake", "promptVersion": "0", "confidence": None, "repaired": False, "ms": 1},
        )


class WorkerOnLocalDb(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        env = load_env()
        if not MIGRATIONS:
            raise unittest.SkipTest("intake migration yok")
        cls.schema = f"intake_test_{uuid.uuid4().hex[:8]}"
        try:
            cls.conn = connect(env, schema=cls.schema)
        except LocalOnlyError:
            raise
        except Exception as error:  # noqa: BLE001
            raise unittest.SkipTest(f"yerel veritabanı yok: {type(error).__name__}")
        cls.conn.execute(f'create schema "{cls.schema}"')
        for migration in MIGRATIONS:
            cls.conn.execute(migration.read_text(encoding="utf-8"))

    @classmethod
    def tearDownClass(cls):
        cls.conn.execute(f'drop schema if exists "{cls.schema}" cascade')
        cls.conn.close()

    def setUp(self):
        self.conn.execute("delete from intake_job")

    def job(self):
        return self.conn.execute("insert into intake_job (title, city, file_path) values ('Deneme', 'konya', '/tmp/yok.pdf') returning id").fetchone()[0]

    def state(self, job_id):
        return self.conn.execute("select status, progress_done, progress_total, error from intake_job where id = %s", (job_id,)).fetchone()

    def drafts(self, job_id):
        return self.conn.execute("select entry_key, asset_id, status from intake_draft where job_id = %s order by entry_key", (job_id,)).fetchall()

    def confirm(self, job_id):
        self.conn.execute("update intake_job set status = 'map_confirmed', map_confirmed_at = now() where id = %s", (job_id,))

    def test_tables_are_in_the_test_schema_not_public(self):
        schema = self.conn.execute("select table_schema from information_schema.tables where table_name = 'intake_job' and table_schema = %s", (self.schema,)).fetchone()
        self.assertEqual(schema[0], self.schema)

    def test_empty_queue(self):
        self.assertFalse(worker.work_once(self.conn, FakeStages()))

    def test_whole_way_with_a_person_confirming_the_map(self):
        job_id = self.job()
        stages = FakeStages()
        self.assertTrue(worker.work_once(self.conn, stages))
        self.assertEqual(self.state(job_id)[:3], ("needs_map", 0, 3))
        self.assertFalse(worker.work_once(self.conn, stages), "needs_map bir kişiyi bekler, worker almaz")
        self.confirm(job_id)
        self.assertTrue(worker.work_once(self.conn, stages))
        self.assertEqual(self.state(job_id), ("done", 3, 3, None))
        self.assertEqual([row[0] for row in self.drafts(job_id)], ["kadi-hamami", "ulu-camii", "ulu-camii-sadirvani"])
        lock_free = self.conn.execute("select count(*) from pg_locks where locktype = 'advisory' and pid = pg_backend_pid()").fetchone()[0]
        self.assertEqual(lock_free, 0, "iş bitince kilit bırakılır")

    def test_resumes_where_it_stopped_without_duplicates(self):
        job_id = self.job()
        worker.work_once(self.conn, FakeStages())
        self.confirm(job_id)
        stages = FakeStages(stop_at="ulu-camii-sadirvani")
        with self.assertRaises(KeyboardInterrupt):
            worker.work_once(self.conn, stages)
        self.assertEqual(self.state(job_id)[:2], ("drafting", 1), "durdurulan iş olduğu yerde kalır")
        worker.work_once(self.conn, stages)
        self.assertEqual(self.state(job_id)[:2], ("done", 3))
        self.assertEqual(stages.drafted, ["ulu-camii", "ulu-camii-sadirvani", "kadi-hamami"], "bitmiş eser yeniden yazılmaz")
        self.assertEqual(len(self.drafts(job_id)), 3)

    def test_rerun_overwrites_pending_but_never_a_reviewed_draft(self):
        job_id = self.job()
        worker.work_once(self.conn, FakeStages())
        self.confirm(job_id)
        worker.work_once(self.conn, FakeStages())
        self.conn.execute("update intake_draft set status = 'approved', reviewed_at = now(), record = '{\"elle\": true}' where entry_key = 'ulu-camii'")
        self.conn.execute("update intake_job set status = 'map_confirmed', progress_done = 0 where id = %s", (job_id,))
        worker.work_once(self.conn, FakeStages())
        self.assertEqual(len(self.drafts(job_id)), 3)
        approved = self.conn.execute("select status, record from intake_draft where entry_key = 'ulu-camii'").fetchone()
        self.assertEqual(approved, ("approved", {"elle": True}))

    def test_a_failure_is_written_on_the_job(self):
        job_id = self.job()
        worker.work_once(self.conn, FakeStages())
        self.confirm(job_id)
        worker.work_once(self.conn, FakeStages(fail_at="kadi-hamami"))
        status, done, _total, error = self.state(job_id)
        self.assertEqual((status, done), ("failed", 2))
        self.assertIn("PDF okunamadı", error)

    def test_a_map_outside_the_contract_is_never_written(self):
        job_id = self.job()
        backwards = [entry("ulu-camii", [12, 10])]
        worker.work_once(self.conn, FakeStages(book_map=backwards))
        status, _done, _total, error = self.state(job_id)
        self.assertEqual(status, "failed")
        self.assertIn("geriye", error)
        self.assertIsNone(self.conn.execute("select book_map from intake_job where id = %s", (job_id,)).fetchone()[0])

    def test_a_draft_outside_the_contract_is_never_written(self):
        job_id = self.job()
        worker.work_once(self.conn, FakeStages())
        self.confirm(job_id)
        worker.work_once(self.conn, FakeStages(bad_media=True))
        status, done, _total, error = self.state(job_id)
        self.assertEqual((status, done), ("failed", 0))
        self.assertIn("intake_draft.media", error)
        self.assertEqual(self.drafts(job_id), [])


if __name__ == "__main__":
    unittest.main()
