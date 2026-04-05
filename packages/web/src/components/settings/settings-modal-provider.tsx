"use client";

import dynamic from "next/dynamic";

const SettingsModal = dynamic(
  () => import("./settings-modal").then((m) => ({ default: m.SettingsModal })),
  { ssr: false },
);

export function SettingsModalProvider() {
  return <SettingsModal />;
}
