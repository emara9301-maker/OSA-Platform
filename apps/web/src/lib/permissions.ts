import type { AccountRole } from "./staff";

export const isStaff = (role: AccountRole) => role !== "student";
export const canManageCondos = (role: AccountRole) => role === "owner" || role === "department_head";
export const canReadAuditLog = (role: AccountRole) => role === "owner" || role === "department_head";
export const canManagePackagesAndSettings = (role: AccountRole) => role === "owner" || role === "department_head";
export const canSeeAdminAreas = (role: AccountRole) => role === "owner" || role === "department_head";

// Where an account lands when it opens a page it may not use: staff go to the dashboard, everyone else to their profile.
export const homePathFor = (role: AccountRole) => (isStaff(role) ? "/dashboard" : "/me");
