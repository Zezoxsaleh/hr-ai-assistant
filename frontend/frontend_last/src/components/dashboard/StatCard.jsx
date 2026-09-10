import React from "react";

export default function StatCard({ icon: Icon, label, value, tone = "violet" }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon tone-${tone}`}>
        <Icon size={20} />
      </div>
      <div className="stat-info">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}
