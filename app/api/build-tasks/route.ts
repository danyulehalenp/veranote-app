import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { listVeranoteBuildTasks, saveVeranoteBuildTasks } from '@/lib/db/client';
import type { VeranoteBuildTask } from '@/types/task';

const SHARED_TASK_FILE = path.join(os.homedir(), '.openclaw', 'shared', 'veranote-build-tasks.json');

async function writeSharedTaskFile(tasks: VeranoteBuildTask[]) {
  await fs.mkdir(path.dirname(SHARED_TASK_FILE), { recursive: true });
  await fs.writeFile(SHARED_TASK_FILE, JSON.stringify({ tasks }, null, 2), 'utf8');
}

async function syncTasksToImac(tasks: VeranoteBuildTask[]) {
  return new Promise<boolean>((resolve) => {
    const child = spawn('ssh', ['openclaw-imac', 'mkdir -p ~/.openclaw/shared && cat > ~/.openclaw/shared/veranote-build-tasks.json'], {
      stdio: ['pipe', 'ignore', 'ignore'],
    });

    child.on('error', () => resolve(false));
    child.stdin.write(JSON.stringify({ tasks }, null, 2));
    child.stdin.end();
    child.on('close', (code) => resolve(code === 0));
  });
}

export async function GET() {
  const tasks = await listVeranoteBuildTasks();
  return NextResponse.json({ tasks });
}

export async function POST(request: Request) {
  const body = await request.json();
  const tasks = Array.isArray(body?.tasks) ? body.tasks as VeranoteBuildTask[] : null;

  if (!tasks) {
    return NextResponse.json({ error: 'Task array is required.' }, { status: 400 });
  }

  const saved = await saveVeranoteBuildTasks(tasks);
  await writeSharedTaskFile(saved);
  const syncedToImac = await syncTasksToImac(saved).catch(() => false);
  return NextResponse.json({ tasks: saved, syncedToImac });
}
