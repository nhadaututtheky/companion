import React from "react";
import { WorkflowPageClient } from "./workflow-page-client";

export const revalidate = 0;

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function WorkflowPage(props: PageProps) {
  return React.createElement(WorkflowPageClient, props);
}
