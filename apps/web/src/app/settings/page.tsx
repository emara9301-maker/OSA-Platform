import { homePathFor } from "@/lib/permissions";
import { isStaff } from "@/lib/permissions";
import { connection } from "next/server";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { addLevel, cancelPause, savePoolFields, saveLevels, saveSettings } from "./actions";
import type { Setting } from "@/lib/settings";
import { canManagePackagesAndSettings } from "@/lib/permissions";
import { getCurrentProfile } from "@/lib/staff";
import { createServerSupabase } from "@/lib/supabase-server";

async function SettingsForm({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  await connection();
  const { error, saved } = await searchParams;
  const supabase = await createServerSupabase();
  const me = await getCurrentProfile(supabase);
  if (!me) {
    redirect("/login");
  }
  if (!isStaff(me.role)) {
    redirect(homePathFor(me.role));
  }
  if (!canManagePackagesAndSettings(me.role)) {
    redirect(homePathFor(me.role));
  }

  const { data, error: loadError } = await supabase.from("settings").select("key, value, label, unit").order("key");
  if (loadError) {
    return <p>Could not load settings: {loadError.message}</p>;
  }

  const settings = (data ?? []) as Setting[];
  const { data: levelData } = await supabase.from("levels").select("id, name, is_active").order("sort_order");
  const levels = (levelData ?? []) as { id: string; name: string; is_active: boolean }[];
  const { data: pauseData } = await supabase
    .from("package_pauses")
    .select("id, starts_on, ends_on, student_packages(students(full_name))")
    .eq("status", "active")
    .order("starts_on");
  const pauses = (pauseData ?? []) as unknown as {
    id: string;
    starts_on: string;
    ends_on: string;
    student_packages: { students: { full_name: string } | null } | null;
  }[];
  const { data: poolData } = await supabase.from("pool_fields").select("key, label, visible").order("sort_order");
  const poolFields = (poolData ?? []) as { key: string; label: string; visible: boolean }[];
  return (
    <>
    <form action={saveLevels}>
      <h2>Levels</h2>
      {levels.map((level) => (
        <label key={level.id}>
          <input name={`level_${level.id}`} defaultValue={level.name} required />
          <input type="checkbox" name={`active_${level.id}`} defaultChecked={level.is_active} /> offered
        </label>
      ))}
      <button type="submit">Save levels</button>
    </form>
    <form action={addLevel}>
      <label>
        New level name
        <input name="new_level" placeholder="For example, Advanced 2" required />
      </label>
      <button type="submit">Add level</button>
    </form>
    <h2>Numbers</h2>
    <form action={saveSettings}>
      {saved === "level" && <p role="status">Level added.</p>}
      {saved === "pause" && <p role="status">Pause cancelled.</p>}
      {saved === "pools" && <p role="status">Pool page details saved.</p>}
      {saved === "1" && <p role="status">Settings saved.</p>}
      {error && <p role="alert">{error}</p>}

      {settings.map((setting) => (
        <label key={setting.key}>
          {setting.label}
          <span> ({setting.unit})</span>
          <input
            name={`setting_${setting.key}`}
            type="number"
            step="any"
            min="0"
            defaultValue={setting.value}
            required
          />
        </label>
      ))}

      <button type="submit">Save settings</button>
    </form>

    <h2>Family pauses</h2>
    {pauses.length === 0 ? (
      <p>No active pauses.</p>
    ) : (
      <ul>
        {pauses.map((pause) => (
          <li key={pause.id}>
            {pause.student_packages?.students?.full_name ?? "child"}: {pause.starts_on} to {pause.ends_on}{" "}
            <form action={cancelPause} style={{ display: "inline" }}>
              <input type="hidden" name="pause_id" value={pause.id} />
              <button type="submit">Cancel pause</button>
            </form>
          </li>
        ))}
      </ul>
    )}

    <h2>Pool page details</h2>
    <p>What visitors see on a pool&apos;s page. Turn a detail off to hide it, and rename it if needed.</p>
    <form action={savePoolFields}>
      {poolFields.map((field) => (
        <label key={field.key}>
          <input type="checkbox" name={`show_${field.key}`} defaultChecked={field.visible} /> Show
          <input name={`label_${field.key}`} defaultValue={field.label} />
        </label>
      ))}
      <button type="submit">Save pool details</button>
    </form>
    </>
  );
}

export default function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  return (
    <main>
      <h1>Settings</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <SettingsForm searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
