"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent } from "react";
import type { NavLink } from "@/lib/nav";

// Scrolls to a section on the page you are already on, smoothly, every time the link is pressed.
function scrollToSection(event: MouseEvent<HTMLAnchorElement>, href: string) {
  const [, id] = href.split("#");
  const target = id ? document.getElementById(id) : null;
  if (target) {
    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

// The header's pages. For visitors, the page you are on is left out (on the sign-up page, "Sign up" is hidden).
export function SiteNav({ links, hideCurrent }: { links: NavLink[]; hideCurrent: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="site-nav" aria-label="Main">
      {links
        .filter((link) => !(hideCurrent && link.href === pathname))
        .map((link) => (
          <Link
            key={link.href}
            href={link.href}
            onClick={link.href.startsWith(`${pathname}#`) || link.href.startsWith("/#") ? (event) => scrollToSection(event, link.href) : undefined}
          >
            {link.label}
          </Link>
        ))}
    </nav>
  );
}
