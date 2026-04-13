"use client";

import type { ChangeEvent } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

export interface TemplateVariable {
  key: string;
  label: string;
  defaultValue?: string;
  required?: boolean;
}

interface TemplateVariablesFormProps {
  variables: TemplateVariable[];
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export function TemplateVariablesForm({ variables, values, onChange }: TemplateVariablesFormProps) {
  if (variables.length === 0) return null;

  const handleChange = (key: string, value: string) => {
    onChange({ ...values, [key]: value });
  };

  // Use a 2-column grid for 1-2 variables, single column for 3+
  const useGrid = variables.length <= 2;

  return (
    <div>
      <p className="mb-2 text-xs font-semibold">TEMPLATE VARIABLES</p>
      <div className={useGrid ? "grid grid-cols-2 gap-3" : "flex flex-col gap-3"}>
        {variables.map((variable) => (
          <div key={variable.key}>
            <label htmlFor={`tvar-${variable.key}`} className="mb-1 block text-xs font-medium">
              {variable.label}
              {variable.required && (
                <span className="ml-1 font-bold" style={{ color: "#EA4335" }} aria-hidden="true">
                  *
                </span>
              )}
            </label>
            <input
              id={`tvar-${variable.key}`}
              type="text"
              value={values[variable.key] ?? variable.defaultValue ?? ""}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                handleChange(variable.key, e.target.value)
              }
              placeholder={`{{${variable.key}}}`}
              required={variable.required}
              className="input-bordered text-text-primary bg-bg-elevated w-full rounded-lg px-3 py-2 text-sm"
              style={{
                fontFamily: "var(--font-body)",
              }}
              aria-label={variable.label}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
