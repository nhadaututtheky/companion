"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

const PUBLIC_PATHS = ["/login"];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

    if (isPublic) {
      // If already has a key and visiting /login, redirect home
      const key = localStorage.getItem("api_key");
      if (key) {
        router.replace("/");
        return;
      }
      setChecked(true);
      return;
    }

    // Protected route — check for key
    const key = localStorage.getItem("api_key");
    if (!key) {
      router.replace("/login");
      return;
    }

    setChecked(true);
  }, [pathname, router]);

  // Prevent flash of content before redirect
  if (!checked) {
    return null;
  }

  return <>{children}</>;
}
