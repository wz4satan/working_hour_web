import { addDays, durationResult, formatDate, weekKeys, weekStartKey, weekday } from "./types.ts";
import type { AppData, WorkEntry } from "./types.ts";

function overnightSuffix(start: string, end: string): string {
  return end < start ? "（次日）" : "";
}

function completePair(start: string, end: string): string {
  return `${start}—${end}${overnightSuffix(start, end)}`;
}

export function entryTimeText(entry: WorkEntry | undefined): string {
  if (!entry) return "未记录";
  const result = durationResult(entry);
  if (!result.valid) return result.message;

  const firstStart = entry.actualStartTime || entry.startTime;
  const firstComplete = Boolean(firstStart && entry.endTime);
  const secondComplete = Boolean(entry.secondStartTime && entry.secondEndTime);
  if (entry.isRestDay && !firstComplete && !secondComplete) return "休息";
  if (!firstComplete && !secondComplete) return "未记录";
  if (firstComplete && secondComplete) {
    return `第一段 ${completePair(firstStart, entry.endTime)}；第二段 ${completePair(entry.secondStartTime, entry.secondEndTime)}`;
  }
  if (firstComplete) return completePair(firstStart, entry.endTime);
  return `第二段 ${completePair(entry.secondStartTime, entry.secondEndTime)}`;
}

export function weeklyNotesText(data: AppData, selectedDate: string): string {
  const start = weekStartKey(selectedDate);
  const lines = ["每周上工记录", `${formatDate(start)}—${formatDate(addDays(start, 6))}`, ""];
  weekKeys(start).forEach((day) => {
    lines.push(`${weekday(day)} ${formatDate(day)}：${entryTimeText(data.entries[day])}`);
  });
  return lines.join("\n");
}
