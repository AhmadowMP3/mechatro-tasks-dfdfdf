import { describe, expect, test } from "vitest";

import { qrStampHtml } from "./qr-stamp";

describe("qrStampHtml", () => {
  test("an Arabic document's stamp is in Arabic only and reads right to left", () => {
    const html = qrStampHtml("data:image/png;base64,AA", "ar", "light");
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("نسخة للقراءة فقط");
    expect(html).not.toMatch(/Read-only|Scan/);
  });

  test("an English document's stamp is in English only and reads left to right", () => {
    const html = qrStampHtml("data:image/png;base64,AA", "en", "light");
    expect(html).toContain('dir="ltr"');
    expect(html).toContain("Read-only copy");
    expect(html).not.toMatch(/[\u0600-\u06FF]/);
  });
});
