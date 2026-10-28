import { Suspense } from "react";
import { connection } from "next/server";
import { checkDatabase } from "@/lib/health";

async function DatabaseStatus() {
  await connection();

  try {
    const time = await checkDatabase();
    return <p>Connected to database at {time.toISOString()}</p>;
  } catch (error) {
    return <p>Database error: {error instanceof Error ? error.message : "unknown"}</p>;
  }
}

export default function Home() {
  return (
    <main>
      <h1>OSA Platform</h1>
      <Suspense fallback={<p>Checking database...</p>}>
        <DatabaseStatus />
      </Suspense>
    </main>
  );
}
