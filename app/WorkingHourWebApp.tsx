"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { downloadBlob, excelFile } from "@/lib/excel";
import { loadData, normalizeData, saveData } from "@/lib/storage";
import {
  AppData,
  EMPTY_DATA,
  WorkEntry,
  addDays,
  dateKey,
  duration,
  emptyEntry,
  emptyPayRecord,
  formatDate,
  money,
  roundMoney,
  weekKeys,
  weekStartKey,
  weekday,
} from "@/lib/types";

type Tab = "record" | "week" | "backup";

function clone<T>(value: T): T {
  return structuredClone(value);
}

export default function WorkingHourWebApp() {
  const today = useMemo(() => dateKey(new Date()), []);
  const [data, setData] = useState<AppData | null>(null);
  const [tab, setTab] = useState<Tab>("record");
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedWeekDate, setSelectedWeekDate] = useState(today);
  const [entry, setEntry] = useState<WorkEntry>(emptyEntry(today));
  const [notice, setNotice] = useState("");

  useEffect(() => {
    loadData()
      .then((loaded) => {
        setData(loaded);
        setEntry(clone(loaded.entries[today] ?? emptyEntry(today)));
      })
      .catch(() => {
        const empty = clone(EMPTY_DATA);
        setData(empty);
        setEntry(emptyEntry(today));
        setNotice("本地记录读取失败，已打开空白记录");
      });
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, [today]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function commit(next: AppData, message?: string) {
    setData(next);
    saveData(next).then(() => message && setNotice(message)).catch(() => setNotice("保存失败，请先导出备份"));
  }

  if (!data) {
    return <main className="loading-screen"><div className="loading-mark">工</div><p>正在读取本机记录…</p></main>;
  }
  const appData: AppData = data;

  const weekStart = weekStartKey(selectedWeekDate);
  const weekDays = weekKeys(selectedWeekDate);
  const weekEntries = weekDays.map((day) => appData.entries[day]);
  const totalHours = weekEntries.reduce((sum, item) => sum + duration(item), 0);
  const payRecord = appData.payRecords[weekStart] ?? emptyPayRecord(weekStart, appData.settings.defaultHourlyRate);
  const estimatedPay = roundMoney(totalHours * payRecord.hourlyRate);
  const actualPaid = roundMoney(payRecord.bankTransferAmount + payRecord.cashAmount);
  const difference = roundMoney(estimatedPay - actualPaid);
  const recordedDays = weekEntries.filter((item) => duration(item) > 0).length;

  function saveEntry() {
    if (!entry.isRestDay && (!entry.startTime || !entry.endTime)) {
      setNotice("请填写上工和下工时间");
      return;
    }
    const next = clone(appData);
    next.entries[selectedDate] = { ...entry, date: selectedDate, lunchBreakHours: Math.max(0, Number(entry.lunchBreakHours) || 0) };
    commit(next, "今日记录已保存");
  }

  function deleteEntry() {
    if (!appData.entries[selectedDate]) return;
    const next = clone(appData);
    delete next.entries[selectedDate];
    commit(next, "这一天的记录已删除");
  }

  function updatePay(field: keyof typeof payRecord, value: string | number) {
    const next = clone(appData);
    next.payRecords[weekStart] = { ...payRecord, [field]: value };
    commit(next);
  }

  async function shareText(title: string, text: string) {
    try {
      if (navigator.share) await navigator.share({ title, text });
      else {
        await navigator.clipboard.writeText(text);
        setNotice("内容已复制");
      }
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") setNotice("分享没有完成");
    }
  }

  function notesText(): string {
    const lines = ["每周上工记录", `${formatDate(weekStart)}—${formatDate(addDays(weekStart, 6))}`, ""];
    weekDays.forEach((day) => {
      const item = appData.entries[day];
      const prefix = `${weekday(day)} ${formatDate(day)}：`;
      if (!item) lines.push(prefix + "未记录");
      else if (item.isRestDay) lines.push(prefix + "休息");
      else if (!item.startTime || !item.endTime) lines.push(prefix + "未记录");
      else {
        const start = item.actualStartTime || item.startTime;
        const overnight = item.endTime < start ? "（次日）" : "";
        lines.push(`${prefix}${start}—${item.endTime}${overnight}`);
      }
    });
    return lines.join("\n");
  }

  async function exportExcel() {
    const output = excelFile(appData, selectedWeekDate);
    const file = new File([output.blob], output.fileName, { type: output.blob.type });
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: "工时周报" });
      else downloadBlob(output.blob, output.fileName);
      setNotice("Excel 周报已生成");
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") setNotice("Excel 导出没有完成");
    }
  }

  function exportBackup() {
    const payload = JSON.stringify({ app: "Working Hour Web", exportedAt: new Date().toISOString(), data: appData }, null, 2);
    downloadBlob(new Blob([payload], { type: "application/json" }), `工时记录备份_${today}.json`);
    setNotice("完整备份已导出");
  }

  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as { data?: unknown };
      const restored = normalizeData(parsed.data ?? parsed);
      if (!window.confirm("导入会替换这台设备上的现有记录，确定继续吗？")) return;
      setEntry(clone(restored.entries[selectedDate] ?? emptyEntry(selectedDate)));
      commit(restored, "备份已恢复");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "无法读取备份文件");
    }
  }

  return (
    <main className="app-shell">
      {tab === "record" && (
        <>
          <PageHeader eyebrow="WORKING HOUR" title="今天，按时收工。" subtitle="记录上下工，工资心里有数。" date={selectedDate} />
          <section className="panel record-panel">
            <div className="section-heading"><div><span>每日记录</span><strong>{weekday(selectedDate)}</strong></div><input aria-label="记录日期" type="date" value={selectedDate} onChange={(event) => { const value = event.target.value; setSelectedDate(value); setEntry(clone(appData.entries[value] ?? emptyEntry(value))); }} /></div>
            <div className="toggle-row"><span><b>休息日</b><small>当天不计算工时</small></span><input aria-label="休息日" type="checkbox" checked={entry.isRestDay} onChange={(event) => setEntry({ ...entry, isRestDay: event.target.checked })} /></div>
            {!entry.isRestDay && (
              <>
                <div className="time-fields">
                  <Field label="上工时间"><input type="time" value={entry.startTime} onChange={(event) => setEntry({ ...entry, startTime: event.target.value })} /></Field>
                  <Field label="下工时间"><input type="time" value={entry.endTime} onChange={(event) => setEntry({ ...entry, endTime: event.target.value })} /></Field>
                </div>
                <Field label="实际开始时间" hint="如迟到或提前开工，可单独记录"><input type="time" value={entry.actualStartTime} onChange={(event) => setEntry({ ...entry, actualStartTime: event.target.value })} /></Field>
                <div className="lunch-row"><div><b>午饭扣除</b><small>每次调整 0.5 小时</small></div><div className="stepper"><button aria-label="减少午饭时间" onClick={() => setEntry({ ...entry, lunchBreakHours: Math.max(0, entry.lunchBreakHours - 0.5) })}>−</button><strong>{entry.lunchBreakHours.toFixed(1)}</strong><button aria-label="增加午饭时间" onClick={() => setEntry({ ...entry, lunchBreakHours: entry.lunchBreakHours + 0.5 })}>＋</button></div></div>
              </>
            )}
            <Field label="备注" hint="可选"><textarea rows={3} value={entry.note} placeholder="例如：客户现场、夜班…" onChange={(event) => setEntry({ ...entry, note: event.target.value })} /></Field>
            <div className="calculation-strip"><span>预计工时</span><strong>{duration(entry).toFixed(1)} 小时</strong></div>
            <button className="primary-button" onClick={saveEntry}>保存今日记录</button>
            {appData.entries[selectedDate] && <button className="text-button danger" onClick={deleteEntry}>删除这一天</button>}
          </section>
        </>
      )}

      {tab === "week" && (
        <>
          <PageHeader eyebrow="WEEKLY REPORT" title="这一周，清清楚楚。" subtitle="工时、周薪和到账金额都在这里。" />
          <section className="week-selector"><button aria-label="上一周" onClick={() => setSelectedWeekDate(addDays(weekStart, -7))}>←</button><label><span>查看所在周</span><input type="date" value={selectedWeekDate} onChange={(event) => setSelectedWeekDate(event.target.value)} /></label><button aria-label="下一周" onClick={() => setSelectedWeekDate(addDays(weekStart, 7))}>→</button></section>
          <section className="week-hero"><div><span>{formatDate(weekStart)}—{formatDate(addDays(weekStart, 6))}</span><strong>{totalHours.toFixed(1)}<small>小时</small></strong><p>{recordedDays} 个工作日</p></div><div className="pay-chip"><span>预估周薪</span><b>{money(estimatedPay)}</b></div></section>
          <section className="panel pay-panel">
            <div className="panel-title"><span>工资记录</span><small>黄色项目可修改</small></div>
            <PayField label="时薪" value={payRecord.hourlyRate} onChange={(value) => updatePay("hourlyRate", value)} />
            <div className="summary-line"><span>预估周薪</span><strong>{money(estimatedPay)}</strong></div>
            <PayField label="银行到账" value={payRecord.bankTransferAmount} onChange={(value) => updatePay("bankTransferAmount", value)} />
            <PayField label="现金" value={payRecord.cashAmount} onChange={(value) => updatePay("cashAmount", value)} />
            <div className="summary-line"><span>实际合计</span><strong>{money(actualPaid)}</strong></div>
            <div className={`summary-line difference ${difference > 0 ? "unpaid" : difference < 0 ? "overpaid" : "settled"}`}><span>差额 · {difference > 0 ? "未结清" : difference < 0 ? "多发" : "已结清"}</span><strong>{money(difference)}</strong></div>
            <Field label="付款备注" hint="可选"><textarea rows={2} value={payRecord.paymentNote} onChange={(event) => updatePay("paymentNote", event.target.value)} /></Field>
          </section>
          <section className="panel week-list"><div className="panel-title"><span>每日记录</span><small>周一至周日</small></div>{weekDays.map((day) => { const item = appData.entries[day]; return <button key={day} onClick={() => { setSelectedDate(day); setEntry(clone(item ?? emptyEntry(day))); setTab("record"); }}><span><b>{weekday(day)}</b><small>{formatDate(day)}</small></span><strong>{!item ? "未记录" : item.isRestDay ? "休息" : `${duration(item).toFixed(1)} 小时`}</strong></button>; })}</section>
          <section className="export-grid">
            <button className="export-card excel" onClick={exportExcel}><span className="export-icon">X</span><b>导出 Excel 周报</b><small>Mac 上继续编辑</small></button>
            <button className="export-card" onClick={() => shareText("每周上工记录", notesText())}><span className="export-icon">Aa</span><b>发送上工时间</b><small>适合备忘录或老板</small></button>
          </section>
        </>
      )}

      {tab === "backup" && (
        <>
          <PageHeader eyebrow="LOCAL & PRIVATE" title="数据，只留在你手里。" subtitle="本机保存，定期备份到 iCloud Drive。" />
          <section className="privacy-card"><div className="privacy-mark">✓</div><div><strong>本地保存已开启</strong><p>工时记录保存在当前 iPhone，不会上传到 Cloudflare。</p></div></section>
          <section className="panel backup-panel">
            <div className="panel-title"><span>完整备份</span><small>{Object.keys(appData.entries).length} 条每日记录</small></div>
            <p>JSON备份包含全部工时、时薪和到账记录。建议每周保存到 iCloud Drive。</p>
            <button className="primary-button" onClick={exportBackup}>导出 JSON备份</button>
            <label className="secondary-button">导入并恢复备份<input type="file" accept="application/json,.json" onChange={importBackup} /></label>
          </section>
          <section className="panel settings-panel">
            <div className="panel-title"><span>默认设置</span><small>以后新周使用</small></div>
            <PayField label="默认时薪" value={appData.settings.defaultHourlyRate} onChange={(value) => { const next = clone(appData); next.settings.defaultHourlyRate = value; commit(next); }} />
            <div className="summary-line"><span>货币</span><strong>NZD</strong></div>
          </section>
          <section className="install-card"><span>添加到主屏幕</span><ol><li>使用 Safari打开这个网站</li><li>点击“分享”按钮</li><li>选择“添加到主屏幕”</li></ol><p>安装后可离线使用，也没有 7 天过期限制。</p></section>
        </>
      )}

      <nav className="bottom-nav" aria-label="主要导航">
        <button className={tab === "record" ? "active" : ""} onClick={() => setTab("record")}><b>●</b>记录</button>
        <button className={tab === "week" ? "active" : ""} onClick={() => setTab("week")}><b>▦</b>周报</button>
        <button className={tab === "backup" ? "active" : ""} onClick={() => setTab("backup")}><b>↥</b>备份</button>
      </nav>
      {notice && <div className="toast" role="status">{notice}</div>}
    </main>
  );
}

function PageHeader({ eyebrow, title, subtitle, date }: { eyebrow: string; title: string; subtitle: string; date?: string }) {
  return <header className="topbar"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="intro">{subtitle}</p></div>{date && <div className="date-badge">{formatDate(date)}<br /><strong>{weekday(date)}</strong></div>}</header>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="field"><span><b>{label}</b>{hint && <small>{hint}</small>}</span>{children}</label>;
}

function PayField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="pay-field"><span>{label}</span><div><input type="number" inputMode="decimal" min="0" step="0.01" value={value} onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))} /><small>NZD</small></div></label>;
}
