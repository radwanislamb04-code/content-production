import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Badge, Card, OutlineBtn, PrimaryBtn } from "../ui";
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Plug,
  RefreshCw,
  Trash2,
  Zap,
} from "lucide-react";

/**
 * Connections — "Connect Instagram", for the owner and for every other user.
 *
 * M1 of the roadmap: the account lives here, the token is encrypted at rest, and
 * the only thing a person ever does by hand is press Connect once. When Meta is
 * not set up yet the card asks for the App ID/Secret instead of showing a dead
 * button — the credentials are the real prerequisite, so say so plainly.
 */

type ChannelRow = {
  id: string;
  username: string | null;
  ig_user_id: string | null;
  account_type: string | null;
  status: string;
  token_expires_at: number | null;
  token_refreshed_at: number | null;
  last_event_at: number | null;
  last_error: string | null;
  connected_at: number;
};

type Status = {
  ok: boolean;
  app: { hasAppId: boolean; hasSecret: boolean; hasVerifyToken: boolean; ready: boolean };
  redirectUri: string;
  scopes: string[];
  webhook: { url: string; verifyToken: string | null; fields: string[] };
  channels: ChannelRow[];
};

function when(ts?: number | null): string {
  if (!ts) return "never";
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function ago(ts?: number | null): string {
  if (!ts) return "never";
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

const inputClass =
  "w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-fg outline-none placeholder:text-mute focus:border-lime";

export function ConnectionsCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [showAppForm, setShowAppForm] = useState(false);
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [verifyToken, setVerifyToken] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/instagram-oauth?action=status");
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Could not read the status.");
      setStatus(json as Status);
      setShowAppForm(!json.app?.ready);
    } catch (err: any) {
      setError(err?.message ?? "Could not read the status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // The OAuth callback comes back to /dm with the result in the query string.
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const connected = params.get("connected");
      const failed = params.get("connect_error");
      if (connected) setNote(`Connected @${connected}.`);
      if (failed) setError(failed);
      if (connected || failed) {
        const clean = window.location.pathname;
        window.history.replaceState({}, "", clean);
      }
    }
  }, [load]);

  const post = async (body: any) => {
    const res = await apiFetch("/api/instagram-oauth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
    return json;
  };

  const connect = async () => {
    setBusy("connect");
    setError(null);
    try {
      const json = await post({ action: "start" });
      window.location.href = json.url as string;
    } catch (err: any) {
      setError(err?.message ?? "Could not start the connection.");
      setBusy(null);
    }
  };

  const saveApp = async () => {
    setBusy("save-app");
    setError(null);
    try {
      await post({ action: "save-app", appId, appSecret, verifyToken });
      setNote("App credentials saved.");
      setAppSecret("");
      await load();
      setShowAppForm(false);
    } catch (err: any) {
      setError(err?.message ?? "Could not save the credentials.");
    } finally {
      setBusy(null);
    }
  };

  const act = async (action: "disconnect" | "test" | "refresh-now", id?: string) => {
    setBusy(action + (id ?? ""));
    setError(null);
    setNote(null);
    try {
      const json = await post({ action, id });
      if (action === "disconnect") {
        setNote("Disconnected — the stored token was deleted with it.");
        await load();
      } else if (action === "test") {
        setNote(
          `Instagram answered: @${json.account?.username ?? "?"} (${json.account?.type ?? "unknown type"}).`,
        );
      } else {
        setNote(
          `Checked ${json.checked} connection(s): ${json.refreshed} refreshed, ${json.failed} failed.`,
        );
        await load();
      }
    } catch (err: any) {
      setError(err?.message ?? "That did not work.");
    } finally {
      setBusy(null);
    }
  };

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setNote(`${label} copied.`);
    } catch {
      setError("Could not copy — select the text and copy it by hand.");
    }
  };

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Plug className="h-4 w-4 text-lime" />
          <span className="text-[15px] font-semibold text-fg">Connections</span>
          {status?.channels?.length ? (
            <Badge tone="success">
              {status.channels.length} account{status.channels.length > 1 ? "s" : ""} connected
            </Badge>
          ) : (
            <Badge tone="neutral">no account connected</Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <OutlineBtn onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </OutlineBtn>
          {status?.app?.ready && (
            <PrimaryBtn onClick={connect} loading={busy === "connect"}>
              <Zap size={14} /> Connect Instagram
            </PrimaryBtn>
          )}
        </div>
      </div>

      {(error || note) && (
        <div className="flex items-start gap-2">
          {error ? (
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-err" />
          ) : (
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-lime" />
          )}
          <span className={`text-[12px] ${error ? "text-err" : "text-fg2"}`}>
            {error ?? note}
          </span>
        </div>
      )}

      {/* Meta app credentials — the real prerequisite, not a disabled button. */}
      {!status?.app?.ready || showAppForm ? (
        <div className="space-y-3 rounded-md border border-line bg-surface p-3">
          <div className="text-[12px] text-fg2">
            Paste your Meta app credentials (developers.facebook.com → your app →
            Instagram → <em>Instagram business login</em>). They are stored in your own
            Cloudflare KV and used to sign the connection and to encrypt each token —
            they never appear in a log or in the code.
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block space-y-1">
              <span className="block text-[11px] uppercase tracking-wide text-mute">
                App ID
              </span>
              <input
                value={appId}
                onChange={(e) => setAppId(e.target.value)}
                placeholder="1234567890"
                className={inputClass}
              />
            </label>
            <label className="block space-y-1">
              <span className="block text-[11px] uppercase tracking-wide text-mute">
                App Secret
              </span>
              <input
                value={appSecret}
                onChange={(e) => setAppSecret(e.target.value)}
                type="password"
                placeholder="••••••••"
                className={inputClass}
              />
            </label>
            <label className="block space-y-1">
              <span className="block text-[11px] uppercase tracking-wide text-mute">
                Webhook verify token
              </span>
              <input
                value={verifyToken}
                onChange={(e) => setVerifyToken(e.target.value)}
                placeholder="any phrase only you know"
                className={inputClass}
              />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            {status?.app?.ready && (
              <OutlineBtn onClick={() => setShowAppForm(false)}>Cancel</OutlineBtn>
            )}
            <PrimaryBtn
              onClick={saveApp}
              loading={busy === "save-app"}
              disabled={!appId.trim() || !appSecret.trim()}
            >
              Save credentials
            </PrimaryBtn>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAppForm(true)}
          className="text-[11px] text-mute hover:text-lime"
        >
          App credentials: saved (App ID ···· {status?.app.hasSecret ? "secret set" : "no secret"})
          {" · "}
          {status?.app.hasVerifyToken ? "verify token set" : "no verify token"} — change
        </button>
      )}

      {/* The URL Meta must know about, always visible so it can be pasted. */}
      {status?.redirectUri && (
        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-wide text-mute">
            Redirect URI (paste this into your Meta app)
          </div>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={status.redirectUri}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 truncate rounded-md border border-line bg-card px-2 py-1.5 font-mono text-[11px] text-fg2"
            />
            <OutlineBtn onClick={() => copy(status.redirectUri, "Redirect URI")}>
              <Copy size={13} />
            </OutlineBtn>
          </div>
          <div className="text-[11px] text-mute">
            Permissions requested: {(status.scopes ?? []).join(", ")}
          </div>

          {/* The two values Meta's webhook screen asks for. Copy, paste, done. */}
          {status.webhook && (
            <div className="mt-2 space-y-2 rounded-md border border-line bg-surface p-2.5">
              <div className="text-[11px] uppercase tracking-wide text-mute">
                Webhook (Meta → Webhooks)
              </div>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={status.webhook.url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 flex-1 truncate rounded-md border border-line bg-card px-2 py-1.5 font-mono text-[11px] text-fg2"
                />
                <OutlineBtn onClick={() => copy(status.webhook.url, "Webhook URL")}>
                  <Copy size={13} />
                </OutlineBtn>
              </div>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={status.webhook.verifyToken ?? ""}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 flex-1 truncate rounded-md border border-line bg-card px-2 py-1.5 font-mono text-[11px] text-fg2"
                />
                <OutlineBtn
                  onClick={() => copy(status.webhook.verifyToken ?? "", "Verify token")}
                  disabled={!status.webhook.verifyToken}
                >
                  <Copy size={13} />
                </OutlineBtn>
              </div>
              <div className="text-[11px] text-mute">
                Subscribe these fields: {status.webhook.fields.join(", ")}. Signature
                checks use your app secret, so Instagram's events are verified here
                before anything is answered.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Connected accounts */}
      {status?.channels?.length ? (
        <div className="space-y-2 border-t border-line pt-3">
          {status.channels.map((c) => (
            <div
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-surface p-2.5"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm text-fg">
                    {c.username ? `@${c.username}` : c.ig_user_id}
                  </span>
                  <Badge
                    tone={
                      c.status === "connected"
                        ? "success"
                        : c.status === "needs_reconnect"
                          ? "danger"
                          : "warning"
                    }
                  >
                    {c.status === "connected" ? "connected" : c.status.replace("_", " ")}
                  </Badge>
                  {c.account_type && (
                    <span className="text-[11px] text-mute">{c.account_type}</span>
                  )}
                </div>
                <div className="mt-0.5 text-[11px] text-mute">
                  token valid to {when(c.token_expires_at)} · refreshed {ago(c.token_refreshed_at)} ·
                  last event {ago(c.last_event_at)}
                  {c.last_error ? ` · ${c.last_error}` : ""}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <OutlineBtn onClick={() => act("test", c.id)} disabled={busy !== null}>
                  {busy === "test" + c.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Test
                </OutlineBtn>
                <OutlineBtn
                  onClick={() => act("refresh-now")}
                  disabled={busy !== null}
                  title="Refresh the token right now (the cron does this on its own)"
                >
                  Refresh now
                </OutlineBtn>
                <OutlineBtn
                  onClick={() => act("disconnect", c.id)}
                  disabled={busy !== null}
                  title="Delete this connection and its token"
                >
                  <Trash2 size={13} />
                </OutlineBtn>
              </div>
            </div>
          ))}
        </div>
      ) : (
        status?.app?.ready && (
          <div className="flex items-start gap-2 border-t border-line pt-3 text-[12px] text-mute">
            <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Press <span className="text-fg2">Connect Instagram</span> and allow access.
              Instagram comes back here and the account appears above; automations start
              working the moment it does.
            </span>
          </div>
        )
      )}
    </Card>
  );
}
