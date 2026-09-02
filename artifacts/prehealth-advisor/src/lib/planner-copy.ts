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
