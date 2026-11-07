"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Card from "@/shared/components/Card";
import Button from "@/shared/components/Button";
import Toggle from "@/shared/components/Toggle";
import PresetChips from "@/shared/components/PresetChips";
import { FLOW_PRESETS } from "@/lib/limits/presets.js";
import { formatNumber, parseCount } from "@/lib/limits/format.js";

const FIELDS = [
  { key: "maxConcurrent", label: "Max concurrent requests", hint: "how many run at once against the upstream", unit: "requests" },
  { key: "rpm", label: "Requests / minute", hint: "rolling one-minute cap", unit: "req/min" },
  { key: "queueTimeoutMs", label: "Queue wait timeout", hint: "give up (429) after waiting this long", unit: "ms" },
  { key: "maxQueue", label: "Max queue length", hint: "how many may wait to start", unit: "requests" },
];

const emptyProvider = () => ({ enabled: true, maxConcurrent: 5, rpm: 120, queueTimeoutMs: 30000, maxQueue: 500 });
const PRESET_LIST = Object.entries(FLOW_PRESETS);

export default function FlowControlClient() {
  const [providers, setProviders] = useState({});
  const [live, setLive] = useState({});
  const [connected, setConnected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [pickProvider, setPickProvider] = useState("");
  const [customId, setCustomId] = useState("");
  const [bulkPreset, setBulkPreset] = useState("balanced");

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
        const [{ cfg, lv }, provRes] = await Promise.all([
          load(),
          fetch("/api/providers").then((r) => r.json()).catch(() => ({})),
        ]);
        if (cancelled) return;
        setProviders(cfg);
        setLive(lv);
        const ids = new Set();
        const conns = Array.isArray(provRes?.connections) ? provRes.connections : [];
        for (const c of conns) if (c?.provider) ids.add(c.provider);
        setConnected([...ids].sort());
        setError("");
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

  const markDirty = () => { setSaved(false); setDirty(true); };

  const update = (provider, patch) => {
    setProviders((prev) => ({ ...prev, [provider]: { ...prev[provider], ...patch } }));
    markDirty();
  };

  const applyPreset = (provider, key) => {
    const preset = FLOW_PRESETS[key];
    if (preset) update(provider, preset.values);
  };

  const addProvider = (id) => {
    const name = String(id || "").trim();
    if (!name || providers[name]) return;
    setProviders((prev) => ({ ...prev, [name]: emptyProvider() }));
    setExpanded((prev) => ({ ...prev, [name]: true }));
    setPickProvider("");
    setCustomId("");
    markDirty();
  };

  const removeProvider = (p) => {
    setProviders((prev) => {
      const next = { ...prev };
      delete next[p];
      return next;
    });
    markDirty();
  };

  const applyPresetToAll = () => {
    const preset = FLOW_PRESETS[bulkPreset];
    if (!preset) return;
    setProviders((prev) => Object.fromEntries(Object.entries(prev).map(([p, c]) => [p, { ...c, ...preset.values }])));
    markDirty();
  };

  const setAllEnabled = (enabled) => {
    setProviders((prev) => Object.fromEntries(Object.entries(prev).map(([p, c]) => [p, { ...c, enabled }])));
    markDirty();
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const upstreamLimits = {};
      for (const [p, c] of Object.entries(providers)) {
        upstreamLimits[p] = {
          enabled: c.enabled === true,
          maxConcurrent: parseCount(c.maxConcurrent),
          rpm: parseCount(c.rpm),
          queueTimeoutMs: parseCount(c.queueTimeoutMs),
          maxQueue: parseCount(c.maxQueue),
        };
      }
      const res = await fetch("/api/flow-control", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upstreamLimits }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setSaved(true);
      setDirty(false);
      const { cfg, lv } = await load();
      setProviders(cfg);
      setLive(lv);
    } catch (e) {
      setError(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const unconfigured = useMemo(() => connected.filter((p) => !providers[p]), [connected, providers]);
  const count = Object.keys(providers).length;

  return (
    <div className="space-y-6 pb-24">
      <div>
        <h1 className="text-xl font-semibold">Upstream Flow Control</h1>
        <p className="text-sm text-text-muted">
          Respect your upstream&apos;s own limits. You set the max concurrent requests and requests-per-minute; anything
          over the limit <b>waits in a queue</b> instead of failing. A request that waits too long gets a 429.
        </p>
      </div>

      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-500">{error}</div>}

      <Card title="1. Add a provider" subtitle="Providers you have connected are listed automatically.">
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="bg-surface border border-border-subtle rounded-md px-3 py-2 text-sm min-w-[220px]"
            value={pickProvider}
            onChange={(e) => { setPickProvider(e.target.value); if (e.target.value) addProvider(e.target.value); }}
          >
            <option value="">{unconfigured.length ? "Choose a connected provider…" : "No unconfigured providers"}</option>
            {unconfigured.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <span className="text-xs text-text-muted">or</span>
          <input
            className="bg-surface border border-border-subtle rounded-md px-3 py-2 text-sm"
            placeholder="type a provider id (advanced)"
            value={customId}
            onChange={(e) => setCustomId(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addProvider(customId); }}
          />
          <Button variant="outline" onClick={() => addProvider(customId)} disabled={!customId.trim()}>Add</Button>
        </div>
      </Card>

      {count > 0 && (
        <Card title="2. Quick set (optional)" subtitle="Apply a preset to every configured provider at once.">
          <div className="flex flex-wrap items-center gap-3">
            <PresetChips presets={FLOW_PRESETS} activeValues={null} onPick={setBulkPreset} />
            <Button variant="outline" onClick={applyPresetToAll}>Apply “{FLOW_PRESETS[bulkPreset]?.label}” to all</Button>
            <Button variant="outline" onClick={() => setAllEnabled(true)}>Enable all</Button>
            <Button variant="outline" onClick={() => setAllEnabled(false)}>Disable all</Button>
          </div>
        </Card>
      )}

      {loading ? (
        <Card><p className="text-sm text-text-muted">Loading…</p></Card>
      ) : count === 0 ? (
        <Card><p className="text-sm text-text-muted">No providers configured yet. Add one above.</p></Card>
      ) : (
        <div className="space-y-3">
          {Object.entries(providers).map(([provider, cfg]) => {
            const l = live[provider] || {};
            const open = !!expanded[provider];
            return (
              <Card key={provider} padding="sm">
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setExpanded((prev) => ({ ...prev, [provider]: !open }))}
                    className="flex items-center gap-2 text-left flex-1 min-w-0"
                  >
                    <span className="material-symbols-outlined text-text-muted text-[20px]">
                      {open ? "expand_more" : "chevron_right"}
                    </span>
                    <span className="font-mono text-sm truncate">{provider}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.enabled ? "bg-green-500/15 text-green-500" : "bg-border-subtle text-text-muted"}`}>
                      {cfg.enabled ? "On" : "Off"}
                    </span>
                    <span className="text-xs text-text-muted hidden sm:inline">
                      {cfg.maxConcurrent || "∞"} concurrent · {cfg.rpm || "∞"} rpm · {l.active ?? 0} active · {l.queued ?? 0} queued
                    </span>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    {open && (
                      <div className="hidden md:block">
                        <PresetChips presets={FLOW_PRESETS} activeValues={cfg} onPick={(k) => applyPreset(provider, k)} />
                      </div>
                    )}
                    <button className="text-xs text-red-500 px-1" onClick={() => removeProvider(provider)}>Remove</button>
                  </div>
                </div>

                {open && (
                  <div className="mt-4 space-y-4">
                    <Toggle size="sm" checked={!!cfg.enabled} onChange={(v) => update(provider, { enabled: v })} label="Enabled" description="Queue/limit this provider" />

                    <div className="md:hidden">
                      <p className="text-xs text-text-muted mb-1">Presets</p>
                      <PresetChips presets={FLOW_PRESETS} activeValues={cfg} onPick={(k) => applyPreset(provider, k)} />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {FIELDS.map((f) => (
                        <label key={f.key} className="text-sm">
                          <span className="flex items-center justify-between mb-1">
                            <span className="text-text-main">{f.label}</span>
                            <span className="text-xs text-text-muted">{f.unit}</span>
                          </span>
                          <input
                            type="number"
                            min="0"
                            className="w-full bg-surface border border-border-subtle rounded-md px-3 py-2"
                            value={cfg[f.key] ?? 0}
                            onChange={(e) => update(provider, { [f.key]: e.target.value })}
                          />
                          <span className="block mt-0.5 text-xs text-text-muted">{f.hint} · 0 = unlimited</span>
                        </label>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-border-subtle text-sm">
                      <Stat label="In flight" value={formatNumber(l.active ?? 0)} />
                      <Stat label="Queued" value={formatNumber(l.queued ?? 0)} />
                      <Stat label="Requests/min used" value={formatNumber(l.rpmUsed ?? 0)} />
                      <Stat label="Requests/min left" value={l.rpmRemaining == null ? "∞" : formatNumber(l.rpmRemaining)} />
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {(dirty || saving) && (
        <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-border-subtle bg-surface/95 backdrop-blur px-4 py-3">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
            <span className="text-sm text-text-muted">You have unsaved changes.</span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => window.location.reload()}>Discard</Button>
              <Button onClick={save} loading={saving}>Save changes</Button>
            </div>
          </div>
        </div>
      )}

      {saved && !dirty && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm text-green-500">Saved.</div>
      )}
    </div>
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
