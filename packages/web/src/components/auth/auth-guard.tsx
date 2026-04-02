"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

const PUBLIC_PATHS = ["/login"];
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

    async function checkAuth() {
      // Check if server requires API key
      let serverNeedsKey = true;
      try {
        const res = await fetch(`${BASE}/api/setup-status`);
        if (res.ok) {
          const data = await res.json();
          serverNeedsKey = data.hasApiKey === true;
        }
      } catch {
        // Server unreachable — fall through to login
      }

      if (isPublic) {
        const key = localStorage.getItem("api_key");
        // If server doesn't need key OR already has one, go to dashboard
        if (!serverNeedsKey || key) {
          if (!serverNeedsKey) {
            // Mark as "no auth needed" so api-client doesn't send empty key
            localStorage.setItem("api_key", "__no_auth__");
          }
          router.replace("/");
          return;
        }
        setChecked(true);
        return;
      }

      // Protected route
      if (!serverNeedsKey) {
        // Server doesn't require auth — allow access
        localStorage.setItem("api_key", "__no_auth__");
        setChecked(true);
        return;
      }

      const key = localStorage.getItem("api_key");
      if (!key || key === "__no_auth__") {
        router.replace("/login");
        return;
      }

      setChecked(true);
    }

    checkAuth();
  }, [pathname, router]);

  // Prevent flash of content before redirect
  if (!checked) {
    return null;
  }

  return <>{children}</>;
}
