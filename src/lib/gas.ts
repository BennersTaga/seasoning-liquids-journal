// lib/gas.ts (conflict resolved)

function parseJson<T>(text: string): T {
  try {
    return text ? (JSON.parse(text) as T) : (undefined as T);
  } catch (error) {
    console.debug("[GAS]", { stage: "parse-error", text, error });
    throw error;
  }
}

function createTimeoutController(timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  return { controller, timeoutId };
}

export async function apiGet<T = unknown>(
  path: string,
  params?: Record<string, unknown>,
  opts?: { timeoutMs?: number },
): Promise<T> {
  const usp = new URLSearchParams();
  usp.set("path", path);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value != null) usp.set(key, String(value));
  });

  const url = `/api/gas?${usp.toString()}`;
  console.debug("[GAS]", { stage: "get:start", path, params, url });

  const timeoutMs = opts?.timeoutMs ?? 20000;
  const { controller, timeoutId } = createTimeoutController(timeoutMs);

  try {
    const res = await fetch(url, { method: "GET", signal: controller.signal });
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
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function apiPost<T = unknown>(
  path: string,
  body: unknown,
  opts?: { requestId?: string; timeoutMs?: number },
): Promise<T> {
  console.debug("[GAS]", { stage: "post:start", path, payload: body, opts });
  const timeoutMs = opts?.timeoutMs ?? 20000;
  const { controller, timeoutId } = createTimeoutController(timeoutMs);
  const payload = {
    path,
    ...(body as Record<string, unknown>),
    ...(opts?.requestId ? { request_id: opts.requestId } : {}),
  };

  try {
    const res = await fetch(`/api/gas`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      console.debug("[GAS]", {
        stage: "post:error",
        path,
        payload,
        status: res.status,
        body: text,
      });
      throw new Error(text || `Request failed: ${res.status}`);
    }
    const data = parseJson<T>(text);
    console.debug("[GAS]", { stage: "post:success", path, payload, result: data });
    return data;
  } catch (error) {
    console.debug("[GAS]", { stage: "post:throw", path, payload, error });
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
