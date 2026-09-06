import React from "react";
import { Link } from "react-router-dom";
import { Bell, ShieldCheck } from "lucide-react";
import useIdentity from "../../hooks/useIdentity";
import { BRAND } from "../../config/brand";

const TITLES = {
  "/dashboard": "Dashboard",
  "/jobs": "Jobs",
  "/candidates": "Candidates",
  "/evaluations": "Evaluations",
  "/applications": "Applications",
  "/interviews": "Interviews",
  "/talent-pool": "Talent Pool",
  "/analytics": "Analytics",
  "/ai-activity": "AI Activity",
};

const short = (value) => (value ? value.slice(0, 8) : "—");

export default function Navbar({ pathname }) {
  const { identity } = useIdentity();

  const matchedTitle =
    Object.entries(TITLES).find(([path]) => pathname.startsWith(path))?.[1] || "Overview";

  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">{BRAND.eyebrow}</p>
        <h1>{matchedTitle}</h1>
      </div>

      <div className="top-actions">
        <button className="icon-btn" type="button" aria-label="Notifications">
          <Bell size={19} />
        </button>

        <Link to="/identity" className="dev-identity-chip" title="Edit Development Identity">
          <ShieldCheck size={16} />
          <div>
            <strong>Development Identity</strong>
            <span>
              User {short(identity.userId)} · Org {short(identity.organizationId)}
            </span>
          </div>
        </Link>
      </div>
    </header>
  );
}