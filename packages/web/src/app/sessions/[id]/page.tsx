import React from "react";
import { SessionPageClient } from "./session-page-client";

// Static export with dynamic routes: setting revalidate=0 tells Next.js this
// is a dynamic (client-rendered) route that bypasses the generateStaticParams
// requirement. All routing is SPA client-side via Hono's index.html catch-all.
export const revalidate = 0;

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function SessionPage(props: PageProps) {
  return React.createElement(SessionPageClient, props);
}
