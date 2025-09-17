import useSWR from 'swr';
import { sheetsApi } from './api';
import type { Masters, OrderRow, StorageAggRow, ActionBody } from './types';

export function useMasters(enabled = true) {
  return useSWR<Masters>(enabled ? 'masters' : null, enabled ? () => sheetsApi.getMasters() : null, { revalidateOnFocus:false, dedupingInterval: 30*60*1000 });
}
export function useOrders(factory: string | undefined) {
  return useSWR<OrderRow[]>(factory ? ['orders', factory] : null, () => sheetsApi.getOrders(factory!), { revalidateOnFocus:false });
}
export function useStorageAgg(factory: string | undefined) {
  return useSWR<StorageAggRow[]>(factory ? ['storage-agg', factory] : null, () => sheetsApi.getStorageAgg(factory!), { revalidateOnFocus:false });
}

export async function postAction(body: ActionBody) {
  return sheetsApi.postAction(body);
}
