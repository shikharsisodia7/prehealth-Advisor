import { useState } from "react";
import { useListProfessions } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Link } from "wouter";
import { Compass, GraduationCap, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ProfessionsList() {
  const { data: professions, isLoading, error } = useListProfessions();
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex gap-2">
          <Skeleton className="h-8 w-20 rounded-full" />
          <Skeleton className="h-8 w-24 rounded-full" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !professions) {
    return (
      <EmptyState
        title="Professions Unavailable"
        description="We couldn't load the list of health professions right now. Please try again later."
      />
    );
  }

  const categories = ["All", ...Array.from(new Set(professions.map(p => p.category)))].sort();
  const filteredProfessions = selectedCategory === "All" 
    ? professions 
    : professions.filter(p => p.category === selectedCategory);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground mb-3 tracking-tight">Explore Professions</h1>
        <p className="text-muted-foreground max-w-2xl leading-relaxed">
          Discover the wide variety of paths in healthcare. Whether you want to be directly involved in patient care, diagnostics, or research, there's a field for you.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={cn(
              "px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selectedCategory === cat 
                ? "bg-primary text-primary-foreground shadow-sm" 
                : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {filteredProfessions.length === 0 ? (
        <EmptyState
          icon={Compass}
          title="No professions found"
          description={`We couldn't find any professions in the "${selectedCategory}" category.`}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProfessions.map((profession, idx) => (
            <Link 
              key={profession.id} 
              href={`/professions/${profession.slug}`}
              className="block outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-2xl group animate-in fade-in slide-in-from-bottom-4 fill-mode-both"
              style={{ animationDelay: `${idx * 50}ms` }}
            >
              <Card className="h-full flex flex-col hover-elevate transition-all border-none shadow-md bg-card/60 backdrop-blur-sm group-hover:bg-card">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start mb-2">
                    <Badge variant="secondary" className="bg-secondary/20 text-secondary-foreground">
                      {profession.category}
                    </Badge>
                  </div>
                  <CardTitle className="font-serif text-2xl group-hover:text-primary transition-colors">
                    {profession.name}
                  </CardTitle>
                  <CardDescription className="text-sm font-medium text-foreground/80 mt-1">
                    {profession.tagline}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-end">
                  <div className="space-y-2 mt-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <GraduationCap className="w-4 h-4 text-primary/70" />
                      <span>{profession.degree}</span>
                    </div>
                    {profession.typicalTimeline && (
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-primary/70" />
                        <span>{profession.typicalTimeline}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
