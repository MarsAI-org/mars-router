"use client";

import { useCallback, useEffect, useState } from "react";
import Card from "@/shared/components/Card";
import Button from "@/shared/components/Button";
import Input from "@/shared/components/Input";
import { LIMIT_PRESETS, TPM_SCALE } from "@/lib/limits/presets.js";

const PERIODS = [
  { value: 7, label: "7D" },
  { value: 30, label: "30D" },
  { value: 60, label: "60D" },
];

const LIMIT_PRESETS_LIST = Object.entries(LIMIT_PRESETS);

const LIMIT_FIELDS = [
  { key: "rpm", label: "RPM", type: "int" },
  { key: "tpm", label: "TPM", type: "int" },
  { key: "dailyRequests", label: "Req / day", type: "int" },
  { key: "dailyTokens", label: "Tokens / day", type: "int" },
  { key: "monthlyRequests", label: "Req / month", type: "int" },
  { key: "monthlyTokens", label: "Tokens / month", type: "int" },
  { key: "monthlyCost", label: "Cost / month ($)", type: "float" },
];

const emptyPlan = () => ({
  name: "",
  description: "",
  priceMonthly: 0,
  rank: 0,
  isActive: true,
  rpm: 0, tpm: 0, dailyRequests: 0, dailyTokens: 0,
  monthlyRequests: 0, monthlyTokens: 0, monthlyCost: 0,
});

function money(n) {
  return `$${(Number(n) || 0).toFixed(2)}`;
}

export default function BillingDashboard() {
  const [tab, setTab] = useState("overview");
  const [period, setPeriod] = useState(30);
  const [refreshKey, setRefreshKey] = useState(0);
  const [analytics, setAnalytics] = useState(null);
  const [plans, setPlans] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [keys, setKeys] = useState([]);
  const [abuse, setAbuse] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyPlan);
  const [editingId, setEditingId] = useState(null);
  const [assign, setAssign] = useState({ keyId: "", planId: "", status: "active" });

  const reload = useCallback(() => setRefreshKey((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const [a, p, s, k, ab] = await Promise.all([
          fetch(`/api/billing/analytics?days=${period}`).then((r) => r.json()),
          fetch("/api/plans").then((r) => r.json()),
          fetch("/api/subscriptions").then((r) => r.json()),
          fetch("/api/keys").then((r) => r.json()),
          fetch("/api/billing/abuse?limit=50").then((r) => r.json()),
        ]);
        if (cancelled) return;
        setAnalytics(a.error ? null : a);
        setPlans(p.plans || []);
        setSubscriptions(s.subscriptions || []);
        setKeys(k.keys || []);
        setAbuse(ab.events || []);
        setError(a.error || p.error ? (a.error || p.error) : "");
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load billing data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [period, refreshKey]);

  const savePlan = async () => {
    if (!form.name.trim()) { setError("Plan name is required"); return; }
    const url = editingId ? `/api/plans/${editingId}` : "/api/plans";
    const method = editingId ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error || "Failed to save plan"); return; }
    setForm(emptyPlan());
    setEditingId(null);
    reload();
  };

  const editPlan = (plan) => {
    setEditingId(plan.id);
    setForm({ ...emptyPlan(), ...plan });
  };

  const removePlan = async (id) => {
    const res = await fetch(`/api/plans/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) { setError(data.error || "Failed to delete plan"); return; }
    reload();
  };

  const assignPlan = async () => {
    if (!assign.keyId || !assign.planId) { setError("Select a key and a plan"); return; }
    const res = await fetch("/api/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(assign),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error || "Failed to assign plan"); return; }
    reload();
  };

  const setSubStatus = async (id, status) => {
    await fetch(`/api/subscriptions/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    reload();
  };

  const summary = analytics?.summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Billing &amp; Sales</h1>
          <p className="text-sm text-text-muted">Plans, subscriptions, usage and abuse for selling API access.</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border-subtle p-1">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-3 py-1 text-sm rounded-md ${period === p.value ? "bg-brand-500/15 text-brand-500" : "text-text-muted"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        {["overview", "plans", "subscriptions", "abuse"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-sm rounded-md capitalize ${tab === t ? "bg-brand-500/15 text-brand-500" : "text-text-muted hover:text-text-main"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-500">
          {error}
        </div>
      )}

      {loading ? (
        <Card><p className="text-text-muted text-sm">Loading…</p></Card>
      ) : (
        <>
          {tab === "overview" && summary && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {[
                  ["MRR", money(summary.mrr)],
                  ["Active subs", summary.activeSubscriptions],
                  ["API keys", summary.totalKeys],
                  ["Requests", summary.totalRequests],
                  ["Provider cost", money(summary.totalProviderCost)],
                  ["Gross margin", money(summary.grossMargin)],
                ].map(([label, value]) => (
                  <Card key={label} padding="sm">
                    <p className="text-xs text-text-muted">{label}</p>
                    <p className="text-lg font-semibold mt-1">{value}</p>
                  </Card>
                ))}
              </div>

              <Card title="Usage by API key" subtitle={`Last ${analytics.periodDays} days`}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-text-muted text-left">
                        <th className="py-2 pr-4">Key</th>
                        <th className="py-2 pr-4">Plan</th>
                        <th className="py-2 pr-4">Requests</th>
                        <th className="py-2 pr-4">Tokens</th>
                        <th className="py-2 pr-4">Provider cost</th>
                        <th className="py-2 pr-4">Margin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.rows.map((r) => (
                        <tr key={r.keyId} className="border-t border-border-subtle">
                          <td className="py-2 pr-4">{r.keyName}</td>
                          <td className="py-2 pr-4">{r.planName}</td>
                          <td className="py-2 pr-4">{r.requests}</td>
                          <td className="py-2 pr-4">{r.tokens.toLocaleString()}</td>
                          <td className="py-2 pr-4">{money(r.providerCost)}</td>
                          <td className={`py-2 pr-4 ${r.margin < 0 ? "text-red-500" : "text-green-500"}`}>{money(r.margin)}</td>
                        </tr>
                      ))}
                      {analytics.rows.length === 0 && (
                        <tr><td colSpan={6} className="py-4 text-text-muted">No API keys yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}

          {tab === "plans" && (
            <>
              <Card title={editingId ? "Edit plan" : "Create plan"}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Pro" />
                  <Input label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="For power users" />
                  <Input label="Price / month ($)" type="number" value={form.priceMonthly} onChange={(e) => setForm({ ...form, priceMonthly: e.target.value })} />
                  <Input label="Rank (display order)" type="number" value={form.rank} onChange={(e) => setForm({ ...form, rank: e.target.value })} />
                  <label className="flex items-center gap-2 text-sm mt-6">
                    <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                    Active
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-3 text-sm">
                  <span className="text-text-muted">Preset:</span>
                  <select
                    className="bg-surface border border-border-subtle rounded-md px-3 py-1.5 text-sm"
                    value=""
                    onChange={(e) => {
                      const p = LIMIT_PRESETS[e.target.value];
                      if (p) setForm((f) => ({ ...f, ...p.values }));
                    }}
                  >
                    <option value="">Apply a preset…</option>
                    {LIMIT_PRESETS_LIST.map(([key, p]) => <option key={key} value={key}>{p.label} — {p.description}</option>)}
                  </select>
                  <Button
                    variant="outline"
                    onClick={() => setForm((f) => ({ ...f, tpm: TPM_SCALE.xlarge, dailyTokens: f.dailyTokens || 0, monthlyTokens: f.monthlyTokens || 0 }))}
                  >
                    Use large TPM ({TPM_SCALE.xlarge.toLocaleString()}/min)
                  </Button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                  {LIMIT_FIELDS.map((f) => (
                    <Input
                      key={f.key}
                      label={f.label}
                      type="number"
                      value={form[f.key]}
                      onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    />
                  ))}
                </div>
                <p className="text-xs text-text-muted mt-2">
                  0 = unlimited for every field. TPM is tokens per minute — keep it large (≥ 1M) for coding, since a
                  single request can use tens of thousands of tokens.
                </p>
                <div className="flex gap-2 mt-4">
                  <Button onClick={savePlan}>{editingId ? "Save" : "Create"}</Button>
                  {editingId && <Button variant="outline" onClick={() => { setEditingId(null); setForm(emptyPlan()); }}>Cancel</Button>}
                </div>
              </Card>

              <Card title="Plans">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-text-muted text-left">
                        <th className="py-2 pr-4">Name</th>
                        <th className="py-2 pr-4">Price</th>
                        <th className="py-2 pr-4">RPM</th>
                        <th className="py-2 pr-4">Tokens/mo</th>
                        <th className="py-2 pr-4">Cost/mo</th>
                        <th className="py-2 pr-4">Subs</th>
                        <th className="py-2 pr-4">Active</th>
                        <th className="py-2 pr-4"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {plans.map((p) => {
                        const subCount = (analytics?.plans || []).find((x) => x.id === p.id)?.subscribers || 0;
                        return (
                          <tr key={p.id} className="border-t border-border-subtle">
                            <td className="py-2 pr-4">{p.name}</td>
                            <td className="py-2 pr-4">{money(p.priceMonthly)}</td>
                            <td className="py-2 pr-4">{p.rpm || "∞"}</td>
                            <td className="py-2 pr-4">{p.monthlyTokens ? p.monthlyTokens.toLocaleString() : "∞"}</td>
                            <td className="py-2 pr-4">{p.monthlyCost ? money(p.monthlyCost) : "∞"}</td>
                            <td className="py-2 pr-4">{subCount}</td>
                            <td className="py-2 pr-4">{p.isActive ? "yes" : "no"}</td>
                            <td className="py-2 pr-4 text-right">
                              <button className="text-brand-500 mr-3" onClick={() => editPlan(p)}>Edit</button>
                              <button className="text-red-500" onClick={() => removePlan(p.id)}>Delete</button>
                            </td>
                          </tr>
                        );
                      })}
                      {plans.length === 0 && (
                        <tr><td colSpan={8} className="py-4 text-text-muted">No plans yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}

          {tab === "subscriptions" && (
            <>
              <Card title="Assign plan to a key">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                  <label className="text-sm">
                    <span className="block mb-1 text-text-muted">API key</span>
                    <select className="w-full bg-surface border border-border-subtle rounded-md px-3 py-2" value={assign.keyId} onChange={(e) => setAssign({ ...assign, keyId: e.target.value })}>
                      <option value="">Select key…</option>
                      {keys.map((k) => <option key={k.id} value={k.id}>{k.name || k.id.slice(0, 8)}</option>)}
                    </select>
                  </label>
                  <label className="text-sm">
                    <span className="block mb-1 text-text-muted">Plan</span>
                    <select className="w-full bg-surface border border-border-subtle rounded-md px-3 py-2" value={assign.planId} onChange={(e) => setAssign({ ...assign, planId: e.target.value })}>
                      <option value="">Select plan…</option>
                      {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </label>
                  <label className="text-sm">
                    <span className="block mb-1 text-text-muted">Status</span>
                    <select className="w-full bg-surface border border-border-subtle rounded-md px-3 py-2" value={assign.status} onChange={(e) => setAssign({ ...assign, status: e.target.value })}>
                      <option value="active">active</option>
                      <option value="suspended">suspended</option>
                      <option value="canceled">canceled</option>
                    </select>
                  </label>
                  <Button onClick={assignPlan}>Assign</Button>
                </div>
              </Card>

              <Card title="Subscriptions">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-text-muted text-left">
                        <th className="py-2 pr-4">Key</th>
                        <th className="py-2 pr-4">Plan</th>
                        <th className="py-2 pr-4">Status</th>
                        <th className="py-2 pr-4">Since</th>
                        <th className="py-2 pr-4"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {subscriptions.map((s) => (
                        <tr key={s.id} className="border-t border-border-subtle">
                          <td className="py-2 pr-4">{s.keyName}</td>
                          <td className="py-2 pr-4">{s.planName}</td>
                          <td className="py-2 pr-4">{s.status}</td>
                          <td className="py-2 pr-4">{new Date(s.startedAt).toLocaleDateString()}</td>
                          <td className="py-2 pr-4 text-right space-x-3">
                            {s.status !== "active" && <button className="text-green-500" onClick={() => setSubStatus(s.id, "active")}>Activate</button>}
                            {s.status !== "suspended" && <button className="text-amber-500" onClick={() => setSubStatus(s.id, "suspended")}>Suspend</button>}
                          </td>
                        </tr>
                      ))}
                      {subscriptions.length === 0 && (
                        <tr><td colSpan={5} className="py-4 text-text-muted">No subscriptions yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}

          {tab === "abuse" && (
            <Card title="Anti-abuse events" subtitle="Most recent 50">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-text-muted text-left">
                      <th className="py-2 pr-4">Time</th>
                      <th className="py-2 pr-4">Kind</th>
                      <th className="py-2 pr-4">Severity</th>
                      <th className="py-2 pr-4">Key</th>
                      <th className="py-2 pr-4">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {abuse.map((e) => (
                      <tr key={e.id} className="border-t border-border-subtle">
                        <td className="py-2 pr-4 whitespace-nowrap">{new Date(e.createdAt).toLocaleString()}</td>
                        <td className="py-2 pr-4">{e.kind}</td>
                        <td className={`py-2 pr-4 ${e.severity === "critical" ? "text-red-500" : e.severity === "warn" ? "text-amber-500" : "text-text-muted"}`}>{e.severity}</td>
                        <td className="py-2 pr-4">{e.keyId ? e.keyId.slice(0, 8) : "—"}</td>
                        <td className="py-2 pr-4">{e.detail}</td>
                      </tr>
                    ))}
                    {abuse.length === 0 && (
                      <tr><td colSpan={5} className="py-4 text-text-muted">No abuse events recorded.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
