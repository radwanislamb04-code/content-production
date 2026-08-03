import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const CATEGORIES = [
  "Video Download",
  "Trends",
  "Creator Research",
  "Writing",
  "AI Tools",
  "AI Video",
] as const;

const bodySchema = z.object({
  url: z.string().trim().url().max(500),
  name: z.string().trim().min(1).max(80),
  category: z.enum(CATEGORIES),
});

export const Route = createFileRoute("/api/resources")({
  server: {
    handlers: {
      GET: async ({ context }) => {
        const db = (context as any).cloudflare?.env?.DB;
        if (!db) return Response.json([]);
        try {
          const { results } = await db
            .prepare("SELECT * FROM resources ORDER BY created_at DESC")
            .all();
          return Response.json(results ?? []);
        } catch {
          return Response.json([]);
        }
      },
      POST: async ({ request, context }) => {
        let parsed;
        try {
          parsed = bodySchema.parse(await request.json());
        } catch {
          return new Response("Invalid input", { status: 400 });
        }

        const row = {
          id: crypto.randomUUID(),
          name: parsed.name,
          url: parsed.url,
          category: parsed.category,
          iframe: 0,
          created_at: Date.now(),
        };

        const db = (context as any).cloudflare?.env?.DB;
        if (db) {
          try {
            await db
              .prepare(
                "INSERT INTO resources (id, name, url, category, iframe, created_at) VALUES (?, ?, ?, ?, ?, ?)",
              )
              .bind(
                row.id,
                row.name,
                row.url,
                row.category,
                row.iframe,
                row.created_at,
              )
              .run();
          } catch {
            return new Response("Save failed", { status: 500 });
          }
        }

        return Response.json(row, { status: 201 });
      },
    },
  },
});
