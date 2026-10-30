import { canManageCondos, canSeeAdminAreas, isStaff } from "./permissions";
import { t, type Lang } from "./messages";
import type { AccountRole } from "./staff";

export type NavLink = { href: string; label: string };
export type StaffTile = NavLink & { hint: string };
export type StaffGroup = { title: string; links: StaffTile[] };

// Staff areas for the dashboard, in English for now. A tile appears only for roles that may open that page.
export function staffGroups(role: AccountRole): StaffGroup[] {
  const manager = canManageCondos(role);
  const admin = canSeeAdminAreas(role);
  const groups: StaffGroup[] = [
    {
      title: "Teaching",
      links: [
        { href: "/schedule", label: "Schedule", hint: "Lessons, attendance and reports" },
        { href: "/classes", label: "Classes", hint: "Weekly classes and who is enrolled" },
        { href: "/students", label: "Students", hint: "Students, levels and coaches" },
        { href: "/incidents", label: "Incidents", hint: "Report and close incidents" },
      ],
    },
    {
      title: "Places and families",
      links: [
        { href: "/condos", label: "Condos", hint: "Condos, pools, hours and photos" },
        ...(manager ? [{ href: "/families", label: "Families", hint: "Families, guardians and link requests" }] : []),
      ],
    },
    {
      title: "Operations and money",
      links: manager
        ? [
            { href: "/operations", label: "Operations", hint: "Make-ups, alerts and free coaches" },
            { href: "/billing", label: "Billing", hint: "Invoices, payments and holds" },
          ]
        : [],
    },
    {
      title: "Team and settings",
      links: [
        ...(admin || role === "head_coach" ? [{ href: "/settings/roles", label: "Roles", hint: "Who has which role" }] : []),
        ...(admin
          ? [
              { href: "/packages", label: "Packages", hint: "Package types and prices" },
              { href: "/settings", label: "Settings", hint: "Levels, numbers and pool details" },
              { href: "/audit-log", label: "Audit log", hint: "Every change, who made it and when" },
            ]
          : []),
      ],
    },
  ];
  return groups.filter((group) => group.links.length > 0);
}

// What a visitor, a family member, or a staff member may open, in the header. Staff reach their areas from the dashboard.
export function navLinks(role: AccountRole | null, lang: Lang): NavLink[] {
  if (role === null) {
    return [
      { href: "/#condos", label: t(lang, "condos") },
      { href: "/login", label: t(lang, "logIn") },
      { href: "/signup", label: t(lang, "signUp") },
    ];
  }
  if (isStaff(role)) {
    return [{ href: "/dashboard", label: "Dashboard" }];
  }
  // Students and families reach their pages from their profile.
  return [];
}
