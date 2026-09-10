"""Resume file storage abstraction (Phase 4.4).

Provides a provider-agnostic ``StorageProvider`` interface plus a local
filesystem implementation for the current MVP. The interface is designed so a
future S3/cloud implementation can be swapped in without changing callers.

Only the file's path (``file_uri``) and metadata are persisted in the database;
the raw bytes live on disk under a configurable root directory.
"""

from __future__ import annotations

import uuid
from abc import ABC, abstractmethod
from collections.abc import Callable
from pathlib import Path


class StorageProvider(ABC):
    """Abstract file storage service for uploaded resume files."""

    @abstractmethod
    def save(
        self,
        *,
        organization_id: uuid.UUID,
        resume_id: uuid.UUID,
        extension: str,
        stream: Callable[[], bytes],
    ) -> str:
        """Persist a file and return its ``file_uri``. Raise on write failure."""

    @abstractmethod
    def delete(self, *, file_uri: str) -> None:
        """Delete the file at ``file_uri``. Missing files are a no-op."""


class LocalFileSystemStorage(StorageProvider):
    """Store resume files on the local filesystem.

    Files are written to ``{root_dir}/resumes/{organization_id}/{resume_id}.{ext}``.
    """

    def __init__(self, root_dir: str | Path) -> None:
        self._root_dir = Path(root_dir)

    def save(
        self,
        *,
        organization_id: uuid.UUID,
        resume_id: uuid.UUID,
        extension: str,
        stream: Callable[[], bytes],
    ) -> str:
        directory = self._root_dir / "resumes" / str(organization_id)
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / f"{resume_id}.{extension}"
        path.write_bytes(stream())
        return str(path)

    def delete(self, *, file_uri: str) -> None:
        path = Path(file_uri)
        try:
            path.unlink()
        except FileNotFoundError:
            return
        # Remove the now-empty org directory so no orphaned directories remain.
        try:
            path.parent.rmdir()
        except OSError:
            return

    def read(self, *, file_uri: str) -> bytes:
        """Return the raw bytes of a previously persisted file."""
        return Path(file_uri).read_bytes()
