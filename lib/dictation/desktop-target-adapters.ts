type FieldTarget = {
  id: string;
  label: string;
  note: string;
};

type WorkflowProfile = {
  destination: string;
  destinationLabel: string;
  speechBoxMode: 'floating-source-box' | 'floating-field-box';
  supportsDirectFieldInsertion: boolean;
  directFieldGuidance: string;
  fieldTargets: FieldTarget[];
};

export type DesktopContext = {
  appName?: string;
  elementRole?: string;
  windowTitle?: string;
  focusedLabel?: string;
};

export type DesktopInsertionStrategy =
  | 'accessibility_set_value'
  | 'paste_keystroke'
  | 'clipboard_only';

export type DesktopInsertionBehavior = 'append' | 'replace' | 'confirm_before_replace';

export type DesktopFieldTargetPack = {
  fieldTargetId: string;
  aliases: string[];
  appLabelHints: string[];
  windowTitleHints: string[];
  preferredBehavior: DesktopInsertionBehavior;
  insertionNote: string;
};

export type DesktopTargetAdapter = {
  id: string;
  label: string;
  appMatchers: string[];
  titleHints: string[];
  destinationMatchers: string[];
  preferredStrategies: DesktopInsertionStrategy[];
  fieldPacks: DesktopFieldTargetPack[];
};

const DESKTOP_TARGET_ADAPTERS: DesktopTargetAdapter[] = [
  {
    id: 'wellsky-browser',
    label: 'WellSky in browser',
    appMatchers: ['google chrome', 'safari', 'arc', 'microsoft edge', 'firefox'],
    titleHints: ['wellsky'],
    destinationMatchers: ['wellsky'],
    preferredStrategies: ['accessibility_set_value', 'paste_keystroke', 'clipboard_only'],
    fieldPacks: [
      {
        fieldTargetId: 'wellsky-summary',
        aliases: ['narrative summary', 'summary', 'subjective', 'hpi', 'interval update'],
        appLabelHints: ['summary', 'subjective', 'narrative'],
        windowTitleHints: ['summary', 'subjective', 'narrative'],
        preferredBehavior: 'append',
        insertionNote: 'Append narrative updates into the summary field unless the operator wants to overwrite boilerplate.',
      },
      {
        fieldTargetId: 'wellsky-assessment-plan',
        aliases: ['assessment', 'plan', 'assessment / plan'],
        appLabelHints: ['assessment', 'plan'],
        windowTitleHints: ['assessment', 'plan'],
        preferredBehavior: 'append',
        insertionNote: 'Append treatment and planning text to preserve prior assessment-plan context.',
      },
    ],
  },
  {
    id: 'tebra-browser',
    label: 'Tebra/Kareo in browser',
    appMatchers: ['google chrome', 'safari', 'arc', 'microsoft edge', 'firefox'],
    titleHints: ['tebra', 'kareo'],
    destinationMatchers: ['tebra', 'kareo'],
    preferredStrategies: ['accessibility_set_value', 'paste_keystroke', 'clipboard_only'],
    fieldPacks: [
      {
        fieldTargetId: 'tebra-subjective',
        aliases: ['subjective', 'hpi', 'chief complaint', 'symptom review'],
        appLabelHints: ['subjective', 'hpi', 'chief complaint'],
        windowTitleHints: ['subjective', 'hpi'],
        preferredBehavior: 'append',
        insertionNote: 'Append interval narrative so the subjective field keeps chronological updates.',
      },
      {
        fieldTargetId: 'tebra-mental-functional',
        aliases: ['mental', 'mental functional', 'mse', 'observations'],
        appLabelHints: ['mental', 'mse', 'observation'],
        windowTitleHints: ['mental', 'mse'],
        preferredBehavior: 'append',
        insertionNote: 'Append MSE observations unless the field is clearly empty and you are replacing a placeholder.',
      },
      {
        fieldTargetId: 'tebra-assessment',
        aliases: ['assessment', 'diagnosis', 'clinical status'],
        appLabelHints: ['assessment', 'diagnosis'],
        windowTitleHints: ['assessment', 'diagnosis'],
        preferredBehavior: 'append',
        insertionNote: 'Append assessment content to preserve earlier formulation text.',
      },
      {
        fieldTargetId: 'tebra-plan',
        aliases: ['plan', 'treatment plan', 'next steps'],
        appLabelHints: ['plan'],
        windowTitleHints: ['plan'],
        preferredBehavior: 'append',
        insertionNote: 'Append medication and follow-up changes to the plan field.',
      },
    ],
  },
  {
    id: 'simplepractice-browser',
    label: 'SimplePractice in browser',
    appMatchers: ['google chrome', 'safari', 'arc', 'microsoft edge', 'firefox'],
    titleHints: ['simplepractice'],
    destinationMatchers: ['simplepractice'],
    preferredStrategies: ['accessibility_set_value', 'paste_keystroke', 'clipboard_only'],
    fieldPacks: [
      {
        fieldTargetId: 'simplepractice-subjective',
        aliases: ['subjective', 'narrative', 'hpi', 'session narrative'],
        appLabelHints: ['subjective', 'narrative'],
        windowTitleHints: ['subjective', 'narrative'],
        preferredBehavior: 'append',
        insertionNote: 'Append subjective content for ongoing session updates.',
      },
      {
        fieldTargetId: 'simplepractice-objective',
        aliases: ['objective', 'mse', 'mental status'],
        appLabelHints: ['objective', 'mental status', 'mse'],
        windowTitleHints: ['objective', 'mse'],
        preferredBehavior: 'append',
        insertionNote: 'Append objective findings to preserve existing observations.',
      },
      {
        fieldTargetId: 'simplepractice-assessment',
        aliases: ['assessment', 'clinical status', 'diagnosis'],
        appLabelHints: ['assessment', 'diagnosis'],
        windowTitleHints: ['assessment'],
        preferredBehavior: 'append',
        insertionNote: 'Append interpretation and diagnostic framing.',
      },
      {
        fieldTargetId: 'simplepractice-plan',
        aliases: ['plan', 'homework', 'next steps'],
        appLabelHints: ['plan', 'next steps'],
        windowTitleHints: ['plan'],
        preferredBehavior: 'append',
        insertionNote: 'Append actionable follow-up items rather than replacing the whole plan.',
      },
    ],
  },
  {
    id: 'therapynotes-browser',
    label: 'TherapyNotes in browser',
    appMatchers: ['google chrome', 'safari', 'arc', 'microsoft edge', 'firefox'],
    titleHints: ['therapynotes'],
    destinationMatchers: ['therapynotes'],
    preferredStrategies: ['accessibility_set_value', 'paste_keystroke', 'clipboard_only'],
    fieldPacks: [
      {
        fieldTargetId: 'therapynotes-subjective',
        aliases: ['subjective', 'session narrative', 'interval history'],
        appLabelHints: ['subjective', 'session narrative'],
        windowTitleHints: ['subjective'],
        preferredBehavior: 'append',
        insertionNote: 'Append session narrative updates.',
      },
      {
        fieldTargetId: 'therapynotes-current-mental-status',
        aliases: ['current mental status', 'mse', 'mental status'],
        appLabelHints: ['mental status', 'mse'],
        windowTitleHints: ['mental status', 'mse'],
        preferredBehavior: 'append',
        insertionNote: 'Append mental status findings without replacing the full section.',
      },
      {
        fieldTargetId: 'therapynotes-assessment',
        aliases: ['assessment', 'diagnosis'],
        appLabelHints: ['assessment', 'diagnosis'],
        windowTitleHints: ['assessment'],
        preferredBehavior: 'append',
        insertionNote: 'Append assessment language to preserve earlier formulation.',
      },
      {
        fieldTargetId: 'therapynotes-plan',
        aliases: ['plan', 'treatment plan', 'follow-up'],
        appLabelHints: ['plan', 'follow-up'],
        windowTitleHints: ['plan'],
        preferredBehavior: 'append',
        insertionNote: 'Append plan and follow-up items.',
      },
    ],
  },
  {
    id: 'sessions-browser',
    label: 'Sessions Health in browser',
    appMatchers: ['google chrome', 'safari', 'arc', 'microsoft edge', 'firefox'],
    titleHints: ['sessions health'],
    destinationMatchers: ['sessions health'],
    preferredStrategies: ['accessibility_set_value', 'paste_keystroke', 'clipboard_only'],
    fieldPacks: [
      {
        fieldTargetId: 'sessions-summary',
        aliases: ['summary', 'subjective', 'session summary'],
        appLabelHints: ['summary', 'subjective'],
        windowTitleHints: ['summary', 'subjective'],
        preferredBehavior: 'append',
        insertionNote: 'Append new narrative to the summary field.',
      },
      {
        fieldTargetId: 'sessions-observations',
        aliases: ['objective', 'mse', 'observations'],
        appLabelHints: ['objective', 'observations', 'mse'],
        windowTitleHints: ['objective', 'mse'],
        preferredBehavior: 'append',
        insertionNote: 'Append objective and MSE findings.',
      },
      {
        fieldTargetId: 'sessions-assessment',
        aliases: ['assessment', 'diagnosis'],
        appLabelHints: ['assessment', 'diagnosis'],
        windowTitleHints: ['assessment'],
        preferredBehavior: 'append',
        insertionNote: 'Append assessment updates to preserve prior reasoning.',
      },
      {
        fieldTargetId: 'sessions-plan',
        aliases: ['plan', 'goals', 'follow-up'],
        appLabelHints: ['plan', 'goals', 'follow-up'],
        windowTitleHints: ['plan'],
        preferredBehavior: 'append',
        insertionNote: 'Append plan and goal content.',
      },
    ],
  },
  {
    id: 'notes-editor',
    label: 'Notes-style editor',
    appMatchers: ['notes', 'textedit', 'microsoft word', 'pages'],
    titleHints: [],
    destinationMatchers: ['generic'],
    preferredStrategies: ['accessibility_set_value', 'paste_keystroke', 'clipboard_only'],
    fieldPacks: [],
  },
];

function normalizeText(value?: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^\w\s/+-]/g, ' ')
    .replace(/\s+/g, ' ');
}

function scoreStringMatch(haystack: string, needle: string) {
  if (!haystack || !needle) {
    return 0;
  }

  if (haystack === needle) {
    return 8;
  }

  if (haystack.includes(needle)) {
    return 5;
  }

  const needleWords = needle.split(' ').filter(Boolean);
  const matchedWords = needleWords.filter((word) => haystack.includes(word));
  if (matchedWords.length) {
    return Math.min(4, matchedWords.length);
  }

  return 0;
}

export function resolveDesktopTargetAdapter(input: {
  destinationLabel?: string;
  desktopContext?: DesktopContext | null;
}) {
  const appName = normalizeText(input.desktopContext?.appName);
  const windowTitle = normalizeText(input.desktopContext?.windowTitle);
  const destination = normalizeText(input.destinationLabel);

  let best: DesktopTargetAdapter | null = null;
  let bestScore = 0;

  for (const adapter of DESKTOP_TARGET_ADAPTERS) {
    let score = 0;

    if (adapter.appMatchers.some((matcher) => appName.includes(matcher))) {
      score += 4;
    }

    for (const hint of adapter.titleHints) {
      if (windowTitle.includes(hint)) {
        score += 5;
      }
    }

    for (const matcher of adapter.destinationMatchers) {
      if (destination.includes(matcher)) {
        score += 3;
      }
    }

    if (score > bestScore) {
      best = adapter;
      bestScore = score;
    }
  }

  return best;
}

export function resolveDesktopInsertionStrategies(input: {
  destinationLabel?: string;
  desktopContext?: DesktopContext | null;
}) {
  const adapter = resolveDesktopTargetAdapter(input);
  return adapter?.preferredStrategies || ['accessibility_set_value', 'paste_keystroke', 'clipboard_only'];
}

export function resolveDesktopFieldTargetPack(input: {
  adapter?: DesktopTargetAdapter | null;
  fieldTargetId?: string;
}) {
  if (!input.adapter || !input.fieldTargetId) {
    return null;
  }

  return input.adapter.fieldPacks.find((pack) => pack.fieldTargetId === input.fieldTargetId) || null;
}

export function resolveBestWorkflowFieldTarget(input: {
  workflowProfile?: WorkflowProfile | null;
  desktopContext?: DesktopContext | null;
  adapter?: DesktopTargetAdapter | null;
}) {
  const targets = input.workflowProfile?.fieldTargets || [];
  if (!targets.length) {
    return null;
  }

  const windowTitle = normalizeText(input.desktopContext?.windowTitle);
  const focusedLabel = normalizeText(input.desktopContext?.focusedLabel);
  const elementRole = normalizeText(input.desktopContext?.elementRole);

  let bestTarget: FieldTarget | null = null;
  let bestScore = -1;

  for (const target of targets) {
    const label = normalizeText(target.label);
    let score = 0;
    score += scoreStringMatch(windowTitle, label);
    score += scoreStringMatch(focusedLabel, label) * 3;

    const defaultAliases = [
      ...label.split('/').map((item) => normalizeText(item)),
      ...target.note.split(/[.,]/).map((item) => normalizeText(item)).filter(Boolean),
    ];

    const packedAliases = (
      input.adapter?.fieldPacks.find((pack) => pack.fieldTargetId === target.id)?.aliases || []
    ).map((item) => normalizeText(item));
    const appLabelHints = (
      input.adapter?.fieldPacks.find((pack) => pack.fieldTargetId === target.id)?.appLabelHints || []
    ).map((item) => normalizeText(item));
    const windowHints = (
      input.adapter?.fieldPacks.find((pack) => pack.fieldTargetId === target.id)?.windowTitleHints || []
    ).map((item) => normalizeText(item));

    for (const alias of [...defaultAliases, ...packedAliases]) {
      score += scoreStringMatch(windowTitle, alias);
      score += scoreStringMatch(focusedLabel, alias) * 2;
    }

    for (const hint of appLabelHints) {
      score += scoreStringMatch(focusedLabel, hint) * 3;
    }

    for (const hint of windowHints) {
      score += scoreStringMatch(windowTitle, hint) * 2;
    }

    if (elementRole.includes('text') || elementRole.includes('field') || elementRole.includes('area')) {
      score += 1;
    }

    if (score > bestScore) {
      bestTarget = target;
      bestScore = score;
    }
  }

  return bestScore > 0 ? bestTarget : null;
}
