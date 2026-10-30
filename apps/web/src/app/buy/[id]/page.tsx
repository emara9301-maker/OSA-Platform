import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { buyPackage } from "../actions";
import { ChildPicker } from "./child-picker";
import { isStaff } from "@/lib/permissions";
import { currentLang, localeFor, t, type Key, type Lang } from "@/lib/i18n";
import { getCurrentProfile } from "@/lib/staff";
import { createServerSupabase } from "@/lib/supabase-server";

const typeKeys: Record<string, Key> = {
  private_1_1: "typePrivate",
  semi_private_1_2: "typeSemi",
  small_group: "typeSmall",
  adult: "typeAdult",
};

type Pkg = {
  id: string;
  name: string;
  type: string;
  sessions_count: number;
  session_minutes: number;
  validity_days: number;
  price: number | null;
  pool_id: string;
  pool_name: string;
  condo_name: string;
};

async function BuyForm({
  id,
  lang,
  searchParams,
}: {
  id: string;
  lang: Lang;
  searchParams: Promise<{ error?: string }>;
}) {
  await connection();
  const { error } = await searchParams;
  const supabase = await createServerSupabase();

  const { data: pkgData } = await supabase
    .from("packages")
    .select("id, name, type, sessions_count, session_minutes, validity_days, price, pool_id")
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();
  if (!pkgData) {
    notFound();
  }
  const pkg = pkgData as Pkg;
  // The pool and its condo are read through the public function, so visitors and families can see their names.
  const { data: poolData } = await supabase.rpc("public_pool_details", { p_pool_id: pkg.pool_id });
  const pool = poolData as { name: string; condo_name: string } | null;
  const price =
    pkg.price === null ? t(lang, "priceToConfirm") : `RM ${Number(pkg.price).toLocaleString(localeFor(lang), { minimumFractionDigits: 2 })}`;

  const me = await getCurrentProfile(supabase);
  const summary = (
    <>
      <h1>{t(lang, "buyTitle", { name: pkg.name })}</h1>
      <p>
        {t(lang, typeKeys[pkg.type] ?? "typeSmall")} · {t(lang, "lessons", { count: pkg.sessions_count })} ·{" "}
        {t(lang, "minutesEach", { minutes: pkg.session_minutes })} · {t(lang, "validFor", { days: pkg.validity_days })}
      </p>
      <p>
        <strong>{price}</strong>
      </p>
    </>
  );

  if (!me) {
    return (
      <>
        {summary}
        <p>{t(lang, "buyLogin")}</p>
        <p>
          <Link className="button" href="/login">
            {t(lang, "logIn")}
          </Link>
          <Link className="button button-secondary" href="/signup">
            {t(lang, "signUp")}
          </Link>
        </p>
      </>
    );
  }
  if (isStaff(me.role)) {
    return (
      <>
        {summary}
        <p>{t(lang, "buyStaff")}</p>
      </>
    );
  }

  // Only children at this package's pool can buy it; a child at another pool is not offered the package.
  const { data: childData } = await supabase
    .from("students")
    .select("id, full_name, account_id, pool_id")
    .eq("pool_id", pkg.pool_id)
    .order("full_name");
  const children = (childData ?? []) as { id: string; full_name: string; account_id: string | null; pool_id: string }[];
  const options = children.map((child) => ({ value: child.id, label: child.full_name }));
  // The account's own student record, chosen by default when the signed-in person buys for themselves.
  const ownId = children.find((child) => child.account_id === me.id)?.id ?? "";
  // "Which child" wording is for a family; an account that manages itself is asked "Who is this for?".
  const { count: familyCount } = await supabase
    .from("family_guardians")
    .select("family_id", { count: "exact", head: true })
    .eq("profile_id", me.id);
  const isFamilyBuyer = (familyCount ?? 0) > 0;
  // The account can buy for itself, under its own name, when its student record is not yet placed in a pool.
  const { data: ownRecord } = await supabase.from("students").select("id, pool_id").eq("account_id", me.id).maybeSingle();
  const selfName = !ownRecord || ownRecord.pool_id === null ? me.full_name : null;
  const initialChoice = ownId || (selfName ? "self" : "");

  return (
    <>
      {summary}
      {error && <p role="alert">{error}</p>}
      <form action={buyPackage}>
        <input type="hidden" name="package_id" value={pkg.id} />
        <input type="hidden" name="pool_id" value={pkg.pool_id} />
        <p>
          {t(lang, "buyPool")}: {pool?.name ?? "-"}
          {pool?.condo_name && ` — ${pool.condo_name}`}
        </p>

        <ChildPicker
          options={options}
          initial={initialChoice}
          selfName={selfName}
          text={{
            choose: t(lang, isFamilyBuyer ? "buyChoose" : "buyWho"),
            existing: t(lang, "buyExisting"),
            pick: t(lang, "buyPick"),
            newChild: t(lang, "buyNew"),
            newName: t(lang, "buyNewName"),
            newBirth: t(lang, "buyNewBirth"),
          }}
        />

        <button type="submit">{t(lang, "buyConfirm")}</button>
      </form>
    </>
  );
}

export default function BuyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <main>
      <Suspense fallback={<p>Loading...</p>}>
        <BuyContent params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function BuyContent({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await connection();
  const lang = await currentLang();
  const { id } = await params;
  return <BuyForm id={id} lang={lang} searchParams={searchParams} />;
}
