export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE = process.env.GAS_BASE_URL!;
const KEY = process.env.GAS_API_KEY!;

function toJSONResponse(r: Response, body: string) {
  return new Response(body, {
    status: r.status,
    headers: { "content-type": "application/json" },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function GET(req: Request, context: any) {
  const pathParam = context?.params?.path;
  const seg = Array.isArray(pathParam)
    ? pathParam.join("/")
    : typeof pathParam === "string"
      ? pathParam
      : "";
  const url = new URL(req.url);
  url.searchParams.delete("key");
  const qs = url.searchParams.toString();
  const target = `${BASE}?path=${encodeURIComponent(seg)}${qs ? `&${qs}` : ""}&key=${encodeURIComponent(KEY)}`;
  const r = await fetch(target, { cache: "no-store" });
  return toJSONResponse(r, await r.text());
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function POST(req: Request, context: any) {
  const pathParam = context?.params?.path;
  const seg = Array.isArray(pathParam)
    ? pathParam.join("/")
    : typeof pathParam === "string"
      ? pathParam
      : "";
  const body = await req.text();
  const target = `${BASE}?path=${encodeURIComponent(seg)}&key=${encodeURIComponent(KEY)}`;
  const r = await fetch(target, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  return toJSONResponse(r, await r.text());
}
