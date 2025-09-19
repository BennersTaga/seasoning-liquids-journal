export type UseType = 'fissule' | 'oem';
export type ActionType = 'KEEP' | 'USE' | 'WASTE' | 'MADE_SPLIT';

export interface RecipeRow { flavor_id: string; row_no: number; ingredient_name: string; qty: number; unit: string }
export interface Masters {
  factories: { factory_code: string; factory_name: string }[];
  locations: { factory_code: string; location_name: string }[];
  flavors: {
    flavor_id: string;
    flavor_name: string;
    liquid_name: string;
    pack_to_gram: number;
    expiry_days: number;
    barcode_code?: string;
  }[];
  recipes: RecipeRow[];
  oem_partners: { partner_name: string }[];
}

export interface OrderRow {
  order_id: string;
  lot_id: string;
  factory_code: string;
  ordered_at: string;
  flavor_id: string;
  use_type: UseType;
  packs: number;                // 0 if OEM
  required_grams: number;
  oem_partner?: string | null;
  archived: boolean;
}

export interface OrderCreateLine {
  flavor_id: string;
  use_type: UseType;
  packs: number;
  required_grams: number;
  oem_partner: string | null;
  oem_grams: number | null;
}

export interface OrderCreateBody {
  factory_code: string;
  lot_id: string;
  ordered_at: string;
  lines: OrderCreateLine[];
}

export interface StorageAggRow {
  lot_id: string;
  factory_code: string;
  flavor_id: string;
  grams: number;
  locations: string[];          // aggregated list
  manufactured_at: string;
}

export interface ActionBody {
  type: ActionType;
  factory_code: string;
  lot_id: string;
  flavor_id: string;
  payload: Record<string, unknown>;
}

export interface OnsiteMakeLeftover {
  location: string;
  grams: number;
}

export interface OnsiteMakeBody {
  factory_code: string;
  flavor_id: string;
  use_type: UseType;
  produced_grams: number;
  manufactured_at: string;
  oem_partner: string | null;
  leftover: OnsiteMakeLeftover | null;
}
