/**
 * Whole-dataset integrity checks. Every check runs over all rows, not a sample, and reports a
 * count plus examples so a non-zero result can be acted on.
 */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

const checks: Array<{ name: string; query: string; expectZero: boolean }> = [
  {
    // Campus matters: Keiser runs the same programme in Lakeland and Melbourne, Midwestern in
    // Glendale and Downers Grove, and two unrelated Bethel Universities exist in MN and TN.
    // Only rows identical down to the campus are actually duplicated.
    name: "duplicate active programs (same profession + institution + program + campus)",
    expectZero: true,
    query: `select profession_slug || ' | ' || name || ' | ' || program_name || ' | ' ||
                   coalesce(city,'') || ' ' || state as detail, count(*) n
            from program_schools where directory_status='active'
            group by 1 having count(*) > 1 order by n desc`,
  },
  {
    name: "verified rows with no prerequisites and no explicit statement",
    expectZero: true,
    query: `select id::text || ' ' || name as detail, 1 n from program_schools
            where directory_status='active' and verification_status='verified'
              and jsonb_array_length(coalesce(prereq_courses,'[]'::jsonb)) = 0`,
  },
  {
    name: "verified rows with no source url (missing provenance)",
    expectZero: true,
    query: `select id::text || ' ' || name as detail, 1 n from program_schools
            where directory_status='active' and verification_status='verified'
              and (source_url is null or source_url = '')`,
  },
  {
    name: "finalized rows with no verification date",
    expectZero: true,
    query: `select id::text || ' ' || name as detail, 1 n from program_schools
            where directory_status='active'
              and verification_status in ('verified','no_prereqs_published')
              and last_verified is null`,
  },
  {
    name: "malformed state codes",
    expectZero: true,
    query: `select distinct state as detail, 1 n from program_schools
            where directory_status='active' and state !~ '^[A-Z]{2}$'`,
  },
  {
    name: "medicine rows without MD/DO degree type",
    expectZero: true,
    query: `select id::text || ' ' || name as detail, 1 n from program_schools
            where directory_status='active' and profession_slug='medicine'
              and (degree_type is null or degree_type not in ('MD','DO'))`,
  },
  {
    name: "source url on a test/staging host",
    expectZero: true,
    query: `select id::text || ' ' || source_url as detail, 1 n from program_schools
            where directory_status='active'
              and source_url ~* '(catalogtest|//test[.-]|staging[.-]|\\.dev\\.)'`,
  },
  {
    name: "source url on an aggregator rather than an official site",
    expectZero: true,
    query: `select id::text || ' ' || source_url as detail, 1 n from program_schools
            where directory_status='active'
              and source_url ~* '(usnews|niche\\.com|petersons|gradschools|collegefactual|studentdoctor|reddit|wikipedia)'`,
  },
  {
    // Narrowed to genuine placeholder markers. "sample" and "example course" appear in real
    // course descriptions -- Kansas requires statistics covering "a sample of measurements",
    // and Winston-Salem lists "Example Courses" for its upper-level biology requirement.
    name: "placeholder text in prerequisites",
    expectZero: true,
    query: `select id::text || ' ' || name as detail, 1 n from program_schools
            where directory_status='active'
              and prereq_courses::text ~* '(lorem ipsum|\mplaceholder\M|\mTBD\M|\mTODO\M|\mFIXME\M)'`,
  },
  {
    // Multi-campus universities publish a catalogue per campus, and four Midwestern rows cite
    // the wrong one -- Glendale (AZ) programmes sourced from catalog.il.midwestern.edu.
    //
    // The subdomain must be a real state code to count: catalog.fontbonne.edu and
    // catalog.bradley.edu are institution names, and an earlier version of this check that
    // matched any two letters reported 114 false positives.
    name: "source url citing a different campus catalogue than the programme's state",
    expectZero: true,
    query: `select id::text || ' ' || name || ' (' || state || ') -> ' || source_url as detail, 1 n
            from program_schools
            where directory_status='active'
              and substring(source_url from '://catalog\\.([a-z]{2})\\.') in
                  ('al','ak','az','ar','ca','co','ct','de','fl','ga','hi','id','il','in','ia','ks','ky','la','me','md',
                   'ma','mi','mn','ms','mo','mt','ne','nv','nh','nj','nm','ny','nc','nd','oh','ok','or','pa','ri','sc',
                   'sd','tn','tx','ut','vt','va','wa','wv','wi','wy')
              and upper(substring(source_url from '://catalog\\.([a-z]{2})\\.')) <> upper(state)`,
  },
  {
    // A school publishes requirements on a programme page, not in a news post. Five rows cited
    // editorial pages, and two of those were the wrong programme or the wrong institution: a
    // physician assistant row cited an occupational therapy blog post, and East Carolina's
    // speech row cited a Northeastern news article about prerequisites in general.
    name: "source url is an editorial page rather than a requirements page",
    expectZero: true,
    query: `select id::text || ' ' || name || ' -> ' || source_url as detail, 1 n
            from program_schools
            where directory_status='active'
              and source_url ~* '/(news|blog|press|stories|story|events?|profiles?|magazine)/'`,
  },
  {
    name: "prerequisite entries with an empty name",
    expectZero: true,
    query: `select id::text || ' ' || name as detail, 1 n from program_schools
            where directory_status='active'
              and exists (select 1 from jsonb_array_elements(coalesce(prereq_courses,'[]'::jsonb)) e
                          where coalesce(e->>'name','') = '')`,
  },
];

let failures = 0;
for (const c of checks) {
  const r = await db.execute(sql.raw(c.query));
  const rows = r.rows as any[];
  const bad = rows.length;
  const verdict = bad === 0 ? "OK  " : "FAIL";
  if (bad > 0) failures++;
  console.log(`${verdict} ${String(bad).padStart(4)}  ${c.name}`);
  for (const x of rows.slice(0, 5)) console.log(`        e.g. ${String(x.detail).slice(0, 120)}`);
}
console.log(`\nINTEGRITY_FAILING_CHECKS=${failures} of ${checks.length}`);
process.exit(0);
