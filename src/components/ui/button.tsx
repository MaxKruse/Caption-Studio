/**
 * Primary action button with grey theme styling.
 */

"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  disabled,
  ...props
}: ButtonProps) {
  const baseStyles =
    "font-medium rounded-lg transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer";

  const variantStyles = {
    primary:
      "bg-indigo-600 hover:bg-indigo-500 text-white disabled:bg-indigo-800 disabled:text-slate-400",
    secondary:
      "bg-slate-700 hover:bg-slate-600 text-slate-100 disabled:bg-slate-800 disabled:text-slate-500",
    ghost:
      "bg-transparent hover:bg-slate-700/50 text-slate-300 hover:text-slate-100 disabled:text-slate-600",
    danger:
      "bg-red-600/80 hover:bg-red-500 text-white disabled:bg-red-900 disabled:text-red-300",
  };

  const sizeStyles = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-2 text-base",
    lg: "px-6 py-3 text-lg",
  };

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className} ${
        disabled ? "cursor-not-allowed opacity-60" : ""
      }`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
