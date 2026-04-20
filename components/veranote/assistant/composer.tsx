'use client';

import { useRef, useState } from 'react';

type ComposerProps = {
  disabled?: boolean;
  onSend: (message: string) => Promise<void> | void;
};

export function Composer({ disabled, onSend }: ComposerProps) {
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
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder="Ask your own question about this warning, this section, your note preferences, privacy, or your workflow..."
        className="min-h-[84px] w-full rounded-[18px] border border-border bg-white p-3 text-sm text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
      />
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="aurora-primary-button rounded-xl px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
        >
          Send
        </button>
      </div>
    </form>
  );
}
