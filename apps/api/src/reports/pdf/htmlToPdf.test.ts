import assert from "node:assert/strict";
import { after, mock, test } from "node:test";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { readFile } from "node:fs/promises";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { closePdfEngine, renderHtmlToPdf, resolveNamedDestinationPages } from "./htmlToPdf.js";
import { reportFontFaceCss } from "./reportFonts.js";

const launch = puppeteer.launch.bind(puppeteer);
let lastBrowser: Browser;
const openPages = new Set<Page>();
let maximumPages = 0, launches = 0;
const blocked: string[] = [];
const securityMessages: string[] = [];
let delayPdf = false;
mock.method(puppeteer, "launch", async (...args: Parameters<typeof launch>) => {
  const browser = await launch(...args);
  launches++;
  lastBrowser = browser;
  const newPage = browser.newPage.bind(browser);
  mock.method(browser, "newPage", async () => {
    const page = await newPage();
    openPages.add(page);
    maximumPages = Math.max(maximumPages, openPages.size);
    page.once("close", () => openPages.delete(page));
    page.on("requestfailed", request => blocked.push(request.url()));
    page.on("console", message => securityMessages.push(message.text()));
    const print = page.pdf.bind(page);
    mock.method(page, "pdf", async (...args: Parameters<typeof print>) => {
      if (delayPdf) await new Promise(resolve => setTimeout(resolve, 250));
      return print(...args);
    });
    return page;
  });
  return browser;
});

// Copied ToUnicode strategy from finalServiceReport.test.ts: decode bfchar/bfrange
// and hex glyph runs. Chromium uses per-font maps, so select the map with Tf.
async function extractPdfText(pdf: Buffer): Promise<string[]> {
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
const html = (body: string, css = "") => `<style>${reportFontFaceCss()} @page {size:A4 landscape; margin:15mm; @bottom-center {content:"Page " counter(page) " of " counter(pages); font-family:"Noto Sans"}} body{font-family:"Noto Sans","DejaVu Sans",sans-serif} section{break-before:page}${css}</style>${body}`;
after(closePdfEngine);

test("real Chromium: A4 landscape, margin counters and named destinations on three known pages", async () => {
  const pdf = await renderHtmlToPdf(html('<a href="#sys-1">One</a><a href="#sys-2">Two</a><a href="#sys-3">Three</a><h1 id="sys-1">First</h1><section id="sys-2">Second</section><section id="sys-3">Third</section>'));
  const doc = await PDFDocument.load(pdf);
  assert.equal(doc.getPageCount(), 3);
  doc.getPages().forEach(page => { assert.ok(Math.abs(page.getWidth()-842)<1); assert.ok(Math.abs(page.getHeight()-595)<1); });
  const text = await extractPdfText(pdf);
  text.forEach((page, i) => assert.ok(page.includes(`Page ${i+1} of 3`), page));
  const destinations = await resolveNamedDestinationPages(pdf);
  assert.deepEqual([...destinations], [["sys-1",1],["sys-2",2],["sys-3",3]]);
  console.log("Named destination proof:", Object.fromEntries(destinations));
});

test("60-row table repeats its thead on page two", async () => {
  const pdf = await renderHtmlToPdf(html(`<table><thead><tr><th>Repeated heading</th></tr></thead><tbody>${Array.from({length:60},(_,i)=>`<tr><td>Row ${i+1}</td></tr>`).join("")}</tbody></table>`, "td{height:22px} tr{break-inside:avoid}"));
  const pages = await extractPdfText(pdf);
  assert.ok(pages.length >= 2);
  assert.ok(pages[0].includes("Repeated heading"));
  assert.ok(pages[1].includes("Repeated heading"));
  assert.ok(pages.join("").includes("Row 60"));
});

test("bundled fallback glyphs are present and never .notdef", async () => {
  const pdf = await renderHtmlToPdf(html("<p>✓ ✗ ◯</p>"));
  const text = (await extractPdfText(pdf)).join("");
  for (const symbol of ["✓", "✗", "◯"]) assert.ok(text.includes(symbol), text);
  assert.match(pdf.toString("latin1"), /DejaVuSans/);
});

test("JavaScript cannot change the document and network/file resources cannot load", async () => {
  const { createServer } = await import("node:http");
  let requests = 0;
  const server = createServer((_, response) => { requests++; response.end("external"); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as {port:number};
    const pdf = await renderHtmlToPdf(html(`<p id="text">UNCHANGED</p><script>document.getElementById('text').textContent='MUTATED'</script><img src="http://127.0.0.1:${address.port}/image"><iframe src="file:///etc/passwd"></iframe>`));
    const text = (await extractPdfText(pdf)).join("");
    assert.ok(text.includes("UNCHANGED")); assert.ok(!text.includes("MUTATED")); assert.ok(!text.includes("root:"));
    assert.equal(requests, 0);
    assert.ok(blocked.some(url => url.startsWith("http://127.0.0.1:")));
    // Chromium rejects file subresources at its origin boundary before interception.
    assert.ok(blocked.includes("file:///etc/passwd") || securityMessages.some(message => message.includes("Not allowed to load local resource") && message.includes("file:///etc/passwd")));
  } finally { server.close(); }
});

test("timeout releases capacity; three queued renders succeed", async () => {
  maximumPages = 0;
  await assert.rejects(renderHtmlToPdf(html("timeout"), {timeoutMs:1}), /timed out|Timeout/i);
  delayPdf = true;
  const buffers = await Promise.all([1,2,3].map(i => renderHtmlToPdf(html(`Parallel ${i}`))));
  delayPdf = false;
  for (let i=0;i<buffers.length;i++) assert.ok((await extractPdfText(buffers[i])).join("").includes(`Parallel ${i+1}`));
  assert.equal(maximumPages, 2, `maximum concurrent pages: ${maximumPages}`);
});

test("disconnected shared browser is relaunched once", async () => {
  const before = launches;
  await lastBrowser.close();
  const pdf = await renderHtmlToPdf(html("Recovered"));
  assert.ok((await extractPdfText(pdf)).join("").includes("Recovered"));
  assert.equal(launches, before + 1);
});

test("approved sample with bundled font stack renders exactly nine pages", async () => {
  const template = await readFile(new URL("../../../../../docs/report-template/mfe-service-report-template.html", import.meta.url), "utf8");
  const source = template.replaceAll(/"Noto Sans", Arial,(?: Helvetica,)? sans-serif/g, '"Noto Sans", "DejaVu Sans", sans-serif').replace("<style>", `<style>${reportFontFaceCss()}`);
  const pdf = await renderHtmlToPdf(source);
  assert.equal((await PDFDocument.load(pdf)).getPageCount(), 9);
});

test("missing configured binary fails clearly without fallback", async () => {
  await closePdfEngine();
  const before = process.env.REPORT_CHROMIUM_PATH;
  process.env.REPORT_CHROMIUM_PATH = "/does-not-exist/report-chromium";
  try { await assert.rejects(renderHtmlToPdf("missing"), /REPORT_CHROMIUM_PATH binary is missing/); }
  finally { if (before === undefined) delete process.env.REPORT_CHROMIUM_PATH; else process.env.REPORT_CHROMIUM_PATH = before; }
});
