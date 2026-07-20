/**
 * Mode selection screen - lets the user choose between Simple and Multi-step modes.
 */

"use client";

import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface ModeSelectorProps {
  serverUrl: string;
  onModeSelected: (mode: "simple" | "multi-step" | "for-anima") => void;
}

export function ModeSelector({ onModeSelected }: ModeSelectorProps) {
  const { setMode } = useSession();

  const handleSelect = (mode: "simple" | "multi-step" | "for-anima") => {
    setMode(mode);
    onModeSelected(mode);
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-slate-100">Choose a Mode</h2>
        <p className="text-slate-400 mt-2">
          Select how you want to generate captions for your images.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Simple Mode */}
        <Card variant="elevated" className="cursor-pointer hover:border-indigo-500 transition-colors">
          <button
            onClick={() => handleSelect("simple")}
            className="w-full text-left"
          >
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl">S</span>
                <h3 className="text-lg font-semibold text-slate-100">Simple Mode</h3>
              </div>
              <p className="text-sm text-slate-400">
                Upload images, set a system message and a user prompt. Each image
                gets captioned with the same prompt in one step.
              </p>
              <ul className="text-xs text-slate-500 space-y-1 list-disc list-inside">
                <li>One prompt per image</li>
                <li>System + User message</li>
                <li>Quick and straightforward</li>
              </ul>
              <Button className="w-full mt-2">Start Simple Mode</Button>
            </div>
          </button>
        </Card>

        {/* Multi-step Mode */}
        <Card variant="elevated" className="cursor-pointer hover:border-indigo-500 transition-colors">
          <button
            onClick={() => handleSelect("multi-step")}
            className="w-full text-left"
          >
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl">M</span>
                <h3 className="text-lg font-semibold text-slate-100">Multi-step Mode</h3>
              </div>
              <p className="text-sm text-slate-400">
                Upload images, set a system message, then chain multiple user
                messages. Each response builds context for the next.
              </p>
              <ul className="text-xs text-slate-500 space-y-1 list-disc list-inside">
                <li>Conversational refinement</li>
                <li>Configurable message chain</li>
                <li>Final output becomes caption</li>
              </ul>
              <Button className="w-full mt-2">Start Multi-step Mode</Button>
            </div>
          </button>
        </Card>

        {/* For Anima Mode */}
        <Card variant="elevated" className="cursor-pointer hover:border-indigo-500 transition-colors md:col-span-2">
          <button
            onClick={() => handleSelect("for-anima")}
            className="w-full text-left"
          >
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl">A</span>
                <h3 className="text-lg font-semibold text-slate-100">For Anima Mode</h3>
              </div>
              <p className="text-sm text-slate-400">
                Enhance existing danbooru-style tags (from taggui) with natural
                language descriptions. The LLM adds spatial relationships, mood,
                and atmosphere that tags alone cannot express.
              </p>
              <ul className="text-xs text-slate-500 space-y-1 list-disc list-inside">
                <li>Upload images + caption files (.txt booru tags)</li>
                <li>LLM generates natural language additions</li>
                <li>Final caption = tags + LLM addition</li>
                <li>Optimized for Anima (CircleStone Labs 2B anime model)</li>
              </ul>
              <Button className="w-full mt-2">Start For Anima Mode</Button>
            </div>
          </button>
        </Card>
      </div>
    </div>
  );
}
