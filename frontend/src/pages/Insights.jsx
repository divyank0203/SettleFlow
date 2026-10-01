import React, { useEffect, useState } from "react";
import { api } from "../api";

export default function Insights() {
  const [groups, setGroups] = useState([]);
  const [groupId, setGroupId] = useState("");
  const [stats, setStats] = useState(null);
const [summary, setSummary] = useState("");
const [loading, setLoading] = useState(false);
const [type, setType] = useState("monthly");

  useEffect(() => {
    async function load() {
      try {
        const g = await api("/api/groups");
        setGroups(g);
      } catch (err) {
        console.error(err);
      }
    }
    load();
  }, []);

  async function loadInsights() {
    if (!groupId) return;
    setLoading(true);
    try {
      const endpoint =
  type === "monthly"
    ? `/api/ai/monthly-insights/${groupId}`
    : `/api/ai/group-insights/${groupId}`;

const data = await api(endpoint);
      setStats(data.stats);
      setSummary(data.summary);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
<h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
  {type === "monthly"
    ? "Monthly Insights"
    : "Group Insights"}
</h2>

      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
  <select
  value={type}
  onChange={(e) => {
    setType(e.target.value);
    setStats(null);
    setSummary("");
  }}
  className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
>
  <option value="monthly">
    This Month
  </option>

  <option value="group">
    Entire Group
  </option>
</select>
          <select
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className="w-full sm:w-64 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
          >
            <option value="">Select group</option>
            {groups.map((g) => (
              <option key={g._id} value={g._id}>
                {g.name}
              </option>
            ))}
          </select>
          <button
            onClick={loadInsights}
            disabled={loading || !groupId}
            className="px-4 py-2 rounded-md bg-slate-900 text-slate-50 text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-60 hover:cursor-pointer"
          >
            {loading ? "Loading..." : "Get insights"}
          </button>
        </div>

        {stats && (
          <div className="grid gap-4 md:grid-cols-2 mt-2">
            <div className="space-y-2 text-sm">
              <h3 className="font-medium text-slate-800 dark:text-slate-100">
                Numbers
              </h3>
              <p className="text-slate-700 dark:text-slate-300">
                Total spent:{" "}
                <span className="font-semibold">₹{stats.total}</span>
              </p>
              <p className="text-slate-700 dark:text-slate-300">
                Transactions:{" "}
                <span className="font-semibold">{stats.count}</span>
              </p>
              <div>
                <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                  By category
                </h4>
                {Object.keys(stats.byCategory).length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    No category data yet.
                  </p>
                ) : (
                  <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                    {Object.entries(stats.byCategory).map(([cat, val]) => (
                      <li key={cat}>
                        {cat}: ₹{val}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {summary && (
              <div className="text-sm">
                <h3 className="font-medium text-slate-800 dark:text-slate-100 mb-1">
                  Summary
                </h3>
                <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                  {summary}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
