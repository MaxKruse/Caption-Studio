/**
 * Card container with grey theme styling.
 */

"use client";

import type { ReactNode, HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  variant?: "default" | "elevated";
}

export function Card({
  variant = "default",
  className = "",
  children,
  ...props
}: CardProps) {
  const variantStyles = {
    default: "bg-slate-800/60 border-slate-700",
    elevated: "bg-slate-700/60 border-slate-600",
  };

  return (
    <div
      className={`rounded-xl border ${variantStyles[variant]} p-4 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
