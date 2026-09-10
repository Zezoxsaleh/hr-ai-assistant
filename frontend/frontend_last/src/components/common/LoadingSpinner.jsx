import React from "react";

export default function LoadingSpinner({ label = "Loading..." }) {
  return (
    <div className="loading-state">
      <span className="spinner" />
      <p>{label}</p>
    </div>
  );
}
