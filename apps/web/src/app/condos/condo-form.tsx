import type { Condo } from "@/lib/condos";
import { saveCondo } from "./actions";

export function CondoForm({ condo, error }: { condo: Condo | null; error?: string }) {
  return (
    <form action={saveCondo}>
      {condo && <input type="hidden" name="id" value={condo.id} />}
      <input type="hidden" name="current_image_url" value={condo?.image_url ?? ""} />

      <Field label="Name" name="name" value={condo?.name} required />
      <Field label="Area" name="area" value={condo?.area} />
      <Field label="Address" name="address" value={condo?.address} />
      <Field label="Latitude" name="latitude" type="number" step="any" value={condo?.latitude} />
      <Field label="Longitude" name="longitude" type="number" step="any" value={condo?.longitude} />
      <Field label="Pool hours" name="pool_hours" value={condo?.pool_hours} />
      <Field label="Contact phone" name="contact_phone" type="tel" value={condo?.contact_phone} />
      <TextArea label="Pool rules" name="rules" value={condo?.rules} />
      <TextArea label="Access notes (access card, lift, parking)" name="access_notes" value={condo?.access_notes} />

      <label>
        Photo of the pool (JPG, PNG or WebP, up to 5 MB)
        <input type="file" name="image" accept="image/jpeg,image/png,image/webp" />
      </label>
      {condo?.image_url && (
        <p>
          Current photo: <a href={condo.image_url}>view</a>. Choose a file above to replace it.
        </p>
      )}

      <button type="submit">{condo ? "Save changes" : "Add condo"}</button>
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

function TextArea({ label, name, value }: { label: string; name: string; value?: string | null }) {
  return (
    <label>
      {label}
      <textarea name={name} defaultValue={value ?? ""} />
    </label>
  );
}
