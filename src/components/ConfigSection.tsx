import { ModelInfo } from "./CaptionStudioTypes";
import { ModeToggle } from "./ModeToggle";

export function ConfigSection({
  serverUrl,
  onServerUrlChange,
  models,
  selectedModel,
  onModelChange,
  modelLoading,
  modelError,
  onFetchModels,
  systemPrompt,
  onSystemPromptChange,
  userPrompt,
  onUserPromptChange,
  captionName,
  onCaptionNameChange,
  includeNameInPrompt,
  onIncludeNameInPromptChange,
  parallelRequests,
  onParallelRequestsChange,
  contentMode,
  onContentModeChange,
  isProcessing,
  promptPrefixReadOnly,
  captionNameRequired,
}: {
  serverUrl: string;
  onServerUrlChange: (value: string) => void;
  models: ModelInfo[];
  selectedModel: string;
  onModelChange: (value: string) => void;
  modelLoading: boolean;
  modelError: string;
  onFetchModels: () => void;
  contentMode: "sfw" | "nsfw";
  onContentModeChange: (mode: "sfw" | "nsfw") => void;
  systemPrompt: string;
  onSystemPromptChange: (value: string) => void;
  userPrompt: string;
  onUserPromptChange: (value: string) => void;
  captionName: string;
  onCaptionNameChange: (value: string) => void;
  includeNameInPrompt: boolean;
  onIncludeNameInPromptChange: (checked: boolean) => void;
  parallelRequests: number;
  onParallelRequestsChange: (value: number) => void;
  isProcessing: boolean;
  promptPrefixReadOnly: string;
  captionNameRequired: boolean;
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
          Set up the API connection and prompts
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
          <p className="text-[11px] text-zinc-400 -mt-1">
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

        {/* Prompts */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
            Prompts
          </h3>

          <ModeToggle
            mode={contentMode}
            onModeChange={onContentModeChange}
            disabled={isProcessing}
          />

          <div>
            <label className="block text-xs text-zinc-400 mb-1">
              System Prompt
            </label>
            <textarea
              value={systemPrompt}
              onChange={(e) => onSystemPromptChange(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-zinc-300 rounded bg-white text-zinc-900 focus:outline-none focus:border-zinc-500 resize-y"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">
              User Prompt
            </label>
            <textarea
              value={userPrompt}
              onChange={(e) => onUserPromptChange(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-zinc-300 rounded bg-white text-zinc-900 focus:outline-none focus:border-zinc-500 resize-y"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">
              Prompt Prefix
            </label>
            <input
              type="text"
              value={promptPrefixReadOnly}
              readOnly
              className="w-full px-3 py-2 text-sm border border-zinc-200 rounded bg-zinc-50 text-zinc-500 cursor-not-allowed"
            />
          </div>
        </div>

        {/* Options */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
            Options
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">
                Caption Name
                <span className="normal-case font-normal ml-1">
                  (download filename)
                </span>
                {captionNameRequired && (
                  <span className="normal-case font-normal ml-1 text-zinc-500">— required</span>
                )}
              </label>
              <input
                type="text"
                value={captionName}
                onChange={(e) => onCaptionNameChange(e.target.value)}
                placeholder="e.g. CharacterSet01"
                className={`w-full px-3 py-2 text-sm border rounded bg-white text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-zinc-500 transition-colors ${
                  captionNameRequired && !captionName.trim()
                    ? "border-zinc-500 ring-1 ring-zinc-400"
                    : "border-zinc-300"
                }`}
              />
              <label className="flex items-center gap-2 mt-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeNameInPrompt}
                  onChange={(e) => onIncludeNameInPromptChange(e.target.checked)}
                  className="rounded border-zinc-300 text-zinc-900 focus:border-zinc-500 focus:ring-zinc-500"
                />
                <span className="text-xs text-zinc-600">
                  Include in prompt
                </span>
              </label>
            </div>
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
      </div>
    </section>
  );
}
