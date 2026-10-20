import { defineRemarkRequestSpec } from "./remark-requests-r4-support";

// R4: Hydrant. Same one-remark picker and request flow as Automatic Sprinkler, on this service's own sections.
defineRemarkRequestSpec({
  title: "R4 Hydrant one-remark picker and remark requests",
  systemKey: "hydrant",
  sectionKey: "rows.remarks",
  otherSectionKey: "rows.remarks",
  row: (page) => page.locator(".common-remarks-field").nth(0),
  otherRow: (page) => page.locator(".common-remarks-field").nth(1),
  comments: (page) => page.locator("fieldset").filter({ has: page.locator("legend", { hasText: /^Comments$/ }) }),
  needsStart: true,
  ready: (page) => page.locator(".common-remarks-field").nth(0),
  otherSameSection: true,
});
