/**
 * One-click export of a whole job — script, shots and video prompts — as one CSV.
 *
 * ## Why
 *
 * The pieces of a job live in three screens and three rows (`script` → `storyboard` →
 * `video_prompt`, linked by `source_id`), and nothing could get them out of the app in one
 * piece. Handing the work to another tool, or to another person, meant copying shot by shot
 * out of the UI. This writes the same data as a single table.
 *
 * ## Shape
 *
 * One row per shot, so it opens as a table. The per-shot columns come first — those are the
 * ones you read and filter — and the script-level text (the full body and voiceover) sits
 * in the last columns, repeated on every row, so any single row is self-sufficient for a
 * reader that does not join tables. With no storyboard yet it still writes one row, so an
 * export of a script on its own works too.
 *
 * A UTF-8 BOM is prepended for Excel, which otherwise mangles Bangla text in a .csv.
 */

export type CsvScript = {
  id?: string;
  title?: string;
  /** The hook that opens the script (see src/lib/script-body.ts). */
  hook?: string;
  body?: string;
  voiceover?: string;
  cta?: string;
};

export type CsvShot = {
  shot_number?: number;
  duration?: string;
  script_portion?: string;
  visual_description?: string;
  image_prompt?: string;
  text_overlay?: string;
  text_overlay_position?: string;
  voiceover?: string;
};

export type CsvPrompt = {
  shot_number?: number;
  duration?: string;
  camera_motion?: string;
  video_prompt?: string;
  negative_prompt?: string;
};

export type ProjectCsvInput = {
  script: CsvScript;
  shots: CsvShot[];
  prompts?: CsvPrompt[];
  model?: string;
  aspectRatio?: string;
  quality?: string;
  exportedAt?: number;
};

/**
 * RFC 4180: quote when the value could break the table, and double the quotes inside.
 * Newlines inside a cell are legal once quoted, which matters here — image prompts are
 * written as paragraphs.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (text === "") return "";
  const needsQuotes = /[",\r\n]/.test(text) || text !== text.trim();
  return needsQuotes ? `"${text.replace(/"/g, '""')}"` : text;
}

const COLUMNS = [
  "shot_number",
  "duration",
  "script_portion",
  "visual_description",
  "image_prompt",
  "text_overlay",
  "voiceover",
  "video_prompt",
  "negative_prompt",
  "camera_motion",
  "model",
  "aspect_ratio",
  "quality",
  "script_title",
  "hook",
  "script_body",
  "script_voiceover",
  "cta",
  "exported_at",
] as const;

export function buildProjectCsv(input: ProjectCsvInput): string {
  const at = new Date(input.exportedAt ?? Date.now()).toISOString();
  const shots = input.shots.length > 0 ? input.shots : [{}];
  const prompts = input.prompts ?? [];

  const rows = shots.map((shot) => {
    // Prompts are matched by shot number; a prompt without a number takes the row's place.
    const prompt =
      prompts.find((p) => Number(p.shot_number) === Number(shot.shot_number)) ??
      (prompts.length === shots.length ? prompts[shots.indexOf(shot)] : undefined);

    return [
      shot.shot_number,
      shot.duration,
      shot.script_portion,
      shot.visual_description,
      shot.image_prompt,
      shot.text_overlay
        ? `${shot.text_overlay}${shot.text_overlay_position ? ` (${shot.text_overlay_position})` : ""}`
        : "",
      shot.voiceover,
      prompt?.video_prompt,
      prompt?.negative_prompt,
      prompt?.camera_motion,
      input.model,
      input.aspectRatio,
      input.quality,
      input.script.title,
      input.script.hook,
      input.script.body,
      input.script.voiceover,
      input.script.cta,
      at,
    ];
  });

  const body = [COLUMNS.join(","), ...rows.map((row) => row.map(csvCell).join(","))].join("\r\n");
  return `\ufeff${body}\r\n`;
}

/** A filename that says which job it is, safe on every filesystem. */
export function csvFileName(title: string | undefined, at: number = Date.now()): string {
  // Note the fallback: an untitled job used to fall back to "content-os" and produce
  // "content-os-content-os-2026-09-25.csv".
  const slug = String(title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0980-\u09ff]+/g, "-")
    .replace(/-+/g, "-")          // an em dash and its neighbours collapse to one
    .slice(0, 60)
    .replace(/^-+|-+$/g, "");     // trim after truncating: a cut can land on a dash, and
                                  // a trailing one showed up as "…-one-week--2026-09-24.csv"
  const stamp = new Date(at).toISOString().slice(0, 10);
  return `content-os-${slug || "job"}-${stamp}.csv`;
}

/** Hand the file to the browser. No-op outside one, so the builder stays testable. */
export function downloadCsv(fileName: string, csv: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
