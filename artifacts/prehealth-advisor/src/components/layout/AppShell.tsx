import * as React from "react"
import { Link, useLocation } from "wouter"
import { LayoutDashboard, Compass, GraduationCap, BookOpenCheck } from "lucide-react"

import { cn } from "@/lib/utils"

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const [location] = useLocation()

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/professions", label: "Explore Professions", icon: Compass },
    { href: "/schools", label: "Target Schools", icon: GraduationCap },
    { href: "/prerequisites", label: "Prerequisites", icon: BookOpenCheck },
  ]

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-noise">
      {/* Mobile Topbar */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-card border-b border-border shadow-sm sticky top-0 z-10">
        <Link href="/" className="font-serif font-bold text-xl text-primary tracking-tight">
          PreHealth Advisor
        </Link>
      </header>

      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-sidebar border-r border-sidebar-border sticky top-0 h-[100dvh] z-10">
        <div className="p-6">
          <Link href="/" className="font-serif font-bold text-2xl text-sidebar-primary tracking-tight">
            PreHealth Advisor
          </Link>
          <p className="text-xs text-sidebar-foreground/70 mt-1 font-medium tracking-wide uppercase">Your path to care</p>
        </div>

        <nav className="flex-1 px-4 space-y-1 mt-4">
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href))
            return (
              <Link key={item.href} href={item.href} className="block">
                <div
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                    isActive
                      ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                >
                  <item.icon className={cn("w-5 h-5", isActive ? "text-sidebar-primary-foreground" : "text-sidebar-foreground/70")} />
                  {item.label}
                </div>
              </Link>
            )
          })}
        </nav>
        
        <div className="p-4 m-4 bg-primary/5 rounded-xl border border-primary/10">
          <p className="text-sm font-medium text-sidebar-foreground/80 mb-2">Need guidance?</p>
          <p className="text-xs text-sidebar-foreground/60 mb-3">You're making great progress. Keep taking it one step at a time.</p>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-x-hidden">
        {/* Mobile Navigation */}
        <div className="md:hidden flex overflow-x-auto p-2 bg-card border-b border-border hide-scrollbar sticky top-[61px] z-10">
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href))
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 mx-1 rounded-full text-sm font-medium whitespace-nowrap transition-all",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </div>
              </Link>
            )
          })}
        </div>

        <div className="max-w-6xl mx-auto p-4 md:p-8 animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both">
          {children}
        </div>
      </main>
    </div>
  )
}
