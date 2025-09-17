import type { NextRequest } from "next/server";

const BASE = process.env.NEXT_PUBLIC_GAS_API_BASE!;
const KEY = process.env.GAS_API_KEY!;

function buildForwardUrl(base: string, searchParams: URLSearchParams) {
  const query = searchParams.toString();
  return query ? `${base}?${query}` : `${base}`;
}

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  const path = params.path.join("/");
  const url = new URL(req.url);
  url.searchParams.set("path", path);
  url.searchParams.set("key", KEY);

  const res = await fetch(buildForwardUrl(BASE, url.searchParams), {
    cache: "no-store",
  });
  const txt = await res.text();

  return new Response(txt, {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(req: NextRequest, { params }: { params: { path: string[] } }) {
  const path = params.path.join("/");
  const body = await req.json().catch(() => ({}));

  const res = await fetch(`${BASE}?key=${encodeURIComponent(KEY)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, path }),
  });
  const txt = await res.text();

  return new Response(txt, {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}
