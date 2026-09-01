import { useEffect, useMemo } from "react";
import { Link } from "wouter";
import { ExternalLink, ArrowLeft, MapPin, Compass } from "lucide-react";

import { useListProfessions } from "@workspace/api-client-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Backup path for students who want to browse official program directories
 * directly — because a program isn't in the planner yet, or because a
 * school doesn't publicly list every prerequisite course. The automated
 * planner ("/") stays the default, recommended workflow; this page is
 * intentionally plainer and never linked as if it were an alternative
 * front door.
 */
export default function ManualSearch() {
  const { data: professions, isLoading, error } = useListProfessions();

  const highlightedSlug = useMemo(
    () => new URLSearchParams(window.location.search).get("profession") ?? undefined,
    [],
  );

  useEffect(() => {
    if (!highlightedSlug) return;
    const el = document.getElementById(`profession-${highlightedSlug}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [highlightedSlug, professions]);

  return (
    <div className="space-y-6 pb-16">
      <div>
        <Link href="/">
          <Button variant="ghost" size="sm" className="pl-0 -ml-1 mb-3 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Back to the planner
          </Button>
        </Link>

        <h1 className="font-serif text-2xl md:text-3xl font-bold text-foreground mb-2 leading-tight flex items-center gap-2">
          <Compass className="w-6 h-6 text-primary" aria-hidden="true" />
          Search Programs Manually
        </h1>
        <p className="text-muted-foreground text-sm max-w-2xl leading-relaxed">
          Use these official professional-school directories to search
          programs directly. This can help if a program isn't in the planner
          yet, or if a school doesn't publicly list every prerequisite
          course — the planner's automated comparison is still the
          recommended starting point.
        </p>
      </div>

      <Card className="bg-muted/30 border-border/60">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-2.5">
            <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div className="text-sm text-muted-foreground leading-relaxed">
              <span className="font-medium text-foreground">
                Building your list of programs to apply to:{" "}
              </span>
              Start with programs in your state of legal residence, then
              identify roughly 5–10 programs you're seriously considering.
              Research each one's school-specific prerequisites directly — a
              profession-wide course list does not cover every program's
              individual requirements.
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-md" />
          ))}
        </div>
      ) : error || !professions ? (
        <EmptyState
          title="Directories unavailable"
          description="We couldn't load the list of official program directories right now. Please try again later."
        />
      ) : (
        <div className="space-y-4">
          {professions.map((profession) => {
            const resources = profession.resources.filter((r) => r.url);
            if (resources.length === 0) return null;
            return (
              <Card
                key={profession.slug}
                id={`profession-${profession.slug}`}
                className={
                  highlightedSlug === profession.slug
                    ? "border-primary/50 ring-1 ring-primary/30"
                    : undefined
                }
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{profession.name}</CardTitle>
                  <CardDescription>{profession.tagline}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {resources.map((res, i) => (
                      <li key={i} className="text-sm">
                        <a
                          href={res.url!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-start gap-1.5 font-medium text-primary hover:underline focus:outline-none focus:underline"
                        >
                          <ExternalLink className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                          <span>
                            {res.label}
                            <span className="sr-only"> (opens in a new tab)</span>
                          </span>
                        </a>
                        {res.note && (
                          <p className="text-muted-foreground text-xs mt-0.5 ml-5">{res.note}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
