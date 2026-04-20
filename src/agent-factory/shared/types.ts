export type SubagentStatus =
  | "planned"
  | "building"
  | "ready"
  | "blocked"
  | "error";

export type AlertLevel = "info" | "warning" | "critical";

export interface SubagentRecord {
  id: string;
  name: string;
  kind: string;
  status: SubagentStatus;
  visibleInDashboard: boolean;
  lastOutcome: string;
  alertCount: number;
  approvalCount: number;
  humanTouchpoint: boolean;
}

export interface AgentFactoryAlert {
  id: string;
  level: AlertLevel;
  title: string;
  message: string;
  status: "open" | "acknowledged" | "resolved";
  createdAt: string;
}

export interface AgentFactoryApproval {
  id: string;
  title: string;
  summary: string;
  status: "pending" | "approved" | "rejected";
  priority: "low" | "medium" | "high";
  createdAt: string;
}
