type Alert = {
  id: string;
  level: string;
  title: string;
  message: string;
  status: string;
  createdAt: string;
};

export function AlertCenter({ items }: { items: Alert[] }) {
  return (
    <div className="rounded-xl border p-4">
      <h2 className="text-lg font-semibold">Alerts</h2>
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <div key={item.id} className="rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <div className="font-medium">{item.title}</div>
              <div className="text-sm uppercase opacity-70">{item.level}</div>
            </div>
            <div className="mt-2 text-sm">{item.message}</div>
            <div className="mt-2 text-xs opacity-70">
              {item.status} · {new Date(item.createdAt).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
