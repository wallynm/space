import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  createHashHistory,
  RouterProvider,
  Outlet,
} from "@tanstack/react-router";
import { WorkspaceProvider } from "./workspace";
import { Shell, Dashboard, History, Settings, Floating } from "./screens";
import {
  Explorer,
  Projects,
  Applications,
  Docker,
  System,
} from "./tool-screens";
import { ToolsProvider } from "./tools-context";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "./styles.css";
const root = createRootRoute({ component: () => <Outlet /> });
const shell = createRoute({
  getParentRoute: () => root,
  id: "app",
  component: Shell,
});
const dashboard = createRoute({
  getParentRoute: () => shell,
  path: "/",
  component: Dashboard,
});
const history = createRoute({
  getParentRoute: () => shell,
  path: "/history",
  component: History,
});
const settings = createRoute({
  getParentRoute: () => shell,
  path: "/settings",
  component: Settings,
});
const explore = createRoute({
  getParentRoute: () => shell,
  path: "/explore",
  component: Explorer,
});
const projects = createRoute({
  getParentRoute: () => shell,
  path: "/projects",
  component: Projects,
});
const apps = createRoute({
  getParentRoute: () => shell,
  path: "/apps",
  component: Applications,
});
const docker = createRoute({
  getParentRoute: () => shell,
  path: "/docker",
  component: Docker,
});
const system = createRoute({
  getParentRoute: () => shell,
  path: "/system",
  component: System,
});
const floating = createRoute({
  getParentRoute: () => root,
  path: "/floating",
  component: Floating,
});
const router = createRouter({
  routeTree: root.addChildren([
    shell.addChildren([
      dashboard,
      explore,
      projects,
      apps,
      docker,
      system,
      history,
      settings,
    ]),
    floating,
  ]),
  history: createHashHistory(),
});
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
const client = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <WorkspaceProvider>
        <ToolsProvider>
          <RouterProvider router={router} />
        </ToolsProvider>
      </WorkspaceProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
