/**
 * What "the script" actually is, in one place.
 *
 * A generated script is stored as JSON: three hook options, one body of timestamped
 * beats, and a CTA. The body *already contains* a hook beat — the model writes it as
 * the first line — which created a quiet mismatch: the Script screen offered three
 * hooks, copied `hooks[0]` in front of a body that opened with its own hook, and no
 * screen ever let the owner say which hook the script actually uses.
 *
 * So the rule lives here: **the body is the script**, its first beat is the chosen
 * hook, and the voiceover is that same choice read aloud. Both the generator and the
 * hook-selection route call `selectHook`, so the two can never disagree.
 */

export type ScriptHook = {
  spoken: string;
  formula?: string;
  visual?: string;
  text_overlay?: string;
};

export type ScriptContent = {
  hooks?: ScriptHook[];
  body?: string;
  cta?: string;
  formatted?: string;
  voiceover_script?: string;
  /** Which of `hooks` opens the body. 0 when unset. */
  selected_hook_index?: number;
};

/** A body line that is the hook beat, e.g. `[0-3s] HOOK: "..." | Visual: ...`. */
const HOOK_BEAT = /^\s*\[[^\]]*\]\s*HOOK\b/i;

/** One body line → the words a human would actually say. */
export function cleanSpokenLine(line: string): string {
  const spokenPart = line.split(" | ")[0].trim();
  const noTimestamp = spokenPart.replace(/^\[[^\]]+\]\s+/, "").trim();
  const noEmoji = noTimestamp.replace(/^([⚡⚠🎮📇🔥]+\s*)*/, "").trim();
  const noLabel = noEmoji.replace(/^[^:]*:\s*/, "").trim();
  const noBrackets = noLabel.replace(/\[[^\]]*\]/g, "").trim();
  return noBrackets.replace(/^["'](.*)["']$/, "$1").trim();
}

/** The hook beat, ready to sit at the top of the body. */
export function hookBeat(hook: ScriptHook, timestamp = "[0-3s]"): string {
  const parts = [`${timestamp} HOOK: "${String(hook.spoken ?? "").trim()}"`];
  if (hook.visual?.trim()) parts.push(`Visual: ${hook.visual.trim()}`);
  if (hook.text_overlay?.trim()) parts.push(`Text: ${hook.text_overlay.trim()}`);
  return parts.join(" | ");
}

/**
 * Put `hook` at the top of `body`.
 *
 * Replaces the existing hook beat when there is one (keeping its timestamp), and
 * inserts a new first beat when there is not — older scripts, or a model that
 * structured things differently. The rest of the body is untouched.
 */
export function applyHookToBody(body: string, hook: ScriptHook): string {
  const lines = String(body ?? "").split("\n");
  const index = lines.findIndex((line) => HOOK_BEAT.test(line));
  if (index === -1) {
    return [hookBeat(hook), ...lines.filter((l) => l.trim() !== "")].join("\n");
  }
  const stamp = (lines[index].match(/^\s*(\[[^\]]*\])/) ?? [, "[0-3s]"])[1] as string;
  const updated = [...lines];
  updated[index] = hookBeat(hook, stamp);
  return updated.join("\n");
}

/**
 * Spoken-only text: the chosen hook, the body without its hook beat (it is the same
 * hook), then the CTA. The previous version pushed *all three* hook options in front
 * of the body, so every voiceover opened with three competing hooks.
 */
export function voiceoverFor(hook: ScriptHook | null, body: string, cta: string): string {
  const spoken: string[] = [];
  if (hook?.spoken?.trim()) spoken.push(hook.spoken.trim());
  let skippedHookBeat = false;
  for (const line of String(body ?? "").split("\n")) {
    if (!skippedHookBeat && HOOK_BEAT.test(line)) {
      skippedHookBeat = true;
      continue;
    }
    const cleaned = cleanSpokenLine(line);
    if (cleaned) spoken.push(cleaned);
  }
  const ctaClean = String(cta ?? "").replace(/^["'](.*)["']$/, "$1").trim();
  if (ctaClean) spoken.push(ctaClean);
  return spoken.filter((v, i, a) => a.indexOf(v) === i).join(" ");
}

/**
 * Is this body too thin to be a script?
 *
 * The model is asked for a full timestamped script, but occasionally returns the body as
 * a single line — the hook beat and nothing else. The voiceover is built from the body,
 * so a thin body means a thin voiceover and nothing for the storyboard to shoot: the
 * script would look "ready" on screen while missing every beat after the opening. Three
 * beats is the floor for hook → delivery → ask.
 */
export const MIN_SCRIPT_BEATS = 3;

export function bodyBeatCount(body: string): number {
  return String(body ?? "")
    .split("\n")
    .filter((line) => line.trim() !== "").length;
}

export function isThinBody(body: string): boolean {
  return bodyBeatCount(body) < MIN_SCRIPT_BEATS;
}

/** Clamp a stored/picked index against the hooks that actually exist. */
export function clampHookIndex(value: unknown, count: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || count <= 0) return 0;
  return Math.min(Math.max(Math.trunc(n), 0), count - 1);
}

/** Which hook opens this script. */
export function selectedHookIndex(content: ScriptContent | null | undefined): number {
  const hooks = content?.hooks ?? [];
  return clampHookIndex(content?.selected_hook_index, hooks.length);
}

/** The hook that opens this script, or null when the script has none. */
export function selectedHook(content: ScriptContent | null | undefined): ScriptHook | null {
  const hooks = content?.hooks ?? [];
  return hooks[selectedHookIndex(content)] ?? null;
}

/**
 * Rebuild a stored script around one hook. Pure — returns a new object, so callers
 * can diff or discard.
 *
 * `formatted` (the model's raw prose output, which still lists all three hooks) is
 * deliberately left alone: it is a transcript of what the model said, not the script.
 */
export function selectHook(content: ScriptContent, index: number): ScriptContent {
  const hooks = Array.isArray(content?.hooks) ? content.hooks : [];
  if (hooks.length === 0) return { ...content, selected_hook_index: 0 };
  const i = clampHookIndex(index, hooks.length);
  const body = applyHookToBody(String(content.body ?? ""), hooks[i]);
  return {
    ...content,
    selected_hook_index: i,
    body,
    voiceover_script: voiceoverFor(hooks[i], body, String(content.cta ?? "")),
  };
}

/**
 * The full script as one pasteable block: body first (it already opens with the
 * chosen hook), then the CTA — unless the body already ends with that CTA, in which
 * case appending it again would print it twice.
 */
export function fullScriptText(content: ScriptContent | null | undefined): string {
  const body = String(content?.body ?? "").trim();
  const cta = String(content?.cta ?? "").replace(/^["'](.*)["']$/, "$1").trim();
  if (!body) return cta;
  if (!cta) return body;
  return body.includes(cta) ? body : `${body}\n\n${cta}`;
}
