"use client";

import type { CropRuleset, ModelInfo, PresetId } from "./CaptionStudioTypes";
import { CAPTION_PRESETS, CROP_RULESETS } from "./CaptionStudioTypes";

export function ConfigSection({
  serverUrl,
  onServerUrlChange,
  models,
  selectedModel,
  onModelChange,
  modelLoading,
  modelError,
  onFetchModels,
  presetId,
  onPresetChange,
  presetLabel,
  systemPrompt,
  onSystemPromptChange,
  userPrompt,
  onUserPromptChange,
  triggerWord,
  onTriggerWordChange,
  needsTrigger,
  triggerRequired,
  parallelRequests,
  onParallelRequestsChange,
  selectedRuleset,
  onRulesetChange,
  isProcessing,
}: {
  serverUrl: string;
  onServerUrlChange: (value: string) => void;
  models: ModelInfo[];
  selectedModel: string;
  onModelChange: (value: string) => void;
  modelLoading: boolean;
  modelError: string;
  onFetchModels: () => void;
  presetId: PresetId;
  onPresetChange: (id: PresetId) => void;
  presetLabel: string;
  systemPrompt: string;
  onSystemPromptChange: (value: string) => void;
  userPrompt: string;
  onUserPromptChange: (value: string) => void;
  triggerWord: string;
  onTriggerWordChange: (value: string) => void;
  needsTrigger: boolean;
  triggerRequired: boolean;
  parallelRequests: number;
  onParallelRequestsChange: (value: number) => void;
  selectedRuleset: CropRuleset | null;
  onRulesetChange: (ruleset: CropRuleset) => void;
  isProcessing: boolean;
}) {
  return (
    <section className="rounded-xl border border-zinc-200 overflow-hidden">
      {/* Section header */}
      <div className="flex items-center gap-3 px-5 py-3 bg-zinc-50 border-b border-zinc-200">
        <div className="w-6 h-6 rounded-full bg-zinc-900 text-zinc-100 flex items-center justify-center text-xs font-medium">
          1
        </div>
        <h2 className="text-sm font-semibold text-zinc-900">Configure</h2>
        <p className="text-xs text-zinc-400 ml-auto hidden sm:block">
          Set up the API connection and caption preset
        </p>
      </div>

      <div className="p-5 space-y-5">
        {/* API Connection */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
            API Connection
          </h3>

          <div className="flex gap-3">
            <input
              type="url"
              placeholder="http://localhost:8080"
              value={serverUrl}
              onChange={(e) => onServerUrlChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onFetchModels();
              }}
              className="flex-1 px-3 py-2 text-sm border border-zinc-300 rounded bg-white text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-zinc-500"
            />
            <button
              onClick={onFetchModels}
              disabled={modelLoading || !serverUrl.trim()}
              className="px-4 py-2 text-sm font-medium bg-zinc-800 text-zinc-100 rounded hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              {modelLoading ? "Loading..." : "Fetch Models"}
            </button>
          </div>
          <p className="text-[11px] text-zinc-400 mt-1">
            OpenAI-compatible server URL (default: http://localhost:8080)
          </p>

          {modelError && <p className="text-xs text-zinc-400">{modelError}</p>}

          {models.length > 0 && (
            <div>
              <label className="block text-xs text-zinc-400 mb-1">
                Model
              </label>
              <select
                value={selectedModel}
                onChange={(e) => onModelChange(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-zinc-300 rounded bg-white text-zinc-900 focus:outline-none focus:border-zinc-500 appearance-none"
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Preset */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
            Caption Preset
          </h3>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">
              Preset
            </label>
            <select
              value={presetId}
              onChange={(e) => onPresetChange(e.target.value as PresetId)}
              disabled={isProcessing}
              className="w-full px-3 py-2 text-sm border border-zinc-300 rounded bg-white text-zinc-900 focus:outline-none focus:border-zinc-500 appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {CAPTION_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-zinc-400 mt-1">
              {CAPTION_PRESETS.find((p) => p.id === presetId)?.description ?? ""}
            </p>
          </div>

          {/* Trigger word (activation token) */}
          {needsTrigger && (
            <div>
              <label className="block text-xs text-zinc-400 mb-1">
                Activation Token
                <span className="normal-case font-normal ml-1 text-zinc-500">
                  — required
                </span>
              </label>
              <input
                type="text"
                value={triggerWord}
                onChange={(e) => onTriggerWordChange(e.target.value)}
                placeholder='e.g. "margot_robbie" or a custom token'
                className={`w-full px-3 py-2 text-sm border rounded bg-white text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-zinc-500 transition-colors ${
                  triggerRequired
                    ? "border-zinc-500 ring-1 ring-zinc-400"
                    : "border-zinc-300"
                }`}
              />
              <p className="text-[11px] text-zinc-400 mt-1">
                Unique token prepended to each caption — invent a non-word token per character
              </p>
            </div>
          )}
        </div>

        {/* Prompts (editable) */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
            Prompts
          </h3>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">
              System Prompt
            </label>
            <textarea
              value={systemPrompt}
              onChange={(e) => onSystemPromptChange(e.target.value)}
              rows={6}
              className="w-full px-3 py-2 text-sm border border-zinc-300 rounded bg-white text-zinc-900 focus:outline-none focus:border-zinc-500 resize-y font-mono leading-relaxed"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">
              User Prompt
              <span className="normal-case font-normal ml-1 text-zinc-500">
                ({presetLabel})
              </span>
            </label>
            <textarea
              value={userPrompt}
              onChange={(e) => onUserPromptChange(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-sm border border-zinc-300 rounded bg-white text-zinc-900 focus:outline-none focus:border-zinc-500 resize-y font-mono leading-relaxed"
            />
            <p className="text-[11px] text-zinc-400 mt-1">
              <code>{`{trigger}`}</code> is replaced with the activation token at runtime
            </p>
          </div>
        </div>

        {/* Ruleset */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
            Crop Ruleset
          </h3>
          <p className="text-[11px] text-zinc-400 mt-1">
            Portrait (face) / Body (pose) split for auto-detection
          </p>
          <div className="flex flex-wrap gap-2">
            {CROP_RULESETS.map((ruleset) => {
              const isSelected = selectedRuleset?.id === ruleset.id;
              const portraitPct = Math.round(ruleset.portraitRatio * 100);
              const bodyPct = 100 - portraitPct;

              return (
                <button
                  key={ruleset.id}
                  onClick={() => onRulesetChange(ruleset)}
                  disabled={isProcessing}
                  title={ruleset.description}
                  className={`relative px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                    isSelected
                      ? "bg-zinc-900 text-zinc-100 border-zinc-900"
                      : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400 hover:text-zinc-800"
                  } ${isProcessing ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
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

        {/* Options */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
            Options
          </h3>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">
              Parallel Requests
            </label>
            <select
              value={parallelRequests}
              onChange={(e) => onParallelRequestsChange(Number(e.target.value))}
              disabled={isProcessing}
              className="w-full px-3 py-2 text-sm border border-zinc-300 rounded bg-white text-zinc-900 focus:outline-none focus:border-zinc-500 appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>
                  {n} concurrent request{n > 1 ? "s" : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </section>
  );
}
