import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({
  ideas: z.array(z.string().min(1).max(500)).max(50),
});

export const Route = createFileRoute("/api/workspace/selected_idea")({
  server: {
    handlers: {
      PUT: async ({ request }) => {
        const parsed = bodySchema.safeParse(await request.json());
        if (!parsed.success) {
          return new Response("Invalid body", { status: 400 });
        }
        return Response.json({ ok: true, count: parsed.data.ideas.length });
      },
    },
  },
});
