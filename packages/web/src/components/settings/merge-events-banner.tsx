"use client";

/**
 * MergeEventsBanner — Phase 3 of multi-account dedup.
 *
 * When the server silently folds duplicate Anthropic accounts and their budget
 * caps disagree, it records a `PendingMergeEvent`. This banner surfaces those
 * events so the user can either accept the auto-picked max or apply one of the
 * pre-merge rows' caps.
 *
 * Render at the top of the Accounts tab. Self-fetches and self-clears.
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle, Warning, X } from "@phosphor-icons/react";
import {
  accounts as accountsApi,
  type AccountInfo,
  type MergeEventChoice,
  type PendingMergeEvent,
} from "@/lib/api/accounts";

interface Props {
  /** Already-loaded accounts list — used to render the survivor's label. */
  accounts: AccountInfo[];
  /** Called after a successful apply/dismiss so parent can re-fetch budgets. */
  onResolved?: () => void;
}

function formatBudget(v: number | null): string {
  if (v == null) return "—";
  return `$${v.toFixed(2)}`;
}

export function MergeEventsBanner({ accounts: accountList, onResolved }: Props) {
  const [events, setEvents] = useState<PendingMergeEvent[]>([]);
  const [loading, setLoading] = useState(true);
  // Per-event selected choice. Default = "kept" (accept auto-pick).
  const [choices, setChoices] = useState<Record<string, MergeEventChoice>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);

  // Re-fetch when the parent's account list changes (credential watcher fires
  // a merge while Settings is open → parent refresh → list IDs shift → we
  // pull the fresh event). Stable signature so React doesn't re-fire on every
  // unrelated prop tick.
  const accountsKey = accountList
    .map((a) => a.id)
    .sort()
    .join(",");

  useEffect(() => {
    let cancelled = false;
    accountsApi
      .listMergeEvents()
      .then((res) => {
        if (cancelled) return;
        setEvents(res.data);
      })
      .catch(() => {
        // Silent failure — banner just stays empty. The dedup pipeline still
        // worked; the user just won't see the conflict prompt.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accountsKey]);

  if (loading || events.length === 0) return null;

  const handleApply = async (event: PendingMergeEvent) => {
    const choice = choices[event.id] ?? "kept";
    setSubmitting(event.id);
    try {
      await accountsApi.applyMergeChoice(event.id, choice);
      setEvents((prev) => prev.filter((e) => e.id !== event.id));
      toast.success(
        choice === "kept" ? "Kept auto-picked budget" : "Applied selected budget cap",
      );
      onResolved?.();
    } catch (err) {
      toast.error(`Failed to apply: ${String(err)}`);
    } finally {
      setSubmitting(null);
    }
  };

  const handleDismiss = async (eventId: string) => {
    setSubmitting(eventId);
    try {
      await accountsApi.dismissMergeEvent(eventId);
      setEvents((prev) => prev.filter((e) => e.id !== eventId));
      toast.success("Dismissed — kept auto-picked budget");
      onResolved?.();
    } catch (err) {
      toast.error(`Failed to dismiss: ${String(err)}`);
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="mb-4 flex flex-col gap-3">
      {events.map((event) => {
        const survivor = accountList.find((a) => a.id === event.survivorAccountId);
        const survivorLabel = survivor?.label ?? "Unknown account";
        const choice = choices[event.id] ?? "kept";
        const isSubmitting = submitting === event.id;
        const dupCount = event.beforeState.length;

        return (
          <div
            key={event.id}
            className="flex flex-col gap-3 rounded-lg px-4 py-3"
            style={{
              background: "#f59e0b15",
              border: "1px solid #f59e0b40",
            }}
          >
            <div className="flex items-start gap-2">
              <Warning
                size={18}
                weight="bold"
                style={{ color: "#f59e0b", flexShrink: 0, marginTop: 2 }}
              />
              <div className="flex-1 text-sm">
                <p className="text-text-primary font-medium">
                  Merged {dupCount} duplicate accounts into{" "}
                  <span className="font-mono">{survivorLabel}</span>
                </p>
                <p className="text-text-secondary mt-0.5 text-xs">
                  Pre-merge budget caps disagreed. We kept the highest value of each — pick a
                  different snapshot if you'd rather use those caps.
                </p>
              </div>
              <button
                onClick={() => void handleDismiss(event.id)}
                disabled={isSubmitting}
                className="cursor-pointer rounded p-1 text-text-secondary transition-colors hover:text-text-primary disabled:opacity-50"
                aria-label="Dismiss banner without changing budgets"
                title="Dismiss (keep auto-picked)"
              >
                <X size={14} weight="bold" />
              </button>
            </div>

            {/* Budget comparison table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-text-secondary text-left">
                    <th className="pb-1 pr-3 font-medium">Source</th>
                    <th className="pb-1 pr-3 text-right font-medium">5h</th>
                    <th className="pb-1 pr-3 text-right font-medium">Weekly</th>
                    <th className="pb-1 text-right font-medium">Monthly</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    className="text-text-primary"
                    style={{ background: "color-mix(in srgb, #f59e0b 8%, transparent)" }}
                  >
                    <td className="py-1 pr-3 font-medium">Auto-picked (current)</td>
                    <td className="py-1 pr-3 text-right font-mono">
                      {formatBudget(event.appliedSession5hBudget)}
                    </td>
                    <td className="py-1 pr-3 text-right font-mono">
                      {formatBudget(event.appliedWeeklyBudget)}
                    </td>
                    <td className="py-1 text-right font-mono">
                      {formatBudget(event.appliedMonthlyBudget)}
                    </td>
                  </tr>
                  {event.beforeState.map((row) => (
                    <tr key={row.id} className="text-text-secondary">
                      <td className="py-1 pr-3">{row.label}</td>
                      <td className="py-1 pr-3 text-right font-mono">
                        {formatBudget(row.session5hBudget)}
                      </td>
                      <td className="py-1 pr-3 text-right font-mono">
                        {formatBudget(row.weeklyBudget)}
                      </td>
                      <td className="py-1 text-right font-mono">
                        {formatBudget(row.monthlyBudget)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <select
                value={choice}
                onChange={(e) =>
                  setChoices((prev) => ({
                    ...prev,
                    [event.id]: e.target.value as MergeEventChoice,
                  }))
                }
                disabled={isSubmitting}
                className="cursor-pointer rounded border border-glass-border bg-bg-elevated px-2 py-1 text-xs"
                aria-label="Select which budget cap to apply"
              >
                <option value="kept">Keep auto-pick</option>
                {event.beforeState.map((row) => (
                  <option key={row.id} value={`applied:${row.id}`}>
                    Use {row.label}'s caps
                  </option>
                ))}
              </select>
              <button
                onClick={() => void handleApply(event)}
                disabled={isSubmitting}
                className="flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50"
                style={{
                  color: "var(--color-accent)",
                  background: "color-mix(in srgb, var(--color-accent) 12%, transparent)",
                }}
              >
                <CheckCircle size={12} weight="bold" />
                Apply
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
