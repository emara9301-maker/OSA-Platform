import { homePathFor } from "@/lib/permissions";
import { connection } from "next/server";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { canManageCondos, isStaff } from "@/lib/permissions";
import { getCurrentProfile } from "@/lib/staff";
import { createServerSupabase } from "@/lib/supabase-server";
import { poolPhoto } from "@/lib/pool-photo";
import type { Condo } from "@/lib/condos";

type Pool = { id: string; condo_id: string; name: string; pool_hours: string | null; image_url: string | null };

async function CondoList() {
  await connection();
  const supabase = await createServerSupabase();
  const me = await getCurrentProfile(supabase);
  if (!me) {
    redirect("/login");
  }
  if (!isStaff(me.role)) {
    redirect(homePathFor(me.role));
  }

  const { data, error } = await supabase.from("condos").select("*").order("name");
  if (error) {
    return <p>Could not load condos: {error.message}</p>;
  }
  const { data: poolData } = await supabase.from("pools").select("id, condo_id, name, pool_hours, image_url").order("sort_order");

  const condos = (data ?? []) as Condo[];
  const pools = (poolData ?? []) as Pool[];

  return (
    <>
      {canManageCondos(me.role) && (
        <p>
          <Link href="/condos/new">Add condo</Link>
        </p>
      )}
      {condos.length === 0 ? (
        <p>No condos yet.</p>
      ) : (
        <div className="pool-grid">
          {condos.map((condo) => {
            const condoPools = pools.filter((pool) => pool.condo_id === condo.id);
            const cover = condo.image_url ?? condoPools[0]?.image_url ?? null;
            return (
              <Link key={condo.id} href={`/condos/${condo.id}`} className="pool-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={poolPhoto(condo.name, cover)} alt={condo.name} />
                <div className="pool-card-body">
                  <div className="card-title-row">
                    <h3>{condo.name}</h3>
                    <span className={`status-badge ${condo.status === "ready" ? "status-active" : ""}`}>
                      {condo.status === "ready" ? "Ready" : "Draft"}
                    </span>
                  </div>
                  <p className="pool-area">{condo.area ?? "No area set"}</p>
                  <p className="pool-hours">
                    {condoPools.length} {condoPools.length === 1 ? "pool" : "pools"}
                    {condoPools.length > 0 && `: ${condoPools.map((pool) => pool.name).join(", ")}`}
                  </p>
                  <span className="pool-link">Open condo →</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

export default function CondosPage() {
  return (
    <main>
      <h1>Condos</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <CondoList />
      </Suspense>
    </main>
  );
}
