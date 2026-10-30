import { connection } from "next/server";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Suspense } from "react";
import type { ReactNode } from "react";
import { setLanguage } from "./language-actions";
import { SiteEffects } from "./site-effects";
import { SiteNav } from "./site-nav";
import { signOut } from "./auth-actions";
import { UserMenu } from "./user-menu";
import { currentLang, t, type Lang } from "@/lib/i18n";
import { navLinks } from "@/lib/nav";
import { isStaff } from "@/lib/permissions";
import { getCurrentProfile } from "@/lib/staff";
import { profilePhotoUrl } from "@/lib/uploads";
import { createServerSupabase } from "@/lib/supabase-server";
import { Avatar } from "./avatar";
import "./globals.css";

export const metadata: Metadata = {
  title: "OSA Platform",
  description: "OSA swim academy platform",
};

export const viewport: Viewport = {
  themeColor: "#0b5d8c",
};

// Reads the language and the signed-in account. Kept inside Suspense so the rest of each page can still be prepared ahead of time.
async function SiteHeader() {
  await connection();
  const lang: Lang = await currentLang();
  const supabase = await createServerSupabase();
  const me = await getCurrentProfile(supabase);
  const signedIn = me !== null && me.is_active;
  const role = signedIn ? me.role : null;
  // Students and families see their profile in the header, with their photo once they add one.
  const studentProfile = signedIn && !isStaff(me.role) ? me : null;
  const photoUrl = studentProfile ? await profilePhotoUrl(supabase, studentProfile.avatar_path) : null;
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link className="site-brand" href="/">
          {t(lang, "brand")}
        </Link>
        <SiteNav links={navLinks(role, lang)} hideCurrent={role === null} />
        <div className="site-tools">
          <UserMenu
            lang={lang}
            label={t(lang, "language")}
            trigger={
              signedIn ? (
                <Avatar name={me.full_name} photoUrl={photoUrl} />
              ) : (
                <span className="user-menu-code">{lang === "ms" ? "BM" : "EN"}</span>
              )
            }
            profileHref={studentProfile ? "/me" : null}
            profileLabel={t(lang, "myProfile")}
            languageLabel={t(lang, "language")}
            languageAction={setLanguage}
            signedIn={signedIn}
            signOutAction={signOut}
            logOutLabel={t(lang, "logOut")}
            name={signedIn ? me.full_name : null}
          />
        </div>
      </div>
    </header>
  );
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Suspense fallback={<header className="site-header">OSA</header>}>
          <SiteHeader />
        </Suspense>
        {children}
        <SiteEffects />
      </body>
    </html>
  );
}
