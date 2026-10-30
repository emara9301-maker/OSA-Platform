import { connection } from "next/server";

// The current time for a request. connection() first, so the page is rendered per request, not cached.
export async function requestTime(): Promise<number> {
  await connection();
  return Date.now();
}
