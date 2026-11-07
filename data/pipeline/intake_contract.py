"""Worker'ın tablolara yazdığı jsonb'lerin denetimi: `contracts/intake.schema.json` (Yiğit'in sözleşmesi).

Şema `packages/contracts/src/intake.schema.ts`'den üretilir (`npm run intake-schema -w @vagabonds/contracts`);
elle düzenlenmez. Worker her alanı yazmadan önce buradan geçirir: API'nin okuyamayacağı bir satır
veritabanına hiç girmez. JSON Schema'ya taşınamayan kurallar (sayfa aralığı geriye gitmez, anahtarlar
benzersiz, `parentKey` haritada var) burada ayrıca denetlenir.

Eser kaydının kendisi (`intake_draft.record`, kitap ve saha taslakları) burada denetlenmez: o
`data/schema/eser.schema.json` ve `validate.py`'nin işi, sonucu `validation` sütununa yazılır.
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

SCHEMA_PATH = Path(__file__).resolve().parent / "contracts" / "intake.schema.json"
# intake_draft.asset_id'nin CHECK kısıtıyla aynı (migration 20261108090000_intake).
ASSET_ID = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")


class ContractError(ValueError):
    """Değer sözleşmeye uymuyor; hiçbir şey yazılmadı."""

    def __init__(self, column: str, problems: list[str]):
        self.column = column
        self.problems = problems
        super().__init__(f"{column}: " + "; ".join(problems[:8]) + (f" (+{len(problems) - 8})" if len(problems) > 8 else ""))


@lru_cache(maxsize=1)
def _schemas() -> dict[str, Any]:
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


@lru_cache(maxsize=None)
def _validator(column: str):
    from jsonschema import Draft202012Validator

    columns = _schemas()["columns"]
    if column not in columns:
        raise KeyError(f"Sözleşmede böyle bir sütun yok: {column}")
    return Draft202012Validator(columns[column])


def photo_subjects() -> list[str]:
    """Bir fotoğrafın konusu olabilecek değerler (PHOTO_SUBJECTS)."""
    return list(_schemas()["photoSubjects"])


def check(column: str, value: Any) -> None:
    """`value`, sözleşmedeki `column` biçimine uymuyorsa `ContractError`."""
    problems = [
        f"{'/'.join(str(part) for part in error.absolute_path) or '(kök)'}: {error.message}"
        for error in sorted(_validator(column).iter_errors(value), key=lambda error: list(map(str, error.absolute_path)))
    ]
    if problems:
        raise ContractError(column, problems)


def _range_problems(entry: dict[str, Any], index: int) -> list[str]:
    problems = []
    for name in ("printedPages", "pdfPages"):
        pages = entry.get(name)
        if isinstance(pages, list) and len(pages) == 2 and all(isinstance(page, int) for page in pages) and pages[0] > pages[1]:
            problems.append(f"{index}/{name}: aralık geriye gidiyor ({pages[0]} > {pages[1]})")
    return problems


def check_book_map(book_map: list[dict[str, Any]]) -> None:
    check("intake_job.book_map", book_map)
    problems: list[str] = []
    keys = [entry["key"] for entry in book_map]
    seen: set[str] = set()
    for index, entry in enumerate(book_map):
        problems.extend(_range_problems(entry, index))
        if entry["key"] in seen:
            problems.append(f"{index}/key: '{entry['key']}' iki kez")
        seen.add(entry["key"])
        parent = entry.get("parentKey")
        if parent is not None and parent not in keys:
            problems.append(f"{index}/parentKey: '{parent}' haritada yok")
        if parent == entry["key"]:
            problems.append(f"{index}/parentKey: eser kendisinin üst yapısı olamaz")
    if problems:
        raise ContractError("intake_job.book_map", problems)


def check_layout(layout: dict[str, Any] | None) -> None:
    if layout is not None:
        check("intake_job.layout", layout)


def check_draft(asset_id: str, media: list, source_refs: list, validation: dict, ai: dict | None) -> None:
    if not ASSET_ID.match(asset_id or ""):
        raise ContractError("intake_draft.asset_id", [f"'{asset_id}' kebab-case bir eser id değil"])
    check("intake_draft.media", media)
    check("intake_draft.source_refs", source_refs)
    check("intake_draft.validation", validation)
    if ai is not None:
        check("intake_draft.ai", ai)
