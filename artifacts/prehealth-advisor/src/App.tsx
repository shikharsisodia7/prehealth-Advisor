import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { Toaster } from 'sonner';

import { AppShell } from '@/components/layout/AppShell';
import Dashboard from '@/pages/dashboard';
import ProfessionsList from '@/pages/professions/index';
import ProfessionDetail from '@/pages/professions/detail';
import TargetSchools from '@/pages/schools/index';
import Prerequisites from '@/pages/prerequisites/index';
import ProgramPlanner from '@/pages/planner/index';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function Router() {
  return (
    <AppShell>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/professions" component={ProfessionsList} />
        <Route path="/professions/:slug" component={ProfessionDetail} />
        <Route path="/schools" component={TargetSchools} />
        <Route path="/prerequisites" component={Prerequisites} />
        <Route path="/planner" component={ProgramPlanner} />
        <Route component={NotFound} />
      </Switch>
    </AppShell>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Router />
      </WouterRouter>
      <Toaster position="bottom-right" theme="light" />
    </QueryClientProvider>
  );
}

export default App;
