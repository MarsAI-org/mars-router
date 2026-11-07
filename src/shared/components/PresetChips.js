"use client";

import { cn } from "@/shared/utils/cn";

/**
 * A row of one-click preset chips. `presets` is a { key: { label, description, values } }
 * map; `onPick(key)` receives the chosen key. The chip whose values match `activeValues`
 * (shallow) is highlighted.
 */
export default function PresetChips({ presets, activeValues = null, onPick, className }) {
  const entries = Object.entries(presets || {});
  const isActive = (values) =>
    activeValues && Object.keys(values).every((k) => Number(activeValues[k] || 0) === Number(values[k] || 0));

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {entries.map(([key, preset]) => {
        const active = isActive(preset.values);
        return (
          <button
            key={key}
            type="button"
            onClick={() => onPick?.(key)}
            title={preset.description}
            className={cn(
              "px-3 py-1.5 text-xs rounded-full border transition-colors",
              active
                ? "border-brand-500/60 bg-brand-500/15 text-brand-500 font-medium"
                : "border-border-subtle text-text-muted hover:text-text-main hover:border-brand-500/30"
            )}
          >
            {preset.label}
          </button>
        );
      })}
    </div>
  );
}
