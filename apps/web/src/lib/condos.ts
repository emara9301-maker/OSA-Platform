export type CondoStatus = "draft" | "ready";

export type Condo = {
  id: string;
  name: string;
  area: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  pool_hours: string | null;
  rules: string | null;
  access_notes: string | null;
  contact_phone: string | null;
  status: CondoStatus;
  created_at: string;
  updated_at: string;
};

export type CondoInput = {
  name: string;
  area: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  pool_hours: string | null;
  rules: string | null;
  access_notes: string | null;
  contact_phone: string | null;
};
