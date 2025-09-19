import type { ActionBody, Masters, OrderRow, StorageAggRow } from './types';

const BASE = process.env.NEXT_PUBLIC_SHEETS_API_BASE_URL!;
const KEY  = process.env.NEXT_PUBLIC_SHEETS_API_KEY!;

async function getJSON<T>(pathWithQuery: string): Promise<T> {
  const url = `${BASE}?path=${encodeURIComponent(pathWithQuery)}&x-api-key=${encodeURIComponent(KEY)}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`GET ${pathWithQuery} failed: ${res.status}`);
  return res.json();
}

async function postJSON<T>(body: ActionBody): Promise<T> {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'x-api-key': KEY },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST action failed: ${res.status}`);
  return res.json();
}

export const sheetsApi = {
  getMasters:     () => getJSON<Masters>('masters'),
  getOrders:      (factory: string) => getJSON<OrderRow[]>(`orders&factory=${encodeURIComponent(factory)}&archived=false`),
  getStorageAgg:  (factory: string) => getJSON<StorageAggRow[]>(`storage-agg&factory=${encodeURIComponent(factory)}`),
  postAction:     (body: ActionBody) => postJSON(body),
};
