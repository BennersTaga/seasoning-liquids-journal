// src/app/api/gas/[...path]/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BASE = process.env.GAS_BASE_URL!;
const KEY  = process.env.GAS_API_KEY!;

type RouteParams = Record<string, string | string[] | undefined>;

function readSegments(params?: RouteParams): string[] {
  const segs = params?.path;
  if (Array.isArray(segs)) return segs;
  if (typeof segs === 'string') return [segs];
  return [];
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const segs = readSegments(await params);
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
  { params }: { params: Promise<RouteParams> }
) {
  const segs = readSegments(await params);
  const path = segs.join('/');
  const raw = await req.text();
  let orig: unknown = {};
  if (raw) {
    try {
      orig = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
  }

  const merged = JSON.stringify({
    path,
    ...(orig && typeof orig === 'object' && !Array.isArray(orig) ? orig : {}),
  });

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
