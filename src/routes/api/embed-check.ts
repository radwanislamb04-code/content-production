import { createFileRoute } from "@tanstack/react-router";

const BLOCKED_HOSTS = [
  "google.com",
  "trends.google.com",
  "labs.google",
  "youtube.com",
  "facebook.com",
  "instagram.com",
  "x.com",
  "twitter.com",
  "linkedin.com",
];

function hostBlocked(host: string) {
  return BLOCKED_HOSTS.some((b) => host === b || host.endsWith(`.${b}`));
}

export const Route = createFileRoute("/api/embed-check")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const target = new URL(request.url).searchParams.get("url") ?? "";
        let parsed: URL;
        try {
          parsed = new URL(target);
        } catch {
          return Response.json({ embeddable: false });
        }
        if (parsed.protocol !== "https:" || hostBlocked(parsed.hostname)) {
          return Response.json({ embeddable: false });
        }

        try {
          const res = await fetch(parsed.toString(), {
            method: "GET",
            redirect: "follow",
            headers: { "user-agent": "Mozilla/5.0 JepyLabs-EmbedCheck" },
          });
          if (!res.ok) return Response.json({ embeddable: false });

          const xfo = (res.headers.get("x-frame-options") ?? "").toLowerCase();
          if (xfo.includes("deny") || xfo.includes("sameorigin")) {
            return Response.json({ embeddable: false });
          }
          const csp = (
            res.headers.get("content-security-policy") ?? ""
          ).toLowerCase();
          const fa = csp
            .split(";")
            .map((s) => s.trim())
            .find((s) => s.startsWith("frame-ancestors"));
          if (fa && !fa.includes("*")) {
            return Response.json({ embeddable: false });
          }
          return Response.json({ embeddable: true });
        } catch {
          return Response.json({ embeddable: false });
        }
      },
    },
  },
});
