import assert from "node:assert/strict";
import { after, test } from "node:test";
import { readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { loadConfig } from "../../config/env.js";
import { renderReportHtml, escapeHtml, checklist } from "./renderReportHtml.js";
import { sampleViewModel } from "./sampleFixture.js";
import { buildReportViewModel, reportResult, summaryMainFinding, type ReportBlock, type SystemPage } from "../reportViewModel.js";
import { renderReportViewModelPdf, renderFinalServiceReportPdf } from "../finalServiceReport.js";
import { closePdfEngine, resolveNamedDestinationPages } from "../pdf/htmlToPdf.js";
import { extractPdfText } from "../pdf/extractPdfText.testSupport.js";
import { PDFDocument } from "pdf-lib";
after(closePdfEngine);
const normalized = (html: string) => html.replace(/src:url\(data:[^)]+\)/g, "src:url(BUNDLED_FONT)").replace(/\r\n/g, "\n").trimEnd();
test("approved Hokuden four-system HTML snapshot", () => {
 assert.equal(normalized(renderReportHtml(sampleViewModel())),normalized(readFileSync(new URL('./sample.snapshot.html',import.meta.url),'utf8')));
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
 const html=renderReportHtml(vm);assert.doesNotMatch(html,/undefined|null|Not recorded|No comments recorded/);assert.match(html,/No defects found\./);assert.doesNotMatch(html,/Report No\./);assert.doesNotMatch(html,/data-bind="report.number"/);assert.doesNotMatch(html,/PARTS \/ RECTIFICATION REQUIRED/);
});
test("R4 cover values render in the approved existing cells",()=>{
 const vm=buildReportViewModel({customer:'Customer',site:'Site',siteAddress:'42 Test Road',serviceDate:'2026-09-18',jobReference:'Job',reportNumber:'MFE/SR/2026/0042',fax:'03-555',contractNumber:'CON-42',serviceFrequency:'MONTHLY',technicians:['Tech A','Tech B'],completedAt:'2026-09-18T00:00:00Z',completedBy:'Lead',systems:[],sections:[]});
 const html=renderReportHtml(vm);for(const value of ['MFE/SR/2026/0042','Site — 42 Test Road','03-555','CON-42','Monthly','Tech A · Tech B'])assert.ok(html.includes(value));
});
test("cover report number and issued date follow frozen completion data", () => {
 const vm=buildReportViewModel({customer:'Customer',site:'Site',serviceDate:'2026-09-18',jobReference:'Job',completedAt:'2026-09-23T12:15:00Z',completedBy:'A Person',systems:[],sections:[]});
 let html=renderReportHtml(vm);
 assert.doesNotMatch(html,/Report No\./);
 assert.match(html,/@bottom-left\s*\{ content: "";/);
 assert.match(html,/data-bind="report\.issuedAt">2026-09-23<\/b>/);
 vm.cover.reportNumber='MFE/SR/2026/0042';html=renderReportHtml(vm);
 assert.match(html,/<span>Report No\.<\/span><b data-bind="report\.number">MFE\/SR\/2026\/0042<\/b>/);
 assert.match(html,/@bottom-left\s*\{ content: "Report No\. MFE\/SR\/2026\/0042"/);
});
test("cover prints Team only when it has names beyond the test leader", () => {
 const vm=buildReportViewModel({customer:'Customer',site:'Site',serviceDate:'2026-09-18',jobReference:'Job',completedAt:'2026-09-18T00:00:00Z',completedBy:'Lead',technicians:['Lead'],systems:[],sections:[]});
 assert.doesNotMatch(renderReportHtml(vm),/Team:/);
 vm.cover.technicians=['Lead','Tech B'];
 assert.match(renderReportHtml(vm),/Team: Tech B/);
});
test("optional telephone/fax and separators appear only between values, and the cover shows Arrival Time with no Departure", () => {
 const vm=buildReportViewModel({customer:'Customer',site:'Site',serviceDate:'2026-09-18',jobReference:'Job',completedAt:'2026-09-18T00:00:00Z',completedBy:'Inspector',systems:[],sections:[]});
 for(const [left,right,expected] of [[null,null,''],['012-123',null,'012-123'],[null,'03-456','03-456'],['012-123','03-456','012-123 / 03-456']] as const){
   vm.cover.telephone=left;vm.cover.fax=right;
   assert.match(renderReportHtml(vm),new RegExp(`data-bind="customer.contactPhone / customer.fax">${expected}<\\/td>`));
 }
 for(const [arrival,expected] of [[null,''],['09:00','09:00']] as const){
   vm.cover.arrival=arrival;
   const html=renderReportHtml(vm);
   assert.match(html,new RegExp(`<td class="lbl">Arrival Time<\/td><td class="v" data-bind="job.arrival">${expected}<\/td>`));
   assert.doesNotMatch(html,/departure/i);
 }
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
test("photo-backed FM200 and Roller Shutter pages do not orphan their inspection strips", async () => {
 const vm=sampleViewModel();
 const pixel=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=","base64");
 const check=(key:string,title:string,labels:string[]):Extract<ReportBlock,{kind:"checklist"}>=>({kind:"checklist",key,sectionKey:key,sectionTitle:title,title,
   rows:labels.map((label,index)=>({no:index+1,key:`${key}_${index}`,label,unit:null,reading:null,result:reportResult(index===0?"not_good":"good"),remark:index===0?"Needs attention":null}))});
 const photos=(prefix:string)=>[1,2].map(no=>({no,caption:`${prefix} finding ${no}`,field:`${prefix}_${no}`,width:1,height:1,content:pixel}));
 const common={structure:"v7" as const,condition:"FAILED" as const,conditionDetail:"Needs attention",remarks:[{no:1,text:"Needs attention",result:reportResult("not_good")}],partsTally:[],comments:null,
   inspection:{date:"2026-09-28",inspectedBy:["New Technician"]},review:{status:"pending" as const,submittedBy:"Technician1",reviewedBy:null,reviewedAt:null}};
 const fm:SystemPage={...common,no:1,systemKey:"fm200_fire_suppression",title:"FM200 System",location:"General / General",photos:photos("FM200"),blocks:[
   check("panel","Control Panel Location",["Control Panel Location"]),
   {kind:"register",key:"detectors",sectionKey:"detectors",sectionTitle:"Zone and Detector Rows",title:"Zone and Detector Rows",columns:[
     {key:"zone",label:"Alarm Zone",kind:"text",subColumns:null},{key:"location",label:"Location",kind:"text",subColumns:null},
     {key:"heat",label:"Heat Detector",kind:"nti",subColumns:["N","T","I"]},{key:"smoke",label:"Smoke Detector",kind:"nti",subColumns:["N","T","I"]},
     {key:"remarks",label:"Remarks",kind:"remarks",subColumns:null}],rows:[{no:1,cells:[{kind:"text",text:"General"},{kind:"text",text:"General"},
       {kind:"nti",state:{normal:true,test:false,isolation:false}},{kind:"nti",state:{normal:true,test:false,isolation:false}},{kind:"remarks",text:null}]}]},
   check("charger","Charger & Batteries",["Main Supply","Battery","Charger"]),
   check("outlook","Physical Outlook Checking",["CO2 Cylinder","Electric Actuator","Manual Release Key","Alarm Bell","Twin Flashing Light","24V DC Tripping Device","Manual Pull Station","High Pressure Hose","Discharge Nozzles","Pilot Cylinder"]),
   check("function","Main Function Key",["Main Alarm Reset","Lamp Test","Evacuate","A/C Supply","D/C Supply","Signal Alarm to MFAP"])
 ]};
 const roller:SystemPage={...common,no:2,systemKey:"fire_rated_roller_shutter",title:"Fire Rated Roller Shutter",location:null,photos:photos("Roller"),blocks:[
   {kind:"checklist",key:"inspection_header_fields",sectionKey:"inspection",sectionTitle:"Inspection Details",title:"Inspection Details",rows:
     ["Date Tested","Zone","Inspected By"].map((label,index)=>({no:index+1,key:`header_${index}`,label,unit:null,reading:["2026-09-28","Zone 1","Inspector A"][index],result:null,remark:null}))},
   {kind:"register",key:"roller_shutter_schedule_rows",sectionKey:"schedule",sectionTitle:"Roller Shutter Schedule",title:"Roller Shutter Schedule",columns:[
     {key:"location",label:"Location",kind:"text",subColumns:null},{key:"auto_alarm_mode",label:"Auto Alarm Mode",kind:"result",subColumns:null},
     {key:"manual_mode",label:"Manual Mode",kind:"result",subColumns:null},{key:"remarks",label:"Remarks",kind:"remarks",subColumns:null}],rows:[
       {no:1,cells:[{kind:"text",text:"1st Floor Admin Office"},{kind:"result",result:reportResult("good"),remark:null},{kind:"result",result:reportResult("good"),remark:null},{kind:"remarks",text:null}]},
       {no:2,cells:[{kind:"text",text:"Finger Print"},{kind:"result",result:reportResult("not_good"),remark:"test"},{kind:"result",result:reportResult("complete_repair"),remark:"test1"},{kind:"remarks",text:null}]}
     ]}
 ]};
 vm.systemPages=[fm,roller];
 vm.summary=[fm,roller].map(page=>({no:page.no,systemKey:page.systemKey,label:page.title,location:page.location,frequency:null,condition:page.condition,conditionDetail:page.conditionDetail}));
 const pages=await extractPdfText(await renderReportViewModelPdf(vm));
 assert.equal(pages.length,5,"two photo-backed systems should fit in three detail pages");
 assert.ok(pages[3]?.includes("FM200 SYSTEM") && pages[3]?.includes("PHOTO EVIDENCE") && pages[3]?.includes("INSPECTION DATE"),"FM200 strip stays with photos");
 assert.ok(pages[4]?.includes("FIRE RATED ROLLER SHUTTER") && pages[4]?.includes("PHOTO EVIDENCE") && pages[4]?.includes("INSPECTION DATE"),"Roller strip stays with photos");
 for(const value of ["2026-09-28","Zone 1","Inspector A"])assert.ok(pages[4]?.includes(value),`Roller header prints ${value}`);
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
