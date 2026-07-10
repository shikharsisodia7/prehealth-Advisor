import {
  db,
  professionsTable,
  targetSchoolsTable,
  prereqCoursesTable,
  type InsertProfession,
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
        label: "Required Premedical Coursework and Competencies (AAMC)",
        kind: "prerequisites",
        note: "Students & Residents official course requirement guidance",
      },
      {
        label: "MSAR - Premed Course Requirements",
        kind: "directory",
        note: "Medical School Admission Requirements search tool",
      },
      {
        label: "The Premed Competencies for Entering Medical Students",
        kind: "prerequisites",
        note: "Core competencies expected of applicants",
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
        label: "Where to Apply (ADEA)",
        kind: "directory",
        note: "Find participating dental schools",
      },
      {
        label: "ADEA AADSAS Participating Dental Schools - Required & Recommended Courses",
        kind: "prerequisites",
        note: "Course requirements per program",
      },
      {
        label: "2023 Applicants and First-time, First-year Enrollees (ADEA)",
        kind: "directory",
        note: "Applicant and enrollment data",
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
        note: "Search all PA programs",
      },
      {
        label: "Course requirement list for every program",
        kind: "prerequisites",
        note: "Prerequisites by program",
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
        label: "AACN Member Program Directory",
        kind: "directory",
        note: "Accredited nursing programs",
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
        label: "School Directory (PharmCAS)",
        kind: "directory",
        note: "Find pharmacy schools",
      },
      {
        label: "2022-2023 Summary of Course Prerequisites",
        kind: "prerequisites",
        note: "Prerequisite comparison table",
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
      },
      {
        label: "Comparison of Course Prerequisites by Program",
        kind: "prerequisites",
        note: "Prerequisite comparison table",
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
      },
      {
        label: "Optometry General and School-Specific Prerequisites (May 2025)",
        kind: "prerequisites",
        note: "Prerequisite requirements",
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
        note: "Official admission requirements guide",
      },
      {
        label: "Summary of Course Prerequisites",
        kind: "prerequisites",
        note: "Prerequisite comparison",
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
      },
      {
        label: "Admissions - AACPM",
        kind: "prerequisites",
        note: "Admission and prerequisite information",
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
        label: "Orthotist / Prosthetist Programs",
        kind: "directory",
        note: "Accredited O&P programs",
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
      },
      {
        label: "ACGC Program Directory Terminology",
        kind: "prerequisites",
        note: "Directory terms and requirements",
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
      },
      {
        label: "Prerequisite Course Content Areas Related to SLP Certification Standards",
        kind: "prerequisites",
        note: "Certification prerequisite areas",
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
        note: "Search postbaccalaureate programs",
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

  console.log("Seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
