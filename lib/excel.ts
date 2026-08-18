import { AppData, WorkEntry, addDays, dateFromKey, duration, formatDate, roundMoney, weekKeys, weekStartKey } from "./types";

const encoder = new TextEncoder();

function escapeXML(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function numberText(value: number): string {
  return Number.isFinite(value) ? String(Math.round(value * 1e10) / 1e10) : "0";
}

function excelDate(value: string): number {
  const date = dateFromKey(value);
  return Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(1899, 11, 30)) / 86400000);
}

function excelTime(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return ((hour || 0) * 60 + (minute || 0)) / 1440;
}

function inlineCell(ref: string, value: string, style: number): string {
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXML(value)}</t></is></c>`;
}

function numberCell(ref: string, value: number, style: number): string {
  return `<c r="${ref}" s="${style}"><v>${numberText(value)}</v></c>`;
}

function formulaCell(ref: string, formula: string, cached: number, style: number): string {
  return `<c r="${ref}" s="${style}"><f>${escapeXML(formula)}</f><v>${numberText(cached)}</v></c>`;
}

function row(index: number, height: number, cells: string[]): string {
  return `<row r="${index}" ht="${height}" customHeight="1">${cells.join("")}</row>`;
}

function summaryRow(index: number, label: string, value: string, currency = false): string {
  return row(index, 22, [inlineCell(`A${index}`, label, 7), value, ...(currency ? [inlineCell(`C${index}`, "NZD", 10)] : [])]);
}

function buildSheet(data: AppData, selectedDate: string): string {
  const start = weekStartKey(selectedDate);
  const days = weekKeys(start);
  const pay = data.payRecords[start] ?? {
    weekStart: start,
    hourlyRate: data.settings.defaultHourlyRate,
    bankTransferAmount: 0,
    cashAmount: 0,
    paymentNote: "",
  };
  const entries = days.map((day) => data.entries[day]);
  const totalHours = entries.reduce((sum, entry) => sum + duration(entry), 0);
  const estimated = roundMoney(totalHours * pay.hourlyRate);
  const actual = roundMoney(pay.bankTransferAmount + pay.cashAmount);
  const weekdayNames = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  const rows = [
    row(1, 28, [inlineCell("A1", "工时周报", 1)]),
    row(2, 22, [inlineCell("A2", `周期：${formatDate(start, { year: "numeric", month: "long", day: "numeric" })}—${formatDate(addDays(start, 6), { year: "numeric", month: "long", day: "numeric" })}`, 2)]),
    row(3, 32, ["日期", "星期", "上工时间", "下工时间", "午饭扣除（小时）", "工作时长（小时）", "备注"].map((title, index) => inlineCell(`${String.fromCharCode(65 + index)}3`, title, 3))),
  ];

  days.forEach((day, offset) => {
    const excelRow = offset + 4;
    const entry: WorkEntry | undefined = data.entries[day];
    const cells = [numberCell(`A${excelRow}`, excelDate(day), 4), inlineCell(`B${excelRow}`, weekdayNames[offset], 10)];
    if (entry && !entry.isRestDay) {
      const startTime = entry.actualStartTime || entry.startTime;
      if (startTime) cells.push(numberCell(`C${excelRow}`, excelTime(startTime), 5));
      if (entry.endTime) cells.push(numberCell(`D${excelRow}`, excelTime(entry.endTime), 5));
      cells.push(numberCell(`E${excelRow}`, entry.lunchBreakHours, 12));
    }
    cells.push(formulaCell(`F${excelRow}`, `IF(OR(C${excelRow}="",D${excelRow}=""),0,MAX(0,MOD(D${excelRow}-C${excelRow},1)*24-E${excelRow}))`, duration(entry), 6));
    const note = entry?.isRestDay ? (entry.note ? `休息；${entry.note}` : "休息") : (entry?.note ?? "");
    if (note) cells.push(inlineCell(`G${excelRow}`, note, 9));
    rows.push(row(excelRow, 21, cells));
  });

  rows.push(row(11, 8, []));
  rows.push(summaryRow(12, "本周总工时", formulaCell("B12", "SUM(F4:F10)", totalHours, 6)));
  rows.push(summaryRow(13, "时薪", numberCell("B13", pay.hourlyRate, 11), true));
  rows.push(summaryRow(14, "预估周薪", formulaCell("B14", "B12*B13", estimated, 8), true));
  rows.push(summaryRow(15, "银行到账", numberCell("B15", pay.bankTransferAmount, 11), true));
  rows.push(summaryRow(16, "现金", numberCell("B16", pay.cashAmount, 11), true));
  rows.push(summaryRow(17, "实际合计", formulaCell("B17", "SUM(B15:B16)", actual, 8), true));
  rows.push(summaryRow(18, "差额", formulaCell("B18", "B14-B17", roundMoney(estimated - actual), 8), true));
  rows.push(row(19, 25, [inlineCell("A19", "付款备注", 7), inlineCell("B19", pay.paymentNote, 13)]));

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:G19"/><sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetFormatPr defaultRowHeight="18"/><cols><col min="1" max="1" width="12" customWidth="1"/><col min="2" max="2" width="12" customWidth="1"/><col min="3" max="4" width="11" customWidth="1"/><col min="5" max="6" width="16" customWidth="1"/><col min="7" max="7" width="22" customWidth="1"/></cols><sheetData>${rows.join("")}</sheetData><autoFilter ref="A3:G10"/><mergeCells count="3"><mergeCell ref="A1:G1"/><mergeCell ref="A2:G2"/><mergeCell ref="B19:G19"/></mergeCells><pageMargins left="0.35" right="0.35" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="22000" windowHeight="14000"/></bookViews><sheets><sheet name="周报" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>`;
const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
const appProps = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Working Hour Web</Application><AppVersion>1.0</AppVersion></Properties>`;
const coreProps = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>工时周报</dc:title><dc:creator>Working Hour</dc:creator><cp:lastModifiedBy>Working Hour</cp:lastModifiedBy></cp:coreProperties>`;
const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="4"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/><numFmt numFmtId="165" formatCode="hh:mm"/><numFmt numFmtId="166" formatCode="0.0"/><numFmt numFmtId="167" formatCode="[$NZ$-en-NZ]#,##0.00"/></numFmts><fonts count="4"><font><sz val="11"/><name val="Aptos"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="16"/><name val="Aptos Display"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="11"/><name val="Aptos"/></font></fonts><fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF4472C4"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE2F0D9"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFD9E2F3"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="14"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="0"><alignment horizontal="center"/></xf><xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0"><alignment horizontal="center"/></xf><xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0"><alignment horizontal="center"/></xf><xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0"><alignment horizontal="right"/></xf><xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0"><alignment horizontal="left"/></xf><xf numFmtId="167" fontId="0" fillId="0" borderId="1" xfId="0"><alignment horizontal="right"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0"><alignment horizontal="center"/></xf><xf numFmtId="167" fontId="0" fillId="5" borderId="1" xfId="0"><alignment horizontal="right"/></xf><xf numFmtId="166" fontId="0" fillId="5" borderId="1" xfId="0"><alignment horizontal="right"/></xf><xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number): Uint8Array { const bytes = new Uint8Array(2); new DataView(bytes.buffer).setUint16(0, value, true); return bytes; }
function u32(value: number): Uint8Array { const bytes = new Uint8Array(4); new DataView(bytes.buffer).setUint32(0, value >>> 0, true); return bytes; }
function join(parts: Uint8Array[]): Uint8Array { const size = parts.reduce((sum, part) => sum + part.length, 0); const output = new Uint8Array(size); let offset = 0; for (const part of parts) { output.set(part, offset); offset += part.length; } return output; }

function zip(files: Array<[string, string]>): Uint8Array {
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of files) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(content);
    const checksum = crc32(data);
    const header = join([u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(checksum), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), nameBytes]);
    local.push(header, data);
    central.push(join([u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(checksum), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nameBytes]));
    offset += header.length + data.length;
  }
  const localBytes = join(local);
  const centralBytes = join(central);
  return join([localBytes, centralBytes, u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(centralBytes.length), u32(localBytes.length), u16(0)]);
}

export function excelFile(data: AppData, selectedDate: string): { blob: Blob; fileName: string } {
  const start = weekStartKey(selectedDate);
  const bytes = zip([
    ["[Content_Types].xml", contentTypes], ["_rels/.rels", rootRels], ["docProps/app.xml", appProps], ["docProps/core.xml", coreProps], ["xl/workbook.xml", workbook], ["xl/_rels/workbook.xml.rels", workbookRels], ["xl/styles.xml", styles], ["xl/worksheets/sheet1.xml", buildSheet(data, selectedDate)],
  ]);
  return {
    blob: new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    fileName: `工时周报_${start}_${addDays(start, 6)}.xlsx`,
  };
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
