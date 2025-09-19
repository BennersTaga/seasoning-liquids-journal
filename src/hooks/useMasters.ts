import useSWR from "swr";

import { getMasters } from "@/lib/gas";
import type { Masters } from "@/lib/sheets/types";

export function useMasters() {
  return useSWR<Masters>(
    ["masters"],
    () => getMasters(),
    { revalidateOnFocus: false, dedupingInterval: 30 * 60 * 1000 },
  );
}
