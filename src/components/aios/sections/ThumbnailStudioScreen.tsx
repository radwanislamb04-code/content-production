import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Eye, EyeOff, Image as ImageIcon, User } from "lucide-react";
import {
  EmptyState,
  Input,
  OutlineBtn,
  PrimaryBtn,
  SectionHeader,
  Select,
  Tabs,
  Textarea,
} from "../ui";

type Format = "yt" | "reels";
type Align = "left" | "center" | "right";
type Pos = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

const STYLE_PRESETS = ["Studio", "Neon", "Gradient", "Office", "Abstract", "Outdoor"];

// Image-generation providers. The first two (workers-ai, vyceai) generate
// inside the app via /api/generate-image — url is null so the chip
// handler does not open a new tab. The last three open an external site
// in a new tab and copy the prompt to the clipboard.
const SITES = [
  { id: "workers-ai", label: "Workers AI", url: null },
  { id: "vyceai", label: "VyceAI (Custom)", url: null },
  { id: "gemini", label: "Gemini", url: "https://gemini.google.com/app" },
  { id: "chatgpt", label: "ChatGPT (Plus)", url: "https://chatgpt.com/" },
  {
    id: "arena",
    label: "arena.ai",
    url: "https://arena.ai/image/side-by-side?model_a=seedream-5.0-pro&model_b=gpt-image-1",
  },
] as const;
type SiteKey = (typeof SITES)[number]["id"];

const AI_MODEL_OPTIONS = [
  "@cf/black-forest-labs/flux-2-klein-4b",
  "@cf/black-forest-labs/flux-2-dev",
  "@cf/black-forest-labs/flux-2-klein-9b",
];
const DEFAULT_AI_MODEL = AI_MODEL_OPTIONS[0];

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

  // Site picker for "Generate background" — defaults to Workers AI
  // (in-app, no key required, free).
  const [site, setSite] = useState<SiteKey>("workers-ai");
  // Per-tile uploaded image (blob: or data: or http(s): URL).
  const [variantImages, setVariantImages] = useState<Record<number, string>>({});
  // Image URL input row.
  const [imageUrl, setImageUrl] = useState("");
  // Fallback shown in a visible textarea when navigator.clipboard fails.
  const [clipboardFallback, setClipboardFallback] = useState<string | null>(null);
  // Inline hint after the user clicks "Generate background" (external sites).
  const [showGenerateHint, setShowGenerateHint] = useState(false);
  // Which tile is currently being dragged over (for the border highlight).
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  // Refs to each tile's hidden file input so the tile's onClick can open it.
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  // Workers AI model — default is the smallest flux-2 variant, can be
  // overridden by the user's Settings → Image Generation preference.
  const [aiModel, setAiModel] = useState<string>(DEFAULT_AI_MODEL);
  // "Generating..." state and the last error / success hint for the
  // in-app providers (workers-ai, vyceai).
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [inAppHint, setInAppHint] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings-imagegen")
      .then((r) => r.json())
      .then((data) => {
        if (data?.defaultModel) setAiModel(data.defaultModel);
      })
      .catch(() => {
        /* ignore — local dev may not have the route wired up */
      });
  }, []);

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

  // URL of the currently-active background image, or null to show the
  // gradient placeholder. Derived from the selected variant's upload.
  const backgroundImage =
    selectedVariant !== null && variantImages[selectedVariant]
      ? variantImages[selectedVariant]
      : null;

  const siteUrl = SITES.find((s) => s.id === site)?.url ?? null;

  // CHANGE 1 + STEP 4 — Generate background:
  //   - In-app providers (workers-ai, vyceai): POST /api/generate-image,
  //     load the returned data URL into the selected tile (or tile 0).
  //   - External providers (gemini, chatgpt, arena): copy the prompt to the
  //     clipboard, open the site in a new tab, show an inline hint.
  const handleGenerate = async () => {
    const text = prompt || "";
    setGenerateError(null);
    setInAppHint(null);

    // In-app providers
    if (site === "workers-ai" || site === "vyceai") {
      if (!text) {
        setGenerateError("Write a prompt first");
        return;
      }
      setGenerating(true);
      try {
        const res = await fetch("/api/generate-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: text,
            provider: site,
            model: site === "workers-ai" ? aiModel : undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data?.ok) {
          setGenerateError(
            data?.error ?? `Generate failed (HTTP ${res.status})`
          );
          return;
        }
        const targetIndex = selectedVariant ?? 0;
        setVariantImages((prev) => {
          const prior = prev[targetIndex];
          if (prior?.startsWith("blob:")) {
            try { URL.revokeObjectURL(prior); } catch { /* noop */ }
          }
          return { ...prev, [targetIndex]: data.url };
        });
        setSelectedVariant(targetIndex);
        setInAppHint(
          "Image ready — edit the headline and download PNG."
        );
      } catch (err: any) {
        setGenerateError(
          `Generate failed: ${err?.message ?? String(err)}`
        );
      } finally {
        setGenerating(false);
      }
      return;
    }

    // External providers
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch {
      copied = false;
    }
    if (!copied) {
      setClipboardFallback(text);
    } else {
      setClipboardFallback(null);
    }
    if (siteUrl) {
      window.open(siteUrl, "_blank", "noopener,noreferrer");
    }
    setShowGenerateHint(true);
  };

  // CHANGE 2 — Tile upload: read a dropped/picked file, store its blob URL,
  // and auto-select the tile. Replaces any prior blob URL for the same tile
  // (revoked to avoid leaks). Rejects non-image files.
  const handleFileSelect = (index: number, file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    const prior = variantImages[index];
    if (prior?.startsWith("blob:")) {
      try { URL.revokeObjectURL(prior); } catch { /* noop */ }
    }
    setVariantImages((prev) => ({ ...prev, [index]: url }));
    setSelectedVariant(index);
  };

  // CHANGE 2 — Clear button on a tile: revoke the blob URL and deselect.
  const handleClearTile = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const prior = variantImages[index];
    if (prior?.startsWith("blob:")) {
      try { URL.revokeObjectURL(prior); } catch { /* noop */ }
    }
    setVariantImages((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
    if (selectedVariant === index) setSelectedVariant(null);
  };

  // CHANGE 2 — Click on a tile: select it, then open its file picker.
  const handleTileClick = (index: number) => {
    setSelectedVariant(index);
    fileInputRefs.current[index]?.click();
  };

  // CHANGE 3 — URL submit: load the URL into the selected tile (or tile 0
  // if nothing is selected). Validates that the URL looks reasonable
  // (http(s) or data:). The actual fetch is implicit when the <img> renders.
  const handleUrlSubmit = () => {
    const url = imageUrl.trim();
    if (!url) return;
    if (!/^(https?:\/\/|data:)/i.test(url)) return;
    const targetIndex = selectedVariant ?? 0;
    setVariantImages((prev) => ({ ...prev, [targetIndex]: url }));
    setSelectedVariant(targetIndex);
    setImageUrl("");
  };

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <SectionHeader
        title="Thumbnail Studio"
        subtitle="Compose a thumbnail from background, character and text layers."
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Stage */}
        <div className="min-w-0 space-y-2">
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
                maxHeight: "min(48dvh, 420px)",
                maxWidth: "100%",
                containerType: "inline-size",
              } as React.CSSProperties}
            >
              {showBg && (
                <div className="absolute inset-0 grid place-items-center overflow-hidden bg-[linear-gradient(135deg,var(--color-cardhi),var(--color-surface)_45%,var(--color-app))]">
                  {backgroundImage ? (
                    <img
                      src={backgroundImage}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-xs text-mute">No background generated yet</span>
                  )}
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
                const img = variantImages[i];
                return (
                  <div
                    key={i}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                    aria-label={`Variant ${i + 1}${img ? " (image loaded)" : ""}`}
                    onClick={() => handleTileClick(i)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleTileClick(i);
                      }
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverIndex(i);
                    }}
                    onDragLeave={() =>
                      setDragOverIndex((cur) => (cur === i ? null : cur))
                    }
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverIndex(null);
                      handleFileSelect(i, e.dataTransfer.files?.[0]);
                    }}
                    className={`relative shrink-0 cursor-pointer overflow-hidden rounded-lg border bg-surface outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:ring-offset-app ${
                      isSelected
                        ? "border-lime ring-2 ring-lime"
                        : dragOverIndex === i
                          ? "border-lime"
                          : "border-line hover:border-lime"
                    }`}
                    style={{
                      aspectRatio: format === "yt" ? "16 / 9" : "9 / 16",
                      height: "64px",
                    }}
                  >
                    <input
                      ref={(el) => {
                        fileInputRefs.current[i] = el;
                      }}
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => handleFileSelect(i, e.target.files?.[0])}
                    />
                    {img ? (
                      <img
                        src={img}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <ImageIcon size={16} className="text-mute" />
                      </div>
                    )}
                    {img && (
                      <button
                        type="button"
                        onClick={(e) => handleClearTile(i, e)}
                        className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full border border-line bg-app/80 text-[10px] text-fg2 outline-none hover:border-err hover:text-err focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-1 focus-visible:ring-offset-app"
                        aria-label={`Clear image on variant ${i + 1}`}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-center text-xs text-mute">
              Generated options appear here
            </p>
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-[11px] uppercase tracking-wide text-mute">
                Or paste an image URL
              </span>
              <Input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleUrlSubmit();
                }}
                placeholder="https://…"
                className="h-9 flex-1 text-xs"
              />
              <OutlineBtn onClick={handleUrlSubmit}>Use</OutlineBtn>
            </div>
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
        <aside className="aios-scroll max-h-[calc(100dvh-180px)] min-w-0 space-y-3 overflow-y-auto rounded-xl border border-line bg-cardx p-3 lg:sticky lg:top-16">
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
            <div className="space-y-2">
              <Textarea
                rows={3}
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
              <div className="flex flex-wrap gap-2">
                {SITES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSite(s.id)}
                    aria-pressed={site === s.id}
                    className={`h-8 rounded-full px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:ring-offset-app ${
                      site === s.id
                        ? "bg-lime font-bold text-app"
                        : "border border-line text-fg2 hover:border-lime hover:text-lime"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              {site === "workers-ai" && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-mute">
                    Model
                  </div>
                  <Select
                    value={aiModel}
                    onChange={(e) => setAiModel(e.target.value)}
                    className="text-xs"
                    aria-label="Workers AI model"
                  >
                    {AI_MODEL_OPTIONS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              <p className="text-[11px] text-mute">
                Workers AI and VyceAI generate inside the app; Gemini, ChatGPT
                and arena.ai open in a new tab.
              </p>
              <PrimaryBtn
                className="w-full"
                onClick={handleGenerate}
                disabled={generating}
              >
                {generating ? "Generating…" : "Generate background"}
              </PrimaryBtn>
              {generateError && (
                <p className="text-[11px] text-err">{generateError}</p>
              )}
              {inAppHint && (
                <p className="text-[11px] text-mute">{inAppHint}</p>
              )}
              {showGenerateHint && (
                <p className="text-[11px] text-mute">
                  Prompt copied — paste it into the opened site, generate, then download the image and drop it onto a background tile below.
                </p>
              )}
              {clipboardFallback !== null && (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-warn">
                    Clipboard write failed — copy the prompt manually:
                  </p>
                  <Textarea
                    readOnly
                    value={clipboardFallback}
                    rows={3}
                    className="text-xs"
                  />
                </div>
              )}
            </div>
          )}

          {tab === "character" && (
            <div className="space-y-3">
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
            <div className="space-y-2">
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
