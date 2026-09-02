/**
 * Validates a `redirect_url` query param before it's used to send a user
 * somewhere after sign-in. Only an internal, single-leading-slash path is
 * accepted — everything else (absolute URLs, protocol-relative `//host`,
 * backslash tricks browsers normalize to `//`, or nothing at all) falls
 * back to the app root. This is the open-redirect guard: a malicious
 * `?redirect_url=` must never be able to send an authenticated user off
 * this origin.
 */
export function getSafeRedirectPath(raw: string | null | undefined): string {
  if (!raw) return "/";

  // Reject anything that isn't a plain internal path: no scheme
  // (`javascript:`, `https:`), no protocol-relative or backslash-based
  // host escape (`//evil.com`, `/\evil.com`, `\\evil.com`), no embedded
  // CR/LF, and must start with exactly one `/`.
  if (!/^\/(?!\/|\\)[^\s\\]*$/.test(raw)) return "/";
  if (/[\r\n]/.test(raw)) return "/";

  return raw;
}

/**
 * Builds the sign-in URL that preserves where a signed-out user was
 * headed, so a deep link redirects back to itself after authentication
 * instead of always dropping the user on the app root.
 */
export function buildSignInUrl(basePath: string, currentPath: string): string {
  const signIn = `${basePath}/sign-in`;
  if (currentPath === "/" || currentPath === basePath || currentPath === "") {
    return signIn;
  }
  return `${signIn}?redirect_url=${encodeURIComponent(currentPath)}`;
}
