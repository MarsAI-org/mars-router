"use client";

import { useCallback, useEffect, useState } from "react";
import Card from "@/shared/components/Card";
import Button from "@/shared/components/Button";
import Input from "@/shared/components/Input";

const emptyEntry = () => ({
  id: `pi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  name: "",
  text: "",
  enabled: true,
  scope: "global",
  comboName: "",
  position: "append",
  priority: 0,
});

export default function PromptInjectionClient() {
  const [entries, setEntries] = useState([]);
  const [combos, setCombos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const [pi, cb] = await Promise.all([
          fetch("/api/prompt-injections").then((r) => r.json()),
          fetch("/api/combos").then((r) => r.json()).catch(() => ({ combos: [] })),
        ]);
        if (cancelled) return;
        setEntries(Array.isArray(pi.promptInjections) ? pi.promptInjections : []);
        setCombos(Array.isArray(cb?.combos) ? cb.combos : []);
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, []);

  const addEntry = () => setEntries((prev) => [...prev, emptyEntry()]);

  const updateEntry = (id, patch) =>
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const removeEntry = (id) => setEntries((prev) => prev.filter((e) => e.id !== id));

  const move = (id, dir) => {
    setEntries((prev) => {
      const i = prev.findIndex((e) => e.id === id);
      if (i < 0) return prev;
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const save = useCallback(async () => {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const res = await fetch("/api/prompt-injections", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promptInjections: entries }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setEntries(Array.isArray(data.promptInjections) ? data.promptInjections : entries);
      setSaved(true);
    } catch (e) {
      setError(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [entries]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Prompt Injection</h1>
          <p className="text-sm text-text-muted">
            Operator instructions added to the system message of every request. Scope globally or to a specific combo.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={addEntry}>Add injection</Button>
          <Button onClick={save} loading={saving}>Save</Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-500">{error}</div>
      )}
      {saved && !error && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm text-green-500">Saved.</div>
      )}

      {loading ? (
        <Card><p className="text-text-muted text-sm">Loading…</p></Card>
      ) : entries.length === 0 ? (
        <Card>
          <p className="text-sm text-text-muted">
            No injections yet. Click <b>Add injection</b> to create one — e.g. a global
            &quot;Always answer in Indonesian&quot; rule or a coding-combo style guide.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {entries.map((entry, idx) => (
            <Card key={entry.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={entry.enabled}
                      onChange={(e) => updateEntry(entry.id, { enabled: e.target.checked })}
                    />
                    Enabled
                  </label>
                  <span className="text-xs text-text-muted">#{idx + 1}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button className="text-xs text-text-muted hover:text-text-main" onClick={() => move(entry.id, -1)}>↑</button>
                  <button className="text-xs text-text-muted hover:text-text-main" onClick={() => move(entry.id, 1)}>↓</button>
                  <button className="text-xs text-red-500" onClick={() => removeEntry(entry.id)}>Remove</button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3">
                <Input label="Name" value={entry.name} placeholder="e.g. Reply language" onChange={(e) => updateEntry(entry.id, { name: e.target.value })} />
                <label className="text-sm">
                  <span className="block mb-1 font-medium text-text-main">Scope</span>
                  <select
                    className="w-full bg-surface border border-border-subtle rounded-md px-3 py-2"
                    value={entry.scope}
                    onChange={(e) => updateEntry(entry.id, { scope: e.target.value })}
                  >
                    <option value="global">Global (all requests)</option>
                    <option value="combo">Combo</option>
                  </select>
                </label>
                {entry.scope === "combo" ? (
                  <label className="text-sm">
                    <span className="block mb-1 font-medium text-text-main">Combo</span>
                    <select
                      className="w-full bg-surface border border-border-subtle rounded-md px-3 py-2"
                      value={entry.comboName}
                      onChange={(e) => updateEntry(entry.id, { comboName: e.target.value })}
                    >
                      <option value="">Select combo…</option>
                      {combos.map((c) => <option key={c.id || c.name} value={c.name}>{c.name}</option>)}
                    </select>
                  </label>
                ) : (
                  <div />
                )}
                <label className="text-sm">
                  <span className="block mb-1 font-medium text-text-main">Position</span>
                  <select
                    className="w-full bg-surface border border-border-subtle rounded-md px-3 py-2"
                    value={entry.position}
                    onChange={(e) => updateEntry(entry.id, { position: e.target.value })}
                  >
                    <option value="append">Append (after existing system)</option>
                    <option value="prepend">Prepend (before existing system)</option>
                  </select>
                </label>
              </div>

              <div className="mt-3">
                <label className="text-sm">
                  <span className="block mb-1 font-medium text-text-main">Instruction</span>
                  <textarea
                    className="w-full bg-surface border border-border-subtle rounded-md px-3 py-2 text-sm min-h-[90px]"
                    value={entry.text}
                    placeholder="Always answer in Indonesian and cite sources when possible."
                    onChange={(e) => updateEntry(entry.id, { text: e.target.value })}
                  />
                </label>
                <p className="text-xs text-text-muted mt-1">
                  Higher priority runs first within its group. {entry.text.length} chars.
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
