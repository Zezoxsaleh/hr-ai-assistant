import React, { useEffect, useState } from "react";
import {
  Users,
  BriefcaseBusiness,
  ClipboardList,
  Star,
  UserCheck,
} from "lucide-react";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Funnel,
  FunnelChart,
  LabelList,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import StatCard from "../../components/dashboard/StatCard";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import ErrorState from "../../components/common/ErrorState";
import {
  getDashboardStats,
  getApplicationsByJob,
  getCandidateStatusBreakdown,
  getHiringFunnel,
} from "../../services/dashboardService";

// Applied, Screening, Shortlisted, Interview, Rejected, Hired
const PIE_COLORS = ["#f5a524", "#175cd3", "#22c7a9", "#6d5ce7", "#f04438", "#c11574"];
const FUNNEL_COLORS = ["#6d5ce7", "#5b6ee1", "#3fa9db", "#22c7a9", "#12b76a"];

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [applicationsByJob, setApplicationsByJob] = useState([]);
  const [candidateStatus, setCandidateStatus] = useState([]);
  const [hiringFunnel, setHiringFunnel] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = () => {
    let active = true;
    setLoading(true);
    setError(false);
    (async () => {
      try {
        const [s, abj, cs, hf] = await Promise.all([
          getDashboardStats(),
          getApplicationsByJob(),
          getCandidateStatusBreakdown(),
          getHiringFunnel(),
        ]);
        if (!active) return;
        setStats(s);
        setApplicationsByJob(abj);
        setCandidateStatus(cs);
        setHiringFunnel(hf);
        setLoading(false);
      } catch {
        if (!active) return;
        setError(true);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  };

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <LoadingSpinner label="Loading dashboard..." />;
  if (error) return <ErrorState message="Unable to load the dashboard. Please try again." onRetry={load} />;

  return (
    <div className="dashboard">
      <div className="stats-grid">
        <StatCard icon={Users} label="Total Candidates" value={stats.totalCandidates} tone="violet" />
        <StatCard icon={BriefcaseBusiness} label="Active Jobs" value={stats.activeJobs} tone="blue" />
        <StatCard icon={ClipboardList} label="Applications" value={stats.applications} tone="amber" />
        <StatCard icon={Star} label="Shortlisted" value={stats.shortlisted} tone="pink" />
        <StatCard icon={UserCheck} label="Hired" value={stats.hired} tone="green" />
      </div>

      <div className="charts-grid">
        <div className="panel chart-panel">
          <h3>Applications by Job</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={applicationsByJob}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef0f4" />
              <XAxis dataKey="job" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="applications" fill="#6d5ce7" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="panel chart-panel">
          <h3>Candidate Status</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={candidateStatus}
                dataKey="value"
                nameKey="name"
                innerRadius={55}
                outerRadius={90}
                paddingAngle={3}
              >
                {candidateStatus.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Legend verticalAlign="bottom" height={30} />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="panel chart-panel">
          <h3>Hiring Funnel</h3>
          <ResponsiveContainer width="100%" height={260}>
            <FunnelChart>
              <Tooltip />
              <Funnel dataKey="count" data={hiringFunnel} isAnimationActive>
                {hiringFunnel.map((_, i) => (
                  <Cell key={i} fill={FUNNEL_COLORS[i % FUNNEL_COLORS.length]} />
                ))}
                <LabelList position="right" dataKey="stage" fill="#475467" stroke="none" fontSize={12} />
                <LabelList position="center" dataKey="count" fill="#fff" stroke="none" fontSize={13} />
              </Funnel>
            </FunnelChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
