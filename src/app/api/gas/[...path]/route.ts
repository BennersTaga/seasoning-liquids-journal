import { NextRequest, NextResponse } from "next/server";

const GAS_BASE_URL = process.env.GAS_BASE_URL;
const GAS_API_KEY = process.env.GAS_API_KEY;

type Params = { params: { path?: string[] } };

function ensureEnv(value: string | undefined, key: string) {
  if (!value) {
    throw new Error(`${key} is not configured`);
  }
  return value;
}

function buildGasUrl(path: string, searchParams?: URLSearchParams) {
  const base = ensureEnv(GAS_BASE_URL, "GAS_BASE_URL");
  const key = ensureEnv(GAS_API_KEY, "GAS_API_KEY");

  const url = new URL(base);
  url.searchParams.set("path", path);
  url.searchParams.set("key", key);

  if (searchParams) {
    searchParams.forEach((value, paramKey) => {
      if (paramKey === "path" || paramKey === "key") return;
      url.searchParams.append(paramKey, value);
    });
  }

  return url;
}

async function forwardRequest(
  request: NextRequest,
  method: "GET" | "POST",
  path: string,
) {
  try {
    const targetUrl = buildGasUrl(path, request.nextUrl.searchParams);
    const headers = new Headers();

    if (method === "POST") {
      const contentType = request.headers.get("content-type");
      if (contentType) {
        headers.set("content-type", contentType);
      }
    }

    const init: RequestInit = {
      method,
      headers,
      cache: "no-store",
    };

    if (method === "POST") {
      init.body = await request.text();
    }

    const response = await fetch(targetUrl.toString(), init);
    const text = await response.text();

    if (!response.ok) {
      let errorPayload: unknown = text;
      try {
        errorPayload = text ? JSON.parse(text) : null;
      } catch {
        errorPayload = text || response.statusText;
      }

      return NextResponse.json(
        {
          ok: false,
          status: response.status,
          error: errorPayload,
        },
        { status: 500 },
      );
    }

    if (response.status === 204) {
      return new NextResponse(null, { status: 204 });
    }

    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        return NextResponse.json(
          {
            ok: false,
            error: "Invalid JSON response from GAS",
          },
          { status: 500 },
        );
      }
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("[GAS] proxy error", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

function extractPath(params: Params["params"]) {
  const segments = params?.path ?? [];
  const joined = Array.isArray(segments) ? segments.join("/") : String(segments ?? "");
  return joined.trim();
}

export async function GET(request: NextRequest, context: Params) {
  const path = extractPath(context.params);
  if (!path) {
    return NextResponse.json({ ok: false, error: "Missing path" }, { status: 400 });
  }
  return forwardRequest(request, "GET", path);
}

export async function POST(request: NextRequest, context: Params) {
  const path = extractPath(context.params);
  if (!path) {
    return NextResponse.json({ ok: false, error: "Missing path" }, { status: 400 });
  }
  return forwardRequest(request, "POST", path);
}
