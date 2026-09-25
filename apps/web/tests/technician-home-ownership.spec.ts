import { expect, test } from "@playwright/test";

test("technician tabs, report, keyboard, session memory and 375px layout", async ({ page }) => {
  await page.setViewportSize({width:375,height:812});
  await page.goto("/tests/technician-home-ownership.html");
  await page.getByRole("button",{name:/Technician/}).click();
  await expect(page.getByRole("tab",{name:"In Progress (2)"})).toBeVisible();
  await expect(page.getByRole("tab",{name:"Completed (1)"})).toBeVisible();
  await expect(page.locator(".job-card").first()).toContainText("A-NEW");
  await expect(page.locator(".job-card").first()).toContainText("0 of 1 systems");
  await expect(page.getByRole("button",{name:"+ New Service Visit",exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.getByRole("tab",{name:"In Progress (2)"}).focus(); await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab",{name:"Completed (1)"})).toBeFocused();
  await expect(page.getByRole("tab",{name:"Completed (1)"})).toHaveAttribute("aria-selected","true");
  await page.locator(".job-card").filter({hasText:"A-DONE"}).click();
  await expect(page.getByRole("button",{name:"View Final Report",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Back to My Jobs",exact:true}).click();
  await expect(page.getByRole("tab",{name:"Completed (1)"})).toHaveAttribute("aria-selected","true");
  await page.getByRole("button",{name:"View Report for A-DONE",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Final Report",exact:true})).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("tab",{name:"Completed (1)"})).toHaveAttribute("aria-selected","true");
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
  await page.getByRole("tab",{name:"Completed (0)"}).click();
  await expect(page.getByText("No completed service visits yet.")).toBeVisible();
  await signIn("tech-a");
  await expect(page.getByRole("tab",{name:"In Progress (2)"})).toBeVisible();
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
