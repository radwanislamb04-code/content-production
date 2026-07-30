import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/projects")({
  server: {
    handlers: {
      GET: async () => Response.json([]),
    },
  },
});
