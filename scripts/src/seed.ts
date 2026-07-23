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
      {
        label: "The Premed Competencies for Entering Medical Students",
        kind: "prerequisites",
        note: "Core competencies expected of applicants",
        url: "https://students-residents.aamc.org/real-stories-demonstrating-premed-competencies/premed-competencies-entering-medical-students",
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
      {
        label: "Apply to ADEA AADSAS - Participating Schools & Courses",
        kind: "prerequisites",
        note: "Participating dental schools and course requirements",
        url: "https://www.adea.org/godental/Apply/apply-to-adea-aadsas",
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
    name: "Nursing (BSN/MSN/DNP)",
    category: "Nursing",
    tagline: "Deliver hands-on patient care and advance the profession.",
    description:
      "Nursing spans entry-level BSN degrees through advanced MSN and DNP programs. The AACN member directory lists accredited programs nationwide.",
    degree: "BSN, MSN, or DNP",
    typicalTimeline: "2-4 years depending on entry point",
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
      {
        label: "Prepharmacy Requirements (PharmCAS)",
        kind: "prerequisites",
        note: "Compare course prerequisites by program",
        url: "https://www.pharmcas.org/school-directory/explore-and-compare/pre-pharmacy-requirements",
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
      {
        label: "PTCAS Program Directory - Course Prerequisites",
        kind: "prerequisites",
        note: "Compare course prerequisites by program",
        url: "https://ptcasdirectory.apta.org/",
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
      {
        label: "Optometry General and School-Specific Prerequisites (2025)",
        kind: "prerequisites",
        note: "ASCO prerequisite requirements chart",
        url: "https://optometriceducation.org/wp-content/uploads/2025/04/ASCO-Prerequisites-2025.pdf",
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
      {
        label: "VMCAS Summary of Course Prerequisites",
        kind: "prerequisites",
        note: "Prerequisite comparison chart",
        url: "https://admin.applytovetschool.org/wp-content/uploads/2025/05/Prereq-chart-for-VMCAS-2026.pdf",
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
      {
        label: "Admissions - AACPM",
        kind: "prerequisites",
        note: "Admission and prerequisite information",
        url: "https://aacpm.org/becoming-a-podiatric-physician/admissions/",
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
      {
        label: "SLP Certification Standards (ASHA)",
        kind: "prerequisites",
        note: "Prerequisite course content areas for certification",
        url: "https://www.asha.org/certification/2027-slp-certification-standards/",
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
  // Seeded using officially published admissions/prerequisites pages.
  // Prerequisites are required courses only (no "recommended" courses).
  // lastVerified: date we confirmed from each school's official source.
  // ─────────────────────────────────────────────────────────────────────────
  // Program Schools — verified 2026-07-23 via webFetch of each official page.
  //
  // DROPPED from original seed (no specific required-course list on official page):
  //   Medicine:  Mayo Clinic Alix SOM (only citizenship/vaccine page found),
  //              UC San Diego (competency-based, no course list page found),
  //              U Colorado (explicitly competency-based on their site),
  //              U Michigan (holistic review, no specific list on admissions page),
  //              Vanderbilt MD (moved to "recommendations", not requirements)
  //   DPT:       Northwestern Feinberg (prereq list behind JS accordion, not readable)
  //   Nursing:   UCSF MEPN (PROGRAM PAUSED as of Nov 2025 per graduate.ucsf.edu),
  //              Duke ABSN (admission prereq page not publicly listed; handbook found
  //                         but it covers curriculum, not admission requirements),
  //              Johns Hopkins (no traditional ABSN; prerequisite pages are
  //                            their online-course sales portal, not admission reqs)
  // ─────────────────────────────────────────────────────────────────────────
  const programSchools: InsertProgramSchool[] = [
    // ── Medicine (MD) — 5 verified schools ──────────────────────────────────
    {
      professionSlug: "medicine",
      name: "Emory University School of Medicine",
      state: "GA",
      degreeType: null,
      sourceUrl:
        "https://med.emory.edu/education/programs/md/admissions/step1/index.html",
      lastVerified: "2026-07-23",
      prereqCourses: [
        "Biology with lab (8 semester hours)",
        "Chemistry with lab (8 semester hours)",
        "Organic Chemistry with lab (8 semester hours)",
        "Physical Science with lab (8 semester hours)",
        "English (6 semester hours)",
        "Humanities/Social Sciences (18 semester hours)",
      ],
    },
    {
      professionSlug: "medicine",
      name: "Georgetown University School of Medicine",
      state: "DC",
      degreeType: null,
      sourceUrl:
        "https://meded.georgetown.edu/admissions/degrees-and-admissions/md/guide/",
      lastVerified: "2026-07-23",
      prereqCourses: [
        "General Biology with lab (1 year, 8 semester hours)",
        "General Chemistry with lab (1 year, 8 semester hours)",
        "Organic Chemistry with lab (1 year, 8 semester hours)",
        "Physics with lab (1 year, 8 semester hours)",
        "Mathematics or Statistics (1 semester)",
      ],
    },
    {
      professionSlug: "medicine",
      name: "Indiana University School of Medicine",
      state: "IN",
      degreeType: null,
      sourceUrl:
        "https://medicine.iu.edu/md/admissions/application-requirements",
      lastVerified: "2026-07-23",
      prereqCourses: [
        "Biology with lab (1 year)",
        "General Chemistry with lab (1 year)",
        "Organic Chemistry with lab (1 year)",
        "Physics with lab (1 year)",
        "Biochemistry (1 semester)",
        "Social Science (1 course)",
        "Behavioral Science (1 course)",
      ],
    },
    {
      professionSlug: "medicine",
      name: "University of Pittsburgh School of Medicine",
      state: "PA",
      degreeType: null,
      sourceUrl:
        "https://www.medadmissions.pitt.edu/admissions/you-apply/academic-requirements",
      lastVerified: "2026-07-23",
      prereqCourses: [
        "Biology with lab (1 year)",
        "General/Inorganic Chemistry with lab (1 year)",
        "Organic Chemistry with lab (1 semester)",
        "Biochemistry (1 semester)",
        "Physics with lab (1 year)",
        "English/Intensive Writing (1 year)",
        "Statistics or Biostatistics (1 semester)",
      ],
    },
    {
      professionSlug: "medicine",
      name: "University of Washington School of Medicine",
      state: "WA",
      degreeType: null,
      sourceUrl:
        "https://www.uwmedicine.org/school-of-medicine/md-program/admissions/course-requirements",
      lastVerified: "2026-07-23",
      prereqCourses: [
        "Biology (1 year, lab recommended) — includes molecular genetics and cell biology",
        "Chemistry/Biochemistry (2 years, lab recommended) — General Chemistry + Organic Chemistry + Biochemistry",
        "Physics (1 year)",
        "Social Sciences/Humanities (demonstrated competency)",
      ],
    },

    // ── Physical Therapy (DPT) — 7 verified schools ─────────────────────────
    {
      professionSlug: "physical-therapy",
      name: "Arcadia University",
      state: "PA",
      degreeType: null,
      sourceUrl:
        "https://www.arcadia.edu/majors-and-programs/physical-therapy-dpt/admission/",
      lastVerified: "2026-07-23",
      prereqCourses: [
        "Human Anatomy with lab (or Anatomy & Physiology I+II sequence)",
        "Human Physiology with lab (or Anatomy & Physiology I+II sequence)",
        "Upper-level Biology elective ≥300-level (e.g. Neuroscience, Cell Biology, Pharmacology)",
        "Chemistry I+II with lab",
        "Physics I+II with lab",
        "Psychology",
        "Anthropology, Sociology, or additional Psychology",
        "Statistics",
      ],
    },
    {
      professionSlug: "physical-therapy",
      name: "Emory University Division of Physical Therapy",
      state: "GA",
      degreeType: null,
      sourceUrl:
        "https://med.emory.edu/departments/rehabilitation-medicine/dpt/admission/index.html",
      lastVerified: "2026-07-23",
      prereqCourses: [
        "Human Anatomy with lab (4 semester hours — must include musculoskeletal, cardiovascular, and peripheral nervous systems)",
        "Human Physiology with lab (4 semester hours)",
        "Physics I+II with lab (8 semester hours)",
        "Statistics (3 semester hours)",
      ],
    },
    {
      professionSlug: "physical-therapy",
      name: "Marquette University",
      state: "WI",
      degreeType: null,
      sourceUrl:
        "https://www.marquette.edu/physical-therapy/prerequisites.php",
      lastVerified: "2026-07-23",
      prereqCourses: [
        "Biology (3 credits)",
        "Chemistry I+II each with lab (8 credits)",
        "Physics I+II each with lab (8 credits)",
        "Anatomy and Physiology I+II (6 credits)",
        "Statistics (3 credits)",
        "Psychology (3 credits)",
        "Introduction to Physical Therapy and Medical Terminology (1 credit)",
      ],
    },
    {
      professionSlug: "physical-therapy",
      name: "University of Delaware",
      state: "DE",
      degreeType: null,
      sourceUrl:
        "https://www.udel.edu/academics/colleges/chs/departments/pt/dpt/entrance-requirements/",
      lastVerified: "2026-07-23",
      prereqCourses: [
        "Introductory Biology I+II with lab (8 credits)",
        "Introductory Chemistry I+II with lab (8 credits)",
        "Introductory Physics I+II with lab (8 credits)",
        "Human or Mammalian Anatomy with lab (4 credits)",
        "Human or Mammalian Physiology with lab (4 credits)",
        "Psychology (3 credits)",
        "Statistics (3 credits)",
      ],
    },
    {
      professionSlug: "physical-therapy",
      name: "University of Pittsburgh Department of Physical Therapy",
      state: "PA",
      degreeType: null,
      sourceUrl:
        "https://www.shrs.pitt.edu/academics/pt/dpt/admissions/",
      lastVerified: "2026-07-23",
      prereqCourses: [
        "Biology I+II with lab (8 credits, for science/pre-med majors)",
        "Chemistry I+II with lab (8 credits, for science/pre-med majors)",
        "Physics I+II with lab (8 credits, for science/pre-med majors)",
        "Human Anatomy (3 credits)",
        "Human Physiology (3 credits)",
        "Introduction to Psychology (3 credits)",
        "Second Psychology course (3 credits)",
        "Statistics (3 credits)",
        "English Writing (3 credits)",
      ],
    },
    {
      professionSlug: "physical-therapy",
      name: "University of Southern California — Division of Biokinesiology & PT",
      state: "CA",
      degreeType: null,
      sourceUrl:
        "https://pt.usc.edu/programs/doctor-of-physical-therapy-dpt/",
      lastVerified: "2026-07-23",
      prereqCourses: [
        "Biological Sciences I+II with lab (8 semester hours — for science/pre-health majors)",
        "Chemistry I+II with lab (8 semester hours — for science/pre-health majors)",
        "Physics I+II with lab (8 semester hours — for science/pre-health majors)",
        "Human Anatomy with lab (4 semester hours)",
        "Human Physiology with lab (4 semester hours)",
        "Psychology (2 courses, 6 semester hours)",
        "Statistics (3 semester hours)",
      ],
    },
    {
      professionSlug: "physical-therapy",
      name: "Washington University in St. Louis Program in Physical Therapy",
      state: "MO",
      degreeType: null,
      sourceUrl:
        "https://pt.wustl.edu/education/doctor-of-physical-therapy/eligibility-prerequisites/",
      lastVerified: "2026-07-23",
      prereqCourses: [
        "Biology (6 credits — cell structure/function and macromolecules)",
        "Chemistry I+II with lab (8 credits)",
        "Physics I+II with lab (8 credits)",
        "Human Anatomy with lab (combined 8 credits with Physiology)",
        "Human Physiology with lab (combined 8 credits with Anatomy)",
        "Psychology (3 credits)",
        "Statistics (3 credits)",
      ],
    },

    // ── Nursing — ABSN & MN Entry — 2 verified schools ─────────────────────
    {
      professionSlug: "nursing",
      name: "Samuel Merritt University",
      state: "CA",
      degreeType: "ABSN",
      sourceUrl:
        "https://www.samuelmerritt.edu/sites/default/files/2023-08/college_of_nursing_prereq_checklist_absn_2023.pdf",
      lastVerified: "2026-07-23",
      prereqCourses: [
        "English Composition I",
        "English Composition II",
        "Speech/Interpersonal Communication",
        "General Sociology or Cultural Anthropology",
        "Lifespan Developmental Psychology",
        "Statistics",
        "Social Science elective",
        "Nutrition",
        "Human Anatomy with lab",
        "Human Physiology with lab",
        "Microbiology with lab",
        "Chemistry with lab",
        "Pathophysiology",
        "Pharmacology",
      ],
    },
    {
      professionSlug: "nursing",
      name: "Vanderbilt University School of Nursing",
      state: "TN",
      degreeType: "MEPN",
      sourceUrl:
        "https://nursing.vanderbilt.edu/admissions/msn-mn-pmc/",
      lastVerified: "2026-07-23",
      prereqCourses: [
        "Human Anatomy (within 5 years of application)",
        "Human Physiology (within 5 years of application)",
        "Microbiology (within 5 years of application)",
        "Lifespan Development or Developmental Psychology",
        "Nutrition",
        "Statistics",
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
