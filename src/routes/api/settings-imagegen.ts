import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * GET  /api/settings-imagegen — read which providers are configured
 *                                 (returns only last4 of the key, never the
 *                                 full key)
 * POST /api/settings-imagegen — set/clear the VyceAI key and the default
 *                                 Workers AI model
 *
 * KV keys used:
 *   "settings:imagegen:vyceai"        — the full VyceAI API key (secret)
 *   "settings:imagegen:default-model" — the selected Workers AI model
 */

const ALLOWED_WORKERS_AI_MODELS = [
  "@cf/black-forest-labs/flux-2-klein-4b",
  "@cf/black-forest-labs/flux-2-dev",
  "@cf/black-forest-labs/flux-2-klein-9b",
] as const;

const DEFAULT_WORKERS_AI_MODEL = ALLOWED_WORKERS_AI_MODELS[0];

const postSchema = z.object({
  vyceaiKey: z.string().trim().min(1).max(2000).optional(),
  clearVyceai: z.boolean().optional(),
  defaultModel: z.string().trim().min(1).max(200).optional(),
});

function last4(key: string | null | undefined): string | null {
  if (!key) return null;
  if (key.length <= 4) return key;
  return key.slice(-4);
}

async function getKv(env: any): Promise<any | null> {
  const kv = env?.KV;
  if (!kv) return null;
  return kv;
}

export const Route = createFileRoute("/api/settings-imagegen")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const env =
          (request as any)?.runtime?.cloudflare?.env ??
          (context as any).cloudflare?.env;
        const kv = await getKv(env);

        let vyceaiKey: string | null = null;
        let defaultModel: string = DEFAULT_WORKERS_AI_MODEL;

        if (kv) {
          try {
            vyceaiKey = (await kv.get("settings:imagegen:vyceai")) ?? null;
          } catch {
            /* ignore */
          }
          try {
            const m = await kv.get("settings:imagegen:default-model");
            if (m && (ALLOWED_WORKERS_AI_MODELS as readonly string[]).includes(m)) {
              defaultModel = m;
            }
          } catch {
            /* ignore */
          }
        }

        return Response.json({
          vyceai: {
            configured: vyceaiKey !== null,
            last4: last4(vyceaiKey),
          },
          defaultModel,
          allowedModels: ALLOWED_WORKERS_AI_MODELS,
        });
      },

      POST: async ({ request, context }) => {
        const env =
          (request as any)?.runtime?.cloudflare?.env ??
          (context as any).cloudflare?.env;
        const kv = await getKv(env);

        if (!kv) {
          return Response.json(
            { ok: false, error: "KV namespace is not bound." },
            { status: 500 },
          );
        }

        let body: z.infer<typeof postSchema>;
        try {
          body = postSchema.parse(await request.json());
        } catch {
          return Response.json(
            { ok: false, error: "Invalid body." },
            { status: 400 },
          );
        }

        try {
          if (body.clearVyceai === true) {
            await kv.delete("settings:imagegen:vyceai");
          } else if (body.vyceaiKey !== undefined) {
            await kv.put("settings:imagegen:vyceai", body.vyceaiKey);
          }
          if (body.defaultModel !== undefined) {
            if (!(ALLOWED_WORKERS_AI_MODELS as readonly string[]).includes(body.defaultModel)) {
              return Response.json(
                {
                  ok: false,
                  error: `Model "${body.defaultModel}" is not in the allowed list.`,
                  allowed: ALLOWED_WORKERS_AI_MODELS,
                },
                { status: 400 },
              );
            }
            await kv.put("settings:imagegen:default-model", body.defaultModel);
          }
        } catch (err: any) {
          return Response.json(
            { ok: false, error: `KV write failed: ${err?.message ?? String(err)}` },
            { status: 500 },
          );
        }

        // Echo back the same shape as GET.
        const stored = await kv.get("settings:imagegen:vyceai");
        const storedModel = await kv.get("settings:imagegen:default-model");
        return Response.json({
          ok: true,
          vyceai: {
            configured: stored !== null,
            last4: last4(stored),
          },
          defaultModel:
            storedModel && (ALLOWED_WORKERS_AI_MODELS as readonly string[]).includes(storedModel)
              ? storedModel
              : DEFAULT_WORKERS_AI_MODEL,
          allowedModels: ALLOWED_WORKERS_AI_MODELS,
        });
      },
    },
  },
});
