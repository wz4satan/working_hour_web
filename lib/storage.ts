import { EMPTY_DATA, durationResult } from "./types.ts";
import type { AppData, WorkEntry, WeeklyPayRecord } from "./types.ts";

const DATABASE_NAME = "working-hour-web";
const STORE_NAME = "app-data";
const SNAPSHOT_KEY = "snapshot";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法打开本地数据库"));
  });
}

export function normalizeData(value: unknown): AppData {
  if (!value || typeof value !== "object") throw new Error("备份文件内容无效");
  const candidate = value as {
    version?: unknown;
    entries?: unknown;
    payRecords?: unknown;
    settings?: { defaultHourlyRate?: unknown };
  };
  if ((candidate.version !== 1 && candidate.version !== 2) || !isRecord(candidate.entries) || !isRecord(candidate.payRecords)) {
    throw new Error("不支持这个备份文件版本");
  }

  const sourceVersion = candidate.version;
  const entries = Object.fromEntries(
    Object.entries(candidate.entries).map(([date, entry]) => [date, normalizeEntry(date, entry, sourceVersion)]),
  );
  const payRecords = Object.fromEntries(
    Object.entries(candidate.payRecords).map(([weekStart, record]) => [weekStart, normalizePayRecord(weekStart, record)]),
  );
  return {
    version: 2,
    entries,
    payRecords,
    settings: {
      defaultHourlyRate: nonNegativeNumber(candidate.settings?.defaultHourlyRate, 20),
      currencyCode: "NZD",
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function time(value: unknown): string {
  const candidate = text(value);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(candidate) ? candidate : "";
}

function nonNegativeNumber(value: unknown, fallback = 0): number {
  const candidate = Number(value);
  return Number.isFinite(candidate) ? Math.max(0, candidate) : fallback;
}

function normalizeEntry(date: string, value: unknown, sourceVersion: 1 | 2): WorkEntry {
  const candidate = isRecord(value) ? value : {};
  const legacyRestDay = sourceVersion === 1 && candidate.isRestDay === true;
  const entry: WorkEntry = {
    date,
    startTime: legacyRestDay ? "" : time(candidate.startTime),
    endTime: legacyRestDay ? "" : time(candidate.endTime),
    actualStartTime: legacyRestDay ? "" : time(candidate.actualStartTime),
    secondStartTime: time(candidate.secondStartTime),
    secondEndTime: time(candidate.secondEndTime),
    lunchBreakHours: nonNegativeNumber(candidate.lunchBreakHours, 0),
    isRestDay: candidate.isRestDay === true,
    note: text(candidate.note),
  };

  // Version 1 stored the default 09:00–17:00 values even on rest days, so those
  // values are deliberately cleared above. Version 2 treats explicit work time
  // as authoritative and automatically resolves an imported rest/work conflict.
  if (sourceVersion === 2 && entry.isRestDay && durationResult({ ...entry, isRestDay: false }).rawHours > 0) {
    entry.isRestDay = false;
  }
  return entry;
}

function normalizePayRecord(weekStart: string, value: unknown): WeeklyPayRecord {
  const candidate = isRecord(value) ? value : {};
  return {
    weekStart,
    hourlyRate: nonNegativeNumber(candidate.hourlyRate, 0),
    bankTransferAmount: nonNegativeNumber(candidate.bankTransferAmount, 0),
    cashAmount: nonNegativeNumber(candidate.cashAmount, 0),
    paymentNote: text(candidate.paymentNote),
  };
}

export async function loadData(): Promise<AppData> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(SNAPSHOT_KEY);
    request.onsuccess = () => {
      try {
        resolve(request.result ? normalizeData(request.result) : structuredClone(EMPTY_DATA));
      } catch (error) {
        reject(error);
      }
    };
    request.onerror = () => reject(request.error ?? new Error("无法读取本地记录"));
    transaction.oncomplete = () => database.close();
  });
}

export async function saveData(data: AppData): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(data, SNAPSHOT_KEY);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error ?? new Error("无法保存到本机"));
  });
}
