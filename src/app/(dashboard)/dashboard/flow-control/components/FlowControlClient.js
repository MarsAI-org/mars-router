"use client";

import { useCallback, useEffect, useState } from "react";
import Card from "@/shared/components/Card";
import Button from "@/shared/components/Button";

const emptyProvider = () => ({ enabled: true, maxConcurrent: 0, rpm: 0, queueTimeoutMs: 30000, maxQueue: 200 });

export default function FlowControlClient() {
  const [providers, setProviders] = useState({});
  const [live, setLive] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [newProvider, setNewProvider] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/flow-control").then((r) => r.json());
    if (res.error) throw new Error(res.error);
    const cfg = {};
    const lv = {};
    for (const [p, v] of Object.entries(res.providers || {})) {
      cfg[p] = v.config;
      lv[p] = v.live;
    }
    return { cfg, lv };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const { cfg, lv } = await load();
        if (!cancelled) { setProviders(cfg); setLive(lv); setError(""); }
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    const timer = setInterval(async () => {
      try {
        const res = await fetch("/api/flow-control").then((r) => r.json());
        if (!cancelled && !res.error) {
          const lv = {};
          for (const [p, v] of Object.entries(res.providers || {})) lv[p] = v.live;
          setLive(lv);
        }
      } catch { /* ignore */ }
    }, 5000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [load]);

  const update = (provider, patch) => {
    setProviders((prev) => ({ ...prev, [provider]: { ...prev[provider], ...patch } }));
    setSaved(false);
  };

  const addProvider = () => {
    const p = newProvider.trim();
    if (!p || providers[p]) return;
    setProviders((prev) => ({ ...prev, [p]: emptyProvider() }));
    setNewProvider("");
    setSaved(false);
  };

  const removeProvider = (p) => {
    setProviders((prev) => {
      const next = { ...prev };
      delete next[p];
      return next;
    });
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const res = await fetch("/api/flow-control", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upstreamLimits: providers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setSaved(true);
      const { cfg, lv } = await load();
      setProviders(cfg);
      setLive(lv);
    } catch (e) {
      setError(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Upstream Flow Control</h1>
          <p className="text-sm text-text-muted">
            Enforce the upstream&apos;s own limits (max concurrent + RPM) globally per provider so total outbound
            traffic never exceeds what they allow. Excess requests <b>queue</b> instead of failing.
          </p>
        </div>
        <Button onClick={save} loading={saving}>Save</Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-500">{error}</div>
      )}
      {saved && !error && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm text-green-500">Saved.</div>
      )}

      <Card padding="sm">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="bg-surface border border-border-subtle rounded-md px-3 py-1.5 text-sm"
            placeholder="provider id (e.g. openai, glm, claude)"
            value={newProvider}
            onChange={(e) => setNewProvider(e.target.value)}
          />
          <Button variant="outline" onClick={addProvider}>Add provider</Button>
          <span className="text-xs text-text-muted ml-auto">0 = unlimited. Requests wait in the queue up to the timeout.</span>
        </div>
      </Card>

      {loading ? (
        <Card><p className="text-sm text-text-muted">Loading…</p></Card>
      ) : Object.keys(providers).length === 0 ? (
        <Card><p className="text-sm text-text-muted">No providers configured. Add one to start enforcing upstream limits.</p></Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(providers).map(([provider, cfg]) => {
            const l = live[provider] || {};
            return (
              <Card key={provider}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm">{provider}</span>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={!!cfg.enabled} onChange={(e) => update(provider, { enabled: e.target.checked })} />
                      Enabled
                    </label>
                  </div>
                  <button className="text-xs text-red-500" onClick={() => removeProvider(provider)}>Remove</button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                  <Field label="Max concurrent" value={cfg.maxConcurrent} onChange={(v) => update(provider, { maxConcurrent: v })} />
                  <Field label="RPM" value={cfg.rpm} onChange={(v) => update(provider, { rpm: v })} />
                  <Field label="Queue timeout (ms)" value={cfg.queueTimeoutMs} onChange={(v) => update(provider, { queueTimeoutMs: v })} />
                  <Field label="Max queue" value={cfg.maxQueue} onChange={(v) => update(provider, { maxQueue: v })} />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-sm">
                  <Stat label="In flight" value={l.active ?? 0} />
                  <Stat label="Queued" value={l.queued ?? 0} />
                  <Stat label="RPM used" value={l.rpmUsed ?? 0} />
                  <Stat label="RPM remaining" value={l.rpmRemaining == null ? "∞" : l.rpmRemaining} />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange }) {
  return (
    <label className="text-sm">
      <span className="block mb-1 text-text-muted">{label}</span>
      <input
        type="number"
        className="w-full bg-surface border border-border-subtle rounded-md px-3 py-2"
        value={value ?? 0}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <p className="text-xs text-text-muted">{label}</p>
      <p className="text-base font-semibold">{value}</p>
    </div>
  );
}
