import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function getEnv(name: "GAS_BASE_URL" | "GAS_API_KEY"): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

const GAS_BASE_URL = getEnv("GAS_BASE_URL");
const GAS_API_KEY = getEnv("GAS_API_KEY");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string");
}

function buildPath(params: { path?: string[] } | undefined): string {
  if (!params) {
    return "";
  }
  return isStringArray(params.path) ? params.path.join("/") : "";
}

async function relayJsonResponse(response: Response): Promise<NextResponse> {
  const text = await response.text();
  return new NextResponse(text, {
    status: response.status,
    headers: { "content-type": "application/json" },
  });
}

type RouteContext = { params?: { path?: string[] } };

export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const path = buildPath(context.params);
  const searchParams = new URLSearchParams(req.nextUrl.searchParams);
  searchParams.delete("key");
  if (path) {
    searchParams.set("path", path);
  }
  searchParams.set("key", GAS_API_KEY);
  const targetUrl = `${GAS_BASE_URL}?${searchParams.toString()}`;

  const response = await fetch(targetUrl, { cache: "no-store" });
  return relayJsonResponse(response);
}

export async function POST(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const fallbackPath = buildPath(context.params);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  if (!isRecord(body)) {
    return NextResponse.json({ message: "Request body must be a JSON object" }, { status: 400 });
  }

  const rawPath = typeof body.path === "string" ? body.path.trim() : "";
  const resolvedPath = rawPath || fallbackPath;

  if (!resolvedPath) {
    return NextResponse.json({ message: "Missing path for GAS request" }, { status: 400 });
  }

  const payload: Record<string, unknown> = { ...body, path: resolvedPath };
  const response = await fetch(`${GAS_BASE_URL}?key=${encodeURIComponent(GAS_API_KEY)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  return relayJsonResponse(response);
}
