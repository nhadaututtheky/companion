"use client";
import { useState, useEffect, useCallback } from "react";
import { BUILT_IN_PERSONAS, type Persona } from "@companion/shared";
import { api } from "@/lib/api-client";

/**
 * Hook that provides all personas (built-in + custom) for pickers.
 * Fetches custom personas from API on mount.
 */
export function usePersonas() {
  const [custom, setCustom] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api.customPersonas.list();
      setCustom(res.data);
    } catch {
      // Custom personas unavailable — show built-in only
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    builtIn: BUILT_IN_PERSONAS,
    custom,
    all: [...custom, ...BUILT_IN_PERSONAS],
    loading,
    refresh,
  };
}
