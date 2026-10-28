import { homePathFor } from "@/lib/permissions";
import { connection } from "next/server";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { CondoForm } from "../condo-form";
import { deleteCondo } from "../actions";
import type { Condo } from "@/lib/condos";
import { canManageCondos, isStaff } from "@/lib/permissions";
import { getCurrentProfile } from "@/lib/staff";
import { createServerSupabase } from "@/lib/supabase-server";

async function CondoDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  await connection();
  const supabase = await createServerSupabase();
  const me = await getCurrentProfile(supabase);
  if (!me) {
    redirect("/login");
  }
  if (!isStaff(me.role)) {
    redirect(homePathFor(me.role));
  }
  if (!isStaff(me.role)) {
    redirect(homePathFor(me.role));
  }

  const { data } = await supabase.from("condos").select("*").eq("id", id).maybeSingle();
  if (!data) {
    notFound();
  }
  const condo = data as Condo;
  const canManage = canManageCondos(me.role);

  return (
    <>
      <p>Status: {condo.status}</p>
      <dl>
        <dt>Area</dt>
        <dd>{condo.area ?? "-"}</dd>
        <dt>Address</dt>
        <dd>{condo.address ?? "-"}</dd>
        <dt>Coordinates</dt>
        <dd>
          {condo.latitude ?? "-"}, {condo.longitude ?? "-"}
        </dd>
        <dt>Pool hours</dt>
        <dd>{condo.pool_hours ?? "-"}</dd>
        <dt>Contact</dt>
        <dd>{condo.contact_phone ?? "-"}</dd>
        <dt>Pool rules</dt>
        <dd>{condo.rules ?? "-"}</dd>
        <dt>Access notes</dt>
        <dd>{condo.access_notes ?? "-"}</dd>
      </dl>

      {canManage && (
        <>
          <h2>Edit</h2>
          <CondoForm condo={condo} error={error} />

          <h2>Delete</h2>
          <form action={deleteCondo}>
            <input type="hidden" name="id" value={condo.id} />
            <label>
              <input type="checkbox" name="confirm" required />
              I understand this deletes the condo. The audit log keeps the record.
            </label>
            <button type="submit">Delete condo</button>
          </form>
        </>
      )}
    </>
  );
}

export default function CondoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <main>
      <h1>Condo</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <CondoDetail params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
