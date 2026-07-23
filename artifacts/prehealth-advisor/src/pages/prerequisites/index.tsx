import { useState } from "react";
import { useLocation } from "wouter";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { 
  useListPrereqCourses, 
  useCreatePrereqCourse, 
  useUpdatePrereqCourse, 
  useDeletePrereqCourse,
  useListProfessions,
  getListPrereqCoursesQueryKey,
  getGetDashboardSummaryQueryKey,
  PrereqCourse,
  PrereqCourseStatus
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookOpenCheck, Plus, MoreVertical, Edit, Trash2, CheckCircle2, CircleDashed, Circle } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

const prereqSchema = z.object({
  professionSlug: z.string().min(1, "Profession is required"),
  name: z.string().min(1, "Course name is required"),
  category: z.string().optional(),
  status: z.nativeEnum(PrereqCourseStatus).default(PrereqCourseStatus.not_started),
  grade: z.string().optional().nullable(),
  credits: z.coerce.number().optional().nullable(),
  notes: z.string().optional().nullable(),
});

type PrereqFormValues = z.infer<typeof prereqSchema>;

const statusIcons = {
  [PrereqCourseStatus.completed]: <CheckCircle2 className="w-5 h-5 text-primary" />,
  [PrereqCourseStatus.in_progress]: <CircleDashed className="w-5 h-5 text-secondary" />,
  [PrereqCourseStatus.not_started]: <Circle className="w-5 h-5 text-muted-foreground" />,
};

const predefinedCategories = [
  "Biology", "Chemistry", "Physics", "Math/Statistics", "English/Writing", "Social Sciences", "Other"
];

export default function Prerequisites() {
  const queryClient = useQueryClient();
  const [location, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  
  const selectedProfession = params.get("professionSlug") || undefined;
  const isNew = params.get("new") === "true";
  const [filterProfession, setFilterProfession] = useState<string>(selectedProfession || "all");
  
  const [isFormOpen, setIsFormOpen] = useState(isNew);
  const [editingCourse, setEditingCourse] = useState<PrereqCourse | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const { data: courses, isLoading: loadingCourses } = useListPrereqCourses(
    filterProfession !== "all" ? { professionSlug: filterProfession } : undefined,
    { query: { queryKey: getListPrereqCoursesQueryKey(filterProfession !== "all" ? { professionSlug: filterProfession } : undefined) } }
  );
  
  const { data: professions } = useListProfessions();
  
  const createMutation = useCreatePrereqCourse();
  const updateMutation = useUpdatePrereqCourse();
  const deleteMutation = useDeletePrereqCourse();

  const form = useForm<PrereqFormValues>({
    resolver: zodResolver(prereqSchema),
    defaultValues: {
      professionSlug: selectedProfession || "",
      name: "",
      category: "",
      status: PrereqCourseStatus.not_started,
      grade: "",
      credits: null,
      notes: "",
    },
  });

  const openNewForm = () => {
    form.reset({
      professionSlug: filterProfession !== "all" ? filterProfession : (professions?.[0]?.slug || ""),
      name: "",
      category: "",
      status: PrereqCourseStatus.not_started,
      grade: "",
      credits: null,
      notes: "",
    });
    setEditingCourse(null);
    setIsFormOpen(true);
  };

  const openEditForm = (course: PrereqCourse) => {
    form.reset({
      professionSlug: course.professionSlug,
      name: course.name,
      category: course.category || "",
      status: course.status,
      grade: course.grade || "",
      credits: course.credits,
      notes: course.notes || "",
    });
    setEditingCourse(course);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingCourse(null);
    if (isNew) {
      const newParams = new URLSearchParams(window.location.search);
      newParams.delete("new");
      setLocation(`${location}?${newParams.toString()}`, { replace: true });
    }
  };

  const onSubmit = (data: PrereqFormValues) => {
    // Strip null values — API input types use undefined, not null
    const cleanedData = {
      ...data,
      grade: data.grade ?? undefined,
      notes: data.notes ?? undefined,
      credits: data.credits ?? undefined,
    };
    if (editingCourse) {
      updateMutation.mutate(
        { id: editingCourse.id, data: cleanedData },
        {
          onSuccess: () => {
            toast.success("Course updated successfully");
            queryClient.invalidateQueries({ queryKey: getListPrereqCoursesQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
            closeForm();
          },
          onError: () => toast.error("Failed to update course")
        }
      );
    } else {
      createMutation.mutate(
        { data: cleanedData },
        {
          onSuccess: () => {
            toast.success("Course added to tracker");
            queryClient.invalidateQueries({ queryKey: getListPrereqCoursesQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
            closeForm();
          },
          onError: () => toast.error("Failed to add course")
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
          toast.success("Course removed from tracker");
          queryClient.invalidateQueries({ queryKey: getListPrereqCoursesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          setDeletingId(null);
        },
        onError: () => {
          toast.error("Failed to remove course");
          setDeletingId(null);
        }
      }
    );
  };

  const handleStatusChange = (course: PrereqCourse, newStatus: PrereqCourseStatus) => {
    updateMutation.mutate(
      { id: course.id, data: { status: newStatus } },
      {
        onSuccess: () => {
          toast.success("Status updated");
          queryClient.invalidateQueries({ queryKey: getListPrereqCoursesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        }
      }
    );
  };

  // Group courses by category for display
  const coursesByCategory = courses?.reduce((acc, course) => {
    const cat = course.category || "Uncategorized";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(course);
    return acc;
  }, {} as Record<string, PrereqCourse[]>) || {};

  const totalCourses = courses?.length || 0;
  const completedCourses = courses?.filter(c => c.status === PrereqCourseStatus.completed).length || 0;
  const progressPercent = totalCourses > 0 ? Math.round((completedCourses / totalCourses) * 100) : 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-4">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground mb-2">Prerequisite Tracker</h1>
          <p className="text-muted-foreground">Map out the courses you need for your chosen path.</p>
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
            <Plus className="w-4 h-4 mr-2" /> Add Course
          </Button>
        </div>
      </div>

      {totalCourses > 0 && !loadingCourses && (
        <Card className="bg-card/50 backdrop-blur-sm border-none shadow-sm mb-8 overflow-hidden">
          <CardContent className="p-6">
            <div className="flex justify-between text-sm mb-3">
              <span className="font-serif font-medium text-lg">Overall Progress</span>
              <span className="font-bold text-lg text-primary">{progressPercent}%</span>
            </div>
            <Progress value={progressPercent} className="h-3 bg-muted" />
            <p className="text-sm text-muted-foreground mt-3">
              {completedCourses} of {totalCourses} required courses completed
            </p>
          </CardContent>
        </Card>
      )}

      {loadingCourses ? (
        <div className="space-y-8">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      ) : totalCourses === 0 ? (
        <EmptyState
          icon={BookOpenCheck}
          title="No prerequisites tracked"
          description={filterProfession !== "all" ? `You haven't tracked any courses for this profession yet.` : "Start planning your academic journey by adding required courses."}
          action={<Button onClick={openNewForm} className="rounded-full mt-2">Add your first course</Button>}
        />
      ) : (
        <div className="space-y-8">
          {Object.entries(coursesByCategory).sort().map(([category, catCourses], sectionIdx) => (
            <div key={category} className="animate-in fade-in slide-in-from-bottom-4 fill-mode-both" style={{ animationDelay: `${sectionIdx * 100}ms` }}>
              <h2 className="text-xl font-serif font-bold text-foreground mb-4 pl-2 border-l-4 border-primary/40">{category}</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {catCourses.map((course, idx) => (
                  <Card key={course.id} className="group hover-elevate transition-all border-none shadow-sm bg-card/80 backdrop-blur-sm">
                    <CardContent className="p-4 sm:p-5 flex items-start gap-4">
                      <div className="mt-1 cursor-pointer">
                        <DropdownMenu>
                          <DropdownMenuTrigger className="outline-none focus:ring-0">
                            {statusIcons[course.status]}
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            <DropdownMenuItem onClick={() => handleStatusChange(course, PrereqCourseStatus.not_started)}>
                              <Circle className="w-4 h-4 mr-2" /> Mark Not Started
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleStatusChange(course, PrereqCourseStatus.in_progress)}>
                              <CircleDashed className="w-4 h-4 mr-2 text-secondary" /> Mark In Progress
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleStatusChange(course, PrereqCourseStatus.completed)}>
                              <CheckCircle2 className="w-4 h-4 mr-2 text-primary" /> Mark Completed
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-semibold text-base leading-tight truncate">{course.name}</h3>
                            <p className="text-xs text-muted-foreground mt-1">
                              {professions?.find(p => p.slug === course.professionSlug)?.name || course.professionSlug}
                            </p>
                          </div>
                          
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2 -mt-2 opacity-50 group-hover:opacity-100 transition-opacity">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEditForm(course)}>
                                <Edit className="w-4 h-4 mr-2" /> Edit Details
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive focus:bg-destructive/10 focus:text-destructive" onClick={() => setDeletingId(course.id)}>
                                <Trash2 className="w-4 h-4 mr-2" /> Delete Course
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3">
                          {course.credits && (
                            <span className="text-xs font-medium bg-muted px-2 py-0.5 rounded-md">
                              {course.credits} Credits
                            </span>
                          )}
                          {course.grade && (
                            <span className="text-xs font-bold text-foreground bg-primary/10 px-2 py-0.5 rounded-md border border-primary/20">
                              Grade: {course.grade}
                            </span>
                          )}
                        </div>
                        
                        {course.notes && (
                          <p className="text-sm text-muted-foreground mt-3 bg-muted/50 p-2.5 rounded-lg italic">
                            {course.notes}
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form Dialog */}
      <Dialog open={isFormOpen} onOpenChange={(open) => !open && closeForm()}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">{editingCourse ? 'Edit Course' : 'Add Prerequisite'}</DialogTitle>
            <DialogDescription>
              {editingCourse ? 'Update the details for this course.' : 'Add a required course to your planner.'}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
              <FormField
                control={form.control}
                name="professionSlug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Required For</FormLabel>
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

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Course Name & Number</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. BIOL 101, Gen Chem I" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Subject Category</FormLabel>
                      <div className="flex flex-col gap-2">
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {predefinedCategories.map(cat => (
                              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input 
                          placeholder="Or type custom category..." 
                          value={field.value || ""} 
                          onChange={field.onChange}
                          className="h-8 text-xs"
                        />
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={PrereqCourseStatus.not_started}>Not Started</SelectItem>
                          <SelectItem value={PrereqCourseStatus.in_progress}>In Progress</SelectItem>
                          <SelectItem value={PrereqCourseStatus.completed}>Completed</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="credits"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Credits</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="e.g. 4" {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="grade"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Grade</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. A, 4.0" {...field} value={field.value || ''} />
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
                      <FormLabel>Notes (Optional)</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Lab required, taken at community college..." 
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
                  {editingCourse ? 'Save Changes' : 'Add Course'}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deletingId}
        onOpenChange={(open) => !open && setDeletingId(null)}
        title="Delete Course"
        description="Are you sure you want to remove this course from your planner? This action cannot be undone."
        onConfirm={handleDelete}
      />
    </div>
  );
}
