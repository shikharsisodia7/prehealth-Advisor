import * as React from "react"
import { ClipboardList } from "lucide-react"

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      {/* Top header bar — simple, no navigation links */}
      <header className="sticky top-0 z-10 bg-card border-b border-border shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-primary shrink-0" aria-hidden="true" />
          <span className="font-serif font-bold text-lg text-primary tracking-tight leading-tight">
            Health Professions Program Planner
          </span>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-x-hidden">
        <div className="max-w-4xl mx-auto p-4 md:p-8">
          {children}
        </div>
      </main>
    </div>
  )
}
