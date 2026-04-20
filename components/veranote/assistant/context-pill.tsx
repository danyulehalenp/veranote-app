'use client';

import { useState } from 'react';
import type { AssistantStage } from '@/types/assistant';

type ContextPillProps = {
  stage: AssistantStage;
};

const stageDescriptions: Record<AssistantStage, string> = {
  compose: 'Compose is where you shape the note lane, organize source material, and set the prompt and note preferences before draft generation.',
  review: 'Review is where you check trust flags, tighten wording, and finish the note without losing sight of the source.',
};

export function ContextPill({ stage }: ContextPillProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="aurora-pill rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]"
      >
        {stage === 'compose' ? 'Compose stage' : 'Review stage'}
      </button>
      {expanded ? (
        <div className="aurora-soft-panel max-w-[260px] rounded-[18px] p-3 text-xs leading-6 text-muted">
          {stageDescriptions[stage]}
        </div>
      ) : null}
    </div>
  );
}
