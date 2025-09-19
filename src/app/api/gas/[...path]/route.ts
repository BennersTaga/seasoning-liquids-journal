import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BASE = process.env.GAS_BASE_URL!;
const KEY = process.env.GAS_API_KEY!;

export async function GET(req: NextRequest, ctx: { params: { path: string[] } }) {
  const path = ctx.params.path.join('/');
  const url = new URL(req.url);
  url.searchParams.delete('key');
  const qs = url.searchParams.toString();

  const target = `${BASE}?path=${encodeURIComponent(path)}${qs ? `&${qs}` : ''}&key=${encodeURIComponent(KEY)}`;
  const r = await fetch(target, { cache: 'no-store' });
  const text = await r.text();

  return new NextResponse(text, {
    status: r.status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const r = await fetch(`${BASE}?key=${encodeURIComponent(KEY)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  const text = await r.text();

  return new NextResponse(text, {
    status: r.status,
    headers: { 'content-type': 'application/json' },
  });
}
