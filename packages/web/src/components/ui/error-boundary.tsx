"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div
          className="flex"
          style={{
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            padding: "2rem",
            fontFamily: "Inter, system-ui, sans-serif",
            color: "var(--color-text-primary, #1a1a1a)",
            background: "var(--color-bg-base, #faf8f3)",
          }}
        >
          <h1 className="font-bold" style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>
            Something went wrong
          </h1>
          <p
            className="text-center"
            style={{
              fontSize: "0.875rem",
              color: "var(--color-text-secondary, #666)",
              marginBottom: "1rem",
              maxWidth: "400px",
            }}
          >
            {this.state.error?.message ?? "An unexpected error occurred."}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="cursor-pointer font-medium"
            style={{
              padding: "0.5rem 1.5rem",
              borderRadius: "8px",
              border: "1px solid var(--color-border, #ddd)",
              background: "var(--color-bg-card, #fff)",
              fontSize: "0.875rem",
            }}
          >
            Reload page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
