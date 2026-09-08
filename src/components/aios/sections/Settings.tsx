import { useEffect, useState } from "react";
import { Badge, Card, Input, OutlineBtn, Progress, Select, Tooltip } from "../ui";
import { Eye, EyeOff, Save, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Characters } from "./Characters";


const NAV = ["API Keys", "Instagram", "Telegram", "Schedule", "Characters", "Appearance"];

type Slot = {
  id: number;
  label: string;
  job: string;
  cap: number;
};

const JOBS = [
  "Instagram competitor",
  "Instagram hashtag",
  "TikTok",
  "X (Twitter)",
  "Overflow only",
];

const INITIAL_SLOTS: Slot[] = [
  { id: 1, label: "Radwan", job: "Instagram competitor", cap: 4.5 },
  { id: 2, label: "Partner A", job: "Instagram hashtag", cap: 4.5 },
  { id: 3, label: "Partner B", job: "TikTok", cap: 4.5 },
  { id: 4, label: "Partner C", job: "X (Twitter)", cap: 4.5 },
];

export function Settings() {
  const [tab, setTab] = useState(NAV[0]);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
      <Card className="p-2">
        {NAV.map((n) => (
          <button
            key={n}
            onClick={() => setTab(n)}
            className={`flex w-full items-center rounded-md px-3 py-2 text-left text-sm ${
              tab === n
                ? "border-l-2 border-l-lime bg-[rgba(82,255,46,0.08)] text-lime"
                : "text-fg2 hover:text-fg"
            }`}
          >
            {n}
          </button>
        ))}
      </Card>

      <Card className="p-6">
        {tab === "API Keys" && <ApiKeys />}
        {tab === "Instagram" && <InstagramTab />}
        {tab === "Telegram" && <Placeholder label="Telegram" />}
        {tab === "Schedule" && <Placeholder label="Schedule" />}
        {tab === "Characters" && <Characters />}
        {tab === "Appearance" && <Placeholder label="Appearance" />}
      </Card>
    </div>
  );
}

function ApiKeys() {
  const [slots, setSlots] = useState<Slot[]>(INITIAL_SLOTS);

  // Image-generation settings (fetched from /api/settings-imagegen).
  // The model list must match the whitelist in the API route.
  const IG_ALLOWED_MODELS = [
    "@cf/black-forest-labs/flux-2-klein-4b",
    "@cf/black-forest-labs/flux-2-dev",
    "@cf/black-forest-labs/flux-2-klein-9b",
  ];
  const [igDefaultModel, setIgDefaultModel] = useState<string>(IG_ALLOWED_MODELS[0]);
  const [igVyceaiConfigured, setIgVyceaiConfigured] = useState(false);
  const [igVyceaiLast4, setIgVyceaiLast4] = useState<string | null>(null);
  const [igKeyInput, setIgKeyInput] = useState("");
  const [igSaving, setIgSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings-imagegen")
      .then((r) => r.json())
      .then((data) => {
        if (data?.defaultModel) setIgDefaultModel(data.defaultModel);
        if (data?.vyceai) {
          setIgVyceaiConfigured(!!data.vyceai.configured);
          setIgVyceaiLast4(data.vyceai.last4 ?? null);
        }
      })
      .catch(() => {
        /* ignore — local dev may not have KV */
      });
  }, []);

  const handleSaveImageGen = async () => {
    setIgSaving(true);
    try {
      const body: { defaultModel?: string; vyceaiKey?: string } = {
        defaultModel: igDefaultModel,
      };
      if (igKeyInput.length > 0) {
        body.vyceaiKey = igKeyInput;
      }
      const res = await fetch("/api/settings-imagegen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        toast.error(data?.error ?? "Save failed");
        return;
      }
      if (data.vyceai) {
        setIgVyceaiConfigured(!!data.vyceai.configured);
        setIgVyceaiLast4(data.vyceai.last4 ?? null);
      }
      if (data.defaultModel) setIgDefaultModel(data.defaultModel);
      setIgKeyInput("");
      toast.success("Image generation settings saved");
    } catch (err: any) {
      toast.error(`Save failed: ${err?.message ?? String(err)}`);
    } finally {
      setIgSaving(false);
    }
  };

  const addSlot = () =>
    setSlots((prev) => [
      ...prev,
      {
        id: (prev[prev.length - 1]?.id ?? 0) + 1,
        label: "",
        job: JOBS[0]!,
        cap: 4.5,
      },
    ]);

  return (
    <div className="aios-scroll max-h-[70dvh] overflow-y-auto pr-1">
      <div className="text-lg font-semibold text-fg">API Keys</div>

      <div
        role="alert"
        className="mt-3 rounded-lg border border-[rgba(246,196,83,0.3)] bg-[rgba(246,196,83,0.1)] p-3 text-sm text-warn"
      >
        Image-generation keys are saved to Cloudflare KV and used only by the
        /api/generate-image route. Other sections are not saved yet.
      </div>

      <FieldGroup title="AI Brain">
        <KeyRow label="manifest.build — Base URL" placeholder="https://..." />
        <KeyRow label="manifest.build — API Key" masked />
      </FieldGroup>

      <FieldGroup title="Image Generation">
        <div className="space-y-2">
          <div className="text-sm text-fg">Workers AI — Model</div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={igDefaultModel}
              onChange={(e) => setIgDefaultModel(e.target.value)}
              className="min-w-[280px]"
            >
              {IG_ALLOWED_MODELS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
            <Badge tone="success">No key required</Badge>
          </div>
        </div>
        <KeyRow
          label="VyceAI — API Key"
          masked
          value={igKeyInput}
          onChange={(e) => setIgKeyInput(e.target.value)}
          status={
            igVyceaiConfigured
              ? `Configured (…${igVyceaiLast4 ?? "????"})`
              : "Not configured"
          }
        />
        <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[180px_minmax(0,1fr)]">
          <div className="text-sm text-fg">VyceAI — Model</div>
          <div>
            <Badge>grok-imagine-2</Badge>
          </div>
        </div>
        <div className="flex justify-end pt-1">
          <OutlineBtn onClick={handleSaveImageGen} disabled={igSaving}>
            {igSaving ? "Saving…" : "Save image generation"}
          </OutlineBtn>
        </div>
      </FieldGroup>

      <FieldGroup title="Scrapers — Apify">
        <div className="space-y-3">
          {slots.map((slot, i) => (
            <SlotCard
              key={slot.id}
              slot={slot}
              onChange={(next) =>
                setSlots((prev) => prev.map((s, j) => (j === i ? next : s)))
              }
            />
          ))}
        </div>
        <OutlineBtn onClick={addSlot} className="mt-3">
          <Plus size={14} /> Add slot
        </OutlineBtn>
      </FieldGroup>

      <FieldGroup title="Data Sources">
        <KeyRow label="YouTube Data API Key" masked />
        <KeyRow label="SerpApi Key" masked />
        <KeyRow label="Reddit Client ID" />
        <KeyRow label="Reddit Client Secret" masked />
        <KeyRow label="Product Hunt Developer Token" masked />
        <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[180px_minmax(0,1fr)]">
          <div className="text-sm text-fg">Hacker News</div>
          <div>
            <Badge tone="success">No key required</Badge>
          </div>
        </div>
      </FieldGroup>

      <FieldGroup title="Notifications">
        <KeyRow label="Telegram Bot Token" masked />
        <KeyRow label="Telegram Chat ID" />
      </FieldGroup>
    </div>
  );
}

function FieldGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6">
      <h3 className="sticky top-0 z-10 -mx-1 bg-cardx px-1 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-mute">
        {title}
      </h3>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}

function SaveBtn() {
  return (
    <Tooltip label="Saving is not wired up yet">
      <button
        type="button"
        aria-label="Save"
        className="grid h-10 w-10 place-items-center rounded-md border border-line text-lime hover:bg-[rgba(82,255,46,0.08)]"
      >
        <Save size={14} />
      </button>
    </Tooltip>
  );
}

function KeyRow({
  label,
  masked = false,
  placeholder,
  value,
  onChange,
  status,
}: {
  label: string;
  masked?: boolean;
  placeholder?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  status?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[180px_minmax(0,1fr)_auto_auto] sm:items-center">
      <div className="text-sm text-fg">{label}</div>
      <div className="min-w-0">
        <Input
          type={masked && !show ? "password" : "text"}
          placeholder={placeholder}
          {...(onChange
            ? { value: value ?? "", onChange }
            : { defaultValue: value ?? "" })}
        />
        {masked && (
          <div className="mt-1 text-[11px] text-mute">
            {status ?? "Not configured"}
          </div>
        )}
      </div>
      {masked ? (
        <button
          type="button"
          onClick={() => setShow(!show)}
          aria-label={show ? "Hide value" : "Show value"}
          className="grid h-10 w-10 place-items-center rounded-md border border-line text-fg2 hover:border-lime hover:text-lime"
        >
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      ) : (
        <span className="hidden sm:block sm:h-10 sm:w-10" />
      )}
      <SaveBtn />
    </div>
  );
}

function SlotCard({
  slot,
  onChange,
}: {
  slot: Slot;
  onChange: (next: Slot) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-xs uppercase tracking-wide text-mute">Slot</div>
        <Badge tone="success">active</Badge>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <div className="mb-1 text-xs text-mute">Label</div>
          <Input
            value={slot.label}
            placeholder="Radwan"
            onChange={(e) => onChange({ ...slot, label: e.target.value })}
          />
        </div>
        <div>
          <div className="mb-1 text-xs text-mute">API Token</div>
          <div className="flex gap-2">
            <Input type={show ? "text" : "password"} />
            <button
              type="button"
              onClick={() => setShow(!show)}
              aria-label={show ? "Hide token" : "Show token"}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-line text-fg2 hover:border-lime hover:text-lime"
            >
              {show ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <div className="mt-1 text-[11px] text-mute">Not configured</div>
        </div>
        <div>
          <div className="mb-1 text-xs text-mute">Assigned job</div>
          <Select
            value={slot.job}
            onChange={(e) => onChange({ ...slot, job: e.target.value })}
          >
            {JOBS.map((j) => (
              <option key={j} value={j}>
                {j}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <div className="mb-1 text-xs text-mute">Monthly cap USD</div>
          <Input
            type="number"
            step="0.01"
            value={slot.cap}
            onChange={(e) =>
              onChange({ ...slot, cap: Number(e.target.value) || 0 })
            }
          />
        </div>
      </div>
      <div className="mt-3">
        <Progress value={0} />
        <div className="mt-1 text-[11px] text-mute">
          $0.00 / ${slot.cap.toFixed(2)}
        </div>
      </div>
    </div>
  );
}

function InstagramTab() {
  const [handle, setHandle] = useState("@enzo.creates");
  const [comps, setComps] = useState(["@dailyloop", "@shotbrief", "@mkt.arc"]);
  const [add, setAdd] = useState("");
  return (
    <div className="space-y-4">
      <div className="text-lg font-semibold text-fg">Instagram</div>
      <div>
        <div className="mb-1 text-xs text-mute">My Handle</div>
        <Input value={handle} onChange={(e) => setHandle(e.target.value)} />
      </div>
      <div>
        <div className="mb-2 text-xs text-mute">Competitor Handles</div>
        <div className="flex flex-wrap gap-2 rounded-lg border border-line bg-surface p-2">
          {comps.map((c) => (
            <span
              key={c}
              className="inline-flex items-center gap-1 rounded-full border border-line bg-cardx px-3 py-1 text-xs text-lime"
            >
              {c}
              <button
                onClick={() => setComps(comps.filter((x) => x !== c))}
                className="text-mute hover:text-err"
              >
                <X size={11} />
              </button>
            </span>
          ))}
          <input
            value={add}
            onChange={(e) => setAdd(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && add) {
                setComps([...comps, add.startsWith("@") ? add : `@${add}`]);
                setAdd("");
              }
            }}
            placeholder="+ Add competitor"
            className="h-7 min-w-[140px] flex-1 bg-transparent px-1 text-xs text-fg outline-none placeholder:text-mute"
          />
        </div>
      </div>
    </div>
  );
}



function Placeholder({ label }: { label: string }) {
  return (
    <div className="grid min-h-[300px] place-items-center text-sm text-mute">
      {label} settings coming soon.
    </div>
  );
}
