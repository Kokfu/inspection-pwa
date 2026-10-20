import { defineRemarkRequestSpec } from "./remark-requests-r4-support";

// R4: Hose Reel. Same one-remark picker and request flow as Automatic Sprinkler, on this service's own sections.
defineRemarkRequestSpec({
  title: "R4 Hose Reel one-remark picker and remark requests",
  systemKey: "hose_reel",
  sectionKey: "checklist.waterTank.water_level",
  otherSectionKey: "checklist.waterTank.saj_main_water_supply",
  row: (page) => page.locator("#check-water_level"),
  otherRow: (page) => page.locator("#check-saj_main_water_supply"),
  comments: (page) => page.locator("#hose-reel-comments"),
  needsStart: true,
  ready: (page) => page.locator("#check-water_level"),
});
