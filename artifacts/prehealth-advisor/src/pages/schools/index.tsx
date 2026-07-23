import { useState } from "react";
import { useLocation } from "wouter";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { 
  useListTargetSchools, 
  useCreateTargetSchool, 
  useUpdateTargetSchool, 
  useDeleteTargetSchool,
  useListProfessions,
  getListTargetSchoolsQueryKey,
  getGetDashboardSummaryQueryKey,
  TargetSchool,
  TargetSchoolStatus,
  TargetSchoolPriority
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GraduationCap, Plus, MoreVertical, Edit, Trash2, CalendarDays, ExternalLink, MapPin } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

const schoolSchema = z.object({
  schoolName: z.string().min(1, "School name is required"),
  programName: z.string().min(1, "Program name is required"),
  professionSlug: z.string().min(1, "Profession is required"),
  state: z.string().optional(),
  inState: z.boolean().default(false),
  status: z.nativeEnum(TargetSchoolStatus).default(TargetSchoolStatus.researching),
  priority: z.nativeEnum(TargetSchoolPriority).default(TargetSchoolPriority.target),
  deadline: z.string().optional().nullable(),
  appPortal: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

type SchoolFormValues = z.infer<typeof schoolSchema>;

const statusColors: Record<string, string> = {
  researching: "bg-muted text-muted-foreground",
  planning: "bg-chart-3/20 text-chart-3",
  applying: "bg-chart-2/20 text-chart-2",
  applied: "bg-chart-4/20 text-chart-4",
  interview: "bg-chart-5/20 text-chart-5",
  accepted: "bg-primary/20 text-primary",
  rejected: "bg-destructive/20 text-destructive",
};

const priorityColors: Record<string, string> = {
  reach: "border-chart-4 text-chart-4",
  target: "border-primary text-primary",
  safety: "border-chart-2 text-chart-2",
};

export default function TargetSchools() {
  const queryClient = useQueryClient();
  const [location, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  
  const selectedProfession = params.get("professionSlug") || undefined;
  const isNew = params.get("new") === "true";
  const [filterProfession, setFilterProfession] = useState<string>(selectedProfession || "all");
  
  const [isFormOpen, setIsFormOpen] = useState(isNew);
  const [editingSchool, setEditingSchool] = useState<TargetSchool | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const { data: schools, isLoading: loadingSchools } = useListTargetSchools(
    filterProfession !== "all" ? { professionSlug: filterProfession } : undefined,
    { query: { queryKey: getListTargetSchoolsQueryKey(filterProfession !== "all" ? { professionSlug: filterProfession } : undefined) } }
  );
  
  const { data: professions } = useListProfessions();
  
  const createMutation = useCreateTargetSchool();
  const updateMutation = useUpdateTargetSchool();
  const deleteMutation = useDeleteTargetSchool();

  const form = useForm<SchoolFormValues>({
    resolver: zodResolver(schoolSchema),
    defaultValues: {
      schoolName: "",
      programName: "",
      professionSlug: selectedProfession || "",
      state: "",
      inState: false,
      status: TargetSchoolStatus.researching,
      priority: TargetSchoolPriority.target,
      deadline: "",
      appPortal: "",
      notes: "",
    },
  });

  const openNewForm = () => {
    form.reset({
      schoolName: "",
      programName: "",
      professionSlug: filterProfession !== "all" ? filterProfession : (professions?.[0]?.slug || ""),
      state: "",
      inState: false,
      status: TargetSchoolStatus.researching,
      priority: TargetSchoolPriority.target,
      deadline: "",
      appPortal: "",
      notes: "",
    });
    setEditingSchool(null);
    setIsFormOpen(true);
  };

  const openEditForm = (school: TargetSchool) => {
    form.reset({
      schoolName: school.schoolName,
      programName: school.programName,
      professionSlug: school.professionSlug,
      state: school.state || "",
      inState: school.inState || false,
      status: school.status,
      priority: school.priority,
      deadline: school.deadline ? school.deadline.split('T')[0] : "",
      appPortal: school.appPortal || "",
      notes: school.notes || "",
    });
    setEditingSchool(school);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingSchool(null);
    // Remove "new" from url if present
    if (isNew) {
      const newParams = new URLSearchParams(window.location.search);
      newParams.delete("new");
      setLocation(`${location}?${newParams.toString()}`, { replace: true });
    }
  };

  const onSubmit = (data: SchoolFormValues) => {
    // Format deadline if present
    const formattedData = {
      ...data,
      deadline: data.deadline ? new Date(data.deadline).toISOString() : undefined,
      appPortal: data.appPortal ?? undefined,
      notes: data.notes ?? undefined,
    };

    if (editingSchool) {
      updateMutation.mutate(
        { id: editingSchool.id, data: formattedData },
        {
          onSuccess: () => {
            toast.success("School updated successfully");
            queryClient.invalidateQueries({ queryKey: getListTargetSchoolsQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
            closeForm();
          },
          onError: () => toast.error("Failed to update school")
        }
      );
    } else {
      createMutation.mutate(
        { data: formattedData },
        {
          onSuccess: () => {
            toast.success("School added to target list");
            queryClient.invalidateQueries({ queryKey: getListTargetSchoolsQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
            closeForm();
          },
          onError: () => toast.error("Failed to add school")
        }
      );
    }
  };

  const handleDelete = () => {
    if (!deletingId) return;
    deleteMutation.mutate(
      { id: deletingId },
      {
        onSuccess: () => {
          toast.success("School removed from list");
          queryClient.invalidateQueries({ queryKey: getListTargetSchoolsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          setDeletingId(null);
        },
        onError: () => {
          toast.error("Failed to remove school");
          setDeletingId(null);
        }
      }
    );
  };

  const handleStatusChange = (school: TargetSchool, newStatus: TargetSchoolStatus) => {
    updateMutation.mutate(
      { id: school.id, data: { status: newStatus } },
      {
        onSuccess: () => {
          toast.success(`Status updated to ${newStatus}`);
          queryClient.invalidateQueries({ queryKey: getListTargetSchoolsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        }
      }
    );
  };

  const getProfessionName = (slug: string) => {
    return professions?.find(p => p.slug === slug)?.name || slug;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground mb-2">Target Schools</h1>
          <p className="text-muted-foreground">Manage your applications, deadlines, and program priorities.</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          {professions && professions.length > 0 && (
            <Select value={filterProfession} onValueChange={setFilterProfession}>
              <SelectTrigger className="w-[180px] bg-card rounded-full border-border/60 shadow-sm">
                <SelectValue placeholder="Filter by profession" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Professions</SelectItem>
                {professions.map(p => (
                  <SelectItem key={p.slug} value={p.slug}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button onClick={openNewForm} className="rounded-full shadow-sm hover-elevate">
            <Plus className="w-4 h-4 mr-2" /> Add School
          </Button>
        </div>
      </div>

      {loadingSchools ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-64 rounded-2xl" />)}
        </div>
      ) : schools?.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="Your school list is empty"
          description={filterProfession !== "all" ? `You haven't added any schools for this profession yet.` : "Start tracking the programs you want to apply to by adding your first school."}
          action={<Button onClick={openNewForm} className="rounded-full mt-2">Add your first school</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {schools?.map((school, idx) => (
            <Card key={school.id} className="relative overflow-hidden group hover-elevate transition-all border-none shadow-sm bg-card/80 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-4 fill-mode-both" style={{ animationDelay: `${idx * 50}ms` }}>
              <div className={`absolute top-0 left-0 w-1 h-full bg-current ${priorityColors[school.priority]}`} />
              <CardContent className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="space-y-1">
                    <Badge variant="outline" className={`border ${priorityColors[school.priority]} font-semibold px-2 py-0 uppercase tracking-widest text-[10px]`}>
                      {school.priority}
                    </Badge>
                    <h3 className="font-serif text-xl font-bold leading-tight mt-2">{school.schoolName}</h3>
                    <p className="text-sm font-medium text-muted-foreground">{school.programName}</p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2 -mt-2 opacity-50 group-hover:opacity-100 transition-opacity">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => openEditForm(school)}>
                        <Edit className="w-4 h-4 mr-2" /> Edit Details
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive focus:bg-destructive/10 focus:text-destructive" onClick={() => setDeletingId(school.id)}>
                        <Trash2 className="w-4 h-4 mr-2" /> Remove School
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="space-y-3 mb-5">
                  <div className="flex items-center gap-2 text-sm">
                    <GraduationCap className="w-4 h-4 text-muted-foreground" />
                    <span>{getProfessionName(school.professionSlug)}</span>
                  </div>
                  
                  {school.state && (
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="w-4 h-4 text-muted-foreground" />
                      <span>{school.state} {school.inState ? "(In-State)" : "(Out-of-State)"}</span>
                    </div>
                  )}

                  {school.deadline && (
                    <div className="flex items-center gap-2 text-sm font-medium text-chart-4">
                      <CalendarDays className="w-4 h-4" />
                      <span>{format(new Date(school.deadline), "MMM d, yyyy")}</span>
                    </div>
                  )}
                  
                  {school.appPortal && (
                    <div className="flex items-center gap-2 text-sm">
                      <ExternalLink className="w-4 h-4 text-primary" />
                      <a href={school.appPortal.startsWith('http') ? school.appPortal : `https://${school.appPortal}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">
                        Application Portal
                      </a>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-border flex justify-between items-center">
                  <Select value={school.status} onValueChange={(val) => handleStatusChange(school, val as TargetSchoolStatus)}>
                    <SelectTrigger className={`h-8 border-none ${statusColors[school.status]} rounded-full font-medium text-xs px-3 focus:ring-0`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TargetSchoolStatus).map(([key, value]) => (
                        <SelectItem key={value} value={value} className="text-xs font-medium capitalize">
                          {key}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Form Dialog */}
      <Dialog open={isFormOpen} onOpenChange={(open) => !open && closeForm()}>
        <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">{editingSchool ? 'Edit Target School' : 'Add Target School'}</DialogTitle>
            <DialogDescription>
              {editingSchool ? 'Update the details for this program.' : 'Track a new program you want to apply to.'}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="schoolName"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>School Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. University of Washington" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="programName"
                  render={({ field }) => (
                    <FormItem className="col-span-2 md:col-span-1">
                      <FormLabel>Program Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. School of Medicine" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="professionSlug"
                  render={({ field }) => (
                    <FormItem className="col-span-2 md:col-span-1">
                      <FormLabel>Profession</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select profession" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {professions?.map(p => (
                            <SelectItem key={p.slug} value={p.slug}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>State</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. WA" {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="inState"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Residency Status</FormLabel>
                      <Select onValueChange={(val) => field.onChange(val === "true")} defaultValue={field.value ? "true" : "false"}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="true">In-State</SelectItem>
                          <SelectItem value="false">Out-of-State</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Priority</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select priority" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="reach">Reach</SelectItem>
                          <SelectItem value="target">Target</SelectItem>
                          <SelectItem value="safety">Safety</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Current Status</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.entries(TargetSchoolStatus).map(([key, value]) => (
                            <SelectItem key={value} value={value} className="capitalize">
                              {key}
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
                  name="deadline"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Application Deadline</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="appPortal"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Application Portal URL</FormLabel>
                      <FormControl>
                        <Input placeholder="https://" {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Specific requirements, contact info, why this is a good fit..." 
                          className="resize-none"
                          {...field} 
                          value={field.value || ''} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="pt-4 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={closeForm}>Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingSchool ? 'Save Changes' : 'Add School'}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deletingId}
        onOpenChange={(open) => !open && setDeletingId(null)}
        title="Remove School"
        description="Are you sure you want to remove this school from your target list? This action cannot be undone."
        onConfirm={handleDelete}
      />
    </div>
  );
}
