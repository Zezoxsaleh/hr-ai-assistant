import React from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

// Generic "the request failed" state with a retry action.
// Usage: <ErrorState message="Unable to load candidates. Please try again." onRetry={load} />
export default function ErrorState({
  message = "Something went wrong. Please try again.",
  onRetry,
}) {
  return (
    <div className="error-state">
      <div className="error-state-icon">
        <AlertTriangle size={22} />
      </div>
      <p>{message}</p>
      {onRetry && (
        <button type="button" className="primary" onClick={onRetry}>
          <RotateCw size={16} /> Try Again
        </button>
      )}
    </div>
  );
}
