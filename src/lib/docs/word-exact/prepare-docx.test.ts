import JSZip from "jszip";
import { describe, expect, test } from "vitest";

import { assertNoActiveContent, prepareDocxForLetterhead, rewriteDocumentXml } from "./prepare-docx";

const bands = { topPx: 200, bottomPx: 160 };

const body = (sectPr: string) =>
  `<w:document><w:body><w:p><w:r><w:rPr><w:color w:val="FF0000"/></w:rPr><w:t>نص</w:t></w:r></w:p>${sectPr}</w:body></w:document>`;

describe("rewriteDocumentXml", () => {
  test("unlinks the file's header/footer and widens top/bottom margins", () => {
    const xml = body(
      `<w:sectPr w:rsidR="1"><w:headerReference w:type="default" r:id="rId8"/><w:footerReference w:type="default" r:id="rId9"/>` +
        `<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="994" w:right="994" w:bottom="994" w:left="994" w:header="706" w:footer="706" w:gutter="0"/>` +
        `<w:cols w:space="720"/><w:titlePg/><w:docGrid w:linePitch="360"/></w:sectPr>`,
    );
    const res = rewriteDocumentXml(xml, bands);

    expect(res.sections).toBe(1);
    expect(res.xml).not.toMatch(/headerReference|footerReference|titlePg/);
    expect(res.xml).toContain(`w:top="3000"`);
    expect(res.xml).toContain(`w:bottom="2400"`);
    // Side margins come from the Word file untouched.
    expect(res.xml).toContain(`w:right="994"`);
    expect(res.xml).toContain(`w:left="994"`);
    // Page setup stays ahead of <w:cols> as the schema requires.
    expect(res.xml.indexOf("<w:pgMar")).toBeLessThan(res.xml.indexOf("<w:cols"));
  });

  test("leaves the body content byte-for-byte untouched", () => {
    const xml = body(`<w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>`);
    const res = rewriteDocumentXml(xml, bands);
    expect(res.xml.startsWith(`<w:document><w:body><w:p><w:r><w:rPr><w:color w:val="FF0000"/></w:rPr><w:t>نص</w:t></w:r></w:p>`)).toBe(true);
  });

  test("forces A4 and keeps landscape sections landscape", () => {
    const xml = body(
      `<w:p><w:pPr><w:sectPr><w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/></w:sectPr></w:pPr></w:p>` +
        `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>`,
    );
    const res = rewriteDocumentXml(xml, bands);
    expect(res.sections).toBe(2);
    expect(res.landscapeSections).toBe(1);
    expect(res.xml).toContain(`<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>`);
    expect(res.xml).toContain(`<w:pgSz w:w="11906" w:h="16838"/>`);
  });

  test("handles self-closing and tracked-change section properties", () => {
    const xml = body(`<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:sectPrChange w:id="1"><w:sectPr><w:pgSz w:w="1" w:h="1"/></w:sectPr></w:sectPrChange></w:sectPr>`);
    const res = rewriteDocumentXml(xml, bands);
    expect(res.sections).toBe(1);
    expect(res.xml).not.toContain("sectPrChange");
    expect(rewriteDocumentXml(body("<w:sectPr/>"), bands).xml).toContain(`w:top="3000"`);
  });

  test("counts floating shapes anchored to the page", () => {
    const xml = body(`<wp:anchor><wp:positionV relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionV></wp:anchor><w:sectPr/>`);
    expect(rewriteDocumentXml(xml, bands).pageAnchoredShapes).toBe(1);
  });
});

describe("prepareDocxForLetterhead", () => {
  test("round-trips a .docx and keeps every other part", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", body(`<w:sectPr><w:headerReference w:type="default" r:id="rId8"/></w:sectPr>`));
    zip.file("word/header1.xml", "<w:hdr/>");
    zip.file("word/media/image1.png", new Uint8Array([1, 2, 3]));
    const src = await zip.generateAsync({ type: "uint8array" });

    const res = await prepareDocxForLetterhead(src, bands);
    const out = await JSZip.loadAsync(res.docx);

    expect(await out.file("word/document.xml")!.async("string")).not.toContain("headerReference");
    expect(out.file("word/header1.xml")).not.toBeNull();
    expect(Array.from(await out.file("word/media/image1.png")!.async("uint8array"))).toEqual([1, 2, 3]);
  });

  test("adds section properties to a body that has none", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", `<w:document><w:body><w:p/></w:body></w:document>`);
    const res = await prepareDocxForLetterhead(await zip.generateAsync({ type: "uint8array" }), bands);
    const xml = await (await JSZip.loadAsync(res.docx)).file("word/document.xml")!.async("string");
    expect(xml).toContain(`<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>`);
  });

  test("rejects macro-enabled content", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", body("<w:sectPr/>"));
    zip.file("word/vbaProject.bin", new Uint8Array([0]));
    const bytes = await zip.generateAsync({ type: "uint8array" });
    await expect(prepareDocxForLetterhead(bytes, bands)).rejects.toThrow("word_has_macros");
    await expect(assertNoActiveContent(bytes)).rejects.toThrow("word_has_macros");
  });

  test("rejects files that are not Word documents", async () => {
    const zip = new JSZip();
    zip.file("hello.txt", "hi");
    await expect(prepareDocxForLetterhead(await zip.generateAsync({ type: "uint8array" }), bands)).rejects.toThrow("not_a_word_document");
  });
});
