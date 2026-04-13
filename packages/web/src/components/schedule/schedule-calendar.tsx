"use client";

import { useState, useMemo } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";

interface UpcomingRun {
  scheduleId: string;
  name: string;
  nextRunAt: number;
  triggerType: string;
}

interface ScheduleCalendarProps {
  upcoming: UpcomingRun[];
  onDayClick?: (date: Date) => void;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function getCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Monday = 0, Sunday = 6
  let startOffset = firstDay.getDay() - 1;
  if (startOffset < 0) startOffset = 6;

  const days: Array<{ date: Date; currentMonth: boolean }> = [];

  // Previous month padding
  for (let i = startOffset - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push({ date: d, currentMonth: false });
  }

  // Current month
  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push({ date: new Date(year, month, i), currentMonth: true });
  }

  // Next month padding (fill to 42 = 6 rows)
  while (days.length < 42) {
    const d = new Date(year, month + 1, days.length - lastDay.getDate() - startOffset + 1);
    days.push({ date: d, currentMonth: false });
  }

  return days;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function ScheduleCalendar({ upcoming, onDayClick }: ScheduleCalendarProps) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const days = useMemo(() => getCalendarDays(year, month), [year, month]);

  // Group upcoming runs by day
  const runsByDay = useMemo(() => {
    const map = new Map<string, UpcomingRun[]>();
    for (const run of upcoming) {
      const d = new Date(run.nextRunAt);
      const key = dateKey(d);
      const existing = map.get(key) ?? [];
      existing.push(run);
      map.set(key, existing);
    }
    return map;
  }, [upcoming]);

  const todayKey = dateKey(today);

  const prevMonth = () => {
    if (month === 0) {
      setMonth(11);
      setYear(year - 1);
    } else {
      setMonth(month - 1);
    }
  };

  const nextMonth = () => {
    if (month === 11) {
      setMonth(0);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
  };

  return (
    <div className="shadow-soft bg-bg-card rounded-xl">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ boxShadow: "0 1px 0 var(--color-border)" }}
      >
        <button
          onClick={prevMonth}
          className="cursor-pointer rounded-lg p-1 transition-colors"
          aria-label="Previous month"
        >
          <CaretLeft size={14} weight="bold" />
        </button>
        <span className="text-sm font-semibold">
          {MONTHS[month]} {year}
        </span>
        <button
          onClick={nextMonth}
          className="cursor-pointer rounded-lg p-1 transition-colors"
          aria-label="Next month"
        >
          <CaretRight size={14} weight="bold" />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 px-2 pt-2">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="text-text-muted py-1 text-center font-semibold"
            style={{ fontSize: 10 }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-0.5 px-2 pb-2">
        {days.map((day, i) => {
          const key = dateKey(day.date);
          const isToday = key === todayKey;
          const runs = runsByDay.get(key) ?? [];
          const hasRuns = runs.length > 0;

          return (
            <button
              key={i}
              onClick={() => onDayClick?.(day.date)}
              className="relative flex cursor-pointer flex-col items-center rounded-lg py-1.5 transition-colors"
              style={{
                color: day.currentMonth ? "var(--color-text-primary)" : "var(--color-text-muted)",
                background: isToday ? "#4285F415" : "transparent",
                border: isToday ? "1px solid #4285F4" : "1px solid transparent",
                opacity: day.currentMonth ? 1 : 0.4,
              }}
              aria-label={`${day.date.toLocaleDateString()} — ${runs.length} runs`}
            >
              <span style={{ fontSize: 11, fontWeight: isToday ? 700 : 400 }}>
                {day.date.getDate()}
              </span>
              {/* Run dots */}
              {hasRuns && (
                <div className="mt-0.5 flex gap-0.5">
                  {runs.slice(0, 3).map((_, j) => (
                    <span
                      key={j}
                      className="rounded-full"
                      style={{
                        width: 4,
                        height: 4,
                        background: "#4285F4",
                      }}
                    />
                  ))}
                  {runs.length > 3 && (
                    <span className="text-text-muted" style={{ fontSize: 8 }}>
                      +
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
