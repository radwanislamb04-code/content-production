import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  type Appearance,
  getAppearance,
  loadAppearance,
  saveAppearance,
} from "@/lib/appearance";
import { FOCUS_RING } from "../ui";

/**
 * Settings → Appearance.
 *
 * Each row writes straight through to /api/appearance and is applied
 * immediately, so what you pick is what you see. Every option is read by a real
 * screen (see lib/appearance.ts) — there are no decorative controls here.
 */

type Choice<T extends string> = { value: T; label: string; hint: string };

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-line py-4 last:border-0">
      <div className="text-sm font-semibold text-fg">{label}</div>
      <div className="mt-0.5 text-xs text-mute">{hint}</div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T;
  options: Choice<T>[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            title={o.hint}
            onClick={() => onChange(o.value)}
            className={`h-9 rounded-full px-4 text-sm transition-colors ${FOCUS_RING} ${
              active
                ? "bg-lime font-bold text-app"
                : "border border-line text-fg2 hover:border-lime hover:text-lime"
            } disabled:opacity-50`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function AppearancePanel() {
  const [value, setValue] = useState<Appearance>(() => getAppearance());
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadAppearance().then((a) => {
      if (!cancelled) {
        setValue(a);
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = async (patch: Partial<Appearance>) => {
    setBusy(true);
    // Optimistic: saveAppearance applies it to the document first, so the
    // theme flips instantly rather than after the round trip.
    const res = await saveAppearance(patch);
    setValue(res.appearance);
    setBusy(false);
    if (!res.ok) toast.error(res.error ?? "Could not save appearance");
  };

  return (
    <div>
      <div className="mb-2">
        <h2 className="text-base font-semibold text-fg">Appearance</h2>
        <p className="mt-0.5 text-sm text-mute">
          Saved to your account, so these follow you to any browser.
          {ready ? "" : " Loading…"}
        </p>
      </div>

      <Row
        label="Theme"
        hint="Both palettes are defined in styles.css; System follows your OS setting."
      >
        <Segmented
          value={value.theme}
          disabled={busy}
          onChange={(theme) => update({ theme })}
          options={[
            { value: "dark", label: "Dark", hint: "The original dark palette" },
            { value: "light", label: "Light", hint: "Light surfaces, darker green" },
            { value: "system", label: "System", hint: "Match your OS preference" },
          ]}
        />
      </Row>

      <Row
        label="Sidebar on load"
        hint="Which nav groups start open. You can still open and close them by hand — that choice is remembered per browser."
      >
        <Segmented
          value={value.sidebarDefault}
          disabled={busy}
          onChange={(sidebarDefault) => update({ sidebarDefault })}
          options={[
            { value: "expanded", label: "Expanded", hint: "Open the groups that default to open" },
            { value: "collapsed", label: "Collapsed", hint: "Start with every group closed" },
          ]}
        />
      </Row>

      <Row
        label="Thumbnail format"
        hint="The format Thumbnail Studio opens with."
      >
        <Segmented
          value={value.thumbnailFormat}
          disabled={busy}
          onChange={(thumbnailFormat) => update({ thumbnailFormat })}
          options={[
            { value: "yt", label: "YouTube", hint: "16:9" },
            { value: "reels", label: "Reels / Shorts", hint: "9:16" },
          ]}
        />
      </Row>

      <Row
        label="Clock timezone"
        hint="The pipeline schedules in Asia/Dhaka. Daily Brief and Brief History show times in this zone."
      >
        <Segmented
          value={value.timeDisplay}
          disabled={busy}
          onChange={(timeDisplay) => update({ timeDisplay })}
          options={[
            { value: "dhaka", label: "Asia/Dhaka", hint: "Matches the schedule (08:00 / 20:00)" },
            { value: "local", label: "This browser", hint: "Use your device's timezone" },
          ]}
        />
      </Row>

      <Row
        label="Reduce motion"
        hint="Nearly eliminates transitions and animations (also a CSS rule, so it applies immediately)."
      >
        <label className="flex cursor-pointer items-center gap-2 text-sm text-fg2">
          <input
            type="checkbox"
            checked={value.reduceMotion}
            disabled={busy}
            onChange={(e) => update({ reduceMotion: e.target.checked })}
            className="accent-[var(--color-lime)]"
          />
          Reduce motion and animations
        </label>
      </Row>
    </div>
  );
}
