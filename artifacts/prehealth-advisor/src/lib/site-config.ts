/**
 * Single source of truth for the product name and a couple of links whose
 * final value is pending outside information. Change here, not per-page —
 * the professor reviewing this tool has said the name may change once a
 * replacement is chosen, and centralizing it makes that a one-line edit.
 */

export const APP_NAME = "Health Professions Program Planner";

/**
 * The Camino pre-health page this tool should eventually link back to.
 * No exact URL has been provided yet — leave null rather than guess. Once
 * given one, set it here and every place that reads CAMINO_URL will pick
 * it up automatically.
 */
export const CAMINO_URL: string | null = null;
