type RouteWithName = { name: string };

export const UPDATE_ROUTE_POLICY = {
  jobs: "safe",
  job: "safe",
  system: "safe",
  "final-report": "safe",
  "manager-home": "safe",
  "manager-service-visit": "safe",
  "manager-final-report": "safe",
  development: "unsafe",
  inspection: "unsafe",
  "new-service-visit": "unsafe",
  "sprinkler-form": "unsafe",
  "riser-form": "unsafe",
  "fire-alarm-form": "unsafe",
  "hydrant-form": "unsafe",
  "portable-fire-extinguisher-form": "unsafe",
  "co2-form": "unsafe",
  "wet-chemical-form": "unsafe",
  "manager-customer": "unsafe"
} as const;

export function isSafeForAppUpdate(route: RouteWithName) {
  return UPDATE_ROUTE_POLICY[route.name as keyof typeof UPDATE_ROUTE_POLICY] === "safe";
}

export function updateInstructionForRoute(route: RouteWithName) {
  return isSafeForAppUpdate(route)
    ? "A newer version of the inspection app is ready."
    : "Save your draft and return to My Service Jobs before updating.";
}
