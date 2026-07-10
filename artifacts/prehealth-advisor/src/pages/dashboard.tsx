import { useGetDashboardSummary } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Compass, GraduationCap, BookOpenCheck, CheckCircle2, CircleDashed } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function Dashboard() {
  const { data: summary, isLoading, error } = useGetDashboardSummary();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <EmptyState
        title="Unable to load dashboard"
        description="We ran into an issue loading your progress. Please try refreshing."
      />
    );
  }

  const prereqPercent = summary.prereqTotal > 0 
    ? Math.round((summary.prereqCompleted / summary.prereqTotal) * 100) 
    : 0;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both">
      {/* Hero Welcome */}
      <section className="bg-primary/5 rounded-3xl p-8 border border-primary/10 relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <h1 className="text-3xl md:text-4xl font-serif font-bold text-foreground mb-3 tracking-tight">
            Welcome back to your journey.
          </h1>
          <p className="text-muted-foreground text-lg mb-6 leading-relaxed">
            You're currently exploring {summary.totalProfessionsExplored} profession{summary.totalProfessionsExplored !== 1 ? 's' : ''} and actively tracking {summary.totalSchools} school program{summary.totalSchools !== 1 ? 's' : ''}. Every step forward counts.
          </p>
          <div className="flex gap-4">
            <Link href="/schools">
              <Button className="rounded-full shadow-sm hover-elevate">Update Schools</Button>
            </Link>
            <Link href="/professions">
              <Button variant="outline" className="rounded-full bg-transparent border-primary/20 hover:bg-primary/10 text-primary hover-elevate">
                Explore Paths
              </Button>
            </Link>
          </div>
        </div>
        <Compass className="absolute -right-10 -bottom-10 w-64 h-64 text-primary/5 -rotate-12 pointer-events-none" />
      </section>

      {/* Stats Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="hover-elevate transition-all border-none shadow-md bg-card/50 backdrop-blur-sm" style={{ animationDelay: '50ms' }}>
          <CardHeader className="pb-2">
            <CardDescription className="font-medium flex items-center gap-2">
              <Compass className="w-4 h-4 text-secondary-foreground" />
              Professions
            </CardDescription>
            <CardTitle className="text-4xl font-serif">{summary.totalProfessionsExplored}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Paths currently being explored</p>
          </CardContent>
        </Card>

        <Card className="hover-elevate transition-all border-none shadow-md bg-card/50 backdrop-blur-sm" style={{ animationDelay: '100ms' }}>
          <CardHeader className="pb-2">
            <CardDescription className="font-medium flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-primary" />
              Target Schools
            </CardDescription>
            <CardTitle className="text-4xl font-serif">{summary.totalSchools}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Programs on your radar</p>
            {summary.statusCounts.length > 0 && (
              <div className="mt-3 space-y-1">
                {summary.statusCounts.map(st => (
                  <div key={st.status} className="flex justify-between items-center text-xs">
                    <span className="capitalize text-muted-foreground">{st.status}</span>
                    <span className="font-medium px-2 py-0.5 bg-muted rounded-full">{st.count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="hover-elevate transition-all border-none shadow-md bg-card/50 backdrop-blur-sm" style={{ animationDelay: '150ms' }}>
          <CardHeader className="pb-2">
            <CardDescription className="font-medium flex items-center gap-2">
              <BookOpenCheck className="w-4 h-4 text-chart-4" />
              Prerequisites
            </CardDescription>
            <CardTitle className="text-4xl font-serif">{summary.prereqTotal}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">Completion</span>
              <span className="font-medium text-foreground">{prereqPercent}%</span>
            </div>
            <Progress value={prereqPercent} className="h-2 mb-4" />
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-1.5 bg-primary/10 text-primary px-2 py-1.5 rounded-md font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {summary.prereqCompleted} Done
              </div>
              <div className="flex items-center gap-1.5 bg-secondary/20 text-secondary-foreground px-2 py-1.5 rounded-md font-medium">
                <CircleDashed className="w-3.5 h-3.5" />
                {summary.prereqInProgress} In Progress
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Breakdown Area */}
      {summary.professionCounts.length > 0 && (
        <section className="animate-in fade-in duration-500 fill-mode-both" style={{ animationDelay: '200ms' }}>
          <h2 className="text-xl font-serif font-semibold mb-4 text-foreground">Programs by Profession</h2>
          <div className="flex flex-wrap gap-3">
            {summary.professionCounts.map((pc, i) => (
              <div key={pc.professionSlug} className="bg-card border border-border px-4 py-3 rounded-2xl flex items-center gap-3 shadow-sm hover-elevate transition-all" style={{ animationDelay: `${250 + i * 50}ms` }}>
                <div className="font-medium text-foreground">{pc.professionName}</div>
                <div className="bg-muted text-muted-foreground px-2 py-0.5 rounded-full text-xs font-semibold">{pc.count} schools</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
