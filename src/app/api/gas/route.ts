// app/api/gas/route.ts (conflict resolved)

import { NextRequest, NextResponse } from "next/server";

const GAS_BASE_URL = process.env.GAS_BASE_URL;
const GAS_API_KEY = process.env.GAS_API_KEY;
// ルートの待ち時間（既定 90,000ms）
const ROUTE_TIMEOUT_MS = Number(process.env.GAS_ROUTE_TIMEOUT_MS || "90000");

function ensureEnv() {
  if (!GAS_BASE_URL) throw new Error("GAS_BASE_URL is not set");
  if (!GAS_API_KEY) throw new Error("GAS_API_KEY is not set");
}

export async function GET(req: NextRequest) {
  try {
    ensureEnv();

    // proxy all incoming query params and force-inject the secret key on the server
    const url = new URL(GAS_BASE_URL as string);
    req.nextUrl.searchParams.forEach((value, key) => {
      url.searchParams.set(key, value);
    });
    url.searchParams.set("key", GAS_API_KEY as string);

    const signal = AbortSignal.timeout(ROUTE_TIMEOUT_MS);
    const res = await fetch(url.toString(), { cache: "no-store", signal });
    const body = await res.text();

    return new NextResponse(body, {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    ensureEnv();

    // Send key via query param (always), and also inject into JSON body if applicable.
    const url = new URL(GAS_BASE_URL as string);
    url.searchParams.set("key", GAS_API_KEY as string);

    const contentType = req.headers.get("content-type") || "application/json";
    const raw = await req.text();

    let bodyToSend = raw;

    if (contentType.includes("application/json")) {
      try {
        const parsed = raw ? JSON.parse(raw) : {};
        if (parsed && typeof parsed === "object" && parsed.key == null) {
          parsed.key = GAS_API_KEY;
        }
        bodyToSend = JSON.stringify(parsed);
      } catch {
        // If body isn't valid JSON, just forward as-is; key is already in query
        bodyToSend = raw;
      }
    }

    const signal = AbortSignal.timeout(ROUTE_TIMEOUT_MS);
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: { "content-type": contentType },
      body: bodyToSend,
      cache: "no-store",
      signal,
    });

    const text = await res.text();

    return new NextResponse(text, {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
