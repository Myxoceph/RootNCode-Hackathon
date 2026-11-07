"""Bir işin adımları: worker bunları sırayla çağırır, hangi adımda kaldığını veritabanına yazar.

Bugün (H0) adımlar iskelettir: harita boş döner, taslak yazılmaz. Böylece worker'ın durum makinesi
(queued → mapping → needs_map → map_confirmed → drafting → done) gerçek bir PDF olmadan sınanır.
Asıl işi H2 (`map_book`: düzen + içindekiler → kitap haritası) ve H4 (`draft_entry`: eser başına
metin + fotoğraf → taslak kayıt) doldurur. Worker'ın arayüzü değişmez.

Biçimler Yiğit'in sözleşmesindeki gibidir (packages/contracts/src/intake.schema.ts): `layout` →
IntakeLayout, `book_map` → BookMapEntry[], taslağın alanları → IntakeDraftMedia, IntakeSourceRef,
IntakeValidation, IntakeAi. Worker yazmadan önce `intake_contract.py` ile denetler.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass
class MapResult:
    """Kitabın düzeni ve içindekilerden çıkan eser listesi (`intake_job.layout`, `intake_job.book_map`)."""

    layout: dict[str, Any] | None
    book_map: list[dict[str, Any]]


@dataclass
class Draft:
    """Bir eserin taslağı: `intake_draft` satırının worker'ın doldurduğu alanları."""

    asset_id: str
    record: dict[str, Any]
    media: list[dict[str, Any]] = field(default_factory=list)
    source_refs: list[dict[str, Any]] = field(default_factory=list)
    validation: dict[str, Any] = field(default_factory=lambda: {"errors": [], "warnings": []})
    ai: dict[str, Any] | None = None
    duplicate_of: str | None = None


class Stages(Protocol):
    def map_book(self, job: dict[str, Any]) -> MapResult: ...

    def draft_entry(self, job: dict[str, Any], entry: dict[str, Any]) -> Draft | None: ...

    def draft_chat(self, job: dict[str, Any]) -> Draft: ...


class SkeletonStages:
    """H0: adımların yeri. Gerçek bir PDF açmaz, model çağırmaz."""

    def map_book(self, job: dict[str, Any]) -> MapResult:
        return MapResult(layout=None, book_map=[])

    def draft_entry(self, job: dict[str, Any], entry: dict[str, Any]) -> Draft | None:
        return None

    def draft_chat(self, job: dict[str, Any]) -> Draft:
        raise NotImplementedError("Sohbet adımı bu iskelette yok (worker.PipelineStages kullanır)")
