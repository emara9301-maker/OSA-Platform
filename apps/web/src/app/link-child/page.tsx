import { connection } from "next/server";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requestLink } from "./actions";
import { QrScanner } from "./qr-scanner";
import { getCurrentProfile } from "@/lib/staff";
import { createServerSupabase } from "@/lib/supabase-server";

type RequestRow = { id: string; relationship: string; status: string; created_at: string };

async function LinkChild({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string }> }) {
  await connection();
  const { error, sent } = await searchParams;
  const supabase = await createServerSupabase();
  const me = await getCurrentProfile(supabase);
  if (!me) {
    redirect("/login");
  }

  const { data } = await supabase
    .from("guardian_link_requests")
    .select("id, relationship, status, created_at")
    .order("created_at", { ascending: false });
  const requests = (data ?? []) as RequestRow[];

  return (
    <>
      {sent && <p role="status">Request sent. The OSA office will review it.</p>}
      {error && <p role="alert">{error}</p>}

      <form action={requestLink}>
        <label>
          Child&apos;s QR code
          <input name="token" required />
        </label>
        <QrScanner targetName="token" />
        <label>
          Your relationship to the child
          <input name="relationship" placeholder="Mother, father, grandparent..." required />
        </label>
        <button type="submit">Send request</button>
      </form>

      <h2>Your requests</h2>
      {requests.length === 0 ? (
        <p>No requests yet.</p>
      ) : (
        <ul>
          {requests.map((request) => (
            <li key={request.id}>
              {request.relationship} — {request.status} — {new Date(request.created_at).toISOString()}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function LinkChildPage({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string }> }) {
  return (
    <main>
      <h1>Link my child</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <LinkChild searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
