import { Info } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  PILOT_MODE,
  PILOT_BADGE_LABEL,
  PILOT_NOTICE,
  PILOT_NOTICE_TITLE,
} from "@/lib/pilot-config";

/**
 * The pilot-rollout messaging, in two sizes, both driven by pilot-config.ts.
 * When PILOT_MODE is false each renders nothing, so ending the pilot is a
 * one-line change rather than an edit to every screen.
 *
 * Neither of these is an access control — Clerk sign-in is. They exist
 * because the professor asked that his peer advisors be *told* not to
 * circulate the link, which is a request to a person, not a gate.
 */

/**
 * The full notice, including the no-sharing instruction. Shown once per
 * screen that a tester lands on cold: the sign-in page and the planner.
 * Styled as information rather than as an error — the app is working
 * normally and should not look broken or unfinished.
 */
export function PilotNotice({ className }: { className?: string }) {
  if (!PILOT_MODE) return null;
  return (
    <div
      className={cn(
        "flex items-start gap-2 p-3 rounded-md border border-amber-200 bg-amber-50 text-amber-900 text-sm",
        className,
      )}
    >
      <Info className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
      <p className="leading-relaxed">
        <span className="font-semibold">{PILOT_NOTICE_TITLE}:</span>{" "}
        {PILOT_NOTICE}
      </p>
    </div>
  );
}

/**
 * Compact header marker. Purely a reminder that the session is a pilot one —
 * the wording that matters is in PilotNotice, which every tester passes
 * through on the sign-in page. `title` carries the full text for anyone who
 * hovers, and the badge is real text (not a colour cue) so it survives being
 * read without colour.
 */
export function PilotBadge({ className }: { className?: string }) {
  if (!PILOT_MODE) return null;
  return (
    <span
      title={PILOT_NOTICE}
      className={cn(
        "shrink-0 rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-900",
        className,
      )}
    >
      {PILOT_BADGE_LABEL}
    </span>
  );
}
