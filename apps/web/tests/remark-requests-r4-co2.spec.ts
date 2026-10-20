import { defineRemarkRequestSpec } from "./remark-requests-r4-support";

// R4: CO2. Same one-remark picker and request flow as Automatic Sprinkler, on this service's own sections.
defineRemarkRequestSpec({
  title: "R4 CO2 one-remark picker and remark requests",
  systemKey: "co2_fire_extinguisher",
  sectionKey: "chargerAndBatteries.main_supply",
  otherSectionKey: "chargerAndBatteries.battery",
  row: (page) => page.locator("#co2-check-main_supply"),
  otherRow: (page) => page.locator("#co2-check-battery"),
  comments: (page) => page.locator("#co2-comments"),
  ready: (page) => page.locator("#co2-check-main_supply"),
});
