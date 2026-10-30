"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { t, type Lang } from "@/lib/messages";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import { uploadProfilePhoto } from "@/lib/uploads";

// The profile picture. Tapping it offers to view the photo or change it; a chosen file is uploaded at once.
export function PhotoMenu({
  lang,
  userId,
  photoUrl,
  children,
}: {
  lang: Lang;
  userId: string;
  photoUrl: string | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Tapping anywhere outside the menu closes it.
  useEffect(() => {
    if (!open) {
      return;
    }
    function closeOutside(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", closeOutside);
    return () => document.removeEventListener("mousedown", closeOutside);
  }, [open]);

  function changePhoto() {
    setOpen(false);
    fileRef.current?.click();
  }

  async function upload(file: File) {
    setError(null);
    setBusy(true);
    try {
      const client = createBrowserSupabase();
      const path = await uploadProfilePhoto(client, userId, file);
      const { error: saveError } = await client.rpc("set_profile_photo", { p_path: path });
      if (saveError) {
        throw new Error(saveError.message);
      }
      router.refresh();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Could not upload the photo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="photo-menu" ref={menuRef}>
      <button
        type="button"
        className="photo-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t(lang, "changePhoto")}
        disabled={busy}
        onClick={() => setOpen(!open)}
      >
        {children}
      </button>

      {open && (
        <div className="photo-options" role="menu">
          {photoUrl && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setViewing(true);
              }}
            >
              {t(lang, "viewPhoto")}
            </button>
          )}
          <button type="button" role="menuitem" onClick={changePhoto}>
            {t(lang, "changePhoto")}
          </button>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) {
            void upload(file);
          }
        }}
      />

      {error && <p role="alert">{error}</p>}

      {viewing && photoUrl && (
        <div className="photo-viewer" role="dialog" aria-label={t(lang, "viewPhoto")} onClick={() => setViewing(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl} alt="" onClick={(event) => event.stopPropagation()} />
          <button type="button" onClick={() => setViewing(false)}>
            {t(lang, "closePhoto")}
          </button>
        </div>
      )}
    </div>
  );
}
