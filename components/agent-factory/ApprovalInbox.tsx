type Approval = {
  id: string;
  title: string;
  summary: string;
  status: string;
  priority: string;
  createdAt: string;
};

export function ApprovalInbox({ items }: { items: Approval[] }) {
  return (
    <div className="rounded-xl border p-4">
      <h2 className="text-lg font-semibold">Approval Inbox</h2>
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <div key={item.id} className="rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <div className="font-medium">{item.title}</div>
              <div className="text-sm opacity-70">{item.priority}</div>
            </div>
            <div className="mt-2 text-sm">{item.summary}</div>
            <div className="mt-2 text-xs opacity-70">
              {item.status} · {new Date(item.createdAt).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
