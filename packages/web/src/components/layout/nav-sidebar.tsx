"use client";

import { useRef, useEffect } from "react";
import { Z } from "@/lib/z-index";
import { useUiStore } from "@/lib/stores/ui-store";
import { PanelsContent } from "./sidebar/panels-content";
import { AIContent } from "./sidebar/ai-content";
import { LayoutContent } from "./sidebar/layout-content";

export function NavSidebar() {
  const activeNavMenu = useUiStore((s) => s.activeNavMenu);
  const setActiveNavMenu = useUiStore((s) => s.setActiveNavMenu);
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeNavMenu) return;
    const handler = (e: MouseEvent) => {
      if (layerRef.current && !layerRef.current.contains(e.target as Node)) {
        const target = e.target as HTMLElement;
        if (target.closest("[data-nav-trigger]")) return;
        setActiveNavMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [activeNavMenu, setActiveNavMenu]);

  if (!activeNavMenu) return null;

  return (
    <div
      ref={layerRef}
      style={{
        position: "fixed",
        top: "50%",
        transform: "translateY(-50%)",
        left: 92,
        zIndex: Z.sidebar,
        animation: "navSidebarSlideIn 200ms ease-out",
      }}
      key={activeNavMenu}
    >
      {activeNavMenu === "panels" && <PanelsContent />}
      {activeNavMenu === "ai" && <AIContent />}
      {activeNavMenu === "layout" && <LayoutContent />}
    </div>
  );
}
