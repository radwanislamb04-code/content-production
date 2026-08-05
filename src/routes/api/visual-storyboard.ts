import { createFileRoute } from "@tanstack/react-router";

type ScriptRow = {
  id: string;
  type: string;
  status: string | null;
  content_pillar: string | null;
  title: string;
  content: string | null;
  created_at: number;
  updated_at: number;
};

type Character = {
  name: string;
  description: string;
};

type Shot = {
  shot_number: number;
  duration: string;
  script_portion: string;
  visual_description: string;
  camera_angle: string;
  transition: string;
  image_prompt: string;
  text_overlay: string;
  text_overlay_position: "top" | "center" | "bottom";
  voiceover: string;
};

export const Route = createFileRoute("/api/visual-storyboard")({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        const env = (request as any)?.runtime?.cloudflare?.env ?? (context as any).cloudflare?.env;
        const apiKey = env?.ANTHROPIC_API_KEY;
        const baseUrl = env?.ANTHROPIC_BASE_URL;
        const db = env?.DB;

        if (!apiKey || !baseUrl) {
          return Response.json(
            { error: "ANTHROPIC_API_KEY or ANTHROPIC_BASE_URL not configured" },
            { status: 500 },
          );
        }
        if (!db) {
          return Response.json({ error: "DB not configured" }, { status: 500 });
        }

        let body: { script_id?: string; characters?: Array<{ name: string; description: string }> };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const scriptId = body.script_id;
        if (typeof scriptId !== "string" || !scriptId) {
          return Response.json({ error: 'Missing "script_id"' }, { status: 400 });
        }

        const characters: Character[] = Array.isArray(body.characters)
          ? body.characters.filter(
              (c): c is Character =>
                typeof c === "object" &&
                c !== null &&
                typeof (c as any).name === "string" &&
                typeof (c as any).description === "string",
            )
          : [];

        let scriptRow: ScriptRow | null = null;
        try {
          scriptRow = (await db
            .prepare("SELECT * FROM library WHERE id = ? AND type = ?")
            .bind(scriptId, "script")
            .first()) as ScriptRow | null;
        } catch (err: any) {
          return Response.json(
            { error: `Failed to load script: ${err?.message ?? String(err)}` },
            { status: 500 },
          );
        }

        if (!scriptRow) {
          return Response.json({ error: "Script not found" }, { status: 404 });
        }

        const characterNames = characters.map((c) => c.name);
        const characterRefs = characters.length > 0
          ? `Characters available: ${characterNames.join(", ")}. Reference relevant characters by name in shot visual_description fields when appropriate.`
          : "No specific characters provided.";

        const scriptContentText = scriptRow.content ? (typeof scriptRow.content === "string" ? scriptRow.content : JSON.stringify(scriptRow.content)) : "";

        const systemPrompt = `You are a visual storyboard director. Given a script, generate a visual shot list.

Instructions:
- Decide the shot count yourself based on script length and pacing. Do NOT use a hardcoded range.
- For each shot, produce an object with: shot_number, duration, script_portion, visual_description, camera_angle, transition, image_prompt, text_overlay, text_overlay_position ("top" | "center" | "bottom"), voiceover.
- If characters are mentioned in the prompt, reference relevant characters by name in the visual_description field when appropriate.
- Output ONLY a fenced JSON block containing an array named "shots".

${characterRefs}`;

        const userPrompt = `Script title: ${scriptRow.title}\nScript content:\n${scriptContentText}\n\nGenerate the storyboard shot list.`;

        const anthropicUrl = `${String(baseUrl).replace(/\/$/, "")}/messages`;
        const requestPayload = {
          model: "auto",
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        };

        let res: Response;
        try {
          res = await fetch(anthropicUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${apiKey}`,
            },
            body: JSON.stringify(requestPayload),
          });
        } catch (err: any) {
          return Response.json(
            { error: `Failed to reach Anthropic: ${err?.message ?? String(err)}` },
            { status: 502 },
          );
        }

        if (!res.ok) {
          const errorText = await res.text().catch(() => "");
          return Response.json({ error: `Anthropic API error: ${res.status}`, detail: errorText }, { status: 502 });
        }

        // --- Streaming pattern via TransformStream ---
        // In Cloudflare Workers, fetch responses expose a ReadableStream body.
        // We pipe that through a TransformStream: it passes chunks through
        // (back to the client) while collecting the full text for parsing.

        if (!res.body) {
          return Response.json({ error: "Manifest response has no body" }, { status: 502 });
        }

        // Streaming collection via TransformStream (Cloudflare Workers pattern).
        // We read chunks from the Manifest ReadableStream, pass them through
        // a TransformStream (which also accumulates text), and then consume
        // the transformed stream so flush fires synchronously.
        const decoder = new TextDecoder();
        let collectedText = "";

        const streamTransform = new TransformStream({
          transform(chunk, controller) {
            // Pass through to keep stream alive for flush
            controller.enqueue(chunk);
            // Collect text for post-stream JSON parsing
            collectedText += decoder.decode(chunk, { stream: true });
          },
          flush() {
            collectedText += decoder.decode();
          },
        });

        // Pipe the Manifest body through TransformStream and consume it
        // so flush completes synchronously before we parse.
        await res.body.pipeThrough(streamTransform).pipeTo(new WritableStream());
        const rawBody = collectedText;

        let shots: Shot[] = [];
        try {
          const fenceRegex = /```(?:json)?\s*\n?([\s\S]*?)\n?```/g;
          const candidates: string[] = [];
          let m: RegExpExecArray | null;
          while ((m = fenceRegex.exec(rawBody)) !== null) {
            candidates.push(m[1]);
          }
          const firstOpen = rawBody.indexOf("{");
          const lastClose = rawBody.lastIndexOf("}");
          if (firstOpen !== -1 && lastClose > firstOpen) {
            candidates.push(rawBody.slice(firstOpen, lastClose + 1));
          }

          for (const candidate of candidates) {
            const cleaned = candidate.trim();
            if (!cleaned) continue;
            let parsed: unknown;
            try {
              parsed = JSON.parse(cleaned);
            } catch {
              continue;
            }
            if (!parsed || typeof parsed !== "object") continue;
            const r = parsed as Record<string, unknown>;
            if (Array.isArray(r.shots)) {
              const parsedShots = (r.shots as unknown[]).map((s): Shot | null => {
                if (!s || typeof s !== "object") return null;
                const sh = s as Record<string, unknown>;
                return {
                  shot_number: typeof sh.shot_number === "number" ? sh.shot_number : 0,
                  duration: typeof sh.duration === "string" ? sh.duration : "",
                  script_portion: typeof sh.script_portion === "string" ? sh.script_portion : "",
                  visual_description: typeof sh.visual_description === "string" ? sh.visual_description : "",
                  camera_angle: typeof sh.camera_angle === "string" ? sh.camera_angle : "",
                  transition: typeof sh.transition === "string" ? sh.transition : "",
                  image_prompt: typeof sh.image_prompt === "string" ? sh.image_prompt : "",
                  text_overlay: typeof sh.text_overlay === "string" ? sh.text_overlay : "",
                  text_overlay_position:
                    sh.text_overlay_position === "top" || sh.text_overlay_position === "center" || sh.text_overlay_position === "bottom"
                      ? sh.text_overlay_position
                      : "center",
                  voiceover: typeof sh.voiceover === "string" ? sh.voiceover : "",
                };
              }).filter((s): s is Shot => s !== null && s.shot_number !== 0);
              if (parsedShots.length > 0) {
                shots = parsedShots;
                break;
              }
            }
          }
        } catch {
          // Leave shots empty
        }

        if (shots.length === 0) {
          return Response.json(
            {
              error: "Failed to parse storyboard shots from model response",
              raw: rawBody,
            },
            { status: 502 },
          );
        }

        const now = Date.now();
        const storyboardId = crypto.randomUUID();
        const storyboardTitle = scriptRow.title ? `Storyboard: ${scriptRow.title}` : "Storyboard";
        const storyboardContent = JSON.stringify({ shots });

        try {
          await db
            .prepare(
              `INSERT INTO library (id, type, status, content_pillar, title, content, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              storyboardId,
              "storyboard",
              "draft",
              scriptRow.content_pillar ?? null,
              storyboardTitle,
              storyboardContent,
              now,
              now,
            )
            .run();
        } catch (err: any) {
          return Response.json(
            { error: `Failed to persist storyboard: ${err?.message ?? String(err)}` },
            { status: 500 },
          );
        }

        return Response.json({
          storyboard_id: storyboardId,
          script_id: scriptId,
          shot_count: shots.length,
          shots,
        });
      },
    },
  },
});
