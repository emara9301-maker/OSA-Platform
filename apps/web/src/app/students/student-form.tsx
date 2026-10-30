import type { Family } from "@/lib/students";
import type { Student } from "@/lib/students";
import { studentStatuses } from "@/lib/students";
import { saveStudent } from "./actions";

export type CondoOption = { id: string; name: string };

export function StudentForm({
  student,
  condos,
  families,
  defaultFamilyId,
  error,
}: {
  student: Student | null;
  condos: CondoOption[];
  families: Family[];
  defaultFamilyId?: string;
  error?: string;
}) {
  return (
    <form action={saveStudent}>
      {student && <input type="hidden" name="id" value={student.id} />}

      <Field label="Full name" name="full_name" value={student?.full_name} required />
      <Field label="Nickname" name="nickname" value={student?.nickname} />
      <Field label="Date of birth" name="date_of_birth" type="date" value={student?.date_of_birth} required />
      <Field label="Language spoken" name="language" value={student?.language} />

      <label>
        Condo
        <select name="condo_id" defaultValue={student?.condo_id ?? ""} required>
          <option value="" disabled>
            Choose a condo
          </option>
          {condos.map((condo) => (
            <option key={condo.id} value={condo.id}>
              {condo.name}
            </option>
          ))}
        </select>
      </label>

      <label>
        Family
        <select name="family_id" defaultValue={student?.family_id ?? defaultFamilyId ?? ""}>
          <option value="">No family (independent adult)</option>
          {families.map((family) => (
            <option key={family.id} value={family.id}>
              {family.name}
            </option>
          ))}
        </select>
      </label>

      <label>
        Status
        <select name="status" defaultValue={student?.status ?? "lead"}>
          {studentStatuses.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <p className="pool-area">Start level, current level and start date are set from the classes the student joins and attends.</p>

      <TextArea label="Medical notes" name="medical_notes" value={student?.medical_notes} />
      <TextArea label="Allergies" name="allergies" value={student?.allergies} />
      <Field label="Emergency contact name" name="emergency_contact_name" value={student?.emergency_contact_name} />
      <Field label="Emergency contact phone" name="emergency_contact_phone" type="tel" value={student?.emergency_contact_phone} />

      <label>
        <input type="checkbox" name="photo_consent" defaultChecked={student?.photo_consent ?? false} />
        Photo and video consent
      </label>
      <label>
        <input type="checkbox" name="data_consent" defaultChecked={student?.data_consent ?? false} />
        Data consent (PDPA)
      </label>

      <button type="submit">{student ? "Save changes" : "Add student"}</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

function Field({
  label,
  name,
  value,
  type = "text",
  required,
}: {
  label: string;
  name: string;
  value?: string | null;
  type?: string;
  required?: boolean;
}) {
  return (
    <label>
      {label}
      <input name={name} type={type} defaultValue={value ?? ""} required={required} />
    </label>
  );
}

function TextArea({ label, name, value }: { label: string; name: string; value?: string | null }) {
  return (
    <label>
      {label}
      <textarea name={name} defaultValue={value ?? ""} />
    </label>
  );
}
