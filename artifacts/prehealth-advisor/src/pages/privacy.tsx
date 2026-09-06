import { APP_NAME, APP_LOGO, APP_LOGO_ALT } from "@/lib/site-config";

/**
 * Public, unauthenticated page. Required as the "privacy policy url" Google
 * asks for before an OAuth consent screen can leave Testing mode — see the
 * Clerk Google SSO connection's custom credentials setup. Content describes
 * what this pilot tool actually does; it is not boilerplate copied from
 * elsewhere.
 */
export function PrivacyPage() {
  return (
    <div className="min-h-[100dvh] bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-2xl">
        {APP_LOGO && (
          <img src={APP_LOGO} alt={APP_LOGO_ALT} className="mb-6 h-auto w-full max-w-[220px]" />
        )}
        <h1 className="font-serif text-2xl font-bold text-foreground">Privacy Policy</h1>
        <p className="mt-1 text-sm text-muted-foreground">{APP_NAME}</p>

        <div className="mt-6 space-y-5 text-sm leading-relaxed text-foreground">
          <p>
            This tool is a pilot being evaluated by SCU Health Professions Peer Advisors. It
            helps testers look up prerequisite coursework for health-professions programs they
            are considering.
          </p>

          <section>
            <h2 className="font-semibold">What we collect</h2>
            <p className="mt-1">
              Signing in is handled by Clerk, our authentication provider. Depending on how you
              sign in, Clerk shares your email address and, if you use Google, the name and
              profile photo on that Google account. We do not receive your Google password. While
              signed in, the target professions, states, and programs you select are saved to
              your account so your planner stays populated between visits. If you submit a
              "Report an Error" form, we store the issue type, description, and the program it
              refers to.
            </p>
          </section>

          <section>
            <h2 className="font-semibold">What we don't collect</h2>
            <p className="mt-1">
              We do not sell or share your data with advertisers, and we do not use it for
              anything beyond running this pilot and improving the prerequisite data it shows.
            </p>
          </section>

          <section>
            <h2 className="font-semibold">Where it's stored</h2>
            <p className="mt-1">
              Account and planner data is stored in a Neon Postgres database operated for this
              project. Authentication itself — passwords, Google sign-in, and session handling —
              is operated by Clerk, Inc. under its own privacy practices.
            </p>
          </section>

          <section>
            <h2 className="font-semibold">Pilot scope</h2>
            <p className="mt-1">
              This application is currently limited to a small testing group and is not intended
              for public use. Data collected during the pilot is used solely to evaluate and
              improve the tool before any wider release.
            </p>
          </section>

          <section>
            <h2 className="font-semibold">Questions</h2>
            <p className="mt-1">Contact your program advisor.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
