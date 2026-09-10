import { useContext } from "react";
import { IdentityContext } from "../context/IdentityContext";

export default function useIdentity() {
  const ctx = useContext(IdentityContext);
  if (!ctx) throw new Error("useIdentity must be used inside an <IdentityProvider>");
  return ctx;
}