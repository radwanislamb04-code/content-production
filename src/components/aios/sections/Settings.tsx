import { useEffect, useState } from "react";
import { Card, Input, OutlineBtn, PrimaryBtn } from "../ui";
import { Eye, EyeOff, Save, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost, errorMessage } from "@/lib/api";
import type { CharacterRow } from "@/lib/content-types";


const NAV = ["API Keys", "Instagram", "Telegram", "Schedule", "Characters", "Appearance"];

const KEYS = [
  "Apify Token",
  "YouTube API Key",
  "Telegram Bot Token",
  "Telegram Chat ID",
  "Manifest Auth Token",
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
        {tab === "Characters" && <CharactersTab />}
        {tab === "Appearance" && <Placeholder label="Appearance" />}
      </Card>
    </div>
  );
}

function ApiKeys() {
  return (
    <div className="space-y-3">
      <div className="text-lg font-semibold text-fg">API Keys</div>
      <div className="text-xs text-mute">Kept private on your device.</div>
      <div className="mt-4 space-y-3">
        {KEYS.map((k) => (
          <KeyRow key={k} label={k} />
        ))}
      </div>
    </div>
  );
}

function KeyRow({ label }: { label: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 sm:grid-cols-[180px_minmax(0,1fr)_auto_auto]">
      <div className="col-span-3 text-sm text-fg sm:col-span-1">{label}</div>
      <Input
        type={show ? "text" : "password"}
        defaultValue="••••••••••••••••••"
      />
      <button
        onClick={() => setShow(!show)}
        className="grid h-10 w-10 place-items-center rounded-md border border-line text-fg2 hover:border-lime hover:text-lime"
      >
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
      <button className="grid h-10 w-10 place-items-center rounded-md border border-line text-lime hover:bg-[rgba(82,255,46,0.08)]">
        <Save size={14} />
      </button>
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

function CharactersTab() {
  const [chars, setChars] = useState<CharacterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatar, setAvatar] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    apiGet<CharacterRow[]>("/api/characters")
      .then((rows) => {
        if (alive) setChars(Array.isArray(rows) ? rows : []);
      })
      .catch((err) => toast.error(errorMessage(err)))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const save = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const created = await apiPost<CharacterRow>("/api/characters", {
        name: name.trim(),
        description: description.trim(),
        avatar_url: avatar.trim(),
        in_use: false,
      });
      setChars((prev) => [created, ...prev]);
      setName("");
      setDescription("");
      setAvatar("");
      setOpen(false);
      toast.success("Character added");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="text-lg font-semibold text-fg">Characters</div>

      {loading ? (
        <div className="text-sm text-mute">Loading characters…</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {chars.map((c) => (
            <div key={c.id} className="rounded-xl border border-line bg-surface p-4">
              {c.content?.avatar_url ? (
                <img
                  src={c.content.avatar_url}
                  alt={c.content?.name || c.title}
                  className="h-14 w-14 rounded-full object-cover"
                />
              ) : (
                <div className="h-14 w-14 rounded-full bg-line" />
              )}
              <div className="mt-3 truncate text-sm text-fg">
                {c.content?.name || c.title}
              </div>
              {c.content?.description && (
                <div className="mt-1 line-clamp-2 text-xs text-mute">
                  {c.content.description}
                </div>
              )}
            </div>
          ))}
          <button
            onClick={() => setOpen((v) => !v)}
            className="grid place-items-center rounded-xl border border-dashed border-line2 p-4 text-mute hover:border-lime hover:text-lime"
          >
            <Plus size={16} />
            <span className="mt-1 text-xs">Add New</span>
          </button>
        </div>
      )}

      {open && (
        <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Character name"
          />
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short description"
          />
          <Input
            value={avatar}
            onChange={(e) => setAvatar(e.target.value)}
            placeholder="Avatar image URL (optional)"
          />
          <div className="flex gap-2">
            <PrimaryBtn onClick={save} loading={saving}>
              {saving ? "Saving…" : "Save Character"}
            </PrimaryBtn>
            <OutlineBtn onClick={() => setOpen(false)}>Cancel</OutlineBtn>
          </div>
        </div>
      )}
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
