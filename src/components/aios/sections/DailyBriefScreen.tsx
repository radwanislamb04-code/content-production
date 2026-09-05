import { useState } from "react";
import {
  CopyButton,
  EmptyState,
  PrimaryBtn,
  Skeleton,
  Table,
  Tabs,
} from "../ui";
import { ChevronRight, Sun } from "lucide-react";

/** Section titles — edit here to change the brief structure. */
export const BRIEF_SECTIONS = [
  "Today's Picks",
  "Trending Now",
  "Competitor Watch",
  "Newsletter Digest",
  "Hook Ideas",
  "Action Items",
] as const;

type PastBrief = { date: string; preview: string };

const PAST_BRIEFS: PastBrief[] = [];

function SectionCard({
  index,
  title,
  body,
}: {
  index: number;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-cardx p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[rgba(82,255,46,0.3)] bg-[rgba(82,255,46,0.1)] text-xs font-bold text-lime">
            {index}
          </span>
          <h2 className="truncate text-sm font-semibold text-fg">{title}</h2>
        </div>
        <CopyButton value={body} label="Copy" />
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-fg2">
        {body}
      </p>
    </div>
  );
}

export function DailyBriefScreen() {
  const [tab, setTab] = useState("today");
  const [loading] = useState(false);
  const [brief] = useState<string[] | null>(null);

  const dateLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const fullBrief = (brief ?? [])
    .map((body, i) => `${i + 1}. ${BRIEF_SECTIONS[i]}\n${body}`)
    .join("\n\n");

  return (
    <div className="mx-auto w-full max-w-[900px] space-y-5 pb-10">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="min-w-0">
          <h1 className="text-[clamp(1.25rem,5vw,1.6rem)] font-bold uppercase tracking-wide text-fg">
            Enzorico Daily Content Brief
          </h1>
          <p className="mt-1 text-sm text-fg2">{dateLabel}</p>
          <p className="text-xs text-mute">Generated 9:00 AM</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <CopyButton value={fullBrief} label="Copy entire brief" />
          <PrimaryBtn>Generate now</PrimaryBtn>
        </div>
      </div>

      <Tabs
        tabs={[
          { id: "today", label: "Today" },
          { id: "history", label: "History" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "today" ? (
        loading ? (
          <div className="space-y-4">
            {BRIEF_SECTIONS.map((t) => (
              <div key={t} className="rounded-xl border border-line bg-cardx p-5">
                <Skeleton width="40%" height={16} />
                <div className="mt-4 space-y-2">
                  <Skeleton height={12} />
                  <Skeleton height={12} />
                  <Skeleton width="70%" height={12} />
                </div>
              </div>
            ))}
          </div>
        ) : brief ? (
          <div className="space-y-4">
            {BRIEF_SECTIONS.map((title, i) => (
              <SectionCard
                key={title}
                index={i + 1}
                title={title}
                body={brief[i] ?? ""}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Sun size={20} />}
            title="No brief yet"
            description="Your first brief will arrive automatically at 9:00 AM."
            action={<PrimaryBtn>Generate now</PrimaryBtn>}
          />
        )
      ) : (
        <Table<PastBrief>
          columns={[
            { key: "date", header: "Date", width: 180 },
            { key: "preview", header: "Preview" },
            {
              key: "open",
              header: "",
              width: 48,
              align: "right",
              render: () => <ChevronRight size={16} className="text-mute" />,
            },
          ]}
          rows={PAST_BRIEFS}
          empty={<EmptyState title="No past briefs yet." />}
        />
      )}
    </div>
  );
}
