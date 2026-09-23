import assert from "node:assert/strict";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from "pdf-lib";
export async function extractPdfText(pdf: Buffer): Promise<string[]> {
  const doc = await PDFDocument.load(pdf);
  const decode = (stream: PDFRawStream) => Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1");
  return doc.getPages().map(page => {
    const fonts = page.node.Resources()!.lookup(PDFName.of("Font"), PDFDict);
    const maps = new Map<string, Map<number, string>>();
    for (const [name] of fonts.entries()) {
      const font = fonts.lookup(name, PDFDict);
      const cmap = font.lookup(PDFName.of("ToUnicode"));
      if (!(cmap instanceof PDFRawStream)) continue;
      const text = decode(cmap), map = new Map<number, string>();
      const utf16 = (hex: string) => { let out = ""; for (let i = 0; i + 4 <= hex.length; i += 4) out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16)); return out; };
      for (const block of text.match(/beginbfchar([\s\S]*?)endbfchar/g) ?? []) {
        for (const pair of block.matchAll(/<([\da-f]+)>\s*<([\da-f]+)>/gi)) map.set(parseInt(pair[1], 16), utf16(pair[2]));
      }
      for (const block of text.match(/beginbfrange([\s\S]*?)endbfrange/g) ?? []) {
        for (const row of block.matchAll(/<([\da-f]+)>\s*<([\da-f]+)>\s*\[([^\]]*)\]/gi)) {
          [...row[3].matchAll(/<([\da-f]+)>/gi)].forEach((entry, offset) => map.set(parseInt(row[1], 16) + offset, utf16(entry[1])));
        }
        for (const row of block.replace(/\[[\s\S]*?\]/g, " ").matchAll(/<([\da-f]+)>\s*<([\da-f]+)>\s*<([\da-f]+)>/gi)) {
          const start = parseInt(row[1], 16), end = parseInt(row[2], 16), dst = parseInt(row[3], 16);
          for (let code = start; code <= end; code++) map.set(code, String.fromCodePoint(dst + code - start));
        }
      }
      maps.set(name.decodeText(), map);
    }
    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray ? Array.from({length: contents.size()}, (_, i) => contents.lookup(i, PDFRawStream)) : [contents as PDFRawStream];
    let result = "", current: Map<number, string> | undefined;
    for (const stream of streams) for (const token of decode(stream).matchAll(/\/(\w+)\s+[\d.]+\s+Tf|<([\da-f]+)>/gi)) {
      if (token[1]) current = maps.get(token[1]);
      else for (let i = 0; i < token[2].length; i += 4) {
        const code = parseInt(token[2].slice(i, i + 4), 16);
        assert.notEqual(code, 0, "rendered text must not use .notdef glyph");
        result += current?.get(code) ?? "";
      }
    }
    return result;
  });
}
