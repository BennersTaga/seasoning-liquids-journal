export async function apiGet<T = unknown>(path: string, params?: Record<string, string | number | boolean>): Promise<T> {
  const usp = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([key, value]) => {
    usp.set(key, String(value));
  });
  const query = usp.toString();
  const res = await fetch(query ? `/api/gas/${path}?${query}` : `/api/gas/${path}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json();
}

export async function apiPost<T = unknown>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api/gas/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json();
}
