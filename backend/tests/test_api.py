"""API integration tests for Phase 4.3 HTTP endpoints."""

from __future__ import annotations

import uuid
from collections.abc import Generator
from datetime import UTC, datetime

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models
from app.core.database import get_db
from app.main import app


@pytest.fixture()
def client(db_session: Session) -> Generator[httpx.Client, None, None]:
    """Provide a synchronous test client sharing the test db_session.

    The ``get_db`` dependency is overridden so endpoints share the same
    session (and connection) as the test. Nested transactions let the test
    read data the endpoint writes, then the outer transaction is rolled back
    to clean up after the test.
    """
    connection = db_session.connection()
    db_session.bind = connection

    def override_get_db() -> Generator[Session, None, None]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.pop(get_db, None)


@pytest.fixture(autouse=True)
def _isolated_storage_root(tmp_path) -> None:
    """Point resume uploads at a temporary directory so tests don't write to
    the real ``./storage`` directory under the backend."""
    from app.core.config import settings

    original = settings.storage_root_dir
    settings.storage_root_dir = str(tmp_path / "storage")
    yield
    settings.storage_root_dir = original


def auth_headers(org_id: str, user_id: str) -> dict[str, str]:
    """Return standard MVP auth headers."""
    return {"X-User-Id": user_id, "X-Organization-Id": org_id}


def create_org(client: httpx.Client, name: str = "Test Org") -> dict:
    """Create a bootstrap organization."""
    resp = client.post("/api/v1/organizations", json={"name": name})
    assert resp.status_code == 201
    return resp.json()


def create_user(client: httpx.Client, org_id: str, email: str = "hr@test.com") -> dict:
    """Create a bootstrap user in an organization."""
    resp = client.post(
        f"/api/v1/organizations/{org_id}/users",
        json={"email": email, "full_name": "HR User"},
    )
    assert resp.status_code == 201
    return resp.json()


def bootstrap(client: httpx.Client) -> tuple[dict, dict]:
    """Create an org and user, return both as dicts."""
    org = create_org(client)
    user = create_user(client, org["id"])
    return org, user


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


class TestHealth:
    def test_health_check(self, client: httpx.Client) -> None:
        resp = client.get("/api/v1/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}


# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------


class TestBootstrap:
    def test_create_organization(self, client: httpx.Client) -> None:
        resp = client.post("/api/v1/organizations", json={"name": "Acme"})
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Acme"
        assert data["status"] == "active"
        assert "id" in data

    def test_create_user(self, client: httpx.Client) -> None:
        org = create_org(client)
        resp = client.post(
            f"/api/v1/organizations/{org['id']}/users",
            json={"email": "u@test.com", "full_name": "Test User"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["email"] == "u@test.com"
        assert data["organization_id"] == org["id"]

    def test_create_user_nonexistent_org(self, client: httpx.Client) -> None:
        fake_id = str(uuid.uuid4())
        resp = client.post(
            f"/api/v1/organizations/{fake_id}/users",
            json={"email": "u@test.com", "full_name": "Test User"},
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Headers
# ---------------------------------------------------------------------------


class TestHeaders:
    def test_missing_headers_returns_422(self, client: httpx.Client) -> None:
        resp = client.get("/api/v1/jobs/00000000-0000-0000-0000-000000000000")
        assert resp.status_code == 422

    def test_invalid_uuid_returns_422(self, client: httpx.Client) -> None:
        resp = client.get(
            "/api/v1/jobs/00000000-0000-0000-0000-000000000000",
            headers={"X-User-Id": "not-a-uuid", "X-Organization-Id": "also-not"},
        )
        assert resp.status_code == 422

    def test_nonexistent_user_returns_404(self, client: httpx.Client) -> None:
        org = create_org(client)
        fake_user = str(uuid.uuid4())
        resp = client.get(
            "/api/v1/jobs/00000000-0000-0000-0000-000000000000",
            headers=auth_headers(org["id"], fake_user),
        )
        assert resp.status_code == 404

    def test_org_mismatch_returns_403(self, client: httpx.Client) -> None:
        org1 = create_org(client, name="Org1")
        org2 = create_org(client, name="Org2")
        user1 = create_user(client, org1["id"], "u1@test.com")
        resp = client.get(
            "/api/v1/jobs/00000000-0000-0000-0000-000000000000",
            headers=auth_headers(org2["id"], user1["id"]),
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Jobs
# ---------------------------------------------------------------------------


class TestJobs:
    def test_create_and_get_job(self, client: httpx.Client) -> None:
        org, user = bootstrap(client)
        h = auth_headers(org["id"], user["id"])

        resp = client.post("/api/v1/jobs", json={"title": "Engineer"}, headers=h)
        assert resp.status_code == 201
        job = resp.json()
        assert job["title"] == "Engineer"
        assert job["organization_id"] == org["id"]
        assert job["status"] == "draft"

        resp = client.get(f"/api/v1/jobs/{job['id']}", headers=h)
        assert resp.status_code == 200
        assert resp.json()["title"] == "Engineer"

    def test_list_jobs(self, client: httpx.Client) -> None:
        org, user = bootstrap(client)
        h = auth_headers(org["id"], user["id"])

        client.post("/api/v1/jobs", json={"title": "Job A"}, headers=h)
        client.post("/api/v1/jobs", json={"title": "Job B"}, headers=h)

        resp = client.get("/api/v1/jobs", headers=h)
        assert resp.status_code == 200
        titles = [j["title"] for j in resp.json()]
        assert {"Job A", "Job B"}.issubset(titles)

        other_org, other_user = bootstrap(client)
        other_h = auth_headers(other_org["id"], other_user["id"])
        resp = client.get("/api/v1/jobs", headers=other_h)
        assert resp.status_code == 200
        assert all(j["title"] not in ("Job A", "Job B") for j in resp.json())

    def test_delete_job(self, client: httpx.Client) -> None:
        org, user = bootstrap(client)
        h = auth_headers(org["id"], user["id"])

        resp = client.post("/api/v1/jobs", json={"title": "To Delete"}, headers=h)
        job_id = resp.json()["id"]

        resp = client.delete(f"/api/v1/jobs/{job_id}", headers=h)
        assert resp.status_code == 204

        resp = client.get(f"/api/v1/jobs/{job_id}", headers=h)
        assert resp.status_code == 404

        resp = client.get("/api/v1/jobs", headers=h)
        assert resp.status_code == 200
        assert all(j["id"] != job_id for j in resp.json())

    def test_delete_job_in_use_rejected(self, client: httpx.Client, db_session: Session) -> None:
        org, user = bootstrap(client)
        h = auth_headers(org["id"], user["id"])

        job = client.post("/api/v1/jobs", json={"title": "In Use"}, headers=h).json()
        organization = db_session.get(models.Organization, uuid.UUID(org["id"]))
        candidate = models.Candidate(
            organization_id=organization.id, full_name="Candi", email="candi@test.com"
        )
        db_session.add(candidate)
        db_session.flush()
        resume = models.Resume(candidate_id=candidate.id, file_uri="local://r.pdf")
        db_session.add(resume)
        db_session.flush()
        application = models.JobApplication(
            organization_id=organization.id,
            job_id=uuid.UUID(job["id"]),
            candidate_id=candidate.id,
            resume_id=resume.id,
        )
        db_session.add(application)
        db_session.flush()

        resp = client.delete(f"/api/v1/jobs/{job['id']}", headers=h)
        assert resp.status_code == 409

        resp = client.get(f"/api/v1/jobs/{job['id']}", headers=h)
        assert resp.status_code == 200

    def test_update_job(self, client: httpx.Client) -> None:
        org, user = bootstrap(client)
        h = auth_headers(org["id"], user["id"])

        resp = client.post("/api/v1/jobs", json={"title": "Old"}, headers=h)
        job = resp.json()

        resp = client.patch(f"/api/v1/jobs/{job['id']}", json={"title": "New"}, headers=h)
        assert resp.status_code == 200
        assert resp.json()["title"] == "New"

    def test_job_not_found(self, client: httpx.Client) -> None:
        org, user = bootstrap(client)
        h = auth_headers(org["id"], user["id"])
        fake = str(uuid.uuid4())
        resp = client.get(f"/api/v1/jobs/{fake}", headers=h)
        assert resp.status_code == 404

    def test_job_cross_org_isolation(self, client: httpx.Client) -> None:
        org1, user1 = bootstrap(client)
        org2, user2 = bootstrap(client)
        h1 = auth_headers(org1["id"], user1["id"])
        h2 = auth_headers(org2["id"], user2["id"])

        resp = client.post("/api/v1/jobs", json={"title": "J1"}, headers=h1)
        job = resp.json()

        resp = client.get(f"/api/v1/jobs/{job['id']}", headers=h2)
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Candidates
# ---------------------------------------------------------------------------


class TestCandidates:
    def test_create_and_get_candidate(self, client: httpx.Client) -> None:
        org, user = bootstrap(client)
        h = auth_headers(org["id"], user["id"])

        resp = client.post(
            "/api/v1/candidates",
            json={"full_name": "Alice"},
            headers=h,
        )
        assert resp.status_code == 201
        cand = resp.json()
        assert cand["full_name"] == "Alice"

        resp = client.get(f"/api/v1/candidates/{cand['id']}", headers=h)
        assert resp.status_code == 200

    def test_candidate_cross_org_isolation(self, client: httpx.Client) -> None:
        org1, user1 = bootstrap(client)
        org2, user2 = bootstrap(client)
        h1 = auth_headers(org1["id"], user1["id"])
        h2 = auth_headers(org2["id"], user2["id"])

        resp = client.post("/api/v1/candidates", json={"full_name": "Bob"}, headers=h1)
        cand = resp.json()

        resp = client.get(f"/api/v1/candidates/{cand['id']}", headers=h2)
        assert resp.status_code == 422

    def test_list_candidates_returns_only_org_candidates(self, client: httpx.Client) -> None:
        org1, user1 = bootstrap(client)
        org2, user2 = bootstrap(client)
        h1 = auth_headers(org1["id"], user1["id"])
        h2 = auth_headers(org2["id"], user2["id"])

        for name in ("Alice", "Bob"):
            resp = client.post("/api/v1/candidates", json={"full_name": name}, headers=h1)
            assert resp.status_code == 201
        client.post("/api/v1/candidates", json={"full_name": "Carol"}, headers=h2)

        resp = client.get("/api/v1/candidates", headers=h1)
        assert resp.status_code == 200
        names = {c["full_name"] for c in resp.json()}
        assert names == {"Alice", "Bob"}

    def test_list_candidates_search(self, client: httpx.Client) -> None:
        org, user = bootstrap(client)
        h = auth_headers(org["id"], user["id"])

        client.post(
            "/api/v1/candidates",
            json={"full_name": "Alice Wong", "email": "alice@test.com"},
            headers=h,
        )
        client.post(
            "/api/v1/candidates",
            json={"full_name": "Bob Smith", "email": "bob@test.com"},
            headers=h,
        )

        resp = client.get("/api/v1/candidates", params={"search": "alice"}, headers=h)
        assert resp.status_code == 200
        assert [c["full_name"] for c in resp.json()] == ["Alice Wong"]

        resp = client.get("/api/v1/candidates", params={"search": "bob@test.com"}, headers=h)
        assert resp.status_code == 200
        assert [c["full_name"] for c in resp.json()] == ["Bob Smith"]

        resp = client.get("/api/v1/candidates", params={"search": "zzz"}, headers=h)
        assert resp.status_code == 200
        assert resp.json() == []

    def test_list_candidate_resumes(self, client: httpx.Client) -> None:
        org, user = bootstrap(client)
        h = auth_headers(org["id"], user["id"])

        cand = client.post("/api/v1/candidates", json={"full_name": "Fay"}, headers=h).json()
        client.post(
            f"/api/v1/candidates/{cand['id']}/resumes",
            json={"file_uri": "local://one.pdf", "original_filename": "one.pdf"},
            headers=h,
        )
        client.post(
            f"/api/v1/candidates/{cand['id']}/resumes",
            json={"file_uri": "local://two.pdf", "original_filename": "two.pdf"},
            headers=h,
        )

        resp = client.get(f"/api/v1/candidates/{cand['id']}/resumes", headers=h)
        assert resp.status_code == 200
        names = {r["original_filename"] for r in resp.json()}
        assert names == {"one.pdf", "two.pdf"}

    def test_list_candidate_resumes_cross_org(self, client: httpx.Client) -> None:
        org1, user1 = bootstrap(client)
        org2, user2 = bootstrap(client)
        h1 = auth_headers(org1["id"], user1["id"])
        h2 = auth_headers(org2["id"], user2["id"])

        cand = client.post("/api/v1/candidates", json={"full_name": "Gia"}, headers=h1).json()
        client.post(
            f"/api/v1/candidates/{cand['id']}/resumes",
            json={"file_uri": "local://one.pdf"},
            headers=h1,
        )

        resp = client.get(f"/api/v1/candidates/{cand['id']}/resumes", headers=h2)
        assert resp.status_code == 422

    def test_list_candidate_resumes_not_found(self, client: httpx.Client) -> None:
        org, user = bootstrap(client)
        h = auth_headers(org["id"], user["id"])

        resp = client.get(f"/api/v1/candidates/{uuid.uuid4()}/resumes", headers=h)
        assert resp.status_code == 404

    def test_list_candidates_invalid_status_filter(self, client: httpx.Client) -> None:
        org, user = bootstrap(client)
        h = auth_headers(org["id"], user["id"])

        resp = client.get("/api/v1/candidates", params={"status": "bogus"}, headers=h)
        assert resp.status_code == 422

    def test_update_candidate(self, client: httpx.Client) -> None:
        org, user = bootstrap(client)
        h = auth_headers(org["id"], user["id"])

        resp = client.post(
            "/api/v1/candidates",
            json={"full_name": "Dana", "email": "dana@test.com"},
            headers=h,
        )
        cand = resp.json()

        resp = client.patch(
            f"/api/v1/candidates/{cand['id']}",
            json={"phone": "555-0100"},
            headers=h,
        )
        assert resp.status_code == 200
        updated = resp.json()
        assert updated["email"] == "dana@test.com"
        assert updated["phone"] == "555-0100"

        resp = client.patch(
            f"/api/v1/candidates/{cand['id']}",
            json={"email": "new@test.com"},
            headers=h,
        )
        assert resp.status_code == 200
        assert resp.json()["email"] == "new@test.com"

    def test_update_candidate_not_found(self, client: httpx.Client) -> None:
        org, user = bootstrap(client)
        h = auth_headers(org["id"], user["id"])

        resp = client.patch(
            f"/api/v1/candidates/{uuid.uuid4()}",
            json={"email": "x@test.com"},
            headers=h,
        )
        assert resp.status_code == 404

    def test_update_candidate_cross_org_isolation(self, client: httpx.Client) -> None:
        org1, user1 = bootstrap(client)
        org2, user2 = bootstrap(client)
        h1 = auth_headers(org1["id"], user1["id"])
        h2 = auth_headers(org2["id"], user2["id"])

        resp = client.post("/api/v1/candidates", json={"full_name": "Eve"}, headers=h1)
        cand = resp.json()

        resp = client.patch(
            f"/api/v1/candidates/{cand['id']}",
            json={"email": "eve@other.com"},
            headers=h2,
        )
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Resumes
# ---------------------------------------------------------------------------


class TestResumes:
    def test_create_and_get_resume(self, client: httpx.Client) -> None:
        org, user = bootstrap(client)
        h = auth_headers(org["id"], user["id"])

        resp = client.post(
            "/api/v1/candidates",
            json={"full_name": "Cand"},
            headers=h,
        )
        cand = resp.json()

        resp = client.post(
            f"/api/v1/candidates/{cand['id']}/resumes",
            json={"file_uri": "local://test.pdf"},
            headers=h,
        )
        assert resp.status_code == 201
        resume = resp.json()
        assert resume["file_uri"] == "local://test.pdf"

        resp = client.get(f"/api/v1/resumes/{resume['id']}", headers=h)
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Resume Upload (Phase 4.4)
# ---------------------------------------------------------------------------


class TestResumeUpload:
    def _upload(
        self,
        client: httpx.Client,
        h: dict,
        cand_id: str,
        filename: str,
        content: bytes,
        content_type: str,
    ) -> httpx.Response:
        return client.post(
            f"/api/v1/candidates/{cand_id}/resumes/upload",
            headers=h,
            files={
                "file": (
                    filename,
                    content,
                    content_type,
                )
            },
        )

    def test_upload_pdf(self, client: httpx.Client) -> None:
        from tests.resume_upload_fixtures import make_pdf_bytes

        org, user = bootstrap(client)
        h = auth_headers(org["id"], user["id"])
        cand = client.post("/api/v1/candidates", json={"full_name": "C"}, headers=h).json()

        resp = self._upload(
            client,
            h,
            cand["id"],
            "resume.pdf",
            make_pdf_bytes(),
            "application/pdf",
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["status"] == "text_extracted"
        assert data["original_filename"] == "resume.pdf"
        assert data["content_type"] == "application/pdf"
        assert "extracted_text" not in data

    def test_upload_docx(self, client: httpx.Client) -> None:
        from tests.resume_upload_fixtures import make_docx_bytes

        org, user = bootstrap(client)
        h = auth_headers(org["id"], user["id"])
        cand = client.post("/api/v1/candidates", json={"full_name": "C"}, headers=h).json()

        resp = self._upload(
            client,
            h,
            cand["id"],
            "resume.docx",
            make_docx_bytes(),
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
        assert resp.status_code == 201
        assert resp.json()["status"] == "text_extracted"
        assert "extracted_text" not in resp.json()

    def test_upload_rejects_wrong_extension(self, client: httpx.Client) -> None:
        org, user = bootstrap(client)
        h = auth_headers(org["id"], user["id"])
        cand = client.post("/api/v1/candidates", json={"full_name": "C"}, headers=h).json()

        resp = self._upload(client, h, cand["id"], "resume.txt", b"hello", "text/plain")
        assert resp.status_code == 422

    def test_upload_rejects_content_type_mismatch(self, client: httpx.Client) -> None:
        from tests.resume_upload_fixtures import make_pdf_bytes

        org, user = bootstrap(client)
        h = auth_headers(org["id"], user["id"])
        cand = client.post("/api/v1/candidates", json={"full_name": "C"}, headers=h).json()

        resp = self._upload(
            client,
            h,
            cand["id"],
            "resume.pdf",
            make_pdf_bytes(),
            "text/plain",
        )
        assert resp.status_code == 422

    def test_upload_rejects_empty_text(self, client: httpx.Client) -> None:
        org, user = bootstrap(client)
        h = auth_headers(org["id"], user["id"])
        cand = client.post("/api/v1/candidates", json={"full_name": "C"}, headers=h).json()

        resp = self._upload(
            client,
            h,
            cand["id"],
            "resume.pdf",
            b"%PDF-1.4\nnot a real pdf",
            "application/pdf",
        )
        assert resp.status_code == 422

    def test_upload_cross_org_isolation(self, client: httpx.Client) -> None:
        from tests.resume_upload_fixtures import make_pdf_bytes

        org1, user1 = bootstrap(client)
        org2, user2 = bootstrap(client)
        h1 = auth_headers(org1["id"], user1["id"])
        h2 = auth_headers(org2["id"], user2["id"])

        cand = client.post("/api/v1/candidates", json={"full_name": "C"}, headers=h1).json()

        resp = self._upload(
            client,
            h2,
            cand["id"],
            "resume.pdf",
            make_pdf_bytes(),
            "application/pdf",
        )
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Job Applications
# ---------------------------------------------------------------------------


class TestJobApplications:
    def _setup_entities(self, client: httpx.Client, h: dict) -> tuple[dict, dict, dict]:
        resp = client.post("/api/v1/jobs", json={"title": "J"}, headers=h)
        job = resp.json()
        resp = client.post("/api/v1/candidates", json={"full_name": "C"}, headers=h)
        cand = resp.json()
        resp = client.post(
            f"/api/v1/candidates/{cand['id']}/resumes",
            json={"file_uri": "local://r.pdf"},
            headers=h,
        )
        resume = resp.json()
        return job, cand, resume

    def test_create_and_get_application(self, client: httpx.Client) -> None:
        org, user = bootstrap(client)
        h = auth_headers(org["id"], user["id"])
        job, cand, resume = self._setup_entities(client, h)

        resp = client.post(
            "/api/v1/job-applications",
            json={
                "job_id": job["id"],
                "candidate_id": cand["id"],
                "resume_id": resume["id"],
            },
            headers=h,
        )
        assert resp.status_code == 201
        app_data = resp.json()
        assert app_data["job_id"] == job["id"]

        resp = client.get(f"/api/v1/job-applications/{app_data['id']}", headers=h)
        assert resp.status_code == 200

    def test_list_applications_by_job(self, client: httpx.Client) -> None:
        org, user = bootstrap(client)
        h = auth_headers(org["id"], user["id"])
        job, cand, resume = self._setup_entities(client, h)

        client.post(
            "/api/v1/job-applications",
            json={
                "job_id": job["id"],
                "candidate_id": cand["id"],
                "resume_id": resume["id"],
            },
            headers=h,
        )

        resp = client.get(f"/api/v1/jobs/{job['id']}/applications", headers=h)
        assert resp.status_code == 200
        assert len(resp.json()) >= 1


# ---------------------------------------------------------------------------
# Job Profiles
# ---------------------------------------------------------------------------


class TestJobProfiles:
    def test_create_list_get_profile(self, client: httpx.Client) -> None:
        org, user = bootstrap(client)
        h = auth_headers(org["id"], user["id"])

        resp = client.post("/api/v1/jobs", json={"title": "J"}, headers=h)
        job = resp.json()

        resp = client.post(
            f"/api/v1/jobs/{job['id']}/profiles",
            json={
                "status": "draft",
                "source": "hr_created",
                "profile_data": {"title": "J", "requirements": []},
            },
            headers=h,
        )
        assert resp.status_code == 201
        profile = resp.json()
        assert profile["version_number"] == 1

        resp = client.get(f"/api/v1/job-profiles/{profile['id']}", headers=h)
        assert resp.status_code == 200

        resp = client.get(f"/api/v1/jobs/{job['id']}/profiles", headers=h)
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    def test_approve_profile(self, client: httpx.Client) -> None:
        org, user = bootstrap(client)
        h = auth_headers(org["id"], user["id"])

        resp = client.post("/api/v1/jobs", json={"title": "J"}, headers=h)
        job = resp.json()

        resp = client.post(
            f"/api/v1/jobs/{job['id']}/profiles",
            json={
                "status": "draft",
                "source": "hr_created",
                "profile_data": {"title": "J"},
            },
            headers=h,
        )
        profile = resp.json()

        resp = client.post(f"/api/v1/job-profiles/{profile['id']}/approve", headers=h)
        assert resp.status_code == 200
        assert resp.json()["status"] == "approved"


# ---------------------------------------------------------------------------
# Candidate Profiles
# ---------------------------------------------------------------------------


class TestCandidateProfiles:
    def test_create_list_get_profile(self, client: httpx.Client) -> None:
        org, user = bootstrap(client)
        h = auth_headers(org["id"], user["id"])

        resp = client.post("/api/v1/candidates", json={"full_name": "C"}, headers=h)
        cand = resp.json()
        resp = client.post(
            f"/api/v1/candidates/{cand['id']}/resumes",
            json={"file_uri": "local://r.pdf"},
            headers=h,
        )
        resume = resp.json()

        resp = client.post(
            f"/api/v1/resumes/{resume['id']}/profiles",
            json={
                "status": "extracted",
                "source": "ai_extracted",
                "profile_data": {"skills": ["Python"]},
            },
            headers=h,
        )
        assert resp.status_code == 201
        profile = resp.json()
        assert profile["version_number"] == 1

        resp = client.get(f"/api/v1/candidate-profiles/{profile['id']}", headers=h)
        assert resp.status_code == 200

        resp = client.get(f"/api/v1/resumes/{resume['id']}/profiles", headers=h)
        assert resp.status_code == 200
        assert len(resp.json()) >= 1


# ---------------------------------------------------------------------------
# Candidate Profile Extraction (Phase 4.4 optional resume_text path)
# ---------------------------------------------------------------------------


class TestCandidateProfileExtraction:
    def _upload_pdf(self, client: httpx.Client, h: dict, cand_id: str) -> dict:
        from tests.resume_upload_fixtures import make_pdf_bytes

        resp = client.post(
            f"/api/v1/candidates/{cand_id}/resumes/upload",
            headers=h,
            files={
                "file": (
                    "resume.pdf",
                    make_pdf_bytes(),
                    "application/pdf",
                )
            },
        )
        assert resp.status_code == 201
        assert resp.json()["status"] == "text_extracted"
        return resp.json()

    def test_extract_using_stored_text_when_resume_text_omitted(self, client: httpx.Client) -> None:
        org, user = bootstrap(client)
        h = auth_headers(org["id"], user["id"])
        cand = client.post("/api/v1/candidates", json={"full_name": "C"}, headers=h).json()
        resume = self._upload_pdf(client, h, cand["id"])

        resp = client.post(
            f"/api/v1/resumes/{resume['id']}/extract-profile",
            json={},
            headers=h,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["profile_id"] is not None
        assert data["workflow_run_id"] is not None
        assert data["version_number"] == 1

    def test_extract_with_explicit_resume_text(self, client: httpx.Client) -> None:
        org, user = bootstrap(client)
        h = auth_headers(org["id"], user["id"])
        cand = client.post("/api/v1/candidates", json={"full_name": "C"}, headers=h).json()

        # Create a resume with no text, then pass resume_text explicitly.
        resume = client.post(
            f"/api/v1/candidates/{cand['id']}/resumes",
            json={"file_uri": "local://r.pdf"},
            headers=h,
        ).json()

        resp = client.post(
            f"/api/v1/resumes/{resume['id']}/extract-profile",
            json={"resume_text": "Ada loves Python and mathematics."},
            headers=h,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["version_number"] == 1

    def test_extract_without_text_fails_when_no_stored_text(self, client: httpx.Client) -> None:
        org, user = bootstrap(client)
        h = auth_headers(org["id"], user["id"])
        cand = client.post("/api/v1/candidates", json={"full_name": "C"}, headers=h).json()
        resume = client.post(
            f"/api/v1/candidates/{cand['id']}/resumes",
            json={"file_uri": "local://r.pdf"},
            headers=h,
        ).json()

        resp = client.post(
            f"/api/v1/resumes/{resume['id']}/extract-profile",
            json={},
            headers=h,
        )
        assert resp.status_code == 409


# ---------------------------------------------------------------------------
# Evaluations (read-only)
# ---------------------------------------------------------------------------


class TestEvaluations:
    def test_list_and_get_evaluations(self, client: httpx.Client, db_session: Session) -> None:
        org, user = bootstrap(client)
        h = auth_headers(org["id"], user["id"])

        from datetime import UTC, datetime

        from app.models import (
            CandidateEvaluation,
            CandidateProfile,
            JobProfile,
            MatchEvidence,
        )

        organization = db_session.get(models.Organization, uuid.UUID(org["id"]))
        user_obj = db_session.get(models.User, uuid.UUID(user["id"]))

        job = models.Job(
            organization_id=organization.id,
            created_by_user_id=user_obj.id,
            title="Test Job",
        )
        db_session.add(job)
        db_session.flush()

        candidate = models.Candidate(organization_id=organization.id, full_name="Test Cand")
        db_session.add(candidate)
        db_session.flush()

        resume = models.Resume(candidate_id=candidate.id, file_uri="local://test.pdf")
        db_session.add(resume)
        db_session.flush()

        application = models.JobApplication(
            organization_id=organization.id,
            job_id=job.id,
            candidate_id=candidate.id,
            resume_id=resume.id,
        )
        db_session.add(application)
        db_session.flush()

        job_profile = JobProfile(
            job_id=job.id,
            version_number=1,
            status="approved",
            source="hr_created",
            profile_data={"title": "Test Job", "requirements": []},
            approved_by_user_id=user_obj.id,
            approved_at=datetime.now(UTC),
            is_current=True,
        )
        db_session.add(job_profile)
        db_session.flush()

        candidate_profile = CandidateProfile(
            resume_id=resume.id,
            version_number=1,
            status="current",
            source="system_extracted",
            profile_data={"skills": ["Python"]},
            is_current=True,
        )
        db_session.add(candidate_profile)
        db_session.flush()

        evaluation = CandidateEvaluation(
            job_application_id=application.id,
            job_profile_id=job_profile.id,
            candidate_profile_id=candidate_profile.id,
            version_number=1,
            status="completed",
            score="85.000",
            scoring_version="1.0",
            score_breakdown={"test": "data"},
            is_current=True,
        )
        db_session.add(evaluation)
        db_session.flush()

        evidence = MatchEvidence(
            candidate_evaluation_id=evaluation.id,
            evidence_type="matched",
            requirement_ref={"requirement_key": "req-test1234567890"},
        )
        db_session.add(evidence)
        db_session.flush()

        resp = client.get(f"/api/v1/job-applications/{application.id}/evaluations", headers=h)
        assert resp.status_code == 200
        evals = resp.json()
        assert len(evals) >= 1
        assert evals[0]["score"] == "85.000"

        resp = client.get(f"/api/v1/evaluations/{evaluation.id}", headers=h)
        assert resp.status_code == 200
        assert resp.json()["score"] == "85.000"
        assert resp.json()["score_breakdown"] == {"test": "data"}

        resp = client.get(f"/api/v1/evaluations/{evaluation.id}/evidence", headers=h)
        assert resp.status_code == 200
        assert len(resp.json()) >= 1


# ---------------------------------------------------------------------------
# HR Decisions
# ---------------------------------------------------------------------------


class TestHRDecisions:
    def test_create_decision(self, client: httpx.Client, db_session: Session) -> None:
        org, user = bootstrap(client)
        h = auth_headers(org["id"], user["id"])

        organization = db_session.get(models.Organization, uuid.UUID(org["id"]))
        user_obj = db_session.get(models.User, uuid.UUID(user["id"]))

        job = models.Job(
            organization_id=organization.id,
            created_by_user_id=user_obj.id,
            title="J",
        )
        db_session.add(job)
        db_session.flush()

        candidate = models.Candidate(organization_id=organization.id, full_name="C")
        db_session.add(candidate)
        db_session.flush()

        resume = models.Resume(candidate_id=candidate.id, file_uri="local://r.pdf")
        db_session.add(resume)
        db_session.flush()

        application = models.JobApplication(
            organization_id=organization.id,
            job_id=job.id,
            candidate_id=candidate.id,
            resume_id=resume.id,
        )
        db_session.add(application)
        db_session.flush()

        resp = client.post(
            f"/api/v1/job-applications/{application.id}/decisions",
            json={"decision": "advance", "reason": "Good fit"},
            headers=h,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["decision"] == "advance"
        assert data["reason"] == "Good fit"
        assert data["user_id"] == user["id"]

    def test_invalid_decision_rejected(self, client: httpx.Client, db_session: Session) -> None:
        org, user = bootstrap(client)
        h = auth_headers(org["id"], user["id"])

        organization = db_session.get(models.Organization, uuid.UUID(org["id"]))
        user_obj = db_session.get(models.User, uuid.UUID(user["id"]))

        job = models.Job(
            organization_id=organization.id,
            created_by_user_id=user_obj.id,
            title="J",
        )
        db_session.add(job)
        db_session.flush()

        candidate = models.Candidate(organization_id=organization.id, full_name="C")
        db_session.add(candidate)
        db_session.flush()

        resume = models.Resume(candidate_id=candidate.id, file_uri="local://r.pdf")
        db_session.add(resume)
        db_session.flush()

        application = models.JobApplication(
            organization_id=organization.id,
            job_id=job.id,
            candidate_id=candidate.id,
            resume_id=resume.id,
        )
        db_session.add(application)
        db_session.flush()

        resp = client.post(
            f"/api/v1/job-applications/{application.id}/decisions",
            json={"decision": "invalid_decision"},
            headers=h,
        )
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# No POST MatchEvidence endpoint
# ---------------------------------------------------------------------------


class TestNoMatchEvidencePost:
    def test_no_post_evidence_endpoint(self, client: httpx.Client) -> None:
        resp = client.post(
            "/api/v1/evaluations/00000000-0000-0000-0000-000000000000/evidence",
            json={},
        )
        assert resp.status_code == 405


# ---------------------------------------------------------------------------
# No evaluation CRUD creation endpoint
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Candidate Pool (job-scoped ranking)
# ---------------------------------------------------------------------------


class TestCandidatePool:
    def _seed(
        self,
        client: httpx.Client,
        db_session: Session,
        org: dict,
        user: dict,
    ) -> tuple[models.Job, dict]:
        from datetime import UTC, datetime
        from decimal import Decimal

        organization = db_session.get(models.Organization, uuid.UUID(org["id"]))
        user_obj = db_session.get(models.User, uuid.UUID(user["id"]))

        h = auth_headers(org["id"], user["id"])
        resp = client.post("/api/v1/jobs", json={"title": "Pool Job"}, headers=h)
        job = resp.json()
        job_obj = db_session.get(models.Job, uuid.UUID(job["id"]))

        job_profile = models.JobProfile(
            job_id=job_obj.id,
            version_number=1,
            status="approved",
            source="hr_created",
            profile_data={"title": "Pool Job", "requirements": []},
            approved_by_user_id=user_obj.id,
            approved_at=datetime.now(UTC),
            is_current=True,
        )
        db_session.add(job_profile)
        db_session.flush()

        def add_candidate(full_name, email, score=None, decision=None):
            candidate = models.Candidate(
                organization_id=organization.id, full_name=full_name, email=email
            )
            db_session.add(candidate)
            db_session.flush()
            resume = models.Resume(candidate_id=candidate.id, file_uri="local://pool.pdf")
            db_session.add(resume)
            db_session.flush()
            application = models.JobApplication(
                organization_id=organization.id,
                job_id=job_obj.id,
                candidate_id=candidate.id,
                resume_id=resume.id,
            )
            db_session.add(application)
            db_session.flush()
            candidate_profile = models.CandidateProfile(
                resume_id=resume.id,
                version_number=1,
                status="current",
                source="system_extracted",
                profile_data={"skills": []},
                is_current=True,
            )
            db_session.add(candidate_profile)
            db_session.flush()
            if score is not None:
                evaluation = models.CandidateEvaluation(
                    job_application_id=application.id,
                    job_profile_id=job_profile.id,
                    candidate_profile_id=candidate_profile.id,
                    version_number=1,
                    status="completed",
                    score=Decimal(score),
                    recommendation="advance",
                    is_current=True,
                    completed_at=datetime.now(UTC),
                )
                db_session.add(evaluation)
                db_session.flush()
            if decision is not None:
                hr_decision = models.HRDecision(
                    job_application_id=application.id,
                    user_id=user_obj.id,
                    decision=decision,
                    reason="Reviewer decision.",
                )
                db_session.add(hr_decision)
                db_session.flush()
            return candidate, application

        add_candidate("Ada Top", "ada@example.com", score=88, decision="advance")
        add_candidate("Ben Mid", "ben@example.com", score=55, decision="hold")
        add_candidate("Cid Low", "cid@example.com", score=20)
        no_eval, no_eval_app = add_candidate("Dee None", "dee@example.com")
        db_session.commit()
        return job_obj, {"no_eval_candidate": no_eval, "no_eval_app": no_eval_app}

    def test_list_ranked_candidates(self, client: httpx.Client, db_session: Session) -> None:
        org, user = bootstrap(client)
        h = auth_headers(org["id"], user["id"])
        job, _ = self._seed(client, db_session, org, user)

        resp = client.get(f"/api/v1/jobs/{job.id}/candidates", headers=h)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 4

        names = [row["full_name"] for row in data]
        assert names == ["Ada Top", "Ben Mid", "Cid Low", "Dee None"]
        assert data[0]["group"] == "must_review"
        assert data[1]["group"] == "consider"
        assert data[2]["group"] == "lower_priority"
        assert data[3]["group"] == "lower_priority"
        assert data[0]["decision"] == "advance"
        assert data[1]["decision"] == "hold"
        assert data[2]["decision"] is None
        assert data[3]["score"] is None
        assert data[0]["score"] == "88"
        for row in data:
            assert "extracted_text" not in row
            assert "candidate_id" in row
            assert "application_id" in row

    def test_group_and_search_filters(self, client: httpx.Client, db_session: Session) -> None:
        org, user = bootstrap(client)
        h = auth_headers(org["id"], user["id"])
        job, _ = self._seed(client, db_session, org, user)

        resp = client.get(f"/api/v1/jobs/{job.id}/candidates?group=consider", headers=h)
        assert resp.status_code == 200
        assert [row["full_name"] for row in resp.json()] == ["Ben Mid"]

        resp = client.get(f"/api/v1/jobs/{job.id}/candidates?search=dee@example", headers=h)
        assert resp.status_code == 200
        assert [row["full_name"] for row in resp.json()] == ["Dee None"]

        resp = client.get(f"/api/v1/jobs/{job.id}/candidates?decision=hold", headers=h)
        assert resp.status_code == 200
        assert [row["full_name"] for row in resp.json()] == ["Ben Mid"]

        resp = client.get(f"/api/v1/jobs/{job.id}/candidates?min_score=40", headers=h)
        assert resp.status_code == 200
        assert [row["full_name"] for row in resp.json()] == ["Ada Top", "Ben Mid"]

    def test_cross_org_job_returns_422(self, client: httpx.Client, db_session: Session) -> None:
        org_a, user_a = bootstrap(client)
        job, _ = self._seed(client, db_session, org_a, user_a)

        org_b, user_b = bootstrap(client)
        h = auth_headers(org_b["id"], user_b["id"])
        resp = client.get(f"/api/v1/jobs/{job.id}/candidates", headers=h)
        assert resp.status_code == 422

    def test_nonexistent_job_returns_404(self, client: httpx.Client, db_session: Session) -> None:
        org, user = bootstrap(client)
        h = auth_headers(org["id"], user["id"])
        resp = client.get(f"/api/v1/jobs/{uuid.uuid4()}/candidates", headers=h)
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Job screening (Phase 4.5 batch CV screening endpoint)
# ---------------------------------------------------------------------------


class TestJobScreening:
    def _pdf(self, filename: str = "ada-lovelace.pdf") -> tuple[str, bytes, str]:
        from tests.resume_upload_fixtures import make_pdf_bytes

        return filename, make_pdf_bytes(), "application/pdf"

    def test_screen_batch_creates_candidates_applications_evaluations(
        self, client: httpx.Client
    ) -> None:
        org, user = bootstrap(client)
        h = auth_headers(org["id"], user["id"])

        job = client.post(
            "/api/v1/jobs",
            json={
                "title": "Screening Test Job",
                "status": "active",
                "raw_description": "Build and maintain backend services.",
            },
            headers=h,
        ).json()

        resp = client.post(
            f"/api/v1/jobs/{job['id']}/screen",
            headers=h,
            files=[
                ("files", self._pdf("ada-lovelace.pdf")),
                ("files", self._pdf("grace-hopper-cv.pdf")),
            ],
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["job_id"] == job["id"]
        assert data["job_title"] == "Screening Test Job"
        assert len(data["screened"]) == 2

        for row in data["screened"]:
            assert row["candidate_id"] is not None
            assert row["resume_id"] is not None
            assert row["application_id"] is not None
            assert row["evaluation_id"] is not None

            apps = client.get(
                f"/api/v1/job-applications/{row['application_id']}",
                headers=h,
            )
            assert apps.status_code == 200

            evals = client.get(
                f"/api/v1/job-applications/{row['application_id']}/evaluations",
                headers=h,
            )
            assert evals.status_code == 200
            assert len(evals.json()) >= 1

        resp = client.get(f"/api/v1/jobs/{job['id']}/applications", headers=h)
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    def test_screen_rejects_empty_file(self, client: httpx.Client) -> None:
        org, user = bootstrap(client)
        h = auth_headers(org["id"], user["id"])

        job = client.post(
            "/api/v1/jobs",
            json={
                "title": "Screening Empty Job",
                "status": "active",
                "raw_description": "A job description.",
            },
            headers=h,
        ).json()

        resp = client.post(
            f"/api/v1/jobs/{job['id']}/screen",
            headers=h,
            files=[("files", ("empty.pdf", b"", "application/pdf"))],
        )
        assert resp.status_code == 422

    def test_screen_nonexistent_job_returns_404(self, client: httpx.Client) -> None:
        org, user = bootstrap(client)
        h = auth_headers(org["id"], user["id"])

        resp = client.post(
            f"/api/v1/jobs/{uuid.uuid4()}/screen",
            headers=h,
            files=[("files", self._pdf("ada-lovelace.pdf"))],
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Phase 4 Application / Review / Talent Pool read models
# ---------------------------------------------------------------------------


def _seed_application_records(
    db_session: Session,
    organization: models.Organization,
    user: models.User,
) -> tuple[models.JobApplication, models.Job, models.Candidate, models.Resume]:
    """Insert application parent records (job, candidate, resume, app, profiles)."""
    job = models.Job(
        organization_id=organization.id,
        created_by_user_id=user.id,
        title="Read Model Job",
    )
    candidate = models.Candidate(
        organization_id=organization.id,
        full_name="Read Model Candidate",
        email="read-model@example.com",
    )
    db_session.add_all([job, candidate])
    db_session.flush()

    resume = models.Resume(candidate_id=candidate.id, file_uri="local://read-model.pdf")
    db_session.add(resume)
    db_session.flush()

    application = models.JobApplication(
        organization_id=organization.id,
        job_id=job.id,
        candidate_id=candidate.id,
        resume_id=resume.id,
    )
    db_session.add(application)
    db_session.flush()

    job_profile = models.JobProfile(
        job_id=job.id,
        version_number=1,
        status="approved",
        source="hr_created",
        profile_data={"title": "Read Model Job", "requirements": [], "skills": ["Python"]},
        approved_by_user_id=user.id,
        approved_at=datetime.now(UTC),
        is_current=True,
    )
    candidate_profile = models.CandidateProfile(
        resume_id=resume.id,
        version_number=1,
        status="current",
        source="system_extracted",
        profile_data={"skills": ["Python"]},
        is_current=True,
    )
    db_session.add_all([job_profile, candidate_profile])
    db_session.flush()

    return application, job, candidate, resume


def _seed_evaluation(
    db_session: Session,
    application: models.JobApplication,
    *,
    score: str = "95.000",
    recommendation: str | None = None,
) -> models.CandidateEvaluation:
    """Insert a completed current evaluation for an application."""
    job_profile = db_session.scalar(
        select(models.JobProfile)
        .where(models.JobProfile.job_id == application.job_id)
        .order_by(models.JobProfile.version_number)
    )
    resume = db_session.get(models.Resume, application.resume_id)
    candidate_profile = db_session.scalar(
        select(models.CandidateProfile)
        .where(models.CandidateProfile.resume_id == resume.id)
        .order_by(models.CandidateProfile.version_number)
    )
    evaluation = models.CandidateEvaluation(
        job_application_id=application.id,
        job_profile_id=job_profile.id,
        candidate_profile_id=candidate_profile.id,
        version_number=1,
        status="completed",
        score=score,
        recommendation=recommendation,
        explanation={"summary": "Strong match."},
        scoring_version="1.0",
        is_current=True,
        completed_at=datetime.now(UTC),
    )
    db_session.add(evaluation)
    db_session.flush()
    return evaluation


class TestApplicationList:
    def test_list_applications_org_scoped_with_summary_fields(
        self, client: httpx.Client, db_session: Session
    ) -> None:
        org, user = bootstrap(client)
        h = auth_headers(org["id"], user["id"])
        organization = db_session.get(models.Organization, uuid.UUID(org["id"]))
        user_obj = db_session.get(models.User, uuid.UUID(user["id"]))
        application, job, candidate, _resume = _seed_application_records(
            db_session, organization, user_obj
        )
        _seed_evaluation(db_session, application, score="92.000")

        other_org, other_user = bootstrap(client)
        other_organization = db_session.get(models.Organization, uuid.UUID(other_org["id"]))
        other_user_obj = db_session.get(models.User, uuid.UUID(other_user["id"]))
        _seed_application_records(db_session, other_organization, other_user_obj)

        resp = client.get("/api/v1/job-applications", headers=h)
        assert resp.status_code == 200
        rows = resp.json()
        assert len(rows) == 1
        row = rows[0]
        assert row["id"] == str(application.id)
        assert row["candidate_id"] == str(candidate.id)
        assert row["candidate_name"] == "Read Model Candidate"
        assert row["job_id"] == str(job.id)
        assert row["job_title"] == "Read Model Job"
        assert row["score"] == "92.000"
        assert row["status"] == "created"

    def test_list_applications_status_filter(
        self, client: httpx.Client, db_session: Session
    ) -> None:
        org, user = bootstrap(client)
        h = auth_headers(org["id"], user["id"])
        organization = db_session.get(models.Organization, uuid.UUID(org["id"]))
        user_obj = db_session.get(models.User, uuid.UUID(user["id"]))
        application, _job, _candidate, _resume = _seed_application_records(
            db_session, organization, user_obj
        )
        application.status = "hold"
        db_session.flush()

        resp = client.get("/api/v1/job-applications", params={"status": "hold"}, headers=h)
        assert resp.status_code == 200
        rows = resp.json()
        assert len(rows) == 1
        assert rows[0]["status"] == "hold"

        resp = client.get(
            "/api/v1/job-applications", params={"status": "ready_for_review"}, headers=h
        )
        assert resp.status_code == 200
        assert resp.json() == []

    def test_list_applications_invalid_status_returns_422(self, client: httpx.Client) -> None:
        org, user = bootstrap(client)
        h = auth_headers(org["id"], user["id"])
        resp = client.get("/api/v1/job-applications", params={"status": "bogus"}, headers=h)
        assert resp.status_code == 422

    def test_list_applications_missing_headers_returns_422(self, client: httpx.Client) -> None:
        resp = client.get("/api/v1/job-applications")
        assert resp.status_code == 422


class TestReviewBundle:
    def test_review_bundle_returns_full_shape(
        self, client: httpx.Client, db_session: Session
    ) -> None:
        org, user = bootstrap(client)
        h = auth_headers(org["id"], user["id"])
        organization = db_session.get(models.Organization, uuid.UUID(org["id"]))
        user_obj = db_session.get(models.User, uuid.UUID(user["id"]))
        application, _job, _candidate, _resume = _seed_application_records(
            db_session, organization, user_obj
        )
        evaluation = _seed_evaluation(
            db_session, application, score="95.000", recommendation="advance"
        )
        evidence = models.MatchEvidence(
            candidate_evaluation_id=evaluation.id,
            evidence_type="matched",
            requirement_ref={"requirement_key": "req-python1234567890"},
            candidate_evidence={"source": "resume", "skill": "Python"},
            strength="strong",
            provenance={"source": "fake"},
        )
        decision = models.HRDecision(
            job_application_id=application.id,
            user_id=user_obj.id,
            decision="hold",
            reason="Second opinion.",
            candidate_evaluation_id=evaluation.id,
        )
        db_session.add_all([evidence, decision])
        db_session.flush()

        resp = client.get(f"/api/v1/job-applications/{application.id}/review-bundle", headers=h)
        assert resp.status_code == 200
        data = resp.json()
        assert data["application"]["id"] == str(application.id)
        assert data["candidate"]["name"] == "Read Model Candidate"
        assert data["candidate"]["email"] == "read-model@example.com"
        assert data["job"]["title"] == "Read Model Job"
        assert len(data["evaluations"]) == 1
        assert data["evaluation"]["id"] == str(evaluation.id)
        assert data["evaluation"]["score"] == "95.000"
        assert data["evaluation"]["recommendation"] == "advance"
        assert len(data["evidence"]) == 1
        assert data["evidence"][0]["evidence_type"] == "matched"
        pool_row = data["pool_row"]
        assert pool_row["group"] == "must_review"
        assert pool_row["score"] == "95.000"
        assert pool_row["decision"] == "hold"
        assert pool_row["decision_created_at"] is not None

    def test_review_bundle_without_evaluation(
        self, client: httpx.Client, db_session: Session
    ) -> None:
        org, user = bootstrap(client)
        h = auth_headers(org["id"], user["id"])
        organization = db_session.get(models.Organization, uuid.UUID(org["id"]))
        user_obj = db_session.get(models.User, uuid.UUID(user["id"]))
        application, _job, _candidate, _resume = _seed_application_records(
            db_session, organization, user_obj
        )

        resp = client.get(f"/api/v1/job-applications/{application.id}/review-bundle", headers=h)
        assert resp.status_code == 200
        data = resp.json()
        assert data["evaluations"] == []
        assert data["evaluation"] is None
        assert data["evidence"] == []
        assert data["pool_row"]["group"] == "lower_priority"
        assert data["pool_row"]["score"] is None
        assert data["pool_row"]["decision"] is None

    def test_review_bundle_org_mismatch_returns_422(
        self, client: httpx.Client, db_session: Session
    ) -> None:
        org, user = bootstrap(client)
        organization = db_session.get(models.Organization, uuid.UUID(org["id"]))
        user_obj = db_session.get(models.User, uuid.UUID(user["id"]))
        application, _job, _candidate, _resume = _seed_application_records(
            db_session, organization, user_obj
        )

        other_org, other_user = bootstrap(client)
        other_h = auth_headers(other_org["id"], other_user["id"])
        resp = client.get(
            f"/api/v1/job-applications/{application.id}/review-bundle", headers=other_h
        )
        assert resp.status_code == 422

    def test_review_bundle_missing_returns_404(self, client: httpx.Client) -> None:
        org, user = bootstrap(client)
        h = auth_headers(org["id"], user["id"])
        resp = client.get(f"/api/v1/job-applications/{uuid.uuid4()}/review-bundle", headers=h)
        assert resp.status_code == 404


class TestTriggerEvaluation:
    def test_trigger_evaluation_creates_evaluation_and_traces(
        self, client: httpx.Client, db_session: Session
    ) -> None:
        org, user = bootstrap(client)
        h = auth_headers(org["id"], user["id"])
        organization = db_session.get(models.Organization, uuid.UUID(org["id"]))
        user_obj = db_session.get(models.User, uuid.UUID(user["id"]))
        application, _job, _candidate, _resume = _seed_application_records(
            db_session, organization, user_obj
        )

        resp = client.post(f"/api/v1/job-applications/{application.id}/evaluations", headers=h)
        assert resp.status_code == 201
        data = resp.json()
        assert data["evaluation_id"] is not None
        assert data["workflow_run_id"] is not None
        assert data["version_number"] >= 1

        workflow_runs = db_session.scalars(
            select(models.WorkflowRun).where(
                models.WorkflowRun.workflow_type == "candidate_evaluation"
            )
        ).all()
        assert len(workflow_runs) >= 1

        bundle = client.get(
            f"/api/v1/job-applications/{application.id}/review-bundle", headers=h
        ).json()
        assert bundle["evaluation"] is not None
        assert bundle["evaluation"]["id"] == data["evaluation_id"]
        assert bundle["pool_row"]["score"] is not None

    def test_evaluate_alias_still_works(self, client: httpx.Client, db_session: Session) -> None:
        org, user = bootstrap(client)
        h = auth_headers(org["id"], user["id"])
        organization = db_session.get(models.Organization, uuid.UUID(org["id"]))
        user_obj = db_session.get(models.User, uuid.UUID(user["id"]))
        application, _job, _candidate, _resume = _seed_application_records(
            db_session, organization, user_obj
        )

        resp = client.post(f"/api/v1/job-applications/{application.id}/evaluate", headers=h)
        assert resp.status_code == 201
        data = resp.json()
        assert data["evaluation_id"] is not None

    def test_trigger_evaluation_org_mismatch_returns_422(
        self, client: httpx.Client, db_session: Session
    ) -> None:
        org, user = bootstrap(client)
        organization = db_session.get(models.Organization, uuid.UUID(org["id"]))
        user_obj = db_session.get(models.User, uuid.UUID(user["id"]))
        application, _job, _candidate, _resume = _seed_application_records(
            db_session, organization, user_obj
        )

        other_org, other_user = bootstrap(client)
        other_h = auth_headers(other_org["id"], other_user["id"])
        resp = client.post(
            f"/api/v1/job-applications/{application.id}/evaluations", headers=other_h
        )
        assert resp.status_code == 422

    def test_trigger_evaluation_missing_returns_404(self, client: httpx.Client) -> None:
        org, user = bootstrap(client)
        h = auth_headers(org["id"], user["id"])
        resp = client.post(f"/api/v1/job-applications/{uuid.uuid4()}/evaluations", headers=h)
        assert resp.status_code == 404


class TestTalentPool:
    def test_talent_pool_returns_hold_advanced_org_scoped(
        self, client: httpx.Client, db_session: Session
    ) -> None:
        org, user = bootstrap(client)
        h = auth_headers(org["id"], user["id"])
        organization = db_session.get(models.Organization, uuid.UUID(org["id"]))
        user_obj = db_session.get(models.User, uuid.UUID(user["id"]))

        hold_app, _job, _candidate, _resume = _seed_application_records(
            db_session, organization, user_obj
        )
        hold_app.status = "hold"
        _seed_evaluation(db_session, hold_app, score="80.000")
        decision = models.HRDecision(
            job_application_id=hold_app.id,
            user_id=user_obj.id,
            decision="hold",
            reason="Hold for later.",
        )
        db_session.add(decision)

        advanced_app, _job2, _candidate2, _resume2 = _seed_application_records(
            db_session, organization, user_obj
        )
        advanced_app.status = "advanced"
        _seed_evaluation(db_session, advanced_app, score="95.000")

        rejected_app, _job3, _candidate3, _resume3 = _seed_application_records(
            db_session, organization, user_obj
        )
        rejected_app.status = "rejected"
        db_session.flush()

        other_org, other_user = bootstrap(client)
        other_organization = db_session.get(models.Organization, uuid.UUID(other_org["id"]))
        other_user_obj = db_session.get(models.User, uuid.UUID(other_user["id"]))
        other_app, _job4, _candidate4, _resume4 = _seed_application_records(
            db_session, other_organization, other_user_obj
        )
        other_app.status = "hold"
        db_session.flush()

        resp = client.get("/api/v1/talent-pool", headers=h)
        assert resp.status_code == 200
        rows = resp.json()
        assert len(rows) == 2
        application_ids = {row["application_id"] for row in rows}
        assert application_ids == {str(hold_app.id), str(advanced_app.id)}
        hold_row = next(row for row in rows if row["application_id"] == str(hold_app.id))
        assert hold_row["full_name"] == "Read Model Candidate"
        assert hold_row["job_title"] == "Read Model Job"
        assert hold_row["score"] == "80.000"
        assert hold_row["decision"] == "hold"
        assert hold_row["group"] == "must_review"

    def test_talent_pool_empty_without_hold_advanced(
        self, client: httpx.Client, db_session: Session
    ) -> None:
        org, user = bootstrap(client)
        h = auth_headers(org["id"], user["id"])
        organization = db_session.get(models.Organization, uuid.UUID(org["id"]))
        user_obj = db_session.get(models.User, uuid.UUID(user["id"]))
        application, _job, _candidate, _resume = _seed_application_records(
            db_session, organization, user_obj
        )
        application.status = "archived"
        db_session.flush()

        resp = client.get("/api/v1/talent-pool", headers=h)
        assert resp.status_code == 200
        assert resp.json() == []