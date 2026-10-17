// Test PDF: A4 pages as displayed have a red header band (top 60pt), a blue
// body and a green footer band (bottom 40pt), drawn in each page's own
// coordinates for its /Rotate — so a correct crop leaves only blue.

import { degrees, PDFDocument, rgb } from "pdf-lib";

import { A4_PT } from "../pdf-exact";

export async function bandedPdf(rotations: (0 | 90 | 180 | 270)[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const rot of rotations) {
    const quarter = rot === 90 || rot === 270;
    const [W, H] = quarter ? [A4_PT.height, A4_PT.width] : [A4_PT.width, A4_PT.height];
    const page = doc.addPage([W, H]);
    page.setRotation(degrees(rot));
    const band = (from: number, to: number, color: ReturnType<typeof rgb>) => {
      switch (rot) {
        case 0: page.drawRectangle({ x: 0, y: H - to, width: W, height: to - from, color }); break;
        case 180: page.drawRectangle({ x: 0, y: from, width: W, height: to - from, color }); break;
        case 90: page.drawRectangle({ x: from, y: 0, width: to - from, height: H, color }); break;
        case 270: page.drawRectangle({ x: W - to, y: 0, width: to - from, height: H, color }); break;
      }
    };
    const shownH = quarter ? W : H;
    band(0, 60, rgb(1, 0, 0));
    band(70, shownH - 50, rgb(0, 0, 1));
    band(shownH - 40, shownH, rgb(0, 0.6, 0));
  }
  return doc.save();
}
