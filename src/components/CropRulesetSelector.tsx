"use client";

import { CROP_RULESETS } from "./CaptionStudioCropConstants";
import type { CropRuleset } from "./CaptionStudioCropTypes";

// ---------------------------------------------------------------------------
// CropRulesetSelector — pill-style ruleset picker
// ---------------------------------------------------------------------------

export function CropRulesetSelector({
  selected,
  onSelect,
  disabled,
}: {
  selected: CropRuleset | null;
  onSelect: (ruleset: CropRuleset) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-zinc-500">
        Crop Ruleset
      </label>
      <div className="flex flex-wrap gap-2">
        {CROP_RULESETS.map((ruleset) => {
          const isSelected = selected?.id === ruleset.id;
          const portraitPct = Math.round(ruleset.portraitRatio * 100);
          const bodyPct = 100 - portraitPct;

          return (
            <button
              key={ruleset.id}
              onClick={() => onSelect(ruleset)}
              disabled={disabled}
              title={ruleset.description}
              className={`relative px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                isSelected
                  ? "bg-zinc-900 text-zinc-100 border-zinc-900"
                  : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400 hover:text-zinc-800"
              } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            >
              <span className="font-semibold">{ruleset.label}</span>
              <span className="ml-1.5 text-zinc-400">
                ({portraitPct}% portrait / {bodyPct}% body)
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
