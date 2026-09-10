import React, { useEffect, useState } from "react";
import { RefreshCw, KeyRound, CheckCircle2, XCircle, Trash2 } from "lucide-react";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import ErrorState from "../../components/common/ErrorState";
import {
  getAISettings,
  setApiKey,
  clearApiKey,
  verifyApiKey,
} from "../../services/aiSettingsService";
import AIActivityList from "../ai-activity/AIActivityList";

const SOURCE_LABELS = {
  environment: "Server env (.env)",
  runtime: "Runtime (this session)",
  none: "No key configured",
};

export default function AISettings() {
  const [settings, setSettings] = useState(null);
  const [apiKey, setApiKeyField] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [verifyResult, setVerifyResult] = useState(null);

  const load = () => {
    setLoading(true);
    setError(false);
    getAISettings()
      .then(setSettings)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const save = async () => {
    if (!apiKey.trim()) {
      setFormError("Paste a Soal API key first.");
      return;
    }
    setBusy("save");
    setFormError("");
    setNotice("");
    setVerifyResult(null);
    try {
      const next = await setApiKey(apiKey.trim());
      setSettings(next);
      setApiKeyField("");
      setNotice("API key saved for this server session. AI calls will now use it.");
    } catch (err) {
      setFormError(err?.response?.data?.detail || "Failed to save the API key.");
    } finally {
      setBusy("");
    }
  };

  const remove = async () => {
    setBusy("clear");
    setFormError("");
    setNotice("");
    setVerifyResult(null);
    try {
      const next = await clearApiKey();
      setSettings(next);
      setNotice("Runtime API key cleared. The server default applies again.");
    } catch (err) {
      setFormError(err?.response?.data?.detail || "Failed to clear the API key.");
    } finally {
      setBusy("");
    }
  };

  const verify = async () => {
    setBusy("verify");
    setFormError("");
    setVerifyResult(null);
    try {
      const result = await verifyApiKey(apiKey.trim() || undefined);
      setVerifyResult(result);
      if (result.ok) setNotice("Verification succeeded.");
    } catch (err) {
      setFormError(err?.response?.data?.detail || "Verification request failed.");
    } finally {
      setBusy("");
    }
  };

  if (loading) return <LoadingSpinner label="Loading AI settings..." />;
  if (error || !settings)
    return <ErrorState message="Unable to load AI settings. Try again." onRetry={load} />;

  const soalActive = settings.provider === "soal";
  const runtimeActive = settings.api_key_source === "runtime";

  return (
    <section>
      <div className="content-grid">
        <div className="panel">
          <div className="panel-title">
          <div>
            <p className="eyebrow">AI PROVIDER</p>
            <h3>AI Settings</h3>
          </div>
          <button className="btn btn-secondary" onClick={load}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>

        <div className="dev-note">
          <strong>Soal</strong>
          <span>
            The backend calls Soal with the API key configured in its environment. If that
            key hits its free-tier rate limit, you can supply another one here — it applies
            to this server session without a restart and is never stored in the database.
          </span>
        </div>

        <div className="stats-grid" style={{ marginBottom: "1rem" }}>
          <div className="stat-card">
            <div className="stat-info">
              <span>Provider</span>
              <strong>{settings.provider}</strong>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-info">
              <span>Model</span>
              <strong>{settings.model || "—"}</strong>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-info">
              <span>API key</span>
              <strong style={{ color: settings.has_api_key ? "#12B76A" : "#F79009" }}>
                {settings.has_api_key ? "Configured" : "Missing"}
              </strong>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-info">
              <span>Key source</span>
              <strong>{SOURCE_LABELS[settings.api_key_source] || settings.api_key_source}</strong>
            </div>
          </div>
        </div>

        {!soalActive && (
          <p className="muted-note">
            Soal is not enabled yet — add an API key below to switch the backend to live AI
            screening without a restart.
          </p>
        )}

        {(formError || notice) && (
          <div className={formError ? "form-error" : "success-message"}>{formError || notice}</div>
        )}

        <label>
Soal API key
          <div className="input-with-icon">
            <KeyRound size={17} />
            <input
              name="apiKey"
              type="password"
              placeholder="Paste a Soal API key (not stored in the database)"
              value={apiKey}
              onChange={(e) => setApiKeyField(e.target.value)}
              autoComplete="off"
            />
          </div>
        </label>

        <div className="btn-row">
          <button className="btn btn-primary" onClick={save} disabled={busy === "save"}>
            {busy === "save" ? "Saving..." : "Save API key"}
          </button>
          <button className="btn btn-secondary" onClick={verify} disabled={busy === "verify"}>
            <CheckCircle2 size={16} /> {busy === "verify" ? "Verifying..." : "Verify key"}
          </button>
          {runtimeActive && (
            <button className="btn btn-secondary" onClick={remove} disabled={busy === "clear"}>
              <Trash2 size={16} /> Clear runtime key
            </button>
          )}
        </div>

        {verifyResult && (
          <div className={verifyResult.ok ? "success-message" : "form-error"}>
            {verifyResult.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}{" "}
            {verifyResult.message}
          </div>
        )}
        </div>
      </div>

      <div style={{ marginTop: 28 }}>
        <AIActivityList />
      </div>
    </section>
  );
}