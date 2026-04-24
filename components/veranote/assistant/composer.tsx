'use client';

import { useRef, useState } from 'react';

type ComposerProps = {
  disabled?: boolean;
  placeholder?: string;
  onSend: (message: string) => Promise<void> | void;
};

export function Composer({ disabled, placeholder, onSend }: ComposerProps) {
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
        placeholder={placeholder || 'Ask your own question about this warning, this section, your note preferences, privacy, or your workflow...'}
        className="min-h-[96px] w-full rounded-[18px] border border-border bg-white p-3 text-sm leading-6 text-slate-900 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-[84px]"
      />
      <div className="flex justify-stretch sm:justify-end">
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="aurora-primary-button w-full rounded-xl px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          Send
        </button>
      </div>
    </form>
  );
}
