import React from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  BriefcaseBusiness,
  Users,
  BadgeCheck,
  ClipboardList,
  Star,
  BarChart3,
  Settings,
  ListOrdered,
  CalendarClock,
} from "lucide-react";
import BrandIcon from "../common/BrandIcon";
import { BRAND } from "../../config/brand";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/jobs", label: "Jobs", icon: BriefcaseBusiness },
  { to: "/candidates", label: "Candidates", icon: Users },
  { to: "/evaluations", label: "Evaluations", icon: BadgeCheck },
  { to: "/matching-results", label: "Matching Results", icon: ListOrdered },
  { to: "/applications", label: "Applications", icon: ClipboardList },
  { to: "/interviews", label: "Interviews", icon: CalendarClock },
  { to: "/talent-pool", label: "Talent Pool", icon: Star },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
];

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-icon">
          <BrandIcon size={20} />
        </div>
        <div>
          <strong>{BRAND.name}</strong>
          <span>{BRAND.tagline}</span>
        </div>
      </div>

      <nav>
        {NAV_ITEMS.map(({ to, label, icon: Icon, badge }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
          >
            <Icon size={19} />
            <span>{label}</span>
            {badge ? <span className="nav-badge">{badge}</span> : null}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <NavLink
          to="/settings"
          className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
        >
          <Settings size={19} />
          <span>Settings</span>
        </NavLink>
        <div className="powered">{BRAND.powered}</div>
      </div>
    </aside>
  );
}
