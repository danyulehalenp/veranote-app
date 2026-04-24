import fs from 'node:fs/promises';
import path from 'node:path';
import { AppShell } from '@/components/layout/app-shell';
import { InternalSurfaceNotice } from '@/components/layout/internal-surface-notice';
import { AlertCenter } from '@/components/agent-factory/AlertCenter';
import { ApprovalInbox } from '@/components/agent-factory/ApprovalInbox';
import { SubagentStatusBoard } from '@/components/agent-factory/SubagentStatusBoard';

type FactoryStatus = {
  state?: string;
  mode?: string;
  active_build?: string;
  queued_builds?: number;
  pending_approvals?: number;
  open_guidance_requests?: number;
  last_updated?: string;
};

type FactoryTask = {
  id?: string;
  title?: string;
  status?: string;
  requires_approval?: boolean;
  risk_level?: string;
};

type FactoryChild = {
  id: string;
  name: string;
  status?: string;
  workflow_state?: string;
  workflow_note?: string;
  summary?: string;
  category?: string;
  implementation_tasks?: FactoryTask[];
};

type FactoryApproval = {
  id: string;
  title: string;
  summary: string;
  status: string;
  priority: string;
  createdAt: string;
};

type FactoryAlert = {
  id: string;
  level: string;
  title: string;
  message: string;
  status: string;
  createdAt: string;
};

type FactoryState = {
  status?: FactoryStatus;
  approvals?: FactoryApproval[];
  guidance?: Array<{ title?: string; summary?: string; status?: string; requested_at?: string }>;
  children?: FactoryChild[];
  ideas?: Array<{ name?: string; category?: string; purpose?: string }>;
};

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

const SHARED_FACTORY_STATE_PATH = path.join(
  process.env.HOME || '',
  '.openclaw',
  'workspace',
  'clinical-doc-orchestration',
  'dashboard',
  'agent-factory-state.json'
);

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function fmtTimestamp(value?: string) {
  if (!value) return 'Unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function countTasks(children: FactoryChild[]) {
  return children.reduce(
    (totals, child) => {
      for (const task of child.implementation_tasks || []) {
        totals.total += 1;
        if (task.status === 'verified') totals.verified += 1;
        if (task.status === 'pending') totals.pending += 1;
        if (task.status === 'blocked') totals.blocked += 1;
        if (task.requires_approval) totals.requiresApproval += 1;
      }
      return totals;
    },
    { total: 0, verified: 0, pending: 0, blocked: 0, requiresApproval: 0 }
  );
}

function toStatusBoardItems(children: FactoryChild[], pendingApprovals: number): SubagentRecord[] {
  return children.map((child) => {
    const taskCounts = (child.implementation_tasks || []).reduce(
      (totals, task) => {
        if (task.status === 'verified') totals.verified += 1;
        if (task.status === 'pending') totals.pending += 1;
        if (task.status === 'blocked') totals.blocked += 1;
        if (task.requires_approval) totals.requiresApproval += 1;
        return totals;
      },
      { verified: 0, pending: 0, blocked: 0, requiresApproval: 0 }
    );

    return {
      id: child.id,
      name: child.name,
      kind: child.category || 'Factory child',
      status: child.workflow_state || child.status || 'unknown',
      visibleInDashboard: true,
      lastOutcome: child.workflow_note || child.summary || 'No runtime note yet.',
      alertCount: taskCounts.blocked,
      approvalCount: taskCounts.requiresApproval || pendingApprovals,
      humanTouchpoint: taskCounts.requiresApproval > 0,
    };
  });
}

function toFallbackStatusBoardItems(items: SubagentRecord[]): SubagentRecord[] {
  return items.filter((item) => item.visibleInDashboard);
}

function toAlertsFromState(factory: FactoryState): FactoryAlert[] {
  const children = Array.isArray(factory.children) ? factory.children : [];
  return children
    .filter((child) => child.workflow_state === 'blocked')
    .slice(0, 6)
    .map((child, index) => ({
      id: `child-alert-${child.id}-${index}`,
      level: 'warning',
      title: `${child.name} is blocked`,
      message: child.workflow_note || child.summary || 'This child needs operator attention before work can continue.',
      status: child.status || child.workflow_state || 'blocked',
      createdAt: factory.status?.last_updated || new Date().toISOString(),
    }));
}

async function loadAgentFactoryData() {
  const localDataDir = path.join(process.cwd(), 'data');
  const [sharedState, localSubagents, localApprovals, localAlerts] = await Promise.all([
    readJsonFile<FactoryState>(SHARED_FACTORY_STATE_PATH),
    readJsonFile<SubagentRecord[]>(path.join(localDataDir, 'subagents.json')),
    readJsonFile<FactoryApproval[]>(path.join(localDataDir, 'agent-factory-approvals.json')),
    readJsonFile<FactoryAlert[]>(path.join(localDataDir, 'agent-factory-alerts.json')),
  ]);

  const factory = sharedState || {};
  const children = Array.isArray(factory.children) ? factory.children : [];
  const approvals =
    Array.isArray(factory.approvals) && factory.approvals.length
      ? factory.approvals.map((item, index) => ({
          id: item.id || `factory-approval-${index}`,
          title: item.title || 'Pending approval',
          summary: item.summary || 'No approval summary provided.',
          status: item.status || 'pending',
          priority: item.priority || 'medium',
          createdAt: item.createdAt || factory.status?.last_updated || new Date().toISOString(),
        }))
      : localApprovals || [];
  const alerts = toAlertsFromState(factory);
  const resolvedAlerts = alerts.length ? alerts : localAlerts || [];
  const statusItems = children.length
    ? toStatusBoardItems(children, approvals.filter((item) => item.status === 'pending').length)
    : toFallbackStatusBoardItems(localSubagents || []);
  const taskCounts = countTasks(children);

  return {
    factory,
    approvals,
    alerts: resolvedAlerts,
    statusItems,
    taskCounts,
    guidance: Array.isArray(factory.guidance) ? factory.guidance : [],
    ideas: Array.isArray(factory.ideas) ? factory.ideas : [],
    isSharedState: Boolean(sharedState),
  };
}

export default async function AgentFactoryPage() {
  const { factory, approvals, alerts, statusItems, taskCounts, guidance, ideas, isSharedState } =
    await loadAgentFactoryData();
  const status = factory.status || {};

  return (
    <AppShell
      title="Agent Factory"
      subtitle="Track supervised subagent builds, approvals, guidance, and verification work in one operational surface instead of a placeholder redirect."
    >
      <InternalSurfaceNotice
        title="Internal orchestration surface"
        body="Agent Factory is for supervised builder work only. It should expose approvals, proof, blocked work, and child status without quietly widening scope or pretending a scaffold is a finished system."
      />

      <section className="aurora-panel rounded-[28px] p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-100">Factory pulse</div>
            <h2 className="mt-1 text-2xl font-semibold text-white">
              {status.state ? `${status.state} · ${status.mode || 'supervised'}` : 'Seeded and ready'}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-cyan-50/84">
              {isSharedState
                ? 'This page is reading the shared OpenClaw factory state from the orchestration workspace, so the dashboard reflects the live build queue rather than only local seed data.'
                : 'Shared factory state was not available, so this page is showing the local seed dataset bundled with the app.'}
            </p>
          </div>
          <div className="rounded-2xl border border-cyan-200/10 bg-[rgba(9,22,39,0.72)] px-4 py-3 text-sm text-cyan-50/82">
            <div><span className="text-cyan-100">Active build:</span> {status.active_build || 'None'}</div>
            <div className="mt-1"><span className="text-cyan-100">Last update:</span> {fmtTimestamp(status.last_updated)}</div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-cyan-200/10 bg-[rgba(8,22,38,0.68)] p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100/84">Pending approvals</div>
            <div className="mt-2 text-3xl font-semibold text-white">{approvals.filter((item) => item.status === 'pending').length}</div>
            <div className="mt-2 text-sm text-cyan-50/72">Queue that still needs human approval before promotion.</div>
          </div>
          <div className="rounded-2xl border border-cyan-200/10 bg-[rgba(8,22,38,0.68)] p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100/84">Children online</div>
            <div className="mt-2 text-3xl font-semibold text-white">{statusItems.length}</div>
            <div className="mt-2 text-sm text-cyan-50/72">Subagents currently visible in the factory control surface.</div>
          </div>
          <div className="rounded-2xl border border-cyan-200/10 bg-[rgba(8,22,38,0.68)] p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100/84">Verified tasks</div>
            <div className="mt-2 text-3xl font-semibold text-white">{taskCounts.verified}</div>
            <div className="mt-2 text-sm text-cyan-50/72">Implementation steps with visible proof already captured.</div>
          </div>
          <div className="rounded-2xl border border-cyan-200/10 bg-[rgba(8,22,38,0.68)] p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100/84">Queued builds</div>
            <div className="mt-2 text-3xl font-semibold text-white">{status.queued_builds ?? 0}</div>
            <div className="mt-2 text-sm text-cyan-50/72">Builds waiting behind the current supervised execution path.</div>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <SubagentStatusBoard items={statusItems} />
          <div className="rounded-xl border border-cyan-200/10 bg-[rgba(8,22,38,0.68)] p-4">
            <h2 className="text-lg font-semibold text-white">Guidance and next operator actions</h2>
            <div className="mt-4 space-y-3">
              {guidance.length ? (
                guidance.slice(0, 6).map((item, index) => (
                  <div key={`${item.title || 'guidance'}-${index}`} className="rounded-lg border border-cyan-200/10 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-cyan-50">{item.title || 'Open guidance request'}</div>
                      <div className="text-xs uppercase tracking-[0.12em] text-cyan-100/72">{item.status || 'open'}</div>
                    </div>
                    <div className="mt-2 text-sm text-cyan-50/80">{item.summary || 'No summary captured yet.'}</div>
                    <div className="mt-2 text-xs text-cyan-100/60">{fmtTimestamp(item.requested_at)}</div>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-cyan-200/10 p-4 text-sm text-cyan-50/72">
                  No open guidance requests are recorded right now.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <ApprovalInbox items={approvals} />
          <AlertCenter items={alerts} />
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-[28px] border border-cyan-200/10 bg-[rgba(8,22,38,0.68)] p-6">
          <h2 className="text-xl font-semibold text-white">Implementation queue</h2>
          <p className="mt-2 text-sm leading-7 text-cyan-50/78">
            This is the current task-level build picture from the shared factory state.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-4">
            <div className="rounded-2xl border border-cyan-200/10 p-4">
              <div className="text-xs uppercase tracking-[0.14em] text-cyan-100/80">Total tasks</div>
              <div className="mt-2 text-2xl font-semibold text-white">{taskCounts.total}</div>
            </div>
            <div className="rounded-2xl border border-cyan-200/10 p-4">
              <div className="text-xs uppercase tracking-[0.14em] text-cyan-100/80">Pending tasks</div>
              <div className="mt-2 text-2xl font-semibold text-white">{taskCounts.pending}</div>
            </div>
            <div className="rounded-2xl border border-cyan-200/10 p-4">
              <div className="text-xs uppercase tracking-[0.14em] text-cyan-100/80">Blocked tasks</div>
              <div className="mt-2 text-2xl font-semibold text-white">{taskCounts.blocked}</div>
            </div>
            <div className="rounded-2xl border border-cyan-200/10 p-4">
              <div className="text-xs uppercase tracking-[0.14em] text-cyan-100/80">Approval gates</div>
              <div className="mt-2 text-2xl font-semibold text-white">{taskCounts.requiresApproval}</div>
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-cyan-200/10 bg-[rgba(8,22,38,0.68)] p-6">
          <h2 className="text-xl font-semibold text-white">Idea intake</h2>
          <p className="mt-2 text-sm leading-7 text-cyan-50/78">
            Captured factory ideas waiting to be converted into supervised specs.
          </p>
          <div className="mt-4 space-y-3">
            {ideas.length ? (
              ideas.slice(0, 6).map((idea, index) => (
                <div key={`${idea.name || 'idea'}-${index}`} className="rounded-lg border border-cyan-200/10 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium text-cyan-50">{idea.name || 'Untitled idea'}</div>
                    <div className="text-xs uppercase tracking-[0.12em] text-cyan-100/72">{idea.category || 'general'}</div>
                  </div>
                  <div className="mt-2 text-sm text-cyan-50/80">{idea.purpose || 'No purpose captured yet.'}</div>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-cyan-200/10 p-4 text-sm text-cyan-50/72">
                No rough ideas are queued in the current factory state.
              </div>
            )}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
