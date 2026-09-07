import * as pdfjs from './node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';

// Polyfills for pdfjs 6+
if (typeof Map.prototype.getOrInsert !== 'function') {
  Map.prototype.getOrInsert = function(key, value) {
    if (!this.has(key)) this.set(key, value);
    return this.get(key);
  };
}
if (typeof Map.prototype.getOrInsertComputed !== 'function') {
  Map.prototype.getOrInsertComputed = function(key, fn) {
    if (!this.has(key)) this.set(key, fn(key));
    return this.get(key);
  };
}
if (typeof Promise.try !== 'function') {
  Promise.try = function(fn, ...args) {
    return new Promise((resolve, reject) => {
      try {
        resolve(fn(...args));
      } catch (err) {
        reject(err);
      }
    });
  };
}

const data = new Uint8Array(fs.readFileSync('/mnt/user-uploads/Mktro_QT_014_06_09_26_مجمع_حطين_شركة_البنيان.pdf'));

const doc = await pdfjs.getDocument({
  data,
  isEvalSupported: false,
  useSystemFonts: true,
  disableFontFace: true,
}).promise;

console.log(`PDF loaded: ${doc.numPages} pages`);

for (let p = 1; p <= Math.min(doc.numPages, 2); p++) {
  const page = await doc.getPage(p);
  const ops = await page.getOperatorList();
  const OPS = pdfjs.OPS;
  
  console.log(`\n--- Page ${p} ---`);
  
  const opCounts = {};
  for (const fn of ops.fnArray) {
    opCounts[fn] = (opCounts[fn] || 0) + 1;
  }
  
  const interesting = [
    'constructPath', 'rectangle', 'fill', 'stroke', 'fillStroke', 
    'eoFill', 'showText', 'showTextGL', 'paintImageXObject', 
    'setFillRGBColor', 'setStrokeRGBColor', 'setGState'
  ];
  
  interesting.forEach(name => {
    const code = OPS[name];
    if (opCounts[code]) {
      console.log(`${name}: ${opCounts[code]}`);
    }
  });

  console.log("Sampling first 10 path/rect/color operators:");
  let sampled = 0;
  for (let i = 0; i < ops.fnArray.length && sampled < 10; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i];
    if ([OPS.rectangle, OPS.constructPath, OPS.fill, OPS.stroke, OPS.setFillRGBColor].includes(fn)) {
      console.log(`Op ${i}: ${Object.keys(OPS).find(k => OPS[k] === fn)}`, JSON.stringify(args));
      sampled++;
    }
  }

  const content = await page.getTextContent();
  console.log(`Text fragments: ${content.items.length}`);
}

process.exit(0);
