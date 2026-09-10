"""Live E2E: drive the exact API flow the frontend_last screening UI uses,
against the local backend (:8000) with the dev identity from frontend_last/.env.

Run:  backend/.venv/Scripts/python.exe tools/e2e_screening_flow.py
Requires the backend to be up (tools/start_backend.ps1) and a real AI provider
or the fake provider; scores vary with the live LLM, so checks are relative
(> 0), not exact.
"""
import io
import sys

import httpx
from docx import Document

BASE = "http://localhost:8000/api/v1"
ORG = "09df6372-c821-4c6f-b633-9f9fe8438f85"
USER = "76598a7a-f0bc-4531-ad74-e232a3e30a53"
HEADERS = {"X-Organization-Id": ORG, "X-User-Id": USER}

RESUME_TEXT = [
    "Ada Lovelace",
    "London, United Kingdom",
    "ada.lovelace@example.com",
    "+44 20 7946 0958",
    "linkedin.com/in/ada-lovelace",
    "github.com/adalovelace",
    "portfolio: ada.dev/engineering",
    "EXPERIENCE",
    "Data Analyst, 2018 - 2021",
    "Senior Data Engineer, 2021 - present",
    "EDUCATION",
    "BSc Computer Science",
    "MSc Data Science",
    "CERTIFICATIONS",
    "AWS Certified Solutions Architect",
    "SKILLS",
    "Python, TypeScript, React, Postgres, Docker, Kubernetes, Machine Learning",
    "Languages: English (native), French",
]


def make_docx_bytes() -> bytes:
    doc = Document()
    for line in RESUME_TEXT:
        doc.add_paragraph(line)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def make_pdf_bytes() -> bytes:
    text = "Grace Hopper is an engineer skilled in Python, Data Structures and Algorithms."
    content = f"BT /F1 12 Tf 50 700 Td ({text}) Tj ET".encode("latin-1")
    parts = [
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj",
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj",
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj",
        b"4 0 obj\n<< /Length " + str(len(content)).encode() + b" >>\nstream\n" + content + b"\nendstream\nendobj",
        b"5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj",
    ]
    body = b"\n".join(parts)
    xref = 42 + len(body)
    return b"%PDF-1.4\n" + body + b"\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" + str(xref).encode() + b"\n%%EOF"


def check(name, cond, extra=""):
    status = "PASS" if cond else "FAIL"
    print(f"[{status}] {name}" + (f" -- {extra}" if extra else ""))
    if not cond:
        sys.exit(1)


def main():
    client = httpx.Client(timeout=60)
    client.headers.update(HEADERS)

    job = client.post(f"{BASE}/jobs", json={
        "title": "E2E Screening Job (frontend_last)",
        "status": "active",
        "raw_description": "Build and maintain backend services with Python.",
        "required_skills": ["Python", "Data Engineering", "Machine Learning", "Postgres", "Docker"],
        "requirements": ["React", "TypeScript"],
        "experience": "3+ years",
    })
    check("create job", job.status_code == 201, f"status={job.status_code}")
    job_data = job.json()
    job_id = job_data["id"]
    print("    job_id:", job_id)

    screen = client.post(
        f"{BASE}/jobs/{job_id}/screen",
        files=[
            ("files", ("ada-lovelace-cv.docx", make_docx_bytes(),
                       "application/vnd.openxmlformats-officedocument.wordprocessingml.document")),
            ("files", ("grace-hopper-cv.pdf", make_pdf_bytes(), "application/pdf")),
        ],
    )
    check("screen two CVs", screen.status_code == 201, f"status={screen.status_code}")
    screen_data = screen.json()
    check("job title echoed", screen_data["job_title"] == "E2E Screening Job (frontend_last)")
    rows = screen_data["screened"]
    check("two screened rows", len(rows) == 2)

    docx_row = rows[0]
    pdf_row = rows[1]
    print("    docx score:", docx_row["score"], "| pdf score:", pdf_row["score"])
    check("docx score > 0", float(docx_row["score"]) > 0)
    check("pdf score > 0", float(pdf_row["score"]) > 0)

    # --- Candidate profile extraction result (rich CV) ---
    profiles = client.get(f"{BASE}/resumes/{docx_row['resume_id']}/profiles")
    check("profiles list", profiles.status_code == 200)
    profiles_data = profiles.json()
    check("at least one profile", len(profiles_data) >= 1)
    pd = profiles_data[0]["profile_data"]
    check("email extracted", pd.get("email") == "ada.lovelace@example.com", repr(pd.get("email")))
    check("phone extracted", pd.get("phone") == "+44 20 7946 0958", repr(pd.get("phone")))
    check("location extracted", "London" in (pd.get("location") or ""), repr(pd.get("location")))
    check("linkedin extracted", "linkedin.com/in/ada-lovelace" in (pd.get("linkedin_url") or ""), repr(pd.get("linkedin_url")))
    check("github extracted", "github.com/adalovelace" in (pd.get("github_url") or ""), repr(pd.get("github_url")))
    check("portfolio extracted", "ada.dev" in (pd.get("portfolio_url") or ""), repr(pd.get("portfolio_url")))
    check("skills include python", any((s or "").strip().lower() == "python" for s in (pd.get("skills") or [])),
          repr(pd.get("skills")))
    check("education >= 2", len(pd.get("education") or []) >= 2)
    check("languages include French", "french" in (pd.get("languages") or []) or "French" in (pd.get("languages") or []),
          repr(pd.get("languages")))
    check("certifications present", len(pd.get("certifications") or []) >= 1, repr(pd.get("certifications")))

    # --- Review workspace (the review page's one-call bundle) ---
    bundle = client.get(f"{BASE}/job-applications/{docx_row['application_id']}/review-bundle")
    check("review bundle", bundle.status_code == 200)
    b = bundle.json()
    check("bundle has evaluation", (b.get("evaluation") or {}).get("id") == docx_row["evaluation_id"])
    ev = b["evaluation"]
    check("score rounded matches", abs(float(ev["score"]) - float(docx_row["score"])) < 0.001)
    check("explanation summary", bool(ev.get("explanation", {}).get("summary")), repr(ev.get("explanation", {}).get("summary", "")[:60]))
    check("score_breakdown has rows", len(ev.get("score_breakdown") or {}) >= 1)
    check("evidence present", len(b.get("evidence") or []) >= 1)
    check("pool_row grouped", b.get("pool_row", {}).get("group") in ("must_review", "consider", "lower_priority"),
          repr(b.get("pool_row", {}).get("group")))
    check("resume id present", b.get("application", {}).get("resume_id") == docx_row["resume_id"])

    # --- Evidence endpoint ---
    evidence = client.get(f"{BASE}/evaluations/{docx_row['evaluation_id']}/evidence")
    check("evidence endpoint", evidence.status_code == 200)
    ev_list = evidence.json()
    types = {item["evidence_type"] for item in ev_list}
    check("evidence types valid", types <= {"matched", "partial", "missing"}, repr(types))
    check("evidence has candidate_evidence", any(item.get("candidate_evidence") for item in ev_list))

    # --- CV download (docx PK signature) ---
    download = client.get(f"{BASE}/resumes/{docx_row['resume_id']}/download")
    check("download docx", download.status_code == 200 and download.content[:2] == b"PK",
          f"status={download.status_code} head={download.content[:4]!r}")
    dispo = download.headers.get("content-disposition", "")
    check("download has filename", "filename=" in dispo, dispo)

    # --- HR decision (advance) ---
    decision = client.post(f"{BASE}/job-applications/{docx_row['application_id']}/decisions",
                           json={"decision": "advance", "reason": "E2E: strong match"})
    check("record decision", decision.status_code == 201, f"status={decision.status_code} body={decision.text[:120]}")

    # --- Talent pool now shows the advanced candidate org-wide ---
    pool = client.get(f"{BASE}/talent-pool")
    check("talent pool list", pool.status_code == 200)
    pool_rows = [(r["candidate_id"], r["job_title"], r["group"], r["score"]) for r in pool.json()]
    check("advanced candidate in talent pool",
          any(r[0] == docx_row["candidate_id"] for r in pool_rows), repr(pool_rows))

    print("\nE2E SCREENING FLOW: ALL CHECKS PASSED")


if __name__ == "__main__":
    main()