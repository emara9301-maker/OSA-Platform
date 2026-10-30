"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { mockGateway } from "@/lib/payments";
import { createServerSupabase } from "@/lib/supabase-server";

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function fail(message: string): never {
  redirect(`/billing?error=${encodeURIComponent(message)}`);
}

export async function createInvoice(formData: FormData) {
  const studentId = text(formData, "student_id");
  const packageId = text(formData, "package_id");
  if (studentId === "" || packageId === "") {
    fail("Choose a child and a package.");
  }
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("create_invoice", {
    p_student_id: studentId,
    p_package_id: packageId,
    p_carry_over: formData.get("carry_over") === "on",
  });
  if (error) {
    fail(error.message);
  }
  revalidatePath("/billing");
  redirect("/billing?saved=invoice");
}

// The gateway takes the money first, then the database records it and starts the package.
export async function payInvoice(formData: FormData) {
  const invoiceId = text(formData, "invoice_id");
  const supabase = await createServerSupabase();

  const { data: invoice, error: readError } = await supabase
    .from("invoices")
    .select("id, amount, status")
    .eq("id", invoiceId)
    .maybeSingle();
  if (readError || !invoice) {
    fail("Invoice not found.");
  }
  if (invoice.status !== "unpaid") {
    fail("This invoice is not waiting for payment.");
  }

  const charge = await mockGateway.charge({ amount: Number(invoice.amount), reference: invoice.id });
  const { error } = await supabase.rpc("record_payment", {
    p_invoice_id: invoiceId,
    p_gateway: mockGateway.name,
    p_gateway_ref: charge.gatewayRef,
  });
  if (error) {
    fail(error.message);
  }
  revalidatePath("/billing");
  redirect("/billing?saved=payment");
}

export async function setGrace(formData: FormData) {
  const studentId = text(formData, "student_id");
  const until = text(formData, "until");
  if (studentId === "" || until === "") {
    fail("Choose a child and the date the grace period ends.");
  }
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("set_payment_grace", { p_student_id: studentId, p_until: until });
  if (error) {
    fail(error.message);
  }
  revalidatePath("/billing");
  redirect("/billing?saved=grace");
}

// Managers pause a family's package. Fields: "student_package_id", "starts_on", "ends_on".
export async function pausePackageForFamily(formData: FormData) {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("pause_package", {
    p_student_package_id: String(formData.get("student_package_id") ?? ""),
    p_starts_on: String(formData.get("starts_on") ?? ""),
    p_ends_on: String(formData.get("ends_on") ?? ""),
  });
  if (error) {
    fail(error.message);
  }
  revalidatePath("/billing");
  redirect("/billing?saved=paused");
}
