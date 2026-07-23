import {
  db,
  professionsTable,
  targetSchoolsTable,
  prereqCoursesTable,
  programSchoolsTable,
  type InsertProfession,
  type InsertProgramSchool,
} from "@workspace/db";

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
  ];

  // Always replace program schools with the latest verified data.
  // Safe to truncate because this is reference data (no user-owned foreign keys).
  console.log("Replacing program schools with verified reference data...");
  await db.delete(programSchoolsTable);
  await db.insert(programSchoolsTable).values(programSchools);
  console.log(`  → Inserted ${programSchools.length} program schools.`);

  console.log("Seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
