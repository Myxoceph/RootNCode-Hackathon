"""Yerel PostgreSQL bağlantısı ve yerel-yalnız koruması (docs/veri-dongusu.md §0, §5.5).

Bu hat **yalnızca bu bilgisayardaki** veritabanına bağlanır. `DATABASE_URL` başka bir sunucuyu
gösteriyorsa ya da R2 yazma anahtarları (`MEDIA_S3_*`) tanımlıysa bağlanmadan durur. Koruma
kapatılamaz: bayrağı, seçeneği yoktur. Hata alırsan korumayı değil ayarı düzelt.

İki kat denetim:
1. Bağlanmadan önce adres: ana makine `localhost`, `127.0.0.1`, `::1` ya da bir unix soketi olmalı.
2. Bağlandıktan sonra sunucunun kendisi: `inet_server_addr()` boş (soket) ya da geri döngü adresi olmalı.
   Böylece `localhost`'u başka bir makineye çeviren bir hosts/DNS ayarı da yakalanır.
   Tek istisna Docker: `docker compose`'daki PostgreSQL'e `localhost:5432` ile bağlanınca sunucu kendi
   konteyner adresini (ör. `172.18.0.2`) söyler. Adres yerel bir adla verildiyse yalnızca Docker'ın ağ
   aralığı (`172.16.0.0/12`) kabul edilir; `10.x`, `192.168.x` gibi öbür özel ağlar değil.
"""

from __future__ import annotations

import ipaddress
from collections.abc import Mapping
from urllib.parse import parse_qs, urlparse

LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}
# Docker'ın köprü ağları bu aralıktan adres alır (172.17.0.0/16, 172.18.0.0/16 …).
DOCKER_NETWORK = ipaddress.ip_network("172.16.0.0/12")
# R2'ye yazmayı açan değişkenler: bu geliştirme boyunca hiçbiri tanımlı olamaz (§0.1).
REMOTE_MEDIA_KEYS = ("MEDIA_S3_ENDPOINT", "MEDIA_BUCKET", "MEDIA_S3_ACCESS_KEY_ID", "MEDIA_S3_SECRET_ACCESS_KEY")
# Geçici tabloların şeması: Yiğit'in migration'ı (public) gelene kadar onunla çakışmaz.
DEFAULT_SCHEMA = "public"


class LocalOnlyError(RuntimeError):
    """Uzak bir veritabanı ya da R2 ayarı bulundu; hiçbir şeye bağlanılmadı."""


def _hosts(url: str, env: Mapping[str, str]) -> list[str]:
    parsed = urlparse(url)
    if parsed.scheme not in ("postgres", "postgresql"):
        raise LocalOnlyError(f"DATABASE_URL bir PostgreSQL adresi değil ({parsed.scheme or 'şema yok'})")
    query = parse_qs(parsed.query)
    hosts: list[str] = []
    if parsed.hostname:
        hosts.append(parsed.hostname)
    # libpq `?host=` ve `?hostaddr=` ile adresi değiştirebilir; ikisi de sayılır.
    for key in ("host", "hostaddr"):
        for value in query.get(key, []):
            hosts.extend(part for part in value.split(",") if part)
    # Adreste ana makine yoksa libpq PGHOST'u kullanır.
    if not hosts and env.get("PGHOST"):
        hosts.extend(part for part in env["PGHOST"].split(",") if part)
    if env.get("PGHOSTADDR"):
        hosts.extend(part for part in env["PGHOSTADDR"].split(",") if part)
    return hosts


def check_local(url: str | None, env: Mapping[str, str]) -> None:
    """Bağlanmadan önce: adres yerel değilse ya da R2 yazma ayarı varsa `LocalOnlyError`."""
    if not url:
        raise LocalOnlyError("DATABASE_URL tanımlı değil (apps/api/.env)")
    for host in _hosts(url, env):
        if host.startswith("/"):
            continue  # unix soketi: bu bilgisayar
        if host.strip("[]").lower() not in LOCAL_HOSTS:
            raise LocalOnlyError(f"DATABASE_URL uzak bir sunucuyu gösteriyor ({host}); yalnızca yerel veritabanı kullanılır")
    defined = [key for key in REMOTE_MEDIA_KEYS if env.get(key)]
    if defined:
        raise LocalOnlyError(f"R2 yazma ayarları tanımlı ({', '.join(defined)}); bu geliştirmede fotoğraflar yalnızca yerel diske yazılır")


def check_server(server_addr: str | None, via_local_name: bool = False) -> None:
    """Bağlandıktan sonra: sunucunun adresi boş (soket) ya da geri döngü olmalı.

    `via_local_name`: adres `localhost`/`127.0.0.1`/`::1`/soketle verildi. O zaman bu bilgisayardaki
    Docker konteynerinin adresi de kabul edilir (bağlantı bu bilgisayarın portundan geçti).
    """
    if server_addr is None:
        return
    try:
        address = ipaddress.ip_address(str(server_addr).split("/")[0])
    except ValueError as error:
        raise LocalOnlyError(f"Sunucu adresi okunamadı ({server_addr})") from error
    if address.is_loopback:
        return
    if via_local_name and address.version == 4 and address in DOCKER_NETWORK:
        return
    raise LocalOnlyError(f"Bağlanılan sunucu bu bilgisayar değil ({address}); bağlantı kapatıldı")


def connect(env: Mapping[str, str], schema: str | None = None, autocommit: bool = True):
    """Yerel veritabanına, denetimlerden geçerek bağlanır. `schema` arama yolunun başına konur."""
    import psycopg  # yalnızca gerçekten bağlanırken: denetimler psycopg'siz de sınanabilsin
    from psycopg import sql

    url = env.get("DATABASE_URL")
    check_local(url, env)
    conn = psycopg.connect(url, autocommit=autocommit, connect_timeout=5)
    try:
        server = conn.execute("select inet_server_addr()::text").fetchone()[0]
        # check_local'dan geçtiyse adres zaten yerel bir ad ya da sokettir.
        check_server(server, via_local_name=True)
        target = schema or env.get("INTAKE_SCHEMA") or DEFAULT_SCHEMA
        conn.execute(sql.SQL("set search_path to {}, public").format(sql.Identifier(target)))
    except BaseException:
        conn.close()
        raise
    return conn
