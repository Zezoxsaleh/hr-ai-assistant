import axios from "axios";
import { getEnvDefaultIdentity, getStoredIdentity } from "./identityStorage";

// Central Axios instance for talking to the FastAPI backend.
// Every service file should import this instead of calling axios directly, so
// identity headers / error handling stay in one place.

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "https://soal.help/api/v1",
  headers: {
    "Content-Type": "application/json",
  },
});

// The backend uses header-based identity (no login / JWT). Attach the current
// development identity (persisted override, falling back to environment
// defaults) to every request. Only the two identity headers are sent.
apiClient.interceptors.request.use((config) => {
  const identity = getStoredIdentity() || getEnvDefaultIdentity();
  if (identity.organizationId) {
    config.headers["X-Organization-Id"] = identity.organizationId;
  }
  if (identity.userId) {
    config.headers["X-User-Id"] = identity.userId;
  }
  return config;
});

export default apiClient;