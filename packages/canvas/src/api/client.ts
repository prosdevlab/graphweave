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

const BASE_URL = "/api";

export async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const apiKey = import.meta.env.VITE_API_KEY;
  if (apiKey) {
    headers["X-API-Key"] = apiKey;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    headers,
    ...options,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail: string | null =
      typeof body?.detail === "string" ? body.detail : null;
    throw new Error(friendlyMessage(response.status, detail));
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
