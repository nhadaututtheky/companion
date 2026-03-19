import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";
import { CommandPaletteProvider } from "@/components/layout/command-palette-provider";

export const metadata: Metadata = {
  title: "Companion",
  description: "Autonomous Agent Platform",
};

// Script to restore theme before React hydrates — prevents flash
const themeScript = `
(function() {
  try {
    var theme = localStorage.getItem('theme');
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
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
        <CommandPaletteProvider />
        {children}
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
