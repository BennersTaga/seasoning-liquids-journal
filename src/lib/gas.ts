import type {
  ActionBody,
  Masters,
  OnsiteMakeBody,
  OrderCreateBody,
} from "./sheets/types";

function parseJson<T>(text: string): T {
  try {
    return text ? (JSON.parse(text) as T) : (undefined as T);
  } catch (error) {
    console.debug("[GAS]", { stage: "parse-error", text, error });
    throw error;
  }
}

export async function apiGet<T = unknown>(path: string, params?: Record<string, unknown>): Promise<T> {
  const usp = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    usp.set(key, String(value));
  });
  const query = usp.toString();
  const url = query ? `/api/gas/${path}?${query}` : `/api/gas/${path}`;

  console.debug("[GAS]", { stage: "get:start", path, params });
  try {
    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();
    if (!res.ok) {
      console.debug("[GAS]", { stage: "get:error", path, params, status: res.status, body: text });
      throw new Error(text || `Request failed: ${res.status}`);
    }
    const data = parseJson<T>(text);
    console.debug("[GAS]", { stage: "get:success", path, params, result: data });
    return data;
  } catch (error) {
    console.debug("[GAS]", { stage: "get:throw", path, params, error });
    throw error;
  }
}

export async function apiPost<T = unknown>(path: string, body: unknown): Promise<T> {
  console.debug("[GAS]", { stage: "post:start", path, payload: body });
  try {
    const res = await fetch(`/api/gas/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      console.debug("[GAS]", { stage: "post:error", path, payload: body, status: res.status, body: text });
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

export const getMasters = () => apiGet<Masters>("masters");

export const postOrdersCreate = (body: OrderCreateBody) =>
  apiPost("orders-create", body);

export const postAction = (body: ActionBody) => apiPost("action", body);

export const postOnsiteMake = (body: OnsiteMakeBody) =>
  apiPost("onsite-make", body);
