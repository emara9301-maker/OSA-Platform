import Link from "next/link";
import { homePathFor } from "@/lib/permissions";
import { connection } from "next/server";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { CondoForm } from "../condo-form";
import { deleteCondo } from "../actions";
import { addPoolDetail, removePoolDetail, togglePoolDetail } from "../details-actions";
import { addPool, removePool } from "../pool-actions";
import type { Condo } from "@/lib/condos";
import { canManageCondos, isStaff } from "@/lib/permissions";
import { getCurrentProfile } from "@/lib/staff";
import { createServerSupabase } from "@/lib/supabase-server";
import { currentLang } from "@/lib/i18n";
import { loadCondoChat } from "@/lib/condo-chat";
import { CondoChat } from "../../condo-chat";

async function CondoDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id } = await params;
  const { error, saved } = await searchParams;
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
  const { data: detailData } = await supabase
    .from("condo_details")
    .select("id, label, value, visible")
    .eq("condo_id", id)
    .order("sort_order")
    .order("created_at");
  const details = (detailData ?? []) as { id: string; label: string; value: string; visible: boolean }[];
  const { data: poolData } = await supabase
    .from("pools")
    .select("id, name, pool_hours")
    .eq("condo_id", id)
    .order("sort_order")
    .order("created_at");
  const pools = (poolData ?? []) as { id: string; name: string; pool_hours: string | null }[];
  const lang = await currentLang();
  const messages = await loadCondoChat(supabase, id, lang);

  return (
    <div className="with-chat">
      <div className="with-chat-main">
      <p>Status: {condo.status}</p>
      {(saved === "detail" || saved === "pool" || saved === "removed") && <p role="status">Saved.</p>}
      {error && <p role="alert">{error}</p>}
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

      <h2>Pools</h2>
      {pools.length === 0 ? (
        <p>No pools at this condo yet.</p>
      ) : (
        <ul>
          {pools.map((pool) => (
            <li key={pool.id}>
              <Link href={`/condos/${condo.id}/pools/${pool.id}`}>{pool.name}</Link> — {pool.pool_hours ?? "hours not set"}
              {canManage && (
                <form action={removePool} style={{ display: "inline" }}>
                  <input type="hidden" name="id" value={pool.id} />
                  <input type="hidden" name="condo_id" value={condo.id} />
                  <button type="submit">Remove pool</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <form action={addPool}>
          <input type="hidden" name="condo_id" value={condo.id} />
          <h3>Add a pool</h3>
          <label>
            Pool name
            <input name="name" placeholder="For example, Kids pool" required />
          </label>
          <label>
            Pool hours
            <input name="pool_hours" placeholder="7am-10pm" />
          </label>
          <label>
            Pool rules
            <textarea name="rules" />
          </label>
          <label>
            How to get in
            <textarea name="access_notes" />
          </label>
          <label>
            Photo of this pool (JPG, PNG or WebP, up to 5 MB)
            <input type="file" name="image" accept="image/jpeg,image/png,image/webp" />
          </label>
          <button type="submit">Add pool</button>
        </form>
      )}

      <h2>Extra details for visitors</h2>
      {details.length === 0 ? (
        <p>No extra details yet.</p>
      ) : (
        <ul>
          {details.map((detail) => (
            <li key={detail.id}>
              <strong>{detail.label}</strong>: {detail.value} — {detail.visible ? "shown" : "hidden"}
              {canManage && (
                <>
                  <form action={togglePoolDetail} style={{ display: "inline" }}>
                    <input type="hidden" name="id" value={detail.id} />
                    <input type="hidden" name="condo_id" value={condo.id} />
                    <input type="hidden" name="visible" value={detail.visible ? "1" : "0"} />
                    <button type="submit">{detail.visible ? "Hide" : "Show"}</button>
                  </form>
                  <form action={removePoolDetail} style={{ display: "inline" }}>
                    <input type="hidden" name="id" value={detail.id} />
                    <input type="hidden" name="condo_id" value={condo.id} />
                    <button type="submit">Remove</button>
                  </form>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <form action={addPoolDetail}>
          <input type="hidden" name="condo_id" value={condo.id} />
          <label>
            Detail name
            <input name="label" placeholder="For example, Parking" required />
          </label>
          <label>
            Detail
            <input name="value" required />
          </label>
          <button type="submit">Add detail</button>
        </form>
      )}

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
      </div>
      <CondoChat lang={lang} condoId={condo.id} meId={me.id} messages={messages} canPost={false} canDelete={canManage} />
    </div>
  );
}

export default function CondoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  return (
    <main className="wide">
      <h1>Condo</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <CondoDetail params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
