export const weekdays = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 7, label: "Sunday" },
] as const;

export const classTypes = [
  { value: "group", label: "Group" },
  { value: "private", label: "Private" },
] as const;

export type ClassRow = {
  id: string;
  name: string;
  condo_id: string;
  coach_id: string;
  level_id: string;
  class_type: "group" | "private";
  weekday: number;
  start_time: string;
  duration_minutes: number;
  capacity: number;
  start_date: string;
  end_date: string;
};

export type SessionRow = {
  id: string;
  starts_at: string;
  status: "scheduled" | "paused" | "cancelled" | "done";
  cancel_reason: string | null;
};
