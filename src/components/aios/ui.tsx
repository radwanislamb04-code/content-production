import type { ReactNode } from "react";

export function Card({
  className = "",
  children,
  elevated = false,
}: {
  className?: string;
  children: ReactNode;
  elevated?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-line ${
        elevated ? "bg-cardhi" : "bg-cardx"
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function Pill({
  children,
  active = false,
  variant = "default",
  className = "",
}: {
  children: ReactNode;
  active?: boolean;
  variant?: "default" | "accent" | "warn" | "err";
  className?: string;
}) {
  const styles = active
    ? "bg-lime text-app border border-lime"
    : variant === "accent"
    ? "bg-[rgba(82,255,46,0.1)] border border-[rgba(82,255,46,0.3)] text-lime"
    : variant === "warn"
    ? "bg-[rgba(246,196,83,0.1)] border border-[rgba(246,196,83,0.3)] text-warn"
    : variant === "err"
    ? "bg-[rgba(255,93,93,0.1)] border border-[rgba(255,93,93,0.3)] text-err"
    : "bg-surface border border-line text-fg2";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs ${styles} ${className}`}
    >
      {children}
    </span>
  );
}

export function PrimaryBtn({
  children,
  className = "",
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-lime px-5 text-sm font-bold text-app transition-colors hover:bg-lime2 ${className}`}
    >
      {children}
    </button>
  );
}

export function OutlineBtn({
  children,
  className = "",
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-line bg-transparent px-4 text-sm font-semibold text-fg2 transition-colors hover:border-lime hover:text-lime ${className}`}
    >
      {children}
    </button>
  );
}

export function GhostBtn({
  children,
  className = "",
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold text-lime transition-colors hover:bg-[rgba(82,255,46,0.08)] ${className}`}
    >
      {children}
    </button>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-10 w-full rounded-lg border border-line bg-surface px-3.5 text-sm text-fg placeholder:text-mute outline-none transition-all focus:border-lime focus:shadow-[0_0_0_2px_rgba(82,255,46,0.15)] ${props.className ?? ""}`}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-lg border border-line bg-surface p-4 text-sm leading-relaxed text-fg placeholder:text-mute outline-none transition-all focus:border-lime focus:shadow-[0_0_0_2px_rgba(82,255,46,0.15)] ${props.className ?? ""}`}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-fg outline-none focus:border-lime ${props.className ?? ""}`}
    />
  );
}

export function SectionHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4">
      <div className="min-w-0">
        <h1 className="text-[clamp(1.5rem,6vw,1.75rem)] font-bold text-fg">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-mute">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function SkeletonRow({ className = "" }: { className?: string }) {
  return (
    <div
      className={`aios-pulse rounded-md bg-cardhi ${className || "h-4 w-full"}`}
    />
  );
}

export function SkeletonList({
  rows = 4,
  height = 44,
}: {
  rows?: number;
  height?: number;
}) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="aios-pulse rounded-lg bg-cardhi"
          style={{ height }}
        />
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="aios-pulse rounded-xl border border-line bg-cardhi"
          style={{ height: 168 }}
        />
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  message,
  action,
}: {
  icon?: ReactNode;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line bg-surface px-6 py-10 text-center">
      {icon && <div className="text-mute">{icon}</div>}
      <p className="max-w-sm text-sm text-mute">{message}</p>
      {action}
    </div>
  );
}

