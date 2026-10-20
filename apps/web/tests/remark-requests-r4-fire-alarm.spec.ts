import { defineRemarkRequestSpec } from "./remark-requests-r4-support";

// R4: Fire Alarm. Same one-remark picker and request flow as Automatic Sprinkler, on this service's own sections.
defineRemarkRequestSpec({
  title: "R4 Fire Alarm one-remark picker and remark requests",
  systemKey: "fire_alarm_detector",
  sectionKey: "chargerAndBatteries.main_supply",
  otherSectionKey: "chargerAndBatteries.battery",
  row: (page) => page.locator("#fire-alarm-charger-main_supply"),
  otherRow: (page) => page.locator("#fire-alarm-charger-battery"),
  comments: (page) => page.locator("fieldset").filter({ has: page.locator("legend", { hasText: /^Comments$/ }) }),
  ready: (page) => page.locator("#fire-alarm-charger-main_supply"),
});
