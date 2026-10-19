/**
 * Prompt editor for system and user messages.
 *
 * Binds to mode-specific session state: Krea 2 edits its phase-1 prompts
 * (plus trigger words, which are Krea 2 only); MOSS-Image edits its
 * recaptioner prompt (system message, guide's prompt default) and its
 * per-image instruction (user message).
 */

"use client";

import { useSession } from "@/hooks/use-session";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface PromptEditorProps {
  /** Which mode's prompt state to bind to. */
  mode?: "krea2" | "moss";
}

export function PromptEditor({ mode = "krea2" }: PromptEditorProps) {
  const {
    state,
    setSystemPrompt,
    setUserPrompt,
    setTriggerWordPerson,
    setTriggerWordOther,
    setMossSystemPrompt,
    setMossUserPrompt,
  } = useSession();

  const isMoss = mode === "moss";
  const systemValue = isMoss ? state.mossSystemPrompt : state.systemPrompt;
  const setSystem = isMoss ? setMossSystemPrompt : setSystemPrompt;
  const userValue = isMoss ? state.mossUserPrompt : state.userPrompt;
  const setUser = isMoss ? setMossUserPrompt : setUserPrompt;

  return (
    <div className="space-y-4">
      {/* System Message */}
      <div className="space-y-2">
        <Textarea
          label="System Message"
          value={systemValue}
          onChange={(e) => setSystem(e.target.value)}
          placeholder={
            isMoss
              ? "The recaptioner prompt - defaults to the MOSS-Image guide's prompt..."
              : "You are a helpful assistant that describes images..."
          }
          rows={isMoss ? 8 : 3}
          className="text-sm font-mono"
        />
        {isMoss && (
          <p className="text-xs text-slate-500">
            Defaults to the MOSS-Image guide&apos;s recaptioner prompt. Sent as the
            system message and used as-is for every image.
          </p>
        )}
      </div>

      {/* Trigger Words (Krea 2 only, prepended to user prompt) */}
      {!isMoss && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-300">Trigger Words (optional)</label>
          <p className="text-xs text-slate-500 -mt-1.5 mb-2">If filled, these are prepended to each user message.</p>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Person"
              value={state.triggerWordPerson}
              onChange={(e) => setTriggerWordPerson(e.target.value)}
              placeholder="e.g. Alice, character name..."
            />
            <Input
              label="Other"
              value={state.triggerWordOther}
              onChange={(e) => setTriggerWordOther(e.target.value)}
              placeholder="e.g. subject, object..."
            />
          </div>
        </div>
      )}

      {/* User Message */}
      <div className="space-y-2">
        <Textarea
          label="User Message"
          value={userValue}
          onChange={(e) => setUser(e.target.value)}
          placeholder={
            isMoss
              ? "Caption this image."
              : "Describe this image in detail..."
          }
          rows={isMoss ? 2 : 4}
          className="text-sm font-mono"
        />
        {isMoss && (
          <p className="text-xs text-slate-500">
            Short per-image instruction, sent with the image; grounding
            (subject description, reference caption) is appended automatically
            when present.
          </p>
        )}
      </div>
    </div>
  );
}
