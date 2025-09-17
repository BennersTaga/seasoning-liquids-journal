import useSWR from "swr";
import { apiGet } from "@/lib/gas";
import type { Masters } from "@/lib/sheets/types";

export function useMasters(enabled = true) {
  return useSWR(enabled ? ["masters"] : null, enabled ? () => apiGet<Masters>("masters") : null, {
    revalidateOnFocus: false,
    dedupingInterval: 30 * 60 * 1000,
  });
}
