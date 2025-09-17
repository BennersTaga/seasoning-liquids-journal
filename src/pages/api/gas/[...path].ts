import type { NextApiRequest, NextApiResponse } from "next";

const BASE = process.env.NEXT_PUBLIC_GAS_API_BASE!;
const KEY = process.env.GAS_API_KEY!;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!BASE || !KEY) {
    res.status(500).json({ error: "Missing GAS env (BASE or KEY)" });
    return;
  }

  const raw = req.query.path ?? "";
  const path = Array.isArray(raw) ? raw.join("/") : String(raw);

  try {
    if (req.method === "GET") {
      const usp = new URLSearchParams();
      for (const [key, value] of Object.entries(req.query)) {
        if (key === "path") continue;
        const val = Array.isArray(value) ? value.join(",") : String(value);
        usp.set(key, val);
      }
      usp.set("path", path);
      usp.set("key", KEY);

      const response = await fetch(`${BASE}?${usp.toString()}`, { cache: "no-store" });
      const text = await response.text();
      res.setHeader("content-type", "application/json");
      res.status(response.status).send(text);
      return;
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};
      const response = await fetch(`${BASE}?key=${encodeURIComponent(KEY)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, path }),
      });
      const text = await response.text();
      res.setHeader("content-type", "application/json");
      res.status(response.status).send(text);
      return;
    }

    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ error: "Method Not Allowed" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(502).json({ error: "Upstream error", detail: message });
  }
}
