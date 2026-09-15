import { MessageSquare, Plug } from "lucide-react";
import { Card, EmptyState } from "../ui";

/**
 * DM Manager — not connected.
 *
 * This screen used to show five invented conversations ("@sara.k — loved your
 * last reel…") with canned AI replies and working-looking buttons. None of it
 * came from Instagram. Until a messaging integration exists there is nothing
 * real to show, so the page says exactly that.
 */

const NEEDED = [
  "An Instagram professional account linked as a Page/Instagram Messaging source (Meta Graph API).",
  "A stored access token with `instagram_manage_messages` — added in Settings, like the other keys.",
  "Inbound webhook or polling to pull conversations into D1.",
  "The reply-drafting agent (same AI gateway already used for scripts and briefs).",
];

export function DMManager() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">DM Manager</h1>
        <p className="mt-0.5 text-sm text-mute">Draft replies to Instagram DMs from one inbox.</p>
      </div>

      <EmptyState
        icon={<MessageSquare size={22} />}
        title="Not connected yet"
        description="No messages are shown because none have been fetched. This page previously displayed example conversations — those were placeholders, not your inbox."
      />

      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wide text-mute">
          <Plug size={13} /> What it needs
        </div>
        <ul className="space-y-2">
          {NEEDED.map((n) => (
            <li key={n} className="flex gap-2 text-sm">
              <span className="text-mute">•</span>
              <span>{n}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-mute">
          Until then, Instagram DMs stay in the Instagram app — nothing here will pretend otherwise.
        </p>
      </Card>
    </div>
  );
}
