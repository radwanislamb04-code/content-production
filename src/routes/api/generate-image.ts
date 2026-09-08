import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * POST /api/generate-image
 *
 * In-app image generation. Two providers:
 *   - "workers-ai" — uses the AI binding (no key). Whitelisted models.
 *   - "vyceai"     — calls https://vyceai.com/v1/images/generations
 *                    with a custom OpenAI-compatible API. Reads the key from
 *                    KV ("settings:imagegen:vyceai") with a fallback to
 *                    env.VYCE_API_KEY.
 *
 * To add another provider, add an entry to PROVIDERS below — nothing else
 * needs to change.
 */

const bodySchema = z.object({
  prompt: z.string().trim().min(1).max(4000),
  provider: z.enum(["workers-ai", "vyceai"]),
  model: z.string().trim().min(1).max(200).optional(),
});

const ALLOWED_WORKERS_AI_MODELS = [
  "@cf/black-forest-labs/flux-2-klein-4b",
  "@cf/black-forest-labs/flux-2-dev",
  "@cf/black-forest-labs/flux-2-klein-9b",
] as const;

const DEFAULT_WORKERS_AI_MODEL = ALLOWED_WORKERS_AI_MODELS[0];
const VYCEAI_MODEL = "grok-imagine-2";

type ProviderResult =
  | { ok: true; url: string; provider: string; model: string }
  | { ok: false; error: string };

async function blobToDataUrl(blob: Blob): Promise<string> {
  const buffer = Buffer.from(await blob.arrayBuffer());
  return `data:${blob.type || "image/png"};base64,${buffer.toString("base64")}`;
}

async function readVyceaiKey(env: any): Promise<string | null> {
  // 1) KV (preferred — set from the Settings UI)
  try {
    const kv = env?.KV;
    if (kv) {
      const fromKv = await kv.get("settings:imagegen:vyceai");
      if (fromKv && fromKv.length > 0) return fromKv;
    }
  } catch {
    /* KV unavailable — fall through */
  }
  // 2) env secret fallback
  const fromEnv = env?.VYCE_API_KEY;
  if (typeof fromEnv === "string" && fromEnv.length > 0) return fromEnv;
  return null;
}

const PROVIDERS: Record<
  "workers-ai" | "vyceai",
  (args: { prompt: string; model: string | undefined; env: any }) => Promise<ProviderResult>
> = {
  // Workers AI — no key needed. env.AI.run returns a Blob for image models.
  "workers-ai": async ({ prompt, model, env }) => {
    if (!env?.AI) {
      return {
        ok: false,
        error: "Workers AI runs only after deploy (env.AI is not bound locally).",
      };
    }
    const useModel =
      !model || !ALLOWED_WORKERS_AI_MODELS.includes(model as any)
        ? DEFAULT_WORKERS_AI_MODEL
        : (model as (typeof ALLOWED_WORKERS_AI_MODELS)[number]);
    try {
      const result: unknown = await env.AI.run(useModel, { prompt });
      // Workers AI image models return a Blob (or a ReadableStream in
      // some runtimes). Normalise to a Blob, then to a data URL.
      let blob: Blob;
      if (result instanceof Blob) {
        blob = result;
      } else if (result instanceof ReadableStream) {
        blob = new Blob([await new Response(result).arrayBuffer()]);
      } else if (result && typeof (result as any).arrayBuffer === "function") {
        // Some Workers AI SDKs return a Response-like object.
        blob = new Blob([await (result as any).arrayBuffer()]);
      } else {
        return {
          ok: false,
          error:
            "Workers AI returned an unexpected response shape (no image Blob).",
        };
      }
      const url = await blobToDataUrl(blob);
      return { ok: true, url, provider: "workers-ai", model: useModel };
    } catch (err: any) {
      return {
        ok: false,
        error: `Workers AI error: ${err?.message ?? String(err)}`,
      };
    }
  },

  // VyceAI — custom OpenAI-compatible endpoint. Key from KV or env.
  vyceai: async ({ prompt, env }) => {
    const key = await readVyceaiKey(env);
    if (!key) {
      return {
        ok: false,
        error:
          "VyceAI key not set — add it in Settings → API Keys → Image Generation.",
      };
    }
    try {
      const res = await fetch("https://vyceai.com/v1/images/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: VYCEAI_MODEL,
          prompt,
          size: "1024x1024",
          response_format: "url",
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        const snippet = body.slice(0, 200);
        return {
          ok: false,
          error: `VyceAI error ${res.status}: ${snippet}`,
        };
      }
      const json = (await res.json()) as { data?: Array<{ url?: string }> };
      const url = json.data?.[0]?.url;
      if (!url) {
        return { ok: false, error: "VyceAI response missing image URL." };
      }
      return { ok: true, url, provider: "vyceai", model: VYCEAI_MODEL };
    } catch (err: any) {
      return {
        ok: false,
        error: `VyceAI error: ${err?.message ?? String(err)}`,
      };
    }
  },
};

export const Route = createFileRoute("/api/generate-image")({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        const env = (request as any)?.runtime?.cloudflare?.env ?? (context as any).cloudflare?.env;

        let body: z.infer<typeof bodySchema>;
        try {
          body = bodySchema.parse(await request.json());
        } catch {
          return Response.json(
            { ok: false, error: "Invalid body — { prompt, provider, model? }" },
            { status: 400 },
          );
        }

        // Whitelist check for workers-ai. We only allow it to choose
        // a model if it's one of the three we know how to handle. An
        // unknown model name → 400 with the allowed list.
        if (body.provider === "workers-ai") {
          if (
            body.model !== undefined &&
            !ALLOWED_WORKERS_AI_MODELS.includes(body.model as any)
          ) {
            return Response.json(
              {
                ok: false,
                error: `Model "${body.model}" is not in the allowed list.`,
                allowed: ALLOWED_WORKERS_AI_MODELS,
              },
              { status: 400 },
            );
          }
        }

        const handler = PROVIDERS[body.provider];
        const result = await handler({ prompt: body.prompt, model: body.model, env });
        const status = result.ok ? 200 : 502;
        return Response.json(result, { status });
      },
    },
  },
});
