// lib/gas.ts (conflict resolved)

// フロントの既定待ち時間（既定 90,000ms）
const DEFAULT_TIMEOUT = Number(
  process.env.NEXT_PUBLIC_GAS_CLIENT_TIMEOUT_MS || "90000",
);

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

export type MadeLogRow = {
  action_id: string;
  factory_code: string;
  lot_id: string;
  flavor_id: string;
  flavor_name: string;
  manufactured_at: string; // "yyyy-MM-dd"
  produced_grams: number;
  produced_packs: number;
  leftover_grams: number | null;
  status: "製造完了" | "全量使用";
};

export type MadeLogResponse = {
  rows: MadeLogRow[];
};

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

  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT;
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
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT;
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

export async function fetchMadeLog(params: {
  factory: string;
  start: string;
  end: string;
}): Promise<MadeLogResponse> {
  const { factory, start, end } = params;
  return apiGet<MadeLogResponse>("made-log", { factory, start, end });
}
