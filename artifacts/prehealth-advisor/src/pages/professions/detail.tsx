import { useParams, Link } from "wouter";
import { useGetProfession, getGetProfessionQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ArrowLeft, GraduationCap, Clock, ExternalLink, Library, BookOpenCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function ProfessionDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { data: profession, isLoading, error } = useGetProfession(slug || "", {
    query: {
      queryKey: getGetProfessionQueryKey(slug || ""),
      enabled: !!slug,
    }
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-32 mb-6" />
        <Skeleton className="h-40 w-full rounded-3xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="md:col-span-2 h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error || !profession) {
    return (
      <div className="space-y-6">
        <Link href="/professions">
          <Button variant="ghost" className="pl-0 hover:bg-transparent hover:text-primary">
            <ArrowLeft className="mr-2 w-4 h-4" /> Back to Professions
          </Button>
        </Link>
        <EmptyState
          title="Profession not found"
          description="We couldn't load the details for this profession. It may not exist."
        />
      </div>
    );
  }

  const directoryResources = profession.resources.filter(r => r.kind === "directory");
  const prereqResources = profession.resources.filter(r => r.kind === "prerequisites");

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      <Link href="/professions">
        <Button variant="ghost" className="pl-0 hover:bg-transparent hover:text-primary text-muted-foreground">
          <ArrowLeft className="mr-2 w-4 h-4" /> Back to Professions
        </Button>
      </Link>

      {/* Hero */}
      <div className="bg-card border-none shadow-md rounded-3xl p-8 md:p-10">
        <Badge variant="secondary" className="mb-4 bg-secondary/20 text-secondary-foreground hover:bg-secondary/30">
          {profession.category}
        </Badge>
        <h1 className="text-4xl md:text-5xl font-serif font-bold text-foreground mb-4 tracking-tight">
          {profession.name}
        </h1>
        <p className="text-xl text-muted-foreground font-medium mb-8 max-w-3xl">
          {profession.tagline}
        </p>
        
        <div className="flex flex-wrap gap-4 md:gap-8 border-t border-border pt-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Degree</p>
              <p className="font-medium">{profession.degree}</p>
            </div>
          </div>
          
          {profession.typicalTimeline && (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-chart-2/10 flex items-center justify-center">
                <Clock className="w-5 h-5 text-chart-2" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Timeline</p>
                <p className="font-medium">{profession.typicalTimeline}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="md:col-span-2 space-y-8">
          <section>
            <h2 className="text-2xl font-serif font-bold mb-4">About the Field</h2>
            <div className="prose prose-sage max-w-none text-muted-foreground leading-relaxed">
              <p>{profession.description}</p>
            </div>
          </section>

          <div className="flex flex-wrap gap-4 pt-4 border-t border-border">
            <Link href={`/schools?professionSlug=${profession.slug}&new=true`}>
              <Button className="hover-elevate rounded-full">
                Add a Target School
              </Button>
            </Link>
            <Link href={`/prerequisites?professionSlug=${profession.slug}&new=true`}>
              <Button variant="secondary" className="hover-elevate rounded-full">
                Track a Prerequisite
              </Button>
            </Link>
          </div>
        </div>

        {/* Resources Sidebar */}
        <div className="space-y-6">
          <Card className="bg-muted/30 border-none shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-serif flex items-center gap-2">
                <Library className="w-5 h-5 text-primary" />
                Official Resources
              </CardTitle>
              <CardDescription>
                Authoritative directories and guides for {profession.name} programs.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              
              {directoryResources.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Program Directories</h4>
                  <ul className="space-y-3">
                    {directoryResources.map((res, i) => (
                      <li key={i} className="text-sm">
                        {res.url ? (
                          <a href={res.url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline flex items-start gap-1.5 group">
                            <span className="leading-tight">{res.label}</span>
                            <ExternalLink className="w-3 h-3 mt-0.5 opacity-50 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                          </a>
                        ) : (
                          <span className="font-medium">{res.label}</span>
                        )}
                        {res.note && <p className="text-muted-foreground mt-1 leading-snug">{res.note}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {prereqResources.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mt-6">Prerequisite Guides</h4>
                  <ul className="space-y-3">
                    {prereqResources.map((res, i) => (
                      <li key={i} className="text-sm">
                        {res.url ? (
                          <a href={res.url} target="_blank" rel="noopener noreferrer" className="font-medium text-chart-2 hover:underline flex items-start gap-1.5 group">
                            <span className="leading-tight">{res.label}</span>
                            <ExternalLink className="w-3 h-3 mt-0.5 opacity-50 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                          </a>
                        ) : (
                          <span className="font-medium">{res.label}</span>
                        )}
                        {res.note && <p className="text-muted-foreground mt-1 leading-snug">{res.note}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {profession.resources.length === 0 && (
                <p className="text-sm text-muted-foreground">No resources listed yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
