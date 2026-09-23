import assert from "node:assert/strict";
import { after, test } from "node:test";
import { readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { loadConfig } from "../../config/env.js";
import { renderReportHtml, escapeHtml, checklist } from "./renderReportHtml.js";
import { sampleViewModel } from "./sampleFixture.js";
import { buildReportViewModel, reportResult, summaryMainFinding } from "../reportViewModel.js";
import { renderReportViewModelPdf, renderFinalServiceReportPdf } from "../finalServiceReport.js";
import { closePdfEngine, resolveNamedDestinationPages } from "../pdf/htmlToPdf.js";
import { extractPdfText } from "../pdf/extractPdfText.testSupport.js";
import { PDFDocument } from "pdf-lib";
after(closePdfEngine);
const normalized = (html: string) => html.replace(/src:url\(data:[^)]+\)/g, "src:url(BUNDLED_FONT)");
test("approved Hokuden four-system HTML snapshot", () => {
 assert.equal(normalized(renderReportHtml(sampleViewModel())),readFileSync(new URL('./sample.snapshot.html',import.meta.url),'utf8'));
});
test("all untrusted text remains text and margin-box CSS strings retain their value", async () => {
 const attack = '<script>alert(1)</script> "><img src=x onerror=alert(1)> </style> "} \\ {{customer}}';
 const vm=sampleViewModel();vm.cover.customer=attack;vm.cover.reportNumber=attack;vm.systemPages[0].remarks[0].text=attack;vm.systemPages[0].photos[0].caption=attack;vm.systemPages[0].title=attack;
 vm.cover.systemsServiced[0].label=attack;
 const block=vm.systemPages[0].blocks[0];if(block.kind==='checklist')block.rows[0].label=attack;
 const html=renderReportHtml(vm);assert.ok(html.includes(escapeHtml(attack)));assert.equal((html.match(/<style>/g)||[]).length,1);assert.equal((html.match(/<\/style>/g)||[]).length,1);assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img src=x'));
 const browser=await puppeteer.launch({executablePath:loadConfig().reportChromiumPath,headless:true,args:['--no-sandbox']});
 try {const page=await browser.newPage();await page.setJavaScriptEnabled(false);await page.setContent(html);const data=await page.evaluate(()=>({scripts:document.scripts.length,css:[...document.styleSheets[0].cssRules].map(r=>r.cssText).join('\n'),text:document.body.textContent}));assert.equal(data.scripts,0);assert.ok(data.text?.includes(attack));assert.match(data.css,/@bottom-center/);assert.match(data.css,/counter\(pages\)/);assert.match(data.css,/@top-right/);assert.match(data.css,/@bottom-right/);
 } finally {await browser.close()}
});
test("blank fields stay empty; no invented values; empty comments are a ruled box",()=>{
 const vm=buildReportViewModel({customer:'Test',site:'Site',serviceDate:'2026-09-18',jobReference:'Job',completedAt:'2026-09-18T00:00:00Z',completedBy:'Inspector',systems:[],sections:[{systemKey:'test',label:'System',fields:[],evidence:[]}]});
 const html=renderReportHtml(vm);assert.doesNotMatch(html,/undefined|null|Not recorded|No comments recorded/);assert.match(html,/No defects found\./);assert.match(html,/data-bind="report.number"><\/b>/);assert.doesNotMatch(html,/PARTS \/ RECTIFICATION REQUIRED/);
});
test("checklist Req/Unit and Reading pair, and Remarks hide only when the whole block is empty",()=>{
 const base={kind:'checklist' as const,key:'x',sectionKey:'x',sectionTitle:'X',title:'X',rows:[{no:1,key:'r',label:'Row',unit:null,reading:null,result:reportResult('good'),remark:null}]};
 assert.doesNotMatch(checklist(base),/Req \/ Unit|Reading|Remarks/);
 const shown=checklist({...base,rows:[...base.rows,{...base.rows[0],no:2,reading:'12',remark:'Check'}]});assert.match(shown,/Req \/ Unit/);assert.match(shown,/Reading/);assert.match(shown,/Remarks/);
});
test("Main Finding chooses severity then definition order, counts further findings",()=>{
 const remarks=[{no:1,text:'Repaired',result:reportResult('complete_repair')},{no:2,text:'First bad',result:reportResult('not_good')},{no:3,text:'Second bad',result:reportResult('not_good')}];
 assert.equal(summaryMainFinding(remarks),'First bad (+2 more)');assert.equal(summaryMainFinding([]),'—');assert.equal(summaryMainFinding(remarks.slice(0,1)),'Repaired');
 assert.ok(renderReportHtml(sampleViewModel()).includes('(+2 more)'));
});
test("real two-pass sample: exactly 9 pages, exact summary destinations, every footer, glyphs",async()=>{
 const vm=sampleViewModel();const pdf=await renderReportViewModelPdf(vm);const doc=await PDFDocument.load(pdf);const pages=await extractPdfText(pdf);assert.equal(pages.length,9);assert.equal(doc.getPageCount(),pages.length);
 pages.forEach((page,i)=>assert.ok(page.includes(`Page ${i+1} of ${pages.length}`),`footer ${i+1}`));
 const map=await resolveNamedDestinationPages(pdf);assert.equal(map.size,4);
 for(const row of vm.summary){const start=map.get(`sys-${row.no}`)!;assert.ok(pages[start-1].includes(row.label.toUpperCase()),`start ${row.label}`);const text=pages[1];assert.ok(text.includes(`${start}QUARTERLY`),`summary page ${start}`)}
 for(const glyph of ['✓','✗','◯'])assert.ok(pages.join('').includes(glyph));
});
test("legacy switch still produces the original portrait PDFKit report",async()=>{
 const old=process.env.REPORT_RENDERER;process.env.REPORT_RENDERER='legacy';try {const pdf=await renderFinalServiceReportPdf({customer:'Legacy',site:'Site',serviceDate:'2026-09-18',jobReference:'Legacy',completedAt:'2026-09-18T00:00:00Z',completedBy:'Inspector',systems:[],sections:[]});const page=(await PDFDocument.load(pdf)).getPage(0);assert.ok(page.getHeight()>page.getWidth());assert.match(pdf.toString('latin1'),/PDFKit/);}finally{if(old===undefined)delete process.env.REPORT_RENDERER;else process.env.REPORT_RENDERER=old;}
});

test("long system flows naturally, marks continuation headers, repeats register header, preserves last row",async()=>{
 const vm=sampleViewModel();const page=vm.systemPages[1];const register=page.blocks.find(block=>block.kind==='register');assert.ok(register && register.kind==='register');
 register.rows=Array.from({length:100},(_,index)=>({no:index+1,cells:[{kind:'text' as const,text:`Unique location ${index+1}`},...register.rows[0].cells.slice(1)]}));
 page.blocks=[register];page.photos=[];page.remarks=[];page.partsTally=[];
 vm.systemPages=[page];vm.summary=vm.summary.filter(row=>row.no===page.no);
 const html=renderReportHtml(vm), body=html.slice(html.indexOf("<body>"));const systemHtml=body.slice(body.indexOf('<section class="page system-page">'));
 const first=systemHtml.slice(0,systemHtml.indexOf('<table class="system-flow">')), repeated=systemHtml.slice(systemHtml.indexOf('<table class="system-flow">'));
 assert.match(first,/hose reel system/i);assert.doesNotMatch(first,/\(continued\)/);assert.match(repeated,/hose reel system[\s\S]*\(continued\)/i);assert.equal((body.match(/\(continued\)/g)??[]).length,1,'continuation wording exists only in the repeating header');
 const pages=await extractPdfText(await renderReportViewModelPdf(vm));assert.ok(pages.length>3);
 const details=pages.slice(2);for(const [index,text] of details.entries()){assert.ok(text.includes('HOSE REEL SYSTEM'),'repeated system title');if(index>0)assert.ok(text.includes('(continued)'),`continuation ${index+1}`);}
 assert.ok(details[1].includes('NOZZLE BOX'),'repeated register header');assert.ok(details.join('').includes('Unique location 100'),'last row retained');
});
