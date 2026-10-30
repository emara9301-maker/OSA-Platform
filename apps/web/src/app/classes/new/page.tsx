import { connection } from "next/server";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ClassForm } from "../class-form";
import { canManageCondos, homePathFor, isStaff } from "@/lib/permissions";
import { getCurrentProfile } from "@/lib/staff";
import { createServerSupabase } from "@/lib/supabase-server";

async function NewClassForm({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await connection();
  const { error } = await searchParams;
  const supabase = await createServerSupabase();
  const me = await getCurrentProfile(supabase);
  if (!me) {
    redirect("/login");
  }
  if (!isStaff(me.role)) {
    redirect(homePathFor(me.role));
  }
  if (!canManageCondos(me.role)) {
    redirect(homePathFor(me.role));
  }

  const { data: condos } = await supabase.from("condos").select("id, name").order("name");
  const { data: coaches } = await supabase.from("profiles").select("id, username").eq("role", "coach").order("username");
  const { data: levels } = await supabase.from("levels").select("id, name").eq("is_active", true).order("sort_order");
  const { data: poolData } = await supabase.from("pools").select("id, name, condo_id").order("sort_order");
  const pools = (poolData ?? []) as { id: string; name: string; condo_id: string }[];

  return (
    <ClassForm
      item={null}
      condos={(condos ?? []) as { id: string; name: string }[]}
      pools={pools}
      coaches={((coaches ?? []) as { id: string; username: string | null }[]).map((c) => ({
        id: c.id,
        name: c.username ?? "no username",
      }))}
      levels={(levels ?? []) as { id: string; name: string }[]}
      error={error}
    />
  );
}

export default function NewClassPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return (
    <main>
      <h1>Add a class</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <NewClassForm searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
