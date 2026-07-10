/**
 * Prompt editor for system and user messages.
 * Supports variable placeholders like {trigger}, {image_name}, etc.
 */

"use client";

import { useSession } from "@/hooks/use-session";
import { Textarea } from "@/components/ui/textarea";

interface PromptEditorProps {
  mode: "simple" | "multi-step";
}

export function PromptEditor({ mode }: PromptEditorProps) {
  const {
    state,
    setSystemPrompt,
    setUserPrompt,
    setMultiStepSystemPrompt,
    updateMultiStepMessage,
    addMultiStepMessage,
    removeMultiStepMessage,
  } = useSession();

  const availableVariables = [
    "{trigger}",
    "{image_name}",
    "{index}",
    "{total}",
  ];

  return (
    <div className="space-y-4">
      {/* System Prompt */}
      <Textarea
        label="System Message"
        value={mode === "simple" ? state.systemPrompt : state.multiStepSystemPrompt}
        onChange={(e) =>
          mode === "simple"
            ? setSystemPrompt(e.target.value)
            : setMultiStepSystemPrompt(e.target.value)
        }
        placeholder="You are a helpful assistant that describes images..."
        rows={3}
        className="text-sm font-mono"
      />

      {mode === "simple" ? (
        /* Simple mode: single user prompt */
        <div className="space-y-2">
          <Textarea
            label="User Message"
            value={state.userPrompt}
            onChange={(e) => setUserPrompt(e.target.value)}
            placeholder="Describe this image in detail..."
            rows={4}
            className="text-sm font-mono"
          />
        </div>
      ) : (
        /* Multi-step mode: chain of user messages */
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-slate-300">
              Chat Messages ({state.multiStepMessages.length})
            </label>
            <button
              onClick={() => addMultiStepMessage("")}
              className="text-xs text-indigo-400 hover:text-indigo-300"
            >
              + Add message
            </button>
          </div>

          {state.multiStepMessages.map((msg, index) => (
            <div key={index} className="flex gap-2 items-start">
              <span className="text-xs text-slate-500 pt-2 min-w-[24px] text-right">
                {index + 1}.
              </span>
              <Textarea
                value={msg}
                onChange={(e) => updateMultiStepMessage(index, e.target.value)}
                placeholder={`User message ${index + 1}...`}
                rows={2}
                className="text-sm font-mono flex-1"
              />
              {state.multiStepMessages.length > 1 && (
                <button
                  onClick={() => removeMultiStepMessage(index)}
                  className="text-xs text-red-400 hover:text-red-300 pt-2"
                >
                  x
                </button>
              )}
            </div>
          ))}

          {state.multiStepMessages.length === 0 && (
            <p className="text-xs text-slate-500 italic">
              Add at least one user message to start the conversation chain.
            </p>
          )}
        </div>
      )}

      {/* Available variables */}
      <div className="text-xs text-slate-500">
        <span className="font-medium">Available variables:</span>{" "}
        {availableVariables.map((v) => (
          <code
            key={v}
            className="bg-slate-700 px-1.5 py-0.5 rounded mx-0.5 text-slate-400"
          >
            {v}
          </code>
        ))}
      </div>
    </div>
  );
}
