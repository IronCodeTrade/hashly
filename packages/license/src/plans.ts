export const PLANS = ["free", "pro", "team", "whitelabel"] as const;
export type Plan = (typeof PLANS)[number];
export type PaidPlan = Exclude<Plan, "free">;

export const FEATURES = [
  "multiConnector",
  "advancedAlerts",
  "automation",
  "csv",
  "team",
  "whiteLabel",
] as const;
export type Feature = (typeof FEATURES)[number];

export type Limits = {
  connectors: number;
  alertRules: number;
  workspaces: number;
  channels: Array<"desktop" | "webhook" | "telegram">;
  features: Feature[];
};

export const LIMITS: Record<Plan, Limits> = {
  free: {
    connectors: 1,
    alertRules: 1,
    workspaces: 1,
    channels: ["desktop"],
    features: [],
  },
  pro: {
    connectors: 50,
    alertRules: 50,
    workspaces: 1,
    channels: ["desktop", "webhook", "telegram"],
    features: ["multiConnector", "advancedAlerts", "automation", "csv"],
  },
  team: {
    connectors: 200,
    alertRules: 200,
    workspaces: 20,
    channels: ["desktop", "webhook", "telegram"],
    features: ["multiConnector", "advancedAlerts", "automation", "csv", "team"],
  },
  whitelabel: {
    connectors: 500,
    alertRules: 500,
    workspaces: 100,
    channels: ["desktop", "webhook", "telegram"],
    features: ["multiConnector", "advancedAlerts", "automation", "csv", "team", "whiteLabel"],
  },
};

export const PRICES_PLN: Record<PaidPlan | "free", number | null> = {
  free: 0,
  pro: 99,
  team: 300,
  whitelabel: null,
};

export const TRIAL_MS = 30 * 24 * 60 * 60 * 1000;
