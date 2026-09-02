/**
 * Single source of truth for the product name, mark and a couple of links.
 * Change here, not per-page — every place that reads these picks up the
 * change automatically.
 */

export const APP_NAME = "SCU Health Professions – Prerequisite Course Planner";

/**
 * One-line description shown on the sign-in page and above the planner.
 * Professor-provided (Version 2 of "SCU Health Professions Advising -
 * Program Planner.docx").
 */
export const APP_DESCRIPTION =
  "Use this tool to quickly find prerequisite courses for your target health professions programs.";

/**
 * The app's visual mark: a cleaned, transparent PNG derived from the
 * professor-supplied "HPA updated logo rectangle transparent background.jpeg"
 * (that file is an opaque RGB JPEG with a checkerboard baked into the
 * pixels, not real transparency — the background was removed deterministically
 * by keying on saturation, since the checkerboard is achromatic gray and the
 * logo is a single saturated maroon). Used on the sign-in page (large) and
 * in AppShell's header (small) — both read this one path.
 */
export const APP_LOGO: string | null = "/branding/scu-health-professions-advising.png";
export const APP_LOGO_ALT = "SCU Health Professions Advising";

/**
 * The Camino pre-health page this tool should eventually link back to.
 * No exact URL has been provided yet — leave null rather than guess. Once
 * given one, set it here and every place that reads CAMINO_URL will pick
 * it up automatically.
 */
export const CAMINO_URL: string | null = null;
