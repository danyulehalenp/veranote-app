type SubagentRecord = {
  id: string;
  name: string;
  kind: string;
  status: string;
  visibleInDashboard: boolean;
  lastOutcome: string;
  alertCount: number;
  approvalCount: number;
  humanTouchpoint: boolean;
};

export function SubagentStatusBoard({ items }: { items: SubagentRecord[] }) {
  return (
    <div className="rounded-xl border p-4">
      <h2 className="text-lg font-semibold">Subagents</h2>
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <div key={item.id} className="rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <div className="font-medium">{item.name}</div>
              <div className="text-sm opacity-70">{item.status}</div>
            </div>
            <div className="mt-1 text-sm opacity-80">{item.kind}</div>
            <div className="mt-2 text-sm">{item.lastOutcome}</div>
            <div className="mt-2 text-xs opacity-70">
              Alerts: {item.alertCount} · Approvals: {item.approvalCount} · Human touchpoint:{" "}
              {item.humanTouchpoint ? "yes" : "no"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
