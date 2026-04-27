'use client';

import { useEffect, useState } from 'react';
import { createEmptyDictationCommand, DEFAULT_DICTATION_COMMANDS } from '@/lib/dictation/command-library';
import type { DictationCommandDefinition, DictationCommandAction, DictationCommandScope } from '@/types/dictation';

const ACTION_OPTIONS: DictationCommandAction[] = ['insert_template', 'insert_text', 'navigate_target'];
const SCOPE_OPTIONS: DictationCommandScope[] = ['veranote_source', 'desktop_overlay', 'ehr_field'];

function normalizeSpokenPhraseList(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function DictationCommandManager({
  commands,
  onSave,
  compact = false,
}: {
  commands: DictationCommandDefinition[];
  onSave: (commands: DictationCommandDefinition[]) => Promise<void> | void;
  compact?: boolean;
}) {
  const [draftCommands, setDraftCommands] = useState<DictationCommandDefinition[]>(commands);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDraftCommands(commands);
  }, [commands]);

  function updateCommand(commandId: string, patch: Partial<DictationCommandDefinition>) {
    setDraftCommands((current) => current.map((command) => (
      command.id === commandId ? { ...command, ...patch } : command
    )));
  }

  function removeCommand(commandId: string) {
    setDraftCommands((current) => current.filter((command) => command.id !== commandId));
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      await onSave(draftCommands.map((command) => ({
        ...command,
        spokenPhrases: command.spokenPhrases.filter(Boolean),
      })));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className={compact ? 'grid gap-3' : 'workspace-subpanel rounded-[22px] p-4'}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/64">Stored commands</div>
          <div className="mt-1 text-sm font-semibold text-white">
            {compact ? 'Command library' : 'Editable dictation command library'}
          </div>
          <div className="mt-2 text-sm text-cyan-50/74">
            Commands stay review-first. They expand into visible source text before anything is inserted.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setDraftCommands((current) => [...current, createEmptyDictationCommand()])}
            className="rounded-xl bg-[rgba(56,189,248,0.16)] px-3 py-2 text-sm font-medium text-sky-50"
          >
            Add command
          </button>
          <button
            type="button"
            onClick={() => setDraftCommands(DEFAULT_DICTATION_COMMANDS)}
            className="rounded-xl bg-[rgba(255,255,255,0.08)] px-3 py-2 text-sm font-medium text-cyan-50/82"
          >
            Restore defaults
          </button>
          <button
            type="button"
            onClick={() => {
              void handleSave();
            }}
            className="rounded-xl bg-[rgba(34,197,94,0.18)] px-3 py-2 text-sm font-medium text-emerald-50"
          >
            {isSaving ? 'Saving...' : 'Save commands'}
          </button>
        </div>
      </div>

      <div className={compact ? 'space-y-3' : 'mt-4 space-y-3'}>
        {draftCommands.map((command) => (
          <details
            key={command.id}
            className="rounded-[18px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-4"
            open={!compact}
          >
            <summary className="cursor-pointer list-none">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">{command.label || 'Untitled command'}</div>
                  <div className="mt-1 text-xs text-cyan-50/66">
                    {(command.spokenPhrases.length ? command.spokenPhrases.join(', ') : 'No spoken triggers yet')}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-50/70">
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">{command.action.replace(/_/g, ' ')}</span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">{command.scope.replace(/_/g, ' ')}</span>
                </div>
              </div>
            </summary>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <label className="text-xs text-cyan-50/74">
                <span className="mb-1 block uppercase tracking-[0.12em] text-cyan-100/62">Label</span>
                <input
                  value={command.label}
                  onChange={(event) => updateCommand(command.id, { label: event.target.value })}
                  className="workspace-control w-full rounded-xl px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs text-cyan-50/74">
                <span className="mb-1 block uppercase tracking-[0.12em] text-cyan-100/62">Spoken phrases</span>
                <input
                  value={command.spokenPhrases.join(', ')}
                  onChange={(event) => updateCommand(command.id, { spokenPhrases: normalizeSpokenPhraseList(event.target.value) })}
                  className="workspace-control w-full rounded-xl px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs text-cyan-50/74">
                <span className="mb-1 block uppercase tracking-[0.12em] text-cyan-100/62">Action</span>
                <select
                  value={command.action}
                  onChange={(event) => updateCommand(command.id, { action: event.target.value as DictationCommandAction })}
                  className="workspace-control w-full rounded-xl px-3 py-2 text-sm"
                >
                  {ACTION_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-cyan-50/74">
                <span className="mb-1 block uppercase tracking-[0.12em] text-cyan-100/62">Scope</span>
                <select
                  value={command.scope}
                  onChange={(event) => updateCommand(command.id, { scope: event.target.value as DictationCommandScope })}
                  className="workspace-control w-full rounded-xl px-3 py-2 text-sm"
                >
                  {SCOPE_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="mt-3 block text-xs text-cyan-50/74">
              <span className="mb-1 block uppercase tracking-[0.12em] text-cyan-100/62">Description</span>
              <input
                value={command.description}
                onChange={(event) => updateCommand(command.id, { description: event.target.value })}
                className="workspace-control w-full rounded-xl px-3 py-2 text-sm"
              />
            </label>

            {command.action !== 'navigate_target' ? (
              <label className="mt-3 block text-xs text-cyan-50/74">
                <span className="mb-1 block uppercase tracking-[0.12em] text-cyan-100/62">Inserted text</span>
                <textarea
                  value={command.outputText || ''}
                  onChange={(event) => updateCommand(command.id, { outputText: event.target.value })}
                  className="workspace-control min-h-[110px] w-full rounded-xl px-3 py-2 text-sm"
                />
              </label>
            ) : null}

            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => removeCommand(command.id)}
                className="rounded-xl bg-[rgba(244,63,94,0.16)] px-3 py-2 text-sm font-medium text-rose-50"
              >
                Remove
              </button>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
