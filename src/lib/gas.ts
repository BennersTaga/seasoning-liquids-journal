// lib/gas.ts (conflict resolved)

function parseJson<T>(text: string): T {
  try {
    return text ? (JSON.parse(text) as T) : (undefined as T);
  } catch (error) {
    console.debug("[GAS]", { stage: "parse-error", text, error });
    throw error;
  }
}

export async function apiGet<T = unknown>(
  path: string,
  params?: Record<string, unknown>,
): Promise<T> {
  const usp = new URLSearchParams();
  usp.set("path", path);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value != null) usp.set(key, String(value));
  });

  const url = `/api/gas?${usp.toString()}`;
  console.debug("[GAS]", { stage: "get:start", path, params, url });

  const res = await fetch(url, { method: "GET" });
  const text = await res.text();

  if (!res.ok) {
    console.debug("[GAS]", {
      stage: "get:error",
      path,
      params,
      status: res.status,
      body: text,
    });
    throw new Error(text || `Request failed: ${res.status}`);
  }

  const data = parseJson<T>(text);
  console.debug("[GAS]", { stage: "get:success", path, params, result: data });
  return data;
}

export async function apiPost<T = unknown>(path: string, body: unknown): Promise<T> {
  console.debug("[GAS]", { stage: "post:start", path, payload: body });
  try {
    const res = await fetch(`/api/gas`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path, ...(body as Record<string, unknown>) }),
    });
    const text = await res.text();
    if (!res.ok) {
      console.debug("[GAS]", {
        stage: "post:error",
        path,
        payload: body,
        status: res.status,
        body: text,
      });
      throw new Error(text || `Request failed: ${res.status}`);
    }
    const data = parseJson<T>(text);
    console.debug("[GAS]", { stage: "post:success", path, payload: body, result: data });
    return data;
  } catch (error) {
    console.debug("[GAS]", { stage: "post:throw", path, payload: body, error });
    throw error;
  }
}
