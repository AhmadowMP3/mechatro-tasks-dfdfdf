// Purely programmatic field extraction from an imported Word document.
// No AI, no network: everything is derived from the file's own text and tables
// with deterministic rules, so the import works offline and instantly.

export type DocxItem = {
  no: string | null;
  descAr: string | null;
  descEn: string | null;
  unit: string | null;
  qty: number | null;
  price: number | null;
  total: number | null;
};

export type DocxExtraction = {
  docType: string | null;
  title: string | null;
  number: string | null;
  issueDate: string | null;
  validUntil: string | null;
  currency: string | null;
  lang: "ar" | "en" | null;
  client: {
    nameAr: string | null;
    nameEn: string | null;
    attn: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    taxNumber: string | null;
    refAr: string | null;
    refEn: string | null;
  };
  items: DocxItem[];
  missing: string[];
};

const ARABIC = /[\u0600-\u06FF]/;

const clean = (s: string) =>
  s.replace(/\u00a0/g, " ").replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "").replace(/\s+/g, " ").trim();

const isAr = (s: string) => ARABIC.test(s);

/* ── numbers & dates ──────────────────────────────────────────── */

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

function toLatinDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
}

export function parseNum(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const t = toLatinDigits(String(raw))
    .replace(/[^\d.,\-]/g, "")
    .replace(/,(?=\d{3}\b)/g, "")
    .replace(/,/g, ".");
  if (!t || t === "-" || t === ".") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Normalise the common Word date shapes into ISO (yyyy-mm-dd). */
export function parseDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = toLatinDigits(String(raw)).trim();

  let m = /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(t);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${pad(Number(mo))}-${pad(Number(d))}`;
  }
  m = /(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/.exec(t);
  if (m) {
    let [, d, mo, y] = m;
    // dd/mm/yyyy is the house style; swap only when clearly mm/dd.
    if (Number(d) <= 12 && Number(mo) > 12) [d, mo] = [mo, d];
    return `${y}-${pad(Number(mo))}-${pad(Number(d))}`;
  }
  const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  m = /(\d{1,2})\s+([A-Za-z]{3,})\.?,?\s+(\d{4})/.exec(t);
  if (m) {
    const idx = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (idx >= 0) return `${m[3]}-${pad(idx + 1)}-${pad(Number(m[1]))}`;
  }
  m = /([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(t);
  if (m) {
    const idx = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    if (idx >= 0) return `${m[3]}-${pad(idx + 1)}-${pad(Number(m[2]))}`;
  }
  return null;
}

/* ── document type ────────────────────────────────────────────── */

const TYPE_RULES: Array<{ type: string; re: RegExp }> = [
  { type: "proforma_invoice", re: /(proforma|pro\s*forma|فاتورة\s*مبدئية|فاتورة\s*أولية)/i },
  { type: "purchase_order", re: /(purchase\s*order|\bP\.?O\.?\b|أمر\s*شراء|طلب\s*شراء)/i },
  { type: "invoice", re: /(invoice|فاتورة)/i },
  { type: "rfq", re: /(request\s*for\s*quotation|\bRFQ\b|طلب\s*عرض\s*سعر)/i },
  { type: "quotation", re: /(quotation|quote|عرض\s*سعر|عرض\s*أسعار)/i },
  { type: "offer", re: /(offer|عرض\s*فني|عرض\s*تجاري)/i },
];

function detectType(text: string): string | null {
  const head = text.slice(0, 4000);
  for (const r of TYPE_RULES) if (r.re.test(head)) return r.type;
  for (const r of TYPE_RULES) if (r.re.test(text)) return r.type;
  return null;
}

/* ── currency ─────────────────────────────────────────────────── */

const CURRENCY_RULES: Array<{ code: string; re: RegExp }> = [
  { code: "SAR", re: /(\bSAR\b|\bSR\b|ر\.?\s?س|ريال\s*سعودي|﷼)/i },
  { code: "SYP", re: /(\bSYP\b|ل\.?\s?س|ليرة\s*سوري)/i },
  { code: "AED", re: /(\bAED\b|درهم)/i },
  { code: "TRY", re: /(\bTRY\b|₺|ليرة\s*تركي)/i },
  { code: "EUR", re: /(\bEUR\b|€|يورو)/i },
  { code: "USD", re: /(\bUSD\b|\$|دولار)/i },
];

function detectCurrency(text: string): string | null {
  for (const r of CURRENCY_RULES) if (r.re.test(text)) return r.code;
  return null;
}

/* ── labelled values ──────────────────────────────────────────── */

/** Value written after a label on the same line ("الهاتف: 099…"). */
function afterLabel(lines: string[], labels: RegExp): string | null {
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const m = labels.exec(line);
    if (!m) continue;
    const rest = clean(line.slice(m.index + m[0].length).replace(/^[\s:：\-–—|]+/, ""));
    if (rest) return rest;
    const next = clean(lines[i + 1] ?? "");
    if (next && !labels.test(next)) return next;
  }
  return null;
}

const REF_RE = /(?:رقم\s*(?:المرجع|العرض|الفاتورة|المستند)?|المرجع|Ref(?:erence)?|No\.?|Number|Quotation\s*No)/i;

function detectNumber(lines: string[], text: string, fileName: string): string | null {
  const labelled = afterLabel(lines, REF_RE);
  if (labelled) {
    const m = /([A-Za-z]{0,6}[-_/]?\d[\w\-_/]*)/.exec(toLatinDigits(labelled));
    if (m) return m[1].replace(/[_]/g, "-");
  }
  const inText = /\b([A-Z]{2,5}[-_/]\d{2,6}(?:[-_/]\d{2,6})?)\b/.exec(toLatinDigits(text));
  if (inText) return inText[1].replace(/[_]/g, "-");
  const inName = /(?:^|[_\-\s])([A-Z]{2,5})[_\-](\d{2,6})(?:[_\-]|\.)/.exec(fileName);
  if (inName) return `${inName[1]}-${inName[2]}`;
  return null;
}

function detectTitle(lines: string[], fallbackType: string | null): string | null {
  for (const raw of lines.slice(0, 25)) {
    const line = clean(raw);
    if (!line || line.length < 4 || line.length > 160) continue;
    if (/^\|/.test(line) || /^\[/.test(line)) continue;
    if (REF_RE.test(line) && /\d/.test(line)) continue;
    if (/^#\s*/.test(line)) return clean(line.replace(/^#\s*/, ""));
    if (TYPE_RULES.some((r) => r.re.test(line))) return line;
  }
  for (const raw of lines.slice(0, 12)) {
    const line = clean(raw.replace(/^#\s*/, ""));
    if (line.length >= 6 && line.length <= 160 && !/^\|/.test(line)) return line;
  }
  return fallbackType;
}

/* ── items table ──────────────────────────────────────────────── */

const H_DESC = /(الوصف|البيان|التفاصيل|الصنف|البند|description|item|details|scope)/i;
const H_QTY = /(الكمية|العدد|qty|quantity)/i;
const H_PRICE = /(السعر|سعر\s*الوحدة|unit\s*price|price|rate)/i;
const H_UNIT = /(الوحدة|unit|uom)/i;
const H_TOTAL = /(الإجمالي|المجموع|الاجمالي|total|amount)/i;
const H_NO = /^(#|م|رقم|no\.?|s\/?n|sr)$/i;

function extractItemsFromHtml(html: string): DocxItem[] {
  if (typeof document === "undefined") return [];
  const host = document.createElement("div");
  host.innerHTML = html;

  for (const table of Array.from(host.querySelectorAll("table"))) {
    const rows = Array.from(table.querySelectorAll("tr"));
    if (rows.length < 2) continue;
    const header = Array.from(rows[0].children).map((c) => clean(c.textContent ?? ""));
    if (header.length < 2) continue;

    const find = (re: RegExp) => header.findIndex((h) => re.test(h));
    const iDesc = find(H_DESC);
    const iQty = find(H_QTY);
    const iPrice = find(H_PRICE);
    if (iDesc < 0 || (iQty < 0 && iPrice < 0)) continue;

    const iUnit = find(H_UNIT);
    const iTotal = find(H_TOTAL);
    const iNo = header.findIndex((h) => H_NO.test(h));

    const items: DocxItem[] = [];
    for (const tr of rows.slice(1)) {
      const cells = Array.from(tr.children).map((c) => clean(c.textContent ?? ""));
      if (cells.every((c) => !c)) continue;
      const desc = cells[iDesc] ?? "";
      const qty = iQty >= 0 ? parseNum(cells[iQty]) : null;
      const price = iPrice >= 0 ? parseNum(cells[iPrice]) : null;
      if (!desc && qty == null && price == null) continue;
      // Skip totals / summary rows.
      if (!desc && (qty == null || price == null)) continue;
      if (/^(الإجمالي|المجموع|الاجمالي|total|subtotal|grand\s*total)/i.test(desc)) continue;

      items.push({
        no: iNo >= 0 ? cells[iNo] || null : null,
        descAr: isAr(desc) ? desc : null,
        descEn: isAr(desc) ? null : desc || null,
        unit: iUnit >= 0 ? cells[iUnit] || null : null,
        qty,
        price,
        total: iTotal >= 0 ? parseNum(cells[iTotal]) : null,
      });
    }
    if (items.length) return items;
  }
  return [];
}

/* ── main ─────────────────────────────────────────────────────── */

export function extractDocxFields(input: {
  html: string;
  text: string;
  digest?: string;
  fileName?: string;
  lang?: "ar" | "en";
}): DocxExtraction {
  const source = clean(input.text).length > 10 ? input.text : (input.digest ?? "");
  const lines = (input.digest || source)
    .split(/\r?\n/)
    .map((l) => clean(l))
    .filter(Boolean);
  const text = lines.join("\n");
  const fileName = input.fileName ?? "";

  const docType = detectType(`${fileName}\n${text}`);
  const number = detectNumber(lines, text, fileName);
  const issueDate =
    parseDate(afterLabel(lines, /(تاريخ\s*(?:الإصدار|الاصدار)?|Issue\s*Date|Date)/i)) ??
    parseDate(text);
  const validUntil = parseDate(
    afterLabel(lines, /(صالح\s*(?:حتى|لغاية)|سريان|Valid\s*(?:until|till|to)|Expiry)/i),
  );

  const nameLine = afterLabel(lines, /(السادة|العميل|اسم\s*العميل|Client|Customer|Messrs|M\/s|To)\b/i);
  const attn = afterLabel(lines, /(عناية|لعناية|Attn\.?|Attention|A\/?C)/i);
  const phone = afterLabel(lines, /(الهاتف|الجوال|جوال|موبايل|Tel\.?|Phone|Mobile)/i);
  const emailMatch = /[\w.+-]+@[\w-]+\.[\w.]{2,}/.exec(text);
  const address = afterLabel(lines, /(العنوان|الموقع|Address|Location)/i);
  const taxNumber = afterLabel(lines, /(الرقم\s*الضريبي|الرقم\s*الضريبى|VAT\s*(?:No\.?|Number)?|Tax\s*(?:No\.?|Number|ID))/i);

  const client = {
    nameAr: nameLine && isAr(nameLine) ? nameLine : null,
    nameEn: nameLine && !isAr(nameLine) ? nameLine : null,
    attn: attn ?? null,
    phone: phone ? toLatinDigits(phone).replace(/[^\d+\-\s()]/g, "").trim() || null : null,
    email: emailMatch ? emailMatch[0] : null,
    address: address ?? null,
    taxNumber: taxNumber ? toLatinDigits(taxNumber).replace(/[^\d]/g, "") || null : null,
    refAr: null,
    refEn: null,
  };

  const items = extractItemsFromHtml(input.html);

  const out: DocxExtraction = {
    docType,
    title: detectTitle(lines, null),
    number,
    issueDate,
    validUntil,
    currency: detectCurrency(text),
    lang: input.lang ?? (isAr(text) ? "ar" : "en"),
    client,
    items,
    missing: [],
  };

  const missing: string[] = [];
  if (!out.number) missing.push("number");
  if (!out.issueDate) missing.push("issueDate");
  if (!client.nameAr && !client.nameEn) missing.push("client");
  if (items.length === 0) missing.push("items");
  out.missing = missing;

  return out;
}
