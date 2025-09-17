export type UseType = 'fissule' | 'oem';

export interface Factory { code: string; name: string }
export interface Location { factory_code: string; location_name: string }
export interface Flavor { id: string; flavorName: string; liquidName: string; packToGram: number; expiryDays: number }
export interface RecipeRow { flavor_id: string; row_no: number; ingredient_name: string; qty: number; unit: string }
export interface Masters {
  factories: Factory[];
  locations: Location[];
  flavors: Flavor[];
  recipes: RecipeRow[];
  oems: string[];
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

export interface StorageAggRow {
  lot_id: string;
  factory_code: string;
  flavor_id: string;
  grams: number;
  locations: string[];          // aggregated list
  manufactured_at: string;
}

export interface ActionBody {
  path: 'action';
  type: 'KEEP'|'USE'|'WASTE'|'MADE_SPLIT';
  factory_code: string;
  lot_id: string;
  flavor_id: string;
  payload: Record<string, unknown>;
}
