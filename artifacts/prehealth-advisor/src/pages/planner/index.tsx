import { useState, useMemo, useRef, useEffect, useId } from "react";
import {
  ClipboardCopy,
  Download,
  FileSpreadsheet,
  Printer,
  ExternalLink,
  ChevronDown,
  X,
  Check,
  Search,
  AlertCircle,
  Info,
} from "lucide-react";
import { toast } from "sonner";

import {
  useListProfessions,
  useListProgramSchools,
  type ProgramSchool,
} from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  EXPORT_HEADERS,
  alphabetize,
  buildSelectionExportRows,
  filterByDegreeTypes,
  filterSchools,
  sanitizeSpreadsheetValue,
  rowToTsv,
  rowToCsv,
  type ExportRow,
} from "@/lib/planner-utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type NursingType = "ABSN" | "MEPN" | "";

// ─── Step badge ───────────────────────────────────────────────────────────────

function StepBadge({ n, active }: { n: number; active?: boolean }) {
  return (
    <span
      className={cn(
        "w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center shrink-0",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground",
      )}
      aria-hidden="true"
    >
      {n}
    </span>
  );
}

// ─── Searchable combobox (single-select) ──────────────────────────────────────

interface ComboboxOption {
  value: string;
  label: string;
}

function Combobox({
  options,
  value,
  onChange,
  placeholder,
  id,
  disabled,
}: {
  options: ComboboxOption[];
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  id?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(
    () =>
      query.trim()
        ? options.filter((o) =>
            o.label.toLowerCase().includes(query.toLowerCase()),
          )
        : options,
    [options, query],
  );

  const selected = options.find((o) => o.value === value);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function handleSelect(val: string) {
    onChange(val);
    setOpen(false);
    setQuery("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
    }
    if (e.key === "Enter" && filtered.length === 1) {
      handleSelect(filtered[0].value);
    }
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-sm">
      <button
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            setOpen((o) => !o);
            setTimeout(() => inputRef.current?.focus(), 0);
          }
        }}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          !selected && "text-muted-foreground",
        )}
      >
        <span className="truncate">{selected ? selected.label : placeholder}</span>
        <ChevronDown
          className={cn(
            "w-4 h-4 text-muted-foreground transition-transform shrink-0",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md overflow-hidden"
        >
          <div className="flex items-center border-b border-border px-3 py-2 gap-2">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder="Search…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              aria-label="Search options"
            />
          </div>
          <ul className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">
                No results
              </li>
            ) : (
              filtered.map((opt) => (
                <li
                  key={opt.value}
                  role="option"
                  aria-selected={opt.value === value}
                  onClick={() => handleSelect(opt.value)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground",
                    opt.value === value && "bg-primary/10 font-medium",
                  )}
                >
                  <Check
                    className={cn(
                      "w-4 h-4 shrink-0",
                      opt.value === value ? "opacity-100 text-primary" : "opacity-0",
                    )}
                  />
                  {opt.label}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── School multi-select ──────────────────────────────────────────────────────

function SchoolMultiSelect({
  schools,
  selectedIds,
  onToggle,
}: {
  schools: ProgramSchool[];
  selectedIds: Set<number>;
  onToggle: (id: number) => void;
}) {
  const [query, setQuery] = useState("");
  const inputId = useId();

  const [stateFilter, setStateFilter] = useState("");

  const states = useMemo(
    () =>
      Array.from(new Set(schools.map((s) => s.state).filter(Boolean))).sort(),
    [schools],
  );

  const filtered = useMemo(
    () => filterSchools(schools, query, stateFilter),
    [schools, query, stateFilter],
  );

  return (
    <div>
      {/* Search input + optional state filter */}
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            id={inputId}
            type="text"
            className="w-full h-10 pl-9 pr-4 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            placeholder="Search by school, city, or state…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search programs"
          />
        </div>
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 sm:w-44"
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value)}
          aria-label="Filter by state (optional)"
        >
          <option value="">All states</option>
          {states.map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs text-muted-foreground mb-2">
        {filtered.length} of {schools.length} programs shown
        {stateFilter ? ` (state: ${stateFilter})` : ""} — the state filter is
        for browsing convenience only; consider programs nationwide.
      </p>

      {/* School list */}
      <div
        className="rounded-md border border-border divide-y divide-border max-h-72 overflow-y-auto"
        role="listbox"
        aria-multiselectable="true"
        aria-label="Programs list"
      >
        {filtered.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground text-center">
            No programs match your search.
          </div>
        ) : (
          filtered.map((school) => {
            const isSelected = selectedIds.has(school.id);
            const location = [school.city, school.state]
              .filter(Boolean)
              .join(", ");
            return (
              <div
                key={school.id}
                role="option"
                aria-selected={isSelected}
                tabIndex={0}
                onClick={() => onToggle(school.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onToggle(school.id);
                  }
                }}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors focus:outline-none focus:bg-accent",
                  isSelected
                    ? "bg-primary/5 hover:bg-primary/10"
                    : "hover:bg-accent/50",
                )}
              >
                {/* Custom checkbox */}
                <div
                  className={cn(
                    "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                    isSelected
                      ? "border-primary bg-primary"
                      : "border-muted-foreground",
                  )}
                  aria-hidden="true"
                >
                  {isSelected && (
                    <Check className="w-3 h-3 text-primary-foreground" strokeWidth={3} />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {school.name}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {school.programName}
                    {location ? ` · ${location}` : ""}
                  </div>
                </div>

                {school.degreeType && (
                  <Badge variant="secondary" className="text-xs py-0 shrink-0">
                    {school.degreeType}
                  </Badge>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Results section ──────────────────────────────────────────────────────────

function VerificationMessage({
  status,
}: {
  status: string;
}) {
  const messages: Record<string, string> = {
    needs_review:
      "This information requires re-verification. Review the official program source or consult a health professions advisor.",
    outdated:
      "This information requires re-verification. Review the official program source or consult a health professions advisor.",
    draft:
      "This program has been identified, but its prerequisite information is still being verified.",
    imported:
      "This program has been identified, but its prerequisite information is still being verified.",
    rejected:
      "Prerequisite information for this program is still being verified. Review the official program page or consult a health professions advisor.",
  };
  return (
    <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-sm">
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
      <span>{messages[status] ?? "Prerequisite information for this program is still being verified. Review the official program page or consult a health professions advisor."}</span>
    </div>
  );
}

function SchoolResult({ school }: { school: ProgramSchool }) {
  const isVerified = school.verificationStatus === "verified";
  const requiredPrereqs = school.prereqCourses.filter(
    (p) => p.classification === "required",
  );

  return (
    <div className="py-4 first:pt-0">
      {/* School + program heading */}
      <div className="mb-2">
        <h3 className="font-semibold text-base text-foreground">{school.name}</h3>
        <p className="text-sm text-muted-foreground">{school.programName}</p>
      </div>

      {isVerified ? (
        requiredPrereqs.length > 0 ? (
          <>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
              Required prerequisites:
            </p>
            <ul className="space-y-1 mb-3">
              {requiredPrereqs.map((prereq, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-primary mt-1 shrink-0" aria-hidden="true">•</span>
                  <span>
                    <span className="font-medium">{prereq.name}</span>
                    {prereq.details && (
                      <span className="text-muted-foreground"> — {prereq.details}</span>
                    )}
                    {prereq.otherConditions && (
                      <span className="text-muted-foreground italic">
                        {" "}({prereq.otherConditions})
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-muted-foreground mb-3">
            No required prerequisites listed in the current data.
          </p>
        )
      ) : (
        <div className="mb-3">
          <VerificationMessage status={school.verificationStatus} />
        </div>
      )}

      {/* Source + verification date */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {school.sourceUrl ? (
          <a
            href={school.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline focus:outline-none focus:underline"
          >
            <ExternalLink className="w-3 h-3" />
            Official prerequisite source
          </a>
        ) : school.websiteUrl ? (
          <a
            href={school.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline focus:outline-none focus:underline"
          >
            <ExternalLink className="w-3 h-3" />
            Official program website
          </a>
        ) : null}
        {school.lastVerified && (
          <span>Last verified {school.lastVerified}</span>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ProgramPlanner() {
  const [selectedProfessionSlug, setSelectedProfessionSlug] =
    useState<string>("");
  const [nursingType, setNursingType] = useState<NursingType>("");
  // MD/DO filter for medicine — default both selected (preserves prior behavior)
  const [medicalDegrees, setMedicalDegrees] = useState<Set<"MD" | "DO">>(
    () => new Set(["MD", "DO"]),
  );
  const [selectedSchoolIds, setSelectedSchoolIds] = useState<Set<number>>(
    new Set(),
  );
  const [showResults, setShowResults] = useState(false);

  // ── data fetching ──────────────────────────────────────────────────────────

  const { data: professions, isLoading: loadingProfessions } =
    useListProfessions();

  const isNursing = selectedProfessionSlug === "nursing";
  const nursingTypeSelected = isNursing ? nursingType !== "" : true;

  // Build query params for school fetch
  const schoolQueryParams = useMemo(() => {
    if (!selectedProfessionSlug) return undefined;
    if (isNursing && nursingType === "") return undefined; // wait for nursing type
    const params: { professionSlug: string; degreeType?: string[] } = {
      professionSlug: selectedProfessionSlug,
    };
    if (isNursing && nursingType) {
      params.degreeType = [nursingType];
    }
    return params;
  }, [selectedProfessionSlug, isNursing, nursingType]);

  const {
    data: allSchools,
    isLoading: loadingSchools,
    isFetching,
    isError: schoolsError,
  } = useListProgramSchools(schoolQueryParams ?? { professionSlug: "" }, {
    query: {
      enabled: !!schoolQueryParams,
      queryKey: [
        "program-schools",
        selectedProfessionSlug,
        isNursing ? nursingType : null,
      ],
    },
  });

  // Case-insensitive alphabetical browse order (the API's SQL ordering is
  // byte-order, which puts e.g. "CUNY" before "California").
  const schools = useMemo(
    () => alphabetize(allSchools ?? []),
    [allSchools],
  );

  const isMedicine = selectedProfessionSlug === "medicine";

  // Browse list shown in Step 2 — for medicine, narrowed by the MD/DO filter.
  // Selections are derived from the FULL list so switching the filter never
  // silently drops an already-selected program.
  const browseSchools = useMemo(
    () =>
      isMedicine
        ? filterByDegreeTypes(schools, Array.from(medicalDegrees))
        : schools,
    [schools, isMedicine, medicalDegrees],
  );

  const selectedSchools = useMemo(
    () => schools.filter((s) => selectedSchoolIds.has(s.id)),
    [schools, selectedSchoolIds],
  );

  // ── profession options ─────────────────────────────────────────────────────

  const professionOptions = useMemo(
    () =>
      (professions ?? []).map((p) => ({
        value: p.slug,
        label: p.name,
      })),
    [professions],
  );

  const selectedProfessionName =
    professions?.find((p) => p.slug === selectedProfessionSlug)?.name ?? "";

  // ── handlers ──────────────────────────────────────────────────────────────

  function handleProfessionChange(slug: string) {
    if (slug === selectedProfessionSlug) return;
    if (selectedSchoolIds.size > 0) {
      toast.info("Profession changed — your school selections have been cleared.");
    }
    setSelectedProfessionSlug(slug);
    setNursingType("");
    setMedicalDegrees(new Set(["MD", "DO"]));
    setSelectedSchoolIds(new Set());
    setShowResults(false);
  }

  function toggleMedicalDegree(deg: "MD" | "DO") {
    setMedicalDegrees((prev) => {
      const next = new Set(prev);
      if (next.has(deg)) {
        // never allow an empty selection — flip to only the other degree
        if (next.size === 1) return new Set<"MD" | "DO">([deg === "MD" ? "DO" : "MD"]);
        next.delete(deg);
      } else {
        next.add(deg);
      }
      return next;
    });
  }

  function handleNursingTypeChange(type: NursingType) {
    if (selectedSchoolIds.size > 0) {
      toast.info("Program type changed — your school selections have been cleared.");
    }
    setNursingType(type);
    setSelectedSchoolIds(new Set());
    setShowResults(false);
  }

  function toggleSchool(id: number) {
    setSelectedSchoolIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setShowResults(false);
  }

  function removeChip(id: number) {
    setSelectedSchoolIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setShowResults(false);
  }

  function handleViewPrerequisites() {
    setShowResults(true);
  }

  // ── export handlers ────────────────────────────────────────────────────────

  function collectExportRows(): ExportRow[] {
    // Every selected program is represented; those without verified
    // required-prerequisite records get an explicit status row.
    return buildSelectionExportRows(selectedSchools, selectedProfessionName);
  }

  async function handleCopyResults() {
    const rows = collectExportRows();
    if (rows.length === 0) return;
    const tsv =
      EXPORT_HEADERS.join("\t") + "\n" + rows.map(rowToTsv).join("\n");
    try {
      await navigator.clipboard.writeText(tsv);
      toast.success("Copied! Paste directly into Excel or Google Sheets.");
    } catch {
      toast.error("Could not access clipboard. Try the CSV download instead.");
    }
  }

  function handleDownloadCsv() {
    const rows = collectExportRows();
    if (rows.length === 0) return;
    const csv =
      EXPORT_HEADERS.map((h) => `"${h}"`).join(",") +
      "\n" +
      rows.map(rowToCsv).join("\n");
    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "program-planner-prerequisites.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV downloaded");
  }

  async function handleDownloadExcel() {
    const rows = collectExportRows();
    if (rows.length === 0) return;
    // Dynamically import SheetJS to keep the initial bundle lean
    const XLSX = await import("xlsx");
    const wsData = [
      EXPORT_HEADERS as unknown as string[],
      ...rows.map((r) =>
        [
          r.profession,
          r.degreeType,
          r.school,
          r.program,
          r.prereqName,
          r.details,
          r.courseCount,
          r.semesterCredits,
          r.quarterCredits,
          r.labRequired,
          r.otherConditions,
          r.sourceUrl,
          r.lastVerified,
        ].map(sanitizeSpreadsheetValue),
      ),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Prerequisites");
    XLSX.writeFile(wb, "program-planner-prerequisites.xlsx");
    toast.success("Excel file downloaded");
  }

  function handlePrint() {
    window.print();
  }

  // ── derived state ──────────────────────────────────────────────────────────

  const schoolSelectorActive =
    selectedProfessionSlug !== "" && nursingTypeSelected;
  const noSchoolsForProfession =
    schoolSelectorActive && !loadingSchools && !isFetching && schools.length === 0 && !schoolsError;
  const count = selectedSchoolIds.size;

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Print stylesheet */}
      <style>{`
        @media print {
          header, .no-print { display: none !important; }
          .print-results { break-inside: avoid; }
          body { font-size: 12px; }
        }
      `}</style>

      <div className="space-y-6 pb-16">
        {/* Page header */}
        <div className="pt-2">
          <h1 className="font-serif text-2xl md:text-3xl font-bold text-foreground mb-2 leading-tight">
            Health Professions Program Planner
          </h1>
          <p className="text-muted-foreground text-sm max-w-2xl leading-relaxed">
            Compare the required prerequisite coursework for the health
            professional programs you are considering.
          </p>
          <p className="text-muted-foreground text-xs max-w-2xl mt-1.5 leading-relaxed">
            This planner is designed to support early academic planning. It does
            not rank programs, predict admission, or recommend where you should
            apply.
          </p>
        </div>

        {/* Step 1 — Select profession */}
        <Card className="no-print">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <StepBadge n={1} active />
              Select a health profession
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingProfessions ? (
              <Skeleton className="h-10 w-72" />
            ) : (
              <Combobox
                id="profession-select"
                options={professionOptions}
                value={selectedProfessionSlug}
                onChange={handleProfessionChange}
                placeholder="Choose a profession…"
              />
            )}

            {/* Medicine MD/DO filter */}
            {isMedicine && (
              <div className="mt-4 space-y-2">
                <Label className="text-sm font-medium text-foreground">
                  Degree type
                </Label>
                <div
                  className="flex flex-col sm:flex-row gap-2 mt-1"
                  role="group"
                  aria-label="Medical degree type filter"
                >
                  {(
                    [
                      { value: "MD", label: "MD (Allopathic)" },
                      { value: "DO", label: "DO (Osteopathic)" },
                    ] as const
                  ).map((opt) => {
                    const checked = medicalDegrees.has(opt.value);
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        onClick={() => toggleMedicalDegree(opt.value)}
                        className={cn(
                          "flex items-center gap-2 px-4 py-2.5 rounded-md border text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                          checked
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border hover:bg-accent hover:text-accent-foreground",
                        )}
                      >
                        <span
                          className={cn(
                            "w-4 h-4 rounded-sm border-2 flex items-center justify-center shrink-0",
                            checked ? "border-primary bg-primary" : "border-muted-foreground",
                          )}
                        >
                          {checked && (
                            <svg viewBox="0 0 12 12" className="w-3 h-3 text-primary-foreground" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path d="M2 6l3 3 5-6" />
                            </svg>
                          )}
                        </span>
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Both are shown by default. Unselect one to browse only MD or
                  only DO programs — programs you have already selected stay
                  selected.
                </p>
              </div>
            )}

            {/* Nursing sub-selector */}
            {isNursing && (
              <div className="mt-4 space-y-2">
                <Label className="text-sm font-medium text-foreground">
                  Select a nursing program type
                </Label>
                <div className="flex flex-col sm:flex-row gap-2 mt-1" role="radiogroup" aria-label="Nursing program type">
                  {(
                    [
                      { value: "ABSN", label: "Accelerated BSN (ABSN)" },
                      { value: "MEPN", label: "Master's Entry Nursing (MEPN)" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={nursingType === opt.value}
                      onClick={() => handleNursingTypeChange(opt.value)}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2.5 rounded-md border text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                        nursingType === opt.value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:bg-accent hover:text-accent-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0",
                          nursingType === opt.value
                            ? "border-primary"
                            : "border-muted-foreground",
                        )}
                      >
                        {nursingType === opt.value && (
                          <span className="w-2 h-2 rounded-full bg-primary" />
                        )}
                      </span>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Step 2 — Select schools */}
        {schoolSelectorActive && (
          <Card className="no-print">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <StepBadge n={2} active={schoolSelectorActive} />
                Select schools of interest
              </CardTitle>
              <CardDescription className="text-sm leading-relaxed pt-1 space-y-1">
                <span className="block">
                  Select approximately 10–15 programs so your results reflect a
                  useful range of prerequisite requirements.
                </span>
                <span className="block text-xs">
                  Consider including programs in your state of legal residence
                  along with other programs that genuinely interest you.
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loadingSchools || isFetching ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-md" />
                  ))}
                </div>
              ) : schoolsError ? (
                <div className="flex items-center gap-2 p-4 rounded-md bg-destructive/10 text-destructive text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  We could not load the program information. Please try again.
                </div>
              ) : noSchoolsForProfession ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  The program directory for this profession and degree type has
                  not been populated yet. This does not mean no programs exist
                  — check back soon or consult a health professions advisor.
                </p>
              ) : (
                <SchoolMultiSelect
                  schools={browseSchools}
                  selectedIds={selectedSchoolIds}
                  onToggle={toggleSchool}
                />
              )}

              {/* Selected chips */}
              {selectedSchools.length > 0 && (
                <div className="space-y-2">
                  <div
                    className="flex flex-wrap gap-1.5"
                    role="group"
                    aria-label="Selected programs"
                  >
                    {selectedSchools.map((s) => (
                      <span
                        key={s.id}
                        className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary border border-primary/20 rounded-full px-2.5 py-1"
                      >
                        {s.name}
                        <button
                          type="button"
                          onClick={() => removeChip(s.id)}
                          className="hover:text-primary/60 focus:outline-none focus:text-primary/60 ml-0.5"
                          aria-label={`Remove ${s.name}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>

                  {/* Count + guidance */}
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <p
                      className="text-sm text-muted-foreground"
                      aria-live="polite"
                      aria-atomic="true"
                    >
                      <strong className="text-foreground">{count}</strong>{" "}
                      {count === 1 ? "program" : "programs"} selected
                      {count < 10 && count > 0 && (
                        <span className="text-amber-700 ml-1.5">
                          — consider selecting approximately 10–15 for a
                          representative range
                        </span>
                      )}
                      {count > 15 && (
                        <span className="text-muted-foreground ml-1.5">
                          — a broad selection is fine; focus on programs that
                          genuinely interest you
                        </span>
                      )}
                    </p>

                    <Button
                      onClick={handleViewPrerequisites}
                      className="shrink-0"
                      disabled={count === 0}
                    >
                      View Required Prerequisites
                    </Button>
                  </div>
                </div>
              )}

              {/* Show button even when nothing selected yet */}
              {selectedSchools.length === 0 && schools.length > 0 && (
                <p className="text-sm text-muted-foreground text-center py-2">
                  Select at least one program to view required prerequisites.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Before profession selection */}
        {!selectedProfessionSlug && !loadingProfessions && (
          <div className="text-center py-10 text-muted-foreground">
            <ChevronDown className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">
              Choose a health profession to view available programs.
            </p>
          </div>
        )}

        {/* Step 3 — Results */}
        {showResults && selectedSchools.length > 0 && (
          <div>
            {/* Step heading */}
            <div className="flex items-center gap-2 mb-4">
              <StepBadge n={3} active />
              <h2 className="text-base font-semibold text-foreground">
                Required Prerequisites
              </h2>
            </div>

            {/* Disclaimer */}
            <div className="flex items-start gap-2 p-3 rounded-md bg-blue-50 border border-blue-200 text-blue-800 text-xs mb-4 no-print">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Professional program requirements can change. Confirm current
                requirements with the program and consult a health professions
                advisor before finalizing your academic plan.
              </span>
            </div>

            {/* Export buttons */}
            <div className="flex flex-wrap gap-2 mb-4 no-print" role="group" aria-label="Export options">
              {selectedSchools.length > 0 ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyResults}
                    className="gap-1.5"
                  >
                    <ClipboardCopy className="w-4 h-4" />
                    Copy Results
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadCsv}
                    className="gap-1.5"
                  >
                    <Download className="w-4 h-4" />
                    Download CSV
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadExcel}
                    className="gap-1.5"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    Download Excel
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePrint}
                    className="gap-1.5"
                  >
                    <Printer className="w-4 h-4" />
                    Print Results
                  </Button>
                </>
              ) : (
                <p className="text-xs text-muted-foreground italic py-1">
                  Export is available once verified prerequisite data is
                  present in your results.
                </p>
              )}
            </div>

            {/* Results cards */}
            <div className="space-y-0">
              {selectedSchools.map((school, idx) => (
                <div
                  key={school.id}
                  className={cn(
                    "print-results",
                    idx < selectedSchools.length - 1
                      ? "border-b border-border pb-4 mb-4"
                      : "",
                  )}
                >
                  <SchoolResult school={school} />
                </div>
              ))}
            </div>

            {/* Repeat disclaimer at bottom */}
            <div className="mt-6 p-3 rounded-md bg-muted/50 border border-border text-xs text-muted-foreground no-print">
              Available programs are being expanded and verified. Prerequisite
              information shown reflects official program sources as of the last
              verified date. Confirm current requirements directly with each
              program before finalizing your academic plan.
            </div>
          </div>
        )}
      </div>
    </>
  );
}
