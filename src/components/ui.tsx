"use client";

import { useState, type ReactNode } from "react";

export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`glass rounded-2xl p-4 sm:p-5 ${className}`}>{children}</div>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-gold/80">
      {children}
    </h3>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1.5">
      <span className="flex min-w-0 flex-col">
        <span className="text-sm text-slate-200">{label}</span>
        {hint ? <span className="text-xs text-slate-500">{hint}</span> : null}
      </span>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors ${
          checked ? "border-gold bg-gold text-black" : "border-slate-600 bg-transparent text-transparent"
        }`}
      >
        <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
          <path
            d="M4 10.5l4 4 8-9"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </label>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  min,
  step = 1,
  placeholder,
  disabled,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  step?: number;
  placeholder?: string;
  disabled?: boolean;
}) {
  // While the field is focused we keep the raw text the user is typing so that
  // clearing it stays empty instead of snapping back to 0/min. When blurred we
  // show the controlled value from props.
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");
  const display = focused ? draft : value == null ? "" : String(value);

  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-slate-400">{label}</span>
      <input
        type="number"
        value={display}
        min={min}
        step={step}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => {
          setDraft(value == null ? "" : String(value));
          setFocused(true);
        }}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          const v = e.target.value;
          setDraft(v);
          onChange(v === "" ? null : Number(v));
        }}
        className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100 outline-none focus:border-gold/60 disabled:opacity-50"
      />
    </label>
  );
}

export function GoldButton({
  children,
  onClick,
  disabled,
  className = "",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={!!disabled}
      className={`btn-gold rounded-xl px-5 py-2.5 text-sm ${className}`}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
  disabled,
  active,
  size = "md",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const pad = size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!!disabled}
      className={`rounded-xl border ${pad} transition-colors disabled:opacity-40 ${
        active
          ? "border-gold/60 bg-gold/15 text-gold"
          : "border-white/10 bg-white/5 text-slate-200 hover:border-white/25"
      } ${className}`}
    >
      {children}
    </button>
  );
}
