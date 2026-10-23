import assert from "node:assert/strict";
import test from "node:test";
import { excelFile } from "../lib/excel.ts";
import { entryTimeText, weeklyNotesText } from "../lib/report.ts";
import { normalizeData } from "../lib/storage.ts";
import { durationResult } from "../lib/types.ts";
import type { AppData, WorkEntry } from "../lib/types.ts";

function entry(overrides: Partial<WorkEntry> = {}): WorkEntry {
  return {
    date: "2026-08-17",
    startTime: "",
    endTime: "",
    actualStartTime: "",
    secondStartTime: "",
    secondEndTime: "",
    lunchBreakHours: 0.5,
    isRestDay: false,
    note: "",
    ...overrides,
  };
}

function data(entries: Record<string, WorkEntry> = {}): AppData {
  return {
    version: 2,
    entries,
    payRecords: {
      "2026-08-17": { weekStart: "2026-08-17", hourlyRate: 30, bankTransferAmount: 100, cashAmount: 20, paymentNote: "第一笔" },
      "2026-08-24": { weekStart: "2026-08-24", hourlyRate: 31, bankTransferAmount: 200, cashAmount: 40, paymentNote: "第二笔" },
    },
    settings: { defaultHourlyRate: 30, currencyCode: "NZD" },
  };
}

test("calculates either segment, both segments, and deducts lunch only once", () => {
  assert.deepEqual(durationResult(entry({ startTime: "09:00", endTime: "12:00" })), {
    valid: true, rawHours: 3, hours: 2.5, message: "",
  });
  assert.deepEqual(durationResult(entry({ secondStartTime: "18:00", secondEndTime: "22:00" })), {
    valid: true, rawHours: 4, hours: 3.5, message: "",
  });
  assert.deepEqual(durationResult(entry({ startTime: "09:00", endTime: "12:00", secondStartTime: "18:00", secondEndTime: "22:00" })), {
    valid: true, rawHours: 7, hours: 6.5, message: "",
  });
});

test("calculates an overnight second segment", () => {
  assert.deepEqual(durationResult(entry({ secondStartTime: "23:00", secondEndTime: "01:00" })), {
    valid: true, rawHours: 2, hours: 1.5, message: "",
  });
});

test("rejects incomplete segments instead of silently producing hours", () => {
  assert.deepEqual(durationResult(entry({ secondStartTime: "18:00" })), {
    valid: false, rawHours: 0, hours: 0, message: "请补全第二段下工时间",
  });
  assert.equal(durationResult(entry({ endTime: "12:00" })).message, "请补全第一段上工时间");
});

test("migrates version 1 data without changing old work and clears legacy rest placeholders", () => {
  const restored = normalizeData({
    version: 1,
    entries: {
      "2026-08-17": { date: "2026-08-17", startTime: "09:00", endTime: "17:00", actualStartTime: "", lunchBreakHours: 0.5, isRestDay: false, note: "旧记录" },
      "2026-08-18": { date: "2026-08-18", startTime: "09:00", endTime: "17:00", actualStartTime: "", lunchBreakHours: 0.5, isRestDay: true, note: "休息" },
      "2026-08-19": { date: "2026-08-19", startTime: 0, endTime: "", actualStartTime: "", lunchBreakHours: 0.5, isRestDay: true, note: "旧占位" },
    },
    payRecords: data().payRecords,
    settings: { defaultHourlyRate: 30 },
  });
  assert.equal(restored.version, 2);
  assert.equal(restored.entries["2026-08-17"].secondStartTime, "");
  assert.equal(durationResult(restored.entries["2026-08-17"]).hours, 7.5);
  assert.equal(durationResult(restored.entries["2026-08-18"]).hours, 0);
  assert.equal(restored.entries["2026-08-18"].startTime, "");
  assert.equal(durationResult(restored.entries["2026-08-19"]).hours, 0);
  assert.deepEqual(Object.keys(restored.payRecords).sort(), ["2026-08-17", "2026-08-24"]);
  assert.equal(restored.payRecords["2026-08-17"].paymentNote, "第一笔");
  assert.equal(restored.payRecords["2026-08-24"].paymentNote, "第二笔");
});

test("version 2 import resolves rest-day conflicts in favour of explicit work", () => {
  const source = data({
    "2026-08-17": entry({ isRestDay: true, secondStartTime: "18:00", secondEndTime: "22:00" }),
  });
  const restored = normalizeData(JSON.parse(JSON.stringify(source)));
  assert.equal(restored.entries["2026-08-17"].isRestDay, false);
  assert.equal(durationResult(restored.entries["2026-08-17"]).hours, 3.5);
  assert.equal(restored.entries["2026-08-17"].secondStartTime, "18:00");
  assert.equal(restored.entries["2026-08-17"].secondEndTime, "22:00");
});

test("text sharing stays concise for one segment and labels a second segment", () => {
  assert.equal(entryTimeText(entry({ startTime: "09:00", endTime: "12:00" })), "09:00—12:00");
  assert.equal(entryTimeText(entry({ secondStartTime: "23:00", secondEndTime: "01:00" })), "第二段 23:00—01:00（次日）");
  const text = weeklyNotesText(data({
    "2026-08-17": entry({ startTime: "09:00", endTime: "12:00", secondStartTime: "18:00", secondEndTime: "22:00" }),
  }), "2026-08-17");
  assert.match(text, /第一段 09:00—12:00；第二段 18:00—22:00/);
});

test("Excel contains both segments and sums the new daily-hours column", async () => {
  const workbook = excelFile(data({
    "2026-08-17": entry({ startTime: "09:00", endTime: "12:00", secondStartTime: "18:00", secondEndTime: "22:00" }),
  }), "2026-08-17");
  const contents = new TextDecoder().decode(await workbook.blob.arrayBuffer());
  assert.match(contents, /第一段上工/);
  assert.match(contents, /第二段上工/);
  assert.match(contents, /MOD\(F4-E4,1\)\*24/);
  assert.match(contents, /SUM\(H4:H10\)/);
});

test("Excel refuses incomplete records", () => {
  assert.throws(() => excelFile(data({
    "2026-08-17": entry({ secondStartTime: "18:00" }),
  }), "2026-08-17"), /请补全第二段下工时间/);
});
