import { access } from "node:fs/promises";
import { constants } from "node:fs";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRef, PDFString } from "pdf-lib";
import { loadConfig } from "../../config/env.js";

let browserPromise: Promise<Browser> | undefined;
let active = 0;
const queue: Array<() => void> = [];
let closing: Promise<void> | undefined;

async function acquire(): Promise<void> {
  if (active < 2) { active++; return; }
  await new Promise<void>(resolve => queue.push(resolve));
}
function release(): void {
  const next = queue.shift();
  if (next) next(); else active--;
}

async function browser(): Promise<Browser> {
  if (!browserPromise) {
    const launch = (async () => {
      const executablePath = loadConfig().reportChromiumPath;
      try { await access(executablePath, constants.X_OK); }
      catch { throw new Error(`REPORT_CHROMIUM_PATH binary is missing or not executable: ${executablePath}`); }
      // Alpine runs as USER node. No sandbox is acceptable for this controlled report
      // pipeline: JavaScript and network are disabled, and callers must HTML-escape
      // customer text. This is not a renderer for arbitrary untrusted HTML documents.
      return puppeteer.launch({ executablePath, headless: true, timeout: 30_000,
        args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--font-render-hinting=none"] });
    })();
    browserPromise = launch;
    void launch.catch(() => { if (browserPromise === launch) browserPromise = undefined; });
  }
  return browserPromise;
}

/** Timeout starts when a queue slot is granted and covers launch, retry and PDF output. */
export async function renderHtmlToPdf(html: string, options?: { timeoutMs?: number }): Promise<Buffer> {
  const timeoutMs = options?.timeoutMs ?? 30_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("PDF timeoutMs must be a positive finite number");
  if (closing) throw new Error("PDF engine is closing");
  await acquire();
  let page: Page | undefined;
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const current = await browser();
      if (expired) throw new Error("PDF render timed out");
      try {
        page = await current.newPage();
        if (expired) { await page.close(); throw new Error("PDF render timed out"); }
        await page.setJavaScriptEnabled(false);
        await page.setRequestInterception(true);
        page.on("request", request => {
          void (request.url().startsWith("data:") ? request.continue() : request.abort()).catch(() => {});
        });
        await page.setContent(html, { waitUntil: "load", timeout: timeoutMs });
        return Buffer.from(await page.pdf({ preferCSSPageSize: true, printBackground: true, timeout: timeoutMs }));
      } catch (error) {
        if (expired || current.connected || attempt === 1) throw error;
        // Only discard the crashed instance; another render may already be relaunching.
        if (browserPromise && await browserPromise.catch(() => undefined) === current) browserPromise = undefined;
      } finally {
        await page?.close().catch(() => {});
        page = undefined;
      }
    }
    throw new Error("PDF browser retry exhausted");
  };
  const task = work();
  // Retain the slot until timed-out work has actually unwound, preventing >2 pages.
  void task.finally(release).catch(() => {});
  try {
    return await Promise.race([task, new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        expired = true;
        void page?.close().catch(() => {});
        reject(new Error(`PDF render timed out after ${timeoutMs} ms`));
      }, timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}

/** Drain admitted renders, then close the shared browser; future calls may relaunch it. */
export async function closePdfEngine(): Promise<void> {
  if (closing) return closing;
  closing = (async () => {
    while (active > 0) await new Promise(resolve => setTimeout(resolve, 10));
    const current = browserPromise;
    browserPromise = undefined;
    await (await current?.catch(() => undefined))?.close();
  })();
  try { await closing; } finally { closing = undefined; }
}

export async function resolveNamedDestinationPages(pdf: Buffer): Promise<Map<string, number>> {
  const doc = await PDFDocument.load(pdf);
  const pages = new Map(doc.getPages().map((page, index) => [page.ref.toString(), index + 1]));
  const result = new Map<string, number>();
  const add = (name: string, value: unknown) => {
    let target = value instanceof PDFRef ? doc.context.lookup(value) : value;
    if (target instanceof PDFDict) target = target.lookup(PDFName.of("D"));
    if (!(target instanceof PDFArray)) throw new Error(`Invalid PDF destination: ${name}`);
    const ref = target.get(0);
    const page = ref instanceof PDFRef ? pages.get(ref.toString()) : undefined;
    if (!page) throw new Error(`Unknown PDF destination page: ${name}`);
    result.set(name, page);
  };
  const dests = doc.catalog.lookupMaybe(PDFName.of("Dests"), PDFDict);
  for (const [name, value] of dests?.entries() ?? []) add(name.decodeText(), value);
  const names = doc.catalog.lookupMaybe(PDFName.of("Names"), PDFDict);
  const root = names?.lookupMaybe(PDFName.of("Dests"), PDFDict);
  const visited = new Set<PDFDict>();
  const walk = (node: PDFDict) => {
    if (visited.has(node)) throw new Error("Cyclic PDF destination name tree");
    visited.add(node);
    const entries = node.lookupMaybe(PDFName.of("Names"), PDFArray);
    if (entries) for (let i = 0; i < entries.size(); i += 2) {
      const name = entries.lookup(i);
      if (!(name instanceof PDFString || name instanceof PDFHexString)) throw new Error("Invalid PDF destination name");
      add(name.decodeText(), entries.get(i + 1));
    }
    const kids = node.lookupMaybe(PDFName.of("Kids"), PDFArray);
    if (kids) for (let i = 0; i < kids.size(); i++) walk(kids.lookup(i, PDFDict));
  };
  if (root) walk(root);
  return result;
}
