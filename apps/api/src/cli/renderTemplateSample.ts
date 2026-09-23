import { readFile, writeFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { closePdfEngine, renderHtmlToPdf } from "../reports/pdf/htmlToPdf.js";
import { reportFontFaceCss } from "../reports/pdf/reportFonts.js";

try {
  if (!process.argv[2]) throw new Error("Usage (development only): renderTemplateSample <input-template.html> [output.pdf]; the production image does not contain docs.");
  const source = await readFile(process.argv[2], "utf8");
  const html = source.replaceAll(/"Noto Sans", Arial,(?: Helvetica,)? sans-serif/g, '"Noto Sans", "DejaVu Sans", sans-serif')
    .replace("<style>", `<style>${reportFontFaceCss()}`);
  const pdf = await renderHtmlToPdf(html);
  const output = process.argv[3] ?? "/tmp/mfe-service-report-template.pdf";
  await writeFile(output, pdf);
  console.log(`Rendered ${output}: ${(await PDFDocument.load(pdf)).getPageCount()} pages, ${pdf.length} bytes`);
} finally { await closePdfEngine(); }
