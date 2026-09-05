import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useCreateErrorReport, ErrorReportInputIssueType } from "@workspace/api-client-react";
import {
  ISSUE_TYPES,
  isDescriptionRequired,
  reportFormSchema,
  buildErrorReportPayload,
  type ReportFormValues,
  type ReportErrorPrefill,
} from "@/lib/report-error";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type { ReportErrorPrefill };

interface ReportErrorDialogProps {
  /** The button/link that opens the dialog. */
  trigger: React.ReactNode;
  /** Present when reported from a program's own card; absent for the general first-page entry point. */
  prefill?: ReportErrorPrefill;
}

/**
 * Native "Report an Error" workflow (Dr. McNelis's pilot-testing request), reachable both from
 * the first authenticated page and from each program result card. Program-specific context is
 * prefilled and shown read-only — the tester should never have to retype the profession,
 * institution, program, or the Official Program Page URL they're already looking at.
 */
export function ReportErrorDialog({ trigger, prefill }: ReportErrorDialogProps) {
  const [open, setOpen] = React.useState(false);
  const createMutation = useCreateErrorReport();

  const form = useForm<ReportFormValues>({
    resolver: zodResolver(reportFormSchema),
    defaultValues: {
      issueType: undefined,
      description: "",
      suggestedSourceUrl: "",
      contactEmail: "",
    },
  });

  const issueType = form.watch("issueType");
  const descriptionRequired = isDescriptionRequired(issueType);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) form.reset();
  }

  function onSubmit(values: ReportFormValues) {
    createMutation.mutate(
      { data: buildErrorReportPayload(values, prefill) },
      {
        onSuccess: () => {
          toast.success("Thanks — your report was submitted for review.");
          handleOpenChange(false);
        },
        onError: () => {
          toast.error("Could not submit your report. Please try again.");
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Report an Error</DialogTitle>
          <DialogDescription>
            Pilot testing — this helps us correct the database before wider release. Your report
            goes to the development team, not to other students.
          </DialogDescription>
        </DialogHeader>

        {prefill && (
          <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-0.5">
            <p className="font-medium text-foreground">
              {prefill.institution} — {prefill.programName}
              {/* programName conventionally already ends "... (MD)"/"(DO)" etc.; only
                  append the degree separately when it is not already part of the name. */}
              {prefill.programDegree && !prefill.programName.includes(prefill.programDegree)
                ? ` (${prefill.programDegree})`
                : ""}
            </p>
            <p className="text-muted-foreground">Profession: {prefill.profession}</p>
            {prefill.reportedSourceUrl && (
              <p className="text-muted-foreground break-all">
                Displayed source: {prefill.reportedSourceUrl}
              </p>
            )}
            {prefill.lastVerified && (
              <p className="text-muted-foreground">Last verified: {prefill.lastVerified}</p>
            )}
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="issueType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Issue type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select the type of issue" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ISSUE_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {descriptionRequired ? "What's wrong?" : "What's wrong? (optional)"}
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Briefly describe the issue"
                      rows={3}
                      maxLength={2000}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {(issueType === ErrorReportInputIssueType.wrong_program_page ||
              issueType === ErrorReportInputIssueType.outdated_information) && (
              <FormField
                control={form.control}
                name="suggestedSourceUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Correct official page URL (optional)</FormLabel>
                    <FormControl>
                      <Input {...field} type="url" placeholder="https://" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="contactEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contact email (optional)</FormLabel>
                  <FormControl>
                    <Input {...field} type="email" placeholder="you@example.edu" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Submitting…" : "Submit report"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
