"""Resume text extraction (Phase 4.4).

Extracts plain text from an uploaded resume file. Supports PDF via ``pypdf``
and DOCX via ``python-docx`` only. No OCR, no scanned-image support.

The dispatcher selects an extractor purely by file extension and raises a
typed ``ValidationError`` for unsupported types or unextractable (e.g. scanned)
content.
"""

from __future__ import annotations

import io
from abc import ABC, abstractmethod
from pathlib import Path

from app.services.errors import ValidationError

SUPPORTED_EXTENSIONS = frozenset({"pdf", "docx"})

# Content types (lower-cased) accepted alongside the matching extension.
PDF_CONTENT_TYPE = "application/pdf"
DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

EXTENSION_TO_CONTENT_TYPE = {
    "pdf": PDF_CONTENT_TYPE,
    "docx": DOCX_CONTENT_TYPE,
}


class TextExtractor(ABC):
    """Extract plain text from one supported file format."""

    extension: str

    @abstractmethod
    def extract(self, data: bytes) -> str:
        """Return the extracted text, raising ValidationError if unextractable."""


class PdfTextExtractor(TextExtractor):
    extension = "pdf"

    def extract(self, data: bytes) -> str:
        from pypdf import PdfReader
        from pypdf.errors import PyPdfError

        try:
            reader = PdfReader(io.BytesIO(data))
            pages = [(page.extract_text() or "") for page in reader.pages]
        except PyPdfError as exc:
            raise ValidationError("Uploaded PDF could not be read.") from exc
        return "\n".join(pages)


class DocxTextExtractor(TextExtractor):
    extension = "docx"

    def extract(self, data: bytes) -> str:
        from zipfile import BadZipFile

        from docx import Document

        try:
            document = Document(io.BytesIO(data))
            paragraphs = [paragraph.text for paragraph in document.paragraphs]
        except (BadZipFile, OSError, ValueError) as exc:
            raise ValidationError("Uploaded DOCX could not be read.") from exc
        return "\n".join(paragraphs)


_EXTRACTORS: dict[str, TextExtractor] = {
    PdfTextExtractor.extension: PdfTextExtractor(),
    DocxTextExtractor.extension: DocxTextExtractor(),
}


def extract_text(data: bytes, *, filename: str | None) -> str:
    """Extract text from resume bytes, validating type and extractability."""
    if not filename:
        raise ValidationError("An uploaded file must have a filename.")
    extension = Path(filename).suffix.lower().lstrip(".")
    extractor = _EXTRACTORS.get(extension)
    if extractor is None:
        raise ValidationError(
            f"Unsupported file type: {extension or 'unknown'!r}. Only .pdf and .docx are allowed."
        )
    text = extractor.extract(data)
    if not text or not text.strip():
        raise ValidationError("No extractable text was found in the uploaded file.")
    return text


def extension_for_filename(filename: str) -> str:
    """Return the lowercase extension (without dot), or raise if unsupported."""
    extension = Path(filename).suffix.lower().lstrip(".")
    if extension not in SUPPORTED_EXTENSIONS:
        raise ValidationError(
            f"Unsupported file type: {extension or 'unknown'!r}. Only .pdf and .docx are allowed."
        )
    return extension
