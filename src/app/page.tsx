import { SignInButton, UserButton } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";
import { JobChecker } from "@/components/job-checker";
import { isAllowedEmail } from "../../shared/access";

const REQUIRED_ENV_VARS = [
  "NEXT_PUBLIC_CONVEX_URL",
  "CLERK_JWT_ISSUER_DOMAIN",
  "ALLOWED_EMAILS",
];

function SetupRequired() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-6 py-16">
      <section className="w-full rounded-[2rem] border border-white/12 bg-black/30 p-8 text-white shadow-2xl shadow-black/20 backdrop-blur-xl">
        <p className="text-xs uppercase tracking-[0.3em] text-white/45">Configuration</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
          Finish the Clerk and Convex setup before using the app.
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-white/68">
          The code is in place, but the local environment still needs the required keys and
          workspace config.
        </p>
        <ul className="mt-6 space-y-2 rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/75">
          {REQUIRED_ENV_VARS.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function MarketingScreen() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-6 py-16">
      <section className="grid w-full gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[2rem] border border-white/12 bg-black/35 p-8 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-10">
          <p className="text-xs uppercase tracking-[0.3em] text-white/45">Sync Job Tracker</p>
          <h1 className="mt-4 max-w-3xl text-5xl font-semibold tracking-[-0.06em] text-white sm:text-6xl">
            One shared applied list for every duplicate-prone job link.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-white/68">
            Paste a link from any source, compare it against the shared applied list, and only
            store it if someone actually used it.
          </p>
          <div className="mt-8">
            <SignInButton mode="modal">
              <button className="inline-flex h-13 items-center justify-center rounded-2xl bg-[var(--accent)] px-6 text-sm font-semibold text-slate-950 transition hover:brightness-110">
                Sign in with Google
              </button>
            </SignInButton>
          </div>
        </div>
        <div className="rounded-[2rem] border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] p-8 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-10">
          <p className="text-xs uppercase tracking-[0.3em] text-white/45">What it stores</p>
          <div className="mt-5 space-y-4 text-sm leading-7 text-white/74">
            <p>Only applied jobs are persisted.</p>
            <p>Unapplied checks are shown in a dialog and then discarded.</p>
            <p>Primary duplicate detection uses company + extracted job ID.</p>
            <p>Fallback duplicate detection uses company + title + location.</p>
          </div>
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

export default async function Home() {
  const user = await currentUser();

  const hasRequiredEnv = REQUIRED_ENV_VARS.every((name) => Boolean(process.env[name]));
  if (!hasRequiredEnv) {
    return <SetupRequired />;
  }

  if (!user) {
    return <MarketingScreen />;
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
          <div className="text-xs uppercase tracking-[0.3em] text-white/45">Shared workspace</div>
          <div className="mt-1 text-lg font-medium">Applied job duplicate shield</div>
        </div>
        <UserButton />
      </header>
      <JobChecker viewerName={viewerName} viewerEmail={email} />
    </main>
  );
}
