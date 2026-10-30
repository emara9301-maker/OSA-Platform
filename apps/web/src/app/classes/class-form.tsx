import { classTypes, weekdays, type ClassRow } from "@/lib/classes";
import { saveClass } from "./actions";
import { CondoPoolFields } from "./condo-pool-fields";

type Option = { id: string; name: string };

export function ClassForm({
  item,
  condos,
  pools,
  coaches,
  levels,
  error,
}: {
  item: ClassRow | null;
  condos: Option[];
  pools: { id: string; name: string; condo_id: string }[];
  coaches: Option[];
  levels: Option[];
  error?: string;
}) {
  return (
    <form action={saveClass}>
      {item && <input type="hidden" name="id" value={item.id} />}

      <Field label="Class name" name="name" value={item?.name} required />

      <CondoPoolFields condos={condos} pools={pools} condoId={item?.condo_id} poolId={item?.pool_id ?? undefined} />
      <Select label="Coach" name="coach_id" value={item?.coach_id} options={coaches} />
      <Select label="Level" name="level_id" value={item?.level_id} options={levels} />

      <label>
        Type
        <select name="class_type" defaultValue={item?.class_type ?? "group"}>
          {classTypes.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label>
        Repeats every
        <select name="weekday" defaultValue={item?.weekday ?? 2}>
          {weekdays.map((day) => (
            <option key={day.value} value={day.value}>
              {day.label}
            </option>
          ))}
        </select>
      </label>

      <Field label="Start time" name="start_time" type="time" value={item?.start_time?.slice(0, 5)} required />
      <Field label="Length (minutes)" name="duration_minutes" type="number" value={item?.duration_minutes ?? 45} required />
      <Field label="Capacity (students)" name="capacity" type="number" value={item?.capacity ?? 6} required />
      <Field label="First lesson date" name="start_date" type="date" value={item?.start_date} required />
      <Field label="Last lesson date" name="end_date" type="date" value={item?.end_date} required />

      <button type="submit">{item ? "Save changes" : "Add class"}</button>
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
  value?: string | number | null;
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

function Select({ label, name, value, options }: { label: string; name: string; value?: string; options: Option[] }) {
  return (
    <label>
      {label}
      <select name={name} defaultValue={value ?? ""} required>
        <option value="" disabled>
          Choose
        </option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}
