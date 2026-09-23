import { writeFile } from "node:fs/promises";
import { renderReportViewModelPdf } from "../reports/finalServiceReport.js";
import { sampleViewModel } from "../reports/template/sampleFixture.js";
import { closePdfEngine, resolveNamedDestinationPages } from "../reports/pdf/htmlToPdf.js";
import { extractPdfText } from "../reports/pdf/extractPdfText.testSupport.js";
try {
 if (!process.argv[2]) throw new Error("Usage (development only): renderReportSample <output.pdf>");
 const pdf=await renderReportViewModelPdf(sampleViewModel());
 const pages=await extractPdfText(pdf);
 for (const glyph of ["✓","✗","◯"]) if (!pages.join("").includes(glyph)) throw new Error(`Missing glyph ${glyph}`);
 await writeFile(process.argv[2],pdf);
 console.log(JSON.stringify({pages:pages.length,destinations:Object.fromEntries(await resolveNamedDestinationPages(pdf)),glyphs:"✓ ✗ ◯ present; zero .notdef",output:process.argv[2]}));
} finally { await closePdfEngine(); }
