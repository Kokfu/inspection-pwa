import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { PDFDocument, PDFName, PDFDict, PDFRawStream } from "pdf-lib";
import { companyProfile } from "../../reports/companyProfile.js";
import { closePdfEngine, resolveNamedDestinationPages } from "../../reports/pdf/htmlToPdf.js";
import { extractPdfText } from "../../reports/pdf/extractPdfText.testSupport.js";
import { escapeHtml } from "../../reports/template/renderReportHtml.js";
import { renderRepairVisitReport } from "./renderRepairVisitReport.js";
import { renderRepairVisitReportPdf } from "./repairVisitReportPdf.js";
import type { RepairVisitReportModel as Model, RepairVisitReportPhoto } from "./repairVisitReportModel.js";

after(closePdfEngine);
const output = fileURLToPath(new URL("../../../../../logs/repair-visit-report/", import.meta.url));
async function fixture(kind: "service" | "repair" | "none" = "service"): Promise<Model> {
  const bytes = await sharp({create:{width:640,height:240,channels:3,background:"#b9cfe0"}})
    .composite([{input:Buffer.from('<svg width="640" height="240"><rect x="160" y="30" width="320" height="180" fill="#1f3a5f"/><text x="220" y="130" font-size="24" fill="white">FIXTURE PHOTO</text></svg>')}]).jpeg().toBuffer();
  const photo: RepairVisitReportPhoto = {content:bytes,width:640,height:240,caption:"Invented fixture evidence"};
  const prev = kind === "none" ? null : {kind,visitNumber:kind === "service" ? "SV-20261011-94" : "RV-20261015-2",visitDate:kind === "service" ? "2026-10-11" : "2026-10-15"};
  const system = kind === "repair" ? "fire_alarm_detector" : kind === "none" ? "hose_reel" : "automatic_sprinkler";
  const item: Model["items"][number] = {no:1,clientUuid:"00000000-0000-4000-8000-000000000001",
    identity:{systemKey:system,rowUuid:null,locationId:"00000000-0000-4000-8000-000000000002",zoneId:null,sectionKey:"water_tank",fieldKey:"supply"},
    systemLabel:kind === "repair" ? "Fire Alarm" : kind === "none" ? "Hose Reel" : "Automatic Sprinkler",
    unitLabel:kind === "repair" ? "Zone 3, Level 2" : kind === "none" ? "Warehouse, Ground Floor" : "Pump Room",
    sectionLabel:kind === "repair" ? "Detector" : kind === "none" ? "Hose Reel" : "Water Tank",fieldLabel:kind === "repair" ? "Smoke Detector" : kind === "none" ? "Hose Reel Nozzle" : "S.A.J Main Water Supply",
    before:prev ? {snapshot:{previousVisit:{kind:prev.kind,visitId:"00000000-0000-4000-8000-000000000003"},visitNumber:prev.visitNumber,visitDate:prev.visitDate,
      result:kind === "repair" ? "not_done" : "not_good",remark:kind === "repair" ? "Not done: matching replacement detector unavailable." : "Gate valve leaking at spindle.",photo:{photoUuid:"00000000-0000-4000-8000-000000000004",sourceSha256:"a".repeat(64),storedSha256:"b".repeat(64),sizeBytes:bytes.length,width:640,height:240}},photo} : null,
    outcome:kind === "repair" ? "not_done" : "done_repair",remark:kind === "repair" ? "Not done: replacement detector is awaiting delivery. Return visit required after the part arrives." : kind === "none" ? "Replaced the damaged nozzle and checked operation; no leakage observed." : "Replaced the leaking gate valve; supply restored and checked.",afterPhoto:photo};
  return {company:companyProfile,companyLogo:null,mode:"final",reportNumber:"MFE/RR/2026/0001",approvedBy:"Lim Wei Ming (sample)",approvedAt:"2026-10-19T04:00:00.000Z",
    cover:{visitUuid:"00000000-0000-4000-8000-000000000005",visitNumber:"RV-20261019-3",visitDate:"2026-10-19",arrivalTime:"09:15",customer:"Sample Customer Sdn Bhd",site:"Sample Factory",siteAddress:"Lot 18, Jalan Contoh 2, 84000 Muar, Johor (invented)",contactPerson:"Ms. Nur Aina (sample)",telephone:"06-900 0100",fax:null,contractNumber:"MFE/SAMPLE/2026",serviceCallNumber:"SC-SAMPLE-1019",technician:"Ahmad Farid (sample)",technicians:["Ahmad Farid (sample)","Repair team A (sample)"],previousVisit:prev,acknowledgement:{name:"Sample Customer",designation:"Site representative",signedAt:"2026-10-19T03:00:00.000Z",signature:null}},items:[item]};
}

test("pure renderer escapes dynamic HTML, attributes, CSS and placeholder-like strings", async () => {
  const vm = await fixture();
  const attack = '<script>alert(1)</script> </style> "} \\ {{customer}} & \' <img src=x>';
  vm.cover.customer=attack;vm.cover.technician=attack;vm.company={...vm.company,legalName:attack};
  vm.items[0].fieldLabel=attack;vm.items[0].remark=attack;vm.items[0].afterPhoto.caption=attack;
  const before=JSON.stringify(vm), html=renderRepairVisitReport(vm);
  assert.equal(html,renderRepairVisitReport(vm));assert.equal(JSON.stringify(vm),before);
  assert.ok(html.includes(escapeHtml(attack)));assert.ok(html.includes(`alt="${escapeHtml(attack)}"`));
  assert.equal((html.match(/<style>/g)||[]).length,1);assert.equal((html.match(/<\/style>/g)||[]).length,1);
  assert.doesNotMatch(html,/<script>|<img src=x/);
});

test("acknowledgement names, designations and signature captions preserve literal replacement tokens", async () => {
  const vm = await fixture();
  for (const value of ["ACME $& Partners", "$`", "$'", "$$", '<script>alert(1)</script> $& {{customer}}']) {
    vm.cover.acknowledgement.name = value;
    vm.cover.acknowledgement.designation = value;
    vm.cover.acknowledgement.signature = { ...vm.items[0].afterPhoto, caption: value };
    const html = renderRepairVisitReport(vm);
    assert.ok(html.includes(`<div class="who">${escapeHtml(value)} ${escapeHtml(value)}</div>`));
    assert.ok(html.includes(`alt="${escapeHtml(value)}"`));
    assert.equal((html.match(/class="letterhead"/g) || []).length, 1);
    assert.equal((html.match(/class="satisfy"/g) || []).length, 1);
    assert.doesNotMatch(html, /class="who" data-bind="customer.contactPerson"|<script>/);
  }
});

test("fails closed for unresolved historic photos, mismatched previous visits and missing approval", async () => {
  const vm=await fixture();vm.items[0].before!.photo=null;
  assert.throws(()=>renderRepairVisitReport(vm),/Before authority/);
  vm.items[0].before!.snapshot.photo=null;vm.cover.previousVisit=null;
  assert.throws(()=>renderRepairVisitReport(vm),/previous visit/);
  const final=await fixture();if(final.mode==='final')final.reportNumber='';
  assert.throws(()=>renderRepairVisitReport(final),/approval authority/);
});

test("stable unit identities produce separate sections even with identical unit labels; logo and acknowledgement are supplied bytes", async () => {
  const vm=await fixture();
  vm.companyLogo={content:await sharp(vm.items[0].afterPhoto.content).png().toBuffer(),mime:"image/png"};
  vm.cover.acknowledgement.signature=vm.items[0].afterPhoto;
  vm.items.push({...vm.items[0],no:2,identity:{...vm.items[0].identity,locationId:"00000000-0000-4000-8000-000000000099"}});
  const html=renderRepairVisitReport(vm,new Map([["rv-1",3],["rv-2",4]]));
  assert.match(html,/id="rv-1"/);assert.match(html,/id="rv-2"/);
  assert.match(html,/<a href="#rv-2">4<\/a>/);assert.match(html,/alt="Company logo"/);assert.match(html,/class="signature"/);
});

test("Chromium fixtures: service, repair, no previous and preview overflow; page numbers, photos and full text", async () => {
  mkdirSync(output,{recursive:true});
  for (const kind of ["service","repair","none","preview-long"] as const) {
    let vm=await fixture(kind === "preview-long" ? "service" : kind);
    if(kind === "service") {
      const second=structuredClone(vm.items[0]);second.afterPhoto=vm.items[0].afterPhoto;second.no=2;second.clientUuid="00000000-0000-4000-8000-000000000006";
      second.identity.fieldKey="cover";second.fieldLabel="Tank Cover";second.remark="Replaced the worn cover seal and secured the cover.";
      second.before={snapshot:{...vm.items[0].before!.snapshot,result:"good",remark:"",photo:null},photo:null};vm.items.push(second);
    }
    if(kind === "preview-long") {
      vm={...vm,mode:"preview",reportNumber:null,approvedBy:null,approvedAt:null};
      vm.items[0].remark=Array.from({length:48},(_,i)=>`Repair line ${i+1}: Checked supply, replaced worn seals and verified operation.`).join("\n")+"\nLAST REMARK VISIBLE";
      const second={...vm.items[0],no:2,identity:{...vm.items[0].identity,systemKey:"hose_reel" as const},systemLabel:"Hose Reel",remark:"SECOND SYSTEM AFTER OVERFLOW"};vm.items.push(second);
    }
    const pdf=await renderRepairVisitReportPdf(vm), doc=await PDFDocument.load(pdf), pages=await extractPdfText(pdf);
    const text=pages.join("\n");
    assert.equal(doc.getPage(0).getWidth()>doc.getPage(0).getHeight(),true);
    if (kind === "preview-long") assert.ok(pages.length >= 5, "long remark must cross a page break");
    else assert.equal(pages.length,3);
    pages.forEach((page,i)=>assert.ok(page.includes(`Page ${i+1} of ${pages.length}`),`footer ${kind} page ${i+1}`));
    assert.match(text,/FIRE SYSTEM REPAIR REPORT/);assert.match(text,/SUMMARY OF REPAIR/);
    if(kind === "service")assert.match(text,/No photo recorded at previous visit/);
    if(kind === "repair")assert.match(text,/NOT DONE/);
    if(kind === "none"){assert.match(text,/No previous visit/);assert.doesNotMatch(renderRepairVisitReport(vm),/<strong>BEFORE<\/strong>/);}
    if(kind === "preview-long"){
      assert.doesNotMatch(text,/MFE\/RR/);assert.match(text,/LAST REMARK VISIBLE/);assert.match(text,/SECOND SYSTEM AFTER OVERFLOW/);
      pages.forEach(page=>assert.match(page,/PREVIEW — NOT APPROVED/));
      assert.ok(pages.some(page=>page.includes("Repair line 25")));assert.ok(pages.some(page=>page.includes("Repair line 48")));
    } else assert.match(text,/MFE\/RR\/2026\/0001/);
    const map=await resolveNamedDestinationPages(pdf);
    for(const [key,page] of map){assert.ok(pages[page-1].includes((key==='rv-2' ? 'Hose Reel' : vm.items[0].systemLabel).toUpperCase()));assert.ok(pages[1].includes(String(page)));}
    let images=0;
    for(const page of doc.getPages()){
      const objects=page.node.Resources()?.lookupMaybe(PDFName.of("XObject"),PDFDict);
      for(const [,ref] of objects?.entries()??[]){const obj=doc.context.lookup(ref);if(obj instanceof PDFRawStream && obj.dict.get(PDFName.of("Subtype"))===PDFName.of("Image"))images++;}
    }
    assert.ok(images>0,"photo bytes must be embedded in PDF");
    writeFileSync(`${output}/${kind}.pdf`,pdf);writeFileSync(`${output}/${kind}.html`,renderRepairVisitReport(vm,map));
  }
});
