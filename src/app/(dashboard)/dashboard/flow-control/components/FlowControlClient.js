"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Card from "@/shared/components/Card";
import Button from "@/shared/components/Button";
import { FLOW_PRESETS } from "@/lib/limits/presets.js";

const emptyProvider = () => ({ enabled: true, maxConcurrent: 5, rpm: 120, queueTimeoutMs: 30000, maxQueue: 500 });

const PRESET_KEYS = Object.entries(FLOW_PRESETS);

export default function FlowControlClient() {
  const [providers, setProviders] = useState({});
  const [live, setLive] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [newProvider, setNewProvider] = useState("");
  const [knownProviders, setKnownProviders] = useState([]);
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
        setError("");
        // Distinct provider ids already connected, for one-click add.
        const ids = new Set();
        for (const entry of Object.values(provRes || {})) {
          if (entry?.provider) ids.add(entry.provider);
        }
        if (Array.isArray(provRes?.connections)) {
          for (const c of provRes.connections) if (c?.provider) ids.add(c.provider);
        }
        setKnownProviders([...ids].sort());
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

  const applyPreset = (provider, presetKey) => {
    const preset = FLOW_PRESETS[presetKey];
    if (!preset) return;
    update(provider, preset.values);
  };

  const addProvider = (p) => {
    const name = String(p || "").trim();
    if (!name || providers[name]) return;
    setProviders((prev) => ({ ...prev, [name]: emptyProvider() }));
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

  const applyPresetToAll = () => {
    const preset = FLOW_PRESETS[bulkPreset];
    if (!preset) return;
    setProviders((prev) =>
      Object.fromEntries(Object.entries(prev).map(([p, cfg]) => [p, { ...cfg, ...preset.values }]))
    );
    setSaved(false);
  };

  const enableAll = (enabled) => {
    setProviders((prev) =>
      Object.fromEntries(Object.entries(prev).map(([p, cfg]) => [p, { ...cfg, enabled }]))
    );
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

  const unconfigured = useMemo(
    () => knownProviders.filter((p) => !providers[p]),
    [knownProviders, providers]
  );
  const count = Object.keys(providers).length;

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
            onKeyDown={(e) => { if (e.key === "Enter") addProvider(newProvider); }}
          />
          <Button variant="outline" onClick={() => addProvider(newProvider)}>Add provider</Button>

          {unconfigured.length > 0 && (
            <select
              className="bg-surface border border-border-subtle rounded-md px-3 py-1.5 text-sm"
              value=""
              onChange={(e) => addProvider(e.target.value)}
            >
              <option value="">Add connected provider…</option>
              {unconfigured.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          )}

          <span className="text-xs text-text-muted ml-auto">0 = unlimited · requests wait in the queue up to the timeout.</span>
        </div>
      </Card>

      {count > 0 && (
        <Card padding="sm">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-text-muted">Apply to all:</span>
            <select
              className="bg-surface border border-border-subtle rounded-md px-3 py-1.5 text-sm"
              value={bulkPreset}
              onChange={(e) => setBulkPreset(e.target.value)}
            >
              {PRESET_KEYS.map(([key, p]) => <option key={key} value={key}>{p.label} — {p.description}</option>)}
            </select>
            <Button variant="outline" onClick={applyPresetToAll}>Apply</Button>
            <Button variant="outline" onClick={() => enableAll(true)}>Enable all</Button>
            <Button variant="outline" onClick={() => enableAll(false)}>Disable all</Button>
            <span className="text-xs text-text-muted ml-auto">{count} provider(s) configured</span>
          </div>
        </Card>
      )}

      {loading ? (
        <Card><p className="text-sm text-text-muted">Loading…</p></Card>
      ) : count === 0 ? (
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
                  <div className="flex items-center gap-2">
                    <select
                      className="bg-surface border border-border-subtle rounded-md px-2 py-1 text-xs"
                      value=""
                      onChange={(e) => applyPreset(provider, e.target.value)}
                    >
                      <option value="">Preset…</option>
                      {PRESET_KEYS.map(([key, p]) => <option key={key} value={key}>{p.label}</option>)}
                    </select>
                    <button className="text-xs text-red-500" onClick={() => removeProvider(provider)}>Remove</button>
                  </div>
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
        min="0"
        className="w-full bg-surface border border-border-subtle rounded-md px-3 py-2"
        value={value ?? 0}
        onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
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
