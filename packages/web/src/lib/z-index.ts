/**
 * Z-index scale — single source of truth for stacking order.
 *
 * Layers (low → high):
 *   base      → default elements, inactive tabs
 *   dropdown  → file drop zones, internal overlays
 *   sidebar   → floating nav, mobile sidebar backdrop
 *   ring      → magic ring UI (backdrop, connectors, window)
 *   statsBar  → expanded bottom stats bar
 *   popover   → dropdowns, menus, tooltips, panels
 *   expanded  → expanded session card (above popovers)
 *   modal     → standard modals (new session)
 *   settings  → settings modal (above standard modals)
 *   overlay   → major modals (schedule, template, onboarding)
 *   topModal  → top-level modals (debate, workspace, upgrade)
 *   cmdPalette → command palette (always on top)
 */
export const Z = {
  base: 1,
  tabActive: 2,
  headerBar: 10,
  dropdown: 10,
  sidebar: 40,
  ringBackdrop: 41,
  ringConnector: 42,
  ringWindow: 43,
  statsBar: 45,
  popover: 50,
  expanded: 51,
  modal: 60,
  modalContent: 61,
  settings: 70,
  settingsContent: 71,
  overlay: 100,
  overlayContent: 101,
  topModal: 200,
  commandPalette: 9999,
} as const;

export type ZLayer = keyof typeof Z;
