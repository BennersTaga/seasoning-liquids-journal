import type { NextRequest } from "next/server";

const BASE = process.env.NEXT_PUBLIC_GAS_API_BASE!;
const KEY = process.env.GAS_API_KEY!;

function buildPath(params?: { path?: string[] }) {
  return Array.isArray(params?.path) ? params?.path.join("/") : "";
}

export async function GET(request: NextRequest, context: { params: { path: string[] } }) {
  const path = buildPath(context.params);
  const url = new URL(request.url);
  url.searchParams.set("path", path);
  url.searchParams.set("key", KEY);

  const response = await fetch(`${BASE}?${url.searchParams.toString()}`, { cache: "no-store" });
  const text = await response.text();

  return new Response(text, {
    status: response.status,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(request: NextRequest, context: { params: { path: string[] } }) {
  const path = buildPath(context.params);
  const body = await request.json().catch(() => ({}));

  const response = await fetch(`${BASE}?key=${encodeURIComponent(KEY)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, path }),
  });
  const text = await response.text();

  return new Response(text, {
    status: response.status,
    headers: { "content-type": "application/json" },
  });
}
