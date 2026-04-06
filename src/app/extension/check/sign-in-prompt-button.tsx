"use client";

import { SignInButton } from "@clerk/nextjs";

export function SignInPromptButton({ redirectUrl }: { redirectUrl: string }) {
  return (
    <SignInButton mode="modal" forceRedirectUrl={redirectUrl}>
      <button className="inline-flex h-13 items-center justify-center rounded-2xl bg-[var(--accent)] px-6 text-sm font-semibold text-slate-950 transition hover:brightness-110">
        Sign in with Google
      </button>
    </SignInButton>
  );
}
