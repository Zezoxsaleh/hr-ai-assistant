import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import useIdentity from "../../hooks/useIdentity";

// UI affordance only: redirects to the Development Identity page when no
// development identity is configured. Real authorization is not part of the
// current MVP and is handled entirely by the backend via header identity.
export default function ProtectedRoute({ children }) {
  const { hasIdentity } = useIdentity();
  const location = useLocation();

  if (!hasIdentity) {
    return <Navigate to="/identity" state={{ from: location }} replace />;
  }

  return children;
}