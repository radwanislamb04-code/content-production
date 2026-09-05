import { EmptyState } from "../ui";
import { Sun, History, Image, ListOrdered, Layers, Database } from "lucide-react";

function Placeholder({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[900px] space-y-4">
      <h1 className="text-lg font-semibold text-fg">{title}</h1>
      <EmptyState icon={icon} title="Coming soon" description={description} />
    </div>
  );
}

export { DailyBriefScreen as DailyBrief } from "./DailyBriefScreen";

export function BriefHistory() {
  return (
    <Placeholder
      title="Brief History"
      description="Past daily briefs will be archived here."
      icon={<History size={20} />}
    />
  );
}

export function ThumbnailStudio() {
  return (
    <Placeholder
      title="Thumbnail Studio"
      description="Thumbnail generation and testing will live here."
      icon={<Image size={20} />}
    />
  );
}

export function HookScoreboard() {
  return (
    <Placeholder
      title="Hook Scoreboard"
      description="Ranked hook performance will appear here."
      icon={<ListOrdered size={20} />}
    />
  );
}

export function Series() {
  return (
    <Placeholder
      title="Series"
      description="Group content into recurring series here."
      icon={<Layers size={20} />}
    />
  );
}

export { SourcesScreen as Sources } from "./SourcesScreen";
