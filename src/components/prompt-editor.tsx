/**
 * Prompt editor for system and user messages.
 */

"use client";

import { useSession } from "@/hooks/use-session";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function PromptEditor() {
  const {
    state,
    setSystemPrompt,
    setUserPrompt,
    setTriggerWordPerson,
    setTriggerWordOther,
  } = useSession();

  return (
    <div className="space-y-4">
      {/* System Prompt */}
      <Textarea
        label="System Message"
        value={state.systemPrompt}
        onChange={(e) => setSystemPrompt(e.target.value)}
        placeholder="You are a helpful assistant that describes images..."
        rows={3}
        className="text-sm font-mono"
      />

      {/* Trigger Words (optional, prepended to user prompt) */}
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

      {/* User Message */}
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
    </div>
  );
}
