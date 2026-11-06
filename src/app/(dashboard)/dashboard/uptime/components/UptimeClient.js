"use client";

import { useCallback, useEffect, useState } from "react";
import Card from "@/shared/components/Card";
import Button from "@/shared/components/Button";

const PERIODS = [1, 7, 30, 90];

function pct(v) {
  return v == null ? "—" : `${v}%`;
}
function ms(v) {
  return v == null ? "—" : `${v} ms`;
}
function health (u) {
  if (u == null) return { label: "unknown", cls: "text-text-muted" };
  if (u >= 99) return { label: "healthy", cls: "text-green-500" };
  if (u >= 90) return { label: "degraded", cls: "text-amber-500" };
  return { label: "down", cls: "text-red-500" };
}

export default function UptimeClient() {
  const [days, setDays] = useState(7);
  const [refreshKey, setRefreshKey] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const reload = useCallback(() => setRefreshKey((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/uptime?days=${days}`).then((r) => r.json());
        if (cancelled) return;
        if (res.error) setError(res.error);
        else { setData(res); setError(""); }
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load uptime");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [days, refreshKey]);

  const runAll = async () => {
    setRunning(true);
    setError("");
    try {
      const res = await fetch("/api/uptime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "all" }),
      });
      const out = await res.json();
      if (!res.ok || out.error) throw new Error(out.error || "Run failed");
      reload();
    } catch (e) {
      setError(e.message || "Run failed");
    } finally {
      setRunning(false);
    }
  };

  const testOne = async (targetId) => {
    setError("");
    try {
      const isCombo = targetId.includes(" → ");
      const body = isCombo
        ? { target: "combo", id: targetId.split(" → ")[0] }
        : { target: "model", id: targetId };
      const res = await fetch("/api/uptime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const out = await res.json();
      if (!res.ok || out.error) throw new Error(out.error || "Test failed");
      reload();
    } catch (e) {
      setError(e.message || "Test failed");
    }
  };

  const openDetail = async (targetId) => {
    setDetailLoading(true);
    setDetail({ targetId });
    try {
      const res = await fetch(`/api/uptime/${encodeURIComponent(targetId)}?days=${days}`).then((r) => r.json());
      setDetail({ targetId, ...res });
    } catch {
      setDetail({ targetId, error: "Failed to load detail" });
    } finally {
      setDetailLoading(false);
    }
  };

  const clearAll = async () => {
    await fetch("/api/uptime", { method: "DELETE" });
    reload();
  };

  const overall = data?.overall;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Uptime &amp; Health</h1>
          <p className="text-sm text-text-muted">
            Probe every published model and combo, then track availability and latency over time.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-border-subtle p-1">
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => setDays(p)}
                className={`px-3 py-1 text-sm rounded-md ${days === p ? "bg-brand-500/15 text-brand-500" : "text-text-muted"}`}
              >
                {p}D
              </button>
            ))}
          </div>
          <Button onClick={runAll} loading={running}>Run all tests</Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-500">{error}</div>
      )}

      {overall && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            ["Checks", overall.total],
            ["Uptime", pct(overall.uptimePct)],
            ["Avg latency", ms(overall.latency.avg)],
            ["p95 latency", ms(overall.latency.p95)],
            ["Last check", overall.lastCheck ? new Date(overall.lastCheck).toLocaleString() : "—"],
          ].map(([label, value]) => (
            <Card key={label} padding="sm">
              <p className="text-xs text-text-muted">{label}</p>
              <p className="text-lg font-semibold mt-1">{value}</p>
            </Card>
          ))}
        </div>
      )}

      <Card
        title="Targets"
        subtitle="Worst available first"
        action={<button className="text-xs text-text-muted hover:text-red-500" onClick={clearAll}>Clear history</button>}
      >
        {loading ? (
          <p className="text-sm text-text-muted">Loading…</p>
        ) : !data?.targets?.length ? (
          <p className="text-sm text-text-muted">
            No probes yet. Click <b>Run all tests</b> to probe every model and combo.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-text-muted text-left">
                  <th className="py-2 pr-4">Target</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Health</th>
                  <th className="py-2 pr-4">Uptime</th>
                  <th className="py-2 pr-4">Avg</th>
                  <th className="py-2 pr-4">p95</th>
                  <th className="py-2 pr-4">Checks</th>
                  <th className="py-2 pr-4">Last</th>
                  <th className="py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {data.targets.map((t) => {
                  const h = health(t.summary.uptimePct);
                  return (
                    <tr key={`${t.target}::${t.targetId}`} className="border-t border-border-subtle">
                      <td className="py-2 pr-4 font-mono text-xs">{t.targetId}</td>
                      <td className="py-2 pr-4 text-text-muted">{t.target}</td>
                      <td className={`py-2 pr-4 ${h.cls}`}>{h.label}</td>
                      <td className="py-2 pr-4">{pct(t.summary.uptimePct)}</td>
                      <td className="py-2 pr-4">{ms(t.summary.latency.avg)}</td>
                      <td className="py-2 pr-4">{ms(t.summary.latency.p95)}</td>
                      <td className="py-2 pr-4">{t.summary.total}</td>
                      <td className="py-2 pr-4 whitespace-nowrap">{t.summary.lastCheck ? new Date(t.summary.lastCheck).toLocaleTimeString() : "—"}</td>
                      <td className="py-2 pr-4 text-right space-x-3">
                        <button className="text-brand-500" onClick={() => testOne(t.targetId)}>Test</button>
                        <button className="text-text-muted hover:text-text-main" onClick={() => openDetail(t.targetId)}>Detail</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {detail && (
        <Card
          title={`Detail · ${detail.targetId}`}
          action={<button className="text-xs text-text-muted" onClick={() => setDetail(null)}>Close</button>}
        >
          {detailLoading ? (
            <p className="text-sm text-text-muted">Loading…</p>
          ) : detail.error ? (
            <p className="text-sm text-red-500">{detail.error}</p>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  ["Uptime", pct(detail.summary?.uptimePct)],
                  ["Avg", ms(detail.summary?.latency?.avg)],
                  ["p50", ms(detail.summary?.latency?.p50)],
                  ["p95", ms(detail.summary?.latency?.p95)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs text-text-muted">{label}</p>
                    <p className="text-base font-semibold">{value}</p>
                  </div>
                ))}
              </div>

              <div className="flex items-end gap-1 h-16 mt-4">
                {(detail.sparkline || []).map((b) => {
                  const h = b.uptimePct == null ? 6 : Math.max(6, Math.round((b.uptimePct / 100) * 64));
                  const color = b.uptimePct == null ? "bg-border-subtle" : b.uptimePct >= 99 ? "bg-green-500/70" : b.uptimePct >= 90 ? "bg-amber-500/70" : "bg-red-500/70";
                  return (
                    <div
                      key={b.dateKey}
                      className={`flex-1 rounded-sm ${color}`}
                      style={{ height: `${h}px` }}
                      title={`${b.dateKey}: ${pct(b.uptimePct)} · ${b.checks} checks`}
                    />
                  );
                })}
              </div>
              {detail.summary?.lastError && (
                <p className="text-xs text-red-500 mt-2">Last error: {detail.summary.lastError}</p>
              )}
            </>
          )}
        </Card>
      )}
    </div>
  );
}
