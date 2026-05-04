'use client';

import { useRef, useState } from 'react';

type ComposerProps = {
  disabled?: boolean;
  placeholder?: string;
  onSend: (message: string) => Promise<void> | void;
  compact?: boolean;
};

export function Composer({ disabled, placeholder, onSend, compact = false }: ComposerProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!value.trim() || disabled) {
      return;
    }

    const nextValue = value.trim();
    setValue('');
    await onSend(nextValue);
    textareaRef.current?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) {
      return;
    }

    event.preventDefault();

    if (!value.trim() || disabled) {
      return;
    }

    const form = event.currentTarget.form;
    if (form) {
      form.requestSubmit();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3">
      <div className="rounded-[18px] border border-cyan-200/12 bg-[rgba(7,17,30,0.72)] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <textarea
          ref={textareaRef}
          data-testid="assistant-composer-input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder || 'Ask a follow-up or switch topics...'}
          className={`w-full resize-none rounded-[14px] border border-cyan-200/10 bg-[rgba(4,12,24,0.74)] px-3 py-2.5 text-sm leading-6 text-cyan-50 outline-none transition placeholder:text-cyan-100/42 focus:border-cyan-200/30 focus:bg-[rgba(5,18,32,0.9)] disabled:cursor-not-allowed disabled:opacity-60 ${
            compact ? 'min-h-[58px]' : 'min-h-[72px]'
          }`}
        />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-[11px] leading-5 text-cyan-100/52">
          Press Enter to send. Shift+Enter adds a new line.
        </div>
        <button
          type="submit"
          data-testid="assistant-send-button"
          disabled={disabled || !value.trim()}
          className="aurora-primary-button w-full rounded-xl px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          Send
        </button>
      </div>
    </form>
  );
}
