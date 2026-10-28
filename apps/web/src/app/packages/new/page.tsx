import { homePathFor } from "@/lib/permissions";
import { isStaff } from "@/lib/permissions";
import { connection } from "next/server";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { PackageForm } from "../package-form";
import { canManagePackagesAndSettings } from "@/lib/permissions";
import { getCurrentProfile } from "@/lib/staff";
import { createServerSupabase } from "@/lib/supabase-server";

async function NewPackageForm({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
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
  if (!canManagePackagesAndSettings(me.role)) {
    redirect(homePathFor(me.role));
  }
  return <PackageForm item={null} error={error} />;
}

export default function NewPackagePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return (
    <main>
      <h1>Add a package</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <NewPackageForm searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
