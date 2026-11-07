"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Card from "@/shared/components/Card";
import Button from "@/shared/components/Button";
import { LIMIT_PRESETS, TPM_PRESETS, TPM_SCALE } from "@/lib/limits/presets.js";

const LIMIT_FIELDS = [
  { key: "rpm", label: "RPM (requests/min)" },
  { key: "tpm", label: "TPM (tokens/min)" },
  { key: "dailyRequests", label: "Requests / day" },
  { key: "dailyTokens", label: "Tokens / day" },
  { key: "dailyCost", label: "Cost / day ($)" },
  { key: "monthlyCost", label: "Cost / month ($)" },
];

const PRESET_KEYS = Object.entries(LIMIT_PRESETS);

const emptyLimit = () => ({
  enabled: true,
  enforce: true,
  rpm: 0, tpm: TPM_SCALE.xlarge, dailyRequests: 0, dailyTokens: 0, dailyCost: 0, monthlyCost: 0,
});

export default function ProviderLimitsClient() {
  const [limits, setLimits] = useState({});
  const [usage, setUsage] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [newProvider, setNewProvider] = useState("");
  const [connected, setConnected] = useState([]);
  const [bulkPreset, setBulkPreset] = useState("relaxed");

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const [statusRes, provRes] = await Promise.all([
          fetch("/api/settings/limits/status").then((r) => r.json()),
          fetch("/api/providers").then((r) => r.json()).catch(() => ({})),
        ]);
        if (cancelled) return;
        const cfg = {};
        const live = {};
        for (const [p, v] of Object.entries(statusRes.providers || {})) {
          cfg[p] = {
            enabled: v.enabled,
            enforce: v.enforce,
            ...v.limits,
          };
          live[p] = v.usage;
        }
        setLimits(cfg);
        setUsage(live);
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
    return () => { cancelled = true; };
  }, []);

  const update = (provider, patch) => {
    setLimits((prev) => ({ ...prev, [provider]: { ...prev[provider], ...patch } }));
    setSaved(false);
  };

  const addProvider = (p) => {
    const name = String(p || "").trim();
    if (!name || limits[name]) return;
    setLimits((prev) => ({ ...prev, [name]: emptyLimit() }));
    setNewProvider("");
    setSaved(false);
  };

  const removeProvider = (p) => {
    setLimits((prev) => {
      const next = { ...prev };
      delete next[p];
      return next;
    });
    setSaved(false);
  };

  const applyPreset = (provider, key) => {
    const preset = LIMIT_PRESETS[key];
    if (preset) update(provider, preset.values);
  };

  const applyPresetToAll = () => {
    const preset = LIMIT_PRESETS[bulkPreset];
    if (!preset) return;
    setLimits((prev) => Object.fromEntries(Object.entries(prev).map(([p, c]) => [p, { ...c, ...preset.values }])));
    setSaved(false);
  };

  const raiseAllTpm = () => {
    setLimits((prev) => Object.fromEntries(Object.entries(prev).map(([p, c]) => [p, { ...c, tpm: TPM_SCALE.xlarge }])));
    setSaved(false);
  };

  const save = useCallback(async () => {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      // Provider limits live in settings.providerLimits; keep only the known fields.
      const providerLimits = {};
      for (const [p, c] of Object.entries(limits)) {
        providerLimits[p] = {
          enabled: c.enabled === true,
          enforce: c.enforce !== false,
          rpm: Number(c.rpm) || 0,
          tpm: Number(c.tpm) || 0,
          dailyRequests: Number(c.dailyRequests) || 0,
          dailyTokens: Number(c.dailyTokens) || 0,
          dailyCost: Number(c.dailyCost) || 0,
          monthlyCost: Number(c.monthlyCost) || 0,
        };
      }
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerLimits }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setSaved(true);
    } catch (e) {
      setError(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [limits]);

  const unconfigured = useMemo(() => connected.filter((p) => !limits[p]), [connected, limits]);
  const count = Object.keys(limits).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Provider Limits</h1>
          <p className="text-sm text-text-muted">
            Cap RPM / TPM and daily &amp; monthly tokens/cost <b>per provider</b>. 0 = unlimited. Breaches answer
            <code className="mx-1 font-mono">429</code> when <b>Enforce</b> is on, or only log when off.
          </p>
        </div>
        <Button onClick={save} loading={saving}>Save</Button>
      </div>

      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-500">{error}</div>}
      {saved && !error && <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm text-green-500">Saved.</div>}

      <Card padding="sm">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <input
            className="bg-surface border border-border-subtle rounded-md px-3 py-1.5 text-sm"
            placeholder="provider id (e.g. openai, glm, claude)"
            value={newProvider}
            onChange={(e) => setNewProvider(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addProvider(newProvider); }}
          />
          <Button variant="outline" onClick={() => addProvider(newProvider)}>Add provider</Button>
          {unconfigured.length > 0 && (
            <select className="bg-surface border border-border-subtle rounded-md px-3 py-1.5 text-sm" value="" onChange={(e) => addProvider(e.target.value)}>
              <option value="">Add connected provider…</option>
              {unconfigured.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
          <span className="text-xs text-text-muted ml-auto">TPM is tokens per minute — keep it large (≥ 1M) for coding.</span>
        </div>
      </Card>

      {count > 0 && (
        <Card padding="sm">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-text-muted">Apply to all:</span>
            <select className="bg-surface border border-border-subtle rounded-md px-3 py-1.5 text-sm" value={bulkPreset} onChange={(e) => setBulkPreset(e.target.value)}>
              {PRESET_KEYS.map(([key, p]) => <option key={key} value={key}>{p.label} — {p.description}</option>)}
            </select>
            <Button variant="outline" onClick={applyPresetToAll}>Apply</Button>
            <Button variant="outline" onClick={raiseAllTpm}>Raise all TPM → {TPM_SCALE.xlarge.toLocaleString()}/min</Button>
            <span className="text-xs text-text-muted ml-auto">{count} provider(s)</span>
          </div>
        </Card>
      )}

      {loading ? (
        <Card><p className="text-sm text-text-muted">Loading…</p></Card>
      ) : count === 0 ? (
        <Card><p className="text-sm text-text-muted">No provider limits configured. Add a provider to cap its usage.</p></Card>
      ) : (
        <div className="space-y-4">
          <datalist id="tpm-presets">
            {TPM_PRESETS.map((v) => <option key={v} value={v}>{v === 0 ? "unlimited" : `${v.toLocaleString()}/min`}</option>)}
          </datalist>
          {Object.entries(limits).map(([provider, cfg]) => {
            const u = usage[provider] || {};
            return (
              <Card key={provider}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm">{provider}</span>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={!!cfg.enabled} onChange={(e) => update(provider, { enabled: e.target.checked })} />
                      Enabled
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={cfg.enforce !== false} onChange={(e) => update(provider, { enforce: e.target.checked })} />
                      Enforce (429)
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <select className="bg-surface border border-border-subtle rounded-md px-2 py-1 text-xs" value="" onChange={(e) => applyPreset(provider, e.target.value)}>
                      <option value="">Preset…</option>
                      {PRESET_KEYS.map(([key, p]) => <option key={key} value={key}>{p.label}</option>)}
                    </select>
                    <button className="text-xs text-red-500" onClick={() => removeProvider(provider)}>Remove</button>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
                  {LIMIT_FIELDS.map((f) => (
                    <label key={f.key} className="text-sm">
                      <span className="block mb-1 text-text-muted">{f.label}</span>
                      <input
                        type="number"
                        min="0"
                        list={f.key === "tpm" ? "tpm-presets" : undefined}
                        className="w-full bg-surface border border-border-subtle rounded-md px-3 py-2"
                        value={cfg[f.key] ?? 0}
                        onChange={(e) => update(provider, { [f.key]: e.target.value === "" ? 0 : Number(e.target.value) })}
                      />
                    </label>
                  ))}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-sm">
                  <Stat label="RPM used" value={u.rpm ?? 0} />
                  <Stat label="TPM used" value={u.tpm ?? 0} />
                  <Stat label="Tokens today" value={u.dailyTokens ?? 0} />
                  <Stat label="Cost today" value={`$${(u.dailyCost ?? 0).toFixed?.(2) ?? 0}`} />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <p className="text-xs text-text-muted">{label}</p>
      <p className="text-base font-semibold">{typeof value === "number" ? value.toLocaleString() : value}</p>
    </div>
  );
}
