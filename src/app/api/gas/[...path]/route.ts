/* eslint-disable @typescript-eslint/no-explicit-any */
const BASE = process.env.NEXT_PUBLIC_GAS_API_BASE!;
const KEY = process.env.GAS_API_KEY!;

function buildTargetUrl(req: Request, pathSegments: string[]) {
  const url = new URL(req.url);
  url.searchParams.set("path", pathSegments.join("/"));
  url.searchParams.set("key", KEY);
  return `${BASE}?${url.searchParams.toString()}`;
}

export async function GET(req: Request, ctx: any) {
  const path = Array.isArray(ctx?.params?.path) ? ctx?.params?.path : [];
  const target = buildTargetUrl(req, path);
  const res = await fetch(target, { cache: "no-store" });
  return new Response(await res.text(), {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(req: Request, ctx: any) {
  const path = Array.isArray(ctx?.params?.path) ? ctx?.params?.path : [];
  const body = await req.json().catch(() => ({}));
  const target = `${BASE}?key=${encodeURIComponent(KEY)}`;
  const res = await fetch(target, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, path: path.join("/") }),
  });
  return new Response(await res.text(), {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}
