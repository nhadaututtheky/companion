import React from "react";
import { SpectatePageClient } from "./spectate-page-client";

// Static export with dynamic routes: setting revalidate=0 tells Next.js this
// is a dynamic (client-rendered) route that bypasses the generateStaticParams
// requirement. All routing is SPA client-side via Hono's index.html catch-all.
export const revalidate = 0;

interface PageProps {
  params: Promise<{ token: string }>;
}

export default function SpectatePage(props: PageProps) {
  return React.createElement(SpectatePageClient, props);
}
