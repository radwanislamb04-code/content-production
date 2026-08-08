export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError("Network error — check your connection and try again.", 0);
  }

  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }

  if (!res.ok) {
    const fromBody =
      json && typeof json === "object" && typeof (json as any).error === "string"
        ? (json as any).error
        : text && text.length < 200
          ? text
          : "";
    const fallback =
      res.status === 400
        ? "Invalid request — please check the inputs."
        : res.status === 404
          ? "Not found."
          : res.status === 502
            ? "The AI service is unavailable right now. Please try again."
            : "Something went wrong on the server.";
    throw new ApiError(fromBody || fallback, res.status);
  }

  return json as T;
}

export const apiGet = <T>(url: string) => request<T>(url);
export const apiPost = <T>(url: string, body?: unknown) =>
  request<T>(url, { method: "POST", body: JSON.stringify(body ?? {}) });
export const apiPut = <T>(url: string, body?: unknown) =>
  request<T>(url, { method: "PUT", body: JSON.stringify(body ?? {}) });
export const apiDelete = <T>(url: string) => request<T>(url, { method: "DELETE" });

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return "Unexpected error. Please try again.";
}
