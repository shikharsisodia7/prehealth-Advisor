import { SignIn, SignUp } from "@clerk/react";
import { ClipboardList } from "lucide-react";
import { APP_NAME, APP_DESCRIPTION, APP_LOGO } from "@/lib/site-config";
import { getSafeRedirectPath } from "@/lib/redirect";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

/**
 * Shared header above the Clerk widget. Reads APP_LOGO / APP_NAME /
 * APP_DESCRIPTION from site-config.ts so the professor's eventual logo and
 * copy replace both this page and the app header in one edit — see
 * site-config.ts.
 */
function AuthHeader() {
  return (
    <div className="flex flex-col items-center gap-2 mb-6 text-center">
      {APP_LOGO ? (
        <img src={APP_LOGO} alt={`${APP_NAME} logo`} className="w-12 h-12" />
      ) : (
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
          <ClipboardList className="w-6 h-6 text-primary" aria-hidden="true" />
        </div>
      )}
      <h1 className="font-serif font-bold text-xl text-foreground tracking-tight">
        {APP_NAME}
      </h1>
      <p className="text-sm text-muted-foreground max-w-xs">{APP_DESCRIPTION}</p>
    </div>
  );
}

function currentRedirectUrl(): string {
  if (typeof window === "undefined") return basePath || "/";
  const params = new URLSearchParams(window.location.search);
  return getSafeRedirectPath(params.get("redirect_url")) || basePath || "/";
}

export function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-[440px]">
        <AuthHeader />
        <SignIn
          routing="path"
          path={`${basePath}/sign-in`}
          signUpUrl={`${basePath}/sign-up`}
          fallbackRedirectUrl={currentRedirectUrl()}
        />
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Trouble signing in? Contact your program advisor.
        </p>
      </div>
    </div>
  );
}

export function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-[440px]">
        <AuthHeader />
        <SignUp
          routing="path"
          path={`${basePath}/sign-up`}
          signInUrl={`${basePath}/sign-in`}
          fallbackRedirectUrl={currentRedirectUrl()}
        />
      </div>
    </div>
  );
}
