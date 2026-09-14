/**
 * Path segments for the API routes that take a parameter.
 *
 * Verified on the live Worker: `params` is NOT populated for these handlers
 * there — `/api/library/script/<a real id>` answered with the route's own 404,
 * and `/api/library/script` returned `[]` although 17 scripts exist, because the
 * bound parameter was `undefined`. Reading the segments from the request URL
 * works regardless, so these routes use `params` only as a first choice.
 */

export function pathSegments(request: Request, after: string): string[] {
  const { pathname } = new URL(request.url);
  const index = pathname.indexOf(after);
  const tail = index >= 0 ? pathname.slice(index + after.length) : "";
  return tail
    .split("/")
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    })
    .filter(Boolean);
}
