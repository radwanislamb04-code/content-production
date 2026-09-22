import { createFileRoute } from "@tanstack/react-router";
import { getEnv } from "../lib/settings";
import { PRIVACY_BODY, legalResponse, today } from "../lib/legal";

/**
 * /privacy — the clean URL for the privacy policy.
 *
 * `/api/legal/privacy` served this first, but a Meta app form asks for "a privacy policy
 * URL", and `…/api/legal/privacy` is a URL you have to explain. Both routes render the
 * same body out of `src/lib/legal.ts`, so there is one policy rather than two.
 *
 * Like the other legal paths this one is public — the app itself is behind Cloudflare
 * Access, and Meta has to be able to fetch this without an account.
 */

export const Route = createFileRoute("/privacy")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        getEnv(request, context); // keep the env contract identical to the other routes
        return legalResponse("Privacy", PRIVACY_BODY, today());
      },
    },
  },
});
