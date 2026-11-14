import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginFlow } from "./login-flow";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <Suspense>
      <Login searchParams={searchParams} />
    </Suspense>
  );
}

async function Login({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const { ended, other } = await searchParams;
  return <LoginFlow ended={ended === "1"} other={other === "1"} />;
}
