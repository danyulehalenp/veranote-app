'use client';

import type { ReactNode } from 'react';
import type { AssistantAvatarId } from '@/lib/veranote/assistant-persona';

type AssistantPersonaAvatarProps = {
  avatar: AssistantAvatarId;
  label: string;
  size?: 'sm' | 'md' | 'lg';
  selected?: boolean;
};

const sizeClasses = {
  sm: 'h-9 w-9',
  md: 'h-12 w-12',
  lg: 'h-16 w-16',
} as const;

function AvatarFrame({
  children,
  label,
  size = 'md',
  selected = false,
}: {
  children: ReactNode;
  label: string;
  size?: 'sm' | 'md' | 'lg';
  selected?: boolean;
}) {
  return (
    <span
      aria-label={label}
      className={`inline-flex items-center justify-center rounded-[18px] border bg-[linear-gradient(145deg,rgba(6,17,31,0.96),rgba(8,32,58,0.94))] text-cyan-50 shadow-[0_16px_36px_rgba(4,12,24,0.18)] ${
        selected ? 'border-cyan-200/40 ring-2 ring-cyan-300/30' : 'border-cyan-200/14'
      } ${sizeClasses[size]}`}
    >
      <svg viewBox="0 0 48 48" className="h-[72%] w-[72%]" fill="none" aria-hidden="true">
        {children}
      </svg>
    </span>
  );
}

function AvatarGlyph({ avatar }: { avatar: AssistantAvatarId }) {
  switch (avatar) {
    case 'logic-lattice':
      return (
        <>
          <path d="M12 14h24v20H12z" rx="8" stroke="url(#accent)" strokeWidth="2.4" />
          <circle cx="16" cy="18" r="2.6" fill="#9BE7FF" />
          <circle cx="32" cy="18" r="2.6" fill="#9BE7FF" />
          <circle cx="24" cy="24" r="3.2" fill="#D8FBFF" />
          <circle cx="16" cy="30" r="2.6" fill="#9BE7FF" />
          <circle cx="32" cy="30" r="2.6" fill="#9BE7FF" />
          <path d="M18.3 18.9 21.8 22M29.7 18.9 26.2 22M18.3 29.1 21.8 26M29.7 29.1 26.2 26" stroke="#41D9F7" strokeWidth="1.8" strokeLinecap="round" />
        </>
      );
    case 'friendly-silhouette':
      return (
        <>
          <path d="M24 9c4.6 0 8 3.4 8 8 0 4.5-3.4 8-8 8s-8-3.5-8-8c0-4.6 3.4-8 8-8Z" fill="url(#softFill)" />
          <path d="M12 36c1.8-5.7 6.7-8.8 12-8.8S34.2 30.3 36 36" stroke="url(#accent)" strokeWidth="2.6" strokeLinecap="round" />
          <path d="M17 36h14" stroke="#D8FBFF" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
        </>
      );
    case 'signal-bridge':
      return (
        <>
          <path d="M11 15h8M29 15h8M11 33h8M29 33h8" stroke="#9BE7FF" strokeWidth="2" strokeLinecap="round" />
          <path d="M17 24h14" stroke="#D8FBFF" strokeWidth="2.6" strokeLinecap="round" />
          <circle cx="10" cy="15" r="3" fill="#41D9F7" />
          <circle cx="38" cy="15" r="3" fill="#41D9F7" />
          <circle cx="10" cy="33" r="3" fill="#41D9F7" />
          <circle cx="38" cy="33" r="3" fill="#41D9F7" />
          <circle cx="24" cy="24" r="5.5" fill="url(#softFill)" stroke="url(#accent)" strokeWidth="2" />
        </>
      );
    case 'steady-compass':
      return (
        <>
          <circle cx="24" cy="24" r="15" stroke="url(#accent)" strokeWidth="2.4" />
          <circle cx="24" cy="24" r="4.2" fill="#D8FBFF" />
          <path d="M24 11v4M24 33v4M11 24h4M33 24h4" stroke="#9BE7FF" strokeWidth="1.8" strokeLinecap="round" />
          <path d="m24 18 5.5 10L24 26l-5.5 2L24 18Z" fill="#41D9F7" />
        </>
      );
    case 'north-star':
      return (
        <>
          <path d="m24 10 3.2 9.8L37 24l-9.8 4.2L24 38l-3.2-9.8L11 24l9.8-4.2L24 10Z" fill="url(#softFill)" stroke="url(#accent)" strokeWidth="2.2" />
          <circle cx="24" cy="24" r="3.1" fill="#0F172A" />
          <path d="M24 6v4M24 38v4M6 24h4M38 24h4" stroke="#9BE7FF" strokeWidth="1.7" strokeLinecap="round" opacity="0.9" />
        </>
      );
    case 'care-frame':
      return (
        <>
          <rect x="11" y="11" width="26" height="26" rx="9" stroke="url(#accent)" strokeWidth="2.4" />
          <rect x="18" y="18" width="12" height="12" rx="4.5" fill="url(#softFill)" />
          <path d="M18 24h12M24 18v12" stroke="#41D9F7" strokeWidth="1.8" strokeLinecap="round" />
        </>
      );
    case 'calm-pulse':
      return (
        <>
          <rect x="10.5" y="14" width="27" height="20" rx="10" stroke="url(#accent)" strokeWidth="2.2" />
          <path d="M14 25h4l2.6-5.5 4.1 10.2 2.8-5.7H34" stroke="#D8FBFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </>
      );
    case 'clinical-orbit':
    default:
      return (
        <>
          <circle cx="24" cy="24" r="15.2" stroke="url(#accent)" strokeWidth="2.4" />
          <circle cx="24" cy="24" r="5.5" fill="url(#softFill)" />
          <circle cx="35.5" cy="18" r="2.6" fill="#41D9F7" />
          <path d="M17.3 31.4c2.3 1.9 4.2 2.6 6.7 2.6 4.6 0 8.3-2.7 9.6-7" stroke="#9BE7FF" strokeWidth="1.9" strokeLinecap="round" />
        </>
      );
  }
}

export function AssistantPersonaAvatar({
  avatar,
  label,
  size = 'md',
  selected = false,
}: AssistantPersonaAvatarProps) {
  return (
    <AvatarFrame label={label} size={size} selected={selected}>
      <defs>
        <linearGradient id="accent" x1="8" y1="8" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#D8FBFF" />
          <stop offset="0.45" stopColor="#78E7FF" />
          <stop offset="1" stopColor="#14B8A6" />
        </linearGradient>
        <linearGradient id="softFill" x1="14" y1="12" x2="32" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#D8FBFF" />
          <stop offset="1" stopColor="#41D9F7" />
        </linearGradient>
      </defs>
      <AvatarGlyph avatar={avatar} />
    </AvatarFrame>
  );
}
