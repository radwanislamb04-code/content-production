import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getEnv } from "../../lib/settings";

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
  /**
   * Reference images — a character's face, wardrobe, style. Up to four, which is what
   * FLUX.2 accepts; each is a data: URL or a public http(s) URL.
   *
   * This is the difference between "a host in a jacket" and "this host, in this jacket".
   * Without an image the model has never seen the character, so no amount of prompt
   * wording reproduces their face.
   */
  images: z.array(z.string().trim().min(1)).max(4).optional(),
});

const ALLOWED_WORKERS_AI_MODELS = [
  "@cf/black-forest-labs/flux-2-klein-4b",
  "@cf/black-forest-labs/flux-2-dev",
  "@cf/black-forest-labs/flux-2-klein-9b",
] as const;

const DEFAULT_WORKERS_AI_MODEL = ALLOWED_WORKERS_AI_MODELS[0];
const VYCEAI_MODEL = "grok-imagine-2";

type ProviderResult =
  | { ok: true; url: string; provider: string; model: string; warning?: string }
  | { ok: false; error: string };

/**
 * An image as a Blob, from a data: URL (a generated image) or a public http(s) URL (how
 * the app stores a character's avatar).
 */
async function imageSourceToBlob(src: string): Promise<Blob | null> {
  try {
    const dataUrl = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(src);
    if (dataUrl) {
      const bytes = dataUrl[2]
        ? Buffer.from(dataUrl[3], "base64")
        : Buffer.from(decodeURIComponent(dataUrl[3]));
      return new Blob([bytes], { type: dataUrl[1] || "image/png" });
    }
    if (/^https?:\/\//i.test(src)) {
      const res = await fetch(src);
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      return new Blob([buf], { type: res.headers.get("content-type") || "image/png" });
    }
  } catch {
    /* unreadable reference — the caller is told, the generation still runs */
  }
  return null;
}

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
  (args: {
    prompt: string;
    model: string | undefined;
    env: any;
    images?: string[];
  }) => Promise<ProviderResult>
> = {
  // Workers AI — no key needed. env.AI.run returns a Blob for image models.
  "workers-ai": async ({ prompt, model, env, images }) => {
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
      // FLUX.2 on Workers AI takes multipart form data — even for a prompt-only request —
      // and reference images ride along as `input_image_0..3`. The previous code sent
      // `{ prompt }` as JSON, which is not the documented shape for these models.
      //
      // Note the model's own limit: each input image must be under 512x512. A larger
      // avatar is passed through as-is (a Worker cannot resize it) and the provider's
      // complaint is surfaced to the caller rather than swallowed.
      const form = new FormData();
      form.append("prompt", prompt);
      form.append("width", "1024");
      form.append("height", "1024");
      let attached = 0;
      for (const src of (images ?? []).slice(0, 4)) {
        const blob = await imageSourceToBlob(src);
        if (blob) {
          form.append(`input_image_${attached}`, blob);
          attached++;
        }
      }
      // FormData does not expose its serialised body or boundary. Passing it through a
      // Response serialises it and generates the Content-Type the server needs.
      const wrapped = new Response(form);
      const result: unknown = await env.AI.run(useModel, {
        multipart: {
          body: wrapped.body,
          contentType: wrapped.headers.get("content-type"),
        },
      });
      // Workers AI image models return a Blob (or a ReadableStream in
      // some runtimes). Normalise to a Blob, then to a data URL.
      // FLUX.2 answers with `{ image: "<base64>" }` — its output schema documents exactly
      // that, not a Blob. The code only understood a Blob, so every generation through
      // this provider failed with "unexpected response shape". Both shapes are handled
      // now, and the fallback names the keys it actually got instead of guessing.
      let blob: Blob;
      if (result && typeof (result as any).image === "string") {
        const bytes = Buffer.from((result as any).image, "base64");
        blob = new Blob([bytes], { type: "image/png" });
      } else if (result instanceof Blob) {
        blob = result;
      } else if (result instanceof ReadableStream) {
        blob = new Blob([await new Response(result).arrayBuffer()]);
      } else if (result && typeof (result as any).arrayBuffer === "function") {
        // Some Workers AI SDKs return a Response-like object.
        blob = new Blob([await (result as any).arrayBuffer()]);
      } else {
        const shape =
          result && typeof result === "object"
            ? `keys: ${Object.keys(result as any).join(", ") || "(none)"}`
            : `type: ${typeof result}`;
        return {
          ok: false,
          error: `Workers AI returned an unexpected response shape (${shape}).`,
        };
      }
      const url = await blobToDataUrl(blob);
      return {
        ok: true,
        url,
        provider: "workers-ai",
        model: useModel,
        ...(images?.length && !attached
          ? { warning: "The reference images could not be read, so the character's face was not used." }
          : {}),
      };
    } catch (err: any) {
      return {
        ok: false,
        error: `Workers AI error: ${err?.message ?? String(err)}`,
      };
    }
  },

  // VyceAI — custom OpenAI-compatible endpoint. Key from KV or env.
  vyceai: async ({ prompt, env, images }) => {
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
      // This endpoint is text-to-image; it has no documented image input. Saying so beats
      // silently returning a stranger's face when a character reference was attached.
      return {
        ok: true,
        url,
        provider: "vyceai",
        model: VYCEAI_MODEL,
        ...(images?.length
          ? {
              warning:
                "VyceAI has no reference-image input, so the character reference was ignored. Use Workers AI to keep a face consistent.",
            }
          : {}),
      };
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
        const env = getEnv(request, context);

        let body: z.infer<typeof bodySchema>;
        try {
          body = bodySchema.parse(await request.json());
        } catch {
          return Response.json(
            { ok: false, error: "Invalid body — { prompt, provider, model?, images? }" },
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
        const result = await handler({
          prompt: body.prompt,
          model: body.model,
          env,
          images: body.images,
        });
        const status = result.ok ? 200 : 502;
        return Response.json(result, { status });
      },
    },
  },
});
