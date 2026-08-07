import {
  db,
  professionsTable,
  targetSchoolsTable,
  prereqCoursesTable,
  programSchoolsTable,
  type InsertProfession,
  type InsertProgramSchool,
} from "@workspace/db";
import { eq } from "drizzle-orm";

const professions: InsertProfession[] = [
  {
    slug: "medicine",
    name: "Medical School (MD/DO)",
    category: "Physician",
    tagline: "Diagnose, treat, and lead patient care as a physician.",
    description:
      "Allopathic (MD) and osteopathic (DO) medical schools train physicians across every specialty. Applications run through AMCAS, AACOMAS, or TMDSAS, and admissions weigh coursework, the MCAT, clinical and research experience, and competencies beyond the classroom.",
    degree: "MD or DO",
    typicalTimeline: "4 years of school + 3-7 years residency",
    resources: [
      {
        label: "MSAR - Medical School Admission Requirements",
        kind: "directory",
        note: "AAMC Medical School Admission Requirements search tool",
        url: "https://students-residents.aamc.org/medical-school-admission-requirements/medical-school-admission-requirements-msar-applicants",
      },
      {
        label: "Required Premedical Coursework and Competencies (AAMC)",
        kind: "prerequisites",
        note: "Students & Residents official course requirement guidance",
        url: "https://students-residents.aamc.org/medical-school-admission-requirements/required-premedical-coursework-and-competencies",
      },
    ],
  },
  {
    slug: "dental",
    name: "Dental School (DDS/DMD)",
    category: "Oral Health",
    tagline: "Care for teeth, gums, and oral health as a dentist.",
    description:
      "Dental schools grant the DDS or DMD degree. Most programs apply through ADEA AADSAS. Admissions review prerequisite science coursework, the DAT, and clinical shadowing.",
    degree: "DDS or DMD",
    typicalTimeline: "4 years of school + optional residency",
    resources: [
      {
        label: "Where to Apply (ADEA GoDental)",
        kind: "directory",
        note: "Find participating dental schools",
        url: "https://www.adea.org/godental/Apply/resources-and-faqs/where-to-apply",
      },
    ],
  },
  {
    slug: "physician-assistant",
    name: "Physician Assistant (PA)",
    category: "Advanced Practice",
    tagline: "Practice medicine as part of a physician-led team.",
    description:
      "PA programs award a master's degree and apply through CASPA. Programs value patient-care hours, prerequisite sciences, and the GRE at some schools.",
    degree: "Master's (MPAS/MSPAS)",
    typicalTimeline: "2-3 years",
    resources: [
      {
        label: "CASPA Program Directory (PAEA)",
        kind: "directory",
        note: "Search all PA programs and their course requirements",
        url: "https://paeaonline.org/our-programs",
      },
    ],
  },
  {
    slug: "nursing",
    name: "Nursing (ABSN/MEPN)",
    category: "Nursing",
    tagline: "Deliver hands-on patient care and advance the profession.",
    description:
      "This planner covers entry-to-practice nursing programs for students who already hold a non-nursing bachelor's degree: Accelerated BSN (ABSN) and Master's Entry programs (MEPN). The AACN member directory lists accredited programs nationwide.",
    degree: "ABSN or MEPN",
    typicalTimeline: "12-24 months depending on program",
    resources: [
      {
        label: "AACN Member School Directory",
        kind: "directory",
        note: "Accredited nursing programs",
        url: "https://www.aacnnursing.org/about-aacn/member-schools",
      },
    ],
  },
  {
    slug: "pharmacy",
    name: "Pharmacy (PharmD)",
    category: "Pharmacy",
    tagline: "Master medications and optimize drug therapy.",
    description:
      "Doctor of Pharmacy programs apply through PharmCAS. Admissions review prerequisite coursework and, at some schools, the PCAT.",
    degree: "PharmD",
    typicalTimeline: "4 years (some 0-6 direct-entry)",
    resources: [
      {
        label: "PharmD School Directory (PharmCAS)",
        kind: "directory",
        note: "Find pharmacy schools",
        url: "https://www.pharmcas.org/school-directory/pharmd-directory",
      },
    ],
  },
  {
    slug: "physical-therapy",
    name: "Physical Therapy (DPT)",
    category: "Rehabilitation",
    tagline: "Restore movement and function through rehabilitation.",
    description:
      "Doctor of Physical Therapy programs apply through PTCAS. Prerequisites emphasize anatomy, physiology, and observation hours.",
    degree: "DPT",
    typicalTimeline: "3 years",
    resources: [
      {
        label: "APTA - List of PTCAS Programs",
        kind: "directory",
        note: "Directory of DPT programs",
        url: "https://ptcasdirectory.apta.org/39/List-of-PTCAS-Programs",
      },
    ],
  },
  {
    slug: "occupational-therapy",
    name: "Occupational Therapy (OTD/MOT)",
    category: "Rehabilitation",
    tagline: "Help people participate in the activities of daily life.",
    description:
      "Occupational therapy programs are accredited by ACOTE and apply through OTCAS. Programs award master's or doctoral degrees.",
    degree: "MOT or OTD",
    typicalTimeline: "2-3 years",
    resources: [
      {
        label: "School Directory - ACOTE",
        kind: "directory",
        note: "Accredited OT programs",
        url: "https://acoteonline.org/schools/",
      },
    ],
  },
  {
    slug: "optometry",
    name: "Optometry (OD)",
    category: "Vision",
    tagline: "Examine, diagnose, and treat the visual system.",
    description:
      "Doctor of Optometry programs apply through OptomCAS. Admissions review prerequisite sciences and the OAT.",
    degree: "OD",
    typicalTimeline: "4 years",
    resources: [
      {
        label: "ASCO Member Schools and Colleges",
        kind: "directory",
        note: "Find optometry schools",
        url: "https://optometriceducation.org/about-asco/asco-member-schools-and-colleges/",
      },
    ],
  },
  {
    slug: "veterinary",
    name: "Veterinary Medicine (DVM)",
    category: "Animal Health",
    tagline: "Care for the health of animals across species.",
    description:
      "Doctor of Veterinary Medicine programs apply through VMCAS. VMSAR is the authoritative admission-requirements reference.",
    degree: "DVM",
    typicalTimeline: "4 years",
    resources: [
      {
        label: "Veterinary Medical School Admission Requirements (VMSAR)",
        kind: "directory",
        note: "Official AAVMC admission requirements guide",
        url: "https://applytovetschool.org/",
      },
    ],
  },
  {
    slug: "podiatry",
    name: "Podiatric Medicine (DPM)",
    category: "Physician",
    tagline: "Specialize in the foot, ankle, and lower extremity.",
    description:
      "Doctor of Podiatric Medicine programs are represented by AACPM and apply through AACPMAS.",
    degree: "DPM",
    typicalTimeline: "4 years + residency",
    resources: [
      {
        label: "American Association of Colleges of Podiatric Medicine (AACPM)",
        kind: "directory",
        note: "Find podiatry colleges",
        url: "https://aacpm.org/",
      },
    ],
  },
  {
    slug: "prosthetics-orthotics",
    name: "Prosthetics & Orthotics (MSPO)",
    category: "Rehabilitation",
    tagline: "Design and fit devices that restore mobility.",
    description:
      "Orthotist and prosthetist programs award master's degrees and are accredited through CAAHEP/NCOPE.",
    degree: "Master's (MSPO)",
    typicalTimeline: "2 years + residency",
    resources: [
      {
        label: "Orthotist / Prosthetist Programs (NCOPE)",
        kind: "directory",
        note: "Accredited O&P practitioner programs",
        url: "https://ncope.org/index.php/home-page-v2/academic-programs/accredited-practitioner-programs/",
      },
    ],
  },
  {
    slug: "genetic-counseling",
    name: "Genetic Counseling (MS)",
    category: "Counseling",
    tagline: "Guide patients through genetic risk and testing.",
    description:
      "Genetic counseling programs are accredited by ACGC and award a master's degree. Applications use the GC Admissions Match.",
    degree: "Master's (MS)",
    typicalTimeline: "2 years",
    resources: [
      {
        label: "Find A Program - ACGC",
        kind: "directory",
        note: "Accredited genetic counseling programs",
        url: "https://www.gceducation.org/find-a-program/",
      },
    ],
  },
  {
    slug: "dietetics",
    name: "Dietetics (RD/RDN)",
    category: "Nutrition",
    tagline: "Translate nutrition science into patient care.",
    description:
      "Registered dietitian nutritionist pathways require an accredited program and supervised practice, listed in the ACEND program directory.",
    degree: "Master's + supervised practice",
    typicalTimeline: "2-3 years",
    resources: [
      {
        label: "Program Directory (ACEND)",
        kind: "directory",
        note: "Accredited dietetics programs",
        url: "https://www.eatrightpro.org/acend/accredited-programs/program-directory",
      },
    ],
  },
  {
    slug: "speech-language-pathology",
    name: "Speech-Language Pathology (MS/MA)",
    category: "Communication Sciences",
    tagline: "Diagnose and treat communication and swallowing disorders.",
    description:
      "SLP programs award master's degrees and apply through CSDCAS. ASHA EdFind lists accredited graduate programs in SLP and audiology.",
    degree: "Master's (MS/MA)",
    typicalTimeline: "2 years",
    resources: [
      {
        label: "ASHA EdFind - Graduate programs in SLP and Audiology",
        kind: "directory",
        note: "Find accredited programs",
        url: "https://find.asha.org/Ed/",
      },
    ],
  },
  {
    slug: "anesthesiologist-assistant",
    name: "Certified Anesthesiologist Assistant (CAA)",
    category: "Medicine & Surgery",
    tagline: "Work on the anesthesia care team under physician anesthesiologists.",
    description:
      "Anesthesiologist Assistant programs award master's degrees (e.g., MSA, MHS, MMSc) and are accredited by CAAHEP on recommendation of ARC-AA. Applications generally go through CASAA.",
    degree: "Master's (MSA/MMSc/MHS)",
    typicalTimeline: "24-28 months",
    resources: [
      {
        label: "CAAHEP - Find an Accredited Program",
        kind: "directory",
        note: "Official directory of accredited Anesthesiologist Assistant programs",
        url: "https://www.caahep.org/students/find-an-accredited-program",
      },
    ],
  },
  {
    slug: "pathologists-assistant",
    name: "Pathologists' Assistant (PathA)",
    category: "Laboratory Sciences",
    tagline: "Perform gross examination of surgical specimens and assist at autopsy.",
    description:
      "Pathologists' Assistant programs award master's degrees and are accredited by NAACLS. The AAPA (pathassist.org) also lists all NAACLS-accredited training programs.",
    degree: "Master's (MHS/MS)",
    typicalTimeline: "22-24 months",
    resources: [
      {
        label: "NAACLS Program Search",
        kind: "directory",
        note: "Official directory of NAACLS-accredited Pathologists' Assistant programs",
        url: "https://naacls.org/naacls-program-search/",
      },
    ],
  },
  {
    slug: "postbac",
    name: "Postbaccalaureate Programs",
    category: "Preparation",
    tagline: "Strengthen your record or change course toward health.",
    description:
      "Postbac programs help career-changers complete prerequisites or academic-enhancer applicants boost their record before applying to health programs.",
    degree: "Certificate or coursework",
    typicalTimeline: "1-2 years",
    resources: [
      {
        label: "Postbac Program Directory (AAMC)",
        kind: "directory",
        note: "Search postbaccalaureate premedical programs",
        url: "https://mec.aamc.org/postbac/",
      },
    ],
  },
];

async function main(): Promise<void> {
  console.log("Seeding professions...");
  for (const p of professions) {
    await db
      .insert(professionsTable)
      .values(p)
      .onConflictDoUpdate({
        target: professionsTable.slug,
        set: {
          name: p.name,
          category: p.category,
          tagline: p.tagline,
          description: p.description,
          degree: p.degree,
          typicalTimeline: p.typicalTimeline ?? null,
          resources: p.resources ?? [],
        },
      });
  }

  const existingSchools = await db.select().from(targetSchoolsTable);
  if (existingSchools.length === 0) {
    console.log("Seeding example target schools...");
    await db.insert(targetSchoolsTable).values([
      {
        schoolName: "University of Michigan Medical School",
        programName: "Doctor of Medicine (MD)",
        professionSlug: "medicine",
        state: "MI",
        inState: true,
        status: "researching",
        priority: "reach",
        deadline: new Date("2026-10-15T00:00:00Z"),
        appPortal: "AMCAS",
        notes: "Strong research match. Confirm secondary essay prompts.",
      },
      {
        schoolName: "Michigan State University CHM",
        programName: "Doctor of Medicine (MD)",
        professionSlug: "medicine",
        state: "MI",
        inState: true,
        status: "planning",
        priority: "target",
        deadline: new Date("2026-11-01T00:00:00Z"),
        appPortal: "AMCAS",
        notes: "In-state tuition. Community-focused mission.",
      },
      {
        schoolName: "University of Iowa",
        programName: "Doctor of Physical Therapy (DPT)",
        professionSlug: "physical-therapy",
        state: "IA",
        inState: false,
        status: "researching",
        priority: "target",
        deadline: new Date("2026-09-15T00:00:00Z"),
        appPortal: "PTCAS",
        notes: "Need 50 more observation hours.",
      },
    ]);
  }

  const existingPrereqs = await db.select().from(prereqCoursesTable);
  if (existingPrereqs.length === 0) {
    console.log("Seeding example prerequisite courses...");
    await db.insert(prereqCoursesTable).values([
      {
        professionSlug: "medicine",
        name: "General Biology I + Lab",
        category: "Biology",
        status: "completed",
        grade: "A",
        credits: 4,
      },
      {
        professionSlug: "medicine",
        name: "General Chemistry I + Lab",
        category: "Chemistry",
        status: "completed",
        grade: "A-",
        credits: 4,
      },
      {
        professionSlug: "medicine",
        name: "Organic Chemistry I + Lab",
        category: "Chemistry",
        status: "in_progress",
        credits: 4,
      },
      {
        professionSlug: "medicine",
        name: "Biochemistry",
        category: "Chemistry",
        status: "not_started",
        credits: 3,
      },
      {
        professionSlug: "physical-therapy",
        name: "Human Anatomy + Lab",
        category: "Biology",
        status: "not_started",
        credits: 4,
      },
    ]);
  }

  // ── Program Schools (Program Planner reference data) ─────────────────────────
  // All prerequisites are verified required courses only (no recommended courses).
  // Sources: official admissions/prerequisites pages, verified 2026-07-23.
  // verificationStatus: "verified" — confirmed from official program source.
  // classification: "required" — all are formally required by the program.
  //
  // Dropped schools and reasons:
  //   Medicine:  Mayo (no course list on page), UCSD (competency-based),
  //              U Colorado (competency-based), U Michigan (holistic review —
  //              no specific required list), Vanderbilt MD (recommendations only)
  //   DPT:       Northwestern Feinberg (prereq list behind JS accordion)
  //   Nursing:   UCSF MEPN (program paused Nov 2025), Duke ABSN (no public
  //              admissions prereq list), Johns Hopkins (no traditional ABSN)
  // ─────────────────────────────────────────────────────────────────────────

  const programSchools: InsertProgramSchool[] = [
    // ── Medicine (MD) — 5 verified schools ──────────────────────────────────
    {
      professionSlug: "medicine",
      name: "Emory University School of Medicine",
      programName: "Doctor of Medicine (MD)",
      city: "Atlanta",
      state: "GA",
      degreeType: null,
      sourceUrl:
        "https://med.emory.edu/education/programs/md/admissions/step1/index.html",
      lastVerified: "2026-07-23",
      verificationStatus: "verified",
      prereqCourses: [
        { name: "Biology", details: "with lab; 8 semester hours", classification: "required", labRequired: true, semesterCredits: 8 },
        { name: "Chemistry", details: "with lab; 8 semester hours", classification: "required", labRequired: true, semesterCredits: 8 },
        { name: "Organic Chemistry", details: "with lab; 8 semester hours", classification: "required", labRequired: true, semesterCredits: 8 },
        { name: "Physical Science", details: "with lab; 8 semester hours", classification: "required", labRequired: true, semesterCredits: 8 },
        { name: "English", details: "6 semester hours", classification: "required", semesterCredits: 6 },
        { name: "Humanities/Social Sciences", details: "18 semester hours", classification: "required", semesterCredits: 18 },
      ],
    },
    {
      professionSlug: "medicine",
      name: "Georgetown University School of Medicine",
      programName: "Doctor of Medicine (MD)",
      city: "Washington",
      state: "DC",
      degreeType: null,
      sourceUrl:
        "https://meded.georgetown.edu/admissions/degrees-and-admissions/md/guide/",
      lastVerified: "2026-07-23",
      verificationStatus: "verified",
      prereqCourses: [
        { name: "General Biology", details: "1 year required, with lab; 8 semester hours", classification: "required", labRequired: true, semesterCredits: 8 },
        { name: "General Chemistry", details: "1 year required, with lab; 8 semester hours", classification: "required", labRequired: true, semesterCredits: 8 },
        { name: "Organic Chemistry", details: "1 year required, with lab; 8 semester hours", classification: "required", labRequired: true, semesterCredits: 8 },
        { name: "Physics", details: "1 year required, with lab; 8 semester hours", classification: "required", labRequired: true, semesterCredits: 8 },
        { name: "Mathematics or Statistics", details: "1 semester", classification: "required" },
      ],
    },
    {
      professionSlug: "medicine",
      name: "Indiana University School of Medicine",
      programName: "Doctor of Medicine (MD)",
      city: "Indianapolis",
      state: "IN",
      degreeType: null,
      sourceUrl:
        "https://medicine.iu.edu/md/admissions/application-requirements",
      lastVerified: "2026-07-23",
      verificationStatus: "verified",
      prereqCourses: [
        { name: "Biology", details: "1 year required, with lab", classification: "required", labRequired: true },
        { name: "General Chemistry", details: "1 year required, with lab", classification: "required", labRequired: true },
        { name: "Organic Chemistry", details: "1 year required, with lab", classification: "required", labRequired: true },
        { name: "Physics", details: "1 year required, with lab", classification: "required", labRequired: true },
        { name: "Biochemistry", details: "1 semester", classification: "required" },
        { name: "Social Science", details: "1 course", classification: "required", courseCount: 1 },
        { name: "Behavioral Science", details: "1 course", classification: "required", courseCount: 1 },
      ],
    },
    {
      professionSlug: "medicine",
      name: "University of Pittsburgh School of Medicine",
      programName: "Doctor of Medicine (MD)",
      city: "Pittsburgh",
      state: "PA",
      degreeType: null,
      sourceUrl:
        "https://www.medadmissions.pitt.edu/admissions/you-apply/academic-requirements",
      lastVerified: "2026-07-23",
      verificationStatus: "verified",
      prereqCourses: [
        { name: "Biology", details: "1 year required, with lab", classification: "required", labRequired: true },
        { name: "General/Inorganic Chemistry", details: "1 year required, with lab", classification: "required", labRequired: true },
        { name: "Organic Chemistry", details: "1 semester required, with lab", classification: "required", labRequired: true },
        { name: "Biochemistry", details: "1 semester", classification: "required" },
        { name: "Physics", details: "1 year required, with lab", classification: "required", labRequired: true },
        { name: "English/Intensive Writing", details: "1 year required", classification: "required" },
        { name: "Statistics or Biostatistics", details: "1 semester", classification: "required" },
      ],
    },
    {
      professionSlug: "medicine",
      name: "University of Washington School of Medicine",
      programName: "Doctor of Medicine (MD)",
      city: "Seattle",
      state: "WA",
      degreeType: null,
      sourceUrl:
        "https://www.uwmedicine.org/school-of-medicine/md-program/admissions/course-requirements",
      lastVerified: "2026-07-23",
      verificationStatus: "verified",
      prereqCourses: [
        { name: "Biology", details: "1 year required; must include molecular genetics and cell biology (laboratory recommended)", classification: "required" },
        { name: "Chemistry/Biochemistry", details: "2 years required; General Chemistry + Organic Chemistry + Biochemistry (laboratory recommended)", classification: "required" },
        { name: "Physics", details: "1 year required", classification: "required" },
        { name: "Social Sciences/Humanities", details: "Demonstrated competency required", classification: "required" },
      ],
    },

    // ── Physical Therapy (DPT) — 7 verified schools ─────────────────────────
    {
      professionSlug: "physical-therapy",
      name: "Arcadia University",
      programName: "Doctor of Physical Therapy (DPT)",
      city: "Glenside",
      state: "PA",
      degreeType: null,
      sourceUrl:
        "https://www.arcadia.edu/majors-and-programs/physical-therapy-dpt/admission/",
      lastVerified: "2026-07-23",
      verificationStatus: "verified",
      prereqCourses: [
        { name: "Human Anatomy", details: "with lab; Anatomy & Physiology I+II sequence accepted", classification: "required", labRequired: true },
        { name: "Human Physiology", details: "with lab; Anatomy & Physiology I+II sequence accepted", classification: "required", labRequired: true },
        { name: "Upper-level Biology Elective", details: "300-level or above (e.g. Neuroscience, Cell Biology, Pharmacology)", classification: "required" },
        { name: "Chemistry I+II", details: "with lab", classification: "required", labRequired: true },
        { name: "Physics I+II", details: "with lab", classification: "required", labRequired: true },
        { name: "Psychology", details: null, classification: "required" },
        { name: "Anthropology, Sociology, or additional Psychology", details: null, classification: "required" },
        { name: "Statistics", details: null, classification: "required" },
      ],
    },
    {
      professionSlug: "physical-therapy",
      name: "Emory University Division of Physical Therapy",
      programName: "Doctor of Physical Therapy (DPT)",
      city: "Atlanta",
      state: "GA",
      degreeType: null,
      sourceUrl:
        "https://med.emory.edu/departments/rehabilitation-medicine/dpt/admission/index.html",
      lastVerified: "2026-07-23",
      verificationStatus: "verified",
      prereqCourses: [
        { name: "Human Anatomy", details: "with lab; must include musculoskeletal, cardiovascular, and peripheral nervous systems; 4 semester hours", classification: "required", labRequired: true, semesterCredits: 4 },
        { name: "Human Physiology", details: "with lab; 4 semester hours", classification: "required", labRequired: true, semesterCredits: 4 },
        { name: "Physics I+II", details: "with lab; 8 semester hours", classification: "required", labRequired: true, semesterCredits: 8 },
        { name: "Statistics", details: "3 semester hours", classification: "required", semesterCredits: 3 },
      ],
    },
    {
      professionSlug: "physical-therapy",
      name: "Marquette University",
      programName: "Doctor of Physical Therapy (DPT)",
      city: "Milwaukee",
      state: "WI",
      degreeType: null,
      sourceUrl:
        "https://www.marquette.edu/physical-therapy/prerequisites.php",
      lastVerified: "2026-07-23",
      verificationStatus: "verified",
      prereqCourses: [
        { name: "Biology", details: "3 credits", classification: "required", semesterCredits: 3 },
        { name: "Chemistry I+II", details: "each with lab; 8 credits total", classification: "required", labRequired: true, semesterCredits: 8 },
        { name: "Physics I+II", details: "each with lab; 8 credits total", classification: "required", labRequired: true, semesterCredits: 8 },
        { name: "Anatomy and Physiology I+II", details: "6 credits", classification: "required", semesterCredits: 6 },
        { name: "Statistics", details: "3 credits", classification: "required", semesterCredits: 3 },
        { name: "Psychology", details: "3 credits", classification: "required", semesterCredits: 3 },
        { name: "Introduction to Physical Therapy and Medical Terminology", details: "1 credit", classification: "required", semesterCredits: 1 },
      ],
    },
    {
      professionSlug: "physical-therapy",
      name: "University of Delaware",
      programName: "Doctor of Physical Therapy (DPT)",
      city: "Newark",
      state: "DE",
      degreeType: null,
      sourceUrl:
        "https://www.udel.edu/academics/colleges/chs/departments/pt/dpt/entrance-requirements/",
      lastVerified: "2026-07-23",
      verificationStatus: "verified",
      prereqCourses: [
        { name: "Introductory Biology I+II", details: "with lab; 8 credits", classification: "required", labRequired: true, semesterCredits: 8 },
        { name: "Introductory Chemistry I+II", details: "with lab; 8 credits", classification: "required", labRequired: true, semesterCredits: 8 },
        { name: "Introductory Physics I+II", details: "with lab; 8 credits", classification: "required", labRequired: true, semesterCredits: 8 },
        { name: "Human or Mammalian Anatomy", details: "with lab; 4 credits", classification: "required", labRequired: true, semesterCredits: 4 },
        { name: "Human or Mammalian Physiology", details: "with lab; 4 credits", classification: "required", labRequired: true, semesterCredits: 4 },
        { name: "Psychology", details: "3 credits", classification: "required", semesterCredits: 3 },
        { name: "Statistics", details: "3 credits", classification: "required", semesterCredits: 3 },
      ],
    },
    {
      professionSlug: "physical-therapy",
      name: "University of Pittsburgh Department of Physical Therapy",
      programName: "Doctor of Physical Therapy (DPT)",
      city: "Pittsburgh",
      state: "PA",
      degreeType: null,
      sourceUrl:
        "https://www.shrs.pitt.edu/academics/pt/dpt/admissions/",
      lastVerified: "2026-07-23",
      verificationStatus: "verified",
      prereqCourses: [
        { name: "Biology I+II", details: "with lab; 8 credits (for science/pre-med majors)", classification: "required", labRequired: true, semesterCredits: 8 },
        { name: "Chemistry I+II", details: "with lab; 8 credits (for science/pre-med majors)", classification: "required", labRequired: true, semesterCredits: 8 },
        { name: "Physics I+II", details: "with lab; 8 credits (for science/pre-med majors)", classification: "required", labRequired: true, semesterCredits: 8 },
        { name: "Human Anatomy", details: "3 credits", classification: "required", semesterCredits: 3 },
        { name: "Human Physiology", details: "3 credits", classification: "required", semesterCredits: 3 },
        { name: "Introduction to Psychology", details: "3 credits", classification: "required", semesterCredits: 3 },
        { name: "Second Psychology course", details: "3 credits", classification: "required", semesterCredits: 3 },
        { name: "Statistics", details: "3 credits", classification: "required", semesterCredits: 3 },
        { name: "English Writing", details: "3 credits", classification: "required", semesterCredits: 3 },
      ],
    },
    {
      professionSlug: "physical-therapy",
      name: "University of Southern California — Division of Biokinesiology & PT",
      programName: "Doctor of Physical Therapy (DPT)",
      city: "Los Angeles",
      state: "CA",
      degreeType: null,
      sourceUrl:
        "https://pt.usc.edu/programs/doctor-of-physical-therapy-dpt/",
      lastVerified: "2026-07-23",
      verificationStatus: "verified",
      prereqCourses: [
        { name: "Biological Sciences I+II", details: "with lab; 8 semester hours (for science/pre-health majors)", classification: "required", labRequired: true, semesterCredits: 8 },
        { name: "Chemistry I+II", details: "with lab; 8 semester hours (for science/pre-health majors)", classification: "required", labRequired: true, semesterCredits: 8 },
        { name: "Physics I+II", details: "with lab; 8 semester hours (for science/pre-health majors)", classification: "required", labRequired: true, semesterCredits: 8 },
        { name: "Human Anatomy", details: "with lab; 4 semester hours", classification: "required", labRequired: true, semesterCredits: 4 },
        { name: "Human Physiology", details: "with lab; 4 semester hours", classification: "required", labRequired: true, semesterCredits: 4 },
        { name: "Psychology", details: "2 courses; 6 semester hours", classification: "required", courseCount: 2, semesterCredits: 6 },
        { name: "Statistics", details: "3 semester hours", classification: "required", semesterCredits: 3 },
      ],
    },
    {
      professionSlug: "physical-therapy",
      name: "Washington University in St. Louis Program in Physical Therapy",
      programName: "Doctor of Physical Therapy (DPT)",
      city: "St. Louis",
      state: "MO",
      degreeType: null,
      sourceUrl:
        "https://pt.wustl.edu/education/doctor-of-physical-therapy/eligibility-prerequisites/",
      lastVerified: "2026-07-23",
      verificationStatus: "verified",
      prereqCourses: [
        { name: "Biology", details: "6 credits; must cover cell structure/function and macromolecules", classification: "required", semesterCredits: 6 },
        { name: "Chemistry I+II", details: "with lab; 8 credits", classification: "required", labRequired: true, semesterCredits: 8 },
        { name: "Physics I+II", details: "with lab; 8 credits", classification: "required", labRequired: true, semesterCredits: 8 },
        { name: "Human Anatomy", details: "with lab; combined 8 credits total with Physiology", classification: "required", labRequired: true },
        { name: "Human Physiology", details: "with lab; combined 8 credits total with Anatomy", classification: "required", labRequired: true },
        { name: "Psychology", details: "3 credits", classification: "required", semesterCredits: 3 },
        { name: "Statistics", details: "3 credits", classification: "required", semesterCredits: 3 },
      ],
    },

    // ── Nursing — ABSN & MEPN — 2 verified schools ──────────────────────────
    {
      professionSlug: "nursing",
      name: "Samuel Merritt University",
      programName: "Accelerated Bachelor of Science in Nursing (ABSN)",
      city: "Oakland",
      state: "CA",
      degreeType: "ABSN",
      sourceUrl:
        "https://www.samuelmerritt.edu/sites/default/files/2023-08/college_of_nursing_prereq_checklist_absn_2023.pdf",
      lastVerified: "2026-07-23",
      verificationStatus: "verified",
      prereqCourses: [
        { name: "English Composition I", details: null, classification: "required" },
        { name: "English Composition II", details: null, classification: "required" },
        { name: "Speech/Interpersonal Communication", details: null, classification: "required" },
        { name: "General Sociology or Cultural Anthropology", details: null, classification: "required" },
        { name: "Lifespan Developmental Psychology", details: null, classification: "required" },
        { name: "Statistics", details: null, classification: "required" },
        { name: "Social Science elective", details: null, classification: "required" },
        { name: "Nutrition", details: null, classification: "required" },
        { name: "Human Anatomy", details: "with lab", classification: "required", labRequired: true },
        { name: "Human Physiology", details: "with lab", classification: "required", labRequired: true },
        { name: "Microbiology", details: "with lab", classification: "required", labRequired: true },
        { name: "Chemistry", details: "with lab", classification: "required", labRequired: true },
        { name: "Pathophysiology", details: null, classification: "required" },
        { name: "Pharmacology", details: null, classification: "required" },
      ],
    },
    {
      professionSlug: "nursing",
      name: "Vanderbilt University School of Nursing",
      programName: "Master's Entry Program in Nursing (MEPN)",
      city: "Nashville",
      state: "TN",
      degreeType: "MEPN",
      sourceUrl:
        "https://nursing.vanderbilt.edu/admissions/msn-mn-pmc/",
      lastVerified: "2026-07-23",
      verificationStatus: "verified",
      prereqCourses: [
        { name: "Human Anatomy", details: "within 5 years of application", classification: "required", otherConditions: "Must be completed within 5 years of application" },
        { name: "Human Physiology", details: "within 5 years of application", classification: "required", otherConditions: "Must be completed within 5 years of application" },
        { name: "Microbiology", details: "within 5 years of application", classification: "required", otherConditions: "Must be completed within 5 years of application" },
        { name: "Lifespan Development or Developmental Psychology", details: null, classification: "required" },
        { name: "Nutrition", details: null, classification: "required" },
        { name: "Statistics", details: null, classification: "required" },
      ],
    },

    // ── Dental (DDS/DMD) — 4 verified schools ───────────────────────────────
    // Dropped: U Michigan (no official prereq list found on umich pages),
    // Case Western (page has no definitive prereq list)
    {
      professionSlug: "dental",
      name: "UNC Adams School of Dentistry",
      programName: "Doctor of Dental Surgery (DDS)",
      city: "Chapel Hill",
      state: "NC",
      degreeType: null,
      sourceUrl: "https://dentistry.unc.edu/doctor-of-dental-surgery/ddsadmissions/",
      lastVerified: "2026-07-23",
      verificationStatus: "verified",
      prereqCourses: [
        { name: "General Biology and Anatomy & Physiology", details: "8 semester hours; two lecture courses with labs — one General Biology with lab, one Human Anatomy & Physiology with lab", classification: "required", labRequired: true, semesterCredits: 8 },
        { name: "General Chemistry", details: "8 semester hours; two lecture courses with lab", classification: "required", labRequired: true, semesterCredits: 8 },
        { name: "Organic Chemistry", details: "6 semester hours; two lecture courses", classification: "required", semesterCredits: 6 },
        { name: "Biochemistry", details: "3 semester hours; one upper-level lecture course", classification: "required", semesterCredits: 3 },
        { name: "Physics", details: "6 semester hours; two college-level courses", classification: "required", semesterCredits: 6 },
        { name: "English", details: "6 semester hours", classification: "required", semesterCredits: 6 },
      ],
    },
    {
      professionSlug: "dental",
      name: "University of Washington School of Dentistry",
      programName: "Doctor of Dental Surgery (DDS)",
      city: "Seattle",
      state: "WA",
      degreeType: null,
      sourceUrl: "https://dental.washington.edu/students/admissions/requirements/",
      lastVerified: "2026-07-23",
      verificationStatus: "verified",
      prereqCourses: [
        { name: "General Chemistry", details: "2 quarters or 1 semester; lecture (lab not required)", classification: "required" },
        { name: "Organic Chemistry", details: "2 quarters or 1 semester; lecture (lab not required)", classification: "required" },
        { name: "General Biochemistry", details: "2 quarters or 1 semester; lecture (lab not required)", classification: "required" },
        { name: "General Physics", details: "3 quarters or 2 semesters; lecture (lab not required)", classification: "required" },
        { name: "General Biology or Zoology", details: "3 quarters or 2 semesters; lecture (lab not required)", classification: "required" },
        { name: "General Microbiology", details: "2 quarters (or 1 quarter upon review) or 1 semester; lecture (lab not required)", classification: "required" },
      ],
    },
    {
      professionSlug: "dental",
      name: "UCSF School of Dentistry",
      programName: "Doctor of Dental Surgery (DDS)",
      city: "San Francisco",
      state: "CA",
      degreeType: null,
      sourceUrl: "https://dentistry.ucsf.edu/programs/dds/prerequisites",
      lastVerified: "2026-07-23",
      verificationStatus: "verified",
      prereqCourses: [
        { name: "English Composition", details: "two courses; 8 quarter/6 semester units; ESL, scientific, professional, technical, and creative writing not accepted", classification: "required", semesterCredits: 6, quarterCredits: 8 },
        { name: "Inorganic Chemistry", details: "minimum three quarters or two semesters; with lab; 12 quarter/8 semester units", classification: "required", labRequired: true, semesterCredits: 8, quarterCredits: 12 },
        { name: "Organic Chemistry", details: "minimum two quarters or one semester; with lab; 8 quarter/4 semester units", classification: "required", labRequired: true, semesterCredits: 4, quarterCredits: 8 },
        { name: "Biochemistry", details: "4 quarter/3 semester units; must be taken at a 4-year institution", classification: "required", semesterCredits: 3, quarterCredits: 4 },
        { name: "Physics", details: "minimum three quarters or two semesters; with lab; 12 quarter/8 semester units", classification: "required", labRequired: true, semesterCredits: 8, quarterCredits: 12 },
        { name: "Biological Sciences", details: "one year of general biology or zoology for science majors; with lab; 12 quarter/8 semester units", classification: "required", labRequired: true, semesterCredits: 8, quarterCredits: 12 },
        { name: "Psychology", details: "general psychology; 4 quarter/3 semester units", classification: "required", semesterCredits: 3, quarterCredits: 4 },
        { name: "Social Sciences, Humanities, or Foreign Language", details: "16 quarter/11 semester units, in addition to English and Psychology", classification: "required", semesterCredits: 11, quarterCredits: 16 },
      ],
    },
    {
      professionSlug: "dental",
      name: "Tufts University School of Dental Medicine",
      programName: "Doctor of Dental Medicine (DMD)",
      city: "Boston",
      state: "MA",
      degreeType: null,
      sourceUrl: "https://dental.tufts.edu/academics-admissions/dmd-program/dmd-program-application",
      lastVerified: "2026-07-23",
      verificationStatus: "verified",
      prereqCourses: [
        { name: "Biology", details: "2 semesters (8 credits or 3 quarters); with lab", classification: "required", labRequired: true, semesterCredits: 8 },
        { name: "Upper-level Biology", details: "1 semester (3 credits or 1 quarter)", classification: "required", semesterCredits: 3 },
        { name: "Inorganic Chemistry", details: "2 semesters (8 credits or 3 quarters); with lab", classification: "required", labRequired: true, semesterCredits: 8 },
        { name: "Physics", details: "2 semesters (8 credits or 3 quarters); with lab", classification: "required", labRequired: true, semesterCredits: 8 },
        { name: "Organic Chemistry", details: "1 semester (4 credits or 2 quarters); with lab", classification: "required", labRequired: true, semesterCredits: 4 },
        { name: "Biochemistry", details: "1 semester (3 credits or 1 quarter)", classification: "required", semesterCredits: 3 },
        { name: "Writing-intensive Humanities or Social Science", details: "1 semester", classification: "required", otherConditions: "Community college coursework not accepted (except Physics); AP credits not recognized" },
      ],
    },

    // ── Physician Assistant (PA) — 3 verified schools ────────────────────────
    {
      professionSlug: "physician-assistant",
      name: "Duke University School of Medicine",
      programName: "Physician Assistant Program (MHS)",
      city: "Durham",
      state: "NC",
      degreeType: null,
      sourceUrl: "https://medschool.duke.edu/education/health-professions-education-programs/physician-assistant-program/admissions",
      lastVerified: "2026-07-23",
      verificationStatus: "verified",
      prereqCourses: [
        { name: "Anatomy", details: "3 semester hours or 4 quarter hours; combined A&P accepted if total ≥ 6 semester hours", classification: "required", semesterCredits: 3, quarterCredits: 4 },
        { name: "Physiology", details: "3 semester hours or 4 quarter hours; combined A&P accepted if total ≥ 6 semester hours", classification: "required", semesterCredits: 3, quarterCredits: 4 },
        { name: "Microbiology", details: "3 semester hours or 4 quarter hours", classification: "required", semesterCredits: 3, quarterCredits: 4 },
        { name: "Other Biology (two courses)", details: "3 semester hours or 4 quarter hours each", classification: "required", courseCount: 2 },
        { name: "Chemistry (two courses)", details: "4 semester hours or 5 quarter hours each; must include lab", classification: "required", labRequired: true, courseCount: 2 },
        { name: "Statistics", details: "2 semester hours or 3 quarter hours", classification: "required", semesterCredits: 2, quarterCredits: 3 },
      ],
    },
    {
      professionSlug: "physician-assistant",
      name: "University of Iowa Carver College of Medicine",
      programName: "Physician Assistant Program (MPAS)",
      city: "Iowa City",
      state: "IA",
      degreeType: null,
      sourceUrl: "https://pa.medicine.uiowa.edu/admissions/admission-requirements",
      lastVerified: "2026-07-23",
      verificationStatus: "verified",
      prereqCourses: [
        { name: "Biology sequence", details: "complete sequence (e.g., General Biology I and II); community college courses must be general, not introductory, level", classification: "required" },
        { name: "Physiology", details: "one course (Animal, Exercise, or Human); a two-semester combined anatomy-physiology sequence may satisfy this", classification: "required", courseCount: 1 },
        { name: "Upper-level Biology or Zoology", details: "at least 3 additional courses that require prerequisites for enrollment", classification: "required", courseCount: 3 },
        { name: "Inorganic Chemistry sequence", details: "complete sequence (General Chemistry I and II)", classification: "required" },
        { name: "Organic Chemistry", details: "at least 1 semester; must require a prerequisite for enrollment", classification: "required" },
        { name: "Biochemistry", details: "one introductory/general course; must require Organic Chemistry for enrollment", classification: "required", courseCount: 1 },
        { name: "Statistics", details: "one course; any course with Statistics in the title generally qualifies", classification: "required", courseCount: 1 },
      ],
    },
    {
      professionSlug: "physician-assistant",
      name: "Baylor College of Medicine",
      programName: "Physician Assistant Program (MSc)",
      city: "Houston",
      state: "TX",
      degreeType: null,
      sourceUrl: "https://www.bcm.edu/education/school-of-health-professions/physician-assistant-program/admissions/prerequisites",
      lastVerified: "2026-07-23",
      verificationStatus: "verified",
      prereqCourses: [
        { name: "Anatomy", details: "4 semester/5 quarter hours; with lab (or combined A&P I/II, 8 semester hours with labs)", classification: "required", labRequired: true, semesterCredits: 4, quarterCredits: 5 },
        { name: "Physiology", details: "4 semester/5 quarter hours; with lab (or combined A&P I/II, 8 semester hours with labs)", classification: "required", labRequired: true, semesterCredits: 4, quarterCredits: 5 },
        { name: "Microbiology", details: "4 semester/5 quarter hours; with lab", classification: "required", labRequired: true, semesterCredits: 4, quarterCredits: 5 },
        { name: "Genetics", details: "3 semester/4 quarter hours", classification: "required", semesterCredits: 3, quarterCredits: 4 },
        { name: "General Chemistry I", details: "4 semester/5 quarter hours; with lab", classification: "required", labRequired: true, semesterCredits: 4, quarterCredits: 5 },
        { name: "General Chemistry II", details: "4 semester/5 quarter hours; with lab", classification: "required", labRequired: true, semesterCredits: 4, quarterCredits: 5 },
        { name: "Organic Chemistry", details: "4 semester/5 quarter hours; with lab", classification: "required", labRequired: true, semesterCredits: 4, quarterCredits: 5 },
        { name: "Psychology or Sociology", details: "3 semester/4 quarter hours", classification: "required", semesterCredits: 3, quarterCredits: 4 },
        { name: "Expository Writing/English Composition", details: "3 semester/4 quarter hours", classification: "required", semesterCredits: 3, quarterCredits: 4 },
        { name: "Statistics", details: "3 semester/4 quarter hours; must include ANOVA", classification: "required", semesterCredits: 3, quarterCredits: 4, otherConditions: "Science courses must be for science majors; grade C or higher; AP credit not accepted" },
      ],
    },

    // ── Pharmacy (PharmD) — 3 verified schools ───────────────────────────────
    // Dropped: Purdue (page defers to external curriculum document)
    {
      professionSlug: "pharmacy",
      name: "University of Michigan College of Pharmacy",
      programName: "Doctor of Pharmacy (PharmD)",
      city: "Ann Arbor",
      state: "MI",
      degreeType: null,
      sourceUrl: "https://pharmacy.umich.edu/prospective-students/admissions/pharmd-program-admissions/pharmd-prerequisites",
      lastVerified: "2026-07-23",
      verificationStatus: "verified",
      prereqCourses: [
        { name: "Biology", details: "2 semesters or 3 quarters; full year sequence", classification: "required" },
        { name: "Biochemistry", details: "1 semester or 1 quarter; introductory", classification: "required" },
        { name: "Calculus", details: "1 semester or 1 quarter", classification: "required" },
        { name: "English Composition", details: "1 semester or 1 quarter; must be writing intensive; AP not accepted", classification: "required" },
        { name: "General Chemistry", details: "2 semesters or 3 quarters; full year sequence; with lab", classification: "required", labRequired: true },
        { name: "Genetics", details: "1 semester or 1 quarter; introductory; evolutionary/population genetics not accepted", classification: "required" },
        { name: "Human Anatomy", details: "1 semester or 1 quarter; must cover entire body; animal anatomy not accepted", classification: "required" },
        { name: "Human Physiology", details: "1 semester or 1 quarter; animal physiology not accepted", classification: "required" },
        { name: "Humanities", details: "2 semesters or 3 quarters", classification: "required" },
        { name: "Microbiology", details: "1 semester or 1 quarter; with lab (separate lab acceptable)", classification: "required", labRequired: true },
        { name: "Organic Chemistry", details: "2 semesters or 3 quarters; full year sequence; with lab; AP not accepted", classification: "required", labRequired: true },
        { name: "Physics", details: "1 semester or 1 quarter; with lab", classification: "required", labRequired: true },
        { name: "Statistics", details: "1 semester or 1 quarter; biostatistics accepted", classification: "required" },
        { name: "Social Science", details: "2 semesters or 3 quarters", classification: "required", otherConditions: "All prerequisites require grade C or above" },
      ],
    },
    {
      professionSlug: "pharmacy",
      name: "University of Wisconsin–Madison School of Pharmacy",
      programName: "Doctor of Pharmacy (PharmD)",
      city: "Madison",
      state: "WI",
      degreeType: null,
      sourceUrl: "https://pharmacy.wisc.edu/pharmd/prerequisites/",
      lastVerified: "2026-07-23",
      verificationStatus: "verified",
      prereqCourses: [
        { name: "Calculus", details: "1 course designed for math or science majors", classification: "required", courseCount: 1 },
        { name: "Statistics", details: "1 college-level course", classification: "required", courseCount: 1 },
        { name: "General Chemistry I & II", details: "2-course sequence; with lab", classification: "required", labRequired: true, courseCount: 2 },
        { name: "Organic Chemistry I & II", details: "2-course sequence; with lab", classification: "required", labRequired: true, courseCount: 2 },
        { name: "General Biology I & II", details: "2-semester integrated sequence; with lab", classification: "required", labRequired: true, courseCount: 2 },
        { name: "Microbiology", details: "1 course; lab not required", classification: "required", courseCount: 1 },
        { name: "Human or Comparative Physiology", details: "1 course; lab not required", classification: "required", courseCount: 1 },
        { name: "Physics", details: "1 course; algebra or calculus-based; lab not required", classification: "required", courseCount: 1 },
        { name: "English Composition", details: "1 course; satisfied by a U.S. bachelor's degree earned before matriculation", classification: "required", courseCount: 1 },
        { name: "General Electives", details: "4 courses (min 12 credits) in social science, communication, humanities, cultural studies, or foreign language; satisfied by a U.S. bachelor's degree", classification: "required", courseCount: 4, semesterCredits: 12, otherConditions: "Science prerequisites within 10 years; grade C- or better; minimum 72 total credits" },
      ],
    },
    {
      professionSlug: "pharmacy",
      name: "University of Minnesota College of Pharmacy",
      programName: "Doctor of Pharmacy (PharmD)",
      city: "Minneapolis",
      state: "MN",
      degreeType: null,
      sourceUrl: "https://www.pharmacy.umn.edu/doctor-pharmacy/admissions/how-apply/prerequisites",
      lastVerified: "2026-07-23",
      verificationStatus: "verified",
      prereqCourses: [
        { name: "General Biology", details: "1 course with lab (or a more advanced biology lab substitute)", classification: "required", labRequired: true, courseCount: 1 },
        { name: "Microbiology", details: "1 course; lab recommended but not required", classification: "required", courseCount: 1 },
        { name: "Anatomy and Physiology", details: "full sequence (human or comparative) covering all body systems", classification: "required" },
        { name: "Calculus", details: "1 college-level course", classification: "required", courseCount: 1 },
        { name: "Statistics", details: "1 college-level course", classification: "required", courseCount: 1 },
        { name: "General Chemistry", details: "full sequence (generally two courses); at least one lab", classification: "required", labRequired: true },
        { name: "Organic Chemistry", details: "full sequence (generally two courses); at least one lab", classification: "required", labRequired: true },
        { name: "Social & Behavioral Sciences or Humanities", details: "two courses (or MN Transfer Curriculum / U.S. associate's or bachelor's degree)", classification: "required", courseCount: 2 },
        { name: "Introductory Composition", details: "1 course (or MN Transfer Curriculum / U.S. associate's or bachelor's degree)", classification: "required", courseCount: 1 },
      ],
    },

    // ── Optometry (OD) — 3 verified schools ──────────────────────────────────
    {
      professionSlug: "optometry",
      name: "The Ohio State University College of Optometry",
      programName: "Doctor of Optometry (OD)",
      city: "Columbus",
      state: "OH",
      degreeType: null,
      sourceUrl: "https://optometry.osu.edu/admissions/admissions-requirements",
      lastVerified: "2026-07-23",
      verificationStatus: "verified",
      prereqCourses: [
        { name: "English Composition", details: "1 course", classification: "required", courseCount: 1 },
        { name: "Inorganic Chemistry", details: "2 courses; with lab", classification: "required", labRequired: true, courseCount: 2 },
        { name: "Organic Chemistry", details: "1 course", classification: "required", courseCount: 1 },
        { name: "Biochemistry", details: "1–2 courses; must take both if institution uses a two-course series", classification: "required" },
        { name: "Physics", details: "2 courses; with lab; must cover mechanics, heat, light, sound, electricity, magnetism, modern physics", classification: "required", labRequired: true, courseCount: 2 },
        { name: "Calculus", details: "1 course", classification: "required", courseCount: 1 },
        { name: "Biology", details: "2 courses; with lab", classification: "required", labRequired: true, courseCount: 2 },
        { name: "Physiology", details: "1–2 courses; must cover all body systems", classification: "required" },
        { name: "Microbiology", details: "1 course; with lab", classification: "required", labRequired: true, courseCount: 1 },
        { name: "Introductory Psychology", details: "1 course", classification: "required", courseCount: 1 },
        { name: "Humanities", details: "2–3 courses", classification: "required" },
        { name: "Social Sciences", details: "2–3 courses", classification: "required", otherConditions: "All laboratory coursework must be completed in person" },
      ],
    },
    {
      professionSlug: "optometry",
      name: "UC Berkeley School of Optometry",
      programName: "Doctor of Optometry (OD)",
      city: "Berkeley",
      state: "CA",
      degreeType: null,
      sourceUrl: "https://optometry.berkeley.edu/admissions/how-to-apply/course-requirements/",
      lastVerified: "2026-07-23",
      verificationStatus: "verified",
      prereqCourses: [
        { name: "General Chemistry", details: "2 semesters or 3 quarters; with lab (3 semesters total combined with Organic Chemistry)", classification: "required", labRequired: true },
        { name: "Organic Chemistry", details: "1 semester or 1 quarter; with lab", classification: "required", labRequired: true },
        { name: "Biochemistry", details: "1 semester or 1 quarter", classification: "required" },
        { name: "General Biology", details: "2 semesters or 3 quarters; with lab", classification: "required", labRequired: true },
        { name: "General Physics", details: "2 semesters or 3 quarters; with lab", classification: "required", labRequired: true },
        { name: "Anatomy", details: "1 semester or 1 quarter", classification: "required" },
        { name: "Human Physiology", details: "1 semester or 1 quarter", classification: "required" },
        { name: "Microbiology", details: "1 semester or 1 quarter", classification: "required" },
        { name: "Calculus", details: "1 semester or 1 quarter", classification: "required" },
        { name: "Statistics", details: "1 semester or 1 quarter", classification: "required" },
        { name: "Reading and Composition", details: "2 semesters or 3 quarters", classification: "required" },
        { name: "Psychology", details: "1 semester or 1 quarter", classification: "required", otherConditions: "All prerequisites require final grade C or better; labs must be in person" },
      ],
    },
    {
      professionSlug: "optometry",
      name: "SUNY College of Optometry",
      programName: "Doctor of Optometry (OD)",
      city: "New York",
      state: "NY",
      degreeType: null,
      sourceUrl: "https://www.sunyopt.edu/od-admissions-requirements/",
      lastVerified: "2026-07-23",
      verificationStatus: "verified",
      prereqCourses: [
        { name: "General Biology", details: "2 semesters; with lab; Anatomy, Physiology, Cellular Biology, Zoology may substitute (not Botany)", classification: "required", labRequired: true },
        { name: "General Chemistry", details: "2 semesters; with lab; Inorganic Chemistry acceptable", classification: "required", labRequired: true },
        { name: "General Physics", details: "2 semesters; with lab; Engineering Physics acceptable", classification: "required", labRequired: true },
        { name: "Organic Chemistry", details: "1 semester; with lab", classification: "required", labRequired: true },
        { name: "Microbiology", details: "1 semester; with lab", classification: "required", labRequired: true },
        { name: "Biochemistry", details: "1 semester; lecture only", classification: "required" },
        { name: "Calculus", details: "1 semester; pre-calculus acceptable", classification: "required" },
        { name: "English Composition & Literature", details: "2 semesters; writing-intensive courses acceptable; one semester of Public Speaking acceptable", classification: "required" },
        { name: "General Psychology", details: "1 semester", classification: "required" },
        { name: "Statistics", details: "1 semester; psychology/business statistics, biometrics, biostatistics acceptable", classification: "required", otherConditions: "All required courses need grade C or better" },
      ],
    },

    // ── Occupational Therapy (OTD/MOT) — 3 verified schools ──────────────────
    // Dropped: Boston University (page has degree requirements, not admission prereqs)
    {
      professionSlug: "occupational-therapy",
      name: "Washington University in St. Louis Program in Occupational Therapy",
      programName: "Doctor of Occupational Therapy (OTD)",
      city: "St. Louis",
      state: "MO",
      degreeType: null,
      sourceUrl: "https://www.ot.wustl.edu/education/doctorate-otd-587",
      lastVerified: "2026-07-23",
      verificationStatus: "verified",
      prereqCourses: [
        { name: "Abnormal Psychology", details: "3 semester hours; grade B or better", classification: "required", semesterCredits: 3 },
        { name: "Developmental Psychology", details: "3 semester hours; must include learning principles and motor, language, cognitive, emotional, social development", classification: "required", semesterCredits: 3 },
        { name: "Life Science", details: "3 semester hours; 200 level or above", classification: "required", semesterCredits: 3 },
        { name: "Physiology", details: "3 semester hours; must cover organization of cells into tissues, organs, organ systems in humans", classification: "required", semesterCredits: 3 },
        { name: "Social Science", details: "3 semester hours", classification: "required", semesterCredits: 3 },
        { name: "Statistics", details: "3 semester hours; behavioral, educational, psychological, or mathematical (business statistics excluded)", classification: "required", semesterCredits: 3, otherConditions: "Grade B or better in each; at least four of six complete at time of application" },
      ],
    },
    {
      professionSlug: "occupational-therapy",
      name: "Colorado State University",
      programName: "Occupational Therapy Doctorate (OTD)",
      city: "Fort Collins",
      state: "CO",
      degreeType: null,
      sourceUrl: "https://www.chhs.colostate.edu/ot/programs-and-degrees/occupational-therapy-doctorate/prerequisite-courses/",
      lastVerified: "2026-07-23",
      verificationStatus: "verified",
      prereqCourses: [
        { name: "Anatomy and Physiology", details: "minimum 6 credits; anatomy must include weekly labs; all courses in a sequence must be completed", classification: "required", labRequired: true, semesterCredits: 6 },
        { name: "Lifespan Development", details: "minimum 3 credits; must cover physical, cognitive, psychosocial development across the entire lifespan", classification: "required", semesterCredits: 3 },
        { name: "Statistics", details: "minimum 3 credits; any basic college-level statistics course", classification: "required", semesterCredits: 3 },
        { name: "Abnormal Psychology", details: "minimum 3 credits; broad introductory course", classification: "required", semesterCredits: 3 },
        { name: "Brain Structure & Function (Neuroscience)", details: "minimum 3 credits; in-depth brain structure and function", classification: "required", semesterCredits: 3 },
        { name: "Medical Terminology", details: "minimum 1 credit; general course for health and human service professions", classification: "required", semesterCredits: 1, otherConditions: "Minimum grade C; taken within 10 years of starting the program" },
      ],
    },
    {
      professionSlug: "occupational-therapy",
      name: "Tufts University",
      programName: "Entry-Level Occupational Therapy Doctorate (OTD)",
      city: "Medford",
      state: "MA",
      degreeType: null,
      sourceUrl: "https://as.tufts.edu/occupationaltherapy/prospective-students/admissions/prerequisites",
      lastVerified: "2026-07-23",
      verificationStatus: "verified",
      prereqCourses: [
        { name: "Human Cell Biology", details: "1 course (human cell biology or human anatomy substitute)", classification: "required", courseCount: 1 },
        { name: "Physiology", details: "1 course (human physiology); if combined A&P I and II, both must be taken", classification: "required", courseCount: 1 },
        { name: "Human Development", details: "1 course; human/lifespan development; child development or developmental psych acceptable", classification: "required", courseCount: 1 },
        { name: "Abnormal Psychology", details: "1 course; abnormal psychology or psychopathology", classification: "required", courseCount: 1 },
        { name: "General Social Science", details: "1 course; psychology, sociology, or anthropology", classification: "required", courseCount: 1 },
        { name: "Statistics", details: "1 introductory course", classification: "required", courseCount: 1, otherConditions: "Grade B- or above in all prerequisites; at least one science prerequisite must contain a lab" },
      ],
    },

    // ── Veterinary Medicine (DVM) — 3 verified schools ───────────────────────
    // Dropped: Ohio State DVM (page states hours are a guideline, not exhaustive)
    {
      professionSlug: "veterinary",
      name: "Colorado State University College of Veterinary Medicine & Biomedical Sciences",
      programName: "Doctor of Veterinary Medicine (DVM)",
      city: "Fort Collins",
      state: "CO",
      degreeType: null,
      sourceUrl: "https://vetmedbiosci.colostate.edu/dvm/admission-requirements/",
      lastVerified: "2026-07-23",
      verificationStatus: "verified",
      prereqCourses: [
        { name: "Biological Sciences Lab", details: "1 credit; any biology course with a lab", classification: "required", labRequired: true, semesterCredits: 1 },
        { name: "Genetics", details: "3 credits; must be title-indicated as genetics", classification: "required", semesterCredits: 3 },
        { name: "Cell Biology", details: "3 credits; must be title-indicated as cell biology", classification: "required", semesterCredits: 3 },
        { name: "Systems Physiology", details: "3 credits; title-indicated; or two-part A&P series", classification: "required", semesterCredits: 3 },
        { name: "Biomedical Science", details: "9 credits; upper-division courses from program list", classification: "required", semesterCredits: 9 },
        { name: "Chemistry Lab", details: "1 credit; any chemistry course with a lab", classification: "required", labRequired: true, semesterCredits: 1 },
        { name: "Biochemistry", details: "3 credits; upper-division; requires organic chemistry prerequisite", classification: "required", semesterCredits: 3 },
        { name: "Physics", details: "4 credits; must include laboratory component", classification: "required", labRequired: true, semesterCredits: 4 },
        { name: "Statistics", details: "3 credits; title-indicated; no calculus substitution", classification: "required", semesterCredits: 3 },
        { name: "English Composition", details: "3 credits; a 4-year degree fulfills this", classification: "required", semesterCredits: 3 },
        { name: "Arts/Humanities/Social Sciences", details: "12 credits from listed categories", classification: "required", semesterCredits: 12, otherConditions: "Grade C- or above; biochem/cell bio/genetics/physiology within last 10 years" },
      ],
    },
    {
      professionSlug: "veterinary",
      name: "Cornell University College of Veterinary Medicine",
      programName: "Doctor of Veterinary Medicine (DVM)",
      city: "Ithaca",
      state: "NY",
      degreeType: null,
      sourceUrl: "https://www.vet.cornell.edu/education/doctor-veterinary-medicine/prospective-students/admissions/requirements/prerequisite-credits-and-courses",
      lastVerified: "2026-07-23",
      verificationStatus: "verified",
      prereqCourses: [
        { name: "Biology", details: "2 semesters or 3 quarters (min 6 semester/9 quarter credits); with in-person labs", classification: "required", labRequired: true, semesterCredits: 6, quarterCredits: 9 },
        { name: "Chemistry", details: "2 semesters or 3 quarters (min 6 semester/9 quarter credits); with in-person labs", classification: "required", labRequired: true, semesterCredits: 6, quarterCredits: 9 },
        { name: "Physics", details: "2 semesters or 3 quarters (min 6 semester/9 quarter credits); with in-person labs", classification: "required", labRequired: true, semesterCredits: 6, quarterCredits: 9 },
        { name: "English Composition / Writing Intensive", details: "2 semesters or 3 quarters (min 6 semester/9 quarter credits); AP, foreign language, communications credits not accepted", classification: "required", semesterCredits: 6, quarterCredits: 9 },
        { name: "Biochemistry", details: "1 semester (min 3 semester/4.5 quarter credits); upper-division; no lab required", classification: "required", semesterCredits: 3 },
        { name: "Humanities/Social Sciences", details: "min 6 semester or 9 quarter credits", classification: "required", semesterCredits: 6, quarterCredits: 9 },
        { name: "Advanced Life Sciences", details: "min 12 semester or 18 quarter credits (genetics, microbiology, etc.)", classification: "required", semesterCredits: 12, quarterCredits: 18, otherConditions: "60 completed semester credits, at least 30 upper-division at a four-year institution; minimum C- in all prerequisites" },
      ],
    },
    {
      professionSlug: "veterinary",
      name: "UC Davis School of Veterinary Medicine",
      programName: "Doctor of Veterinary Medicine (DVM)",
      city: "Davis",
      state: "CA",
      degreeType: null,
      sourceUrl: "https://www.vetmed.ucdavis.edu/admissions/academic-preparation-preveterinary-required-courses",
      lastVerified: "2026-07-23",
      verificationStatus: "verified",
      prereqCourses: [
        { name: "College Physics", details: "2 semesters or 2-3 quarters; no lab required", classification: "required" },
        { name: "General Biology", details: "2 semesters or 3 quarters; with lab", classification: "required", labRequired: true },
        { name: "General Chemistry", details: "2 semesters or 3 quarters; with lab", classification: "required", labRequired: true },
        { name: "Organic Chemistry", details: "2 semesters or 2 quarters; one lab total", classification: "required", labRequired: true },
        { name: "Statistics", details: "1 semester or 1 quarter", classification: "required" },
        { name: "Biochemistry with Metabolism", details: "1 semester or 1 quarter; upper-division at a four-year college", classification: "required" },
        { name: "Genetics", details: "1 semester or 1 quarter; upper-division at a four-year college", classification: "required" },
        { name: "Systemic Physiology", details: "1 semester or 1 quarter; upper-division; combined A&P only if upper-division two-course sequence", classification: "required", otherConditions: "All courses grade C or higher" },
      ],
    },

    // ── Speech-Language Pathology (MS/MA) — 2 verified schools ───────────────
    // Dropped: Vanderbilt (prerequisites explicitly not required for admission)
    {
      professionSlug: "speech-language-pathology",
      name: "Northwestern University",
      programName: "MS in Speech, Language, and Learning (SLP)",
      city: "Evanston",
      state: "IL",
      degreeType: null,
      sourceUrl: "https://mssll.northwestern.edu/admissions/prerequisites/",
      lastVerified: "2026-07-23",
      verificationStatus: "verified",
      prereqCourses: [
        { name: "Biological Sciences", details: "1 course; biology, human A&P, neuroanatomy/neurophysiology, human genetics, or veterinary science; grade C or better", classification: "required", courseCount: 1 },
        { name: "Physical Sciences", details: "1 course; physics or chemistry; grade C or better", classification: "required", courseCount: 1 },
        { name: "Statistics", details: "1 course; must be an actual statistics course (not research methods); grade B- or better", classification: "required", courseCount: 1 },
        { name: "Social/Behavioral Sciences", details: "1 course; psychology, sociology, anthropology, or education; grade C or better", classification: "required", courseCount: 1 },
        { name: "Anatomy and Physiology of the Vocal Mechanism", details: "field-specific course; grade B- or better; must be completed before beginning the MS program", classification: "required", courseCount: 1 },
        { name: "Phonetics", details: "field-specific course; grade B- or better", classification: "required", courseCount: 1 },
        { name: "Language Development", details: "field-specific course; grade B- or better", classification: "required", courseCount: 1 },
        { name: "Introduction to Audiology", details: "field-specific course; grade B- or better", classification: "required", courseCount: 1 },
        { name: "Aural Rehabilitation", details: "field-specific course; grade B- or better", classification: "required", courseCount: 1 },
        { name: "Observation of Therapy", details: "25 hours with ASHA-certified SLPs", classification: "required", otherConditions: "Prerequisites must be complete before beginning the MS program" },
      ],
    },
    {
      professionSlug: "speech-language-pathology",
      name: "University of Iowa",
      programName: "MS in Speech-Language Pathology",
      city: "Iowa City",
      state: "IA",
      degreeType: null,
      sourceUrl: "https://csd.uiowa.edu/graduate/admissions",
      lastVerified: "2026-07-23",
      verificationStatus: "verified",
      prereqCourses: [
        { name: "Biological Science", details: "1 course (human/animal)", classification: "required", courseCount: 1 },
        { name: "Physical Science", details: "1 course (physics or chemistry)", classification: "required", courseCount: 1 },
        { name: "Social/Behavioral Science", details: "1 course (e.g., psychology)", classification: "required", courseCount: 1 },
        { name: "Introductory Statistics", details: "1 course", classification: "required", courseCount: 1 },
        { name: "Phonology/Phonetics", details: "3 credits", classification: "required", semesterCredits: 3 },
        { name: "Anatomy and Physiology of Speech", details: "3 credits", classification: "required", semesterCredits: 3 },
        { name: "Hearing Science/Speech Science/Acoustics", details: "3-4 credits", classification: "required", semesterCredits: 3 },
        { name: "Neurological Bases of Speech, Language, and Hearing", details: "3 credits", classification: "required", semesterCredits: 3 },
        { name: "Language Acquisition", details: "3 credits", classification: "required", semesterCredits: 3 },
        { name: "Hearing Loss and Audiometry", details: "3 credits", classification: "required", semesterCredits: 3 },
        { name: "Aural Rehabilitation", details: "3 credits", classification: "required", semesterCredits: 3 },
        { name: "Developmental Speech and Language Disorders", details: "3-5 credits", classification: "required", semesterCredits: 3, otherConditions: "Required for graduation; can be completed during the MS program. 25 hours of clinical observation documented by an ASHA-certified practitioner also required" },
      ],
    },

    // ── Podiatric Medicine (DPM) — 2 verified schools ────────────────────────
    {
      professionSlug: "podiatry",
      name: "Temple University School of Podiatric Medicine",
      programName: "Doctor of Podiatric Medicine (DPM)",
      city: "Philadelphia",
      state: "PA",
      degreeType: null,
      sourceUrl: "https://podiatry.temple.edu/admissions/admission-requirements",
      lastVerified: "2026-07-23",
      verificationStatus: "verified",
      prereqCourses: [
        { name: "Biology or Zoology", details: "8 semester hours; including laboratory", classification: "required", labRequired: true, semesterCredits: 8 },
        { name: "General/Inorganic Chemistry", details: "8 semester hours; including laboratory", classification: "required", labRequired: true, semesterCredits: 8 },
        { name: "Organic Chemistry", details: "8 semester hours; including laboratory", classification: "required", labRequired: true, semesterCredits: 8 },
        { name: "Physics", details: "8 semester hours; including laboratory", classification: "required", labRequired: true, semesterCredits: 8 },
        { name: "English", details: "6 semester hours", classification: "required", semesterCredits: 6, otherConditions: "Minimum 90 total semester hours of undergraduate education; prerequisites completed before matriculation" },
      ],
    },
    {
      professionSlug: "podiatry",
      name: "Kent State University College of Podiatric Medicine",
      programName: "Doctor of Podiatric Medicine (DPM)",
      city: "Independence",
      state: "OH",
      degreeType: null,
      sourceUrl: "https://www.kent.edu/cpm/admission-requirements",
      lastVerified: "2026-07-23",
      verificationStatus: "verified",
      prereqCourses: [
        { name: "Biology", details: "8 semester or 12 quarter hours; with lab", classification: "required", labRequired: true, semesterCredits: 8, quarterCredits: 12 },
        { name: "General Chemistry", details: "8 semester or 12 quarter hours; with lab", classification: "required", labRequired: true, semesterCredits: 8, quarterCredits: 12 },
        { name: "Organic Chemistry", details: "8 semester or 12 quarter hours; with lab; Biochemistry may substitute", classification: "required", labRequired: true, semesterCredits: 8, quarterCredits: 12 },
        { name: "Physics", details: "8 semester or 12 quarter hours; with lab", classification: "required", labRequired: true, semesterCredits: 8, quarterCredits: 12 },
        { name: "English", details: "6 semester or 9 quarter hours; English, communications, or writing-intensive courses accepted", classification: "required", semesterCredits: 6, quarterCredits: 9 },
      ],
    },

    // ── Genetic Counseling (MS) — 3 verified schools ─────────────────────────
    // Dropped: Johns Hopkins (program no longer accepting applications)
    {
      professionSlug: "genetic-counseling",
      name: "Northwestern University Feinberg School of Medicine",
      programName: "Genetic Counseling Graduate Program (MS)",
      city: "Chicago",
      state: "IL",
      degreeType: null,
      sourceUrl: "https://www.feinberg.northwestern.edu/sites/genetic-counseling/admissions/prerequisites.html",
      lastVerified: "2026-07-23",
      verificationStatus: "verified",
      prereqCourses: [
        { name: "General or Human Genetics", details: "1 semester/quarter", classification: "required", courseCount: 1 },
        { name: "Biochemistry", details: "1 semester/quarter", classification: "required", courseCount: 1 },
        { name: "Molecular Biology or Cell Biology", details: "1 semester/quarter", classification: "required", courseCount: 1 },
        { name: "Psychology", details: "1 semester/quarter", classification: "required", courseCount: 1 },
        { name: "Statistics", details: "1 semester/quarter; introductory statistics or biostatistics including methodology", classification: "required", courseCount: 1, otherConditions: "No labs required; prerequisites must be completed before the start of the program" },
      ],
    },
    {
      professionSlug: "genetic-counseling",
      name: "Boston University Chobanian & Avedisian School of Medicine",
      programName: "MS in Genetic Counseling",
      city: "Boston",
      state: "MA",
      degreeType: null,
      sourceUrl: "https://www.bumc.bu.edu/gms/genetic-counseling/admissions/",
      lastVerified: "2026-07-23",
      verificationStatus: "verified",
      prereqCourses: [
        { name: "Genetics", details: "one quarter or semester", classification: "required", courseCount: 1 },
        { name: "Psychology", details: "one quarter or semester; any psychology course accepted", classification: "required", courseCount: 1 },
        { name: "Biology", details: "one year; lab not required", classification: "required" },
        { name: "Chemistry", details: "one year; lab not required", classification: "required" },
        { name: "Biochemistry or Molecular Biology", details: "one quarter or semester", classification: "required", courseCount: 1 },
        { name: "Statistics", details: "one quarter or semester", classification: "required", courseCount: 1, otherConditions: "One AP course accepted toward prerequisites; up to two outstanding prerequisites allowed at application deadline" },
      ],
    },
    {
      professionSlug: "genetic-counseling",
      name: "Baylor College of Medicine",
      programName: "Genetic Counseling Program (MS)",
      city: "Houston",
      state: "TX",
      degreeType: null,
      sourceUrl: "https://www.bcm.edu/education/school-of-health-professions/genetic-counseling-program/admissions",
      lastVerified: "2026-07-23",
      verificationStatus: "verified",
      prereqCourses: [
        { name: "Biochemistry", details: null, classification: "required" },
        { name: "Upper-level Human Genetics", details: "at least one course; 300 or 400 level if available at your institution", classification: "required", courseCount: 1 },
        { name: "General Statistics", details: null, classification: "required", otherConditions: "Bachelor's degree required; minimum GPA 3.0 (without rounding)" },
      ],
    },

    // ── Prosthetics & Orthotics (MSPO/MPO) — 3 verified schools ──────────────
    {
      professionSlug: "prosthetics-orthotics",
      name: "Northwestern University Prosthetics-Orthotics Center (NUPOC)",
      programName: "Master of Prosthetics and Orthotics (MPO)",
      city: "Chicago",
      state: "IL",
      degreeType: null,
      sourceUrl: "https://www.nupoc.northwestern.edu/education/how-to-apply.html",
      lastVerified: "2026-07-23",
      verificationStatus: "verified",
      prereqCourses: [
        { name: "Biology/Life Sciences", details: "1 course; introductory level or higher", classification: "required", courseCount: 1 },
        { name: "Chemistry", details: "1 course; introductory level or higher", classification: "required", courseCount: 1 },
        { name: "Physics", details: "1 course; introductory level or higher", classification: "required", courseCount: 1 },
        { name: "Statistics", details: "1 course", classification: "required", courseCount: 1 },
        { name: "Human Anatomy and Physiology", details: "1 combined A&P course", classification: "required", courseCount: 1, otherConditions: "Grade C- or higher; lab components not required" },
      ],
    },
    {
      professionSlug: "prosthetics-orthotics",
      name: "University of Pittsburgh School of Health and Rehabilitation Sciences",
      programName: "Prosthetics and Orthotics (MS)",
      city: "Pittsburgh",
      state: "PA",
      degreeType: null,
      sourceUrl: "https://www.shrs.pitt.edu/academics/rst/po/admissions/",
      lastVerified: "2026-07-23",
      verificationStatus: "verified",
      prereqCourses: [
        { name: "Physics", details: "4 credits; with lab", classification: "required", labRequired: true, semesterCredits: 4 },
        { name: "Biology", details: "4 credits; with lab", classification: "required", labRequired: true, semesterCredits: 4 },
        { name: "Chemistry", details: "4 credits; with lab", classification: "required", labRequired: true, semesterCredits: 4 },
        { name: "Psychology", details: "3 credits; Abnormal or Human Growth & Development", classification: "required", semesterCredits: 3 },
        { name: "Mathematics", details: "3 credits; algebra or higher", classification: "required", semesterCredits: 3 },
        { name: "Human Anatomy", details: "3 credits", classification: "required", semesterCredits: 3 },
        { name: "Human Physiology", details: "3 credits", classification: "required", semesterCredits: 3 },
        { name: "Statistics", details: "3 credits", classification: "required", semesterCredits: 3, otherConditions: "Bachelor's degree required; minimum GPA 3.0 in all college-level and prerequisite coursework" },
      ],
    },
    {
      professionSlug: "prosthetics-orthotics",
      name: "Kennesaw State University Wellstar College",
      programName: "MS in Prosthetics and Orthotics (MSPO)",
      city: "Kennesaw",
      state: "GA",
      degreeType: null,
      sourceUrl: "https://campus.kennesaw.edu/colleges-departments/wellstar/degrees-programs/graduate/master-prosthetics-orthotics/index.php",
      lastVerified: "2026-07-23",
      verificationStatus: "verified",
      prereqCourses: [
        { name: "Biology", details: "4 semester credit hours; lecture and laboratory", classification: "required", labRequired: true, semesterCredits: 4 },
        { name: "Chemistry", details: "4 semester credit hours; lecture and laboratory", classification: "required", labRequired: true, semesterCredits: 4 },
        { name: "Physics", details: "4 semester credit hours; lecture and laboratory", classification: "required", labRequired: true, semesterCredits: 4 },
        { name: "Psychology", details: "3 semester credit hours; introductory or general course", classification: "required", semesterCredits: 3 },
        { name: "Statistics", details: "3 semester credit hours; one lecture course", classification: "required", semesterCredits: 3 },
        { name: "Human Anatomy and Physiology", details: "6 semester credit hours; two lecture courses", classification: "required", semesterCredits: 6 },
      ],
    },

    // ── Dietetics (RD/RDN) — 2 verified programs ─────────────────────────────
    {
      professionSlug: "dietetics",
      name: "Teachers College, Columbia University",
      programName: "MS in Nutrition + RDN Preparation",
      city: "New York",
      state: "NY",
      degreeType: null,
      sourceUrl: "https://www.tc.columbia.edu/health-studies-applied-educational-psychology/nutrition/prerequisite-courses/",
      lastVerified: "2026-07-23",
      verificationStatus: "verified",
      prereqCourses: [
        { name: "General Chemistry", details: "comprehensive one-semester course or General Chemistry 1; with lab", classification: "required", labRequired: true },
        { name: "Organic Chemistry", details: "comprehensive one-semester course or Organic Chemistry 1; with lab", classification: "required", labRequired: true },
        { name: "Biochemistry", details: "comprehensive one-semester course; within past 5 years with grade B or better", classification: "required" },
        { name: "Human Physiology", details: "comprehensive one-semester course or A&P 1 and 2 with labs; within past 5 years with grade B or better", classification: "required", labRequired: true },
        { name: "Microbiology", details: null, classification: "required" },
        { name: "Introductory Nutrition", details: "within past 5 years with grade B or better", classification: "required" },
        { name: "Statistics", details: null, classification: "required", otherConditions: "At least four courses completed with B or better before the application deadline; all remaining before program start" },
      ],
    },
    {
      professionSlug: "dietetics",
      name: "University of Massachusetts Amherst",
      programName: "MS in Nutrition / Dietetic Internship (MSDI)",
      city: "Amherst",
      state: "MA",
      degreeType: null,
      sourceUrl: "https://www.umass.edu/public-health-sciences/academics/dietetic-internship/admission-requirements-and-application-process",
      lastVerified: "2026-07-23",
      verificationStatus: "verified",
      prereqCourses: [
        { name: "Medical Nutrition Therapy", details: "two semesters; grade B or better; taken within the last two years", classification: "required" },
        { name: "Anatomy & Physiology", details: "two semesters; grade B or better", classification: "required", otherConditions: "Must also have completed an ACEND-accredited Didactic Program in Dietetics (DPD) with a signed DPD verification statement" },
      ],
    },

    // ── Postbaccalaureate Programs — 1 verified program ──────────────────────
    // Dropped: Bryn Mawr, Scripps, Columbia (career-changer programs by design
    // have NO required prerequisite courses for admission — nothing to list)
    {
      professionSlug: "postbac",
      name: "Johns Hopkins University",
      programName: "Post-Baccalaureate Premedical Program",
      city: "Baltimore",
      state: "MD",
      degreeType: null,
      sourceUrl: "https://krieger.jhu.edu/postbac/eligibility-and-admissions/",
      lastVerified: "2026-07-23",
      verificationStatus: "verified",
      prereqCourses: [
        { name: "General Chemistry I and II", details: "1 year; with lab (eligibility course — applicants must NOT have completed more than half of these)", classification: "required", labRequired: true },
        { name: "Organic Chemistry I and II", details: "1 year; with lab (eligibility course)", classification: "required", labRequired: true },
        { name: "General Biology I and II", details: "1 year; with lab (eligibility course)", classification: "required", labRequired: true },
        { name: "General Physics I and II", details: "1 year; with lab (eligibility course)", classification: "required", labRequired: true, otherConditions: "Eligibility is determined by whether an applicant has completed more than half of these courses — the program is designed for those who have NOT" },
      ],
    },
  ];

  // Idempotent upsert of seed prerequisite data. NEVER truncates: the
  // program_schools table also holds the nationwide program directory, which
  // is populated by import scripts and must survive every seed/deploy run.
  // Identity key: professionSlug + name + programName.
  console.log("Upserting seed program-school prerequisite data (no deletes)...");
  const existingRows = await db
    .select({
      id: programSchoolsTable.id,
      professionSlug: programSchoolsTable.professionSlug,
      name: programSchoolsTable.name,
      programName: programSchoolsTable.programName,
    })
    .from(programSchoolsTable);
  const byKey = new Map(
    existingRows.map((r) => [
      `${r.professionSlug}||${r.name}||${r.programName}`,
      r.id,
    ]),
  );
  let insertedCount = 0;
  let updatedCount = 0;
  for (const ps of programSchools) {
    const key = `${ps.professionSlug}||${ps.name}||${ps.programName}`;
    const existingId = byKey.get(key);
    if (existingId != null) {
      // Update prereq/verification fields only; never touch directory fields
      // (directoryStatus, directorySource, aliases, externalId, websiteUrl).
      await db
        .update(programSchoolsTable)
        .set({
          city: ps.city,
          state: ps.state,
          degreeType: ps.degreeType,
          sourceUrl: ps.sourceUrl,
          lastVerified: ps.lastVerified,
          verificationStatus: ps.verificationStatus,
          prereqCourses: ps.prereqCourses,
        })
        .where(eq(programSchoolsTable.id, existingId));
      updatedCount++;
    } else {
      await db.insert(programSchoolsTable).values(ps);
      insertedCount++;
    }
  }
  console.log(
    `  → Upserted program schools: ${insertedCount} inserted, ${updatedCount} updated (0 deleted).`,
  );

  console.log("Seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
