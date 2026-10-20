import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/tests/technician-location-proposal-w1b.html");
  await expect(page.getByText("Rejected", { exact: true })).toBeVisible();
});

test("decisions and notes disappear offline, after failed refresh and after malformed read-back", async ({ page, context }) => {
  await expect(page.getByText("Please name the correct wing.")).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByText(/Status needs a connection/)).toBeVisible();
  await expect(page.getByText("Rejected", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Please name the correct wing.")).toHaveCount(0);
  await page.evaluate(() => (window as any).harness.setFailRead(true));
  await context.setOffline(false);
  await expect(page.getByRole("alert")).toContainText("Cannot refresh");
  await expect(page.getByText("Rejected", { exact: true })).toHaveCount(0);
  await page.evaluate(() => { (window as any).harness.setFailRead(false); window.fetch = async () => Response.json({proposals: [{unexpected:true}]}); });
  await page.getByRole("button", { name: "Refresh request status" }).click();
  await expect(page.getByRole("alert")).toContainText("could not be read");
  await expect(page.getByText("Rejected", { exact: true })).toHaveCount(0);
});

test("revision preserves the original, survives remount, and submits offline with a new UUID", async ({ page, context }) => {
  await page.evaluate(async () => {
    const h=(window as any).harness;
    await h.db.drafts.put({id:`technician-location-proposal:${h.job.id}:${h.base.systemKey}:annex`,entityType:"technicianLocationProposal",payload:{id:h.base.id,jobId:h.job.id,customerId:h.base.customerId,systemKey:h.base.systemKey,patch:h.patch,status:"Synced"},updatedAt:new Date().toISOString()});
  });
  await page.getByRole("button", { name: "Revise and resubmit", exact: true }).click();
  const editor=page.getByRole("region", { name:"Revise location request" });
  await editor.getByLabel("Location name").fill("Correct Wing Room");
  await context.setOffline(true);
  await expect(editor.getByRole("button", {name:"Save Draft"})).toBeEnabled();
  await editor.getByRole("button", {name:"Save Draft"}).click();
  await expect(page.getByText("Revision saved on this device.")).toBeVisible();
  // Real React remount, retaining IndexedDB (no network reload needed).
  await page.evaluate(() => { (window as any).harness.render(false, true); });
  await page.getByRole("button", {name:"Continue revision"}).click();
  await expect(editor.getByLabel("Location name")).toHaveValue("Correct Wing Room");
  await editor.getByRole("button", {name:"Submit for Review"}).click();
  await expect(editor).toHaveCount(0);
  const result=await page.evaluate(async () => {
    const h=(window as any).harness;
    const drafts=await h.store.listTechnicianLocationProposalDrafts(h.job.id);
    return {drafts,outbox:await h.db.syncOutbox.toArray(),posts:h.posts};
  });
  const original=result.drafts.find((d:any)=>d.status==="Synced");
  const revision=result.drafts.find((d:any)=>d.status==="Pending");
  expect(original.patch.displayName).toBe("Annex Room");
  expect(revision.id).not.toBe(original.id);
  expect(revision.patch.displayName).toBe("Correct Wing Room");
  expect(result.outbox).toHaveLength(1);
  expect(result.posts).toHaveLength(0);
});

test("discard removes both rows, refuses Syncing and uncertain delivery, and rolls back on delete failure", async ({ page }) => {
  const result=await page.evaluate(async () => {
    const h=(window as any).harness;
    const pending=await h.seed(); await h.store.discardTechnicianLocationProposal(pending);
    const removed=!(await h.db.syncOutbox.get(pending.id))&&!(await h.store.listTechnicianLocationProposalDrafts(h.job.id)).some((d:any)=>d.id===pending.id);
    const syncing=await h.seed("Syncing"); let syncError="";
    try {await h.store.discardTechnicianLocationProposal(syncing)} catch(e){syncError=String(e)}
    const uncertain=await h.seed("Failed",1); let uncertainError="";
    try {await h.store.discardTechnicianLocationProposal(uncertain)} catch(e){uncertainError=String(e)}
    const rollback=await h.seed();
    const hook=()=>{throw new Error("Simulated draft deletion failure")}; h.db.drafts.hook("deleting",hook);
    try {await h.store.discardTechnicianLocationProposal(rollback)} catch {} finally {h.db.drafts.hook("deleting").unsubscribe(hook)}
    return {removed,syncError,uncertainError,syncPreserved:!!await h.db.syncOutbox.get(syncing.id),rollbackPreserved:!!await h.db.syncOutbox.get(rollback.id)};
  });
  expect(result.removed).toBe(true); expect(result.syncError).toContain("Syncing");
  expect(result.uncertainError).toContain("uncertain"); expect(result.syncPreserved).toBe(true); expect(result.rollbackPreserved).toBe(true);
});

test("withdraw requires exact confirmation, retains retry UUID after timeout, and refreshes its decision", async ({ page }) => {
  await page.evaluate(() => (window as any).harness.setFailWithdraw(true));
  await page.getByRole("button", {name:"Withdraw",exact:true}).click();
  await expect(page.getByRole("alert")).toContainText("Connection interrupted");
  await expect(page.getByText("Withdrawn",{exact:true})).toHaveCount(0);
  await page.evaluate(() => (window as any).harness.render(true, true));
  await expect(page.getByRole("button",{name:"Withdraw",exact:true})).toBeVisible();
  await page.evaluate(() => {(window as any).harness.setFailWithdraw(false);(window as any).harness.setBadWithdraw(true)});
  await page.getByRole("button",{name:"Refresh request status"}).click();
  await page.getByRole("button",{name:"Withdraw",exact:true}).click();
  await expect(page.getByRole("alert")).toContainText("could not be confirmed");
  await expect(page.getByText("Withdrawn",{exact:true})).toHaveCount(0);
  await page.evaluate(() => (window as any).harness.setBadWithdraw(false));
  await page.getByRole("button",{name:"Refresh request status"}).click();
  await page.getByRole("button",{name:"Withdraw",exact:true}).click();
  await expect(page.getByText("Withdrawn",{exact:true})).toBeVisible();
  expect(new Set(await page.evaluate(()=>(window as any).harness.withdraws)).size).toBe(1);
});

for (const [width,height] of [[360,800],[768,1024],[1280,800]]) {
  test(`layout ${width}: no overflow, tap sizes, focus and offline entry`, async ({page,context},testInfo)=>{
    await page.setViewportSize({width,height});
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.screenshot({path:testInfo.outputPath(`requests-online-${width}.png`),fullPage:true});
    await page.getByLabel("2. Location name").fill("New Location");
    await context.setOffline(true);
    await expect(page.getByRole("button",{name:"Save Draft",exact:true})).toBeEnabled();
    await expect(page.getByRole("button",{name:"Submit for Review",exact:true})).toBeEnabled();
    const measures=await page.locator(".technician-location-proposal").evaluate(el=>({
      overflow:document.documentElement.scrollWidth>innerWidth,
      small:[...el.querySelectorAll("button,select,input")].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.width<44||r.height<44)}).map(e=>e.outerHTML)
    }));
    expect(measures).toEqual({overflow:false,small:[]});
    await page.getByRole("button",{name:"Submit for Review",exact:true}).focus();
    expect(await page.getByRole("button",{name:"Submit for Review",exact:true}).evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe("none");
    await page.getByRole("button",{name:"Submit for Review",exact:true}).scrollIntoViewIfNeeded();
    await expect(page.getByRole("button",{name:"Submit for Review",exact:true})).toBeInViewport();
    await page.screenshot({path:testInfo.outputPath(`technician-${width}.png`),fullPage:true});
  });
}

test("a revised format syncs under its new identity and leaves the original receipt untouched", async ({page}) => {
  const result = await page.evaluate(async () => {
    const h=(window as any).harness;
    const original=h.store.newUpdateFormatDraft(h.job.id,h.base.customerId,"smoke_ventilation","general",[{assetReference:"Original fan"}]);
    // Return a complete, exact system identity for each submitted format.
    const originalFetch=window.fetch;
    window.fetch=async (url,init) => {
      if(init?.method==="POST" && !String(url).includes("/withdraw")) {
        const p=JSON.parse(String(init.body)); h.posts.push(p);
        return Response.json({proposal:{...h.base,id:p.id,payload:p.patch,systemKey:"smoke_ventilation",systemDisplayName:"Smoke Ventilation"}});
      }
      return originalFetch(url,init);
    };
    await h.store.queueTechnicianLocationProposal(original);
    await h.store.syncPendingLocationProposals(9010);
    const revision=h.store.reviseTechnicianLocationProposal(original);
    revision.patch.rows[0].assetReference="Revised fan";
    await h.store.saveTechnicianLocationProposalDraft(revision);
    await h.store.queueTechnicianLocationProposal(revision);
    await h.store.syncPendingLocationProposals(9010);
    await h.store.syncPendingLocationProposals(9010);
    return {drafts:await h.store.listTechnicianLocationProposalDrafts(h.job.id),posts:h.posts,originalId:original.id,revisionId:revision.id};
  });
  expect(result.originalId).not.toBe(result.revisionId);
  expect(result.posts.map((p:any)=>p.id)).toEqual([result.originalId,result.revisionId]);
  expect(result.drafts.find((d:any)=>d.id===result.originalId)).toMatchObject({status:"Synced",patch:{rows:[{assetReference:"Original fan"}]}});
  expect(result.drafts.find((d:any)=>d.id===result.revisionId)).toMatchObject({status:"Synced",patch:{rows:[{assetReference:"Revised fan"}]}});
});

test("sync and discard serialize: a claimed request is preserved and a discarded request is never posted", async ({page}) => {
  const result=await page.evaluate(async () => {
    const h=(window as any).harness;
    const claimed=await h.seed();
    const originalFetch=window.fetch;
    let release;
    const barrier=new Promise(resolve=>{release=resolve});
    window.fetch=async (url,init) => {if(init?.method==="POST") await barrier; return originalFetch(url,init)};
    const sync=h.store.syncPendingLocationProposals(9010);
    const end=Date.now()+4000;
    while((await h.db.syncOutbox.get(claimed.id))?.status!=="Syncing"&&Date.now()<end) await new Promise(r=>setTimeout(r,10));
    let refused="";
    try {await h.store.discardTechnicianLocationProposal(claimed)} catch(e){refused=String(e)}
    const persisted=await h.store.locationProposalWithdrawalRequestId(claimed);
    release(); await sync;
    window.fetch=originalFetch;
    const stored=(await h.store.listTechnicianLocationProposalDrafts(h.job.id)).find(d=>d.id===claimed.id);
    const discarded=await h.seed();
    const race=await Promise.allSettled([h.store.discardTechnicianLocationProposal(discarded),h.store.syncPendingLocationProposals(9010)]);
    const survived=!!await h.db.syncOutbox.get(discarded.id);
    return {refused,stored,persisted,raceDiscarded:race[0].status==="fulfilled",survived,postedDiscarded:h.posts.some(p=>p.id===discarded.id)};
  });
  expect(result.refused).toContain("Syncing");
  expect(result.stored).toMatchObject({status:"Synced",withdrawRequestId:result.persisted});
  if(result.raceDiscarded) { expect(result.survived).toBe(false); expect(result.postedDiscarded).toBe(false); }
  else expect(result.survived).toBe(true);
});

for (const systemKey of ["hose_reel", "dry_wet_riser", "fire_rated_roller_shutter"]) {
  test(`revision uses server field limits and drum enum for ${systemKey}`, async ({page, context}) => {
    await page.evaluate((systemKey) => {
      const h = (window as any).harness;
      const row = {assetReference:"A", locationText:"Lobby", ...(systemKey === "hose_reel" ? {drumType:"swing"} : systemKey === "fire_rated_roller_shutter" ? {zoneText:"North"} : {})};
      const proposal = {...h.base, systemKey, payload:{kind:"update-format", locationKey:"general", rows:[row]}, status:"rejected",
        decision:{id:h.id(20), requestId:h.id(21), decision:"rejected", note:"Please correct this format.", decidedBy:"Reviewer", decidedByRole:"admin", decidedAt:"2026-10-19T02:00:00.000Z", sequence:1, resultingRevisionId:null, appliedPatch:null}};
      window.fetch = async () => Response.json({proposals:[proposal]});
    }, systemKey);
    await page.getByRole("button", {name:"Refresh request status"}).click();
    await expect(page.getByText("Please correct this format.")).toBeVisible();
    await page.getByRole("button", {name:"Revise and resubmit", exact:true}).click();
    const editor = page.getByRole("region", {name:"Revise location request"});
    await expect(editor.getByLabel("Asset Reference")).toHaveAttribute("maxlength", "200");
    await expect(editor.getByLabel("Location Text")).toHaveAttribute("maxlength", systemKey === "dry_wet_riser" ? "250" : "300");
    if (systemKey === "hose_reel") {
      expect(await editor.getByRole("combobox", {name:"Drum Type"}).locator("option").evaluateAll(options => options.map(option => option.getAttribute("value")))).toEqual(["", "swing", "fixed"]);
      await editor.getByLabel("Drum Type").selectOption("fixed");
    }
    if (systemKey === "fire_rated_roller_shutter") await expect(editor.getByLabel("Zone Text")).toHaveAttribute("maxlength", "200");
    const location = editor.getByLabel("Location Text");
    await location.fill("");
    await expect(location).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByRole("alert")).toContainText("Enter a location for row 1");
    await editor.getByRole("button", {name:"Submit for Review"}).click();
    await expect(location).toBeFocused();
    await expect(editor).toHaveCount(1);
    expect(await page.evaluate(async () => (await (window as any).harness.db.syncOutbox.toArray()).length)).toBe(0);
    await location.fill("Lobby");
    await expect(page.getByRole("alert")).toHaveCount(0);
    await context.setOffline(true);
    await editor.getByRole("button", {name:"Submit for Review"}).click();
    await expect(editor).toHaveCount(0);
    const queued = await page.evaluate(async () => (await (window as any).harness.db.syncOutbox.toArray())[0]);
    expect(queued.payload.systemKey).toBe(systemKey);
    if (systemKey === "hose_reel") expect(queued.payload.patch.rows[0].drumType).toBe("fixed");
  });
}

test("revision typing is saved as it happens and survives a remount without pressing Save Draft", async ({ page }) => {
  await page.evaluate(async () => {
    const h=(window as any).harness;
    await h.db.drafts.put({id:`technician-location-proposal:${h.job.id}:${h.base.systemKey}:annex`,entityType:"technicianLocationProposal",payload:{id:h.base.id,jobId:h.job.id,customerId:h.base.customerId,systemKey:h.base.systemKey,patch:h.patch,status:"Synced"},updatedAt:new Date().toISOString()});
  });
  await page.getByRole("button", { name: "Revise and resubmit", exact: true }).click();
  const editor=page.getByRole("region", { name:"Revise location request" });
  await editor.getByLabel("Location name").fill("Typed But Never Saved");
  // A connection change remounts the screen; nothing was saved by hand.
  await page.evaluate(() => { (window as any).harness.render(false, true); });
  await expect(editor).toHaveCount(0);
  await page.getByRole("button", {name:"Continue revision"}).click();
  await expect(editor.getByLabel("Location name")).toHaveValue("Typed But Never Saved");
});

test("a withdrawn request says so instead of showing an empty technician note", async ({ page }) => {
  await page.evaluate(() => {
    const h=(window as any).harness;
    window.fetch = async () => Response.json({proposals:[{...h.base, status:"withdrawn",
      decision:{id:h.id(20), requestId:h.id(21), decision:"withdrawn", note:null, decidedBy:"Field Technician", decidedByRole:"inspector", decidedAt:"2026-10-19T02:00:00.000Z", sequence:1, resultingRevisionId:null, appliedPatch:null}}]});
  });
  await page.getByRole("button", {name:"Refresh request status"}).click();
  await expect(page.getByText("You withdrew this request.")).toBeVisible();
  await expect(page.getByText(/Technician note/)).toHaveCount(0);
});

test("an approval with reviewer changes shows what was actually approved", async ({ page }) => {
  await page.evaluate(() => {
    const h=(window as any).harness;
    window.fetch = async () => Response.json({proposals:[{...h.base, status:"approved", edited:true,
      decision:{id:h.id(20), requestId:h.id(21), decision:"approved", note:null, decidedBy:"Review Admin", decidedByRole:"admin", decidedAt:"2026-10-19T02:00:00.000Z", sequence:1, resultingRevisionId:h.id(22),
        appliedPatch:{...h.patch, displayName:"Annex Room (edited)", zoneKey:null, newZone:{key:"newzone1", displayName:"Retest Zone"}}}}]});
  });
  await page.getByRole("button", {name:"Refresh request status"}).click();
  await expect(page.getByText("Approved with changes")).toBeVisible();
  await expect(page.getByText("Annex Room (edited) in Retest Zone")).toBeVisible();
});

test("the chosen system survives the screen being rebuilt", async ({ page }) => {
  await page.evaluate(() => {
    const h=(window as any).harness;
    h.job.configurationSnapshot.enabledSystems.push({systemKey:"fm200_fire_suppression",displayName:"FM200 System",zones:[{id:h.id(30),key:"north",displayName:"North"}],locations:[]});
    h.render(false, true);
  });
  const picker=page.getByLabel("1. Choose system");
  await expect(picker).toHaveValue("");
  await picker.selectOption("fm200_fire_suppression");
  await expect(picker).toHaveValue("fm200_fire_suppression");
  await page.evaluate(() => { (window as any).harness.render(false, true); });
  await expect(page.getByLabel("1. Choose system")).toHaveValue("fm200_fire_suppression");
  // Going back to "no system" is remembered too.
  await page.getByLabel("1. Choose system").selectOption("");
  await page.evaluate(() => { (window as any).harness.render(false, true); });
  await expect(page.getByLabel("1. Choose system")).toHaveValue("");
});

test("an approval that moved the zone to one this visit does not know says the reviewer chose it", async ({ page }) => {
  const approved = (appliedPatch: Record<string, unknown>) => page.evaluate((applied) => {
    const h=(window as any).harness;
    window.fetch = async () => Response.json({proposals:[{...h.base, status:"approved", edited:true,
      decision:{id:h.id(20), requestId:h.id(21), decision:"approved", note:null, decidedBy:"Review Admin", decidedByRole:"admin", decidedAt:"2026-10-19T02:00:00.000Z", sequence:1, resultingRevisionId:h.id(22), appliedPatch:{...h.patch, ...applied}}}]});
  }, appliedPatch);
  await approved({displayName:"Annex Room (edited)", zoneKey:"created-later"});
  await page.getByRole("button", {name:"Refresh request status"}).click();
  await expect(page.getByText("Annex Room (edited) (zone chosen by the reviewer)")).toBeVisible();
  // Same known zone as submitted, only the name changed: the zone is named and nothing says the reviewer chose it.
  await approved({displayName:"Annex Room (edited)"});
  await page.getByRole("button", {name:"Refresh request status"}).click();
  await expect(page.getByText("Approved as: Annex Room (edited) in Ground Floor", {exact:true})).toBeVisible();
  await expect(page.getByText(/zone chosen by the reviewer/)).toHaveCount(0);
});

test("the revision panel has no blank band above its heading", async ({ page }) => {
  await page.evaluate(async () => {
    const h=(window as any).harness;
    await h.db.drafts.put({id:`technician-location-proposal:${h.job.id}:${h.base.systemKey}:annex`,entityType:"technicianLocationProposal",payload:{id:h.base.id,jobId:h.job.id,customerId:h.base.customerId,systemKey:h.base.systemKey,patch:h.patch,status:"Synced"},updatedAt:new Date().toISOString()});
  });
  await page.getByRole("button", { name: "Revise and resubmit", exact: true }).click();
  const margins = await page.getByRole("region", { name:"Revise location request" }).evaluate((panel) => {
    const style = (selector: string) => getComputedStyle(panel.querySelector(selector)!);
    return [style("h4").marginTop, style("h4").marginBottom, style("p").marginTop, style("p").marginBottom];
  });
  expect(margins).toEqual(["0px", "0px", "0px", "0px"]);
});
