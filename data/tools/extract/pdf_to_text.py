#!/usr/bin/env python3
"""Envanter kitabı bölüğünün (PDF) metnini çıkarır.

Kullanım:
    python3 data/tools/extract/pdf_to_text.py "<bölük>.pdf" data/build/cache/text/<ad>.txt

Çıktıda her PDF sayfası `===== PAGE n (k chars) =====` ile başlar. Kitabın basılı sayfa
numaraları metnin içinde tek başına duran 2-3 haneli satırlardır (ör. `187`); kaynak
gösteriminde (`source_refs[].pages`) bunlar kullanılır. Fotoğraf sayfaları boş çıkar.

PDF'ler git'e girmez (kökteki .gitignore: *.pdf); data/build/ de yok sayılır.
"""
import sys
from pathlib import Path

from pypdf import PdfReader


def main(argv):
    if len(argv) != 2:
        sys.exit(__doc__)
    src, dst = Path(argv[0]), Path(argv[1])
    reader = PdfReader(src)
    dst.parent.mkdir(parents=True, exist_ok=True)
    with dst.open("w", encoding="utf-8") as out:
        for number, page in enumerate(reader.pages, 1):
            text = page.extract_text() or ""
            out.write(f"\n===== PAGE {number} ({len(text)} chars) =====\n{text}\n")
    empty = sum(1 for p in reader.pages if not (p.extract_text() or "").strip())
    print(f"✓ {src.name}: {len(reader.pages)} sayfa ({empty} fotoğraf sayfası) → {dst}")


if __name__ == "__main__":
    main(sys.argv[1:])
