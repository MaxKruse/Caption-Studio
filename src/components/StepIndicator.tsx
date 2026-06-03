"use client";

// ---------------------------------------------------------------------------
// StepIndicator — visual progress stepper for the captioning pipeline
//
// Shows all 6 steps with completed/current/pending states.
// Steps: Configure → Upload → Detect → Crop → Caption → Results
// ---------------------------------------------------------------------------

import type { WorkflowStep } from "./CaptionStudioTypes";

const STEPS = [
  { id: "configure" as const, label: "Configure", icon: "⚙" },
  { id: "upload" as const, label: "Upload", icon: "↑" },
  { id: "detect" as const, label: "Detect", icon: "⌕" },
  { id: "crop" as const, label: "Crop", icon: "⬔" },
  { id: "caption" as const, label: "Caption", icon: "✎" },
  { id: "done" as const, label: "Results", icon: "✓" },
] as const;

const STEP_ORDER = STEPS.map((s) => s.id);

function getStepIndex(step: WorkflowStep): number {
  const idx = STEP_ORDER.indexOf(step);
  return idx >= 0 ? idx : 0;
}

export function StepIndicator({ currentStep }: { currentStep: WorkflowStep }) {
  const currentIndex = getStepIndex(currentStep);

  return (
    <nav aria-label="Workflow progress" className="w-full">
      <ol className="flex items-center w-full">
        {STEPS.map((step, index) => {
          const stepIndex = getStepIndex(step.id);
          const isCompleted = currentIndex > stepIndex;
          const isCurrent = currentIndex === stepIndex;

          return (
            <li key={step.id} className="flex items-center flex-1 last:flex-none">
              {/* Step circle + label */}
              <div
                className={`flex items-center gap-1.5 group ${
                  index > 0 ? "pl-1 sm:pl-3" : ""
                }`}
              >
                <div className="flex flex-col items-center gap-1">
                  {/* Circle */}
                  <div
                    className={`
                      w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs font-semibold
                      transition-all duration-300 border-2
                      ${
                        isCompleted
                          ? "bg-zinc-900 border-zinc-900 text-zinc-100"
                          : isCurrent
                            ? "bg-white border-zinc-900 text-zinc-900 animate-pulse-ring"
                            : "bg-zinc-100 border-zinc-200 text-zinc-400"
                      }
                    `}
                  >
                    {isCompleted ? "✓" : step.icon}
                  </div>

                  {/* Label — hidden on small mobile, shown on sm+ */}
                  <span
                    className={`
                      hidden sm:block text-[10px] font-medium uppercase tracking-wider
                      ${
                        isCurrent
                          ? "text-zinc-900"
                          : isCompleted
                            ? "text-zinc-600"
                            : "text-zinc-400"
                      }
                    `}
                  >
                    {step.label}
                  </span>
                </div>
              </div>

              {/* Connector line to next step */}
              {index < STEPS.length - 1 && (
                <div className="flex-1 mx-0.5 sm:mx-2 h-0.5">
                  <div
                    className={`
                      h-full rounded-full transition-colors duration-300
                      ${
                        isCompleted
                          ? "bg-zinc-900"
                          : "bg-zinc-200"
                      }
                    `}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
