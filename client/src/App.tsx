import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import LeadInvite from "@/pages/lead-invite";

// wouter's stock useHashLocation reports the raw hash fragment as the
// "path", query string and all (e.g. "/lead-invite?email=..&cluster=.."),
// which never matches a plain <Route path="/lead-invite">. Strip the query
// before handing the location to wouter's matcher; pages that need the
// query params (lead-invite.tsx) read them straight off window.location.hash.
function useHashLocationNoQuery(): ReturnType<typeof useHashLocation> {
  const [location, navigate] = useHashLocation();
  return [location.split("?")[0], navigate];
}

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/lead-invite">{() => <LeadInvite />}</Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router hook={useHashLocationNoQuery}>
          <AppRouter />
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
