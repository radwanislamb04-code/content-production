import type { ReactNode } from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Loader2, AlertTriangle, Check, Copy } from "lucide-react";

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:ring-offset-app";

export function Spinner({ size = 15 }: { size?: number }) {
  return (
    <Loader2
      size={size}
      role="status"
      aria-label="Loading"
      className="animate-spin"
    />
  );
}

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

type BtnProps = {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  title?: string;
};

export function PrimaryBtn({
  children,
  className = "",
  onClick,
  disabled = false,
  loading = false,
  title,
}: BtnProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      title={title}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-lime px-5 text-sm font-bold text-app transition-colors hover:bg-lime2 ${FOCUS_RING} disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function OutlineBtn({
  children,
  className = "",
  onClick,
  disabled = false,
  loading = false,
  title,
}: BtnProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      title={title}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-line bg-transparent px-4 text-sm font-semibold text-fg2 transition-colors hover:border-lime hover:text-lime ${FOCUS_RING} disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {loading && <Spinner size={14} />}
      {children}
    </button>
  );
}

export function GhostBtn({
  children,
  className = "",
  onClick,
  disabled = false,
  loading = false,
  title,
}: BtnProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      title={title}
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold text-lime transition-colors hover:bg-[rgba(82,255,46,0.08)] ${FOCUS_RING} disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {loading && <Spinner size={13} />}
      {children}
    </button>
  );
}


export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-10 w-full rounded-lg border border-line bg-surface px-3.5 text-sm text-fg placeholder:text-mute outline-none transition-all focus:border-lime focus:shadow-[0_0_0_2px_rgba(82,255,46,0.15)] focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:ring-offset-app ${props.className ?? ""}`}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-lg border border-line bg-surface p-4 text-sm leading-relaxed text-fg placeholder:text-mute outline-none transition-all focus:border-lime focus:shadow-[0_0_0_2px_rgba(82,255,46,0.15)] focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:ring-offset-app ${props.className ?? ""}`}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-fg outline-none focus:border-lime focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:ring-offset-app ${props.className ?? ""}`}
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
    <div className="mb-5 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 sm:mb-6 sm:gap-4">
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
  title,
  description,
  message,
  action,
}: {
  icon?: ReactNode;
  title?: string;
  description?: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line bg-surface px-6 py-10 text-center">
      {icon && <div className="text-mute">{icon}</div>}
      {title && <div className="text-sm font-semibold text-fg">{title}</div>}
      {(description ?? message) && (
        <p className="max-w-sm text-sm text-mute">{description ?? message}</p>
      )}
      {action}
    </div>
  );
}


export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    focusables()[0]?.focus() ?? panelRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      triggerRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative z-10 max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-xl border border-line bg-cardx p-5 outline-none"
      >
        <h2 id={titleId} className="text-[15px] font-semibold text-fg">
          {title}
        </h2>
        <div className="mt-4 text-sm text-fg2">{children}</div>
        {footer && (
          <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div>
        )}
      </div>
    </div>
  );
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}) {
  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === active);
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const tab = tabs[next];
    if (tab) onChange(tab.id);
  };

  return (
    <div role="tablist" className="flex flex-wrap gap-2" onKeyDown={onKeyDown}>
      {tabs.map((t) => {
        const selected = t.id === active;
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={`h-9 rounded-full px-4 text-sm ${FOCUS_RING} ${
              selected
                ? "bg-lime font-bold text-app"
                : "border border-line text-fg2 hover:border-lime hover:text-lime"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export function Tooltip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span aria-describedby={id} className="inline-flex">
        {children}
      </span>
      <span
        id={id}
        role="tooltip"
        className={`pointer-events-none absolute bottom-full left-1/2 z-40 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-cardhi px-2 py-1 text-xs text-fg2 transition-opacity ${
          open ? "opacity-100" : "opacity-0"
        }`}
      >
        {label}
      </span>
    </span>
  );
}

export function Progress({ value, label }: { value: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div>
      {label && (
        <div className="mb-1.5 flex items-center justify-between text-xs text-mute">
          <span>{label}</span>
          <span>{Math.round(pct)}%</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Progress"}
        className="h-2 w-full overflow-hidden rounded-full bg-surface"
      >
        <div
          className="h-full rounded-full bg-lime transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export type TableColumn<Row> = {
  key: string;
  header: string;
  width?: string | number;
  align?: "left" | "center" | "right";
  render?: (row: Row) => ReactNode;
};

export function Table<Row extends Record<string, any>>({
  columns,
  rows,
  empty,
}: {
  columns: TableColumn<Row>[];
  rows: Row[];
  empty?: ReactNode;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  return (
    <div className="aios-scroll max-h-[70dvh] w-full overflow-auto rounded-xl border border-line">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-cardhi">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                style={{ width: c.width, textAlign: c.align ?? "left" }}
                className="border-b border-line px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-mute"
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-line last:border-0">
              {columns.map((c) => (
                <td
                  key={c.key}
                  style={{ textAlign: c.align ?? "left" }}
                  className="px-4 py-3 text-fg2"
                >
                  {c.render ? c.render(row) : (row[c.key] as ReactNode)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}) {
  const styles =
    tone === "success"
      ? "bg-[rgba(82,255,46,0.1)] border border-[rgba(82,255,46,0.3)] text-lime"
      : tone === "warning"
      ? "bg-[rgba(246,196,83,0.1)] border border-[rgba(246,196,83,0.3)] text-warn"
      : tone === "danger"
      ? "bg-[rgba(255,93,93,0.1)] border border-[rgba(255,93,93,0.3)] text-err"
      : tone === "info"
      ? "bg-cardhi border border-line2 text-fg"
      : "bg-surface border border-line text-fg2";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs ${styles}`}
    >
      {children}
    </span>
  );
}

export function ErrorState({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 rounded-xl border border-[rgba(255,93,93,0.3)] bg-surface px-6 py-10 text-center"
    >
      <div className="text-err">
        <AlertTriangle size={22} />
      </div>
      <div className="text-sm font-semibold text-fg">{title}</div>
      <p className="max-w-sm text-sm text-mute">{message}</p>
      {onRetry && <OutlineBtn onClick={onRetry}>Try again</OutlineBtn>}
    </div>
  );
}

export function Skeleton({
  width,
  height = 16,
  rounded = "0.5rem",
}: {
  width?: string | number;
  height?: string | number;
  rounded?: string | number;
}) {
  return (
    <div
      aria-hidden="true"
      className="aios-pulse bg-cardhi"
      style={{ width: width ?? "100%", height, borderRadius: rounded }}
    />
  );
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    navigator.clipboard.writeText(value).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  }, [value]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <>
      <GhostBtn onClick={copy}>
        {copied ? <Check size={13} /> : <Copy size={13} />}
        {copied ? "Copied" : label}
      </GhostBtn>
      <span aria-live="polite" className="sr-only">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </>
  );
}
