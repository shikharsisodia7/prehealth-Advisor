import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchX } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <AppShell>
      <div className="flex flex-col items-center justify-center min-h-[60vh] animate-in fade-in zoom-in duration-500">
        <EmptyState
          icon={SearchX}
          title="Page not found"
          description="We couldn't find the page you were looking for. It might have been moved or deleted."
          action={
            <Link href="/" className="inline-block mt-4">
              <Button>Return to Dashboard</Button>
            </Link>
          }
        />
      </div>
    </AppShell>
  );
}
