"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Card from "@/shared/components/Card";
import Button from "@/shared/components/Button";
import Input from "@/shared/components/Input";
import { PROMPT_TEMPLATES, PROMPT_MAX_TEXT_LENGTH } from "@/lib/promptTemplates.js";

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
  const [query, setQuery] = useState("");
  const [template, setTemplate] = useState("");
  const fileRef = useRef(null);

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

  const addFromTemplate = (id) => {
    const t = PROMPT_TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setEntries((prev) => [...prev, { ...emptyEntry(), ...t.entry, enabled: true, priority: 0 }]);
    setSaved(false);
  };

  const duplicateEntry = (id) =>
    setEntries((prev) => {
      const i = prev.findIndex((e) => e.id === id);
      if (i < 0) return prev;
      const copy = { ...prev[i], id: emptyEntry().id, name: `${prev[i].name || "Copy"} (copy)` };
      const next = [...prev];
      next.splice(i + 1, 0, copy);
      return next;
    });

  const updateEntry = (id, patch) =>
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const removeEntry = (id) => setEntries((prev) => prev.filter((e) => e.id !== id));

  const setAllEnabled = (enabled) => setEntries((prev) => prev.map((e) => ({ ...e, enabled })));

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

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mars-router-prompt-injections.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = async (file) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed)) throw new Error("Expected a JSON array");
      setEntries(parsed.map((e) => ({ ...emptyEntry(), ...e, id: e.id || emptyEntry().id })));
      setError("");
      setSaved(false);
    } catch (e) {
      setError(`Import failed: ${e.message}`);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) =>
      (e.name || "").toLowerCase().includes(q) ||
      (e.text || "").toLowerCase().includes(q) ||
      (e.comboName || "").toLowerCase().includes(q)
    );
  }, [entries, query]);

  const enabledCount = entries.filter((e) => e.enabled).length;

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

      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-500">{error}</div>}
      {saved && !error && <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm text-green-500">Saved.</div>}

      <Card padding="sm">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-text-muted">Template:</span>
          <select
            className="bg-surface border border-border-subtle rounded-md px-3 py-1.5 text-sm"
            value={template}
            onChange={(e) => { setTemplate(e.target.value); if (e.target.value) addFromTemplate(e.target.value); setTemplate(""); }}
          >
            <option value="">Add from template…</option>
            {PROMPT_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>

          <span className="text-text-muted">·</span>
          <Button variant="outline" onClick={() => setAllEnabled(true)}>Enable all</Button>
          <Button variant="outline" onClick={() => setAllEnabled(false)}>Disable all</Button>
          <Button variant="outline" onClick={exportJson}>Export</Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()}>Import</Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => importOnChange(e, importJson)}
          />

          <input
            className="ml-auto bg-surface border border-border-subtle rounded-md px-3 py-1.5 text-sm"
            placeholder="Filter…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className="text-xs text-text-muted">{enabledCount}/{entries.length} enabled</span>
        </div>
      </Card>

      {loading ? (
        <Card><p className="text-text-muted text-sm">Loading…</p></Card>
      ) : entries.length === 0 ? (
        <Card>
          <p className="text-sm text-text-muted">
            No injections yet. Click <b>Add injection</b>, or pick a <b>template</b> above — e.g. a global
            &quot;Always answer in Indonesian&quot; rule or a coding-combo style guide.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {filtered.map((entry, idx) => (
            <Card key={entry.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={entry.enabled} onChange={(e) => updateEntry(entry.id, { enabled: e.target.checked })} />
                    Enabled
                  </label>
                  <span className="text-xs text-text-muted">#{idx + 1}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button className="text-xs text-text-muted hover:text-text-main" onClick={() => move(entry.id, -1)}>↑</button>
                  <button className="text-xs text-text-muted hover:text-text-main" onClick={() => move(entry.id, 1)}>↓</button>
                  <button className="text-xs text-text-muted hover:text-text-main" onClick={() => duplicateEntry(entry.id)}>Duplicate</button>
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
                ) : <div />}
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
                    maxLength={PROMPT_MAX_TEXT_LENGTH}
                    placeholder="Always answer in Indonesian and cite sources when possible."
                    onChange={(e) => updateEntry(entry.id, { text: e.target.value })}
                  />
                </label>
                <p className="text-xs text-text-muted mt-1">
                  Higher priority runs first within its group. {entry.text.length}/{PROMPT_MAX_TEXT_LENGTH} chars.
                </p>
              </div>
            </Card>
          ))}
          {filtered.length === 0 && (
            <Card><p className="text-sm text-text-muted">No injections match “{query}”.</p></Card>
          )}
        </div>
      )}
    </div>
  );
}

function importOnChange(e, handler) {
  const file = e.target.files?.[0];
  if (file) handler(file);
  e.target.value = "";
}
