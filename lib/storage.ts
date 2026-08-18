import { AppData, EMPTY_DATA } from "./types";

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
  const candidate = value as Partial<AppData>;
  if (candidate.version !== 1 || !candidate.entries || !candidate.payRecords) {
    throw new Error("不支持这个备份文件版本");
  }
  return {
    version: 1,
    entries: candidate.entries,
    payRecords: candidate.payRecords,
    settings: {
      defaultHourlyRate: Number(candidate.settings?.defaultHourlyRate ?? 20),
      currencyCode: "NZD",
    },
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
