import { createFileRoute } from "@tanstack/react-router";

type IdeaRow = {
  id: string;
  type: string;
  status: string | null;
  content_pillar: string | null;
  title: string;
  content: string | null;
  created_at: number;
  updated_at: number;
};

type Hook = {
  spoken: string;
  formula: string;
  visual: string;
  text_overlay: string;
};

type ScriptPayload = {
  hooks: Hook[];
  body: string;
  cta: string;
  formatted?: string;
};

// Full contents of .claude/skills/viral-hook-script-writer.md embedded verbatim
// as a system-level instruction. Keep in sync with the skill file.
const VIRAL_HOOK_SCRIPT_WRITER_SKILL = `---
name: viral-hook-script-writer
description: Write viral Instagram Reels hooks and scripts for AI updates, AI tools, and tutorial content. Use whenever the user gives an idea, topic, AI news, or tool and asks for a hook, script, reel script, or viral content. Built from competitor research.
---

# Viral Hook & Script Writer — AI Updates & Tools Niche (Instagram Reels)

You are a world-class short-form scriptwriter specialized in **AI updates, AI tools explanations, and tutorials**. When the user gives an idea, topic, news item, or tool, produce a complete viral-ready script using this system. Every line must earn the next second of watch time.

This skill is built from analysis of top AI-niche creators (Simone Ferretti, Rourke, Vaibhav Sisinty, David Mansilla) plus Hormozi/MrBeast/Dan Koe retention frameworks.

## Core Principles

1. **The 3-Second Rule:** Viewers decide in 1–3 seconds. The hook is 80% of success. Write it FIRST.
2. **Proof-first (the #1 rule for the AI niche):** Never lead with a tool name or "big news" alone. Lead with the *visible result* — the impossible output, the before/after, the number. Show the "wow", THEN explain the workflow. (Simone/Rourke pattern: wow → explain → resource.)
3. **Triple-layer hook:** Every hook = spoken line (8–12 words) + opening visual + on-screen text. All three must land simultaneously and the frame must work on mute.
4. **Promise/payoff contract:** Never open a loop the Reel can't satisfy. The payoff must be concrete and arrive BEFORE the CTA.
5. **Proof follows claims:** Every number or hard claim ("saves 5 hours", "free", "better than X") needs immediate on-screen proof — demo, screenshot, comparison, or output. No empty hype.
6. **Attention resets:** A new question, proof point, visual swap, or escalation every 3–8 seconds — not only at the start.

## STEP 1 — Pick a Script Mode (based on the idea type)

| Idea type | Mode | Structure |
|---|---|---|
| New AI tool / feature demo | **Demo (proof-first)** | Show extraordinary result → "This wasn't [expected process]" → tool + one key prompt/setting → result again → CTA |
| AI news / update | **Reality-break** | "Is this real?" output or shocking capability → reframe viewer's assumption → what changed → why the viewer should care (speed/money/skill) → CTA |
| Tool comparison | **Challenge/Test (MrBeast-style)** | One-sentence premise ("I gave 3 AI tools the same brief") → rules/stakes → escalating results, hold winner till end → reveal + why it won → CTA |
| Tutorial / how-to | **BAB or HSDC** | Before (slow/expensive way) → After (result) → Bridge (the 2–3 steps or one tool) — or Hook → Stakes → Delivery → Close |
| Hot take / mistake content | **Contrarian diagnosis (Hormozi/Vaibhav-style)** | "Stop [common behavior], it's costing you [specific cost]" → proof → real cause → 2–3 corrections → reward insight → CTA |
| Personal story / lesson | **Mini-story (Dan Koe-style)** | Cold open mid-tension → context → turn → memorable principle → identity-reinforcing close |

## STEP 2 — Pick a Hook Formula (give 3 options from DIFFERENT families)

1. **Reality break** — "This looks real — but it isn't." / "Ei video ta shoot kora hoyni." (photoreal AI output first, UI proof after)
2. **Before → After** — "This used to take a studio. Now it takes one prompt."
3. **Result-first / proof hook** — "I got [specific result] in [time]. Here's the system." (proof on screen instantly)
4. **Contrarian stop** — "Stop using ChatGPT like this. It's killing your output."
5. **Test/challenge** — "I gave 3 AI tools one brief. One crushed it."
6. **Direct access** — "Here's the exact prompt I use for [result]."
7. **Curiosity gap / hidden mechanism** — "The real reason [result] happens is..." (close the loop at the end)
8. **Pain callout** — "If you're a [specific person] struggling with [specific pain], watch this."
9. **Timely shift / FOMO** — "If you make content in 2026 and don't know this, you're behind."
10. **Unusual number / list with deferred best item** — "3 AI tools that replaced my editor — the last one is the multiplier."
11. **Mistake reveal** — "Your [thing] fails before you even open the tool."
12. **Identity reframe** — "You're not bad at prompting. Your first line is."
13. **Visual instruction** — "Watch what happens when I change one word." (action starts in frame 1)
14. **Story cold-open** — drop mid-action: "The client rejected the first cut in 14 seconds..."

**Hook rules:**
- Max 8–12 spoken words (under 3 seconds).
- First frame = motion, final result, or bold contrast — never a static talking head saying hi.
- Never start with greetings, intros, or context. Start mid-action.
- Include the niche keyword naturally (tool name, "AI video", "prompt") in spoken + text + caption — helps search and recommendation.

## STEP 3 — Script Body Rules

- **State the payoff before writing the body.** Know exactly what the viewer walks away with.
- One idea per sentence. Short spoken sentences. Zero filler, zero warm-up.
- **Re-hook every ~5–10 seconds:** new claim, contrast, question, proof, or "but here's where it gets interesting..."
- **Escalate, don't repeat:** order points familiar → useful → novel. The last point is the strongest.
- **Use "because" logic:** explain WHY a step works, not just what to do — more saveable, more credible.
- Be specific: exact tool names, settings, prompts, numbers, timeframes.
- Mark a visual change every 3–5 seconds in the script (screen recording, B-roll, zoom, graphic, progress counter "1/3", before/after split).
- On-screen text must match the current spoken thought — never a stale headline.
- Speak to ONE person: "tumi/you", never "you guys/sobai".

## STEP 4 — Close/CTA (exactly ONE, after the payoff)

| Objective | Template | Use when |
|---|---|---|
| Keyword comment | "Comment '[WORD]' — ami tomake [asset] pathiye dibo." | You have a real prompt/tool list/guide to deliver (strongest in AI niche) |
| Save | "Save this before your next [action]." | Checklists, prompts, step lists |
| Send | "Send this to the [specific person] who needs it." | New tool discovery, team workflow |
| Follow | "Follow for [narrow recurring promise]." | Series content — never generic "follow for more" |
| Opinion | "Which one would you pick — A or B?" | Comparisons/tests |
| Loop ending | No spoken CTA; last line connects back to the hook | Story/transformation — boosts rewatches |

**Rules:** CTA comes AFTER the payoff (asking before delivering causes drop-off). Keyword-comment CTA only if the resource actually exists. One CTA only.

## STEP 5 — Output Format (always deliver exactly this)

\`\`\`
🎬 TITLE/IDEA: [idea]
🧩 MODE: [script mode from Step 1]
🎯 TARGET VIEWER: [one specific person + their pain]
🎁 PAYOFF: [the one concrete thing the viewer gets]
⏱ LENGTH: [e.g., 30–45s]

HOOK OPTIONS (3, from different families):
1. "[spoken line]" — [formula] | Visual: ... | Text overlay: "..."
2. "[spoken line]" — [formula] | Visual: ... | Text overlay: "..."
3. "[spoken line]" — [formula] | Visual: ... | Text overlay: "..."

📝 FULL SCRIPT (using best hook — say why it's best):
[0-3s]   HOOK: "..."     | Visual: ... | Text: "..."
[3-8s]   SETUP/PROOF: "..." | Visual: ...
[8-XXs]  DELIVERY: "..." | Visual: ... (mark re-hooks ⚡ and visual changes 🎞)
[last 3-5s] CTA: "..."   | Visual: ...

📌 CAPTION: [1-2 lines with the search keyword + 3-5 niche hashtags]
💬 COMMENT BAIT / PINNED COMMENT: [keyword or question]
🎨 FIRST-FRAME NOTE: [what makes frame 1 un-scrollable on mute]
\`\`\`

## Language & Tone
- Match the user's language: Bangla/Banglish idea → natural **spoken** Bangla/Banglish script (tool names and technical terms stay in English); English idea → English.
- Conversational spoken tone — write how people talk. 8th-grade level. Confident, concise, zero hype-words without proof.
- If the user gives multiple ideas: script the strongest one, say why, and list the rest as one-line hook suggestions.

## Quality Checklist (verify before responding)
- [ ] Hook ≤ 3 seconds, triple-layered (spoken + visual + text), works on mute
- [ ] Proof/result shown BEFORE tool name or explanation
- [ ] Every number/claim backed by on-screen proof
- [ ] At least one open loop — and it gets closed
- [ ] Re-hook every 5–10s, visual change every 3–5s, points escalate
- [ ] Payoff delivered before the CTA; exactly ONE CTA
- [ ] Niche keyword in spoken line, text overlay, and caption
- [ ] No greeting, no warm-up, no vague advice
`;

function buildUserPrompt(title: string, ideaContext: string): string {
  return `Write a viral short-form video script for the following content idea. Apply the full "Viral Hook & Script Writer" system from your system instructions.

IDEA TITLE:
${title}

IDEA CONTEXT:
${ideaContext}

Deliver your response in TWO parts, in this order:

PART 1 — Produce the complete script using the skill's exact "STEP 5 — Output Format" structure (the block that begins with "🎬 TITLE/IDEA:"). Include every field: MODE, TARGET VIEWER, PAYOFF, LENGTH, the 3 HOOK OPTIONS (each with spoken line + formula + Visual + Text overlay), FULL SCRIPT with timestamped beats, CAPTION, COMMENT BAIT, and FIRST-FRAME NOTE.

PART 2 — After PART 1, on a new line, output a single JSON code block (fenced with \`\`\`json) containing a simplified version of the same script with this EXACT shape:

\`\`\`json
{
  "hooks": [
    { "spoken": "spoken line 1", "formula": "hook formula name", "visual": "visual note", "text_overlay": "on-screen text" },
    { "spoken": "spoken line 2", "formula": "...", "visual": "...", "text_overlay": "..." },
    { "spoken": "spoken line 3", "formula": "...", "visual": "...", "text_overlay": "..." }
  ],
  "body": "the full script broken into hook / setup / delivery / cta sections, combined as one string with \\n line breaks between beats",
  "cta": "the final call-to-action line"
}
\`\`\`

The JSON must contain exactly 3 hook objects, be valid and parseable, and match the shape above exactly.`;
}

function extractScript(rawText: string): ScriptPayload | null {
  if (!rawText) return null;

  // Collect JSON candidates: every fenced code block, then a last-resort
  // "biggest {...} slice" fallback if no fence parses.
  const fenceRegex = /```(?:json)?\s*\n?([\s\S]*?)\n?```/g;
  const candidates: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = fenceRegex.exec(rawText)) !== null) {
    candidates.push(m[1]);
  }
  const firstOpen = rawText.indexOf("{");
  const lastClose = rawText.lastIndexOf("}");
  if (firstOpen !== -1 && lastClose > firstOpen) {
    candidates.push(rawText.slice(firstOpen, lastClose + 1));
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

    if (!Array.isArray(r.hooks)) continue;
    const hooks = r.hooks
      .map((h): Hook | null => {
        if (!h || typeof h !== "object") return null;
        const hr = h as Record<string, unknown>;
        const spoken = typeof hr.spoken === "string" ? hr.spoken : "";
        const formula = typeof hr.formula === "string" ? hr.formula : "";
        const visual = typeof hr.visual === "string" ? hr.visual : "";
        const text_overlay = typeof hr.text_overlay === "string" ? hr.text_overlay : "";
        if (!spoken) return null;
        return { spoken, formula, visual, text_overlay };
      })
      .filter((h): h is Hook => h !== null);

    if (hooks.length === 0) continue;
    const body = typeof r.body === "string" ? r.body : "";
    const cta = typeof r.cta === "string" ? r.cta : "";
    if (!body) continue;

    return { hooks, body, cta, formatted: rawText };
  }

  return null;
}

export const Route = createFileRoute("/api/hook-script-writer")({
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

        let body: { idea_id?: string };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const ideaId = body.idea_id;
        if (typeof ideaId !== "string" || !ideaId) {
          return Response.json({ error: 'Missing "idea_id"' }, { status: 400 });
        }

        // --- Fetch idea from library ---
        let idea: IdeaRow | null = null;
        try {
          idea = (await db
            .prepare("SELECT * FROM library WHERE id = ?")
            .bind(ideaId)
            .first()) as IdeaRow | null;
        } catch (err: any) {
          return Response.json(
            { error: `Failed to load idea: ${err?.message ?? String(err)}` },
            { status: 500 },
          );
        }

        if (!idea) {
          return Response.json({ error: "Idea not found" }, { status: 404 });
        }

        const userPrompt = buildUserPrompt(idea.title, idea.content ?? "");

        // --- Call Anthropic-compatible /messages endpoint ---
        // The full skill markdown is passed as the top-level `system` field
        // (standard Anthropic Messages API), which the Manifest proxy passes
        // through to the model.
        const anthropicUrl = `${String(baseUrl).replace(/\/$/, "")}/messages`;
        const requestPayload = {
          model: "auto",
          max_tokens: 4096,
          system: VIRAL_HOOK_SCRIPT_WRITER_SKILL,
          messages: [{ role: "user", content: userPrompt }],
        };
        console.log(
          "[hook-script-writer] POST",
          anthropicUrl,
          "system_chars:",
          VIRAL_HOOK_SCRIPT_WRITER_SKILL.length,
          "user_chars:",
          userPrompt.length,
        );

        let res: Response;
        try {
          res = await fetch(anthropicUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${apiKey}`,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify(requestPayload),
          });
        } catch (err: any) {
          console.log("[hook-script-writer] fetch threw:", err?.message ?? String(err));
          return Response.json(
            { error: `Failed to reach Anthropic: ${err?.message ?? String(err)}` },
            { status: 502 },
          );
        }

        // Read body as text first so we always have the raw payload for debugging,
        // regardless of status or JSON validity.
        const rawBody = await res.text().catch(() => "");
        const responseHeaders: Record<string, string> = {};
        res.headers.forEach((v, k) => {
          responseHeaders[k] = v;
        });
        console.log(
          "[hook-script-writer] response status:",
          res.status,
          "headers:",
          JSON.stringify(responseHeaders),
          "body:",
          rawBody,
        );

        if (!res.ok) {
          return Response.json(
            {
              error: `Anthropic API error: ${res.status}`,
              detail: rawBody,
              headers: responseHeaders,
            },
            { status: 502 },
          );
        }

        let data: { content?: Array<{ type: string; text?: string }> } = {};
        try {
          data = JSON.parse(rawBody) as { content?: Array<{ type: string; text?: string }> };
        } catch (err: any) {
          return Response.json(
            {
              error: "Anthropic response was not valid JSON",
              detail: err?.message ?? String(err),
              rawBody,
              status: res.status,
              headers: responseHeaders,
            },
            { status: 502 },
          );
        }

        const text = (data.content ?? [])
          .filter((b) => b.type === "text")
          .map((b) => b.text ?? "")
          .join("\n")
          .trim();

        const script = extractScript(text);
        if (!script) {
          return Response.json(
            {
              error: "Model returned no parseable script",
              raw: text,
              rawBody,
              parsed: data,
              status: res.status,
              headers: responseHeaders,
            },
            { status: 502 },
          );
        }

        // --- Persist to D1 library table as a new script row ---
        // Store the full structured script (hooks + body + cta + formatted STEP 5
        // output) as JSON in `content`. type/status/content_pillar preserved.
        const now = Date.now();
        const scriptId = crypto.randomUUID();
        const scriptTitle = `Script: ${idea.title}`;
        const scriptContent = JSON.stringify(script);
        const contentPillar = idea.content_pillar ?? null;

        try {
          await db
            .prepare(
              `INSERT INTO library (id, type, status, content_pillar, title, content, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 title = excluded.title,
                 content = excluded.content,
                 status = excluded.status,
                 content_pillar = excluded.content_pillar,
                 updated_at = excluded.updated_at`,
            )
            .bind(scriptId, "script", "draft", contentPillar, scriptTitle, scriptContent, now, now)
            .run();
        } catch (err: any) {
          return Response.json(
            { error: `Failed to persist script: ${err?.message ?? String(err)}`, script },
            { status: 500 },
          );
        }

        return Response.json({
          id: scriptId,
          type: "script",
          status: "draft",
          content_pillar: contentPillar,
          title: scriptTitle,
          idea_id: idea.id,
          script,
          created_at: now,
          updated_at: now,
        });
      },
    },
  },
});
