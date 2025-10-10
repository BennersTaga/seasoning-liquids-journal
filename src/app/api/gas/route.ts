import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const base = process.env.GAS_BASE_URL;
  const key = process.env.GAS_API_KEY;
  if (!base || !key) {
    return NextResponse.json({ error: "GAS env not set" }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const path = searchParams.get("path") || "";
  const start = searchParams.get("start") || "";
  const end = searchParams.get("end") || "";
  const factory = searchParams.get("factory") || "";

  const url = new URL(base);
  url.searchParams.set("path", path);
  if (start) url.searchParams.set("start", start);
  if (end) url.searchParams.set("end", end);
  if (factory) url.searchParams.set("factory", factory);
  url.searchParams.set("key", key);

  const r = await fetch(url.toString(), { cache: "no-store" });
  const body = await r.text();
  return new NextResponse(body, {
    status: r.status,
    headers: { "content-type": r.headers.get("content-type") || "application/json" },
  });
}

export async function POST(req: NextRequest) {
  const base = process.env.GAS_BASE_URL;
  const key = process.env.GAS_API_KEY;
  if (!base || !key) {
    return NextResponse.json({ error: "GAS env not set" }, { status: 500 });
  }

  const payload = await req.json().catch(() => ({}));
  const url = new URL(base);

  const r = await fetch(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...payload, key }),
    cache: "no-store",
  });
  const text = await r.text();
  return new NextResponse(text, {
    status: r.status,
    headers: { "content-type": r.headers.get("content-type") || "application/json" },
  });
}
