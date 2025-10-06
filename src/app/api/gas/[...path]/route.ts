// src/app/api/gas/[...path]/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BASE = process.env.GAS_BASE_URL!;
const KEY  = process.env.GAS_API_KEY!;

type ParamsValue =
  | { path?: string | string[] }
  | Record<string, string | string[] | undefined>
  | undefined;

type ParamsSource = ParamsValue | Promise<Record<string, string | string[] | undefined>>;

function isPromise<T>(value: unknown): value is PromiseLike<T> {
  return !!value && typeof value === 'object' && 'then' in value && typeof (value as { then: unknown }).then === 'function';
}

async function readSegments(params: ParamsSource | undefined): Promise<string[]> {
  if (isPromise<Record<string, string | string[] | undefined>>(params)) {
    return readSegments(await params);
  }
  const raw = (params as ParamsValue)?.path;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') return [raw];
  return [];
}

type PromiseContext = { params: Promise<Record<string, string | string[] | undefined>> };
type HandlerContext = { params: { path?: string[] } } | PromiseContext;

export async function GET(
  req: NextRequest,
  { params }: { params: { path?: string[] } }
): Promise<NextResponse>;
export async function GET(
  req: NextRequest,
  { params }: PromiseContext
): Promise<NextResponse>;
export async function GET(
  req: NextRequest,
  { params }: HandlerContext
): Promise<NextResponse> {
  const segs = await readSegments(params);
  const path = segs.join('/');

  const url = new URL(req.url);
  url.searchParams.delete('key'); // フロントからの key は無視
  const qs = url.searchParams.toString();
  const target =
    `${BASE}?${path ? `path=${encodeURIComponent(path)}&` : ''}` +
    `${qs ? `${qs}&` : ''}key=${KEY}`;

  const r = await fetch(target, { cache: 'no-store' });
  const text = await r.text();
  return new NextResponse(text, {
    status: r.status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { path?: string[] } }
): Promise<NextResponse>;
export async function POST(
  req: NextRequest,
  { params }: PromiseContext
): Promise<NextResponse>;
export async function POST(
  req: NextRequest,
  { params }: HandlerContext
): Promise<NextResponse> {
  const segs = await readSegments(params);
  const path = segs.join('/');
  const raw = await req.text();
  let orig: unknown = {};
  if (raw) {
    try { orig = JSON.parse(raw); }
    catch { return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 }); }
  }

  const payload = normalizePostBody(path, orig);
  const merged = JSON.stringify(payload);

  const r = await fetch(`${BASE}?key=${KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: merged,
  });
  const text = await r.text();
  return new NextResponse(text, {
    status: r.status,
    headers: { 'content-type': 'application/json' },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizePostBody(path: string, orig: unknown): Record<string, unknown> {
  const base = isRecord(orig) ? { ...orig } : {};
  const body: Record<string, unknown> = { path, ...base };

  if (body.path === 'action' && typeof body.type === 'string') {
    const actionPayload = body.payload;
    if (body.type === 'WASTE' && isRecord(actionPayload)) {
      const grams = actionPayload.grams;
      if (typeof grams === 'number' && !Number.isNaN(grams) && !('qty' in actionPayload)) {
        body.payload = { ...actionPayload, qty: grams };
      }
    }
  }

  return body;
}
