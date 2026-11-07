"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Card from "@/shared/components/Card";
import Button from "@/shared/components/Button";
import Toggle from "@/shared/components/Toggle";
import PresetChips from "@/shared/components/PresetChips";
import { LIMIT_PRESETS, TPM_SCALE } from "@/lib/limits/presets.js";
import { formatCount, formatNumber, parseCount } from "@/lib/limits/format.js";

// Friendly labels + which unit each field is in, so users do not have to guess.
const FIELDS = [
  { key: "rpm", label: "Requests / minute", unit: "req/min", hint: "0 = unlimited" },
  { key: "tpm", label: "Tokens / minute", unit: "tok/min", hint: "keep large for coding", big: true },
  { key: "dailyRequests", label: "Requests / day", unit: "req/day", hint: "0 = unlimited" },
  { key: "dailyTokens", label: "Tokens / day", unit: "tok/day", hint: "0 = unlimited", big: true },
  { key: "dailyCost", label: "Spend / day", unit: "USD/day", hint: "estimate" },
  { key: "monthlyCost", label: "Spend / month", unit: "USD/month", hint: "estimate" },
];

const TPM_CHIPS = [
  { value: 0, label: "Unlimited" },
  { value: 250_000, label: "250k" },
  { value: 1_000_000, label: "1M" },
  { value: 5_000_000, label: "5M" },
  { value: TPM_SCALE.xlarge, label: "20M" },
];

const emptyLimit = () => ({
  enabled: true,
  enforce: true,
  rpm: 0, tpm: TPM_SCALE.xlarge, dailyRequests: 0, dailyTokens: 0, dailyCost: 0, monthlyCost: 0,
});

export default function ProviderLimitsClient() {
  const [limits, setLimits] = useState({});
  const [usage, setUsage] = useState({});
  const [connected, setConnected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [pickProvider, setPickProvider] = useState("");
  const [customId, setCustomId] = useState("");
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
          cfg[p] = { enabled: v.enabled, enforce: v.enforce, ...v.limits };
          live[p] = v.usage;
        }
        const ids = new Set();
        const conns = Array.isArray(provRes?.connections) ? provRes.connections : [];
        for (const c of conns) if (c?.provider) ids.add(c.provider);
        setConnected([...ids].sort());
        // Auto-fill every connected provider so nothing has to be typed in by
        // hand. They start disabled with a relaxed preset: turning one on is a
        // single toggle, and nothing changes until it is saved.
        for (const p of [...ids].sort()) {
          if (!cfg[p]) cfg[p] = { ...emptyLimit(), enabled: false, ...LIMIT_PRESETS.relaxed.values };
        }
        setLimits(cfg);
        setUsage(live);
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

  const markDirty = () => { setSaved(false); setDirty(true); };

  const update = (provider, patch) => {
    setLimits((prev) => ({ ...prev, [provider]: { ...prev[provider], ...patch } }));
    markDirty();
  };

  const addProvider = (id) => {
    const name = String(id || "").trim();
    if (!name || limits[name]) return;
    setLimits((prev) => ({ ...prev, [name]: emptyLimit() }));
    setExpanded((prev) => ({ ...prev, [name]: true }));
    setPickProvider("");
    setCustomId("");
    markDirty();
  };

  const removeProvider = (p) => {
    setLimits((prev) => {
      const next = { ...prev };
      delete next[p];
      return next;
    });
    markDirty();
  };

  const applyPreset = (provider, key) => {
    const preset = LIMIT_PRESETS[key];
    if (preset) update(provider, preset.values);
  };

  const applyPresetToAll = () => {
    const preset = LIMIT_PRESETS[bulkPreset];
    if (!preset) return;
    setLimits((prev) => Object.fromEntries(Object.entries(prev).map(([p, c]) => [p, { ...c, ...preset.values }])));
    markDirty();
  };

  const raiseAllTpm = () => {
    setLimits((prev) => Object.fromEntries(Object.entries(prev).map(([p, c]) => [p, { ...c, tpm: TPM_SCALE.xlarge }])));
    markDirty();
  };

  const setAllEnabled = (enabled) => {
    setLimits((prev) => Object.fromEntries(Object.entries(prev).map(([p, c]) => [p, { ...c, enabled }])));
    markDirty();
  };

  const save = useCallback(async () => {
    setSaving(true);
    setError("");
    try {
      const providerLimits = {};
      for (const [p, c] of Object.entries(limits)) {
        providerLimits[p] = {
          enabled: c.enabled === true,
          enforce: c.enforce !== false,
          rpm: parseCount(c.rpm),
          tpm: parseCount(c.tpm),
          dailyRequests: parseCount(c.dailyRequests),
          dailyTokens: parseCount(c.dailyTokens),
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
      setDirty(false);
    } catch (e) {
      setError(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [limits]);

  const unconfigured = useMemo(() => connected.filter((p) => !limits[p]), [connected, limits]);
  const count = Object.keys(limits).length;

  return (
    <div className="space-y-6 pb-24">
      <div>
        <h1 className="text-xl font-semibold">Provider Limits</h1>
        <p className="text-sm text-text-muted">
          Limit how much any single provider can be used. Pick a provider, choose a preset, and save. Leave a field at
          <b> 0 </b> for unlimited; turn <b>Enforce</b> off to only watch without blocking.
        </p>
      </div>

      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-500">{error}</div>}

      {/* Step 1: add a provider (only providers you actually use) */}
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

      {/* Step 2: bulk actions */}
      {count > 0 && (
        <Card title="2. Quick set (optional)" subtitle="Apply a preset to every configured provider at once.">
          <div className="flex flex-wrap items-center gap-3">
            <PresetChips presets={LIMIT_PRESETS} activeValues={null} onPick={setBulkPreset} />
            <Button variant="outline" onClick={applyPresetToAll}>Apply “{LIMIT_PRESETS[bulkPreset]?.label}” to all</Button>
            <Button variant="outline" onClick={raiseAllTpm}>Raise all TPM → {formatCount(TPM_SCALE.xlarge)}/min</Button>
            <Button variant="outline" onClick={() => setAllEnabled(true)}>Enable all</Button>
            <Button variant="outline" onClick={() => setAllEnabled(false)}>Disable all</Button>
          </div>
        </Card>
      )}

      {/* Step 3: per-provider cards */}
      {loading ? (
        <Card><p className="text-sm text-text-muted">Loading…</p></Card>
      ) : count === 0 ? (
        <Card><p className="text-sm text-text-muted">No providers configured yet. Add one above.</p></Card>
      ) : (
        <div className="space-y-3">
          {Object.entries(limits).map(([provider, cfg]) => {
            const u = usage[provider] || {};
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
                      TPM {formatCount(cfg.tpm)} · RPM {formatNumber(cfg.rpm)}
                    </span>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    {open && (
                      <div className="hidden md:block">
                        <PresetChips presets={LIMIT_PRESETS} activeValues={cfg} onPick={(k) => applyPreset(provider, k)} />
                      </div>
                    )}
                    <button className="text-xs text-red-500 px-1" onClick={() => removeProvider(provider)}>Remove</button>
                  </div>
                </div>

                {open && (
                  <div className="mt-4 space-y-4">
                    <div className="flex flex-wrap gap-4">
                      <Toggle size="sm" checked={!!cfg.enabled} onChange={(v) => update(provider, { enabled: v })} label="Enabled" description="Apply this limit" />
                      <Toggle size="sm" checked={cfg.enforce !== false} onChange={(v) => update(provider, { enforce: v })} label="Enforce" description="Return 429 on breach (off = log only)" />
                    </div>

                    <div className="md:hidden">
                      <p className="text-xs text-text-muted mb-1">Presets</p>
                      <PresetChips presets={LIMIT_PRESETS} activeValues={cfg} onPick={(k) => applyPreset(provider, k)} />
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
                          <span className="block mt-0.5 text-xs text-text-muted">
                            {f.hint}{f.big ? ` · ${formatCount(cfg[f.key])}` : ""}
                          </span>
                          {f.big && (
                            <span className="flex flex-wrap gap-1.5 mt-1.5">
                              {TPM_CHIPS.map((c) => (
                                <button
                                  key={c.value}
                                  type="button"
                                  onClick={() => update(provider, { [f.key]: c.value })}
                                  className={`text-xs px-2 py-0.5 rounded-full border ${Number(cfg[f.key] || 0) === c.value ? "border-brand-500/60 bg-brand-500/15 text-brand-500" : "border-border-subtle text-text-muted hover:text-text-main"}`}
                                >
                                  {c.label}
                                </button>
                              ))}
                            </span>
                          )}
                        </label>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-border-subtle text-sm">
                      <Stat label="Requests/min now" value={formatNumber(u.rpm ?? 0)} />
                      <Stat label="Tokens/min now" value={formatNumber(u.tpm ?? 0)} />
                      <Stat label="Tokens today" value={formatNumber(u.dailyTokens ?? 0)} />
                      <Stat label="Spend today" value={`$${Number(u.dailyCost ?? 0).toFixed(2)}`} />
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Sticky save bar */}
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
