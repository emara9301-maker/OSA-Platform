import { Suspense } from "react";
import { LoginForm } from "./login-form";

async function LoginFormWithError({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <LoginForm error={error} />;
}

export default function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return (
    <main>
      <h1>Log in to OSA</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <LoginFormWithError searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
