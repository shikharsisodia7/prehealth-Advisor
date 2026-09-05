/**
 * Professor-provided guidance shown above the planner (Version 2 of
 * "SCU Health Professions Advising - Program Planner.docx" — Dr. McNelis
 * marked Version 2 "Use this one I think!"). Verbatim; only minor
 * punctuation/markup normalization for list rendering. Do not rewrite.
 */

export interface PlannerGuidanceItem {
  title: string;
  body: string;
}

export const PLANNER_GUIDANCE: PlannerGuidanceItem[] = [
  {
    title: "Research Early",
    body: "Review at least 10 programs during your first year. Prerequisites can vary, so checking specific schools is the only way to ensure you meet the requirements for programs you are interested in.",
  },
  {
    title: "Start In-State",
    body: "Begin with programs in your home state, which typically offer lower tuition for residents. Then select 10 or more additional programs to review their prerequisites.",
  },
  {
    title: "Verify Missing Data",
    body: "Occasionally, the prerequisites for specific programs do not appear in your search. Use this document or the link provided by the application to search any health profession programs manually. Match out-of-institution course titles to the equivalent SCU curriculum.",
  },
  {
    title: "Export Your List",
    body: "Save your search as an Excel file to easily access direct program links and prerequisite course lists organized in separate sheets.",
  },
  {
    title: "Seek Advising Support",
    body: "See Health Professions Advising and Peer Advising to discuss how to integrate prerequisites into your degree planning.",
  },
];

export const PLANNER_DISCLAIMER =
  "Note: This planner supports early academic planning. It does not rank programs, predict admission chances, or recommend where to apply.";

export const PLANNER_ATTRIBUTION = "— Dr. McNelis";

/* ────────────────────────────────────────────────────────────────────────────
 * Additional advising guidance (2026-09-03 meeting with Dr. McNelis).
 *
 * This is ADDITIONAL to the Version 2 copy above, never a replacement for it.
 * Version 2 stays verbatim and approved; this section answers a question
 * Version 2 does not: what a student should actually DO with a result.
 *
 * The concern he raised, in his own example: a student sees "Nutrition —
 * required by School X", concludes "I need Nutrition next quarter", and
 * registers for a course only one school on their list wants. The planner
 * returns *per-school* requirements, so a single appearance is a data point
 * to compare, not an instruction to enrol.
 *
 * Wording rule for anything added here: it must survive being read by a
 * first-year in a hurry. It may be shortened for readability, but the
 * "do not automatically add every prerequisite" instruction may not be
 * softened out of it.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Heading for the primary advising callout, shown above the planner controls. */
export const SCHEDULE_WARNING_TITLE = "Before You Change Your Schedule";

/**
 * The professor's core concern, stated plainly and first. Kept close to the
 * wording he approved in the meeting.
 */
export const SCHEDULE_WARNING_BODY =
  "Do not automatically add every prerequisite shown in your results to your SCU schedule. Requirements vary by program, and a course required by one school may not be necessary for most of the programs on your list.";

/**
 * What to do instead — the stepwise part of the workflow the Version 2
 * bullets do not already cover. Version 2 already tells a student to research
 * 10+ programs, start in-state, check missing data manually, export, and see
 * advising; repeating those here would be noise. These three are the missing
 * middle: compare, fill the gaps, then take it to advising.
 */
export const SCHEDULE_WARNING_STEPS: string[] = [
  "Compare your results across programs — note which requirements appear at many of your programs and which belong to a single school.",
  "Check any program whose requirements could not be retrieved directly with that program, so your comparison is complete.",
  "Bring your program list and your saved results to Health Professions Advising or Peer Advising before adding coursework to your plan.",
];

/** Heading for the shorter reminder rendered with the results. */
export const RESULTS_ADVISING_TITLE = "Use These Results for Planning";

/**
 * The results-side reminder. Deliberately shorter than the callout above —
 * the student has already read the long version; this one exists so the
 * instruction is on screen at the moment a course list actually appears.
 */
export const RESULTS_ADVISING_BODY =
  "Look for requirements that appear across several of your programs, and note the ones unique to a single school. Do not automatically add every listed prerequisite to your schedule. Review your results with Health Professions Advising or Peer Advising before making course-planning changes.";

/**
 * Helper text beside the program picker. Reinforces the professor's "at least
 * 10 programs" guidance where the student is actually choosing programs.
 * Guidance only — the UI imposes no minimum, so a student can still try one
 * or two programs while exploring.
 */
export const TARGET_LIST_HINT =
  "Build a list of at least 10 programs — around 10–15 gives you enough range to see which requirements repeat across programs and which belong to a single school.";


/* ────────────────────────────────────────────────────────────────────────────
 * Pilot-testing "check the official page" instruction (Dr. McNelis, 2026-09-04).
 *
 * Requested alongside the native Report an Error workflow, specifically so peer
 * advisors know to open each program's Official Program Page link and confirm it
 * is actually correct -- rather than trusting the planner's output uncritically --
 * and have a low-friction way to flag it when it is not. Scoped to pilot testing:
 * this is not meant to imply students are responsible for validating the
 * database permanently.
 * ──────────────────────────────────────────────────────────────────────────── */

export const PILOT_TESTING_INSTRUCTIONS_TITLE = "Pilot Testing — Help Us Improve";

export const PILOT_TESTING_INSTRUCTIONS_BODY =
  "During pilot testing, please open the Official Program Page for programs you review and confirm that it matches the correct school and health profession. If a program maps to the wrong page, has incorrect prerequisites, or has a broken link, use Report an Error so we can correct it before wider release.";
