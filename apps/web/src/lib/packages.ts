export const packageTypes = [
  { value: "private_1_1", label: "Private 1:1" },
  { value: "semi_private_1_2", label: "Semi-private 1:2" },
  { value: "small_group", label: "Small group" },
  { value: "adult", label: "Adult" },
] as const;

export const packageBadges = [
  { value: "most_popular", label: "Most popular" },
  { value: "new", label: "New" },
  { value: "promo", label: "Promo" },
] as const;

export type PackageType = (typeof packageTypes)[number]["value"];
export type PackageBadge = (typeof packageBadges)[number]["value"];

export type Package = {
  id: string;
  name: string;
  short_pitch: string | null;
  age_min: number | null;
  age_max: number | null;
  level_range: string | null;
  type: PackageType;
  sessions_count: number;
  validity_days: number;
  session_minutes: number;
  price: number | null;
  price_per_session: number | null;
  badge: PackageBadge | null;
  image_url: string | null;
  is_active: boolean;
};

export type PackageInput = Omit<Package, "id" | "price_per_session">;
