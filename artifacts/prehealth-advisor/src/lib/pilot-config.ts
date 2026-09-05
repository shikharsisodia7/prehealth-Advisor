/**
 * Pilot-rollout state, in one place.
 *
 * Dr. McNelis's proof-of-principle testing group is his Health Professions
 * Peer Advisors, and he asked that they be told not to circulate the link
 * while the pilot runs. That instruction is presentational only — it is a
 * request to the testers, not an access control. Access is enforced by Clerk
 * sign-in (see App.tsx `Protected`), and the notice never substitutes for it.
 *
 * Everything student-facing about the pilot reads from this file, so when
 * Brian says the pilot is over, flipping `PILOT_MODE` to `false` removes the
 * badge and the notice everywhere at once — no component edits, no hunting
 * for duplicated wording.
 *
 * Two things deliberately live outside this file because they are static
 * assets a bundler cannot read a constant from:
 *   - `public/robots.txt` and the `robots` meta tag in `index.html`, both set
 *     to noindex/disallow for the pilot. A pilot that testers are asked not
 *     to share should not be arriving through a search result either. Revert
 *     both alongside `PILOT_MODE` when the pilot ends.
 *
 * NO EMAIL ALLOWLIST EXISTS. The professor described a controlled testing
 * group but supplied no roster of authorized addresses, and inventing one
 * would lock out legitimate users. If he provides real addresses later, the
 * natural home is a Clerk allowed-domains/allowlist rule (server side) rather
 * than a client constant here — a client-side list would be trivially
 * bypassable and would only look like security.
 */

/** Master switch for every pilot-only affordance. Set false when the pilot ends. */
export const PILOT_MODE = true;

/** Compact marker shown beside the product name in the app header. */
export const PILOT_BADGE_LABEL = "Pilot";

/** Heading for the fuller notice. */
export const PILOT_NOTICE_TITLE = "Pilot Testing";

/**
 * The full notice. Carries the no-sharing instruction explicitly, because
 * that is the part the professor actually asked for — a badge alone does not
 * tell a peer advisor not to forward the link.
 */
export const PILOT_NOTICE =
  "This application is currently being evaluated by SCU Health Professions Peer Advisors. Please do not share this application or link outside the current testing group.";
