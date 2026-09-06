import apiClient from "./apiClient";

// Resume / candidate-profile service backed by the real backend.
// Endpoints: POST /candidates/{id}/resumes, POST /candidates/{id}/resumes/upload,
// GET /resumes/{id}, GET /candidate-profiles/{id}, GET/POST /resumes/{id}/profiles,
// POST /resumes/{id}/extract-profile.

export async function createResume(candidateId, payload) {
  const { data } = await apiClient.post(`/candidates/${candidateId}/resumes`, payload);
  return data;
}

export async function uploadResume(candidateId, file) {
  const formData = new FormData();
  formData.append("file", file, file.name);
  const { data } = await apiClient.post(`/candidates/${candidateId}/resumes/upload`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 60000,
  });
  return data;
}

export async function getResume(resumeId) {
  const { data } = await apiClient.get(`/resumes/${resumeId}`);
  return data;
}

export async function getCandidateProfile(profileId) {
  const { data } = await apiClient.get(`/candidate-profiles/${profileId}`);
  return data;
}

export async function listCandidateProfiles(resumeId) {
  const { data } = await apiClient.get(`/resumes/${resumeId}/profiles`);
  return Array.isArray(data) ? data : [];
}

export async function createCandidateProfile(resumeId, payload) {
  const { data } = await apiClient.post(`/resumes/${resumeId}/profiles`, payload);
  return data;
}

// Runs the AI candidate-profile extraction workflow (CandidateProfileExtractionRequest
// accepts an optional resume_text override; omitted = use stored extracted text).
export async function extractCandidateProfile(resumeId, resumeText) {
  const body = resumeText ? { resume_text: resumeText } : undefined;
  const { data } = await apiClient.post(`/resumes/${resumeId}/extract-profile`, body);
  return data;
}