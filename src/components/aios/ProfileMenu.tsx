import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Badge,
  OutlineBtn,
  PrimaryBtn,
} from "./ui";
import { apiGet, apiPost, errorMessage } from "@/lib/api";
import { activeProfile, setActiveProfile } from "@/lib/profile";
import { getAppearance, saveAppearance } from "@/lib/appearance";
import {
  Check,
  ChevronDown,
  Copy,
  Moon,
  Plus,
  Settings as SettingsIcon,
  Sun,
  UserPlus,
} from "lucide-react";

/**
 * The account button in the top-right corner.
 *
 * It replaces the static "EN" badge — EN was the initials of the brand, not a
 * language switch and not an account control, so it did nothing. This shows WHO
 * you are, lets you switch between profiles, and is where a new user is added.
 *
 * Switching stores the choice locally and reloads: every screen fetches its own
 * data on mount, so a reload is the honest way to be sure nothing on screen still
 * belongs to the previous profile.
 */

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  role: "owner" | "member";
  status: string;
  items: number;
};

type Payload = {
  me: { id: string; email: string; role: string } | null;
  users: UserRow[];
  canSwitch: boolean;
};

function initialsOf(text: string): string {
  return (
    text
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export function ProfileMenu() {
  const [data, setData] = useState<Payload | null>(null);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [guide, setGuide] = useState<{ email: string; url: string; detail: string } | null>(
    null,
  );
  const box = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await apiGet<Payload>("/api/users"));
    } catch {
      /* the menu is decoration on top of a working app — never block the shell */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDown = (ev: MouseEvent) => {
      if (box.current && !box.current.contains(ev.target as Node)) setOpen(false);
    };
    const onKey = (ev: KeyboardEvent) => ev.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const me = data?.me ?? null;
  const storedProfile = activeProfile();
  const viewing = data?.users.find((u) => u.id === storedProfile) ?? null;
  const meRow = data?.users.find((u) => u.id === me?.id) ?? null;
  const shown = viewing ?? meRow;
  const label = shown?.name || shown?.email?.split("@")[0] || "Account";
  const viewingAnother = Boolean(viewing && me && viewing.id !== me.id);

  const switchTo = (id: string | null) => {
    setActiveProfile(id);
    // Reload so every page refetches under the new profile.
    window.location.reload();
  };

  const addUser = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await apiPost<{
        user: UserRow;
        next: { email: string; url: string; detail: string };
      }>("/api/users", { email: email.trim(), name: name.trim() || undefined });
      setGuide(res.next);
      setEmail("");
      setName("");
      setAdding(false);
      await load();
      toast(`Workspace created for ${res.user.email}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const theme = getAppearance().theme;
  const cycleTheme = async () => {
    const next = theme === "dark" ? "light" : theme === "light" ? "system" : "dark";
    try {
      await saveAppearance({ theme: next });
      toast(`Theme: ${next}`);
    } catch {
      toast.error("Could not save the theme");
    }
  };

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu — ${label}`}
        className="flex h-9 shrink-0 items-center gap-2 rounded-full border border-lime bg-surface pl-1 pr-2 text-xs font-semibold text-fg transition-colors hover:bg-cardhi"
      >
        <span className="grid h-7 w-7 place-items-center rounded-full bg-lime text-[11px] font-bold text-app">
          {initialsOf(shown?.name || shown?.email || "?")}
        </span>
        <span className="hidden max-w-[92px] truncate sm:block">{label}</span>
        <ChevronDown size={13} className="text-mute" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-11 z-50 w-[320px] overflow-hidden rounded-xl border border-line bg-cardx shadow-xl"
        >
          <div className="border-b border-line p-3">
            <div className="text-sm font-semibold text-fg">
              {shown?.name || "Account"}
            </div>
            <div className="truncate text-[11px] text-mute">
              {shown?.email ?? "not identified"}
            </div>
            <div className="mt-2 flex items-center gap-2">
              {shown?.role === "owner" && <Badge>Owner</Badge>}
              {viewingAnother && <Badge>Viewing</Badge>}
              {me?.role === "owner" && !viewingAnother && <Badge>You</Badge>}
            </div>
          </div>

          {viewingAnother && (
            <div className="border-b border-line bg-surface p-3">
              <div className="text-[11px] text-fg2">
                You are viewing <span className="text-fg">{shown?.email}</span> — its own
                content and keys.
              </div>
              <OutlineBtn className="mt-2 w-full" onClick={() => switchTo(null)}>
                Back to my workspace
              </OutlineBtn>
            </div>
          )}

          <div className="max-h-[240px] overflow-auto border-b border-line p-2">
            <div className="px-1 pb-1 text-[10px] uppercase tracking-wide text-mute">
              Switch profile
            </div>
            {(data?.users ?? []).map((u) => {
              const isCurrent = (viewing?.id ?? me?.id) === u.id;
              return (
                <button
                  key={u.id}
                  onClick={() => switchTo(u.id === me?.id ? null : u.id)}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-cardhi ${
                    isCurrent ? "bg-surface" : ""
                  }`}
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line text-[11px] text-fg2">
                    {initialsOf(u.name || u.email)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-fg">
                      {u.name || u.email.split("@")[0]}
                    </span>
                    <span className="block truncate text-[11px] text-mute">
                      {u.email} · {u.items} item{u.items === 1 ? "" : "s"}
                      {u.status !== "active" ? ` · ${u.status}` : ""}
                    </span>
                  </span>
                  {isCurrent && <Check size={14} className="shrink-0 text-lime" />}
                </button>
              );
            })}
            {!data?.users.length && (
              <div className="px-2 py-3 text-[11px] text-mute">
                Only you so far.
              </div>
            )}
          </div>

          {me?.role === "owner" && (
            <div className="border-b border-line p-3">
              {!adding ? (
                <OutlineBtn className="w-full" onClick={() => setAdding(true)}>
                  <UserPlus size={14} /> Add user
                </OutlineBtn>
              ) : (
                <div className="space-y-2">
                  <input
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="their@email.com"
                    className="h-9 w-full rounded-md border border-line bg-surface px-2.5 text-sm text-fg outline-none placeholder:text-mute focus:border-lime"
                  />
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Name (optional)"
                    className="h-9 w-full rounded-md border border-line bg-surface px-2.5 text-sm text-fg outline-none placeholder:text-mute focus:border-lime"
                  />
                  <div className="flex items-center gap-2">
                    <PrimaryBtn
                      onClick={() => void addUser()}
                      disabled={busy || !email.includes("@")}
                    >
                      <Plus size={14} /> {busy ? "Adding…" : "Create workspace"}
                    </PrimaryBtn>
                    <OutlineBtn onClick={() => setAdding(false)}>Cancel</OutlineBtn>
                  </div>
                  <p className="text-[10px] text-mute">
                    They will sign in with their own email code. Their keys stay theirs.
                  </p>
                </div>
              )}

              {guide && (
                <div className="mt-3 rounded-md border border-line bg-surface p-2.5">
                  <div className="text-[11px] font-semibold text-fg">
                    Last step — allow their email in Cloudflare Access
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded bg-cardx px-2 py-1 text-[11px] text-fg2">
                      {guide.email}
                    </code>
                    <OutlineBtn
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(guide.email)
                          .then(() => toast("Email copied"))
                          .catch(() => toast.error("Copy failed — select it manually"));
                      }}
                    >
                      <Copy size={13} />
                    </OutlineBtn>
                  </div>
                  <div className="mt-1.5 text-[10px] text-mute">{guide.detail}</div>
                  <a
                    href={guide.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1.5 inline-block text-[11px] text-lime underline"
                  >
                    Open Cloudflare Access
                  </a>
                </div>
              )}
            </div>
          )}

          <div className="p-2">
            <button
              onClick={() => void cycleTheme()}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-fg2 transition-colors hover:bg-cardhi"
            >
              {theme === "light" ? <Sun size={14} /> : <Moon size={14} />}
              <span className="flex-1">Theme</span>
              <span className="text-[11px] text-mute">{theme}</span>
            </button>
            <Link
              to="/settings"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-fg2 transition-colors hover:bg-cardhi"
            >
              <SettingsIcon size={14} />
              <span className="flex-1">Settings &amp; keys</span>
            </Link>
            <a
              href="/cdn-cgi/access/logout"
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-fg2 transition-colors hover:bg-cardhi"
            >
              <span className="flex-1">Sign out</span>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
