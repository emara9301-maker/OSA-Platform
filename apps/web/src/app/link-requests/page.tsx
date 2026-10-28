import { homePathFor } from "@/lib/permissions";
import { isStaff } from "@/lib/permissions";
import { connection } from "next/server";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { decideLink } from "./actions";
import { canManageCondos } from "@/lib/permissions";
import { getCurrentProfile } from "@/lib/staff";
import { createServerSupabase } from "@/lib/supabase-server";

type PendingRequest = {
  id: string;
  relationship: string;
  created_at: string;
  requester: { username: string | null }[] | null;
  student: { full_name: string }[] | null;
};

async function PendingRequests({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
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

  const { data, error: loadError } = await supabase
    .from("guardian_link_requests")
    .select("id, relationship, created_at, requester:profiles!requester_id(username), student:students(full_name)")
    .eq("status", "pending")
    .order("created_at");
  if (loadError) {
    return <p>Could not load requests: {loadError.message}</p>;
  }

  const requests = (data ?? []) as unknown as PendingRequest[];
  return (
    <>
      {error && <p role="alert">{error}</p>}
      {requests.length === 0 ? (
        <p>No pending requests.</p>
      ) : (
        <ul>
          {requests.map((request) => (
            <li key={request.id}>
              <strong>{request.requester?.[0]?.username ?? "no username"}</strong> asks to link to{" "}
              <strong>{request.student?.[0]?.full_name ?? "a child"}</strong> as {request.relationship}.{" "}
              <form action={decideLink} style={{ display: "inline" }}>
                <input type="hidden" name="request_id" value={request.id} />
                <button type="submit" name="decision" value="approve">
                  Yes, link
                </button>
              </form>{" "}
              <form action={decideLink} style={{ display: "inline" }}>
                <input type="hidden" name="request_id" value={request.id} />
                <button type="submit" name="decision" value="reject">
                  No
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function LinkRequestsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return (
    <main>
      <h1>Link requests</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <PendingRequests searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
