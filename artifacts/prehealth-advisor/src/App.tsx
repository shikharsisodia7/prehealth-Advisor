import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, Router as WouterRouter, Redirect, useLocation } from 'wouter';
import { Toaster } from 'sonner';
import { ClerkProvider, Show } from '@clerk/react';

import { AppShell } from '@/components/layout/AppShell';
import Dashboard from '@/pages/dashboard';
import ProfessionsList from '@/pages/professions/index';
import ProfessionDetail from '@/pages/professions/detail';
import TargetSchools from '@/pages/schools/index';
import Prerequisites from '@/pages/prerequisites/index';
import ProgramPlanner from '@/pages/planner/index';
import ManualSearch from '@/pages/manual-search/index';
import NotFound from '@/pages/not-found';
import { SignInPage, SignUpPage } from '@/pages/auth';
import { buildSignInUrl } from '@/lib/redirect';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY');
}

const clerkAppearance = {
  variables: {
    colorPrimary: '#4c7f66',
    colorBackground: '#fbfaf8',
    borderRadius: '0.75rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'w-full max-w-full',
  },
};

// Every planner/manual-search/etc. page is gated behind sign-in. A
// signed-out visitor is bounced to /sign-in with the page they were
// trying to reach preserved as ?redirect_url= (validated as an internal
// path in redirect.ts) so they land back where they started once signed
// in, instead of always dropping onto the app root.
function Protected({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return (
    <>
      <Show when="signed-in">
        <AppShell>{children}</AppShell>
      </Show>
      <Show when="signed-out">
        <Redirect to={buildSignInUrl(basePath, location)} />
      </Show>
    </>
  );
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route path="/">
        <Protected>
          <ProgramPlanner />
        </Protected>
      </Route>
      <Route path="/manual-search">
        <Protected>
          <ManualSearch />
        </Protected>
      </Route>
      <Route path="/dashboard">
        <Protected>
          <Dashboard />
        </Protected>
      </Route>
      <Route path="/professions">
        <Protected>
          <ProfessionsList />
        </Protected>
      </Route>
      <Route path="/professions/:slug">
        <Protected>
          <ProfessionDetail />
        </Protected>
      </Route>
      <Route path="/schools">
        <Protected>
          <TargetSchools />
        </Protected>
      </Route>
      <Route path="/prerequisites">
        <Protected>
          <Prerequisites />
        </Protected>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function ClerkRouterBridge() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      afterSignOutUrl={`${basePath}/sign-in`}
      routerPush={(to) => setLocation(to)}
      routerReplace={(to) => setLocation(to, { replace: true })}
    >
      <AppRoutes />
    </ClerkProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={basePath}>
        <ClerkRouterBridge />
      </WouterRouter>
      <Toaster position="bottom-right" theme="light" />
    </QueryClientProvider>
  );
}

export default App;
