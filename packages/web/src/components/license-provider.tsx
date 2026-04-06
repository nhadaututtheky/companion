"use client";

import { useEffect } from "react";
import { useLicenseStore } from "@/lib/stores/license-store";
import { UpgradeModal } from "@/components/upgrade-modal";

/** Mounts at app root — fetches license once, renders upgrade modal globally */
export function LicenseProvider() {
  const fetch = useLicenseStore((s) => s.fetch);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return <UpgradeModal />;
}
