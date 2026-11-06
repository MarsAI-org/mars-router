"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Card from "@/shared/components/Card";
import Button from "@/shared/components/Button";
import Input from "@/shared/components/Input";

export default function ModelCatalogClient() {
  const [models, setModels] = useState([]);
  const [catalog, setCatalog] = useState({ hidden: [], displayNames: {}, order: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const [catalogRes, modelsRes] = await Promise.all([
          fetch("/api/model-catalog").then((r) => r.json()),
          fetch("/api/v1/models").then((r) => r.json()),
        ]);
        if (cancelled) return;
        setCatalog(catalogRes.catalog || { hidden: [], displayNames: {}, order: [] });
        setModels(Array.isArray(modelsRes?.data) ? modelsRes.data : []);
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, []);

  const hiddenSet = useMemo(() => new Set(catalog.hidden || []), [catalog.hidden]);

  const toggleHidden = (id) => {
    setCatalog((prev) => {
      const set = new Set(prev.hidden || []);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return { ...prev, hidden: [...set] };
    });
    setSaved(false);
  };

  const setDisplayName = (id, name) => {
    setCatalog((prev) => {
      const displayNames = { ...(prev.displayNames || {}) };
      if (name && name.trim()) displayNames[id] = name;
      else delete displayNames[id];
      return { ...prev, displayNames };
    });
    setSaved(false);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter((m) => m.id.toLowerCase().includes(q));
  }, [models, query]);

  const save = useCallback(async () => {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const res = await fetch("/api/model-catalog", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(catalog),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setCatalog(data.catalog);
      setSaved(true);
    } catch (e) {
      setError(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [catalog]);

  const visibleCount = models.filter((m) => !hiddenSet.has(m.id)).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Model Catalog</h1>
          <p className="text-sm text-text-muted">
            Control what the <code className="font-mono">/v1/models</code> endpoint publishes — hide entries and set
            display names.
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
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-text-muted">{models.length} models resolved · {visibleCount} visible</span>
          <input
            className="ml-auto bg-surface border border-border-subtle rounded-md px-3 py-1.5 text-sm"
            placeholder="Filter models…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </Card>

      {loading ? (
        <Card><p className="text-text-muted text-sm">Loading…</p></Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-text-muted text-left">
                  <th className="py-2 pr-4">Publish</th>
                  <th className="py-2 pr-4">Model ID</th>
                  <th className="py-2 pr-4">Owner</th>
                  <th className="py-2 pr-4">Display name</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => {
                  const hidden = hiddenSet.has(m.id);
                  return (
                    <tr key={m.id} className={`border-t border-border-subtle ${hidden ? "opacity-50" : ""}`}>
                      <td className="py-2 pr-4">
                        <input
                          type="checkbox"
                          checked={!hidden}
                          onChange={() => toggleHidden(m.id)}
                          title={hidden ? "Hidden — enable to publish" : "Visible — disable to hide"}
                        />
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs">{m.id}</td>
                      <td className="py-2 pr-4 text-text-muted">{m.owned_by || "—"}</td>
                      <td className="py-2 pr-4">
                        <input
                          className="w-full bg-surface border border-border-subtle rounded-md px-2 py-1 text-sm"
                          placeholder={m.name || "—"}
                          defaultValue={catalog.displayNames?.[m.id] || ""}
                          onBlur={(e) => setDisplayName(m.id, e.target.value)}
                        />
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={4} className="py-4 text-text-muted">No models match.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
