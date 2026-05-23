import { execFile as execFileCallback } from 'child_process';
import { promisify } from 'util';

const execFile = promisify(execFileCallback);

export type MacDesktopContext = {
  appName: string;
  elementRole: string;
  windowTitle: string;
  focusedLabel: string;
  automationStatus: 'full' | 'partial' | 'unavailable';
  automationError?: string;
};

export type MacInsertionAttempt =
  | { mode: 'set_value'; detail: string }
  | { mode: 'paste_keystroke'; detail: string }
  | { mode: 'unavailable'; detail: string };

type ExecFileLike = (
  file: string,
  args: readonly string[],
  options?: { timeout?: number },
) => Promise<{ stdout?: string | Buffer; stderr?: string | Buffer }>;

async function runCommand(
  runner: ExecFileLike,
  file: string,
  args: readonly string[],
  timeout = 1500,
) {
  try {
    const result = await runner(file, args, { timeout });
    return {
      ok: true as const,
      stdout: String(result.stdout || '').trim(),
      stderr: String(result.stderr || '').trim(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown desktop automation error.';
    return {
      ok: false as const,
      stdout: '',
      stderr: message,
    };
  }
}

export async function getFrontmostAppName(runner: ExecFileLike = execFile) {
  const result = await runCommand(
    runner,
    'osascript',
    [
      '-l',
      'JavaScript',
      '-e',
      'ObjC.import("AppKit"); const app = $.NSWorkspace.sharedWorkspace.frontmostApplication; console.log(ObjC.unwrap(app.localizedName));',
    ],
    1200,
  );

  if (!result.ok || !result.stdout) {
    return {
      appName: '',
      error: result.stderr || 'Unable to detect the frontmost app.',
    };
  }

  return {
    appName: result.stdout.split('\n').filter(Boolean).pop() || '',
  };
}

export async function detectActiveDesktopContext(
  runner: ExecFileLike = execFile,
): Promise<MacDesktopContext> {
  const frontmost = await getFrontmostAppName(runner);
  const appName = frontmost.appName || '';

  const detailResult = await runCommand(
    runner,
    'osascript',
    [
      '-l',
      'JavaScript',
      '-e',
      `
        const se = Application("System Events");
        const procs = se.applicationProcesses.whose({ frontmost: true })();
        if (!procs.length) {
          console.log("|||");
        } else {
          const proc = procs[0];
          let windowTitle = "";
          let role = "";
          let label = "";
          try { windowTitle = proc.windows[0].name(); } catch (error) {}
          try { role = proc.windows[0].attributes.byName("AXFocusedUIElement").value().attributes.byName("AXRoleDescription").value(); } catch (error) {}
          try { label = proc.windows[0].attributes.byName("AXFocusedUIElement").value().attributes.byName("AXDescription").value(); } catch (error) {}
          console.log([proc.name(), role, windowTitle, label].join("||"));
        }
      `,
    ],
    1500,
  );

  if (!detailResult.ok) {
    return {
      appName,
      elementRole: '',
      windowTitle: '',
      focusedLabel: '',
      automationStatus: appName ? 'partial' : 'unavailable',
      automationError: detailResult.stderr || frontmost.error || 'Accessibility context is unavailable.',
    };
  }

  const [detectedAppName, elementRole, windowTitle, focusedLabel] = detailResult.stdout.split('||');
  return {
    appName: detectedAppName || appName,
    elementRole: elementRole || '',
    windowTitle: windowTitle || '',
    focusedLabel: focusedLabel || '',
    automationStatus: elementRole || windowTitle || focusedLabel ? 'full' : (appName ? 'partial' : 'unavailable'),
    automationError: undefined,
  };
}

export async function trySetFocusedFieldValue(
  text: string,
  runner: ExecFileLike = execFile,
): Promise<MacInsertionAttempt> {
  const result = await runCommand(
    runner,
    'osascript',
    [
      '-l',
      'JavaScript',
      '-e',
      `
        const textToInsert = $.NSProcessInfo.processInfo.arguments.objectAtIndex(4).js;
        const se = Application("System Events");
        const procs = se.applicationProcesses.whose({ frontmost: true })();
        if (!procs.length) {
          console.log("unavailable||No frontmost desktop app detected.");
        } else {
          try {
            const focused = procs[0].windows[0].attributes.byName("AXFocusedUIElement").value();
            const role = String(focused.attributes.byName("AXRoleDescription").value() || "");
            const currentValue = String(focused.value() || "");
            focused.attributes.byName("AXValue").set({ value: currentValue + textToInsert });
            console.log("set_value||" + (role || "text field"));
          } catch (error) {
            console.log("unavailable||" + error.message);
          }
        }
      `,
      text,
    ],
    1500,
  );

  if (!result.ok) {
    return {
      mode: 'unavailable',
      detail: result.stderr || 'Accessibility value insertion is unavailable.',
    };
  }

  const [mode, detail] = result.stdout.split('||');
  if (mode === 'set_value') {
    return {
      mode: 'set_value',
      detail: detail || 'Inserted text directly into the focused field.',
    };
  }

  return {
    mode: 'unavailable',
    detail: detail || 'Accessibility value insertion is unavailable.',
  };
}

export async function tryPasteIntoActiveApp(
  runner: ExecFileLike = execFile,
): Promise<MacInsertionAttempt> {
  const result = await runCommand(
    runner,
    'osascript',
    [
      '-e',
      'tell application "System Events" to keystroke "v" using command down',
    ],
    1200,
  );

  if (!result.ok) {
    return {
      mode: 'unavailable',
      detail: result.stderr || 'Paste keystroke automation is unavailable.',
    };
  }

  return {
    mode: 'paste_keystroke',
    detail: 'Pasted the current field buffer into the active app.',
  };
}
