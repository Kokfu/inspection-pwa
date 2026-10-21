import { expect, test } from "@playwright/test";

test("Home shows only open service and repair work; completed shortcut retains filter through selection and reload", async ({ page }) => {
  await page.goto("/tests/technician-home-ownership.html");
  await page.getByRole("button", {name:/Technician/}).click();
  await expect(page.getByRole("heading", {name:"Open work",exact:true})).toBeVisible();
  await expect(page.getByRole("heading", {name:"Service visits (2)"})).toBeVisible();
  await expect(page.getByRole("heading", {name:"Repair visits (6)"})).toBeVisible();
  await expect(page.locator(".job-card")).toHaveCount(8);
  await expect(page.locator(".job-card").first()).toContainText("A-NEW");
  await page.evaluate(()=>(window as any).resetRepairStates());
  for (const label of ["Draft", "Pending sync", "Syncing", "Needs attention", "Returned", "Awaiting approval"]) {
    await expect(page.locator(".technician-home a.job-card .status-badge").filter({hasText:new RegExp(`^${label}$`)})).toHaveCount(1);
  }
  for (const hidden of ["A-DONE", "RV-66", "FOREIGN-RV"]) await expect(page.locator(".technician-home")).not.toContainText(hidden);
  await expect(page.getByRole("tab")).toHaveCount(0);
  for (const width of [360,768,1280]) {
    await page.setViewportSize({width,height:width===768?1024:800});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    for (const selector of [".home-utility-actions a", ".home-utility-actions button", ".technician-home a.job-card"]) {
      expect(await page.locator(selector).evaluateAll(elements=>elements.every(el=>el.getBoundingClientRect().height>=44))).toBe(true);
    }
    await page.getByRole("link",{name:"Recent completed",exact:true}).focus();
    await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab");
    expect(await page.getByRole("link",{name:"Recent completed",exact:true}).evaluate(el=>getComputedStyle(el).outlineStyle!=="none")).toBe(true);
    if (width!==768) await page.screenshot({path:`test-results/s6-home-${width}.png`,fullPage:true});
  }
  await page.evaluate(()=>(window as any).approveRepair());
  await expect(page.getByRole("heading",{name:"Repair visits (5)"})).toBeVisible();
  await page.getByRole("link",{name:"Recent completed",exact:true}).click();
  await page.getByLabel("Select customer",{exact:true}).selectOption("41000000-0000-4000-8000-000000000002");
  await expect(page.getByLabel("Status",{exact:true})).toHaveValue("closed");
  await expect(page.locator(".visit-row")).toHaveCount(2);
  await page.reload();
  await expect(page.getByLabel("Status",{exact:true})).toHaveValue("closed");
  await expect(page.locator(".visit-row")).toHaveCount(2);
  await page.getByRole("button",{name:"Repairs",exact:true}).click();
  await expect(page.locator(".visit-row")).toHaveCount(1);
  await expect(page.locator(".visit-row")).toContainText("Approved");
  await page.getByRole("navigation",{name:"Primary navigation"}).getByRole("button",{name:"Home",exact:true}).click();
  await page.getByRole("link",{name:"Repair List",exact:true}).click();
  await expect(page.getByRole("link",{name:"+ New Repair Visit",exact:true})).toHaveAttribute("href","#/repair-visits/new");
});

test("same browser logout/login hides A's jobs and preserves unsynced draft for A", async ({ page }) => {
  await page.goto("/tests/technician-home-ownership.html");
  await page.getByRole("button",{name:/Technician/}).click();
  await expect(page.locator(".job-card").first()).toContainText("A-NEW");
  await expect.poll(async()=>await page.evaluate(async()=>(await (window as any).readDraft())?.syncStatus)).toBe("Draft");
  expect(await page.evaluate(async()=>await (window as any).readForeignDraft())).toBeUndefined();
  const before=await page.evaluate(async()=>await (window as any).readDraft());
  expect(before.syncStatus).toBe("Draft");
  expect(await page.evaluate(async()=>await (window as any).pendingCount())).toBe(1);
  const signIn=async(username:string)=>{
    // I-10: signing out with submitted-but-unsynced work now asks first; these tests intend to sign out.
    page.once("dialog",(dialog)=>dialog.accept());
    await page.getByRole("button",{name:"Sign out",exact:true}).click();
    await page.getByRole("button",{name:/Technician/}).click();
    await page.getByLabel("Username",{exact:true}).fill(username);
    await page.getByLabel("Password",{exact:true}).fill("test-only");
    await page.getByRole("button",{name:"Sign in",exact:true}).click();
  };
  await signIn("tech-b");
  await expect(page.locator(".job-card")).toHaveCount(1);
  await expect(page.locator(".job-card")).toContainText("B-ONLY");
  expect(await page.evaluate(async()=>await (window as any).readDraft())).toBeUndefined();
  await expect.poll(async()=>await page.evaluate(async()=>(await (window as any).readForeignDraft())?.jobId)).toBe("41000000-0000-4000-8000-000000000053");
  await page.getByRole("button",{name:"Sync Now",exact:true}).click();
  expect(await page.evaluate(()=>(window as any).requests.filter((r:any)=>r.path==="/api/sync"&&r.actor===902))).toHaveLength(0);
  await expect(page.getByRole("heading",{name:"Repair visits (0)"})).toBeVisible();
  await signIn("tech-a");
  await expect(page.getByRole("heading",{name:"Service visits (2)"})).toBeVisible();
  expect(await page.evaluate(async()=>await (window as any).readDraft())).toEqual(before);
  expect(await page.evaluate(async()=>await (window as any).pendingCount())).toBe(1);
  await page.getByRole("button",{name:"Sync Now",exact:true}).click();
  await expect.poll(async()=>await page.evaluate(()=>(window as any).requests.filter((r:any)=>r.path==="/api/sync"&&r.actor===901).length)).toBe(1);
  await page.locator(".job-card").filter({hasText:"A-NEW"}).click();
  await page.getByRole("button",{name:/Hose Reel/}).click();
  await expect(page.locator("#hose-reel-comments").getByRole("list",{name:"Selected remarks"}).getByRole("listitem")).toContainText("A unsynced draft survives");
});

test("logout waits for a suspended local save before another identity can replace its workspace", async ({page})=>{
  await page.goto("/tests/technician-home-ownership.html");
  await page.getByRole("button",{name:/Technician/}).click();
  await page.locator(".job-card").filter({hasText:"A-NEW"}).click();
  await page.getByRole("button",{name:/Hose Reel/}).click();
  const comments = page.locator("#hose-reel-comments");
  await comments.getByRole("button",{name:"Remove remark A unsynced draft survives"}).click();
  await comments.getByRole("combobox",{name:"Remark",exact:true}).selectOption("others");
  await comments.getByRole("textbox",{name:"Type a new remark"}).fill("A saved during sign-out");
  await page.evaluate(()=>(window as any).holdNextLocalTransaction());
  await page.getByRole("button",{name:"Save Draft",exact:true}).click();
  // I-10: signing out with unsynced work asks first; this test intends to sign out.
  page.once("dialog",(dialog)=>dialog.accept());
  await page.getByRole("button",{name:"Sign out",exact:true}).click();
  expect(await page.evaluate(()=>(window as any).requests.filter((r:any)=>r.path==="/api/auth/logout"))).toHaveLength(0);
  await page.evaluate(()=>(window as any).releaseLocalTransaction());
  await expect.poll(async()=>await page.evaluate(()=>(window as any).requests.filter((r:any)=>r.path==="/api/auth/logout").length)).toBe(1);
  await page.getByRole("button",{name:/Technician/}).click();
  await page.getByLabel("Username",{exact:true}).fill("tech-b");
  await page.getByLabel("Password",{exact:true}).fill("test-only");
  await page.getByRole("button",{name:"Sign in",exact:true}).click();
  await expect(page.locator(".job-card")).toContainText("B-ONLY");
  expect(await page.evaluate(async()=>await (window as any).readDraft())).toBeUndefined();
  const saved=await page.evaluate(async()=>{
    return await (window as any).readOwnerDraft();
  });
  expect(saved.responses.comments).toBe("A saved during sign-out");
  expect(await page.evaluate(async()=>(await (window as any).readLegacyDrafts()).length)).toBe(3);
});

test("T14: a technician can delete their own in-progress job; it disappears from the list", async ({ page }) => {
  await page.goto("/tests/technician-home-ownership.html");
  await page.getByRole("button", { name: /Technician/ }).click();
  await expect(page.getByRole("heading", { name: "Service visits (2)" })).toBeVisible();
  const card = page.locator(".job-card-list li").filter({ hasText: "A-NEW" });
  // The Delete action lives on the job's own page (not on the list card): open the job, then "Delete this job".
  await card.getByRole("button").first().click();
  await expect(page.getByRole("button", { name: "Delete this job" })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete this job" }).click();
  await expect(page.getByRole("heading", { name: "Service visits (1)" })).toBeVisible();
  await expect(page.locator(".job-card-list li").filter({ hasText: "A-NEW" })).toHaveCount(0);
  await expect
    .poll(async () => page.evaluate(() => (window as unknown as { archivedJobIds?: string[] }).archivedJobIds))
    .toContain("41000000-0000-4000-8000-000000000001");
  // A closed job never offers Delete -- that stays the manager's domain.

  await expect(page.locator(".job-card-list li").filter({ hasText: "A-DONE" }).getByRole("button", { name: /^Delete/ })).toHaveCount(0);
});
