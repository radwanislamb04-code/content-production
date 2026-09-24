/**
 * The 20:00 message: what is still open, in one screen.
 *
 * ## Why the evening run changed
 *
 * Both daily crons used to run `["scrape", "brief", "send"]` — the same three handles
 * scraped again twelve hours after the morning run, for the same data at full Apify price,
 * plus a second full brief. About half of the Apify spend was repeat work, and the evening
 * message said nothing the morning one had not.
 *
 * Now the morning does the work (trends → scrape → brief → Telegram) and the evening
 * reports: which tasks are still open, what is waiting to move forward, what has never been
 * scored, and whether a key is running out of credit. The wording lives here, pure, so it
 * is tested without a Telegram bot.
 */

export type CreditLine = {
  label: string;
  remainingUsd: number | null;
  allowanceUsd: number | null;
  resetsAt?: string | null;
  state: "ok" | "warn" | "blocked" | "no-token" | "error";
};

export type EveningReportInput = {
  dateKey: string;
  counts: { ideas: number; scripts: number; storyboards: number; prompts: number };
  waiting: { scripts: number; storyboards: number };
  next?: { title: string; needs: string } | null;
  tasks: { open: number; next: { time?: string | null; text: string }[] };
  unscored: number;
  credit: CreditLine[];
  instagram: { connected: boolean; username?: string | null; automations: number };
};

/** Warn once a key is down to its last quarter — enough time to act before it stops. */
export const LOW_CREDIT_FRACTION = 0.25;

export function creditWarning(line: CreditLine): string | null {
  if (line.state === "no-token") return null;
  if (line.state === "error") return `⚠️ Apify “${line.label}”: could not be read`;
  const remaining = line.remainingUsd;
  const allowance = line.allowanceUsd;
  if (remaining === null || allowance === null || allowance <= 0) return null;
  if (remaining <= 0) {
    return `🛑 Apify “${line.label}” has no credit left${
      line.resetsAt ? ` (resets ${line.resetsAt})` : ""
    } — scraping will switch to the next token, or stop.`;
  }
  if (remaining <= allowance * LOW_CREDIT_FRACTION) {
    return `⚠️ Apify “${line.label}”: $${remaining.toFixed(2)} of $${allowance.toFixed(
      2,
    )} left${line.resetsAt ? ` (resets ${line.resetsAt})` : ""}`;
  }
  return null;
}

const clip = (value: unknown, max: number): string => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

export function buildEveningReport(input: EveningReportInput): string {
  const lines: string[] = [`🌙 Evening check — ${input.dateKey}`, ""];

  const somethingOpen =
    input.tasks.open > 0 ||
    input.waiting.scripts > 0 ||
    input.waiting.storyboards > 0 ||
    input.unscored > 0 ||
    !input.instagram.connected ||
    input.credit.some((c) => creditWarning(c) !== null);

  if (!somethingOpen) {
    lines.push("Nothing is waiting. All clear. ✅", "");
  }

  if (input.tasks.open > 0) {
    lines.push(`📋 ${input.tasks.open} task${input.tasks.open === 1 ? "" : "s"} still open`);
    for (const task of input.tasks.next.slice(0, 5)) {
      lines.push(`• ${task.time ? `${task.time} — ` : ""}${clip(task.text, 70)}`);
    }
    if (input.tasks.open > input.tasks.next.slice(0, 5).length) {
      lines.push(`…and ${input.tasks.open - input.tasks.next.slice(0, 5).length} more`);
    }
    lines.push("");
  }

  if (input.waiting.scripts > 0) {
    lines.push(`✍️ ${input.waiting.scripts} script${input.waiting.scripts === 1 ? "" : "s"} with no storyboard yet`);
  }
  if (input.waiting.storyboards > 0) {
    lines.push(
      `🎬 ${input.waiting.storyboards} storyboard${input.waiting.storyboards === 1 ? "" : "s"} with no video prompt yet`,
    );
  }
  if (input.next) {
    lines.push(`▶️ Next up (${input.next.needs}): ${clip(input.next.title, 70)}`);
  }
  if (input.waiting.scripts > 0 || input.waiting.storyboards > 0 || input.next) lines.push("");

  if (input.unscored > 0) {
    lines.push(`⭐ ${input.unscored} item${input.unscored === 1 ? "" : "s"} never scored`, "");
  }

  if (input.instagram.connected) {
    lines.push(
      `💬 Instagram @${input.instagram.username ?? "connected"} · ${input.instagram.automations} automation${
        input.instagram.automations === 1 ? "" : "s"
      } on`,
      "",
    );
  } else {
    lines.push("💬 No Instagram account is connected — DM automations cannot run.", "");
  }

  for (const line of input.credit) {
    const warning = creditWarning(line);
    if (warning) lines.push(warning);
  }
  if (input.credit.some((c) => creditWarning(c))) lines.push("");

  lines.push(
    `${input.counts.ideas} ideas · ${input.counts.scripts} scripts · ${input.counts.storyboards} storyboards · ${input.counts.prompts} prompts`,
  );

  return lines.join("\n").trimEnd();
}
