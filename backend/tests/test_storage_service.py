"""Tests for the Phase 4.4 storage service."""

from __future__ import annotations

import uuid

import pytest

from app.services.storage_service import LocalFileSystemStorage, StorageProvider


def test_storage_provider_is_abstract() -> None:
    with pytest.raises(TypeError):
        StorageProvider()  # type: ignore[abstract]


def test_save_and_delete(tmp_path) -> None:
    storage = LocalFileSystemStorage(tmp_path)
    org_id = uuid.uuid4()
    resume_id = uuid.uuid4()

    uri = storage.save(
        organization_id=org_id,
        resume_id=resume_id,
        extension="pdf",
        stream=lambda: b"pdf-bytes",
    )

    expected = str(tmp_path / "resumes" / str(org_id) / f"{resume_id}.pdf")
    assert uri == expected
    assert storage._root_dir / "resumes" / str(org_id) / f"{resume_id}.pdf"  # exists

    with open(uri, "rb") as fh:
        assert fh.read() == b"pdf-bytes"

    storage.delete(file_uri=uri)
    assert storage._root_dir / "resumes" / str(org_id) / f"{resume_id}.pdf"  # not exists


def test_delete_missing_is_noop(tmp_path) -> None:
    storage = LocalFileSystemStorage(tmp_path)
    storage.delete(file_uri=str(tmp_path / "nope.pdf"))  # should not raise
