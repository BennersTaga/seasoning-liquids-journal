const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";
const API_KEY = process.env.NEXT_PUBLIC_API_KEY ?? "";

type QueryValue = string | number | boolean | null | undefined;
type QueryParams = Record<string, QueryValue>;

type ApiResult<T> = {
  data: T | null;
  status: number;
  etag?: string | null;
};

function buildUrl(path: string, params?: QueryParams) {
  const hasOrigin = /^https?:/i.test(path);
  if (!hasOrigin && !API_BASE) {
    throw new Error(
      "Missing NEXT_PUBLIC_API_BASE for relative request: " + path,
    );
  }

  const base = hasOrigin ? undefined : API_BASE.replace(/\/$/, "");
  const normalizedPath = hasOrigin ? path : path.replace(/^\//, "");
  const target = hasOrigin ? normalizedPath : `${base}/${normalizedPath}`;
  const url = new URL(target);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      url.searchParams.set(key, String(value));
    });
  }

  return url;
}

function applyHeaders(etag?: string) {
  const headers = new Headers();
  if (API_KEY) {
    headers.set("x-api-key", API_KEY);
  }
  if (etag) {
    headers.set("If-None-Match", etag);
  }
  return headers;
}

async function parseResponse<T>(response: Response): Promise<ApiResult<T>> {
  const etag = response.headers.get("etag");
  const status = response.status;
  if (status === 204 || status === 304) {
    return { data: null, status, etag };
  }

  const text = await response.text();
  const data = text ? (JSON.parse(text) as T) : null;
  return { data, status, etag };
}

export async function apiGet<T = unknown>(
  path: string,
  params?: QueryParams,
): Promise<ApiResult<T>> {
  const query: QueryParams = { ...(params ?? {}) };
  const etag = typeof query.etag === "string" ? query.etag : undefined;
  if ("etag" in query) {
    delete query.etag;
  }

  const url = buildUrl(path, query);
  const response = await fetch(url, {
    method: "GET",
    headers: applyHeaders(etag),
    cache: "no-store",
  });

  return parseResponse<T>(response);
}

export async function apiPost<T = unknown>(
  path: string,
  body: unknown,
): Promise<ApiResult<T>> {
  const url = buildUrl(path);
  const headers = applyHeaders();
  headers.set("content-type", "application/json");

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body ?? {}),
  });

  return parseResponse<T>(response);
}
