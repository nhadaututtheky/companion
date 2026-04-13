/**
 * Base request utility for the API client.
 */

export const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const storedKey = typeof window !== "undefined" ? (localStorage.getItem("api_key") ?? "") : "";
  const apiKey = storedKey === "__no_auth__" ? "" : storedKey;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["X-API-Key"] = apiKey;

  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { ...headers, ...(opts?.headers as Record<string, string>) },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }

  return res.json() as Promise<T>;
}
