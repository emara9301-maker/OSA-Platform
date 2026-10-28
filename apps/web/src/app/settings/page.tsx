import { homePathFor } from "@/lib/permissions";
import { isStaff } from "@/lib/permissions";
import { connection } from "next/server";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { saveLevels, saveSettings } from "./actions";
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
    <h2>Numbers</h2>
    <form action={saveSettings}>
      {saved && <p role="status">Settings saved.</p>}
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
