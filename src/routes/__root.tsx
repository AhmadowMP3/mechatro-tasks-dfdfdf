import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet, createRootRouteWithContext, useRouter,
  HeadContent, Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AppProvider, useApp } from "@/lib/app-context";
import { AppShell } from "@/components/layout/AppShell";
import { CustomCursor } from "@/components/CustomCursor";


function NotFoundComponent() {
  return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "var(--background)", color: "var(--foreground)" }}>
      <div style={{ textAlign: "center", maxWidth: 480 }}>
        <h1 style={{ fontSize: 72, margin: 0 }}>404</h1>
        <p style={{ color: "var(--muted-foreground)" }}>The page you're looking for doesn't exist.</p>
        <a href="/" style={{ display: "inline-block", marginTop: 20, padding: "12px 24px", borderRadius: 12, background: "var(--grad-blue)", color: "#fff", fontWeight: 700, textDecoration: "none" }}>Go home</a>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => { reportLovableError(error, { boundary: "root" }); console.error(error); }, [error]);
  return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "var(--background)", color: "var(--foreground)" }}>
      <div style={{ textAlign: "center", maxWidth: 480 }}>
        <h2>Something went wrong</h2>
        <p style={{ color: "var(--muted-foreground)", marginBottom: 20, whiteSpace: "pre-wrap" }}>{error.message}</p>
        <button onClick={() => { router.invalidate(); reset(); }} style={{ padding: "12px 24px", borderRadius: 12, background: "var(--grad-blue)", color: "#fff", fontWeight: 700, border: "none", cursor: "pointer" }}>Try again</button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "مهام ميكاترو · Mechatro Tasks" },
      { name: "description", content: "Mechatro internal project & task management. Bilingual Arabic/English." },
      { property: "og:title", content: "مهام ميكاترو · Mechatro Tasks" },
      { property: "og:description", content: "Mechatro internal project & task management. Bilingual Arabic/English." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "مهام ميكاترو · Mechatro Tasks" },
      { name: "twitter:description", content: "Mechatro internal project & task management. Bilingual Arabic/English." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/8e73a035-4da6-4dfd-b466-4e948483a0ac/id-preview-8a71f385--70935899-f801-4b02-9f3a-e174fc26093c.lovable.app-1783010802933.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/8e73a035-4da6-4dfd-b466-4e948483a0ac/id-preview-8a71f385--70935899-f801-4b02-9f3a-e174fc26093c.lovable.app-1783010802933.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&family=Almarai:wght@400;700;800&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className="dark">
      <head><HeadContent /></head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AppProvider>
        <Outlet />
        <CustomCursor />
        <Toaster position="top-center" richColors />
      </AppProvider>

    </QueryClientProvider>
  );
}
