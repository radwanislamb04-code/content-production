import { currentUserId } from "../../lib/users";
import { createFileRoute } from "@tanstack/react-router";
import { SETTINGS_KEYS, getEnv, readJsonSetting } from "../../lib/settings";

/**
 * GET /api/apify-usage  (?fresh=1 to bypass the cache)
 *
 * "How much credit is left on each of my Apify tokens", so a token can be
 * swapped before it runs dry instead of after a surprise charge.
 *
 * Apify is authoritative here: /v2/users/me/limits returns the allowance and the
 * spend for the current cycle, e.g.
 *   limits.maxMonthlyUsageUsd = 10
 *   current.monthlyUsageUsd   = 4.806…        (cycle 2026-09-01 → 2026-09-30)
 *   current.monthlyActorComputeUnits = 15.5 / 625
 *
 * State per slot: "ok" | "warn" (spend past the slot's own cap) | "blocked"
 * (spend past the Apify allowance — running would cost real money).
 */

type ApifySlot = {
  id?: number | string;
  label?: string;
  job?: string;
  token?: string;
  cap?: number;
};

type Usage = {
  id: string;
  label: string;
  job: string;
  tokenSuffix: string;
  cap: number | null;
  state: "ok" | "warn" | "blocked" | "no-token" | "error";
  account: string | null;
  plan: string | null;
  allowanceUsd: number | null;
  spentUsd: number | null;
  remainingUsd: number | null;
  usedPercent: number | null;
  cycle: { startAt?: string | null; endAt?: string | null } | null;
  subLimits: { label: string; used: number; limit: number; unit: string }[];
  error?: string;
};

const TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 10 * 60 * 1000;

// Module-level cache: a Worker isolate keeps this between requests, which is
// enough to stop the settings page hammering Apify. `?fresh=1` re-reads.
let cache: { at: number; payload: Usage[] } | null = null;

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function apify<T>(path: string, token: string): Promise<T | null> {
  try {
    const res = await fetch(`https://api.apify.com${path}`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json: any = await res.json();
    return (json?.data ?? json) as T;
  } catch {
    return null;
  }
}

function subLimits(current: any, limits: any): Usage["subLimits"] {
  if (!current || typeof current !== "object") return [];
  const rows: Usage["subLimits"] = [];
  // usage lives under `current`, the ceilings under `limits` — reading both from
  // one object silently produced an empty list.
  const push = (label: string, usedKey: string, limitKey: string, unit: string) => {
    const used = num(current[usedKey]);
    const limit = num(limits?.[limitKey]);
    if (used !== null && limit !== null) rows.push({ label, used, limit, unit });
  };
  push("Compute units", "monthlyActorComputeUnits", "maxMonthlyActorComputeUnits", "CU");
  push("Residential proxy", "monthlyResidentialProxyGbytes", "maxMonthlyResidentialProxyGbytes", "GB");
  push("Data transfer", "monthlyExternalDataTransferGbytes", "maxMonthlyExternalDataTransferGbytes", "GB");
  push("Proxy SERPs", "monthlyProxySerps", "maxMonthlyProxySerps", "SERPs");
  return rows;
}

async function usageFor(slot: ApifySlot, index: number): Promise<Usage> {
  const token = String(slot.token ?? "").trim();
  const base: Usage = {
    id: String(slot.id ?? index + 1),
    label: slot.label ?? `Slot ${index + 1}`,
    job: slot.job ?? "any",
    tokenSuffix: token ? token.slice(-4) : "",
    cap: num(slot.cap),
    state: "no-token",
    account: null,
    plan: null,
    allowanceUsd: null,
    spentUsd: null,
    remainingUsd: null,
    usedPercent: null,
    cycle: null,
    subLimits: [],
  };
  if (!token) return base;

  const [me, limits] = await Promise.all([
    apify<any>("/v2/users/me", token),
    apify<any>("/v2/users/me/limits", token),
  ]);

  if (!me && !limits) {
    return { ...base, state: "error", error: "Apify did not answer — the token may be invalid or revoked." };
  }

  const lim = limits?.limits ?? limits ?? {};
  const cur = limits?.current ?? {};
  const allowance = num(lim.maxMonthlyUsageUsd);
  const spent = num(cur.monthlyUsageUsd);

  let state: Usage["state"] = "ok";
  if (allowance !== null && spent !== null && spent >= allowance) state = "blocked";
  else if (base.cap !== null && spent !== null && spent >= base.cap) state = "warn";

  return {
    ...base,
    state,
    account: me?.username ?? null,
    plan: me?.plan?.id ?? me?.plan?.name ?? null,
    allowanceUsd: allowance,
    spentUsd: spent,
    remainingUsd:
      allowance !== null && spent !== null ? Math.max(allowance - spent, 0) : null,
    usedPercent:
      allowance !== null && allowance > 0 && spent !== null
        ? Math.min(Math.round((spent / allowance) * 100), 999)
        : null,
    cycle: limits?.monthlyUsageCycle
      ? {
          startAt: limits.monthlyUsageCycle.startAt ?? null,
          endAt: limits.monthlyUsageCycle.endAt ?? null,
        }
      : null,
    subLimits: subLimits(cur, lim),
  };
}

export const Route = createFileRoute("/api/apify-usage")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const env = getEnv(request, context);
        const fresh = new URL(request.url).searchParams.get("fresh") === "1";
        if (!fresh && cache && Date.now() - cache.at < CACHE_TTL_MS) {
          return Response.json({ ok: true, cached: true, slots: cache.payload });
        }

        // The caller's own slots: this route used to read the owner's, which would
        // have shown one user another's tokens and remaining credit.
        const uid = await currentUserId(request, context);
        const slots = await readJsonSetting<ApifySlot[]>(
          env,
          SETTINGS_KEYS.apifySlots,
          [],
          uid,
        );
        const payload = await Promise.all(slots.map((s, i) => usageFor(s, i)));
        cache = { at: Date.now(), payload };
        return Response.json({ ok: true, cached: false, slots: payload });
      },
    },
  },
});
