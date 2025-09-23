// src/app/api/gas/[...path]/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BASE = process.env.GAS_BASE_URL!;
const KEY  = process.env.GAS_API_KEY!;

type RouteContext = { params?: { path?: string[] } };

export async function GET(req: NextRequest, context: RouteContext) {
  const segs: string[] = Array.isArray(context?.params?.path) ? context.params.path ?? [] : [];
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

export async function POST(req: NextRequest) {
  const r = await fetch(`${BASE}?key=${KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: await req.text(),
  });
  const text = await r.text();
  return new NextResponse(text, {
    status: r.status,
    headers: { 'content-type': 'application/json' },
  });
}
