"""
update-blocked-programs-json.py
Replaces the 14 "Prerequisite verification pending" placeholder entries in
caa-pa-all-programs.json with verified prerequisite data sourced from official
program admission pages and PDFs (August 2026).

Run from workspace root:
  python3 scripts/src/update-blocked-programs-json.py
"""

import json, sys, pathlib

ROOT = pathlib.Path(__file__).parent.parent.parent
JSON_PATH = ROOT / "data/prereqs/caa-pa-all-programs.json"

TARGET_IDS = {
    "caahep-3478","caahep-3125","caahep-110","caahep-11046","caahep-2882",
    "caahep-11021","caahep-9837","caahep-117","caahep-11329","caahep-11094",
    "naacls-2826","naacls-2821","naacls-7603","naacls-2786",
}

SOURCE_DATE = "2026-08-07"

def row(external_id, profession, school_name, program_name, city, state,
        req_name, req_details="", lab="", sem_credits="",
        classification="required",
        source_url=""):
    return {
        "profession": profession,
        "school_name": school_name,
        "program_name": program_name,
        "city": city,
        "state": state,
        "requirement_name": req_name,
        "requirement_details": req_details,
        "classification": classification,
        "lab_required": lab,
        "semester_credits": str(sem_credits) if sem_credits != "" else "",
        "official_source_url": source_url,
        "last_verified": SOURCE_DATE,
        "external_id": external_id,
    }

# ── Helper shortcuts ──────────────────────────────────────────────────────────

CU_SRC   = "https://medschool.cuanschutz.edu/anesthesiology/education/anesthesiologist-assistant-program/aa-admissions/admission-requirements"
CWRU_SRC = "https://case.edu/medicine/msa-program/admissions/admissions-requirements"
SOUTH_SRC= "https://catalog.southuniversity.edu/anesthesia-science/master-of-medical-science-mmsc/anesthesia-science"
KCU_SRC  = "https://www.kansascity.edu/programs/anesthesiologist-assistant/admissions-requirements"
UNM_SRC  = "https://hsc.unm.edu/medicine/departments/anesthesiology/education/msa-program/msa-media/msa-advising-worksheet-v2-3.pdf"
CAL_SRC  = "https://grad.ucalgary.ca/future-students/graduate/discover-opportunities/explore-programs/pathologists-assistant-mdpa"
ODU_SRC  = "https://catalog.odu.edu/graduate/health-professions/pathologists-assistant/pathologists-assistant-mhspa/"
CAR_SRC  = "https://www.carrollu.edu/academics/health-sciences/graduate/pathologists-assistant/admission-process/index.html"
WVU_SRC  = "https://catalog.wvu.edu/graduate/schoolofmedicine/pathologistsassistant/"

AA  = "anesthesiologist-assistant"
PA  = "pathologists-assistant"

NEW_ROWS = []

# ── CU Anschutz (caahep-3478) ─────────────────────────────────────────────────
_cu = dict(external_id="caahep-3478", profession=AA,
           school_name="University of Colorado Denver Anschutz Medical Campus",
           program_name="Master of Science in Anesthesiology",
           city="Aurora", state="CO", source_url=CU_SRC)
NEW_ROWS += [
    row(**_cu, req_name="English",
        req_details="1 semester required. 7-year window does NOT apply.", lab="false", sem_credits=1),
    row(**_cu, req_name="Biology I & II with Labs",
        req_details="2 semesters; introductory biology sequence with lab for science majors.", lab="true", sem_credits=2),
    row(**_cu, req_name="General Chemistry I & II with Labs",
        req_details="2 semesters; general chemistry for science majors with lab.", lab="true", sem_credits=2),
    row(**_cu, req_name="Organic Chemistry I & II with Labs",
        req_details="2 semesters with lab.", lab="true", sem_credits=2),
    row(**_cu, req_name="General Physics I & II with Labs",
        req_details="2 semesters with lab. Trigonometry- or calculus-based preferred.", lab="true", sem_credits=2),
    row(**_cu, req_name="Biochemistry",
        req_details="1 semester.", lab="false", sem_credits=1),
    row(**_cu, req_name="Statistics",
        req_details="1 semester.", lab="false", sem_credits=1),
    row(**_cu, req_name="Human Anatomy & Physiology",
        req_details="1 semester combined OR 1 semester of each; at least 1 semester total required.", lab="false", sem_credits=1),
    row(**_cu, req_name="Calculus",
        req_details="1 semester preferred but not required.", lab="false", sem_credits=1, classification="preferred"),
]

# ── CWRU campuses — shared requirements ──────────────────────────────────────
_cwru_courses = [
    ("Biochemistry",
     "1 semester; advanced course preferred. Avoid blended biochemistry/organic chemistry courses. Bioengineering courses will not fulfill this requirement.",
     "false", 1, "required"),
    ("Biology with Lab",
     "1 year (2 semesters); year-long introductory biology sequence with lab for science majors. Courses in micro/molecular biology, cellular biology, genetics, or histology will not fulfill this requirement.",
     "true", 2, "required"),
    ("Human Anatomy with Lab",
     "1 semester; advanced course preferred. Comparative vertebrate anatomy, embryology, neuroanatomy, or developmental anatomy will not fulfill this requirement.",
     "true", 1, "required"),
    ("Human Physiology",
     "1 semester; advanced course preferred. Mammalian physiology or embryology will not fulfill this requirement.",
     "false", 1, "required"),
    ("General Chemistry with Lab",
     "1 year (2 semesters); year-long introductory chemistry sequence with lab for science majors.",
     "true", 2, "required"),
    ("Organic Chemistry with Lab",
     "1 semester required; second semester with lab preferred but not required.",
     "true", 1, "required"),
    ("Physics with Lab",
     "1 year (2 semesters); year-long introductory physics sequence with lab. Either algebra- or calculus-based.",
     "true", 2, "required"),
    ("Calculus",
     "1 semester. Precalculus and calculus survey courses will not fulfill this requirement.",
     "false", 1, "required"),
]
_cwru_campuses = [
    ("caahep-3125", "Case Western Reserve University-Washington DC",  "Master of Science in Anesthesia", "Washington", "DC"),
    ("caahep-110",  "Case Western Reserve University",                 "Master of Science in Anesthesia", "Cleveland",  "OH"),
    ("caahep-11046","Case Western Reserve University-Austin, TX",      "Master of Science in Anesthesia", "Austin",     "TX"),
    ("caahep-2882", "Case Western Reserve University-Houston, TX",     "Master of Science in Anesthesia", "Houston",    "TX"),
]
for ext_id, sname, pname, city, state in _cwru_campuses:
    for (rname, rdetails, lab, sem, cls) in _cwru_courses:
        NEW_ROWS.append(row(
            external_id=ext_id, profession=AA,
            school_name=sname, program_name=pname,
            city=city, state=state,
            req_name=rname, req_details=rdetails,
            lab=lab, sem_credits=sem, classification=cls,
            source_url=CWRU_SRC,
        ))

# ── South University campuses — shared requirements ───────────────────────────
_south_courses = [
    ("English or English Literature",
     "1 semester required. Substitutions not permitted; survey courses for non-science majors not acceptable.",
     "false", 1, "required"),
    ("General Biology",
     "2 semesters. Upper-level Biology courses will also fulfill this requirement. Labs preferred but not required. Substitutions not permitted; survey courses not acceptable.",
     "false", 2, "required"),
    ("General Chemistry with Labs",
     "2 semesters; labs required. Substitutions not permitted; survey courses not acceptable.",
     "true", 2, "required"),
    ("Organic Chemistry with Lab",
     "1 semester; lab required. Substitutions not permitted; survey courses not acceptable.",
     "true", 1, "required"),
    ("Biochemistry (upper level)",
     "1 semester; labs preferred but not required.",
     "false", 1, "required"),
    ("General Physics",
     "2 semesters; labs preferred but not required.",
     "false", 2, "required"),
    ("Calculus",
     "1 semester required.",
     "false", 1, "required"),
    ("Statistics or Biostatistics",
     "1 semester required.",
     "false", 1, "required"),
    ("Cell & Molecular Biology / Anatomy / Physiology",
     "Preferred but not required. Full year of Organic Chemistry and trigonometry- or calculus-based Physics are also preferred.",
     "false", "", "preferred"),
]
_south_campuses = [
    ("caahep-11021", "South University-Orlando Additional Teaching Site",
     "Master of Medical Science in Anesthesia Science", "Orlando",         "FL"),
    ("caahep-9837",  "South University-West Palm Beach",
     "Master of Medical Science in Anesthesia Science", "West Palm Beach", "FL"),
    ("caahep-117",   "South University-Savannah",
     "Master of Medical Science in Anesthesia Science", "Savannah",        "GA"),
]
for ext_id, sname, pname, city, state in _south_campuses:
    for (rname, rdetails, lab, sem, cls) in _south_courses:
        NEW_ROWS.append(row(
            external_id=ext_id, profession=AA,
            school_name=sname, program_name=pname,
            city=city, state=state,
            req_name=rname, req_details=rdetails,
            lab=lab, sem_credits=sem, classification=cls,
            source_url=SOUTH_SRC,
        ))

# ── Kansas City University (caahep-11329) ─────────────────────────────────────
_kcu = dict(external_id="caahep-11329", profession=AA,
            school_name="Kansas City University-Joplin",
            program_name="Master of Health Science in Anesthesiologist Assistant",
            city="Joplin", state="MO", source_url=KCU_SRC)
NEW_ROWS += [
    row(**_kcu, req_name="Biological Sciences",
        req_details="2 semesters with lab (8 semester hours / 12 quarter hours).", lab="true", sem_credits=2),
    row(**_kcu, req_name="Calculus",
        req_details="1 semester (3 semester hours / 4.5 quarter hours).", lab="false", sem_credits=1),
    row(**_kcu, req_name="General Chemistry with Lab",
        req_details="1 semester with lab (4 semester hours / 6 quarter hours).", lab="true", sem_credits=1),
    row(**_kcu, req_name="Organic Chemistry I with Lab",
        req_details="1 semester with lab (4 semester hours / 6 quarter hours).", lab="true", sem_credits=1),
    row(**_kcu, req_name="Organic Chemistry II or Biochemistry with Lab",
        req_details="1 semester with lab (4 semester hours / 6 quarter hours).", lab="true", sem_credits=1),
    row(**_kcu, req_name="English Composition or Technical Writing",
        req_details="1 semester (3 semester hours / 4.5 quarter hours).", lab="false", sem_credits=1),
    row(**_kcu, req_name="Human / Medical Anatomy with Lab",
        req_details="1 semester with lab (4 semester hours / 6 quarter hours).", lab="true", sem_credits=1),
    row(**_kcu, req_name="Human / Medical Physiology with Lab",
        req_details="1 semester with lab (4 semester hours / 6 quarter hours).", lab="true", sem_credits=1),
    row(**_kcu, req_name="Physics with Lab",
        req_details="2 semesters with lab (8 semester hours / 12 quarter hours).", lab="true", sem_credits=2),
    row(**_kcu, req_name="Statistics",
        req_details="1 semester (3 semester hours / 4.5 quarter hours).", lab="false", sem_credits=1),
]

# ── University of New Mexico (caahep-11094) ───────────────────────────────────
_unm = dict(external_id="caahep-11094", profession=AA,
            school_name="University of New Mexico",
            program_name="Master of Science in Anesthesia",
            city="Albuquerque", state="NM", source_url=UNM_SRC)
NEW_ROWS += [
    row(**_unm, req_name="Biology I with Lab",
        req_details="Required; must be completed within 7 years of application. Equiv. to UNM BIOL 2101 (Molecules to Cells) with BIOL 2103L.", lab="true", sem_credits=1),
    row(**_unm, req_name="Biology II",
        req_details="Required; must be completed within 7 years. Equiv. to UNM BIOL 2102 (Organisms to Ecosystems). Lab not required but recommended.", lab="false", sem_credits=1),
    row(**_unm, req_name="General Chemistry I with Lab",
        req_details="Required; within 7 years. Equiv. to UNM CHEM 1215 with 1215L.", lab="true", sem_credits=1),
    row(**_unm, req_name="General Chemistry II with Lab",
        req_details="Required; within 7 years. Equiv. to UNM CHEM 1225 with 1225L.", lab="true", sem_credits=1),
    row(**_unm, req_name="Organic Chemistry I with Lab",
        req_details="Required; within 7 years. Equiv. to UNM CHEM 301 with 303L.", lab="true", sem_credits=1),
    row(**_unm, req_name="Physics I with Lab",
        req_details="Required; within 7 years. Algebra-based (PHYS 1230/1230L) or calculus-based (PHYS 1310/1310L) accepted.", lab="true", sem_credits=1),
    row(**_unm, req_name="Physics II with Lab",
        req_details="Required; within 7 years. Algebra-based (PHYS 1240/1240L) or calculus-based (PHYS 1320/1320L) accepted.", lab="true", sem_credits=1),
    row(**_unm, req_name="Biochemistry",
        req_details="Required; must be completed within 5 years. Equiv. to UNM BIOC 423 (Introductory Biochemistry).", lab="false", sem_credits=1),
    row(**_unm, req_name="Statistics",
        req_details="Required; within 7 years. Equiv. to UNM MATH 1350 (Introduction to Statistics).", lab="false", sem_credits=1),
    row(**_unm, req_name="Human Anatomy & Physiology",
        req_details="Required; must be completed within 5 years. Equiv. to UNM BIOL 2210 (Human Anatomy & Physiology I).", lab="false", sem_credits=1),
    row(**_unm, req_name="Human Anatomy & Physiology II with Lab",
        req_details="Highly recommended. UNM BIOL 2225L (A&P II with lab) plus BIOL 2210L (A&P I lab).", lab="true", classification="recommended"),
    row(**_unm, req_name="Cellular & Molecular Biology",
        req_details="Highly recommended. Equiv. to UNM BIOL 301C (Molecular & Cell Biology).", lab="false", classification="recommended"),
    row(**_unm, req_name="Organic Chemistry II with Lab",
        req_details="Recommended. Equiv. to UNM CHEM 302 with 304L.", lab="true", classification="recommended"),
    row(**_unm, req_name="English Composition",
        req_details="Recommended. Equiv. to UNM ENG 1110 (Composition I).", lab="false", classification="recommended"),
]

# ── University of Calgary (naacls-2826) — no specific course list published ───
_cal = dict(external_id="naacls-2826", profession=PA,
            school_name="University of Calgary",
            program_name="Pathologists' Assistant (Master's)",
            city="Calgary", state="AB", source_url=CAL_SRC)
NEW_ROWS += [
    row(**_cal, req_name="BSc in Biological Sciences or Equivalent",
        req_details=(
            "Minimum admission requirement: a BSc in Biological Sciences or equivalent "
            "(GPA ≥ 3.3/4.0 over past two years of full-time study, min 10 full-course "
            "equivalents or 60 units). No specific prerequisite course list is published."
        ),
        classification="informational"),
    row(**_cal, req_name="Suggested: Human Anatomy / Physiology / Pathology / Histology",
        req_details=(
            "Suggested preparatory areas (not formally required): human anatomy, physiology, "
            "pathology, clinical laboratory medicine, histology, molecular genetics, "
            "developmental embryology, forensics, immunology, and microbiology."
        ),
        classification="recommended"),
]

# ── Old Dominion University (naacls-2821) ─────────────────────────────────────
_odu = dict(external_id="naacls-2821", profession=PA,
            school_name="Old Dominion University",
            program_name="Pathologists' Assistant (Master's)",
            city="Norfolk", state="VA", source_url=ODU_SRC)
NEW_ROWS += [
    row(**_odu, req_name="General Biology with Lab",
        req_details="2 semesters with lab (or equivalent). Cumulative GPA of 3.0+ required.", lab="true", sem_credits=2),
    row(**_odu, req_name="General Chemistry with Lab",
        req_details="2 semesters with lab.", lab="true", sem_credits=2),
    row(**_odu, req_name="Organic Chemistry with Lab",
        req_details="2 semesters with lab OR 1 semester Organic Chemistry + 1 semester Biochemistry.", lab="true", sem_credits=2),
    row(**_odu, req_name="Mathematics",
        req_details="1 semester of college-level mathematics.", lab="false", sem_credits=1),
    row(**_odu, req_name="Physics",
        req_details="1 semester.", lab="false", sem_credits=1),
    row(**_odu, req_name="Microbiology",
        req_details="1 semester; recommended if deficiency apparent with low prerequisite GPA.", lab="false", sem_credits=1, classification="recommended"),
    row(**_odu, req_name="Anatomy & Physiology",
        req_details="1 semester combined; recommended if deficiency apparent with low prerequisite GPA.", lab="false", sem_credits=1, classification="recommended"),
]

# ── Carroll University (naacls-7603) ─────────────────────────────────────────
_car = dict(external_id="naacls-7603", profession=PA,
            school_name="Carroll University",
            program_name="Pathologists' Assistant (Master's)",
            city="Waukesha", state="WI", source_url=CAR_SRC)
NEW_ROWS += [
    row(**_car, req_name="Anatomy & Physiology I with Lab",
        req_details="Required; must be completed within 5 years of application date.", lab="true", sem_credits=1),
    row(**_car, req_name="Anatomy & Physiology II with Lab",
        req_details="Required; must be completed within 5 years of application date.", lab="true", sem_credits=1),
    row(**_car, req_name="General Biology I",
        req_details="Lab is preferred but not required.", lab="false", sem_credits=1),
    row(**_car, req_name="General Biology II",
        req_details="Lab is preferred but not required.", lab="false", sem_credits=1),
    row(**_car, req_name="General Chemistry I with Lab",
        req_details="Lab required.", lab="true", sem_credits=1),
    row(**_car, req_name="General Chemistry II with Lab",
        req_details="Lab required.", lab="true", sem_credits=1),
    row(**_car, req_name="Organic Chemistry with Lab or Biochemistry with Lab",
        req_details="Either Organic Chemistry with lab OR Biochemistry with lab fulfills this requirement.", lab="true", sem_credits=1),
    row(**_car, req_name="Microbiology",
        req_details="Lab is preferred but not required.", lab="false", sem_credits=1),
    row(**_car, req_name="Upper Level Sciences (3 semesters)",
        req_details="3 semesters of upper-level sciences (300 level or higher). Recommended: Genetics, Cell Biology, Biochemistry, etc.", lab="false", sem_credits=3),
    row(**_car, req_name="Statistics",
        req_details="Required.", lab="false", sem_credits=1),
]

# ── West Virginia University (naacls-2786) ────────────────────────────────────
_wvu = dict(external_id="naacls-2786", profession=PA,
            school_name="West Virginia University",
            program_name="Pathologists' Assistant (Master's)",
            city="Morgantown", state="WV", source_url=WVU_SRC)
NEW_ROWS += [
    row(**_wvu, req_name="Biology with Lab",
        req_details="8 credit hours (2 semesters) with laboratory.", lab="true", sem_credits=2),
    row(**_wvu, req_name="Human Anatomy",
        req_details="3–4 credit hours; can be taken in combination with Physiology.", lab="false", sem_credits=1),
    row(**_wvu, req_name="College Chemistry with Lab",
        req_details="8 credit hours (2 semesters) with lab.", lab="true", sem_credits=2),
    row(**_wvu, req_name="Organic Chemistry or Biochemistry",
        req_details="3–4 credit hours.", lab="false", sem_credits=1),
    row(**_wvu, req_name="Microbiology / Immunology / Parasitology / or Virology",
        req_details="3–4 credit hours; any of these subject areas fulfills this requirement.", lab="false", sem_credits=1),
    row(**_wvu, req_name="College Algebra or Higher Mathematics",
        req_details="3 credit hours; college algebra or higher.", lab="false", sem_credits=1),
    row(**_wvu, req_name="English Composition",
        req_details="3 credit hours.", lab="false", sem_credits=1),
]

# ── Load, filter, append, save ────────────────────────────────────────────────
with open(JSON_PATH) as f:
    data = json.load(f)

original_count = len(data)
filtered = [item for item in data if item.get("external_id") not in TARGET_IDS]
removed = original_count - len(filtered)
updated = filtered + NEW_ROWS

with open(JSON_PATH, "w") as f:
    json.dump(updated, f, indent=2, ensure_ascii=False)
    f.write("\n")

print(f"Original: {original_count} rows")
print(f"Removed:  {removed} placeholder rows for {len(TARGET_IDS)} programs")
print(f"Added:    {len(NEW_ROWS)} prerequisite rows")
print(f"Final:    {len(updated)} rows")
print(f"Saved to: {JSON_PATH}")
