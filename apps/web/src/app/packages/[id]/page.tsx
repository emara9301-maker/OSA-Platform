import { homePathFor } from "@/lib/permissions";
import { isStaff } from "@/lib/permissions";
import { connection } from "next/server";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { PackageForm } from "../package-form";
import { deletePackage } from "../actions";
import type { Package } from "@/lib/packages";
import { canManagePackagesAndSettings } from "@/lib/permissions";
import { getCurrentProfile } from "@/lib/staff";
import { createServerSupabase } from "@/lib/supabase-server";

async function PackageDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await connection();
  const { id } = await params;
  const { error } = await searchParams;
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

  const { data } = await supabase.from("packages").select("*").eq("id", id).maybeSingle();
  if (!data) {
    notFound();
  }

  return (
    <>
      <PackageForm item={data as Package} error={error} />

      <h2>Delete</h2>
      <form action={deletePackage}>
        <input type="hidden" name="id" value={id} />
        <label>
          <input type="checkbox" name="confirm" required />
          I understand this deletes the package. The audit log keeps the record.
        </label>
        <button type="submit">Delete package</button>
      </form>
    </>
  );
}

export default function PackagePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <main>
      <h1>Package</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <PackageDetail params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
