import React, { useEffect, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import ErrorState from "../../components/common/ErrorState";
import {
  getAnalyticsMetrics,
  getAnalyticsFunnel,
  getCandidateSources,
} from "../../services/analyticsService";

const FUNNEL_COLORS = ["#667085", "#3B82F6", "#F59E0B", "#7C3AED", "#06B6D4", "#F97316", "#12B76A"];

export default function AnalyticsPage() {
  const [metrics, setMetrics] = useState([]);
  const [funnel, setFunnel] = useState([]);
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = () => {
    setLoading(true);
    setError(false);
    Promise.all([getAnalyticsMetrics(), getAnalyticsFunnel(), getCandidateSources()])
      .then(([m, f, s]) => {
        setMetrics(m);
        setFunnel(f);
        setSources(s);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  };

  useEffect(load, []);

  if (loading) return <LoadingSpinner label="Loading analytics..." />;
  if (error) return <ErrorState message="Unable to load analytics. Please try again." onRetry={load} />;

  const maxCount = funnel[0]?.count || 1;
  const totalSources = sources.reduce((sum, s) => sum + s.count, 0);

  return (
    <section>
      <div className="section-head">
        <div>
          <p className="eyebrow">ANALYTICS</p>
          <h3>Operational hiring metrics · Last 30 days</h3>
        </div>
      </div>

      <div className="stats-grid">
        {metrics.map((m) => (
          <div className="stat-card metric-card" key={m.key}>
            <div className="stat-info">
              <span>{m.label}</span>
              <strong>{m.value}</strong>
              <div className={`metric-delta metric-delta-${m.trend === "down" ? "good" : "bad"}`}>
                {m.trend === "down" ? <ArrowDown size={13} /> : <ArrowUp size={13} />}
                {m.deltaLabel}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="content-grid">
        <div className="panel">
          <h3>Hiring Funnel</h3>
          <div className="funnel-bars">
            {funnel.map((f, i) => (
              <div className="funnel-row" key={f.stage}>
                <span className="funnel-label">{f.stage}</span>
                <div className="funnel-track">
                  <div
                    className="funnel-fill"
                    style={{
                      width: `${(f.count / maxCount) * 100}%`,
                      background: FUNNEL_COLORS[i % FUNNEL_COLORS.length],
                    }}
                  >
                    <span>{f.count}</span>
                  </div>
                </div>
                <span className="funnel-percent">{((f.count / maxCount) * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <h3>Candidate Sources</h3>
          <div className="donut-wrap">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={sources} dataKey="count" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={2}>
                  {sources.map((s, i) => (
                    <Cell key={i} fill={s.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="donut-center-label">
              <strong>{totalSources}</strong>
              <span>total</span>
            </div>
          </div>
          <div className="source-legend">
            {sources.map((s) => (
              <div className="source-legend-row" key={s.name}>
                <span className="dot" style={{ background: s.color }} />
                <span className="source-name">{s.name}</span>
                <span className="source-count">{s.count}</span>
                <span className="source-percent">{s.percent}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
