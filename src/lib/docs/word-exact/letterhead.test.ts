import { describe, expect, test } from "vitest";

import {
  A4_HEIGHT_PX,
  BAND_GAP_PX,
  bandsFrom,
  fillQrSlot,
  letterheadFontFaces,
  letterheadFontStack,
  letterheadLockCss,
} from "./letterhead";

describe("bandsFrom", () => {
  test("content starts under the header and ends above the footer with a gap", () => {
    const b = bandsFrom({ headerPx: 180.4, footerPx: 120.2, bodyTop: 196.4, footerTop: A4_HEIGHT_PX - 120.2 });
    expect(b.lock).toEqual({ headerPx: 181, footerPx: 121 });
    expect(b.topPx).toBe(197);
    expect(b.bottomPx).toBe(Math.ceil(121 + BAND_GAP_PX));
  });

  test("rounding the lock up never leaves the content less room than the bands", () => {
    // A body measured as starting inside the (rounded-up) header is pushed below it.
    const b = bandsFrom({ headerPx: 200.9, footerPx: 99.1, bodyTop: 200.2, footerTop: A4_HEIGHT_PX - 99.1 });
    expect(b.topPx).toBeGreaterThanOrEqual(b.lock.headerPx);
    expect(A4_HEIGHT_PX - b.bottomPx).toBeLessThanOrEqual(A4_HEIGHT_PX - b.lock.footerPx);
  });
});

describe("QR strip", () => {
  test("the stamp goes inside the QR strip, as rendered by React", () => {
    const sheet = `<div><div data-doc-body-content="true"></div><div data-qr-slot="true" style="height:92px"></div><div data-doc-footer="true">f</div></div>`;
    const out = fillQrSlot(sheet, `<i>QR</i>`);
    expect(out).toContain(`<div data-qr-slot="true" style="height:92px"><i>QR</i></div>`);
    expect(out).toContain(`<div data-doc-footer="true">f</div>`);
  });

  test("a sheet without a QR strip is left as it is", () => {
    const sheet = `<div><div data-doc-footer="true">f</div></div>`;
    expect(fillQrSlot(sheet, `<i>QR</i>`)).toBe(sheet);
  });
});

describe("letterhead HTML pieces", () => {
  test("locks both bands to the measured heights", () => {
    const css = letterheadLockCss({ headerPx: 181, footerPx: 121 });
    expect(css).toMatch(/\[data-doc-header\][^}]*height: 181px !important/);
    expect(css).toMatch(/\[data-doc-footer\][^}]*height: 121px !important/);
    expect(letterheadLockCss(undefined)).toBe("");
  });

  test("embeds only the fonts it was given, and never falls back to system fonts", () => {
    const faces = letterheadFontFaces({ arabic: "QUJD", latin: null });
    expect(faces).toContain("font-family: 'LH Arabic'");
    expect(faces).toContain("base64,QUJD");
    expect(faces).not.toContain("LH Latin");
    expect(letterheadFontStack("ar")).toBe("'LH Arabic', 'LH Latin'");
    expect(letterheadFontStack("en")).not.toMatch(/sans-serif|system-ui|Almarai/);
  });
});
