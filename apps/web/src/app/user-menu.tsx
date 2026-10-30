"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { SignOutForm } from "./sign-out-form";
import type { Lang } from "@/lib/i18n";

// One button in the header. Its panel holds the profile link, the language choice, and Log out.
export function UserMenu({
  lang,
  label,
  trigger,
  profileHref,
  profileLabel,
  languageLabel,
  languageAction,
  signedIn,
  signOutAction,
  logOutLabel,
  name,
}: {
  lang: Lang;
  label: string;
  trigger: ReactNode;
  profileHref: string | null;
  profileLabel: string;
  languageLabel: string;
  languageAction: (formData: FormData) => Promise<void>;
  signedIn: boolean;
  signOutAction: () => Promise<void>;
  logOutLabel: string;
  name: string | null;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Tapping outside the menu, or pressing Escape, closes it.
  useEffect(() => {
    if (!open) {
      return;
    }
    function closeOutside(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="user-menu" ref={menuRef}>
      <button
        type="button"
        className="user-menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen(!open)}
      >
        {trigger}
        <span className="user-menu-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div className="user-menu-panel" role="menu">
          {name && <p className="user-menu-head">{name}</p>}
          {profileHref && (
            <Link href={profileHref} className="user-menu-item" role="menuitem" onClick={() => setOpen(false)}>
              {profileLabel}
            </Link>
          )}
          <p className="user-menu-caption">{languageLabel}</p>
          <form action={languageAction} className="user-menu-languages" aria-label={languageLabel}>
            <button name="lang" value="en" className={lang === "en" ? "active" : undefined} aria-pressed={lang === "en"}>
              EN
            </button>
            <button name="lang" value="ms" className={lang === "ms" ? "active" : undefined} aria-pressed={lang === "ms"}>
              BM
            </button>
          </form>
          {signedIn && (
            <div className="user-menu-logout">
              <SignOutForm action={signOutAction} label={logOutLabel} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
