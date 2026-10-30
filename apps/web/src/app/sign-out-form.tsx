"use client";

// Signing out also clears the family pages saved on this device, so the next person cannot read them.
export function SignOutForm({ action, label }: { action: () => Promise<void>; label: string }) {
  return (
    <form
      action={action}
      className="site-signout"
      onSubmit={() => {
        if ("caches" in window) {
          void caches.delete("osa-pages-v1");
        }
      }}
    >
      <button type="submit">{label}</button>
    </form>
  );
}
