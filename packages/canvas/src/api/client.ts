/** Base HTTP client for the execution API. */

function friendlyMessage(status: number, detail: string | null): string {
  switch (status) {
    case 401:
      return "API key is missing or invalid. Check your .env file.";
    case 403:
      return "Your API key doesn't have permission for this action.";
    case 404:
      return detail ?? "The requested resource was not found.";
    case 422:
      return detail ?? "The request data was invalid.";
    case 429:
      return "Too many requests. Wait a moment and try again.";
    default:
      if (status >= 500)
        return "Server error. Check that the execution service is running.";
      return detail ?? `Unexpected error (${status})`;
  }
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body ?? null;
  }
}

const BASE_URL = "/api";

/** Build a full API URL from a path. Used by both request() and EventSource. */
export function apiUrl(path: string): string {
  return `${BASE_URL}${path}`;
}

export async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const response = await fetch(apiUrl(path), {
    ...options,
    headers: { ...headers, ...options?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail: string | null =
      typeof body?.detail === "string" ? body.detail : null;
    throw new ApiError(
      friendlyMessage(response.status, detail),
      response.status,
      body,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
