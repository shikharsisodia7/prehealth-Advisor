import { useState, useMemo } from "react";
import { ClipboardCopy, Download, MapPin, ExternalLink, BookOpen, ChevronDown } from "lucide-react";
import { toast } from "sonner";

import {
  useListProfessions,
  useListProgramSchools,
  type ProgramSchool,
} from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

// ─── helpers ─────────────────────────────────────────────────────────────────

function buildCsvRow(school: ProgramSchool): string {
  const prereqs = school.prereqCourses.join("; ");
  const escape = (v: string) =>
    `"${v.replace(/"/g, '""')}"`;
  return [
    escape(school.name),
    escape(school.state),
    school.degreeType ? escape(school.degreeType) : '""',
    escape(prereqs),
    escape(school.sourceUrl),
    school.lastVerified ? escape(school.lastVerified) : '""',
  ].join(",");
}

function buildTsvRow(school: ProgramSchool): string {
  const prereqs = school.prereqCourses.join("; ");
  return [
    school.name,
    school.state,
    school.degreeType ?? "",
    prereqs,
    school.sourceUrl,
    school.lastVerified ?? "",
  ].join("\t");
}

const CSV_HEADER =
  '"School","State","Degree Type","Required Prerequisites","Source URL","Last Verified"';
const TSV_HEADER =
  "School\tState\tDegree Type\tRequired Prerequisites\tSource URL\tLast Verified";

// ─── component ───────────────────────────────────────────────────────────────

export default function ProgramPlanner() {
  const [selectedProfession, setSelectedProfession] = useState<string>("");
  const [selectedSchoolIds, setSelectedSchoolIds] = useState<Set<number>>(
    new Set(),
  );

  const { data: professions, isLoading: loadingProfessions } =
    useListProfessions();

  const {
    data: allSchools,
    isLoading: loadingSchools,
    isFetching,
  } = useListProgramSchools(
    selectedProfession
      ? {
          professionSlug: selectedProfession,
          // Explicitly request only entry-to-practice degrees for nursing.
          // The server enforces this as a default too, but passing it here
          // makes the contract explicit and caches per-params correctly.
          ...(selectedProfession === "nursing"
            ? { degreeType: ["ABSN", "MEPN"] }
            : {}),
        }
      : undefined,
    {
      query: {
        enabled: !!selectedProfession,
        queryKey: ["program-schools", selectedProfession],
      },
    },
  );

  const schools = useMemo(() => allSchools ?? [], [allSchools]);

  const selectedSchools = useMemo(
    () => schools.filter((s) => selectedSchoolIds.has(s.id)),
    [schools, selectedSchoolIds],
  );

  // ── handlers ────────────────────────────────────────────────────────────────

  function handleProfessionChange(slug: string) {
    setSelectedProfession(slug);
    setSelectedSchoolIds(new Set());
  }

  function toggleSchool(id: number) {
    setSelectedSchoolIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleDownloadCsv() {
    if (selectedSchools.length === 0) return;
    const rows = [CSV_HEADER, ...selectedSchools.map(buildCsvRow)].join("\n");
    const blob = new Blob(["\uFEFF" + rows], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "program-planner-prereqs.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV downloaded");
  }

  async function handleCopyForExcel() {
    if (selectedSchools.length === 0) return;
    const rows = [TSV_HEADER, ...selectedSchools.map(buildTsvRow)].join("\n");
    try {
      await navigator.clipboard.writeText(rows);
      toast.success("Copied! Paste directly into Excel.");
    } catch {
      toast.error("Could not access clipboard. Please try the CSV download instead.");
    }
  }

  // ── derived UI state ─────────────────────────────────────────────────────────

  const professionName = professions?.find(
    (p) => p.slug === selectedProfession,
  )?.name;

  const noSchoolsForProfession =
    selectedProfession && !loadingSchools && !isFetching && schools.length === 0;

  const showOutput = selectedSchools.length > 0;

  // ── render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="font-serif text-3xl font-bold text-foreground mb-1">
          Program Planner
        </h1>
        <p className="text-muted-foreground text-sm max-w-2xl">
          Select a profession and the schools you're interested in to see their
          required prerequisite courses side by side — so you can plan your
          coursework confidently.
        </p>
      </div>

      {/* Step 1 — Select Profession */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
              1
            </span>
            Select a Profession
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingProfessions ? (
            <Skeleton className="h-10 w-72" />
          ) : (
            <Select
              value={selectedProfession}
              onValueChange={handleProfessionChange}
            >
              <SelectTrigger className="w-72">
                <SelectValue placeholder="Choose a profession…" />
              </SelectTrigger>
              <SelectContent>
                {(professions ?? []).map((p) => (
                  <SelectItem key={p.slug} value={p.slug}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      {/* Step 2 — Select Schools */}
      {selectedProfession && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                2
              </span>
              Select Schools of Interest
            </CardTitle>
            <CardDescription className="text-sm leading-relaxed pt-1">
              Pick{" "}
              <strong>10–15 schools</strong> to get a representative range of
              prerequisites. Include in-state schools where you have residency
              and other schools you're genuinely interested in — a broader
              selection helps you plan more complete coursework.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingSchools || isFetching ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : noSchoolsForProfession ? (
              <div className="py-8 text-center text-muted-foreground">
                <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="font-medium">
                  Schools for this profession haven't been added yet.
                </p>
                <p className="text-sm mt-1">
                  Check back soon as we continue expanding the database.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {schools.map((school) => (
                  <div
                    key={school.id}
                    className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-accent/50 cursor-pointer transition-colors"
                    onClick={() => toggleSchool(school.id)}
                  >
                    <Checkbox
                      id={`school-${school.id}`}
                      checked={selectedSchoolIds.has(school.id)}
                      onCheckedChange={() => toggleSchool(school.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <Label
                      htmlFor={`school-${school.id}`}
                      className="flex-1 cursor-pointer flex items-center gap-2 text-sm"
                    >
                      {school.name}
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="w-3 h-3" />
                        {school.state}
                      </span>
                      {school.degreeType && (
                        <Badge variant="secondary" className="text-xs py-0">
                          {school.degreeType}
                        </Badge>
                      )}
                    </Label>
                  </div>
                ))}
              </div>
            )}

            {schools.length > 0 && (
              <p className="text-xs text-muted-foreground mt-3">
                {selectedSchoolIds.size} of {schools.length} selected
                {selectedSchoolIds.size > 0 && selectedSchoolIds.size < 10 && (
                  <span className="text-amber-600 ml-1">
                    — consider selecting at least 10 for a representative range
                  </span>
                )}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 3 — Output table */}
      {showOutput && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                    3
                  </span>
                  Required Prerequisites
                </CardTitle>
                <CardDescription className="text-sm pt-1">
                  Required courses only — no recommended or optional coursework.
                </CardDescription>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyForExcel}
                  className="gap-1.5"
                >
                  <ClipboardCopy className="w-4 h-4" />
                  Copy for Excel
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleDownloadCsv}
                  className="gap-1.5"
                >
                  <Download className="w-4 h-4" />
                  Download CSV
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left font-semibold px-4 py-3 whitespace-nowrap">
                      School
                    </th>
                    <th className="text-left font-semibold px-4 py-3 whitespace-nowrap">
                      State
                    </th>
                    <th className="text-left font-semibold px-4 py-3">
                      Required Prerequisites
                    </th>
                    <th className="text-left font-semibold px-4 py-3 whitespace-nowrap text-muted-foreground text-xs">
                      Source
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {selectedSchools.map((school, idx) => (
                    <tr
                      key={school.id}
                      className={
                        idx % 2 === 0
                          ? "border-b border-border/60"
                          : "border-b border-border/60 bg-muted/20"
                      }
                    >
                      <td className="px-4 py-3 font-medium align-top">
                        <div>{school.name}</div>
                        {school.degreeType && (
                          <Badge
                            variant="secondary"
                            className="text-xs py-0 mt-0.5"
                          >
                            {school.degreeType}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap align-top">
                        {school.state}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <ul className="space-y-0.5">
                          {school.prereqCourses.map((course, i) => (
                            <li key={i} className="flex items-start gap-1.5">
                              <span className="text-primary mt-1 shrink-0">
                                •
                              </span>
                              {course}
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex flex-col gap-0.5">
                          <a
                            href={school.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Official page
                          </a>
                          {school.lastVerified && (
                            <span className="text-xs text-muted-foreground">
                              Verified {school.lastVerified}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state: profession selected but no schools checked yet */}
      {selectedProfession &&
        !loadingSchools &&
        !isFetching &&
        schools.length > 0 &&
        selectedSchoolIds.size === 0 && (
          <div className="text-center py-10 text-muted-foreground">
            <ChevronDown className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">
              Select schools above to see their required prerequisites here.
            </p>
          </div>
        )}
    </div>
  );
}
