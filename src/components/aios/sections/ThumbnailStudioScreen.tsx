import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Eye, EyeOff, Image as ImageIcon, User } from "lucide-react";
import {
  EmptyState,
  Input,
  OutlineBtn,
  PrimaryBtn,
  SectionHeader,
  Tabs,
  Textarea,
} from "../ui";

type Format = "yt" | "reels";
type Align = "left" | "center" | "right";
type Pos = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

const STYLE_PRESETS = ["Studio", "Neon", "Gradient", "Office", "Abstract", "Outdoor"];

const SWATCHES: { id: string; label: string; value: string }[] = [
  { id: "fg", label: "Primary text", value: "var(--color-fg)" },
  { id: "lime", label: "Accent", value: "var(--color-lime)" },
  { id: "warn", label: "Warning", value: "var(--color-warn)" },
  { id: "err", label: "Error", value: "var(--color-err)" },
  { id: "mute", label: "Muted", value: "var(--color-mute)" },
  { id: "app", label: "Dark", value: "var(--color-app)" },
];

const POS_LABELS = [
  "Top left",
  "Top centre",
  "Top right",
  "Middle left",
  "Middle centre",
  "Middle right",
  "Bottom left",
  "Bottom centre",
  "Bottom right",
];

export function ThumbnailStudioScreen() {
  const [format, setFormat] = useState<Format>("yt");
  const [tab, setTab] = useState("background");

  const [showBg, setShowBg] = useState(true);
  const [showChar, setShowChar] = useState(true);
  const [showText, setShowText] = useState(true);

  const [prompt, setPrompt] = useState("");
  const [preset, setPreset] = useState<string | null>(null);

  const [charPos, setCharPos] = useState<Align>("right");
  const [charSize, setCharSize] = useState(70);
  const [charFlip, setCharFlip] = useState(false);

  const [headline, setHeadline] = useState("YOUR HEADLINE");
  const [subline, setSubline] = useState("");
  const [fontSize, setFontSize] = useState(9);
  const [pos, setPos] = useState<Pos>(4);
  const [align, setAlign] = useState<Align>("center");
  const [color, setColor] = useState(SWATCHES[0]!.id);
  const [outline, setOutline] = useState(true);
  const [selectedVariant, setSelectedVariant] = useState<number | null>(null);

  const hasCharacter = false;
  const colorValue = SWATCHES.find((s) => s.id === color)?.value ?? SWATCHES[0]!.value;
  const row = Math.floor(pos / 3);
  const col = pos % 3;

  const textStyle: React.CSSProperties = {
    color: colorValue,
    fontSize: `${fontSize}cqw`,
    textAlign: align,
    justifyContent: row === 0 ? "flex-start" : row === 1 ? "center" : "flex-end",
    alignItems: col === 0 ? "flex-start" : col === 1 ? "center" : "flex-end",
    textShadow: outline
      ? "0 2px 0 rgba(3,5,4,0.9), 0 0 14px rgba(3,5,4,0.85), 2px 2px 0 rgba(3,5,4,0.9)"
      : "none",
  };

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <SectionHeader
        title="Thumbnail Studio"
        subtitle="Compose a thumbnail from background, character and text layers."
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Stage */}
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap gap-2">
            <FormatBtn active={format === "yt"} onClick={() => setFormat("yt")}>
              16:9  YouTube
            </FormatBtn>
            <FormatBtn active={format === "reels"} onClick={() => setFormat("reels")}>
              9:16  Reels
            </FormatBtn>
          </div>

          <div className="grid place-items-center overflow-hidden rounded-xl border border-line bg-app p-4">
            <div
              className="relative w-full overflow-hidden rounded-lg border border-line2 bg-surface"
              style={{
                aspectRatio: format === "yt" ? "16 / 9" : "9 / 16",
                maxHeight: "min(60dvh, 520px)",
                maxWidth: "100%",
                containerType: "inline-size",
              } as React.CSSProperties}
            >
              {showBg && (
                <div className="absolute inset-0 grid place-items-center bg-[linear-gradient(135deg,var(--color-cardhi),var(--color-surface)_45%,var(--color-app))]">
                  <span className="text-xs text-mute">No background generated yet</span>
                </div>
              )}

              {showChar && hasCharacter && (
                <div
                  className="absolute bottom-0"
                  style={{
                    height: `${charSize}%`,
                    left: charPos === "left" ? "6%" : charPos === "center" ? "50%" : "auto",
                    right: charPos === "right" ? "6%" : "auto",
                    transform: `${charPos === "center" ? "translateX(-50%)" : ""} ${
                      charFlip ? "scaleX(-1)" : ""
                    }`,
                  }}
                >
                  <div className="h-full w-[40cqw] rounded-t-full bg-cardhi" />
                </div>
              )}

              {showText && (
                <div
                  className="absolute inset-0 flex flex-col gap-[1cqw] p-[5cqw] font-extrabold uppercase leading-[1.05]"
                  style={textStyle}
                >
                  <span className="w-full break-words">{headline}</span>
                  {subline && (
                    <span className="w-full break-words" style={{ fontSize: "0.55em", opacity: 0.9 }}>
                      {subline}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Generated backgrounds filmstrip — single row, never wraps, scrolls if it overflows */}
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-mute">
              Generated backgrounds
            </div>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {[0, 1, 2, 3].map((i) => {
                const isSelected = selectedVariant === i;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelectedVariant(isSelected ? null : i)}
                    aria-pressed={isSelected}
                    aria-label={`Variant ${i + 1}`}
                    className={`shrink-0 grid place-items-center rounded-lg border bg-surface outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:ring-offset-app ${
                      isSelected
                        ? "border-lime ring-2 ring-lime"
                        : "border-line hover:border-lime"
                    }`}
                    style={{
                      aspectRatio: format === "yt" ? "16 / 9" : "9 / 16",
                      height: "88px",
                    }}
                  >
                    <ImageIcon size={16} className="text-mute" />
                  </button>
                );
              })}
            </div>
            <p className="text-center text-xs text-mute">
              Generated options appear here
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <LayerToggle label="Background" on={showBg} onClick={() => setShowBg((v) => !v)} />
              <LayerToggle label="Character" on={showChar} onClick={() => setShowChar((v) => !v)} />
              <LayerToggle label="Text" on={showText} onClick={() => setShowText((v) => !v)} />
            </div>
            <div className="flex flex-wrap gap-2">
              <PrimaryBtn title="Not wired up yet">Download PNG</PrimaryBtn>
              <OutlineBtn title="Not wired up yet">Save to Library</OutlineBtn>
            </div>
          </div>
        </div>

        {/* Controls */}
        <aside className="aios-scroll max-h-[calc(100dvh-220px)] min-w-0 space-y-4 overflow-y-auto rounded-xl border border-line bg-cardx p-4 lg:sticky lg:top-4">
          <Tabs
            tabs={[
              { id: "background", label: "Background" },
              { id: "character", label: "Character" },
              { id: "text", label: "Text" },
            ]}
            active={tab}
            onChange={setTab}
          />

          {tab === "background" && (
            <div className="space-y-3">
              <Textarea
                rows={4}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the background — e.g. dark studio with neon rim light"
              />
              <div className="flex flex-wrap gap-2">
                {STYLE_PRESETS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPreset((v) => (v === p ? null : p))}
                    className={`h-8 rounded-full px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:ring-offset-app ${
                      preset === p
                        ? "bg-lime font-bold text-app"
                        : "border border-line text-fg2 hover:border-lime hover:text-lime"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <PrimaryBtn className="w-full" title="Not wired up yet">
                Generate background
              </PrimaryBtn>
            </div>
          )}

          {tab === "character" && (
            <div className="space-y-4">
              <EmptyState
                icon={<User size={20} />}
                title="No characters yet"
                description="Add a character cut-out to place it on your thumbnails."
                action={
                  <Link
                    to="/characters"
                    className="inline-flex h-10 items-center rounded-lg bg-lime px-4 text-sm font-bold text-app outline-none hover:bg-lime2 focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:ring-offset-app"
                  >
                    Go to Characters
                  </Link>
                }
              />
              <fieldset disabled className="space-y-3 opacity-50">
                <Field label="Position">
                  <Segmented
                    value={charPos}
                    onChange={setCharPos}
                    options={[
                      { id: "left", label: "Left" },
                      { id: "center", label: "Centre" },
                      { id: "right", label: "Right" },
                    ]}
                  />
                </Field>
                <Field label={`Size — ${charSize}%`}>
                  <input
                    type="range"
                    min={30}
                    max={100}
                    value={charSize}
                    onChange={(e) => setCharSize(Number(e.target.value))}
                    className="w-full accent-[var(--color-lime)]"
                    aria-label="Character size"
                  />
                </Field>
                <label className="flex items-center gap-2 text-sm text-fg2">
                  <input
                    type="checkbox"
                    checked={charFlip}
                    onChange={(e) => setCharFlip(e.target.checked)}
                    className="accent-[var(--color-lime)]"
                  />
                  Flip horizontally
                </label>
              </fieldset>
            </div>
          )}

          {tab === "text" && (
            <div className="space-y-3">
              <Field label="Headline">
                <Input
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  placeholder="Main headline"
                />
              </Field>
              <Field label="Second line (optional)">
                <Input
                  value={subline}
                  onChange={(e) => setSubline(e.target.value)}
                  placeholder="Supporting line"
                  className="h-9 text-xs"
                />
              </Field>
              <Field label={`Font size — ${fontSize}`}>
                <input
                  type="range"
                  min={4}
                  max={18}
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  className="w-full accent-[var(--color-lime)]"
                  aria-label="Font size"
                />
              </Field>
              <Field label="Position">
                <div className="grid w-[132px] grid-cols-3 gap-1.5">
                  {POS_LABELS.map((label, i) => (
                    <button
                      key={label}
                      type="button"
                      aria-label={label}
                      aria-pressed={pos === i}
                      onClick={() => setPos(i as Pos)}
                      className={`h-10 rounded-md border outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:ring-offset-app ${
                        pos === i
                          ? "border-lime bg-lime/20"
                          : "border-line bg-surface hover:border-lime"
                      }`}
                    />
                  ))}
                </div>
              </Field>
              <Field label="Alignment">
                <Segmented
                  value={align}
                  onChange={setAlign}
                  options={[
                    { id: "left", label: "Left" },
                    { id: "center", label: "Centre" },
                    { id: "right", label: "Right" },
                  ]}
                />
              </Field>
              <Field label="Colour">
                <div className="flex flex-wrap gap-2">
                  {SWATCHES.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      aria-label={s.label}
                      aria-pressed={color === s.id}
                      onClick={() => setColor(s.id)}
                      style={{ background: s.value }}
                      className={`h-8 w-8 rounded-full border outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:ring-offset-app ${
                        color === s.id ? "border-lime" : "border-line2"
                      }`}
                    />
                  ))}
                </div>
              </Field>
              <label className="flex items-center gap-2 text-sm text-fg2">
                <input
                  type="checkbox"
                  checked={outline}
                  onChange={(e) => setOutline(e.target.checked)}
                  className="accent-[var(--color-lime)]"
                />
                Outline / shadow
              </label>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold uppercase tracking-wide text-mute">{label}</div>
      {children}
    </div>
  );
}

function FormatBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-9 rounded-full px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:ring-offset-app ${
        active
          ? "bg-lime font-bold text-app"
          : "border border-line text-fg2 hover:border-lime hover:text-lime"
      }`}
    >
      {children}
    </button>
  );
}

function LayerToggle({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:ring-offset-app ${
        on ? "border-lime text-lime" : "border-line text-mute"
      }`}
    >
      {on ? <Eye size={14} /> : <EyeOff size={14} />}
      {label}
    </button>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-lg border border-line p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={`h-8 rounded-md px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:ring-offset-app ${
            value === o.id ? "bg-lime font-bold text-app" : "text-fg2 hover:text-lime"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
