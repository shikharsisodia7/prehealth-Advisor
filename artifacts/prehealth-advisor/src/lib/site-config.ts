/**
 * Single source of truth for the product name and a couple of links whose
 * final value is pending outside information. Change here, not per-page —
 * the professor reviewing this tool has said the name may change once a
 * replacement is chosen, and centralizing it makes that a one-line edit.
 */

export const APP_NAME = "Health Professions Program Planner";

/**
 * One-line description shown under the app name on the sign-in page.
 * Pending the professor's replacement application copy — see APP_NAME.
 */
export const APP_DESCRIPTION =
  "Sign in to search prerequisite requirements across pre-health programs.";

/**
 * The app's visual mark. `null` means "use the current icon-based mark"
 * (AppShell's ClipboardList icon + APP_NAME wordmark) rather than an image.
 * The professor has said he will send a logo for both the sign-in page and
 * the application header — once provided, set this to its path (e.g. an
 * asset under `public/`) and every place that reads APP_LOGO picks it up.
 * Do not fabricate one in the meantime.
 */
export const APP_LOGO: string | null = null;

/**
 * The Camino pre-health page this tool should eventually link back to.
 * No exact URL has been provided yet — leave null rather than guess. Once
 * given one, set it here and every place that reads CAMINO_URL will pick
 * it up automatically.
 */
export const CAMINO_URL: string | null = null;
