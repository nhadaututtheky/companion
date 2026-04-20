"use client";

import { useEffect } from "react";
import { initAnalytics } from "@/lib/analytics";

export function AnalyticsMount() {
  useEffect(() => {
    initAnalytics();
  }, []);
  return null;
}
