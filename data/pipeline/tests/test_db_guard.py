"""Yerel-yalnız koruması: uzak bir veritabanı ya da R2 ayarı hiçbir koşulda kabul edilmez."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from db import LocalOnlyError, check_local, check_server  # noqa: E402

LOCAL = "postgresql://vagabonds:secret@localhost:5432/vagabonds"


class CheckLocal(unittest.TestCase):
    def test_local_addresses_pass(self):
        for url in (
            LOCAL,
            "postgresql://u:p@127.0.0.1:5432/db",
            "postgresql://u:p@[::1]:5432/db",
            "postgres://u@LOCALHOST/db",
            "postgresql:///db?host=/tmp",  # unix soketi
            "postgresql:///db",  # ana makine yok, PGHOST yok: varsayılan soket
        ):
            with self.subTest(url=url):
                check_local(url, {})

    def test_remote_addresses_refused(self):
        for url in (
            "postgresql://u:p@vagabonds.allbytech.com:5432/vagabonds",
            "postgresql://u:p@10.0.0.5:5432/db",
            "postgresql://u:p@192.168.1.20/db",
            "postgresql://u:p@postgres:5432/vagabonds",  # deploy/compose.yml'deki servis adı
            "postgresql://u:p@db.example.com/db",
            "postgresql://u:p@localhost.example.com/db",
        ):
            with self.subTest(url=url), self.assertRaises(LocalOnlyError):
                check_local(url, {})

    def test_query_host_cannot_sneak_past(self):
        for url in (
            "postgresql://u:p@localhost/db?host=db.example.com",
            "postgresql://u:p@localhost/db?hostaddr=10.1.2.3",
            "postgresql://u:p@localhost/db?host=localhost,db.example.com",
        ):
            with self.subTest(url=url), self.assertRaises(LocalOnlyError):
                check_local(url, {})

    def test_pg_environment_counts(self):
        with self.assertRaises(LocalOnlyError):
            check_local("postgresql:///db", {"PGHOST": "db.example.com"})
        with self.assertRaises(LocalOnlyError):
            check_local(LOCAL, {"PGHOSTADDR": "10.1.2.3"})
        check_local("postgresql:///db", {"PGHOST": "localhost"})

    def test_missing_or_other_scheme_refused(self):
        for url in (None, "", "mysql://u:p@localhost/db", "localhost:5432"):
            with self.subTest(url=url), self.assertRaises(LocalOnlyError):
                check_local(url, {})

    def test_r2_write_settings_refused(self):
        for key in ("MEDIA_S3_ENDPOINT", "MEDIA_BUCKET", "MEDIA_S3_ACCESS_KEY_ID", "MEDIA_S3_SECRET_ACCESS_KEY"):
            with self.subTest(key=key), self.assertRaises(LocalOnlyError):
                check_local(LOCAL, {key: "x"})
        check_local(LOCAL, {"MEDIA_S3_ENDPOINT": ""})  # boş değer tanımsız sayılır

    def test_error_message_has_no_password(self):
        with self.assertRaises(LocalOnlyError) as caught:
            check_local("postgresql://u:supersecret@db.example.com/db", {})
        self.assertNotIn("supersecret", str(caught.exception))


class CheckServer(unittest.TestCase):
    def test_loopback_and_socket_pass(self):
        for address in (None, "127.0.0.1", "::1", "127.0.0.1/32", "::1/128"):
            with self.subTest(address=address):
                check_server(address)

    def test_other_servers_refused(self):
        for address in ("10.0.0.5", "192.168.1.20", "172.17.0.2", "2001:db8::1", "not-an-ip"):
            with self.subTest(address=address), self.assertRaises(LocalOnlyError):
                check_server(address)

    def test_docker_on_this_machine_through_localhost(self):
        # docker compose'daki PostgreSQL, localhost:5432 üzerinden: sunucu konteyner adresini söyler.
        for address in ("172.18.0.2", "172.17.0.3", "172.31.255.1"):
            with self.subTest(address=address):
                check_server(address, via_local_name=True)
        # Yerel adla bile Docker dışındaki özel ağlar ve dış adresler kabul edilmez.
        for address in ("10.0.0.5", "192.168.1.20", "172.32.0.1", "8.8.8.8", "2001:db8::1"):
            with self.subTest(address=address), self.assertRaises(LocalOnlyError):
                check_server(address, via_local_name=True)


if __name__ == "__main__":
    unittest.main()
