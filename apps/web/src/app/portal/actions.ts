"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { mockGateway } from "@/lib/payments";
import { currentLang, type Lang } from "@/lib/i18n";
import { localizeError } from "@/lib/messages";
import { createServerSupabase } from "@/lib/supabase-server";

function fail(lang: Lang, message: string): never {
  redirect(`/portal?error=${encodeURIComponent(localizeError(lang, message))}`);
}

// The invoice is read with the family's own session, so the family can only pay what it can see.
// The gateway charges first; the payment is then recorded with the server key.
export async function payInvoice(formData: FormData) {
  const lang = await currentLang();
  const invoiceId = String(formData.get("invoice_id") ?? "");
  const supabase = await createServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    redirect("/login");
  }

  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, amount, status")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!invoice) {
    fail(lang, "That invoice is not available.");
  }
  if (invoice.status !== "unpaid") {
    fail(lang, "This invoice is already paid.");
  }

  const charge = await mockGateway.charge({ amount: Number(invoice.amount), reference: invoice.id });
  const { error } = await createAdminSupabase().rpc("apply_payment", {
    p_invoice_id: invoice.id,
    p_gateway: mockGateway.name,
    p_gateway_ref: charge.gatewayRef,
    p_recorded_by: userData.user.id,
  });
  if (error) {
    fail(lang, error.message);
  }

  revalidatePath("/portal");
  redirect("/portal?saved=payment");
}

// Pauses a package. Fields: "student_package_id", "starts_on", "ends_on". The server checks the rules.
export async function pausePackage(formData: FormData) {
  const lang = await currentLang();
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("pause_package", {
    p_student_package_id: String(formData.get("student_package_id") ?? ""),
    p_starts_on: String(formData.get("starts_on") ?? ""),
    p_ends_on: String(formData.get("ends_on") ?? ""),
  });
  if (error) {
    fail(lang, error.message);
  }
  revalidatePath("/portal");
  redirect("/portal?saved=paused");
}

// Ends a pause. Fields: "pause_id".
export async function cancelFamilyPause(formData: FormData) {
  const lang = await currentLang();
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("cancel_pause", { p_pause_id: String(formData.get("pause_id") ?? "") });
  if (error) {
    fail(lang, error.message);
  }
  revalidatePath("/portal");
  redirect("/portal?saved=unpaused");
}

// Fields: one "token_id" per student in the lesson, and "slot" with the chosen start time.
export async function bookMakeUp(formData: FormData) {
  const lang = await currentLang();
  const classId = String(formData.get("class_id") ?? "");
  const tokenIds = formData.getAll("token_id").map(String);
  const slot = new Date(String(formData.get("slot") ?? ""));
  if (Number.isNaN(slot.getTime())) {
    fail(lang, "Choose one of the suggested times.");
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("schedule_make_up", {
    p_class_id: classId,
    p_starts_at: slot.toISOString(),
    p_token_ids: tokenIds,
  });
  if (error) {
    fail(lang, error.message);
  }

  revalidatePath("/portal");
  redirect("/portal?saved=booked");
}
