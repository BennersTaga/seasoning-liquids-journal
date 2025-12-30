export type UseType = 'fissule' | 'oem';

export interface RecipeRow { flavor_id: string; row_no: number; ingredient_name: string; qty: number; unit: string }
export interface Masters {
  factories: { factory_code: string; factory_name: string }[];
  locations: { factory_code: string; location_name: string }[];
  uses?: { use_code: string; use_name: string; use_type: UseType }[];
  use_flavors?: { use_code: string; flavor_id: string }[];
  reporters?: {
    reporter_id?: string;
    reporter_name: string;
    factory_code?: string;
    active?: string;
    sort_order?: number;
  }[];
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
  use_code?: string;
  packs: number;                // 0 if OEM
  made_packs?: number;
  packs_remaining?: number;
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
  packs_equiv?: number | null;
}

export interface ActionBody {
  path: 'action' | 'onsite-make' | 'orders-create';
  type?: 'KEEP' | 'USE' | 'WASTE' | 'MADE_SPLIT';
  factory_code: string;
  lot_id?: string;
  flavor_id?: string;
  payload?: Record<string, unknown>;
  /** 冪等キー（クライアント生成UUID） */
  request_id?: string;
}

export interface MadeSummaryItem {
  factory_code: string;
  factory_name: string;
  use_code: string;
  use_name: string;
  use_type: UseType;
  flavor_id: string;
  flavor_name: string;
  grams: number;
  packs_equiv: number;
}

export interface MadeSummaryFlavorItem {
  flavor_id: string;
  flavor_name: string;
  grams: number;
  packs_equiv: number;
}

export interface MadeSummaryUseItem {
  use_code: string;
  use_name: string;
  use_type: UseType;
  total_grams: number;
  total_packs_equiv: number;
  items: MadeSummaryFlavorItem[];
}

export interface MadeSummaryFactoryItem {
  factory_code: string;
  factory_name: string;
  total_grams: number;
  total_packs_equiv: number;
  uses: MadeSummaryUseItem[];
}

export interface MadeSummaryResponse {
  start: string;
  end: string;
  rows: MadeSummaryItem[];
  factories: MadeSummaryFactoryItem[];
}
