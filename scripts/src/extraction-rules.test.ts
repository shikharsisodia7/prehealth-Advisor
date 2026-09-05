import { describe, expect, it } from "vitest";
import {
  NO_PREREQ_ASSERTION,
  entityLabelMatchesInstitution,
  institutionTokens,
  sourceProfessionConflicts,
  contentIdentityConflicts,
} from "./extraction-rules.js";

describe("entityLabelMatchesInstitution", () => {
  // Accepting an authoritative official-website claim for these is the only way rows with no
  // stored seed ever get a candidate URL; their domains are acronyms that share no text with
  // the school name, so a domain-spelling check rejects the correct answer.
  it.each([
    ["Cleveland State University", "Cleveland State University"],
    ["Cleveland State University", "Cleveland State University School of Nursing"],
    ["University of North Texas", "University of North Texas Health Science Center"],
    ["University of Texas at San Antonio", "The University of Texas at San Antonio"],
    ["Iowa State University", "Iowa State University"],
    ["Appalachian State University", "Appalachian State University"],
    // Directory data hyphenates the campus where Wikidata writes "at".
    ["University of North Carolina at Greensboro", "University of North Carolina-Greensboro"],
    // Single distinctive word, but the name contains the label as a phrase: these are the
    // donor-named schools whose parent is a one-word institution.
    ["Boston University", "Boston University Aram V. Chobanian & Edward Avedisian School of Medicine"],
    ["Yale University", "Yale University School of Medicine"],
  ])("matches the same institution: %s ~ %s", (label, name) => {
    expect(entityLabelMatchesInstitution(label, name)).toBe(true);
  });

  // A wrong match would attach another school's website, and every prerequisite discovered
  // through it would belong to the wrong institution.
  it.each([
    ["Ohio State University", "Cleveland State University"],
    ["Harvard University", "Yale University"],
    ["University of North Carolina at Chapel Hill", "University of North Carolina-Greensboro"],
    // A single shared word cannot establish identity, so these fall back to the host-name
    // heuristic rather than being trusted outright.
    ["Michigan State University", "University of Michigan"],
    ["Miami University", "University of Miami"],
    // The parent system is not the campus: accepting it attached northcarolina.edu (the UNC
    // system) to the Greensboro nursing program instead of uncg.edu.
    ["University of North Carolina", "University of North Carolina-Greensboro"],
    ["University of California", "University of California, San Diego"],
    ["Pennsylvania State University", "Pennsylvania State University-Harrisburg"],
    // Phrase containment compared raw text, so a name that is a PREFIX of a different school's
    // name matched it: "university of maryland".includes("university of mary") is true, and
    // University of Mary (Bismarck, ND) was resolved to umd.edu.
    ["University of Maryland", "University of Mary"],
    ["University of Mary", "University of Maryland"],
  ])("rejects a different institution: %s vs %s", (label, name) => {
    expect(entityLabelMatchesInstitution(label, name)).toBe(false);
  });
});

describe("NO_PREREQ_ASSERTION", () => {
  // Genuine official statements that a program publishes no required coursework.
  // Phrasings without the literal token "prerequis-" are the regression: they used to be
  // rejected, so programs whose official page answered the question directly still failed
  // as "no usable prereq list".
  it.each([
    "There are no prerequisite courses for this program.",
    "Please note that we no longer require course prerequisites or GRE scores.",
    "There are no specific course requirements for admission.",
    "We do not require specific courses for entry into the program.",
    "No required coursework is specified for applicants.",
    "Prerequisites are not required for this certificate.",
    "The program does not require prerequisite coursework.",
  ])("accepts an explicit no-coursework statement: %s", (quote) => {
    expect(NO_PREREQ_ASSERTION.test(quote)).toBe(true);
  });

  // Statements that describe requirements must never be read as "no prerequisites",
  // otherwise a program with real coursework would be recorded as having none.
  it.each([
    "Applicants must complete Biology I and II with labs.",
    "Prerequisite courses must be completed before matriculation.",
    "A minimum GPA of 3.0 is required for admission.",
    "The following prerequisite courses are required: Anatomy, Physiology.",
    "Students should consult an advisor about required coursework.",
    "All prerequisites must be completed with a grade of C or better.",
  ])("rejects a statement that describes requirements: %s", (quote) => {
    expect(NO_PREREQ_ASSERTION.test(quote)).toBe(false);
  });
});

describe("institutionTokens", () => {
  // A school named for the profession it teaches must not lend that word as its identity.
  // Treating "pharmacy" as distinctive let any host containing it pass the institution guard,
  // which is how UC San Diego's row came to cite Colorado's pharmacy site.
  it("does not treat a profession word as identifying", () => {
    expect(institutionTokens("University of California, San Diego Skaggs School of Pharmacy")).not.toContain("pharmacy");
    expect(institutionTokens("Vanderbilt University School of Nursing")).not.toContain("nursing");
    expect(institutionTokens("The University of Texas at San Antonio Speech-Language Pathology")).not.toContain("speech");
  });

  it("keeps the words that do identify the institution", () => {
    expect(institutionTokens("University of California, San Diego Skaggs School of Pharmacy")).toEqual(
      expect.arrayContaining(["california", "diego", "skaggs"]),
    );
    expect(institutionTokens("Vanderbilt University School of Nursing")).toEqual(expect.arrayContaining(["vanderbilt"]));
  });

  it("drops generic institution words", () => {
    const t = institutionTokens("The State University Medical Center");
    expect(t).toHaveLength(0);
  });
});

describe("sourceProfessionConflicts", () => {
  it("rejects a medicine row sourced from the physical therapy programme's page", () => {
    expect(sourceProfessionConflicts("https://medschool.duke.edu/duke-dpt-prerequisite-overview", "medicine"))
      .toMatch(/physical-therapy/);
  });

  it("rejects a medicine row sourced from the veterinary school's prerequisites", () => {
    expect(sourceProfessionConflicts("https://www.lsu.edu/vetmed/dvm_admissions/prerequisites.php", "medicine"))
      .toMatch(/veterinary/);
  });

  it("rejects a postbac row sourced from the medical school's MD admissions page", () => {
    expect(sourceProfessionConflicts("https://medicine.tulane.edu/admissions/md/admissions-process", "postbac"))
      .toMatch(/MD admissions/);
  });

  // A URL is hierarchical, so the school that houses a programme appears before the programme.
  it("accepts an occupational therapy page hosted by a school of pharmacy", () => {
    expect(sourceProfessionConflicts("https://www.fdu.edu/academics/colleges-schools/pharmacy/otd/admissions/", "occupational-therapy"))
      .toBeNull();
  });

  it("accepts an occupational therapy page under a nursing and health sciences college", () => {
    expect(sourceProfessionConflicts("https://www.murraystate.edu/academics/CollegesDepartments/nursing-and-health-sciences/ot/requirements.aspx", "occupational-therapy"))
      .toBeNull();
  });

  // The marker is preceded by "of-", not by a slash.
  it("accepts a page whose profession marker is mid-segment", () => {
    expect(sourceProfessionConflicts("https://www.salus.edu/colleges/nursing-health-professions/department-of-occupational-therapy/ms-in-occupational-therapy/", "occupational-therapy"))
      .toBeNull();
  });

  it("accepts a postbac page that names the profession it prepares students for", () => {
    expect(sourceProfessionConflicts("https://www.kgi.edu/degrees-and-programs/pre-health/postbaccalaureate-pre-pa-certificate/", "postbac"))
      .toBeNull();
  });

  it("accepts a speech-language pathology page filed under communication disorders", () => {
    expect(sourceProfessionConflicts("https://www.wtamu.edu/academics/college-nursing-health-sciences/department-communication-disorders/programs/", "speech-language-pathology"))
      .toBeNull();
  });

  it("treats dental and dentistry as the same profession", () => {
    expect(sourceProfessionConflicts("https://dentistry.musc.edu/programs/doctor-dental-medicine", "dental")).toBeNull();
  });

  it("says nothing about a URL that names no profession", () => {
    expect(sourceProfessionConflicts("https://www.example.edu/admissions/requirements", "nursing")).toBeNull();
  });

  // --- University of Oklahoma MD (peer-advisor report, 2026-09-04) -----------------------
  describe("University of Oklahoma MD", () => {
    it("rejects the OU Physician Associate program page for a medicine row", () => {
      expect(sourceProfessionConflicts(
        "https://medicine.ouhsc.edu/prospective-students/degree-programs/physician-associate-program-information/prospective-applicants/prerequisite-requirements",
        "medicine",
      )).toMatch(/physician-assistant/);
    });

    it("accepts the OU Doctor of Medicine (MD) page for a medicine row", () => {
      expect(sourceProfessionConflicts(
        "https://medicine.ouhsc.edu/prospective-students/degree-programs/doctor-of-medicine-md",
        "medicine",
      )).toBeNull();
    });

    it("accepts the same Physician Associate page for a physician-assistant row", () => {
      expect(sourceProfessionConflicts(
        "https://medicine.ouhsc.edu/prospective-students/degree-programs/physician-associate-program-information/prospective-applicants/prerequisite-requirements",
        "physician-assistant",
      )).toBeNull();
    });
  });

  // --- OHSU MD (peer-advisor report, 2026-09-04) ------------------------------------------
  describe("OHSU MD", () => {
    it("rejects OHSU's Physician Assistant prerequisite page for a medicine row", () => {
      expect(sourceProfessionConflicts(
        "https://www.ohsu.edu/school-of-medicine/physician-assistant/prerequisite-coursework",
        "medicine",
      )).toMatch(/physician-assistant/);
    });

    it("rejects OHSU's Radiation Therapy prerequisite page for a medicine row", () => {
      expect(sourceProfessionConflicts(
        "https://www.ohsu.edu/school-of-medicine/radiation-therapy/academic-prerequisites",
        "medicine",
      )).toMatch(/radiation-therapy/);
    });

    it("accepts OHSU's MD program admissions page for a medicine row", () => {
      expect(sourceProfessionConflicts(
        "https://www.ohsu.edu/school-of-medicine/md-program/admissions",
        "medicine",
      )).toBeNull();
    });
  });

  // --- UC Riverside MD (peer-advisor report, 2026-09-04) ----------------------------------
  describe("UC Riverside MD", () => {
    it("rejects the UC system-wide Bioengineering transfer-pathway page for a medicine row", () => {
      expect(sourceProfessionConflicts(
        "https://admission.universityofcalifornia.edu/admission-requirements/transfer-requirements/uc-transfer-programs/transfer-pathways/bioengineering.html",
        "medicine",
      )).toMatch(/bioengineering/);
    });

    it("accepts UC Riverside School of Medicine's own program-prerequisites page for a medicine row", () => {
      expect(sourceProfessionConflicts("https://somsa.ucr.edu/program-prerequisites", "medicine")).toBeNull();
    });
  });

  // --- Systemic audit false positives found and fixed while auditing every finalized row --
  describe("postbac linkage/pathway programs that legitimately mention medicine", () => {
    it("accepts Drexel's own Pathway to Medical School page for a postbac row", () => {
      expect(sourceProfessionConflicts(
        "https://drexel.edu/medicine/academics/graduate-programs/drexel-pathway-to-medical-school/how-to-apply/",
        "postbac",
      )).toBeNull();
    });

    it("accepts George Washington's own GCATS linkage MD-program page for a postbac row", () => {
      expect(sourceProfessionConflicts("https://anatomy.smhs.gwu.edu/gcats-linkage-gw-md-program", "postbac")).toBeNull();
    });

    it("accepts Des Moines University's own MSA/MSBS linkage program pages for a postbac row", () => {
      expect(sourceProfessionConflicts("https://catalog.dmu.edu/osteopathic-medicine/anatomy-msa/", "postbac")).toBeNull();
      expect(sourceProfessionConflicts("https://catalog.dmu.edu/osteopathic-medicine/biomedical-sciences-msbs/", "postbac")).toBeNull();
    });

    it("still rejects a postbac row baldly citing the plain MD program admissions page", () => {
      expect(sourceProfessionConflicts("https://icahn.mssm.edu/education/admissions/md-program", "postbac"))
        .toMatch(/medicine/);
    });
  });

  it("accepts a speech-language pathology program filed under a school-of-medicine catalog department", () => {
    // WVU's own SLP master's program catalog page: catalog.wvu.edu/graduate/schoolofmedicine/slpa/
    expect(sourceProfessionConflicts("https://catalog.wvu.edu/graduate/schoolofmedicine/slpa/", "speech-language-pathology"))
      .toBeNull();
  });

  it("does not confuse Speech-Language Pathology Assistant (SLPA) with Pathologists' Assistant", () => {
    expect(sourceProfessionConflicts(
      "https://delval.edu/speech-language-pathology-assistant-slpa-graduate-certificate",
      "speech-language-pathology",
    )).toBeNull();
  });
});

describe("contentIdentityConflicts", () => {
  // A source being on the right university domain does not make it the right programme --
  // these test the fallback for a page whose URL itself is uninformative but whose own
  // title/H1/breadcrumb still names the wrong profession.
  it("rejects a medicine row whose page heading names the Physician Associate program", () => {
    expect(contentIdentityConflicts("Physician Associate Program Prerequisite Requirements", "medicine"))
      .toMatch(/physician-assistant/);
  });

  it("rejects a medicine row whose page heading is Radiation Therapy admissions", () => {
    expect(contentIdentityConflicts("Radiation Therapy Admissions", "medicine")).toMatch(/radiation-therapy/);
  });

  it("rejects a medicine row whose page heading is a Bioengineering transfer pathway", () => {
    expect(contentIdentityConflicts("Bioengineering Transfer Pathway", "medicine")).toMatch(/bioengineering/);
  });

  it("accepts a medicine row whose page heading is M.D. Program Admissions", () => {
    expect(contentIdentityConflicts("M.D. Program Admissions", "medicine")).toBeNull();
  });

  it("accepts a physician-assistant row whose page heading is Physician Associate Program", () => {
    expect(contentIdentityConflicts("Physician Associate Program", "physician-assistant")).toBeNull();
  });

  it("says nothing about heading text that names no profession", () => {
    expect(contentIdentityConflicts("Admissions Requirements", "medicine")).toBeNull();
  });
});
