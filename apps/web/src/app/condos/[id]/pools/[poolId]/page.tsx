import { connection } from "next/server";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { savePool } from "../../../pool-actions";
import { canManageCondos, homePathFor, isStaff } from "@/lib/permissions";
import { getCurrentProfile } from "@/lib/staff";
import { createServerSupabase } from "@/lib/supabase-server";

type Pool = { id: string; condo_id: string; name: string; pool_hours: string | null; rules: string | null; access_notes: string | null; image_url: string | null };

async function PoolEditor({ params, searchParams }: { params: Promise<{ id: string; poolId: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  await connection();
  const { id, poolId } = await params;
  const { error, saved } = await searchParams;
  const supabase = await createServerSupabase();
  const me = await getCurrentProfile(supabase);
  if (!me) {
    redirect("/login");
  }
  if (!isStaff(me.role)) {
    redirect(homePathFor(me.role));
  }
  if (!canManageCondos(me.role)) {
    redirect(`/condos/${id}`);
  }

  const { data } = await supabase.from("pools").select("*").eq("id", poolId).eq("condo_id", id).maybeSingle();
  if (!data) {
    notFound();
  }
  const pool = data as Pool;

  return (
    <>
      {saved && <p role="status">Saved.</p>}
      {error && <p role="alert">{error}</p>}
      <form action={savePool}>
        <input type="hidden" name="id" value={pool.id} />
        <input type="hidden" name="condo_id" value={pool.condo_id} />
        <input type="hidden" name="current_image_url" value={pool.image_url ?? ""} />
        <label>
          Pool name
          <input name="name" defaultValue={pool.name} required />
        </label>
        <label>
          Pool hours
          <input name="pool_hours" defaultValue={pool.pool_hours ?? ""} />
        </label>
        <label>
          Pool rules
          <textarea name="rules" defaultValue={pool.rules ?? ""} />
        </label>
        <label>
          How to get in
          <textarea name="access_notes" defaultValue={pool.access_notes ?? ""} />
        </label>
        <label>
          Photo of this pool (JPG, PNG or WebP, up to 5 MB)
          <input type="file" name="image" accept="image/jpeg,image/png,image/webp" />
        </label>
        {pool.image_url && (
          <p>
            Current photo: <a href={pool.image_url}>view</a>. Choose a file above to replace it.
          </p>
        )}
        <button type="submit">Save pool</button>
      </form>
    </>
  );
}

export default function PoolEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; poolId: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  return (
    <main>
      <h1>Edit pool</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <PoolEditor params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
