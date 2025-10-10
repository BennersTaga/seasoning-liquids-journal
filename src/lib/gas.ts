export async function apiGet<T = unknown>(path: string, params?: Record<string, string>) {
  const url = new URL("/api/gas", window.location.origin);
  url.searchParams.set("path", path);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value != null) {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url.toString(), { method: "GET" });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as T;
}

export async function apiPost<T = unknown>(path: string, body?: Record<string, unknown>) {
  const response = await fetch("/api/gas", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path, ...(body ?? {}) }),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as T;
}
