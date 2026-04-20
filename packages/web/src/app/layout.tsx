import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";
import { CommandPaletteProvider } from "@/components/layout/command-palette-provider";
import { SettingsModalProvider } from "@/components/settings/settings-modal-provider";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { AuthGuard } from "@/components/auth/auth-guard";
import { ThemeSync } from "@/components/layout/theme-sync";
import { MagicRingMount } from "@/components/ring/magic-ring-mount";
import { ScheduleModal } from "@/components/schedule/schedule-modal";
import { UpdateBanner } from "@/components/update-banner";
import { LicenseProvider } from "@/components/license-provider";
import { AnalyticsMount } from "@/components/analytics-mount";

export const metadata: Metadata = {
  title: "Companion",
  description: "Autonomous Agent Platform",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Script to restore theme before React hydrates — prevents flash
const themeScript = `
(function() {
  try {
    var theme = localStorage.getItem('theme');
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    }
    var tid = localStorage.getItem('companion_theme_id');
    if (tid && tid !== 'default') {
      document.documentElement.dataset.themeId = tid;
    }
  } catch(e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ErrorBoundary>
          <AuthGuard>
            <CommandPaletteProvider />
            <SettingsModalProvider />
            <ThemeSync />
            {children}
            <MagicRingMount />
            <ScheduleModal />
            <UpdateBanner />
            <LicenseProvider />
            <AnalyticsMount />
          </AuthGuard>
        </ErrorBoundary>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "var(--color-bg-card)",
              color: "var(--color-text-primary)",
              border: "1px solid var(--color-border)",
            },
          }}
        />
      </body>
    </html>
  );
}
