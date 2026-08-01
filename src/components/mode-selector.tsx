/**
 * Mode selection screen - lets the user choose between For Anima and Krea 2 modes.
 */

"use client";

import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface ModeSelectorProps {
  serverUrl: string;
  onModeSelected: (mode: "for-anima" | "krea-2") => void;
}

export function ModeSelector({ onModeSelected }: ModeSelectorProps) {
  const { setMode } = useSession();

  const handleSelect = (mode: "for-anima" | "krea-2") => {
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
        {/* For Anima Mode */}
        <Card variant="elevated" className="cursor-pointer hover:border-indigo-500 transition-colors">
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

        {/* Krea 2 Mode */}
        <Card variant="elevated" className="cursor-pointer hover:border-indigo-500 transition-colors">
          <button
            onClick={() => handleSelect("krea-2")}
            className="w-full text-left"
          >
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl">K</span>
                <h3 className="text-lg font-semibold text-slate-100">Krea 2 Mode</h3>
              </div>
              <p className="text-sm text-slate-400">
                Three-phase captioning for character-consistent image sets.
                Phase 1 captions each image, Phase 2 removes character-consistent
                features, and Phase 3 distills the result into a concise krea2
                prompt. Each image goes through all 3 phases as a single
                multi-turn conversation.
              </p>
              <ul className="text-xs text-slate-500 space-y-1 list-disc list-inside">
                <li>Phase 1: caption each image individually</li>
                <li>Phase 2: per-image refinement (remove consistent features)</li>
                <li>Phase 3: distill to a concise krea2 prompt (60-150 words)</li>
                <li>Requires character description for refinement</li>
              </ul>
              <Button className="w-full mt-2">Start Krea 2 Mode</Button>
            </div>
          </button>
        </Card>
      </div>
    </div>
  );
}
