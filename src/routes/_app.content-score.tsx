import { createFileRoute } from "@tanstack/react-router";
import { ContentScore } from "@/components/aios/sections/ContentScore";

export const Route = createFileRoute("/_app/content-score")({
  head: () => ({
    meta: [
      { title: "Content Score — Jepy Labs" },
      { name: "description", content: "Score your hook, retention and script quality before you post." },
      { property: "og:title", content: "Content Score — Jepy Labs" },
      { property: "og:description", content: "Score your hook, retention and script quality before you post." },
    ],
  }),
  component: ContentScorePage,
});

function ContentScorePage() {
  return <ContentScore />;
}
