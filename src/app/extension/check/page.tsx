import { currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { ExtensionJobChecker } from "@/components/extension-job-checker";
import { isAllowedEmail } from "../../../../shared/access";
import { SignInPromptButton } from "./sign-in-prompt-button";

function SignInPrompt({ url }: { url?: string }) {
  const redirectUrl = url
    ? `/extension/check?url=${encodeURIComponent(url)}`
    : "/extension/check";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-6 py-16">
      <section className="w-full rounded-[2rem] border border-white/12 bg-black/35 p-8 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-10">
        <p className="text-xs uppercase tracking-[0.3em] text-white/45">Sign in required</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.06em] text-white sm:text-5xl">
          Sign in to check this job link
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-white/68">
          You need to be signed in to the shared workspace to check job links and mark them as
          applied.
        </p>
        <div className="mt-8">
          <SignInPromptButton redirectUrl={redirectUrl} />
        </div>
      </section>
    </main>
  );
}

function AccessDenied({ email }: { email: string }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-6 py-16">
      <section className="w-full rounded-[2rem] border border-rose-500/20 bg-rose-500/8 p-8 text-white shadow-2xl shadow-black/20 backdrop-blur-xl">
        <p className="text-xs uppercase tracking-[0.3em] text-rose-100/70">Access denied</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
          {email} is not on the shared household allowlist.
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-rose-100/80">
          Update the `ALLOWED_EMAILS` configuration if this account should be able to use the
          workspace.
        </p>
      </section>
    </main>
  );
}

export default async function ExtensionCheckPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawUrl = typeof params.url === "string" ? params.url : undefined;

  // Validate URL parameter — never crash on invalid input
  let validUrl: string | undefined;
  if (rawUrl) {
    try {
      new URL(rawUrl);
      validUrl = rawUrl;
    } catch {
      // Invalid URL — treat as missing, show instructional state
      validUrl = undefined;
    }
  }

  const user = await currentUser();

  if (!user) {
    return <SignInPrompt url={validUrl} />;
  }

  const email =
    user.primaryEmailAddress?.emailAddress ?? user.emailAddresses.at(0)?.emailAddress ?? "";

  if (!isAllowedEmail(email, process.env.ALLOWED_EMAILS)) {
    return <AccessDenied email={email} />;
  }

  const viewerName = user.firstName ?? user.fullName ?? email;

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-6 py-8 sm:px-8 sm:py-10">
      <header className="mb-8 flex items-center justify-between gap-4 rounded-[2rem] border border-white/10 bg-white/6 px-5 py-4 text-white backdrop-blur-xl">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-white/45">Extension check</div>
          <div className="mt-1 text-lg font-medium">Job link checker</div>
        </div>
        <Link
          href="/"
          className="rounded-2xl border border-white/12 bg-white/6 px-4 py-2 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
        >
          Open main app
        </Link>
      </header>
      <ExtensionJobChecker
        viewerName={viewerName}
        viewerEmail={email}
        prefillUrl={validUrl}
      />
    </main>
  );
}
