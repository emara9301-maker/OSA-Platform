import type { Package } from "@/lib/packages";
import { packageBadges, packageTypes } from "@/lib/packages";
import { savePackage } from "./actions";

export function PackageForm({ item, error }: { item: Package | null; error?: string }) {
  return (
    <form action={savePackage}>
      {item && <input type="hidden" name="id" value={item.id} />}
      <input type="hidden" name="current_image_url" value={item?.image_url ?? ""} />

      <Field label="Name" name="name" value={item?.name} required />
      <Field label="Short pitch" name="short_pitch" value={item?.short_pitch} />

      <label>
        Type
        <select name="type" defaultValue={item?.type ?? "private_1_1"}>
          {packageTypes.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <Field label="Age from" name="age_min" type="number" value={item?.age_min} />
      <Field label="Age to" name="age_max" type="number" value={item?.age_max} />
      <Field label="Level range" name="level_range" value={item?.level_range} />
      <Field label="Sessions per package" name="sessions_count" type="number" value={item?.sessions_count} required />
      <Field label="Validity (days)" name="validity_days" type="number" value={item?.validity_days ?? 30} required />
      <Field label="Session length (minutes)" name="session_minutes" type="number" value={item?.session_minutes} required />
      <Field label="Price (RM, leave empty until OSA sends prices)" name="price" type="number" step="0.01" value={item?.price} />

      <label>
        Badge
        <select name="badge" defaultValue={item?.badge ?? ""}>
          <option value="">None</option>
          {packageBadges.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label>
        Photo (JPG, PNG or WebP, up to 5 MB)
        <input type="file" name="image" accept="image/jpeg,image/png,image/webp" />
      </label>
      {item?.image_url && (
        <p>
          Current photo: <a href={item.image_url}>view</a>. Choose a file above to replace it.
        </p>
      )}

      <label>
        <input type="checkbox" name="is_active" defaultChecked={item?.is_active ?? true} />
        Active (shown on the website)
      </label>

      <button type="submit">{item ? "Save changes" : "Add package"}</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

function Field({
  label,
  name,
  value,
  type = "text",
  step,
  required,
}: {
  label: string;
  name: string;
  value?: string | number | null;
  type?: string;
  step?: string;
  required?: boolean;
}) {
  return (
    <label>
      {label}
      <input name={name} type={type} step={step} defaultValue={value ?? ""} required={required} />
    </label>
  );
}
