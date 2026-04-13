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
        className="bg-bg-elevated border-border flex flex-col items-center justify-center gap-3 border p-6"
        style={{
          height: "100%",
          minHeight: 120,
          borderRadius: "var(--radius-lg, 8px)",
        }}
      >
        <WarningCircle
          size={28}
          weight="bold"
          style={{ color: "var(--color-warning, #FBBC04)" }}
          aria-hidden="true"
        />
        <p className="text-text-primary text-center text-sm font-medium">{name} crashed</p>
        <p className="text-text-muted text-center text-xs" style={{ maxWidth: 280 }}>
          {this.state.error?.message ?? "An unexpected error occurred."}
        </p>
        <button
          onClick={this.handleRetry}
          className="shadow-soft text-text-primary bg-bg-card inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
        >
          <ArrowClockwise size={12} weight="bold" aria-hidden="true" />
          Retry
        </button>
      </div>
    );
  }
}
