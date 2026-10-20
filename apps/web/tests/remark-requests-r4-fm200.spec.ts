import { defineRemarkRequestSpec } from "./remark-requests-r4-support";

// R4: FM200. Same one-remark picker and request flow as Automatic Sprinkler, on this service's own sections.
defineRemarkRequestSpec({
  title: "R4 FM200 one-remark picker and remark requests",
  systemKey: "fm200_fire_suppression",
  sectionKey: "chargerAndBatteries.main_supply",
  otherSectionKey: "chargerAndBatteries.battery",
  row: (page) => page.locator("#fm200-check-main_supply"),
  otherRow: (page) => page.locator("#fm200-check-battery"),
  comments: (page) => page.locator("#fm200-comments"),
  ready: (page) => page.locator("#fm200-check-main_supply"),
});
