import useSWR from "swr";

import { apiGet } from "@/lib/gas";
import type { Masters } from "@/lib/sheets/types";

export function useMasters() {
  return useSWR<Masters>(
    ["masters"],
    () => apiGet<Masters>("masters"),
    { revalidateOnFocus: false, dedupingInterval: 30 * 60 * 1000 },
  );
}
