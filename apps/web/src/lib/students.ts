export const studentStatuses = [
  { value: "lead", label: "Lead" },
  { value: "trial", label: "Trial" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "left", label: "Left" },
] as const;

export type StudentStatus = (typeof studentStatuses)[number]["value"];

export type Family = {
  id: string;
  name: string;
};

export type Student = {
  id: string;
  family_id: string | null;
  account_id: string | null;
  full_name: string;
  nickname: string | null;
  date_of_birth: string;
  language: string | null;
  condo_id: string;
  status: StudentStatus;
  start_level: string | null;
  current_level: string | null;
  start_date: string | null;
  medical_notes: string | null;
  allergies: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  photo_consent: boolean;
  data_consent: boolean;
  qr_token: string;
};

// Age in whole years, counted from the date of birth to today.
export function ageFrom(dateOfBirth: string, today = new Date()): number {
  const birth = new Date(`${dateOfBirth}T00:00:00`);
  let age = today.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate());
  if (beforeBirthday) {
    age -= 1;
  }
  return age;
}
