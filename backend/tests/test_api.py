"""API integration tests for Phase 4.3 HTTP endpoints."""

from __future__ import annotations

import uuid
from collections.abc import Generator

import httpx
import pytest
from fastapi.testclient import TestClient
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

        resp = client.get(f"/api/v1/jobs/{job['id']}", headers=h)
        assert resp.status_code == 200
        assert resp.json()["title"] == "Engineer"

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


class TestNoEvaluationCreate:
    def test_no_post_evaluation_endpoint(self, client: httpx.Client) -> None:
        resp = client.post(
            "/api/v1/job-applications/00000000-0000-0000-0000-000000000000/evaluations",
            json={},
        )
        assert resp.status_code == 405
