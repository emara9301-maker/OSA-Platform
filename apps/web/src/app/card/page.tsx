import { connection } from "next/server";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { homePathFor, isStaff } from "@/lib/permissions";
import { currentLang, t, type Lang } from "@/lib/i18n";
import { getCurrentProfile } from "@/lib/staff";
import { createServerSupabase } from "@/lib/supabase-server";

async function CardContent() {
  await connection();
  const lang: Lang = await currentLang();
  const supabase = await createServerSupabase();
  const me = await getCurrentProfile(supabase);
  if (!me) {
    redirect("/login");
  }
  if (isStaff(me.role)) {
    redirect(homePathFor(me.role));
  }

  // Row-level security limits this to the children the account may see.
  const { data } = await supabase.from("students").select("id, full_name, qr_token").order("full_name");
  const children = (data ?? []) as { id: string; full_name: string; qr_token: string }[];
  if (children.length === 0) {
    return <p>{t(lang, "noCard")}</p>;
  }

  // The QR image is built into the page, so it still shows offline once the page has loaded.
  const cards = await Promise.all(
    children.map(async (child) => ({
      ...child,
      image: await QRCode.toDataURL(child.qr_token, { margin: 1, width: 220 }),
    })),
  );

  return (
    <>
      <p>{t(lang, "cardHint")}</p>
      {cards.map((child) => (
        <section key={child.id} className="card-code">
          <p>
            <strong>{t(lang, "cardName")}:</strong> {child.full_name}
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={child.image} alt={`QR code for ${child.full_name}`} width={220} height={220} />
          <p className="code">{child.qr_token}</p>
        </section>
      ))}
    </>
  );
}

async function CardTitle() {
  await connection();
  const lang = await currentLang();
  const supabase = await createServerSupabase();
  const me = await getCurrentProfile(supabase);
  // "Child's card" is for a family; an account that manages itself has its own QR card.
  const { count } = me
    ? await supabase.from("family_guardians").select("family_id", { count: "exact", head: true }).eq("profile_id", me.id)
    : { count: 0 };
  return <h1>{t(lang, (count ?? 0) > 0 ? "cardTitle" : "myQrCard")}</h1>;
}

export default function CardPage() {
  return (
    <main>
      <Suspense fallback={<h1>Child&apos;s card</h1>}>
        <CardTitle />
      </Suspense>
      <Suspense fallback={<p>Loading...</p>}>
        <CardContent />
      </Suspense>
    </main>
  );
}
