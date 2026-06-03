"use client";

// ---------------------------------------------------------------------------
// AppHeader — site header with branding, tagline, and step indicator
// ---------------------------------------------------------------------------

import { useStudioStore } from "@/store/studioStore";
import { StepIndicator } from "./StepIndicator";

export function AppHeader() {
  const workflowStep = useStudioStore((state) => state.workflowStep);

  return (
    <header className="border-b border-zinc-200">
      {/* Branding row */}
      <div className="px-6 pt-8 pb-4">
        <div className="flex items-center gap-3 mb-1">
          {/* Logo mark */}
          <div className="w-9 h-9 rounded-lg bg-zinc-900 flex items-center justify-center">
            <svg
              className="w-5 h-5 text-zinc-100"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-zinc-900 tracking-tight leading-none">
              Caption Studio
            </h1>
            <p className="text-xs text-zinc-400 mt-0.5">
              Batch image captioning for character LoRA training
            </p>
          </div>
        </div>
      </div>

      {/* Step indicator */}
      <div className="px-6 pb-4">
        <StepIndicator currentStep={workflowStep} />
      </div>
    </header>
  );
}
