import { NextRequest, NextResponse } from "next/server";

const BASE = process.env.NEXT_PUBLIC_GAS_API_BASE!;
const KEY = process.env.GAS_API_KEY!;

function ensureEnv() {
  if (!BASE || !KEY) {
    return NextResponse.json(
      { error: "Missing GAS env (BASE or KEY)" },
      { status: 500 },
    );
  }
  return null;
}

export async function GET(req: NextRequest, context: unknown) {
  const missing = ensureEnv();
  if (missing) return missing;

  const ctx = context as { params?: Record<string, string | string[]> };
  const raw = ctx.params?.path;
  const segments = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const path = segments.join("/");

  try {
    const search = new URLSearchParams(req.nextUrl.searchParams);
    search.set("path", path);
    search.set("key", KEY);

    const response = await fetch(`${BASE}?${search.toString()}`, { cache: "no-store" });
    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "Upstream error", detail: message }, { status: 502 });
  }
}

export async function POST(req: NextRequest, context: unknown) {
  const missing = ensureEnv();
  if (missing) return missing;

  const ctx = context as { params?: Record<string, string | string[]> };
  const raw = ctx.params?.path;
  const segments = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const path = segments.join("/");

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const response = await fetch(`${BASE}?key=${encodeURIComponent(KEY)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...(body as Record<string, unknown>), path }),
    });
    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "Upstream error", detail: message }, { status: 502 });
  }
}
