import { NextRequest } from "next/server";

const GAS_BASE_URL = process.env.GAS_BASE_URL!;
const GAS_API_KEY = process.env.GAS_API_KEY!;

function ensureEnv() {
  if (!GAS_BASE_URL) throw new Error("GAS_BASE_URL is not set");
  if (!GAS_API_KEY) throw new Error("GAS_API_KEY is not set");
}

export async function GET(req: NextRequest) {
  try {
    ensureEnv();
    const url = new URL(GAS_BASE_URL);
    const inParams = req.nextUrl.searchParams;
    inParams.forEach((value, key) => {
      url.searchParams.set(key, value);
    });
    url.searchParams.set("key", GAS_API_KEY);

    const res = await fetch(url.toString(), { cache: "no-store" });
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ status: 500, error: message }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    ensureEnv();
    const url = new URL(GAS_BASE_URL);
    url.searchParams.set("key", GAS_API_KEY);

    const body = await req.text();
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      cache: "no-store",
    });
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ status: 500, error: message }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      },
    );
  }
}
