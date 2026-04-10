"use client";

import { Component, type ReactNode } from "react";
import { WarningCircle, ArrowClockwise } from "@phosphor-icons/react";

interface PanelErrorBoundaryProps {
  children: ReactNode;
  /** Panel name shown in the fallback UI */
  name?: string;
}

interface PanelErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Per-panel error boundary — catches crashes in individual panels
 * without taking down the entire app. Shows a compact fallback
 * with a retry button.
 */
export class PanelErrorBoundary extends Component<
  PanelErrorBoundaryProps,
  PanelErrorBoundaryState
> {
  constructor(props: PanelErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): PanelErrorBoundaryState {
    return { hasError: true, error };
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const name = this.props.name ?? "Panel";

    return (
      <div
        className="flex flex-col items-center justify-center gap-3 p-6"
        style={{
          height: "100%",
          minHeight: 120,
          background: "var(--color-bg-elevated)",
          borderRadius: "var(--radius-lg, 8px)",
          border: "1px solid var(--color-border)",
        }}
      >
        <WarningCircle
          size={28}
          weight="bold"
          style={{ color: "var(--color-warning, #FBBC04)" }}
          aria-hidden="true"
        />
        <p
          className="text-sm font-medium text-center"
          style={{ color: "var(--color-text-primary)" }}
        >
          {name} crashed
        </p>
        <p
          className="text-xs text-center"
          style={{ color: "var(--color-text-muted)", maxWidth: 280 }}
        >
          {this.state.error?.message ?? "An unexpected error occurred."}
        </p>
        <button
          onClick={this.handleRetry}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors"
          style={{
            background: "var(--color-bg-card)",
            color: "var(--color-text-primary)",
            border: "1px solid var(--color-border)",
          }}
        >
          <ArrowClockwise size={12} weight="bold" aria-hidden="true" />
          Retry
        </button>
      </div>
    );
  }
}
