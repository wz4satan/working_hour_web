export type WorkEntry = {
  date: string;
  startTime: string;
  endTime: string;
  actualStartTime: string;
  secondStartTime: string;
  secondEndTime: string;
  lunchBreakHours: number;
  isRestDay: boolean;
  note: string;
};

export type WeeklyPayRecord = {
  weekStart: string;
  hourlyRate: number;
  bankTransferAmount: number;
  cashAmount: number;
  paymentNote: string;
};

export type AppData = {
  version: 2;
  entries: Record<string, WorkEntry>;
  payRecords: Record<string, WeeklyPayRecord>;
  settings: {
    defaultHourlyRate: number;
    currencyCode: "NZD";
  };
};

export const EMPTY_DATA: AppData = {
  version: 2,
  entries: {},
  payRecords: {},
  settings: { defaultHourlyRate: 20, currencyCode: "NZD" },
};

export function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateFromKey(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

export function addDays(value: string, days: number): string {
  const date = dateFromKey(value);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

export function weekStartKey(value: string): string {
  const date = dateFromKey(value);
  const weekday = date.getDay();
  date.setDate(date.getDate() - (weekday === 0 ? 6 : weekday - 1));
  return dateKey(date);
}

export function weekKeys(value: string): string[] {
  const start = weekStartKey(value);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function emptyEntry(date: string): WorkEntry {
  return {
    date,
    startTime: "09:00",
    endTime: "17:00",
    actualStartTime: "",
    secondStartTime: "",
    secondEndTime: "",
    lunchBreakHours: 0.5,
    isRestDay: false,
    note: "",
  };
}

export function emptyPayRecord(weekStart: string, hourlyRate: number): WeeklyPayRecord {
  return {
    weekStart,
    hourlyRate,
    bankTransferAmount: 0,
    cashAmount: 0,
    paymentNote: "",
  };
}

function minutes(value: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

export type DurationResult = {
  valid: boolean;
  rawHours: number;
  hours: number;
  message: string;
};

function pairIssue(start: string, end: string, label: string): string {
  if (start && !end) return `请补全${label}下工时间`;
  if (!start && end) return `请补全${label}上工时间`;
  return "";
}

function pairHours(startValue: string, endValue: string): number {
  const start = minutes(startValue);
  const end = minutes(endValue);
  if (start === null || end === null) return 0;
  return ((end < start ? end + 24 * 60 : end) - start) / 60;
}

export function durationResult(entry: WorkEntry | undefined): DurationResult {
  if (!entry) return { valid: true, rawHours: 0, hours: 0, message: "" };

  const firstStart = entry.actualStartTime || entry.startTime;
  const secondStart = entry.secondStartTime || "";
  const secondEnd = entry.secondEndTime || "";
  const firstIssue = pairIssue(firstStart, entry.endTime, "第一段");
  const secondIssue = pairIssue(secondStart, secondEnd, "第二段");
  const message = firstIssue || secondIssue;
  if (message) return { valid: false, rawHours: 0, hours: 0, message };

  const firstComplete = Boolean(firstStart && entry.endTime);
  const secondComplete = Boolean(secondStart && secondEnd);
  if (entry.isRestDay && !firstComplete && !secondComplete) {
    return { valid: true, rawHours: 0, hours: 0, message: "" };
  }

  const rawHours = (firstComplete ? pairHours(firstStart, entry.endTime) : 0)
    + (secondComplete ? pairHours(secondStart, secondEnd) : 0);
  const hours = Math.max(0, rawHours - Math.max(0, Number(entry.lunchBreakHours) || 0));
  return { valid: true, rawHours, hours, message: "" };
}

export function duration(entry: WorkEntry | undefined): number {
  const result = durationResult(entry);
  return result.valid ? result.hours : 0;
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function money(value: number): string {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    minimumFractionDigits: 2,
  }).format(value);
}

export function formatDate(value: string, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("zh-CN", options ?? { month: "short", day: "numeric" })
    .format(dateFromKey(value));
}

export function weekday(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(dateFromKey(value));
}
