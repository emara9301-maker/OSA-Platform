import { connection } from "next/server";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createInvoice, payInvoice, setGrace } from "./actions";
import { canManageCondos, homePathFor } from "@/lib/permissions";
import { getCurrentProfile } from "@/lib/staff";
import { createServerSupabase } from "@/lib/supabase-server";

const savedMessages: Record<string, string> = {
  invoice: "Invoice created.",
  payment: "Payment recorded. The package has started.",
  grace: "Grace period saved.",
};

const statusLabels: Record<string, string> = {
  paid: "Paid",
  due_soon: "Due soon",
  overdue: "Overdue",
  on_hold: "On hold",
};

async function Board({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  await connection();
  const { error, saved } = await searchParams;
  const supabase = await createServerSupabase();
  const me = await getCurrentProfile(supabase);
  if (!me) {
    redirect("/login");
  }
  if (!canManageCondos(me.role)) {
    redirect(homePathFor(me.role));
  }

  await supabase.rpc("generate_billing");

  const { data: invoiceData } = await supabase
    .from("invoices")
    .select("id, student_id, kind, amount, discount_percent, due_on, status, students(full_name), packages(name)")
    .order("due_on", { ascending: false })
    .limit(100);
  const invoices = (invoiceData ?? []) as unknown as {
    id: string;
    student_id: string;
    kind: string;
    amount: number;
    discount_percent: number;
    due_on: string;
    status: string;
    students: { full_name: string } | null;
    packages: { name: string } | null;
  }[];

  const { data: studentData } = await supabase.from("students").select("id, full_name").order("full_name");
  const students = (studentData ?? []) as { id: string; full_name: string }[];

  const { data: packageData } = await supabase
    .from("packages")
    .select("id, name, price")
    .eq("is_active", true)
    .not("price", "is", null)
    .order("name");
  const packages = (packageData ?? []) as { id: string; name: string; price: number }[];

  const invoicedIds = [...new Set(invoices.map((i) => i.student_id))];
  const statusByStudent = new Map<string, string | null>();
  for (const studentId of invoicedIds) {
    const { data } = await supabase.rpc("student_payment_status", { p_student_id: studentId });
    statusByStudent.set(studentId, (data as string | null) ?? null);
  }

  return (
    <>
      {saved && savedMessages[saved] && <p role="status">{savedMessages[saved]}</p>}
      {error && <p role="alert">{error}</p>}

      <h2>New invoice</h2>
      <form action={createInvoice}>
        <label>
          Child
          <select name="student_id" required defaultValue="">
            <option value="" disabled>
              Choose a child
            </option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Package
          <select name="package_id" required defaultValue="">
            <option value="" disabled>
              Choose a package
            </option>
            {packages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} (RM {p.price})
              </option>
            ))}
          </select>
        </label>
        <label>
          <input type="checkbox" name="carry_over" defaultChecked /> Carry unused sessions over
        </label>
        <button type="submit">Create invoice</button>
      </form>

      <h2>Allow a grace period</h2>
      <form action={setGrace}>
        <label>
          Child
          <select name="student_id" required defaultValue="">
            <option value="" disabled>
              Choose a child
            </option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Until
          <input type="date" name="until" required />
        </label>
        <button type="submit">Save grace period</button>
      </form>

      <h2>Invoices</h2>
      {invoices.length === 0 ? (
        <p>No invoices yet.</p>
      ) : (
        <ul>
          {invoices.map((invoice) => (
            <li key={invoice.id} style={{ marginBottom: "0.75rem" }}>
              {invoice.students?.full_name ?? "child"} — {invoice.packages?.name ?? "package"} — RM {invoice.amount}
              {Number(invoice.discount_percent) > 0 && ` (${invoice.discount_percent}% sibling discount)`} — due{" "}
              {invoice.due_on} — {invoice.kind} — {invoice.status}
              {" "}({statusLabels[statusByStudent.get(invoice.student_id) ?? ""] ?? "-"} for the child)
              {invoice.status === "unpaid" && (
                <form action={payInvoice} style={{ display: "inline" }}>
                  <input type="hidden" name="invoice_id" value={invoice.id} />
                  <button type="submit">Pay now (mock)</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  return (
    <main>
      <h1>Billing</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <Board searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
