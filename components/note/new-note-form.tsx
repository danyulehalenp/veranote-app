'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { noteTypeOptionsBySpecialty, sampleSourceInput, templateDescriptions, templateOptionsByNoteType } from '@/lib/constants/mock-data';
import { founderWorkflowStarters } from '@/lib/constants/founder-workflows';
import { DEFAULT_PROVIDER_SETTINGS, type ProviderSettings } from '@/lib/constants/settings';
import { findProviderProfile } from '@/lib/constants/provider-profiles';
import { EVAL_CASE_KEY } from '@/lib/constants/storage';
import { buildSourceInputFromSections, describePopulatedSourceSections, EMPTY_SOURCE_SECTIONS, normalizeSourceSections } from '@/lib/ai/source-sections';
import {
  buildAmbientResumeSnapshot,
  parseAmbientResumeSnapshot,
  shouldIgnoreAmbientResumeClearDuringHydration,
  type AmbientResumeSnapshot,
} from '@/lib/ambient-listening/resume-storage';
import { ReviewWorkspace } from '@/components/note/review-workspace';
import { DocumentSourceIntake } from '@/components/note/document-source-intake';
import {
  AmbientEncounterWorkspace,
  type AmbientSessionPersistenceSnapshot,
} from '@/components/note/ambient/ambient-encounter-workspace';
import { AssistantPersonaAvatar } from '@/components/veranote/assistant/assistant-persona-avatar';
import { DictationControlBar } from '@/components/note/dictation/dictation-control-bar';
import { DictationCommandManager } from '@/components/note/dictation/dictation-command-manager';
import { DictationTranscriptPanel } from '@/components/note/dictation/dictation-transcript-panel';
import { CombinedView } from '@/components/veranote/input/CombinedView';
import { SourceInput } from '@/components/veranote/input/SourceInput';
import type { SourceTabKey } from '@/components/veranote/input/SourceTabs';
import { StatusStrip, type StatusStripItem } from '@/components/veranote/ui/StatusStrip';
import { getDifferentialCautionForDiagnosis, getTimeframeRuleForDiagnosis, listDiagnosisCategoryQuickPicks, listDiagnosisSuggestions } from '@/lib/psychiatry-diagnosis/seed-loader';
import { buildDiagnosisProfileSummary, createEmptyDiagnosisProfileEntry, hasDiagnosisProfileUnresolvedEntries, normalizeDiagnosisProfile } from '@/lib/note/diagnosis-profile';
import { buildMedicationProfileGapSummary, buildMedicationProfileSummary, createEmptyMedicationProfileEntry, hasMedicationProfileUnresolvedEntries, normalizeMedicationProfile } from '@/lib/note/medication-profile';
import { mergePresetCatalog, findPresetForNoteType, type NotePreset } from '@/lib/note/presets';
import { countWords, parseDraftSections } from '@/lib/note/review-sections';
import { buildEncounterSupportSummary, createEncounterSupportDefaults, getEncounterSupportConfig, normalizeEncounterSupport } from '@/lib/note/encounter-support';
import { planSections, SECTION_LABELS, type NoteSectionKey, type OutputScope } from '@/lib/note/section-profiles';
import {
  DEFAULT_DICTATION_SOURCE_LANE,
  SOURCE_CAPTURE_FLOW_GUIDES,
} from '@/lib/note/source-lane-contract';
import { ASSISTANT_ACTION_EVENT, publishAssistantContext } from '@/lib/veranote/assistant-context';
import { assistantMemoryService } from '@/lib/veranote/assistant-memory-service';
import { applyAssistantPersonaDefaults, listAssistantAvatarOptions, resolveAssistantPersona } from '@/lib/veranote/assistant-persona';
import { buildLanePreferencePrompt, buildPreferenceAssistantDraft } from '@/lib/veranote/preference-draft';
import {
  analyzeProviderPromptDraft,
  buildProviderPromptStudioDraft,
  getPromptStudioGoalOptions,
  sanitizeProviderPromptName,
  type ProviderPromptStudioGoalId,
} from '@/lib/veranote/provider-prompt-builder';
import {
  buildStarterOutputProfiles,
  getOutputDestinationMeta,
  getOutputDestinationOptions,
  getOutputNoteFocusLabel,
  inferOutputNoteFocus,
} from '@/lib/veranote/output-destinations';
import {
  getAmbientSessionResumeStorageKey,
  getAssistantPendingActionStorageKey,
  getCurrentProviderId,
  getDraftRecoveryStorageKey,
  getDraftSessionStorageKey,
  getNotePresetsStorageKey,
} from '@/lib/veranote/provider-identity';
import { buildDraftRecoveryState } from '@/lib/veranote/draft-recovery';
import {
  buildContinuitySourceBlock,
  buildContinuityTodaySignals,
} from '@/lib/veranote/patient-continuity';
import {
  fetchProviderSettingsFromServer,
  readCachedProviderSettings,
  writeCachedProviderSettings,
} from '@/lib/veranote/provider-settings-client';
import { createSourceSectionDictationAdapter } from '@/lib/dictation/editor-adapter';
import {
  getBrowserDictationCaptureState,
  requestBrowserDictationStream,
  setBrowserDictationStreamPaused,
  stopBrowserDictationStream,
} from '@/lib/dictation/browser-mic';
import {
  browserRecorderSupported,
  buildDictationChunkUpload,
  buildCumulativeDictationAudioBlob,
  getPreferredRecorderMimeType,
  readBlobBytes,
  shouldUploadBrowserDictationBlob,
} from '@/lib/dictation/browser-recorder';
import {
  isMeaningfulDictationTranscriptText,
  normalizeSpokenDictationPunctuation,
} from '@/lib/dictation/transcript-segment-utils';
import {
  applyInterimSegment,
  createLocalDictationSession,
  discardPendingSegment,
  markSegmentInserted,
  queueFinalSegment,
  setDictationUiState as setLocalDictationUiState,
  updateDictationTarget,
} from '@/lib/dictation/session-store';
import { resolveDictationCommandMatch } from '@/lib/dictation/command-library';
import { getEffectiveDictationCommands } from '@/lib/dictation/command-library';
import { buildDictationVoiceGuide, buildVoiceVocabularyHints } from '@/lib/dictation/voice-training';
import { resolveVeraAddress } from '@/lib/veranote/vera-relationship';
import {
  dismissLanePreferenceSuggestion,
  dismissPromptPreferenceSuggestion,
  getLanePreferenceSuggestion,
  getPromptPreferenceSuggestion,
} from '@/lib/veranote/assistant-learning';
import type { DraftComposeLane, DraftSession, EncounterSupport, PersistedDraftSession, SourceSections, StructuredPsychDiagnosisProfileEntry, StructuredPsychMedicationProfileEntry } from '@/types/session';
import type { DictationAuditEvent, DictationTargetSection, TranscriptSegment } from '@/types/dictation';
import type { EvalCaseSelection } from '@/types/eval';
import type { AmbientCareSetting, AmbientListeningMode } from '@/types/ambient-listening';
import type {
  PatientContinuityFactCategory,
  PatientContinuityPrivacyMode,
  PatientContinuityRecord,
} from '@/types/patient-continuity';

const PROVIDER_ROLE_OPTIONS = [
  'Psychiatric NP',
  'Psychiatrist',
  'Physician Assistant',
  'Medical physician',
  'Social Worker',
  'Therapist',
  'Psychologist',
  'PCP',
];

const SPECIALTY_OPTIONS = Object.keys(noteTypeOptionsBySpecialty);

type WorkspaceQuickFindItem = {
  id: string;
  label: string;
  helper: string;
  keywords: string[];
  disabled?: boolean;
  action: () => void;
};

function defaultRoleForSpecialty(specialty: string) {
  switch (specialty) {
    case 'Social Work':
      return 'Social Worker';
    case 'Psychology':
      return 'Psychologist';
    case 'Therapy':
      return 'Therapist';
    case 'Primary Care':
    case 'Family Medicine':
    case 'Internal Medicine':
    case 'Pediatrics':
    case 'Emergency Medicine':
    case 'Hospital Medicine':
    case 'Neurology':
    case 'General Medical':
      return 'PCP';
    case 'Psychiatry':
    default:
      return 'Psychiatric NP';
  }
}

function specialtyForNoteType(noteType: string) {
  const entry = Object.entries(noteTypeOptionsBySpecialty).find(([, noteTypes]) => noteTypes.includes(noteType));
  return entry?.[0] || 'Psychiatry';
}

function formatContinuityDateLabel(value?: string) {
  if (!value) {
    return 'No date';
  }

  const dateOnly = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(dateOnly) ? dateOnly : 'Saved';
}

type SourceWorkspaceMode = 'manual' | 'dictation' | 'transcript' | 'objective';

const CONTINUITY_CATEGORY_OPTIONS: Array<{ value: PatientContinuityFactCategory | 'all'; label: string }> = [
  { value: 'all', label: 'Any category' },
  { value: 'risk-safety', label: 'Risk / safety' },
  { value: 'medication', label: 'Medication' },
  { value: 'open-loop', label: 'Open loops' },
  { value: 'prior-intervention', label: 'Prior interventions' },
  { value: 'active-theme', label: 'Active themes' },
  { value: 'source-conflict', label: 'Source conflicts' },
  { value: 'other', label: 'Other' },
];

function inferAmbientCareSetting(noteType: string): AmbientCareSetting {
  if (/telehealth/i.test(noteType)) {
    return 'telehealth';
  }

  if (/crisis|ed/i.test(noteType)) {
    return 'ed_crisis';
  }

  if (/inpatient|discharge/i.test(noteType)) {
    return 'inpatient';
  }

  return 'outpatient_psychiatry';
}

function inferAmbientListeningMode(noteType: string): AmbientListeningMode {
  if (/telehealth/i.test(noteType)) {
    return 'ambient_telehealth';
  }

  return 'ambient_in_room';
}

type WorkflowGuidance = {
  careSetting: 'Inpatient' | 'Outpatient' | 'Telehealth' | 'Mixed';
  title: string;
  intro: string;
  intakeBullets: string[];
  reviewReminder: string;
  sectionHints: Partial<Record<keyof SourceSections, string>>;
};

const AMBIENT_RESUME_FALLBACK_STORAGE_KEY = 'veranote:ambient-session-resume:last';

function getDiagnosisStatusGuidance(
  status: StructuredPsychDiagnosisProfileEntry['status'],
  certainty: StructuredPsychDiagnosisProfileEntry['certainty'],
) {
  const normalizedStatus = status || 'current-working';
  const certaintyLabel = certainty && certainty !== 'unclear' ? `${certainty} certainty` : 'unclear certainty';

  switch (normalizedStatus) {
    case 'historical':
      return {
        title: 'Historical label guidance',
        text: `Keep this visibly historical unless today’s source actually confirms it. ${certaintyLabel} should not silently become a present-tense settled diagnosis.`,
      };
    case 'rule-out':
      return {
        title: 'Rule-out guidance',
        text: `Phrase this as unresolved diagnostic consideration, not as current diagnosis truth. ${certaintyLabel} should stay explicitly provisional.`,
      };
    case 'differential':
      return {
        title: 'Differential guidance',
        text: `Let the assessment stay open. This should read like one plausible explanation among others, not the single final answer, especially with ${certaintyLabel}.`,
      };
    case 'symptom-level':
      return {
        title: 'Symptom-level guidance',
        text: `Prefer symptom wording over diagnosis upgrading here. If the source only supports symptoms or behaviors, do not let the draft quietly promote them into a formal disorder label.`,
      };
    case 'current-working':
    default:
      return {
        title: 'Working impression guidance',
        text: `A working impression can guide assessment, but it still should not outrun the documented evidence. ${certaintyLabel} should shape how strong or hedged the final wording sounds.`,
      };
  }
}

function getPsychWorkflowGuidance(noteType: string): WorkflowGuidance {
  if (/psychiatric crisis/i.test(noteType)) {
    return {
      careSetting: 'Outpatient',
      title: 'Psychiatric crisis workflow frame',
      intro: 'Use this when the note needs to preserve acute risk wording, crisis chronology, interventions, and disposition boundaries without smoothing the situation into false stability.',
      intakeBullets: [
        'Keep “thoughts,” “intent,” “plan,” and “means/access” separate when the source separates them.',
        'Document crisis actions, collateral, and escalation thresholds literally rather than implying a fuller stabilization plan.',
        'Do not let improvement wording erase why the encounter was crisis-level in the first place.',
      ],
      reviewReminder: 'Crisis notes should stay explicit about timing, interventions, and current acute-versus-not-acute risk instead of becoming a generic outpatient follow-up.',
      sectionHints: {
        clinicianNotes: 'Crisis trigger, why the encounter became urgent, acute risk language, interventions, collateral calls, and disposition thinking.',
        intakeCollateral: 'Therapist, family, school, work, or crisis-line context that explains the escalation and current safety picture.',
        patientTranscript: 'Direct wording about suicidal thoughts, fear, intent, protective factors, willingness for help, and current ability to stay safe.',
        objectiveData: 'Timing, structured risk tools if actually used, med list, prior recent encounters, or other concrete crisis-relevant data.',
      },
    };
  }

  if (/telehealth/i.test(noteType)) {
    return {
      careSetting: 'Telehealth',
      title: 'Telehealth psych follow-up frame',
      intro: 'Use this when the visit is remote and the note needs to preserve chronic-risk nuance, symptom change, functioning, and the limits of objective data.',
      intakeBullets: [
        'Capture what changed since last visit, not just the diagnosis list.',
        'Keep chronic passive SI or longstanding risk separate from current acute intent.',
        'Do not imply in-person findings, vitals, or exam details that were never available.',
      ],
      reviewReminder: 'Telehealth notes should stay honest about what was observed remotely versus what remains patient-reported.',
      sectionHints: {
        clinicianNotes: 'Telehealth visit purpose, interval changes, med-management decisions, acute stressors, chronic-versus-current risk framing.',
        intakeCollateral: 'Outside messages, family updates, therapist/clinic collateral, or pre-visit context that affects today’s remote follow-up.',
        patientTranscript: 'Direct quotes about symptom change, safety, sleep, adherence, functioning, and why today feels better, worse, or unchanged.',
        objectiveData: 'Available scales, med list, labs, prior vitals, or clearly limited objective data. Do not fake remote exam findings.',
      },
    };
  }

  if (/outpatient psychiatric evaluation/i.test(noteType)) {
    return {
      careSetting: 'Outpatient',
      title: 'Outpatient psychiatric evaluation frame',
      intro: 'Use this when the job is diagnostic clarification and longitudinal treatment planning rather than inpatient admission-style justification.',
      intakeBullets: [
        'Keep old diagnoses visibly historical unless today’s source actually confirms them.',
        'Let the differential stay open if bipolarity, trauma, anxiety, ADHD, or substance effects are still mixed together.',
        'Capture functioning and prior treatment response, not just symptom lists.',
      ],
      reviewReminder: 'Outpatient evaluations should separate prior labels, current impression, and remaining uncertainty instead of collapsing them into one settled story.',
      sectionHints: {
        clinicianNotes: 'Presenting concerns, timeline, current impression, differential thoughts, prior treatment response, and first-step plan.',
        intakeCollateral: 'Old records, family context, therapist notes, screening forms, or outside problem lists that should stay attributed.',
        patientTranscript: 'Symptom timeline, uncertainty about prior diagnoses, trauma/substance context, and what the patient wants clarified today.',
        objectiveData: 'Questionnaires, med history, prior records reviewed, relevant labs/medical context, and documented historical diagnoses as records, not automatic truth.',
      },
    };
  }

  if (/outpatient psych follow-up/i.test(noteType) || /psychiatry follow-up/i.test(noteType)) {
    return {
      careSetting: 'Outpatient',
      title: 'Outpatient psych follow-up frame',
      intro: 'Use this for med-management and longitudinal follow-up where partial response, side effects, functioning, and refill boundaries matter more than inpatient chronology.',
      intakeBullets: [
        'State what is better, worse, and unchanged without overstating improvement.',
        'Keep adherence and side effects literal, especially if the patient is only taking meds most days.',
        'Document functioning and chronic-risk context without turning everything into “stable” or “doing well.”',
      ],
      reviewReminder: 'Outpatient follow-up should preserve partial response, refill uncertainty, and chronic-risk nuance instead of smoothing them into a generic med check.',
      sectionHints: {
        clinicianNotes: 'Follow-up purpose, med changes or refill question, symptom change, side effects, functioning, and next-step plan.',
        intakeCollateral: 'Messages, therapist/partner/family collateral, outside refill context, or screening updates that affect today’s follow-up.',
        patientTranscript: 'Exact wording about improvement, side effects, adherence misses, chronic thoughts, stressors, and work/home functioning.',
        objectiveData: 'Current medication list, scales, labs, vitals if available, and refill status only if actually documented.',
      },
    };
  }

  return {
    careSetting: 'Inpatient',
    title: 'Inpatient psych workflow frame',
    intro: 'Use this when hospitalization chronology, daily symptom status, behavior on unit, meds/PRNs, and discharge-readiness boundaries need to stay explicit.',
    intakeBullets: [
      'Separate admission picture, hospital course, recent events, and current status.',
      'Keep patient statements, nursing/staff observations, and objective data visibly sourced.',
      'Do not overstate readiness, improvement, or symptom resolution just because the note is cleaner.',
    ],
    reviewReminder: 'Inpatient notes should preserve chronology and unit-context truth rather than flattening the whole stay into one polished summary.',
    sectionHints: {
      clinicianNotes: 'Daily assessment, hospital course, discharge-readiness thinking, med changes, PRNs, and today’s plan.',
      intakeCollateral: 'Nursing notes, family collateral, ED/admission context, staff observations, and unit behavior details.',
      patientTranscript: 'Quoted symptom status, denial statements, readiness language, insight, sleep/appetite updates, and direct patient concerns.',
      objectiveData: 'MAR/PRNs, labs, vitals, tox screens, behavioral observations, and other concrete hospital data.',
    },
  };
}

function preferredNoteTypeForProfile(profileId: string) {
  const profile = findProviderProfile(profileId);
  if (!profile) {
    return null;
  }

  return profile.defaults.noteTypePriority.find((candidate) =>
    Object.values(noteTypeOptionsBySpecialty).some((noteTypes) => noteTypes.includes(candidate))
  ) || null;
}

function hydrateSectionsFromDraft(parsed: Partial<DraftSession>) {
  if (parsed.sourceSections) {
    return normalizeSourceSections(parsed.sourceSections);
  }

  return {
    ...EMPTY_SOURCE_SECTIONS,
    clinicianNotes: typeof parsed.sourceInput === 'string' ? parsed.sourceInput : '',
  } satisfies SourceSections;
}

function ProvenancePill({ label }: { label: string }) {
  return (
    <span className="aurora-pill rounded-full px-2.5 py-1 text-[11px] font-medium">
      {label}
    </span>
  );
}

function formatRelativeCheckpointTime(value?: string) {
  if (!value) {
    return 'not saved yet';
  }

  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();

  if (!Number.isFinite(diffMs) || diffMs < 0) {
    return date.toLocaleString();
  }

  const diffMinutes = Math.round(diffMs / 60000);
  if (diffMinutes < 1) {
    return 'just now';
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  return date.toLocaleDateString();
}

function buildWorkspaceStageStatusItems(input: {
  sourceCompletionCount: number;
  totalSourceSteps: number;
  hasCheckpoint: boolean;
  hasDraft: boolean;
  workflowStage: 'compose' | 'review';
  activeComposeLane: DraftComposeLane;
  assistantName: string;
}) {
  const sourceStarted = input.sourceCompletionCount > 0;
  const sourceReady = input.sourceCompletionCount === input.totalSourceSteps;
  const draftShapingReady = sourceStarted || input.hasCheckpoint;
  const reviewReady = input.hasDraft || input.workflowStage === 'review';
  const finishReady = input.hasDraft && input.workflowStage === 'review';

  return [
    {
      id: 'source',
      label: 'Add Source',
      detail: sourceReady
        ? `${input.sourceCompletionCount}/${input.totalSourceSteps} source streams loaded.`
        : sourceStarted
          ? `${input.sourceCompletionCount}/${input.totalSourceSteps} source streams loaded so far.`
          : 'Paste, type, dictate, or add transcript source first.',
      status: sourceReady ? 'complete' : input.activeComposeLane === 'source' || input.activeComposeLane === 'setup' ? 'active' : 'upcoming',
    },
    {
      id: 'shape',
      label: 'Shape Draft',
      detail: input.hasDraft
        ? 'A draft exists and can be reshaped without leaving the workspace.'
        : draftShapingReady
          ? 'Generate and tune the first draft from the source packet.'
          : 'Choose the note frame and add source before generating.',
      status: input.hasDraft ? 'complete' : input.activeComposeLane === 'finish' || input.activeComposeLane === 'setup' ? 'active' : draftShapingReady ? 'active' : 'upcoming',
    },
    {
      id: 'review',
      label: `Review with ${input.assistantName}`,
      detail: reviewReady
        ? `Use source checking, wording cleanup, and ${input.assistantName} guidance.`
        : `${input.assistantName} review becomes useful after the first draft exists.`,
      status: input.workflowStage === 'review' ? 'active' : reviewReady ? 'complete' : 'upcoming',
    },
    {
      id: 'finish',
      label: 'Finish & Export',
      detail: finishReady
        ? 'Copy, export, or preserve the reviewed final note.'
        : 'Finish stays quiet until the draft is ready.',
      status: finishReady && input.activeComposeLane === 'finish' ? 'active' : finishReady ? 'complete' : 'upcoming',
    },
  ] as const;
}

function getWorkspaceStageTone(status: 'complete' | 'active' | 'upcoming') {
  if (status === 'complete') {
    return 'border-emerald-200/22 bg-[rgba(20,83,45,0.22)] text-emerald-100';
  }

  if (status === 'active') {
    return 'border-cyan-200/24 bg-[rgba(18,181,208,0.14)] text-cyan-50';
  }

  return 'border-cyan-200/10 bg-[rgba(13,30,50,0.56)] text-cyan-50/70';
}

const ASSISTANT_OPEN_EVENT = 'veranote-assistant-open';

type AtlasReviewDockAction = {
  label: string;
  disabled?: boolean;
  onClick?: () => void;
  primary?: boolean;
  title?: string;
};

function AtlasReviewDock({
  statusLabel,
  detail,
  noteType,
  sourceCompletionLabel,
  attentionCount,
  hasDraft,
  actions,
  assistantName,
  assistantAvatar,
}: {
  statusLabel: string;
  detail: string;
  noteType: string;
  sourceCompletionLabel: string;
  attentionCount: number;
  hasDraft: boolean;
  actions: AtlasReviewDockAction[];
  assistantName: string;
  assistantAvatar: ProviderSettings['userAiAvatar'];
}) {
  return (
    <div
      className={`rounded-[26px] border p-4 shadow-[0_22px_58px_rgba(4,12,24,0.28)] ${
        hasDraft
          ? 'border-emerald-300/22 bg-[linear-gradient(145deg,rgba(13,148,136,0.24),rgba(8,32,58,0.94))]'
          : 'border-cyan-200/14 bg-[linear-gradient(145deg,rgba(7,18,32,0.94),rgba(8,32,58,0.86))]'
      }`}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <AssistantPersonaAvatar avatar={assistantAvatar} label={assistantName} size="sm" />
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-100/72">{assistantName} Review</div>
            <div className="mt-1.5 text-lg font-semibold tracking-[-0.02em] text-white">{statusLabel}</div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-cyan-50/76">{detail}</p>
            <div className="mt-2 text-[10px] uppercase tracking-[0.14em] text-cyan-100/54">Verified by Veranote</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <span className="rounded-full border border-cyan-200/14 bg-white/[0.06] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-50">
            {noteType}
          </span>
          <span className="rounded-full border border-cyan-200/14 bg-white/[0.06] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-50">
            {sourceCompletionLabel}
          </span>
          <span
            className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${
              attentionCount ? 'border-amber-200/30 bg-amber-300/12 text-amber-50' : 'border-emerald-200/22 bg-emerald-400/10 text-emerald-50'
            }`}
          >
            {attentionCount ? `${attentionCount} cue${attentionCount === 1 ? '' : 's'}` : 'No open cues'}
          </span>
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={action.onClick}
            disabled={action.disabled}
            title={action.title}
            data-testid={action.disabled ? undefined : 'atlas-review-dock-ask-button'}
	            className={`${!action.disabled && !action.primary ? 'workspace-action-card' : ''} rounded-[16px] border px-3.5 py-3 text-left text-sm font-semibold transition ${
              action.disabled
                ? 'cursor-not-allowed border-white/8 bg-white/[0.03] text-cyan-50/42'
                : action.primary
                  ? 'border-emerald-200/24 bg-[linear-gradient(135deg,rgba(20,184,166,0.28),rgba(56,189,248,0.22))] text-white shadow-[0_18px_42px_rgba(4,12,24,0.24)] hover:border-emerald-100/42'
                  : 'border-cyan-200/18 bg-white/[0.07] text-cyan-50 hover:border-cyan-100/34 hover:bg-white/[0.12]'
            }`}
          >
            {action.label}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs leading-5 text-cyan-50/58">
        {assistantName} opens with this note context. It will not change the draft unless you apply an existing review action.
      </p>
    </div>
  );
}

type WorkflowSignalTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

type WorkflowNudge = {
  id: string;
  label: string;
  detail: string;
  tone: WorkflowSignalTone;
};

type SectionExpectationSignal = {
  id: string;
  label: string;
  status: 'ready' | 'partial' | 'missing';
  detail: string;
};

function getWorkflowSignalClasses(tone: WorkflowSignalTone) {
  switch (tone) {
    case 'success':
      return 'border-emerald-300/22 bg-[rgba(18,88,54,0.26)] text-emerald-50';
    case 'warning':
      return 'border-amber-300/24 bg-[rgba(146,98,18,0.24)] text-amber-50';
    case 'danger':
      return 'border-rose-300/24 bg-[rgba(127,29,29,0.26)] text-rose-50';
    case 'info':
      return 'border-sky-300/22 bg-[rgba(14,116,144,0.22)] text-sky-50';
    case 'neutral':
    default:
      return 'border-cyan-200/10 bg-[rgba(13,30,50,0.52)] text-cyan-50/78';
  }
}

function buildComposeNudges(input: {
  noteType: string;
  sourceInput: string;
  sourceSections: SourceSections;
  sourceCompletionCount: number;
  requiresStandaloneMse: boolean;
  diagnosisProfileCount: number;
  medicationProfileCount: number;
  destinationConstraintActive: boolean;
  destinationLabel: string;
  hasDraft: boolean;
}) {
  const nudges: WorkflowNudge[] = [];
  const lowerSource = input.sourceInput.toLowerCase();

  if (input.sourceCompletionCount === 0) {
    nudges.push({
      id: 'start-source',
      label: 'Start with any source stream',
      detail: 'Add pre-visit data, live visit notes, ambient transcript, or provider add-on details first. The workflow does not need every box before it becomes useful.',
      tone: 'info',
    });
  }

  if (!input.sourceSections.clinicianNotes.trim() && !input.sourceSections.patientTranscript.trim()) {
    nudges.push({
      id: 'narrative-source',
      label: 'Narrative source still looks thin',
      detail: 'A draft will be more trustworthy if at least one narrative source is present, such as clinician notes or direct patient wording.',
      tone: 'warning',
    });
  }

  if (/evaluation|intake/i.test(input.noteType) && input.diagnosisProfileCount === 0) {
    nudges.push({
      id: 'assessment-frame',
      label: 'Assessment frame not set yet',
      detail: 'For evaluation-style notes, add a diagnostic impression or working differential so the assessment does not feel under-shaped later.',
      tone: 'info',
    });
  }

  if ((/follow-up|follow up|progress/i.test(input.noteType) || /med/i.test(input.noteType)) && !input.sourceSections.objectiveData.trim() && input.medicationProfileCount === 0) {
    nudges.push({
      id: 'med-update',
      label: 'Medication or objective update is still missing',
      detail: 'Follow-up notes usually go faster in review when meds, adherence, side effects, labs, or vitals have at least one concrete source anchor.',
      tone: 'warning',
    });
  }

  if (input.requiresStandaloneMse && !input.sourceSections.objectiveData.trim() && !input.sourceSections.patientTranscript.trim()) {
    nudges.push({
      id: 'mse-support',
      label: 'MSE support looks thin',
      detail: 'This note type usually expects mental-status wording. Add transcript or observational details before expecting a strong standalone MSE.',
      tone: 'warning',
    });
  }

  if (!/\b(plan|continue|follow-up|follow up|return|monitor|increase|decrease|start|stop|maintain)\b/i.test(lowerSource)) {
    nudges.push({
      id: 'plan-language',
      label: 'Plan language has not shown up yet',
      detail: 'If the final note will need a plan, add at least a rough source anchor now so the finish lane does not have to invent next steps.',
      tone: 'info',
    });
  }

  if (input.destinationConstraintActive) {
    nudges.push({
      id: 'destination-fit',
      label: 'Destination cleanup is active',
      detail: `${input.destinationLabel} formatting is on, so keep headings, punctuation, and paragraph structure simple while drafting.`,
      tone: 'info',
    });
  }

  if (input.hasDraft) {
    nudges.push({
      id: 'review-ready',
      label: 'Draft is ready for review',
      detail: 'Keep momentum by moving into source-checking and final wording review instead of staying in setup too long.',
      tone: 'success',
    });
  }

  return nudges.slice(0, 4);
}

function buildSectionExpectationSignals(input: {
  noteType: string;
  plannedSections: NoteSectionKey[];
  sourceSections: SourceSections;
  sourceInput: string;
  diagnosisProfileCount: number;
  medicationProfileCount: number;
}): SectionExpectationSignal[] {
  const sourceText = input.sourceInput.toLowerCase();
  const intakeText = input.sourceSections.intakeCollateral.toLowerCase();
  const clinicianText = input.sourceSections.clinicianNotes.toLowerCase();
  const transcriptText = input.sourceSections.patientTranscript.toLowerCase();
  const objectiveText = input.sourceSections.objectiveData.toLowerCase();
  const hasNarrativeSource = Boolean(intakeText.trim() || clinicianText.trim() || transcriptText.trim());
  const hasAnySource = Boolean(sourceText.trim());
  const hasHistorySource = Boolean(intakeText.trim() || clinicianText.trim());
  const hasMentalStatusSignal = Boolean(
    transcriptText.trim()
    || objectiveText.trim()
    || /\b(mood|affect|speech|thought|insight|judgment|behavior|agitated|calm|tearful|psychotic|oriented|halluc|delusion)\b/.test(sourceText),
  );
  const hasRiskSignal = /\b(si|hi|suicid|homicid|self-harm|self harm|safety|violent|aggression|overdose|kill myself|kill himself|kill herself)\b/.test(sourceText);
  const hasAssessmentSignal = input.diagnosisProfileCount > 0 || /\b(assessment|impression|diagnosis|differential|formulation|working diagnosis|mdd|bipolar|anxiety|psychosis)\b/.test(sourceText);
  const hasPlanSignal = /\b(plan|continue|follow-up|follow up|return|monitor|increase|decrease|start|stop|maintain|discharge|admit|recommend|safety plan)\b/.test(sourceText);
  const hasMedicationSignal = input.medicationProfileCount > 0 || /\b(med|medication|dose|mg|adherence|side effect|tolerat|prn|abilify|sertraline|zoloft|fluoxetine|prozac|risperidone|lithium)\b/.test(sourceText);
  const hasHistoryKeywords = {
    psych: /\b(history|prior admission|hospitalization|outpatient|therapy|previously|psychiatric history)\b/.test(sourceText),
    substance: /\b(thc|cannabis|alcohol|etoh|meth|cocaine|opioid|substance|use disorder|nicotine|vape)\b/.test(sourceText),
    family: /\b(family history|mother|father|sister|brother|family psychiatric)\b/.test(sourceText),
    trauma: /\b(trauma|abuse|ptsd|assault|neglect)\b/.test(sourceText),
    legal: /\b(legal|court|probation|arrest|custody)\b/.test(sourceText),
    social: /\b(lives with|housing|employment|school|relationship|married|single|social history)\b/.test(sourceText),
  };
  const priorityOrder: NoteSectionKey[] = [
    'chiefConcern',
    'intervalUpdate',
    'symptomReview',
    'medications',
    'mentalStatus',
    'safetyRisk',
    'assessment',
    'diagnosis',
    'plan',
    'proposedDischarge',
    'psychHistory',
    'priorTreatment',
    'substanceHistory',
    'socialHistory',
    'familyHistory',
    'traumaHistory',
    'legalHistory',
    'clinicalStatusComplexity',
  ];
  const prioritizedSections = Array.from(
    new Set(priorityOrder.filter((section) => input.plannedSections.includes(section)).concat(input.plannedSections)),
  ).slice(0, 6);

  return prioritizedSections.map((section) => {
    switch (section) {
      case 'chiefConcern':
        return hasAnySource
          ? { id: section, label: SECTION_LABELS[section], status: 'ready', detail: 'A presenting concern can be shaped from the current source.' }
          : { id: section, label: SECTION_LABELS[section], status: 'missing', detail: 'Add at least one source stream so the reason for visit is not guessed.' };
      case 'intervalUpdate':
      case 'symptomReview':
        return hasNarrativeSource
          ? { id: section, label: SECTION_LABELS[section], status: 'ready', detail: 'Narrative source is present for chronology and symptoms.' }
          : hasAnySource
            ? { id: section, label: SECTION_LABELS[section], status: 'partial', detail: 'Some source exists, but narrative detail is still thin for a strong interval story.' }
            : { id: section, label: SECTION_LABELS[section], status: 'missing', detail: 'Add clinician notes, intake, or patient wording before expecting a stable symptom narrative.' };
      case 'medications':
        return hasMedicationSignal
          ? { id: section, label: SECTION_LABELS[section], status: 'ready', detail: 'Medication facts or adherence cues are visible in source.' }
          : hasAnySource
            ? { id: section, label: SECTION_LABELS[section], status: 'partial', detail: 'The note can draft, but meds/adherence/side effects still look under-supported.' }
            : { id: section, label: SECTION_LABELS[section], status: 'missing', detail: 'No medication or regimen signal is visible yet.' };
      case 'mentalStatus':
        return hasMentalStatusSignal
          ? { id: section, label: SECTION_LABELS[section], status: 'ready', detail: 'Behavioral or observational language is present for MSE support.' }
          : hasNarrativeSource
            ? { id: section, label: SECTION_LABELS[section], status: 'partial', detail: 'Narrative source exists, but explicit mental-status language is still thin.' }
            : { id: section, label: SECTION_LABELS[section], status: 'missing', detail: 'Add transcript or observational detail before expecting a standalone MSE.' };
      case 'safetyRisk':
        return hasRiskSignal
          ? { id: section, label: SECTION_LABELS[section], status: 'ready', detail: 'Risk language is present and should carry forward carefully in review.' }
          : hasNarrativeSource
            ? { id: section, label: SECTION_LABELS[section], status: 'partial', detail: 'Narrative source is present, but explicit safety wording is still sparse.' }
            : { id: section, label: SECTION_LABELS[section], status: 'missing', detail: 'No clear safety or risk signal is visible yet.' };
      case 'assessment':
      case 'diagnosis':
        return hasAssessmentSignal
          ? { id: section, label: SECTION_LABELS[section], status: 'ready', detail: 'Assessment or diagnostic framing is visible in source.' }
          : hasHistorySource
            ? { id: section, label: SECTION_LABELS[section], status: 'partial', detail: 'History is present, but the assessment frame still looks under-specified.' }
            : { id: section, label: SECTION_LABELS[section], status: 'missing', detail: 'Add a working impression or diagnostic anchor so assessment does not feel improvised.' };
      case 'plan':
      case 'proposedDischarge':
        return hasPlanSignal
          ? { id: section, label: SECTION_LABELS[section], status: 'ready', detail: 'Next-step language is visible and can support a source-close plan.' }
          : hasAnySource
            ? { id: section, label: SECTION_LABELS[section], status: 'partial', detail: 'The note can draft, but the plan still needs a concrete source anchor.' }
            : { id: section, label: SECTION_LABELS[section], status: 'missing', detail: 'No next-step or disposition language is visible yet.' };
      case 'psychHistory':
      case 'priorTreatment':
        return hasHistorySource && hasHistoryKeywords.psych
          ? { id: section, label: SECTION_LABELS[section], status: 'ready', detail: 'History and prior-treatment cues are visible in source.' }
          : hasHistorySource
            ? { id: section, label: SECTION_LABELS[section], status: 'partial', detail: 'Background source exists, but prior psychiatric history is still sparse.' }
            : { id: section, label: SECTION_LABELS[section], status: 'missing', detail: 'Add collateral or intake history if this note type needs longitudinal context.' };
      case 'substanceHistory':
        return hasHistoryKeywords.substance
          ? { id: section, label: SECTION_LABELS[section], status: 'ready', detail: 'Substance-use detail is visible in source.' }
          : hasHistorySource
            ? { id: section, label: SECTION_LABELS[section], status: 'partial', detail: 'Background source exists, but substance history still looks thin.' }
            : { id: section, label: SECTION_LABELS[section], status: 'missing', detail: 'No clear substance-use history is present yet.' };
      case 'socialHistory':
        return hasHistoryKeywords.social
          ? { id: section, label: SECTION_LABELS[section], status: 'ready', detail: 'Social or functional context is visible in source.' }
          : hasHistorySource
            ? { id: section, label: SECTION_LABELS[section], status: 'partial', detail: 'Some background exists, but social context is still light.' }
            : { id: section, label: SECTION_LABELS[section], status: 'missing', detail: 'Add housing, work, school, or relationship context if this note needs it.' };
      case 'familyHistory':
        return hasHistoryKeywords.family
          ? { id: section, label: SECTION_LABELS[section], status: 'ready', detail: 'Family history cues are visible in source.' }
          : hasHistorySource
            ? { id: section, label: SECTION_LABELS[section], status: 'partial', detail: 'Intake source exists, but family history still looks thin.' }
            : { id: section, label: SECTION_LABELS[section], status: 'missing', detail: 'No family-history source is visible yet.' };
      case 'traumaHistory':
        return hasHistoryKeywords.trauma
          ? { id: section, label: SECTION_LABELS[section], status: 'ready', detail: 'Trauma-related source detail is present.' }
          : hasHistorySource
            ? { id: section, label: SECTION_LABELS[section], status: 'partial', detail: 'Background source exists, but trauma history is not yet explicit.' }
            : { id: section, label: SECTION_LABELS[section], status: 'missing', detail: 'No trauma-history source is visible yet.' };
      case 'legalHistory':
        return hasHistoryKeywords.legal
          ? { id: section, label: SECTION_LABELS[section], status: 'ready', detail: 'Legal or custody context is present in source.' }
          : hasHistorySource
            ? { id: section, label: SECTION_LABELS[section], status: 'partial', detail: 'Background source exists, but legal history is not visible yet.' }
            : { id: section, label: SECTION_LABELS[section], status: 'missing', detail: 'No legal-history context is visible yet.' };
      case 'clinicalStatusComplexity':
        return hasAnySource
          ? { id: section, label: SECTION_LABELS[section], status: 'partial', detail: 'Complexity can be shaped later, but it still needs a source-close justification in review.' }
          : { id: section, label: SECTION_LABELS[section], status: 'missing', detail: 'Add source first so complexity is not guessed.' };
      default:
        return hasAnySource
          ? { id: section, label: SECTION_LABELS[section], status: 'partial', detail: 'Some support is present, but this section still deserves a manual source check.' }
          : { id: section, label: SECTION_LABELS[section], status: 'missing', detail: 'No source is visible yet for this planned section.' };
    }
  });
}

function getSectionExpectationClasses(status: SectionExpectationSignal['status']) {
  if (status === 'ready') {
    return 'border-emerald-300/22 bg-[rgba(20,83,45,0.22)] text-emerald-50';
  }

  if (status === 'partial') {
    return 'border-amber-300/24 bg-[rgba(146,98,18,0.22)] text-amber-50';
  }

  return 'border-cyan-200/10 bg-[rgba(13,30,50,0.52)] text-cyan-50/78';
}

const DICTATION_TARGET_LABELS: Record<DictationTargetSection, string> = {
  intakeCollateral: 'Pre-Visit Data',
  clinicianNotes: 'Live Visit Notes',
  patientTranscript: 'Ambient Transcript',
  objectiveData: 'Provider Add-On',
};

function isDictationTargetSection(value: SourceTabKey): value is DictationTargetSection {
  return value === 'clinicianNotes' || value === 'intakeCollateral' || value === 'patientTranscript' || value === 'objectiveData';
}

function formatDictationProviderLabel(sttProvider: string | null | undefined) {
  if (!sttProvider) {
    return 'not started';
  }

  if (sttProvider === 'openai-transcription') {
    return 'OpenAI transcription';
  }

  if (sttProvider === 'mock-stt') {
    return 'Mock STT';
  }

  return sttProvider.replace(/-/g, ' ');
}

function formatDictationProviderRuntimeLabel(input: {
  providerLabel?: string | null;
  engineLabel?: string | null;
  fallbackApplied?: boolean;
}) {
  const providerLabel = input.providerLabel?.trim() || 'not started';
  const engineLabel = input.engineLabel?.trim();

  if (providerLabel === 'not started') {
    return providerLabel;
  }

  const parts = [providerLabel];
  if (engineLabel) {
    parts.push(engineLabel);
  }
  if (input.fallbackApplied) {
    parts.push('fallback');
  }

  return parts.join(' • ');
}

function formatDictationBackendStatusLabel(input: {
  status?: string;
  streamConnected?: boolean;
  fallbackApplied?: boolean;
}) {
  const status = input.status || 'idle';
  if (input.streamConnected && input.status === 'active') {
    return input.fallbackApplied ? 'active • live stream • fallback' : 'active • live stream';
  }

  return input.fallbackApplied && status === 'active' ? 'active • fallback' : status;
}

function mergeDictationAuditEvents(
  existing: DictationAuditEvent[],
  incoming: DictationAuditEvent[],
) {
  return [...incoming, ...existing]
    .filter((event, index, events) => index === events.findIndex((candidate) => candidate.id === event.id))
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, 12);
}

function createClientDictationAuditEvent(input: {
  sessionId: string;
  encounterId: string;
  actorUserId: string;
  sttProvider?: string;
  eventName: DictationAuditEvent['eventName'];
  eventDomain: DictationAuditEvent['eventDomain'];
  payload: Record<string, unknown>;
}) {
  return {
    id: `dictation-ui-${Math.random().toString(36).slice(2, 10)}`,
    eventName: input.eventName,
    eventDomain: input.eventDomain,
    occurredAt: new Date().toISOString(),
    encounterId: input.encounterId,
    dictationSessionId: input.sessionId,
    actorUserId: input.actorUserId,
    sttProvider: input.sttProvider,
    mode: 'provider_dictation',
    payload: input.payload,
    containsPhi: false,
    retentionClass: 'audit_only' as const,
  } satisfies DictationAuditEvent;
}

type DictationSessionHistoryItem = {
  sessionId: string;
  lastOccurredAt: string;
  providerLabel: string;
  eventCount: number;
  eventNames: string[];
};

type DictationProviderStatusOption = {
  providerId: string;
  providerLabel: string;
  adapterId: string;
  available: boolean;
  engineLabel: string;
  reason: string;
};

function summarizeDictationSessionHistory(events: DictationAuditEvent[]) {
  const grouped = new Map<string, DictationAuditEvent[]>();
  for (const event of events) {
    const sessionId = event.dictationSessionId || 'unknown-session';
    const existing = grouped.get(sessionId) || [];
    existing.push(event);
    grouped.set(sessionId, existing);
  }

  return [...grouped.entries()]
    .map(([sessionId, sessionEvents]) => {
      const sorted = [...sessionEvents].sort((left, right) => (
        new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime()
      ));
      return {
        sessionId,
        lastOccurredAt: sorted[0]?.occurredAt || new Date().toISOString(),
        providerLabel: formatDictationProviderLabel(sorted[0]?.sttProvider),
        eventCount: sorted.length,
        eventNames: sorted
          .map((event) => event.eventName.replace(/^dictation_/, '').replace(/_/g, ' '))
          .filter((name, index, names) => index === names.indexOf(name))
          .slice(0, 3),
      };
    })
    .sort((left, right) => new Date(right.lastOccurredAt).getTime() - new Date(left.lastOccurredAt).getTime())
    .slice(0, 5);
}

function mergeDictationSessionHistory(
  existing: DictationSessionHistoryItem[],
  incomingEvents: DictationAuditEvent[],
) {
  const next = new Map(existing.map((item) => [item.sessionId, item]));

  for (const event of incomingEvents) {
    const sessionId = event.dictationSessionId || 'unknown-session';
    const current = next.get(sessionId);
    const eventLabel = event.eventName.replace(/^dictation_/, '').replace(/_/g, ' ');
    const occurredAt = event.occurredAt;

    next.set(sessionId, {
      sessionId,
      lastOccurredAt: current && new Date(current.lastOccurredAt).getTime() > new Date(occurredAt).getTime()
        ? current.lastOccurredAt
        : occurredAt,
      providerLabel: current?.providerLabel || formatDictationProviderLabel(event.sttProvider),
      eventCount: (current?.eventCount || 0) + 1,
      eventNames: [eventLabel, ...(current?.eventNames || [])]
        .filter((name, index, names) => index === names.indexOf(name))
        .slice(0, 3),
    });
  }

  return [...next.values()]
    .sort((left, right) => new Date(right.lastOccurredAt).getTime() - new Date(left.lastOccurredAt).getTime())
    .slice(0, 5);
}

function isServerDictationSessionId(sessionId: string | undefined) {
  return Boolean(sessionId?.startsWith('server-dictation-'));
}

export function NewNoteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const composeWorkspaceRef = useRef<HTMLDivElement | null>(null);
  const topDictationControlsRef = useRef<HTMLDivElement | null>(null);
  const outputPreferencesDetailsRef = useRef<HTMLDetailsElement | null>(null);
  const specialtySelectRef = useRef<HTMLSelectElement | null>(null);
  const roleSelectRef = useRef<HTMLSelectElement | null>(null);
  const noteTypeSelectRef = useRef<HTMLSelectElement | null>(null);
  const templateSelectRef = useRef<HTMLSelectElement | null>(null);
  const activeOutputProfileSelectRef = useRef<HTMLSelectElement | null>(null);
  const outputProfileNameInputRef = useRef<HTMLInputElement | null>(null);
  const jumpHighlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composeSectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const hydratedFromSavedStateRef = useRef(false);
  const providerProfileAppliedRef = useRef(false);
  const dictationMediaStreamRef = useRef<MediaStream | null>(null);
  const dictationRecorderRef = useRef<MediaRecorder | null>(null);
  const dictationEventSourceRef = useRef<EventSource | null>(null);
  const dictationRecordedAudioChunksRef = useRef<Blob[]>([]);
  const dictationUploadTimerRef = useRef<number | null>(null);
  const dictationRecordingStartedAtRef = useRef<number | null>(null);
  const dictationUploadInFlightRef = useRef(false);
  const dictationLastUploadedSizeBytesRef = useRef(0);
  const dictationChunkSequenceRef = useRef(0);
  const [hasClientHydrated, setHasClientHydrated] = useState(false);
  const [draftHydrationComplete, setDraftHydrationComplete] = useState(false);
  const [jumpHighlightTarget, setJumpHighlightTarget] = useState<'setup' | 'output-preferences' | 'site-presets' | null>(null);
  const [sessionSnapshotPanel, setSessionSnapshotPanel] = useState<'setup' | 'site-presets' | 'destination-fit' | null>(null);
  const [workflowStage, setWorkflowStage] = useState<'compose' | 'review'>('compose');
  const [activeComposeLane, setActiveComposeLane] = useState<DraftComposeLane>('source');
  const [workspaceFindQuery, setWorkspaceFindQuery] = useState('');
  const [workspaceFindFocused, setWorkspaceFindFocused] = useState(false);
  const [generatedSession, setGeneratedSession] = useState<DraftSession | null>(null);
  const [draftCheckpoint, setDraftCheckpoint] = useState<DraftSession | null>(null);
  const [draftCheckpointStatus, setDraftCheckpointStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [recoveryActionState, setRecoveryActionState] = useState<'idle' | 'archiving' | 'discarding'>('idle');
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [specialty, setSpecialty] = useState('Psychiatry');
  const [role, setRole] = useState('Psychiatric NP');
  const [noteType, setNoteType] = useState('Inpatient Psych Progress Note');
  const [template, setTemplate] = useState('Default Inpatient Psych Progress Note');
  const [sourceSections, setSourceSections] = useState<SourceSections>({
    ...EMPTY_SOURCE_SECTIONS,
    clinicianNotes: sampleSourceInput,
  });
  const [encounterSupport, setEncounterSupport] = useState<EncounterSupport>(() => createEncounterSupportDefaults('Inpatient Psych Progress Note'));
  const [medicationProfile, setMedicationProfile] = useState<StructuredPsychMedicationProfileEntry[]>([]);
  const [diagnosisProfile, setDiagnosisProfile] = useState<StructuredPsychDiagnosisProfileEntry[]>([]);
  const [sourceWorkspaceMode, setSourceWorkspaceMode] = useState<SourceWorkspaceMode>('manual');
  const [activeSourceTab, setActiveSourceTab] = useState<SourceTabKey>('intakeCollateral');
  const [dictationTargetManuallySelected, setDictationTargetManuallySelected] = useState(false);
  const [dictationInsertions, setDictationInsertions] = useState<DraftSession['dictationInsertions']>({});
  const [dictationSession, setDictationSession] = useState(() => createLocalDictationSession({}));
  const [dictationMockDraft, setDictationMockDraft] = useState('');
  const [dictationHasStream, setDictationHasStream] = useState(false);
  const [dictationCapturePaused, setDictationCapturePaused] = useState(false);
  const [dictationRequestingPermission, setDictationRequestingPermission] = useState(false);
  const [dictationCaptureError, setDictationCaptureError] = useState('');
  const [dictationUploadStatus, setDictationUploadStatus] = useState('');
  const [dictationTechnicalStatus, setDictationTechnicalStatus] = useState('');
  const [dictationUploadedChunkCount, setDictationUploadedChunkCount] = useState(0);
  const [dictationUploadedAudioBytes, setDictationUploadedAudioBytes] = useState(0);
  const [dictationProviderLabel, setDictationProviderLabel] = useState('not started');
  const [dictationProviderNote, setDictationProviderNote] = useState('No dictation provider selected yet.');
  const [dictationProviderOptions, setDictationProviderOptions] = useState<DictationProviderStatusOption[]>([]);
  const [dictationRequestedProviderId, setDictationRequestedProviderId] = useState('');
  const [dictationAllowMockFallback, setDictationAllowMockFallback] = useState(true);
  const [dictationProviderStatusLoading, setDictationProviderStatusLoading] = useState(false);
  const [dictationBackendStatus, setDictationBackendStatus] = useState('idle');
  const [dictationQueuedEventCount, setDictationQueuedEventCount] = useState(0);
  const [dictationTransportLabel, setDictationTransportLabel] = useState('polling standby');
  const [dictationAuditEvents, setDictationAuditEvents] = useState<DictationAuditEvent[]>([]);
  const [dictationSessionHistory, setDictationSessionHistory] = useState<DictationSessionHistoryItem[]>([]);
  const [selectedDictationHistorySessionId, setSelectedDictationHistorySessionId] = useState('');
  const [selectedDictationHistoryEvents, setSelectedDictationHistoryEvents] = useState<DictationAuditEvent[]>([]);
  const [selectedDictationHistoryLoading, setSelectedDictationHistoryLoading] = useState(false);
  const [editedDictationSegments, setEditedDictationSegments] = useState<Record<string, string>>({});
  const [dictationDebugSnapshot, setDictationDebugSnapshot] = useState({
    rawTranscript: '',
    normalizedTranscript: '',
    insertedTranscript: '',
  });
  const [ambientSessionSummary, setAmbientSessionSummary] = useState<{
    sessionState: string;
    transcriptEventCount: number;
    unresolvedSpeakerTurnCount: number;
    reviewFlagCount: number;
    transcriptReadyForSource: boolean;
  }>({
    sessionState: 'idle',
    transcriptEventCount: 0,
    unresolvedSpeakerTurnCount: 0,
    reviewFlagCount: 0,
    transcriptReadyForSource: false,
  });
  const [ambientTranscriptHandoff, setAmbientTranscriptHandoff] = useState<DraftSession['ambientTranscriptHandoff']>();
  const [ambientResumeSnapshot, setAmbientResumeSnapshot] = useState<AmbientResumeSnapshot | null>(null);
  const [ambientResumeHydrated, setAmbientResumeHydrated] = useState(false);
  const [ambientWorkspaceResetToken, setAmbientWorkspaceResetToken] = useState(0);
  const [outputStyle, setOutputStyle] = useState('Standard');
  const [format, setFormat] = useState('Labeled Sections');
  const [flagMissingInfo, setFlagMissingInfo] = useState(true);
  const [keepCloserToSource, setKeepCloserToSource] = useState(true);
  const [outputScope, setOutputScope] = useState<OutputScope>('full-note');
  const [requestedSections, setRequestedSections] = useState<NoteSectionKey[]>([]);
  const [presets, setPresets] = useState<NotePreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [presetName, setPresetName] = useState('');
  const [customInstructions, setCustomInstructions] = useState('');
  const [assistantPreferenceRequest, setAssistantPreferenceRequest] = useState('');
  const [assistantPreferenceDraft, setAssistantPreferenceDraft] = useState('');
  const [promptBuilderGoalIds, setPromptBuilderGoalIds] = useState<ProviderPromptStudioGoalId[]>([
    'preserve-source-uncertainty',
    'preserve-risk-conflict',
    'do-not-fill-mse',
  ]);
  const [lanePreferenceSuggestion, setLanePreferenceSuggestion] = useState<ReturnType<typeof getLanePreferenceSuggestion>>(null);
  const [promptPreferenceSuggestion, setPromptPreferenceSuggestion] = useState<ReturnType<typeof getPromptPreferenceSuggestion>>(null);
  const [profilePromptPreferenceSuggestion, setProfilePromptPreferenceSuggestion] = useState<ReturnType<typeof assistantMemoryService.getProfilePromptSuggestion>>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [providerSettings, setProviderSettings] = useState<ProviderSettings>(DEFAULT_PROVIDER_SETTINGS);
  const [evalBanner, setEvalBanner] = useState('');
  const [outputProfileName, setOutputProfileName] = useState('');
  const [outputProfileSiteLabel, setOutputProfileSiteLabel] = useState('');
  const [continuityRecords, setContinuityRecords] = useState<PatientContinuityRecord[]>([]);
  const [selectedContinuityId, setSelectedContinuityId] = useState('');
  const [continuitySearchQuery, setContinuitySearchQuery] = useState('');
  const [continuityDateFrom, setContinuityDateFrom] = useState('');
  const [continuityDateTo, setContinuityDateTo] = useState('');
  const [continuityNoteTypeFilter, setContinuityNoteTypeFilter] = useState('');
  const [continuityCategory, setContinuityCategory] = useState<PatientContinuityFactCategory | 'all'>('all');
  const [continuityPatientLabel, setContinuityPatientLabel] = useState('');
  const [continuityPatientDescription, setContinuityPatientDescription] = useState('');
  const [continuityPrivacyMode, setContinuityPrivacyMode] = useState<PatientContinuityPrivacyMode>('neutral-id');
  const [continuityLoading, setContinuityLoading] = useState(false);
  const [continuityStatus, setContinuityStatus] = useState('');
  const resolvedProviderIdentityId = session?.user?.providerIdentityId || getCurrentProviderId();
  const showInternalDictationDebug = resolvedProviderIdentityId === 'provider-daniel-hale-beta';
  const ambientSessionResumeStorageKey = getAmbientSessionResumeStorageKey(resolvedProviderIdentityId);
  const draftSessionStorageKey = getDraftSessionStorageKey(resolvedProviderIdentityId);
  const draftRecoveryStorageKey = getDraftRecoveryStorageKey(resolvedProviderIdentityId);
  const draftStageStorageKey = `${draftSessionStorageKey}-stage`;
  const assistantPendingActionStorageKey = getAssistantPendingActionStorageKey(resolvedProviderIdentityId);

  useEffect(() => {
    return () => {
      if (jumpHighlightTimeoutRef.current) {
        clearTimeout(jumpHighlightTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });
  }, []);

  useEffect(() => {
    if (!draftHydrationComplete) {
      return;
    }

    [0, 80, 220, 500].forEach((delay) => {
      window.setTimeout(() => {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      }, delay);
    });
  }, [draftHydrationComplete]);

  const noteTypeOptions = useMemo(() => noteTypeOptionsBySpecialty[specialty] || [], [specialty]);
  const templateOptions = useMemo(() => templateOptionsByNoteType[noteType] || [], [noteType]);
  const sourceInput = useMemo(() => buildSourceInputFromSections(sourceSections), [sourceSections]);
  const selectedContinuityRecord = useMemo(
    () => continuityRecords.find((record) => record.id === selectedContinuityId) || null,
    [continuityRecords, selectedContinuityId],
  );
  const continuityNoteTypeOptions = useMemo(
    () => Array.from(new Set([
      noteType,
      ...noteTypeOptions,
      ...continuityRecords.flatMap((record) => record.sourceNoteTypes),
    ].filter(Boolean))).slice(0, 30),
    [continuityRecords, noteType, noteTypeOptions],
  );
  const continuityTodaySignals = useMemo(
    () => buildContinuityTodaySignals(selectedContinuityRecord, sourceInput),
    [selectedContinuityRecord, sourceInput],
  );
  const populatedSectionLabels = useMemo(() => describePopulatedSourceSections(sourceSections), [sourceSections]);
  const currentTemplateDescription = templateDescriptions[template] || 'Template description not yet defined.';
  const sectionPlan = useMemo(() => planSections({ noteType, requestedScope: outputScope, requestedSections }), [noteType, outputScope, requestedSections]);
  const availableSectionEntries = useMemo(() => sectionPlan.profile?.availableSections ?? [], [sectionPlan.profile]);
  const activePreset = useMemo(() => presets.find((item) => item.id === selectedPresetId) || null, [presets, selectedPresetId]);
  const activeProviderProfile = useMemo(() => findProviderProfile(providerSettings.providerProfileId), [providerSettings.providerProfileId]);
  const assistantPersona = useMemo(() => resolveAssistantPersona(providerSettings), [providerSettings]);
  const assistantAvatarOptions = useMemo(() => listAssistantAvatarOptions(), []);
  const activeOutputProfile = useMemo(
    () => providerSettings.outputProfiles.find((profile) => profile.id === providerSettings.activeOutputProfileId) || null,
    [providerSettings.activeOutputProfileId, providerSettings.outputProfiles],
  );
  const visibleOutputProfiles = hasClientHydrated ? providerSettings.outputProfiles : [];
  const visibleActiveOutputProfile = hasClientHydrated ? activeOutputProfile : null;
  const starterOutputProfiles = useMemo(
    () => buildStarterOutputProfiles({
      noteType,
      destination: providerSettings.outputDestination,
      asciiSafe: providerSettings.asciiSafe,
      paragraphOnly: providerSettings.paragraphOnly,
      wellskyFriendly: providerSettings.wellskyFriendly,
    }),
    [noteType, providerSettings.asciiSafe, providerSettings.outputDestination, providerSettings.paragraphOnly, providerSettings.wellskyFriendly],
  );
  const dictationTargetSection = useMemo(
    () => {
      if (sourceWorkspaceMode === 'dictation' && !dictationTargetManuallySelected) {
        return 'clinicianNotes';
      }

      return isDictationTargetSection(activeSourceTab) ? activeSourceTab : undefined;
    },
    [activeSourceTab, dictationTargetManuallySelected, sourceWorkspaceMode],
  );
  const ambientCareSetting = useMemo(() => inferAmbientCareSetting(noteType), [noteType]);
  const ambientListeningMode = useMemo(() => inferAmbientListeningMode(noteType), [noteType]);
  const effectiveDictationCommands = useMemo(
    () => getEffectiveDictationCommands(providerSettings.dictationCommands),
    [providerSettings.dictationCommands],
  );
  const dictationVoiceGuide = useMemo(
    () => buildDictationVoiceGuide({
      settings: providerSettings.dictationVoiceProfile,
      pendingSegments: dictationSession.pendingSegments,
    }),
    [dictationSession.pendingSegments, providerSettings.dictationVoiceProfile],
  );
  const dictationTargetLabel = dictationTargetSection
    ? `Dictation target: ${DICTATION_TARGET_LABELS[dictationTargetSection]}`
    : 'Dictation target: choose Pre-Visit Data, Live Visit Notes, Ambient Transcript, or Provider Add-On';
  const dictationTargetShortLabel = dictationTargetSection
    ? DICTATION_TARGET_LABELS[dictationTargetSection]
    : 'source';
  const dictationCaptureState = useMemo(() => getBrowserDictationCaptureState({
    supported: hasClientHydrated && typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function',
    stream: dictationHasStream ? dictationMediaStreamRef.current : null,
    paused: dictationCapturePaused,
    requestingPermission: dictationRequestingPermission,
    error: dictationCaptureError,
  }), [dictationCaptureError, dictationCapturePaused, dictationHasStream, dictationRequestingPermission, hasClientHydrated]);
  const dictationCaptureLabel = useMemo(() => {
    const chunkLabel = dictationUploadedChunkCount
      ? ` • ${dictationUploadedChunkCount} chunk${dictationUploadedChunkCount === 1 ? '' : 's'} sent`
      : '';
    const uploadLabel = dictationUploadStatus ? ` • ${dictationUploadStatus}` : '';
    switch (dictationCaptureState) {
      case 'unsupported':
        return 'mic unavailable in this browser';
      case 'requesting_permission':
        return 'requesting microphone permission';
      case 'capturing':
        return `microphone live${chunkLabel}${uploadLabel}`;
      case 'paused':
        return `microphone paused${chunkLabel}${uploadLabel}`;
      case 'error':
        return dictationCaptureError || 'microphone error';
      case 'ready':
        return `microphone ready${chunkLabel}${uploadLabel}`;
      case 'stopped':
        return `microphone stopped${chunkLabel}${uploadLabel}`;
      case 'idle':
      default:
        return `microphone idle${chunkLabel}${uploadLabel}`;
    }
  }, [dictationCaptureError, dictationCaptureState, dictationUploadStatus, dictationUploadedChunkCount]);
  const dictationBoxStatusLabel = useMemo(() => {
    if (dictationSession.pendingSegments.length) {
      return 'Transcript ready for review';
    }

    if (dictationSession.insertedSegments.length && dictationSession.uiState === 'committed') {
      return `Inserted into ${dictationTargetShortLabel}`;
    }

    if (dictationUploadStatus === 'uploading audio') {
      return 'Uploading audio';
    }

    if (dictationUploadStatus === 'Recording' || dictationUploadStatus === 'recording resumed') {
      return 'Recording';
    }

    if (dictationUploadStatus === 'waiting for transcript' || dictationUploadStatus === 'no transcript yet') {
      return 'Processing transcript';
    }

    if (dictationUploadStatus === 'transcript ready' || dictationUploadStatus === 'transcript ready for review') {
      return 'Transcript ready for review';
    }

    if (dictationCaptureState === 'capturing') {
      return 'Recording';
    }

    if (dictationCaptureState === 'requesting_permission') {
      return 'Requesting microphone permission';
    }

    if (dictationCaptureState === 'error') {
      return dictationCaptureError || 'Microphone error';
    }

    return 'Ready';
  }, [
    dictationCaptureError,
    dictationCaptureState,
    dictationSession.insertedSegments.length,
    dictationSession.pendingSegments.length,
    dictationSession.uiState,
    dictationTargetShortLabel,
    dictationUploadStatus,
  ]);
  const dictationAdapter = useMemo(() => createSourceSectionDictationAdapter({
    getSourceSections: () => sourceSections,
    targetSection: dictationTargetSection,
    onUpdateSourceSection: (section, value) => updateSourceSection(section, value),
    onInsertedSegment: (record) => {
      setDictationInsertions((current) => ({
        ...current,
        [record.targetSection]: [record, ...(current?.[record.targetSection] || [])],
      }));
    },
    onOpenFallback: (initialText) => {
      setEvalBanner(initialText?.trim()
        ? 'No dictation target is active. The transcript stayed in the review queue instead of being inserted automatically.'
        : 'No dictation target is active right now.');
    },
  }), [dictationTargetSection, sourceSections]);
  const destinationFitSummary = useMemo(() => {
    const pieces = [getOutputDestinationMeta(providerSettings.outputDestination).summaryLabel];

    if (providerSettings.paragraphOnly) {
      pieces.push('paragraph-first');
    }
    if (providerSettings.asciiSafe) {
      pieces.push('ASCII-safe');
    }
    if (providerSettings.wellskyFriendly) {
      pieces.push('strict template cleanup');
    }

    return pieces.join(' • ');
  }, [providerSettings.asciiSafe, providerSettings.outputDestination, providerSettings.paragraphOnly, providerSettings.wellskyFriendly]);
  const showUnifiedWorkspace = false;
  const requestedDraftId = searchParams.get('draftId');
  const requestedDictationSessionId = searchParams.get('dictationSessionId');

  useEffect(() => {
    setHasClientHydrated(true);
  }, []);

  useEffect(() => {
    if (!hasClientHydrated) {
      return;
    }

    const controller = new AbortController();

    void (async () => {
      try {
        const params = new URLSearchParams({ providerId: resolvedProviderIdentityId });
        const response = await fetch(`/api/patient-continuity?${params.toString()}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const payload = await response.json() as { records?: PatientContinuityRecord[]; activeRecord?: PatientContinuityRecord | null };

        if (!response.ok || !Array.isArray(payload.records)) {
          return;
        }

        setContinuityRecords(payload.records);
        setSelectedContinuityId((current) => (
          current && payload.records?.some((record) => record.id === current)
            ? current
            : payload.activeRecord?.id || payload.records?.[0]?.id || ''
        ));
      } catch (error) {
        if ((error as Error)?.name !== 'AbortError') {
          setContinuityStatus('Continuity recall is optional and did not load yet.');
        }
      }
    })();

    return () => controller.abort();
  }, [hasClientHydrated, resolvedProviderIdentityId]);

  useEffect(() => {
    if (!hasClientHydrated) {
      return;
    }

    void (async () => {
      try {
        const response = await fetch(`/api/dictation/audit?providerId=${encodeURIComponent(resolvedProviderIdentityId)}&limit=40`, {
          cache: 'no-store',
        });
        const payload = await response.json() as {
          events?: DictationAuditEvent[];
        };

        if (!response.ok || !Array.isArray(payload.events)) {
          return;
        }

        const nextHistory = summarizeDictationSessionHistory(payload.events);
        setDictationSessionHistory(nextHistory);
        setSelectedDictationHistorySessionId((current) => current || nextHistory[0]?.sessionId || '');
      } catch {
        // History is helpful but not required for the live dictation flow.
      }
    })();
  }, [hasClientHydrated, resolvedProviderIdentityId]);

  useEffect(() => {
    if (!selectedDictationHistorySessionId) {
      setSelectedDictationHistoryEvents([]);
      return;
    }

    let cancelled = false;
    setSelectedDictationHistoryLoading(true);

    void (async () => {
      try {
        const response = await fetch(`/api/dictation/audit?providerId=${encodeURIComponent(resolvedProviderIdentityId)}&sessionId=${encodeURIComponent(selectedDictationHistorySessionId)}&limit=40`, {
          cache: 'no-store',
        });
        const payload = await response.json() as {
          events?: DictationAuditEvent[];
        };

        if (cancelled || !response.ok || !Array.isArray(payload.events)) {
          return;
        }

        setSelectedDictationHistoryEvents(payload.events);
      } finally {
        if (!cancelled) {
          setSelectedDictationHistoryLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resolvedProviderIdentityId, selectedDictationHistorySessionId]);

  async function refreshDictationProviderStatuses() {
    setDictationProviderStatusLoading(true);
    try {
      const response = await fetch('/api/dictation/providers', { cache: 'no-store' });
      const payload = await response.json() as {
        providers?: DictationProviderStatusOption[];
        defaultSelection?: {
          requestedProvider?: string;
          activeProvider?: string;
          activeProviderLabel?: string;
          engineLabel?: string;
          fallbackApplied?: boolean;
          fallbackReason?: string;
          reason?: string;
        };
      };

      if (!response.ok) {
        throw new Error('Unable to load dictation provider status.');
      }

      const nextProviders = Array.isArray(payload.providers) ? payload.providers : [];
      setDictationProviderOptions(nextProviders);

      if (!dictationSession.sessionId) {
        const defaultRequestedProvider = payload.defaultSelection?.requestedProvider
          || nextProviders.find((item) => item.available && item.providerId === 'openai-transcription')?.providerId
          || nextProviders[0]?.providerId
          || 'mock-stt';
        setDictationRequestedProviderId((current) => current || defaultRequestedProvider);
        setDictationProviderLabel(formatDictationProviderRuntimeLabel({
          providerLabel: payload.defaultSelection?.activeProviderLabel,
          engineLabel: payload.defaultSelection?.engineLabel,
          fallbackApplied: payload.defaultSelection?.fallbackApplied,
        }));
        setDictationProviderNote(payload.defaultSelection?.fallbackReason || payload.defaultSelection?.reason || 'Select a provider before starting dictation.');
      }
    } catch (err) {
      setDictationProviderNote(err instanceof Error ? err.message : 'Unable to load dictation provider status.');
    } finally {
      setDictationProviderStatusLoading(false);
    }
  }

  useEffect(() => {
    void refreshDictationProviderStatuses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      clearBrowserDictationUploadTimer();
      if (dictationEventSourceRef.current) {
        dictationEventSourceRef.current.close();
        dictationEventSourceRef.current = null;
      }
      if (dictationRecorderRef.current && dictationRecorderRef.current.state !== 'inactive') {
        dictationRecorderRef.current.stop();
      }
      dictationRecordedAudioChunksRef.current = [];
      stopBrowserDictationStream(dictationMediaStreamRef.current);
      dictationMediaStreamRef.current = null;
    };
  }, []);

  function clearBrowserDictationUploadTimer() {
    if (dictationUploadTimerRef.current !== null) {
      window.clearInterval(dictationUploadTimerRef.current);
      dictationUploadTimerRef.current = null;
    }
  }

  async function requestLatestBrowserRecorderData() {
    const recorder = dictationRecorderRef.current;
    if (!recorder || recorder.state === 'inactive' || typeof recorder.requestData !== 'function') {
      return;
    }

    recorder.requestData();
    await new Promise((resolve) => {
      window.setTimeout(resolve, 200);
    });
  }

  async function uploadRecordedDictationChunk(sessionId: string, blob: Blob, options?: { final?: boolean }) {
    const bytes = await readBlobBytes(blob);
    const mimeType = blob.type || 'application/octet-stream';
    const uploadDecision = shouldUploadBrowserDictationBlob({
      bytes,
      mimeType,
      elapsedMs: dictationRecordingStartedAtRef.current ? Date.now() - dictationRecordingStartedAtRef.current : 0,
      final: Boolean(options?.final),
      lastUploadedSizeBytes: dictationLastUploadedSizeBytesRef.current,
    });

    if (!uploadDecision.upload) {
      if (uploadDecision.reason !== 'recording_too_short' && uploadDecision.reason !== 'audio_already_uploaded') {
        setDictationTechnicalStatus(`Audio skipped: ${uploadDecision.reason.replace(/_/g, ' ')}`);
      }
      setDictationUploadStatus((current) => (current === 'uploading audio' ? 'Recording' : current || 'Ready'));
      return {
        queuedFinalCount: 0,
        rejectedFinalCount: 0,
        transcriptEventCount: 0,
        finalSegments: [] as TranscriptSegment[],
      };
    }

    const nextSequence = dictationChunkSequenceRef.current + 1;
    dictationChunkSequenceRef.current = nextSequence;
    dictationLastUploadedSizeBytesRef.current = bytes.length;
    setDictationUploadStatus('uploading audio');
    setDictationTechnicalStatus('');

    const chunk = await buildDictationChunkUpload({
      blob,
      sessionId,
      sequence: nextSequence,
      capturedAt: new Date().toISOString(),
    });

    const response = await fetch(`/api/dictation/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerId: resolvedProviderIdentityId,
        action: 'upload_chunk',
        chunk,
      }),
    });

    const payload = await response.json() as {
      error?: string;
      ingestion?: {
        receivedAudioChunkCount: number;
        receivedAudioBytes: number;
        queuedEventCount?: number;
        skipped?: boolean;
        skipReason?: string;
      };
    };

    if (!response.ok || !payload.ingestion) {
      throw new Error(payload.error || 'Unable to upload dictation audio chunk.');
    }

    if (payload.ingestion.skipped) {
      setDictationTechnicalStatus(`Audio skipped: ${(payload.ingestion.skipReason || 'not accepted').replace(/_/g, ' ')}`);
      setDictationUploadStatus((current) => (
        dictationSession.pendingSegments.length ? 'transcript ready for review' : current || 'Ready'
      ));
      return {
        queuedFinalCount: 0,
        rejectedFinalCount: 0,
        transcriptEventCount: 0,
        finalSegments: [] as TranscriptSegment[],
      };
    }

    setDictationUploadedChunkCount(payload.ingestion.receivedAudioChunkCount);
    setDictationUploadedAudioBytes(payload.ingestion.receivedAudioBytes);
    setDictationQueuedEventCount(payload.ingestion.queuedEventCount || 0);
    setDictationUploadStatus(
      (payload.ingestion.queuedEventCount || 0) > 0
        ? 'transcript ready'
        : 'waiting for transcript',
    );

    return pullDictationTranscriptEvents(sessionId);
  }

  async function uploadCurrentBrowserRecording(sessionId: string, options?: { final?: boolean }) {
    if (dictationUploadInFlightRef.current) {
      return undefined;
    }

    dictationUploadInFlightRef.current = true;
    try {
      if (options?.final) {
        await requestLatestBrowserRecorderData();
      }

      const cumulativeBlob = buildCumulativeDictationAudioBlob(
        dictationRecordedAudioChunksRef.current,
        getPreferredRecorderMimeType(typeof window !== 'undefined' ? window.MediaRecorder : undefined),
      );
      if (!cumulativeBlob.size) {
        setDictationTechnicalStatus('No browser audio was captured yet.');
        return undefined;
      }

      return uploadRecordedDictationChunk(sessionId, cumulativeBlob, options);
    } finally {
      dictationUploadInFlightRef.current = false;
    }
  }

  function closeDictationEventStream() {
    if (dictationEventSourceRef.current) {
      dictationEventSourceRef.current.close();
      dictationEventSourceRef.current = null;
    }
    setDictationTransportLabel('polling standby');
  }

  async function refreshDictationSession(sessionId: string) {
    const response = await fetch(`/api/dictation/sessions/${encodeURIComponent(sessionId)}?providerId=${encodeURIComponent(resolvedProviderIdentityId)}`, {
      cache: 'no-store',
    });
    const payload = await response.json() as {
      error?: string;
      session?: {
        sttProvider?: string;
        activeProviderLabel?: string;
        engineLabel?: string;
        fallbackApplied?: boolean;
        fallbackReason?: string;
        providerReason?: string;
        status?: string;
        receivedAudioChunkCount?: number;
        receivedAudioBytes?: number;
        queuedTranscriptEventCount?: number;
        recentAuditEvents?: DictationAuditEvent[];
      };
    };

    if (!response.ok || !payload.session) {
      throw new Error(payload.error || 'Unable to load dictation session state.');
    }

    const session = payload.session as NonNullable<typeof payload.session>;

    setDictationProviderLabel(formatDictationProviderRuntimeLabel({
      providerLabel: session.activeProviderLabel || formatDictationProviderLabel(session.sttProvider),
      engineLabel: session.engineLabel,
      fallbackApplied: session.fallbackApplied,
    }));
    setDictationProviderNote(session.fallbackReason || session.providerReason || 'Backend provider session is active.');
    setDictationBackendStatus(formatDictationBackendStatusLabel({
      status: session.status || 'active',
      fallbackApplied: session.fallbackApplied,
    }));
    setDictationUploadedChunkCount(session.receivedAudioChunkCount || 0);
    setDictationUploadedAudioBytes(session.receivedAudioBytes || 0);
    setDictationQueuedEventCount(session.queuedTranscriptEventCount || 0);
    setDictationAuditEvents((current) => mergeDictationAuditEvents(current, session.recentAuditEvents || []));
    setDictationSessionHistory((current) => mergeDictationSessionHistory(current, session.recentAuditEvents || []));
    return session;
  }

  async function pullDictationTranscriptEvents(sessionId: string) {
    const eventResponse = await fetch(`/api/dictation/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerId: resolvedProviderIdentityId,
        action: 'pull_events',
      }),
    });
    const eventPayload = await eventResponse.json() as {
      error?: string;
      transcriptEvents?: Array<typeof dictationSession.pendingSegments[number]>;
    };

    if (!eventResponse.ok || !Array.isArray(eventPayload.transcriptEvents)) {
      throw new Error(eventPayload.error || 'Unable to load dictation transcript events.');
    }

    const rejectedFinalSegments = eventPayload.transcriptEvents.filter((segment) => (
      segment.isFinal && !isMeaningfulDictationTranscriptText(segment.text)
    ));
    const transcriptEvents = eventPayload.transcriptEvents.filter((segment) => (
      !segment.isFinal || isMeaningfulDictationTranscriptText(segment.text)
    ));
    setDictationQueuedEventCount(0);
    if (!transcriptEvents.length) {
      if (rejectedFinalSegments.length) {
        setDictationTechnicalStatus(`Ignored short transcript: ${rejectedFinalSegments.map((segment) => `"${segment.text.trim()}"`).join(', ')}`);
        setDictationUploadStatus('Recording');
      }
      setDictationUploadStatus((current) => (
        current === 'uploading audio' || current === 'waiting for transcript'
          ? 'no transcript yet'
          : current
      ));
      return {
        queuedFinalCount: 0,
        rejectedFinalCount: rejectedFinalSegments.length,
        transcriptEventCount: 0,
        finalSegments: [] as TranscriptSegment[],
      };
    }

    const rawFinalSegments = transcriptEvents.filter((segment) => segment.isFinal);
    const normalizedTranscriptEvents = transcriptEvents.map((segment) => {
      if (!segment.isFinal) {
        return segment;
      }

      const normalizedText = normalizeSpokenDictationPunctuation(segment.text);
      return {
        ...segment,
        text: normalizedText,
        normalizedText,
      };
    });
    const normalizedFinalSegments = normalizedTranscriptEvents.filter((segment) => segment.isFinal);
    const finalSegments = normalizedFinalSegments.length
      ? [normalizedFinalSegments[normalizedFinalSegments.length - 1]!]
      : [];
    setDictationSession((current) => {
      const interimSegments = normalizedTranscriptEvents.filter((segment) => !segment.isFinal);
      const withInterim = interimSegments.length
        ? applyInterimSegment(updateDictationTarget(current, dictationTargetSection), interimSegments[interimSegments.length - 1])
        : current;
      const withFreshFinalQueue = finalSegments.length
        ? {
            ...withInterim,
            pendingSegments: [],
            interimSegment: undefined,
          }
        : withInterim;
      return finalSegments.reduce(
        (sessionState, segment) => queueFinalSegment(sessionState, segment),
        withFreshFinalQueue,
      );
    });

    if (finalSegments.length) {
      setDictationDebugSnapshot((current) => ({
        ...current,
        rawTranscript: rawFinalSegments.map((segment) => segment.text.trim()).filter(Boolean).join('\n\n'),
        normalizedTranscript: finalSegments.map((segment) => segment.text.trim()).filter(Boolean).join('\n\n'),
        insertedTranscript: '',
      }));
      clearBrowserDictationUploadTimer();
      setBrowserDictationStreamPaused(dictationMediaStreamRef.current, true);
      stopBrowserRecorder();
      setDictationCapturePaused(true);
      setDictationUploadStatus('transcript ready for review');
    } else {
      setDictationUploadStatus('interim transcript ready');
    }

    return {
      queuedFinalCount: finalSegments.length,
      rejectedFinalCount: rejectedFinalSegments.length,
      transcriptEventCount: normalizedTranscriptEvents.length,
      finalSegments,
    };
  }

  function ensureDictationEventStream(sessionId: string) {
    if (typeof window === 'undefined' || typeof window.EventSource === 'undefined') {
      setDictationTransportLabel('polling fallback');
      return;
    }

    if (dictationEventSourceRef.current) {
      return;
    }

    const source = new window.EventSource(
      `/api/dictation/sessions/${encodeURIComponent(sessionId)}?providerId=${encodeURIComponent(resolvedProviderIdentityId)}&stream=1`,
    );

    source.addEventListener('session_state', (event) => {
      const payload = JSON.parse((event as MessageEvent<string>).data) as {
        sttProvider?: string;
        activeProviderLabel?: string;
        engineLabel?: string;
        fallbackApplied?: boolean;
        fallbackReason?: string;
        providerReason?: string;
        status?: string;
        receivedAudioChunkCount?: number;
        receivedAudioBytes?: number;
        queuedTranscriptEventCount?: number;
        recentAuditEvents?: DictationAuditEvent[];
      };

      setDictationProviderLabel(formatDictationProviderRuntimeLabel({
        providerLabel: payload.activeProviderLabel || formatDictationProviderLabel(payload.sttProvider),
        engineLabel: payload.engineLabel,
        fallbackApplied: payload.fallbackApplied,
      }));
      setDictationProviderNote(payload.fallbackReason || payload.providerReason || 'Backend provider session is active.');
      setDictationBackendStatus(formatDictationBackendStatusLabel({
        status: payload.status || 'active',
        streamConnected: true,
        fallbackApplied: payload.fallbackApplied,
      }));
      setDictationUploadedChunkCount(payload.receivedAudioChunkCount || 0);
      setDictationUploadedAudioBytes(payload.receivedAudioBytes || 0);
      setDictationQueuedEventCount(payload.queuedTranscriptEventCount || 0);
      setDictationAuditEvents((current) => mergeDictationAuditEvents(current, payload.recentAuditEvents || []));
      setDictationSessionHistory((current) => mergeDictationSessionHistory(current, payload.recentAuditEvents || []));
      setDictationTransportLabel('live session stream');

      if ((payload.queuedTranscriptEventCount || 0) > 0) {
        void pullDictationTranscriptEvents(sessionId).catch(() => {
          // Session polling remains available if the live stream momentarily outpaces transcript pulls.
        });
      }
    });

    source.onerror = () => {
      setDictationTransportLabel('polling fallback');
      setDictationBackendStatus((current) => (
        current === 'active • live stream' ? 'active' : current
      ));
      setDictationAuditEvents((current) => mergeDictationAuditEvents(current, [createClientDictationAuditEvent({
        sessionId,
        encounterId: 'new-note-compose',
        actorUserId: resolvedProviderIdentityId,
        sttProvider: dictationProviderLabel,
        eventName: 'dictation_session_error',
        eventDomain: 'frontend',
        payload: {
          reason: 'live_stream_dropped',
          fallback: 'polling',
        },
      })]));
      setDictationSessionHistory((current) => mergeDictationSessionHistory(current, [createClientDictationAuditEvent({
        sessionId,
        encounterId: 'new-note-compose',
        actorUserId: resolvedProviderIdentityId,
        sttProvider: dictationProviderLabel,
        eventName: 'dictation_session_error',
        eventDomain: 'frontend',
        payload: {
          reason: 'live_stream_dropped',
          fallback: 'polling',
        },
      })]));
      source.close();
      if (dictationEventSourceRef.current === source) {
        dictationEventSourceRef.current = null;
      }
    };

    dictationEventSourceRef.current = source;
  }

  useEffect(() => {
    if (
      workflowStage !== 'compose'
      || !isServerDictationSessionId(dictationSession.sessionId)
      || dictationSession.uiState === 'stopped'
    ) {
      closeDictationEventStream();
      return;
    }

    ensureDictationEventStream(dictationSession.sessionId);

    if (dictationEventSourceRef.current) {
      return;
    }

    const interval = window.setInterval(() => {
      void (async () => {
        try {
          const session = await refreshDictationSession(dictationSession.sessionId);
          if ((session.queuedTranscriptEventCount || 0) > 0) {
            await pullDictationTranscriptEvents(dictationSession.sessionId);
          }
        } catch {
          // Keep dictation usable even if session polling intermittently fails.
        }
      })();
    }, 2000);

    return () => window.clearInterval(interval);
  }, [dictationSession.sessionId, dictationSession.uiState, resolvedProviderIdentityId, workflowStage]);

  function startBrowserRecorder(stream: MediaStream, sessionId: string) {
    if (typeof window === 'undefined' || !browserRecorderSupported(window.MediaRecorder)) {
      setDictationUploadStatus('MediaRecorder unavailable');
      return;
    }

    if (dictationRecorderRef.current && dictationRecorderRef.current.state !== 'inactive') {
      if (dictationRecorderRef.current.state === 'paused') {
        dictationRecorderRef.current.resume();
        dictationRecordingStartedAtRef.current = Date.now();
        clearBrowserDictationUploadTimer();
        setDictationUploadStatus('Recording');
        setDictationTechnicalStatus('Recording full phrase. Press Stop when you are finished to transcribe the complete dictation.');
      }
      return;
    }

    clearBrowserDictationUploadTimer();
    dictationRecordedAudioChunksRef.current = [];
    dictationLastUploadedSizeBytesRef.current = 0;
    dictationRecordingStartedAtRef.current = Date.now();
    const preferredMimeType = getPreferredRecorderMimeType(window.MediaRecorder);
    const recorder = preferredMimeType
      ? new window.MediaRecorder(stream, { mimeType: preferredMimeType })
      : new window.MediaRecorder(stream);

    recorder.ondataavailable = (event) => {
      if (dictationRecorderRef.current !== recorder) {
        return;
      }

      if (!event.data || event.data.size <= 0) {
        setDictationUploadStatus('empty recorder slice skipped');
        return;
      }

      dictationRecordedAudioChunksRef.current.push(event.data);
    };

    recorder.onerror = (event) => {
      const recorderError = event as Event & { error?: DOMException };
      const message = recorderError.error?.message || 'Browser recorder error.';
      setDictationCaptureError(message);
      setDictationUploadStatus(message);
      setError(message);
    };

    recorder.start(1500);
    dictationRecorderRef.current = recorder;
    setDictationUploadStatus('Recording');
    setDictationTechnicalStatus('Recording full phrase. Press Stop when you are finished to transcribe the complete dictation.');
  }

  function pauseBrowserRecorder() {
    clearBrowserDictationUploadTimer();
    if (dictationRecorderRef.current?.state === 'recording') {
      dictationRecorderRef.current.pause();
    }
  }

  function resumeBrowserRecorder() {
    clearBrowserDictationUploadTimer();
    if (dictationRecorderRef.current?.state === 'paused') {
      dictationRecorderRef.current.resume();
    }
  }

  function stopBrowserRecorder() {
    clearBrowserDictationUploadTimer();
    if (dictationRecorderRef.current && dictationRecorderRef.current.state !== 'inactive') {
      dictationRecorderRef.current.stop();
    }
    dictationRecorderRef.current = null;
    dictationRecordedAudioChunksRef.current = [];
    dictationRecordingStartedAtRef.current = null;
    dictationLastUploadedSizeBytesRef.current = 0;
  }

  async function handleApplyOutputProfile(profileId: string) {
    if (!profileId) {
      const nextSettings = {
        ...providerSettings,
        activeOutputProfileId: '',
      };

      setProviderSettings(nextSettings);
      await persistProviderSettings(nextSettings);
      return;
    }

    const profile = providerSettings.outputProfiles.find((item) => item.id === profileId);
    if (!profile) {
      return;
    }

    const nextSettings = {
      ...providerSettings,
      outputDestination: profile.destination,
      outputNoteFocus: profile.noteFocus,
      asciiSafe: profile.asciiSafe,
      paragraphOnly: profile.paragraphOnly,
      wellskyFriendly: profile.wellskyFriendly,
      activeOutputProfileId: profile.id,
    };

    setProviderSettings(nextSettings);
    setKeepCloserToSource(nextSettings.closerToSourceDefault);
    setFormat(nextSettings.paragraphOnly ? 'Paragraph Style' : 'Labeled Sections');
    setEvalBanner(`Applied site preset: ${profile.name}`);
    await persistProviderSettings(nextSettings);
  }

  function resetOutputProfileDraft() {
    setOutputProfileName('');
    setOutputProfileSiteLabel('');
  }

  async function persistProviderSettings(nextSettings: ProviderSettings) {
    const sanitizedSettings = applyAssistantPersonaDefaults(nextSettings);
    writeCachedProviderSettings(resolvedProviderIdentityId, sanitizedSettings);

    try {
      await fetch('/api/settings/provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...sanitizedSettings, providerId: resolvedProviderIdentityId }),
      });
    } catch {
      // Local state still supports the workflow if backend persistence is unavailable.
    }
  }

  async function persistAssistantPersonaPatch(
    patch: Partial<Pick<ProviderSettings, 'userAiName' | 'userAiRole' | 'userAiAvatar'>>,
  ) {
    const nextSettings = applyAssistantPersonaDefaults({
      ...providerSettings,
      ...patch,
    });
    setProviderSettings(nextSettings);
    await persistProviderSettings(nextSettings);
  }

  function handleTopSpecialtyChange(nextSpecialty: string) {
    const nextNoteTypeOptions = noteTypeOptionsBySpecialty[nextSpecialty] || [];
    const nextNoteType = nextNoteTypeOptions.includes(noteType) ? noteType : nextNoteTypeOptions[0] || noteType;
    const nextTemplateOptions = templateOptionsByNoteType[nextNoteType] || [];

    setSpecialty(nextSpecialty);
    setRole((current) => (PROVIDER_ROLE_OPTIONS.includes(current) ? current : defaultRoleForSpecialty(nextSpecialty)));
    setNoteType(nextNoteType);
    setTemplate((current) => (nextTemplateOptions.includes(current) ? current : nextTemplateOptions[0] || current));
    setEvalBanner(`Field changed to ${nextSpecialty}. Note type options now match that workflow.`);
  }

  function handleTopNoteTypeChange(nextNoteType: string) {
    const nextTemplateOptions = templateOptionsByNoteType[nextNoteType] || [];

    setNoteType(nextNoteType);
    setTemplate(nextTemplateOptions[0] || '');
    setEncounterSupport(createEncounterSupportDefaults(nextNoteType));
    setEvalBanner(`Note type changed to ${nextNoteType}. Veranote will format the draft around that note lane.`);
  }

  async function handleTopDestinationChange(nextDestination: ProviderSettings['outputDestination']) {
    const destinationMeta = getOutputDestinationMeta(nextDestination);
    const nextSettings = {
      ...providerSettings,
      outputDestination: nextDestination,
      asciiSafe: destinationMeta.enforceAsciiSafe,
      paragraphOnly: destinationMeta.preferParagraphOnly,
      wellskyFriendly: nextDestination === 'WellSky',
      activeOutputProfileId: '',
    };

    setProviderSettings(nextSettings);
    setFormat(nextSettings.paragraphOnly ? 'Paragraph Style' : 'Labeled Sections');
    setEvalBanner(`EHR destination changed to ${destinationMeta.summaryLabel}. Veranote will use that destination behavior.`);
    await persistProviderSettings(nextSettings);
  }

  async function handleSaveOutputProfile() {
    const trimmedName = outputProfileName.trim();
    const trimmedSiteLabel = outputProfileSiteLabel.trim();

    if (!trimmedName || !trimmedSiteLabel) {
      setError('Add both a site label and a preset name before saving a site/EHR preset.');
      window.setTimeout(() => setError(''), 2400);
      return;
    }

    const nextProfile = {
      id: `output-profile-${Date.now()}`,
      name: trimmedName,
      siteLabel: trimmedSiteLabel,
      destination: providerSettings.outputDestination,
      noteFocus: providerSettings.outputNoteFocus || inferOutputNoteFocus(noteType),
      asciiSafe: providerSettings.asciiSafe,
      paragraphOnly: providerSettings.paragraphOnly,
      wellskyFriendly: providerSettings.wellskyFriendly,
    };

    const nextSettings = {
      ...providerSettings,
      outputProfiles: [nextProfile, ...providerSettings.outputProfiles],
      activeOutputProfileId: nextProfile.id,
    };

    setProviderSettings(nextSettings);
    resetOutputProfileDraft();
    setEvalBanner(`Saved site preset: ${nextProfile.name}`);
    await persistProviderSettings(nextSettings);
  }

  async function handleCreateStarterOutputProfile(seed: {
    name: string;
    siteLabel: string;
    destination: ProviderSettings['outputDestination'];
    noteFocus: ProviderSettings['outputNoteFocus'];
    asciiSafe: boolean;
    paragraphOnly: boolean;
    wellskyFriendly: boolean;
  }) {
    const nextProfile = {
      id: `output-profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...seed,
    };

    const nextSettings = {
      ...providerSettings,
      outputDestination: seed.destination,
      outputNoteFocus: seed.noteFocus,
      asciiSafe: seed.asciiSafe,
      paragraphOnly: seed.paragraphOnly,
      wellskyFriendly: seed.wellskyFriendly,
      outputProfiles: [nextProfile, ...providerSettings.outputProfiles],
      activeOutputProfileId: nextProfile.id,
    };

    setProviderSettings(nextSettings);
    setFormat(seed.paragraphOnly ? 'Paragraph Style' : 'Labeled Sections');
    setEvalBanner(`Added starter site preset: ${nextProfile.name}`);
    await persistProviderSettings(nextSettings);
  }

  async function handleDeleteOutputProfile(profileId: string) {
    const nextSettings = {
      ...providerSettings,
      outputProfiles: providerSettings.outputProfiles.filter((profile) => profile.id !== profileId),
      activeOutputProfileId: providerSettings.activeOutputProfileId === profileId ? '' : providerSettings.activeOutputProfileId,
    };

    setProviderSettings(nextSettings);
    setEvalBanner('Removed site preset.');
    await persistProviderSettings(nextSettings);
  }
  const workspaceStatusItems = useMemo<StatusStripItem[]>(() => {
    const items: StatusStripItem[] = [];

    if (activeProviderProfile) {
      items.push({
        id: 'profile',
        label: 'Profile',
        value: activeProviderProfile.name,
        tone: 'info',
      });
    }

    if (generatedSession) {
      items.push({
        id: 'draft',
        label: 'Draft',
        value: 'Available',
        tone: 'success',
      });
    } else if (draftCheckpoint?.sourceInput?.trim()) {
      items.push({
        id: 'draft',
        label: 'Recovery',
        value: draftCheckpointStatus === 'saving' ? 'Saving' : 'Checkpoint saved',
        tone: draftCheckpointStatus === 'saving' ? 'info' : 'success',
      });
    }

    if (providerSettings.asciiSafe || providerSettings.outputDestination !== 'Generic') {
      items.push({
        id: 'constraints',
        label: 'Constraints',
        value: 'Active',
        tone: 'warning',
      });
    }

    if (providerSettings.outputDestination) {
      items.push({
        id: 'output',
        label: 'Output',
        value: providerSettings.outputDestination,
        tone: 'neutral',
      });
    }

    return items;
  }, [activeProviderProfile, draftCheckpoint, draftCheckpointStatus, generatedSession, providerSettings.asciiSafe, providerSettings.outputDestination]);
  const workflowGuidance = useMemo(() => specialty === 'Psychiatry' ? getPsychWorkflowGuidance(noteType) : null, [noteType, specialty]);
  const encounterSupportConfig = useMemo(() => getEncounterSupportConfig(noteType), [noteType]);
  const encounterSupportSummary = useMemo(() => buildEncounterSupportSummary(encounterSupport, noteType), [encounterSupport, noteType]);
  const medicationProfileSummary = useMemo(() => buildMedicationProfileSummary(medicationProfile), [medicationProfile]);
  const medicationProfileGapSummary = useMemo(() => buildMedicationProfileGapSummary(medicationProfile), [medicationProfile]);
  const medicationProfileHasUnresolved = useMemo(() => hasMedicationProfileUnresolvedEntries(medicationProfile), [medicationProfile]);
  const diagnosisProfileSummary = useMemo(() => buildDiagnosisProfileSummary(diagnosisProfile), [diagnosisProfile]);
  const diagnosisProfileHasUnresolved = useMemo(() => hasDiagnosisProfileUnresolvedEntries(diagnosisProfile), [diagnosisProfile]);
  const diagnosisCategoryQuickPicks = useMemo(() => listDiagnosisCategoryQuickPicks().slice(0, 8), []);
  const currentCheckpoint = generatedSession || draftCheckpoint;

  function persistDraftRecovery(snapshot: {
    draftId?: string;
    workflowStage: 'compose' | 'review';
    composeLane: DraftComposeLane;
    note?: string;
    sourceInput?: string;
    sectionReviewState?: DraftSession['sectionReviewState'];
  }) {
    const recoveryState = buildDraftRecoveryState({
      sourceInput: snapshot.sourceInput || sourceInput,
      note: snapshot.note ?? generatedSession?.note ?? draftCheckpoint?.note ?? '',
      sectionReviewState: snapshot.sectionReviewState ?? generatedSession?.sectionReviewState ?? draftCheckpoint?.sectionReviewState,
    }, {
      workflowStage: snapshot.workflowStage,
      composeLane: snapshot.composeLane,
      lastOpenedAt: new Date().toISOString(),
    });

    localStorage.setItem(draftRecoveryStorageKey, JSON.stringify({
      draftId: snapshot.draftId || generatedSession?.draftId || draftCheckpoint?.draftId || null,
      recoveryState,
    }));
  }
  const noteTypePresets = useMemo(() => presets.filter((preset) => preset.noteType === noteType), [noteType, presets]);
  const prioritizedWorkflowStarters = useMemo(() => {
    if (!activeProviderProfile) {
      return founderWorkflowStarters;
    }

    const preferredIds = new Set(activeProviderProfile.defaults.starterWorkflowIds);

    return [...founderWorkflowStarters].sort((left, right) => {
      const leftPreferred = preferredIds.has(left.id) ? 1 : 0;
      const rightPreferred = preferredIds.has(right.id) ? 1 : 0;

      if (leftPreferred !== rightPreferred) {
        return rightPreferred - leftPreferred;
      }

      return left.title.localeCompare(right.title);
    });
  }, [activeProviderProfile]);
  const supportOverviewItems = useMemo(
    () => ([
      {
        id: 'starters',
        label: 'Starters',
        value: `${prioritizedWorkflowStarters.length} available`,
      },
      {
        id: 'medications',
        label: 'Medication support',
        value: medicationProfile.length ? `${medicationProfile.length} entered` : 'None entered',
      },
      {
        id: 'diagnoses',
        label: 'Assessment support',
        value: diagnosisProfile.length ? `${diagnosisProfile.length} entered` : 'None entered',
      },
      {
        id: 'encounter',
        label: 'Encounter details',
        value: encounterSupportSummary.length ? `${encounterSupportSummary.length} added` : 'None added',
      },
    ]),
    [diagnosisProfile.length, encounterSupportSummary.length, medicationProfile.length, prioritizedWorkflowStarters.length],
  );
  const activeSupportPanels = useMemo(
    () => supportOverviewItems.filter((item) => item.value !== 'None entered' && item.value !== 'None added').length,
    [supportOverviewItems],
  );
  const sourceEntrySteps = useMemo<Array<{
    key: Exclude<SourceTabKey, 'all'>;
    label: string;
    shortLabel: string;
    description: string;
    tone: 'previsit' | 'live' | 'ambient' | 'addon';
  }>>(
    () => ([
      {
        key: 'intakeCollateral',
        label: 'Pre-Visit Data / Paste Source Here',
        shortLabel: 'Pre-Visit',
        description: 'Paste, type, upload, or dictate labs, vitals, nursing intake, referrals, prior notes, chart review, collateral, rating scales, scanned/OCR summaries, or copied raw EHR data here.',
        tone: 'previsit',
      },
      {
        key: 'clinicianNotes',
        label: 'Live Visit Notes',
        shortLabel: 'Live Visit',
        description: 'Type or dictate during the visit: HPI, observed behavior, MSE impressions, risk language, medication discussion, clinical reasoning, and plan thoughts.',
        tone: 'live',
      },
      {
        key: 'patientTranscript',
        label: 'Ambient Transcript',
        shortLabel: 'Ambient',
        description: 'Ambient listening lands here after consent, transcript review, and provider correction. You can also paste, type, or dictate dialogue, direct quotes, and spoken-session material here.',
        tone: 'ambient',
      },
      {
        key: 'objectiveData',
        label: 'Provider Add-On',
        shortLabel: 'Add-On',
        description: 'Type, paste, or dictate diagnosis/code preferences, named prompt instructions, preferred plan language, site-specific rules, discharge wording, or anything important that does not fit elsewhere.',
        tone: 'addon',
      },
    ]),
    [],
  );
  const manualSourceSteps = sourceEntrySteps;
  const dictationTargetSteps = sourceEntrySteps;
  const activeDictationTargetStep = dictationTargetSection
    ? dictationTargetSteps.find((step) => step.key === dictationTargetSection) || dictationTargetSteps[0]
    : dictationTargetSteps[0];
  const sourceCompletionCount = populatedSectionLabels.length;
  const sourceCompletionPercent = Math.round((sourceCompletionCount / sourceEntrySteps.length) * 100);
  const captureFlowGuides = SOURCE_CAPTURE_FLOW_GUIDES;
  const sourceModeCards = useMemo(
    () => ([
      {
        id: 'manual' as const,
        label: 'Source packet',
        detail: 'The four-field note workspace: pre-visit data, live visit notes, ambient transcript, and provider add-on.',
      },
      {
        id: 'dictation' as const,
        label: 'Dictation',
        detail: 'Provider-directed source capture with insertion review, owned by the dictation lane.',
      },
      {
        id: 'transcript' as const,
        label: 'Transcript',
        detail: 'Review spoken source, queued dictation segments, and transcript history in one calmer workspace.',
      },
    ]),
    [],
  );

  useEffect(() => {
    if (sourceWorkspaceMode === 'objective' && activeSourceTab !== 'objectiveData') {
      setActiveSourceTab('objectiveData');
    }
  }, [activeSourceTab, sourceWorkspaceMode]);
  const workspaceStageItems = useMemo(
    () => buildWorkspaceStageStatusItems({
      sourceCompletionCount,
      totalSourceSteps: sourceEntrySteps.length,
      hasCheckpoint: Boolean(draftCheckpoint?.sourceInput?.trim()),
      hasDraft: Boolean(generatedSession?.note?.trim()),
      workflowStage,
      activeComposeLane,
      assistantName: assistantPersona.name,
    }),
    [activeComposeLane, assistantPersona.name, draftCheckpoint?.sourceInput, generatedSession?.note, sourceCompletionCount, sourceEntrySteps.length, workflowStage],
  );
  const destinationConstraintActive = providerSettings.outputDestination !== 'Generic' || providerSettings.asciiSafe || providerSettings.paragraphOnly || providerSettings.wellskyFriendly;
  const composeNudges = useMemo(
    () => buildComposeNudges({
      noteType,
      sourceInput,
      sourceSections,
      sourceCompletionCount,
      requiresStandaloneMse: sectionPlan.requiresStandaloneMse,
      diagnosisProfileCount: diagnosisProfile.length,
      medicationProfileCount: medicationProfile.length,
      destinationConstraintActive,
      destinationLabel: getOutputDestinationMeta(providerSettings.outputDestination).summaryLabel,
      hasDraft: Boolean(generatedSession?.note?.trim()),
    }),
    [
      diagnosisProfile.length,
      destinationConstraintActive,
      generatedSession?.note,
      medicationProfile.length,
      noteType,
      providerSettings.outputDestination,
      sectionPlan.requiresStandaloneMse,
      sourceCompletionCount,
      sourceInput,
      sourceSections,
    ],
  );
  const sectionExpectationSignals = useMemo(
    () => buildSectionExpectationSignals({
      noteType,
      plannedSections: sectionPlan.sections,
      sourceSections,
      sourceInput,
      diagnosisProfileCount: diagnosisProfile.length,
      medicationProfileCount: medicationProfile.length,
    }),
    [diagnosisProfile.length, medicationProfile.length, noteType, sectionPlan.sections, sourceInput, sourceSections],
  );
  const rememberedWorkflowFacts = useMemo(
    () => assistantMemoryService.getRememberedFacts(resolvedProviderIdentityId).slice(0, 4),
    [
      lanePreferenceSuggestion,
      profilePromptPreferenceSuggestion,
      promptPreferenceSuggestion,
      resolvedProviderIdentityId,
      visibleOutputProfiles.length,
    ],
  );
  const promptStudioGoalOptions = useMemo(() => getPromptStudioGoalOptions(noteType), [noteType]);
  const providerPromptWarnings = useMemo(() => analyzeProviderPromptDraft(customInstructions), [customInstructions]);
  const assistantPromptDraftWarnings = useMemo(() => analyzeProviderPromptDraft(assistantPreferenceDraft), [assistantPreferenceDraft]);
  const composeReadinessItems = useMemo<StatusStripItem[]>(() => {
    const openAttentionCount = composeNudges.filter((item) => item.tone === 'warning' || item.tone === 'danger').length;

    return [
      {
        id: 'source-track',
        label: 'Source',
        value: sourceCompletionCount === sourceEntrySteps.length ? 'Ready' : sourceCompletionCount > 0 ? 'In progress' : 'Not started',
        tone: sourceCompletionCount === sourceEntrySteps.length ? 'success' : sourceCompletionCount > 0 ? 'info' : 'neutral',
      },
      {
        id: 'draft-track',
        label: 'Draft',
        value: generatedSession?.note?.trim() ? 'Generated' : draftCheckpoint?.sourceInput?.trim() ? 'Checkpoint saved' : 'Pending',
        tone: generatedSession?.note?.trim() ? 'success' : draftCheckpoint?.sourceInput?.trim() ? 'info' : 'neutral',
      },
      {
        id: 'attention-track',
        label: 'Attention',
        value: openAttentionCount ? `${openAttentionCount} item${openAttentionCount === 1 ? '' : 's'}` : 'On track',
        tone: openAttentionCount ? 'warning' : 'success',
      },
      {
        id: 'destination-track',
        label: 'Destination',
        value: destinationConstraintActive ? 'Constrained' : 'Flexible',
        tone: destinationConstraintActive ? 'info' : 'neutral',
      },
      {
        id: 'finish-track',
        label: 'Finish',
        value: generatedSession?.note?.trim() ? 'Review next' : 'Build source first',
        tone: generatedSession?.note?.trim() ? 'success' : 'neutral',
      },
    ];
  }, [
    composeNudges,
    destinationConstraintActive,
    draftCheckpoint?.sourceInput,
    generatedSession?.note,
    sourceCompletionCount,
    sourceEntrySteps.length,
  ]);
  const resumeStateSummary = useMemo(() => {
    if (generatedSession?.note?.trim()) {
      return `Resuming a live draft for ${generatedSession.noteType}. Review and finish stay in this same workspace.`;
    }

    if (draftCheckpoint?.sourceInput?.trim()) {
      return `A saved compose checkpoint is present${draftCheckpoint.lastSavedAt ? ` from ${formatRelativeCheckpointTime(draftCheckpoint.lastSavedAt)}` : ''}.`;
    }

    return 'No saved checkpoint is active. This workspace is ready for a fresh note.';
  }, [draftCheckpoint?.lastSavedAt, draftCheckpoint?.sourceInput, generatedSession?.note, generatedSession?.noteType]);
  const ambientResumeStatus = useMemo(() => {
    if (!ambientResumeSnapshot?.sessionId) {
      return null;
    }

    const lastUpdatedLabel = ambientResumeSnapshot.updatedAt
      ? formatRelativeCheckpointTime(ambientResumeSnapshot.updatedAt)
      : 'recently';
    const hasLiveAmbientContext = ambientSessionSummary.sessionState !== 'idle'
      || ambientSessionSummary.transcriptEventCount > 0
      || ambientSessionSummary.reviewFlagCount > 0;

    if (hasLiveAmbientContext) {
      return {
        title: 'Ambient encounter reattached',
        detail: `Resumed ${ambientResumeSnapshot.sessionState.replace(/_/g, ' ')} ambient work from ${lastUpdatedLabel}. Keep transcript review and speaker correction in this lane before trusting the note handoff.`,
      };
    }

    return {
      title: 'Ambient encounter available to resume',
      detail: `A saved ambient session from ${lastUpdatedLabel} is ready to reopen in this note workspace.`,
    };
  }, [ambientResumeSnapshot, ambientSessionSummary.reviewFlagCount, ambientSessionSummary.sessionState, ambientSessionSummary.transcriptEventCount]);

  useEffect(() => {
    async function hydratePresets() {
      const presetsStorageKey = getNotePresetsStorageKey(resolvedProviderIdentityId);
      const rawPresets = localStorage.getItem(presetsStorageKey);
      const localPresets = mergePresetCatalog(rawPresets ? JSON.parse(rawPresets) as NotePreset[] : []);
      setPresets(localPresets);

      try {
        const response = await fetch(`/api/presets?providerId=${encodeURIComponent(resolvedProviderIdentityId)}`, { cache: 'no-store' });
        const data = await response.json() as { presets?: NotePreset[] };
        const mergedPresets = mergePresetCatalog(data?.presets || localPresets);
        setPresets(mergedPresets);
        localStorage.setItem(presetsStorageKey, JSON.stringify(mergedPresets));
      } catch {
        // Local presets remain available if backend persistence is unavailable.
      }
    }

    void hydratePresets();
  }, [resolvedProviderIdentityId]);

  useEffect(() => {
    if (!hasClientHydrated) {
      return;
    }

    const raw = localStorage.getItem(ambientSessionResumeStorageKey);
    const parsed = parseAmbientResumeSnapshot(raw)
      || parseAmbientResumeSnapshot(localStorage.getItem(AMBIENT_RESUME_FALLBACK_STORAGE_KEY));

    if (!parsed) {
      if (raw) {
        localStorage.removeItem(ambientSessionResumeStorageKey);
      }
      localStorage.removeItem(AMBIENT_RESUME_FALLBACK_STORAGE_KEY);
      setAmbientResumeSnapshot(null);
      setAmbientResumeHydrated(true);
      return;
    }

    setAmbientResumeSnapshot(parsed);
    setAmbientResumeHydrated(true);
  }, [ambientSessionResumeStorageKey, hasClientHydrated]);

  useEffect(() => {
    let isActive = true;
    setDraftHydrationComplete(false);

    async function hydrateDraft() {
      try {
        if (requestedDraftId) {
          try {
          const response = await fetch(`/api/drafts/${encodeURIComponent(requestedDraftId)}?providerId=${encodeURIComponent(resolvedProviderIdentityId)}&includeArchived=true`, {
            cache: 'no-store',
          });
          const data = (await response.json()) as { draft?: PersistedDraftSession | null };
          const parsed = data?.draft;

          if (response.ok && parsed) {
            hydratedFromSavedStateRef.current = true;
            setSpecialty(parsed.specialty || 'Psychiatry');
            setRole(parsed.role || 'Psychiatric NP');
            setNoteType(parsed.noteType || 'Inpatient Psych Progress Note');
            setTemplate(parsed.template || 'Default Inpatient Psych Progress Note');
            setSourceSections(hydrateSectionsFromDraft(parsed));
            setEncounterSupport(normalizeEncounterSupport(parsed.encounterSupport, parsed.noteType || 'Inpatient Psych Progress Note'));
            setMedicationProfile(normalizeMedicationProfile(parsed.medicationProfile));
            setDiagnosisProfile(normalizeDiagnosisProfile(parsed.diagnosisProfile));
            setOutputStyle(parsed.outputStyle || 'Standard');
            setFormat(parsed.format || 'Labeled Sections');
            setFlagMissingInfo(parsed.flagMissingInfo ?? true);
            setKeepCloserToSource(parsed.keepCloserToSource ?? true);
            setOutputScope(parsed.outputScope || 'full-note');
            setRequestedSections(Array.isArray(parsed.requestedSections) ? parsed.requestedSections as NoteSectionKey[] : []);
            setDictationInsertions(parsed.dictationInsertions || {});
            setAmbientTranscriptHandoff(parsed.ambientTranscriptHandoff);
            setPresetName('');
            setDraftCheckpoint(parsed);
            setGeneratedSession(parsed.note ? parsed : null);
            setWorkflowStage(parsed.recoveryState?.workflowStage || 'compose');
            setActiveComposeLane(parsed.recoveryState?.composeLane || (parsed.note ? 'finish' : 'setup'));
            localStorage.setItem(draftSessionStorageKey, JSON.stringify(parsed));
            localStorage.setItem(draftRecoveryStorageKey, JSON.stringify({
              draftId: parsed.id,
              recoveryState: parsed.recoveryState,
            }));
            localStorage.setItem(draftStageStorageKey, parsed.recoveryState?.workflowStage || 'compose');
            setEvalBanner('Opened the originating draft from dictation history.');
            if (requestedDictationSessionId) {
              await fetch('/api/dictation/audit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  providerId: resolvedProviderIdentityId,
                  id: `dictation-resume-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                  eventName: 'dictation_draft_resumed',
                  eventDomain: 'frontend',
                  occurredAt: new Date().toISOString(),
                  encounterId: parsed.id || requestedDraftId,
                  noteId: parsed.id,
                  dictationSessionId: requestedDictationSessionId,
                  sttProvider: undefined,
                  mode: 'provider_dictation',
                  payload: {
                    source: 'dictation_history_dashboard',
                    resumedDraftId: parsed.id,
                  },
                  containsPhi: false,
                  retentionClass: 'audit_only',
                }),
              }).catch(() => {
                // Draft resume should still work even if audit logging is unavailable.
              });
            }
            await fetch(`/api/drafts/${encodeURIComponent(requestedDraftId)}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                providerId: resolvedProviderIdentityId,
                action: 'mark-opened',
                recoveryState: parsed.recoveryState,
              }),
            }).catch(() => {
              // Local resume still works if mark-opened fails.
            });
            return;
          }
          } catch {
            // Fall through to normal draft hydration if explicit resume fails.
          }
        }

        const pendingEvalCase = localStorage.getItem(EVAL_CASE_KEY);
        if (pendingEvalCase) {
          try {
          const parsed = JSON.parse(pendingEvalCase) as EvalCaseSelection;
          hydratedFromSavedStateRef.current = true;
          setSpecialty(parsed.specialty || 'Psychiatry');
          setRole(defaultRoleForSpecialty(parsed.specialty || 'Psychiatry'));
          setNoteType(parsed.noteType || 'Inpatient Psych Progress Note');
          setTemplate((templateOptionsByNoteType[parsed.noteType || ''] || [])[0] || 'Default Inpatient Psych Progress Note');
          setSourceSections({
            ...EMPTY_SOURCE_SECTIONS,
            clinicianNotes: parsed.sourceInput || sampleSourceInput,
          });
          setEncounterSupport(createEncounterSupportDefaults(parsed.noteType || 'Inpatient Psych Progress Note'));
          setMedicationProfile([]);
          setDiagnosisProfile([]);
          setOutputStyle('Standard');
          setFormat('Labeled Sections');
          setFlagMissingInfo(true);
          setKeepCloserToSource(true);
          setOutputScope('full-note');
          setRequestedSections([]);
          setPresetName('');
          setCustomInstructions('');
          setAmbientTranscriptHandoff(undefined);
          setGeneratedSession(null);
          setDraftCheckpoint(null);
          setWorkflowStage('compose');
          setActiveComposeLane('setup');
          setEvalBanner(`Loaded evaluation case: ${parsed.id} — ${parsed.title}`);
          localStorage.removeItem(EVAL_CASE_KEY);
            return;
          } catch {
            localStorage.removeItem(EVAL_CASE_KEY);
          }
        }

        const raw = localStorage.getItem(draftSessionStorageKey);

        if (raw) {
          try {
          const parsed = JSON.parse(raw) as DraftSession;

          if (parsed.providerIdentityId && parsed.providerIdentityId !== resolvedProviderIdentityId) {
            throw new Error('Mismatched provider draft session.');
          }

          const restoredSourceSections = hydrateSectionsFromDraft(parsed);
          const restoredSourceInput = buildSourceInputFromSections(restoredSourceSections);
          hydratedFromSavedStateRef.current = true;
          setSpecialty(parsed.specialty || 'Psychiatry');
          setRole(parsed.role || 'Psychiatric NP');
          setNoteType(parsed.noteType || 'Inpatient Psych Progress Note');
          setTemplate(parsed.template || 'Default Inpatient Psych Progress Note');
          setSourceSections(restoredSourceSections);
          setEncounterSupport(normalizeEncounterSupport(parsed.encounterSupport, parsed.noteType || 'Inpatient Psych Progress Note'));
          setMedicationProfile(normalizeMedicationProfile(parsed.medicationProfile));
          setDiagnosisProfile(normalizeDiagnosisProfile(parsed.diagnosisProfile));
          setOutputStyle(parsed.outputStyle || 'Standard');
          setFormat(parsed.format || 'Labeled Sections');
          setFlagMissingInfo(parsed.flagMissingInfo ?? true);
          setKeepCloserToSource(parsed.keepCloserToSource ?? true);
          setOutputScope(parsed.outputScope || 'full-note');
          setRequestedSections(Array.isArray(parsed.requestedSections) ? parsed.requestedSections as NoteSectionKey[] : []);
          setDictationInsertions(parsed.dictationInsertions || {});
          setAmbientTranscriptHandoff(parsed.ambientTranscriptHandoff);
          setPresetName('');
          setDraftCheckpoint(parsed);
          setGeneratedSession(parsed.note ? parsed : null);
          setWorkflowStage('compose');
          setActiveComposeLane(restoredSourceInput.trim() ? 'source' : 'setup');
            return;
          } catch {
            localStorage.removeItem(draftSessionStorageKey);
            localStorage.removeItem(draftRecoveryStorageKey);
          }
        }

        try {
          const response = await fetch(`/api/drafts/latest?providerId=${encodeURIComponent(resolvedProviderIdentityId)}`, { cache: 'no-store' });
          const data = (await response.json()) as { draft?: PersistedDraftSession | null };
          const parsed = data?.draft;

          if (!parsed) {
            return;
          }

          hydratedFromSavedStateRef.current = true;
          const restoredSourceSections = hydrateSectionsFromDraft(parsed);
          const restoredSourceInput = buildSourceInputFromSections(restoredSourceSections);
          setSpecialty(parsed.specialty || 'Psychiatry');
          setRole(parsed.role || 'Psychiatric NP');
          setNoteType(parsed.noteType || 'Inpatient Psych Progress Note');
          setTemplate(parsed.template || 'Default Inpatient Psych Progress Note');
          setSourceSections(restoredSourceSections);
          setEncounterSupport(normalizeEncounterSupport(parsed.encounterSupport, parsed.noteType || 'Inpatient Psych Progress Note'));
          setMedicationProfile(normalizeMedicationProfile(parsed.medicationProfile));
          setDiagnosisProfile(normalizeDiagnosisProfile(parsed.diagnosisProfile));
          setOutputStyle(parsed.outputStyle || 'Standard');
          setFormat(parsed.format || 'Labeled Sections');
          setFlagMissingInfo(parsed.flagMissingInfo ?? true);
          setKeepCloserToSource(parsed.keepCloserToSource ?? true);
          setOutputScope(parsed.outputScope || 'full-note');
          setRequestedSections(Array.isArray(parsed.requestedSections) ? parsed.requestedSections as NoteSectionKey[] : []);
          setDictationInsertions(parsed.dictationInsertions || {});
          setAmbientTranscriptHandoff(parsed.ambientTranscriptHandoff);
          setPresetName('');
          setDraftCheckpoint(parsed);
          setGeneratedSession(parsed.note ? parsed : null);
          setWorkflowStage('compose');
          setActiveComposeLane(restoredSourceInput.trim() ? 'source' : 'setup');
          localStorage.setItem(draftSessionStorageKey, JSON.stringify(parsed));
          localStorage.setItem(draftRecoveryStorageKey, JSON.stringify({
            draftId: parsed.id,
            recoveryState: parsed.recoveryState,
          }));
        } catch {
          // Keep the prototype usable even if backend draft restore is unavailable.
        }
      } finally {
        if (isActive) {
          setDraftHydrationComplete(true);
        }
      }
    }

    void hydrateDraft();
    return () => {
      isActive = false;
    };
  }, [draftRecoveryStorageKey, draftSessionStorageKey, draftStageStorageKey, requestedDictationSessionId, requestedDraftId, resolvedProviderIdentityId]);

  useEffect(() => {
    localStorage.setItem(draftStageStorageKey, workflowStage);
    persistDraftRecovery({
      workflowStage,
      composeLane: activeComposeLane,
    });
  }, [activeComposeLane, draftStageStorageKey, workflowStage]);

  useEffect(() => {
    setDictationSession((current) => updateDictationTarget(current, dictationTargetSection));
  }, [dictationTargetSection]);

  useEffect(() => {
    if (workflowStage !== 'compose') {
      return;
    }

    if (!sourceInput.trim()) {
      setDraftCheckpointStatus('idle');
      return;
    }

    const nextCheckpoint: DraftSession = {
      draftId: draftCheckpoint?.draftId,
      draftVersion: draftCheckpoint?.draftVersion,
      providerIdentityId: resolvedProviderIdentityId,
      lastSavedAt: draftCheckpoint?.lastSavedAt,
      specialty,
      role,
      noteType,
      template,
      outputStyle,
      format,
      keepCloserToSource,
      flagMissingInfo,
      outputScope,
      requestedSections,
      selectedPresetId,
      presetName,
      customInstructions,
      encounterSupport,
      medicationProfile,
      diagnosisProfile,
      sourceInput,
      sourceSections,
      ambientTranscriptHandoff,
      dictationInsertions,
      note: '',
      flags: [],
      copilotSuggestions: [],
      sectionReviewState: undefined,
      recoveryState: buildDraftRecoveryState({
        sourceInput,
        note: '',
        sectionReviewState: undefined,
      }, {
        workflowStage: 'compose',
        composeLane: activeComposeLane,
      }),
      mode: 'live',
    };

    const nextFingerprint = JSON.stringify({
      specialty,
      role,
      noteType,
      template,
      outputStyle,
      format,
      keepCloserToSource,
      flagMissingInfo,
      outputScope,
      requestedSections,
      selectedPresetId,
      presetName,
      customInstructions,
      encounterSupport,
      medicationProfile,
      diagnosisProfile,
      sourceInput,
      sourceSections,
      ambientTranscriptHandoff,
      dictationInsertions,
      composeLane: activeComposeLane,
    });
    const currentFingerprint = draftCheckpoint
      ? JSON.stringify({
          specialty: draftCheckpoint.specialty,
          role: draftCheckpoint.role,
          noteType: draftCheckpoint.noteType,
          template: draftCheckpoint.template,
          outputStyle: draftCheckpoint.outputStyle,
          format: draftCheckpoint.format,
          keepCloserToSource: draftCheckpoint.keepCloserToSource,
          flagMissingInfo: draftCheckpoint.flagMissingInfo,
          outputScope: draftCheckpoint.outputScope,
          requestedSections: draftCheckpoint.requestedSections,
          selectedPresetId: draftCheckpoint.selectedPresetId,
          presetName: draftCheckpoint.presetName,
          customInstructions: draftCheckpoint.customInstructions,
          encounterSupport: draftCheckpoint.encounterSupport,
          medicationProfile: draftCheckpoint.medicationProfile,
          diagnosisProfile: draftCheckpoint.diagnosisProfile,
          sourceInput: draftCheckpoint.sourceInput,
          sourceSections: draftCheckpoint.sourceSections,
          ambientTranscriptHandoff: draftCheckpoint.ambientTranscriptHandoff,
          dictationInsertions: draftCheckpoint.dictationInsertions,
          composeLane: draftCheckpoint.recoveryState?.composeLane || 'source',
        })
      : null;

    if (currentFingerprint === nextFingerprint) {
      return;
    }

    localStorage.setItem(draftSessionStorageKey, JSON.stringify(nextCheckpoint));
    persistDraftRecovery({
      draftId: nextCheckpoint.draftId,
      workflowStage: 'compose',
      composeLane: activeComposeLane,
      sourceInput,
    });
    setDraftCheckpoint(nextCheckpoint);
    setDraftCheckpointStatus('saving');

    const timeout = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch('/api/drafts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...nextCheckpoint,
              providerId: resolvedProviderIdentityId,
            }),
          });

          if (!response.ok) {
            throw new Error('Unable to save draft checkpoint.');
          }

          const data = await response.json() as { draft?: PersistedDraftSession };
          const savedDraft = data.draft;
          if (savedDraft) {
            setDraftCheckpoint(savedDraft);
            localStorage.setItem(draftSessionStorageKey, JSON.stringify(savedDraft));
            localStorage.setItem(draftRecoveryStorageKey, JSON.stringify({
              draftId: savedDraft.id,
              recoveryState: savedDraft.recoveryState,
            }));
          }
          setDraftCheckpointStatus('saved');
        } catch {
          setDraftCheckpointStatus('error');
        }
      })();
    }, 1200);

    return () => window.clearTimeout(timeout);
  }, [
    activeComposeLane,
    ambientTranscriptHandoff,
    customInstructions,
    diagnosisProfile,
    dictationInsertions,
    draftCheckpoint,
    draftRecoveryStorageKey,
    draftSessionStorageKey,
    encounterSupport,
    flagMissingInfo,
    format,
    keepCloserToSource,
    medicationProfile,
    noteType,
    outputScope,
    outputStyle,
    presetName,
    requestedSections,
    resolvedProviderIdentityId,
    role,
    selectedPresetId,
    sourceInput,
    sourceSections,
    specialty,
    template,
    workflowStage,
  ]);

  useEffect(() => {
    let isActive = true;
    const controller = new AbortController();

    function applyHydratedSettings(nextSettings: ProviderSettings) {
      if (!isActive) {
        return;
      }

      setProviderSettings(nextSettings);
      const activeProfile = findProviderProfile(nextSettings.providerProfileId);
      if (activeProfile && !hydratedFromSavedStateRef.current && !providerProfileAppliedRef.current) {
        const preferredNoteType = preferredNoteTypeForProfile(activeProfile.id);
        if (preferredNoteType) {
          const nextSpecialty = specialtyForNoteType(preferredNoteType);
          setSpecialty(nextSpecialty);
          setRole(activeProfile.defaults.roleDefault || defaultRoleForSpecialty(nextSpecialty));
          setNoteType(preferredNoteType);
          setTemplate((templateOptionsByNoteType[preferredNoteType] || [])[0] || '');
          setOutputStyle(activeProfile.defaults.preferredOutputStyle);
          providerProfileAppliedRef.current = true;
        }
      }
      setKeepCloserToSource(nextSettings.closerToSourceDefault);
      setFormat(nextSettings.paragraphOnly ? 'Paragraph Style' : 'Labeled Sections');
    }

    async function hydrateProviderSettings() {
      const cached = readCachedProviderSettings(resolvedProviderIdentityId);
      if (cached) {
        applyHydratedSettings(cached);
      }

      try {
        const merged = await fetchProviderSettingsFromServer(resolvedProviderIdentityId, controller.signal);
        writeCachedProviderSettings(resolvedProviderIdentityId, merged);
        applyHydratedSettings(merged);
      } catch {
        if (!cached) {
          // Fall back to local defaults if server-backed settings are unavailable.
          applyHydratedSettings(DEFAULT_PROVIDER_SETTINGS);
        }
      }
    }

    void hydrateProviderSettings();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [resolvedProviderIdentityId]);

  useEffect(() => {
    const nextNoteTypeOptions = noteTypeOptionsBySpecialty[specialty] || [];
    if (!nextNoteTypeOptions.includes(noteType)) {
      const nextNoteType = nextNoteTypeOptions[0] || '';
      setNoteType(nextNoteType);
      const nextTemplates = templateOptionsByNoteType[nextNoteType] || [];
      setTemplate(nextTemplates[0] || '');
    }
  }, [specialty, noteType]);

  useEffect(() => {
    const nextTemplateOptions = templateOptionsByNoteType[noteType] || [];
    if (!nextTemplateOptions.includes(template)) {
      setTemplate(nextTemplateOptions[0] || '');
    }
  }, [noteType, template]);

  useEffect(() => {
    setEncounterSupport((current) => normalizeEncounterSupport(current, noteType));
  }, [noteType]);

  useEffect(() => {
    if (!presets.length) {
      return;
    }

    const preset = findPresetForNoteType(presets, noteType);
    if (!preset) {
      return;
    }

    setSelectedPresetId(preset.id);
    setPresetName(preset.name);
    setOutputScope(preset.outputScope);
    setRequestedSections(preset.requestedSections);
    setOutputStyle(preset.outputStyle);
    setFormat(preset.format);
    setKeepCloserToSource(preset.keepCloserToSource);
    setFlagMissingInfo(preset.flagMissingInfo);
    setCustomInstructions(preset.customInstructions || '');
  }, [noteType, presets]);

  useEffect(() => {
    setLanePreferenceSuggestion(getLanePreferenceSuggestion(noteType, resolvedProviderIdentityId));
  }, [noteType, resolvedProviderIdentityId]);

  useEffect(() => {
    setPromptPreferenceSuggestion(getPromptPreferenceSuggestion(noteType, resolvedProviderIdentityId));
  }, [noteType, resolvedProviderIdentityId]);

  useEffect(() => {
    setProfilePromptPreferenceSuggestion(
      assistantMemoryService.getProfilePromptSuggestion(providerSettings.providerProfileId, resolvedProviderIdentityId),
    );
  }, [providerSettings.providerProfileId, noteType, resolvedProviderIdentityId]);

  useEffect(() => {
    let isMounted = true;

    async function hydrateLearning() {
      try {
        await assistantMemoryService.hydrateLearning(resolvedProviderIdentityId);
        if (!isMounted) {
          return;
        }
        setLanePreferenceSuggestion(getLanePreferenceSuggestion(noteType, resolvedProviderIdentityId));
        setPromptPreferenceSuggestion(getPromptPreferenceSuggestion(noteType, resolvedProviderIdentityId));
        setProfilePromptPreferenceSuggestion(
          assistantMemoryService.getProfilePromptSuggestion(providerSettings.providerProfileId, resolvedProviderIdentityId),
        );
      } catch {
        // Keep local provider-scoped Atlas memory available if backend hydration fails.
      }
    }

    void hydrateLearning();

    return () => {
      isMounted = false;
    };
  }, [noteType, providerSettings.providerProfileId, resolvedProviderIdentityId]);

  useEffect(() => {
    publishAssistantContext({
      stage: workflowStage,
      userAiName: assistantPersona.name,
      userAiRole: assistantPersona.role,
      userAiAvatar: assistantPersona.avatar,
      activeSourceMode: sourceWorkspaceMode,
      noteType: workflowStage === 'review' && generatedSession ? generatedSession.noteType : noteType,
      specialty: workflowStage === 'review' && generatedSession ? generatedSession.specialty : specialty,
      currentDraftText: workflowStage === 'review' && generatedSession?.note ? generatedSession.note.slice(0, 4000) : undefined,
      currentDraftWordCount: workflowStage === 'review' && generatedSession?.note ? countWords(generatedSession.note) : undefined,
      currentDraftSectionHeadings: workflowStage === 'review' && generatedSession?.note
        ? parseDraftSections(generatedSession.note).map((section) => section.heading).slice(0, 12)
        : undefined,
      providerProfileId: providerSettings.providerProfileId,
      providerProfileName: activeProviderProfile?.name,
      providerAddressingName: resolveVeraAddress(providerSettings, activeProviderProfile?.name),
      veraInteractionStyle: providerSettings.veraInteractionStyle,
      veraProactivityLevel: providerSettings.veraProactivityLevel,
      veraMemoryNotes: providerSettings.veraMemoryNotes,
      outputDestination: providerSettings.outputDestination,
      customInstructions,
      presetName,
      selectedPresetId,
      ambientSessionState: ambientSessionSummary.sessionState,
      ambientTranscriptEventCount: ambientSessionSummary.transcriptEventCount,
      ambientReviewFlagCount: ambientSessionSummary.reviewFlagCount,
      ambientUnresolvedSpeakerTurnCount: ambientSessionSummary.unresolvedSpeakerTurnCount,
      ambientTranscriptReadyForSource: ambientSessionSummary.transcriptReadyForSource,
    });
  }, [
    ambientSessionSummary.reviewFlagCount,
    ambientSessionSummary.sessionState,
    ambientSessionSummary.transcriptEventCount,
    ambientSessionSummary.transcriptReadyForSource,
    ambientSessionSummary.unresolvedSpeakerTurnCount,
    customInstructions,
    generatedSession,
    noteType,
    presetName,
    assistantPersona.avatar,
    assistantPersona.name,
    assistantPersona.role,
    providerSettings.providerProfileId,
    providerSettings.veraInteractionStyle,
    providerSettings.veraMemoryNotes,
    providerSettings.veraProactivityLevel,
    providerSettings.outputDestination,
    selectedPresetId,
    sourceWorkspaceMode,
    specialty,
    workflowStage,
    activeProviderProfile,
  ]);

  useEffect(() => {
    function handleAssistantAction(event: Event) {
      const nextEvent = event as CustomEvent<{
        type: 'replace-preferences' | 'append-preferences' | 'create-preset-draft';
        instructions: string;
        presetName?: string;
      }>;

      if (workflowStage !== 'compose') {
        return;
      }

      const { type, instructions, presetName: nextPresetName } = nextEvent.detail;

      if (type === 'replace-preferences') {
        setCustomInstructions(instructions.trim());
        return;
      }

      if (type === 'append-preferences') {
        setCustomInstructions((current) => (
          current.trim() ? `${current.trim()}\n\n${instructions.trim()}` : instructions.trim()
        ));
        return;
      }

      setSelectedPresetId('');
      setPresetName(nextPresetName?.trim() || `${noteType} ${assistantPersona.name} Preset`);
      setCustomInstructions(instructions.trim());
    }

    window.addEventListener(ASSISTANT_ACTION_EVENT, handleAssistantAction);
    return () => window.removeEventListener(ASSISTANT_ACTION_EVENT, handleAssistantAction);
  }, [assistantPersona.name, noteType, workflowStage]);

  useEffect(() => {
    if (workflowStage !== 'compose') {
      return;
    }

    const raw = localStorage.getItem(assistantPendingActionStorageKey);

    if (!raw) {
      return;
    }

    try {
      const pending = JSON.parse(raw) as {
        type: 'replace-preferences' | 'append-preferences' | 'create-preset-draft';
        instructions: string;
        presetName?: string;
      };

      if (pending.type === 'replace-preferences') {
        setCustomInstructions(pending.instructions.trim());
      } else if (pending.type === 'append-preferences') {
        setCustomInstructions((current) => (
          current.trim() ? `${current.trim()}\n\n${pending.instructions.trim()}` : pending.instructions.trim()
        ));
      } else {
        setSelectedPresetId('');
        setPresetName(pending.presetName?.trim() || `${noteType} ${assistantPersona.name} Preset`);
        setCustomInstructions(pending.instructions.trim());
      }
    } catch {
      // Ignore malformed pending assistant actions.
    } finally {
      localStorage.removeItem(assistantPendingActionStorageKey);
    }
  }, [assistantPendingActionStorageKey, assistantPersona.name, noteType, workflowStage]);

  function updateSourceSection<K extends keyof SourceSections>(key: K, value: SourceSections[K]) {
    setSourceSections((current) => ({ ...current, [key]: value }));
  }

  function handleSourceWorkspaceModeChange(mode: SourceWorkspaceMode) {
    setSourceWorkspaceMode(mode);

    if (mode === 'dictation') {
      setDictationTargetManuallySelected(false);
      setActiveSourceTab(DEFAULT_DICTATION_SOURCE_LANE);
    }

    if (mode === 'objective') {
      setActiveSourceTab('objectiveData');
    }
  }

  function handleAmbientTranscriptCommit(text: string, mode: 'replace' | 'append') {
    const trimmedText = text.trim();
    if (!trimmedText) {
      setEvalBanner('Ambient transcript is still empty. Record and review before loading it into source.');
      return;
    }

    setSourceSections((current) => {
      const existing = current.patientTranscript.trim();
      const nextValue = mode === 'append' && existing
        ? `${existing}\n\n${trimmedText}`
        : trimmedText;

      return {
        ...current,
        patientTranscript: nextValue,
      };
    });
    setAmbientTranscriptHandoff({
      sourceSection: 'patientTranscript',
      sourceMode: 'ambient_transcript',
      committedAt: new Date().toISOString(),
      sessionState: ambientSessionSummary.sessionState,
      transcriptEventCount: ambientSessionSummary.transcriptEventCount,
      reviewFlagCount: ambientSessionSummary.reviewFlagCount,
      unresolvedSpeakerTurnCount: ambientSessionSummary.unresolvedSpeakerTurnCount,
      transcriptReadyForSource: ambientSessionSummary.transcriptReadyForSource,
    });
    setActiveSourceTab('patientTranscript');
    setSourceWorkspaceMode('manual');
    setEvalBanner(
      mode === 'append'
        ? 'Appended the reviewed ambient transcript to the Ambient Transcript source box.'
        : 'Loaded the reviewed ambient transcript into the Ambient Transcript source box.',
    );
  }

  function handleReviewedDocumentSourceCommit(sourceBlock: string) {
    const trimmedSourceBlock = sourceBlock.trim();

    if (!trimmedSourceBlock) {
      setEvalBanner('Document source is empty. Review OCR text or a summary before loading it into source.');
      return;
    }

    setSourceSections((current) => {
      const existing = current.intakeCollateral.trim();

      return {
        ...current,
        intakeCollateral: existing ? `${existing}\n\n${trimmedSourceBlock}` : trimmedSourceBlock,
      };
    });
    setActiveComposeLane('source');
    setActiveSourceTab('intakeCollateral');
    setSourceWorkspaceMode('manual');
    setEvalBanner('Loaded reviewed document text into Pre-Visit Data. Review it there before generating a draft.');

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const target = document.getElementById('source-field-intakeCollateral');
        target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
  }

  async function ensureServerDictationSession(targetSection: DictationTargetSection) {
    if (isServerDictationSessionId(dictationSession.sessionId) && dictationSession.uiState !== 'stopped') {
      return dictationSession.sessionId;
    }

    const response = await fetch('/api/dictation/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerId: resolvedProviderIdentityId,
        encounterId: draftCheckpoint?.draftId || 'new-note-encounter',
        noteId: draftCheckpoint?.draftId,
        targetSection,
        mode: 'provider_dictation',
        sttProvider: dictationRequestedProviderId,
        language: 'en',
        vocabularyHints: buildVoiceVocabularyHints(providerSettings.dictationVoiceProfile),
        commitMode: 'manual_accept',
        allowMockFallback: dictationAllowMockFallback,
      }),
    });

    const payload = await response.json() as {
      error?: string;
      session?: {
        sessionId: string;
        provider?: string;
        requestedProvider?: string;
        activeProviderLabel?: string;
        engineLabel?: string;
        fallbackApplied?: boolean;
        fallbackReason?: string;
        reason?: string;
      };
    };

    if (!response.ok || !payload.session?.sessionId) {
      throw new Error(payload.error || 'Unable to start the dictation session.');
    }

    setDictationSession((current) => ({
      ...createLocalDictationSession({ targetSection, sessionId: payload.session!.sessionId }),
      insertedSegments: current.insertedSegments,
      uiState: 'listening',
      startedAt: new Date().toISOString(),
    }));
    setDictationProviderLabel(formatDictationProviderRuntimeLabel({
      providerLabel: payload.session.activeProviderLabel || formatDictationProviderLabel(payload.session.provider),
      engineLabel: payload.session.engineLabel,
      fallbackApplied: payload.session.fallbackApplied,
    }));
    if (payload.session.requestedProvider) {
      setDictationRequestedProviderId(payload.session.requestedProvider);
    }
    setDictationProviderNote(payload.session.fallbackReason || payload.session.reason || 'Backend provider session is active.');
    setDictationBackendStatus(formatDictationBackendStatusLabel({
      status: 'active',
      fallbackApplied: payload.session.fallbackApplied,
    }));
    setDictationQueuedEventCount(0);
    setDictationTransportLabel('connecting live stream');
    setDictationAuditEvents([]);
    setSelectedDictationHistorySessionId(payload.session.sessionId);
    setSelectedDictationHistoryEvents([]);
    setSelectedDictationHistoryLoading(true);

    return payload.session.sessionId;
  }

  async function handleStartDictation() {
    if (!dictationTargetSection) {
      setEvalBanner('Dictation is available only for clinician notes, intake or collateral, and patient conversation.');
      return;
    }

    setDictationSession((current) => ({
      ...current,
      pendingSegments: current.pendingSegments.filter((segment) => isMeaningfulDictationTranscriptText(segment.text)),
    }));

    try {
      setDictationRequestingPermission(true);
      setDictationCaptureError('');
      setDictationUploadStatus('requesting microphone permission');
      setDictationTechnicalStatus('');

      if (dictationMediaStreamRef.current) {
        setBrowserDictationStreamPaused(dictationMediaStreamRef.current, false);
        resumeBrowserRecorder();
      } else {
        const stream = await requestBrowserDictationStream(
          typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined,
          { secureContext: typeof window !== 'undefined' ? window.isSecureContext : undefined },
        );
        dictationMediaStreamRef.current = stream;
      }

      setDictationHasStream(Boolean(dictationMediaStreamRef.current));
      setDictationCapturePaused(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to access the microphone.';
      setDictationCaptureError(message);
      setDictationUploadStatus(message);
      setDictationTechnicalStatus('');
      setDictationRequestingPermission(false);
      setDictationSession((current) => setLocalDictationUiState(current, 'permission_needed', message));
      setError(message);
      return;
    } finally {
      setDictationRequestingPermission(false);
    }

    const sessionId = await ensureServerDictationSession(dictationTargetSection);
    setDictationSession((current) => setLocalDictationUiState(current, 'listening'));
    if (dictationMediaStreamRef.current) {
      startBrowserRecorder(dictationMediaStreamRef.current, sessionId);
    }
    setEvalBanner('Microphone is live. Dictation is now running through the backend session bridge.');
  }

  async function handlePauseDictation() {
    if (!dictationSession.sessionId) {
      return;
    }

    setBrowserDictationStreamPaused(dictationMediaStreamRef.current, true);
    pauseBrowserRecorder();
    setDictationCapturePaused(true);
    setDictationSession((current) => setLocalDictationUiState(current, 'paused'));
  }

  async function handleStopDictation(options?: { insertAfterStop?: boolean }) {
    const activeSessionId = dictationSession.sessionId;
    let queuedFinalTranscriptCount = 0;
    let finalSegments: TranscriptSegment[] = [];
    if (activeSessionId && isServerDictationSessionId(activeSessionId)) {
      const finalUploadResult = await uploadCurrentBrowserRecording(activeSessionId, { final: true }).catch((err) => {
        const message = err instanceof Error ? err.message : 'Unable to finalize dictation audio.';
        setDictationCaptureError(message);
        setError(message);
        return undefined;
      });
      queuedFinalTranscriptCount = finalUploadResult?.queuedFinalCount || 0;
      finalSegments = finalUploadResult?.finalSegments || [];
    }

    closeDictationEventStream();
    if (activeSessionId) {
      await fetch(`/api/dictation/sessions/${encodeURIComponent(activeSessionId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: resolvedProviderIdentityId,
          action: 'stop',
          reason: 'provider_stopped',
        }),
      }).catch(() => {
        // Keep local teardown even if server cleanup fails.
      });
    }
    stopBrowserRecorder();
    stopBrowserDictationStream(dictationMediaStreamRef.current);
    dictationMediaStreamRef.current = null;
    setDictationHasStream(false);
    setDictationCapturePaused(false);
    setDictationRequestingPermission(false);
    setDictationCaptureError('');
    setDictationUploadStatus(queuedFinalTranscriptCount > 0 ? 'transcript ready for review' : 'stopped');
    setDictationTechnicalStatus(queuedFinalTranscriptCount > 0
      ? 'Complete recording transcribed. Review and edit the transcript before inserting it.'
      : 'Recording stopped. No complete transcript was returned.');
    dictationChunkSequenceRef.current = 0;
    setDictationBackendStatus('stopped');
    setDictationQueuedEventCount(0);
    setDictationTransportLabel('polling standby');
    setSelectedDictationHistoryLoading(false);
    setDictationSession((current) => setLocalDictationUiState(
      current,
      queuedFinalTranscriptCount > 0 || current.pendingSegments.length > 0 ? 'final_ready' : 'stopped',
    ));

    if (options?.insertAfterStop && finalSegments[0]) {
      await insertDictationSegment(finalSegments[0], finalSegments[0].text);
    } else if (options?.insertAfterStop) {
      setDictationTechnicalStatus('Stop & Insert could not insert because no complete transcript was returned.');
    }
  }

  async function handleStopAndInsertDictation() {
    setDictationUploadStatus('uploading audio');
    setDictationTechnicalStatus('Stopping and preparing to insert the final transcript.');
    await handleStopDictation({ insertAfterStop: true });
  }

  async function handleQueueMockUtterance() {
    if (!dictationTargetSection) {
      setEvalBanner('Pick a supported source section before queueing dictation.');
      return;
    }

    try {
      const sessionId = await ensureServerDictationSession(dictationTargetSection);
      setDictationSession((current) => setLocalDictationUiState(current, 'listening'));
      const response = await fetch(`/api/dictation/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: resolvedProviderIdentityId,
          action: 'mock_utterance',
          transcriptText: dictationMockDraft.trim(),
        }),
      });
      const payload = await response.json() as {
        error?: string;
        queued?: {
          queuedEventCount: number;
        };
      };

      if (!response.ok || !payload.queued) {
        throw new Error(payload.error || 'Unable to process the mock utterance.');
      }
      setDictationQueuedEventCount(payload.queued.queuedEventCount || 0);
      await pullDictationTranscriptEvents(sessionId);
      setDictationMockDraft('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to process the mock utterance.';
      setError(message);
      setDictationSession((current) => setLocalDictationUiState(current, 'error', message));
    }
  }

  async function insertDictationSegment(segment: TranscriptSegment, editedText?: string) {
    const normalizedEditedText = (editedText ?? editedDictationSegments[segment.id] ?? segment.text).trim();
    const providerEdited = normalizedEditedText !== segment.text.trim();
    const segmentWithProviderText = {
      ...segment,
      text: normalizedEditedText || segment.text,
      normalizedText: normalizedEditedText || segment.text,
    };
    const commandMatch = resolveDictationCommandMatch(segmentWithProviderText.text, effectiveDictationCommands);
    const segmentToInsert = commandMatch?.outputText
      ? {
          ...segmentWithProviderText,
          text: commandMatch.outputText,
          normalizedText: commandMatch.outputText,
        }
      : segmentWithProviderText;

    try {
      const result = await dictationAdapter.insertFinalSegment(segmentToInsert);
      setDictationSession((current) => markSegmentInserted({
        ...current,
        pendingSegments: [segmentToInsert],
        interimSegment: undefined,
      }, segment.id, result.transactionId));
      setEditedDictationSegments({});
      setDictationUploadStatus(`Inserted into ${dictationTargetShortLabel}`);
      setDictationTechnicalStatus('');
      setDictationDebugSnapshot((current) => ({
        ...current,
        insertedTranscript: segmentToInsert.text,
      }));
      setDictationAuditEvents((current) => mergeDictationAuditEvents(current, [createClientDictationAuditEvent({
        sessionId: dictationSession.sessionId,
        encounterId: generatedSession?.draftId || 'new-note-compose',
        actorUserId: resolvedProviderIdentityId,
        sttProvider: dictationProviderLabel,
        eventName: 'dictation_segment_inserted',
        eventDomain: 'editor',
        payload: {
          targetSection: segment.targetSection,
          transactionId: result.transactionId,
          commandId: commandMatch?.commandId,
          commandApplied: Boolean(commandMatch?.outputText),
          providerEdited,
          originalText: providerEdited ? segment.text : undefined,
        },
      })]));
      const targetLabel = segment.targetSection && isDictationTargetSection(segment.targetSection as SourceTabKey)
        ? DICTATION_TARGET_LABELS[segment.targetSection as DictationTargetSection]
        : 'source section';
      setEvalBanner(commandMatch?.outputText
        ? `Applied ${commandMatch.label.toLowerCase()} and inserted it into ${targetLabel}.`
        : `Inserted dictated text into ${targetLabel}.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to insert dictated text.';
      setError(message);
      setDictationSession((current) => setLocalDictationUiState(current, 'error', message));
    }
  }

  async function handleAcceptDictationSegment(segmentId: string, editedText?: string) {
    const segment = dictationSession.pendingSegments.find((item) => item.id === segmentId);
    if (!segment) {
      return;
    }

    await insertDictationSegment(segment, editedText);
  }

  async function handleSaveDictationCommands(commands: ProviderSettings['dictationCommands']) {
    const nextSettings = {
      ...providerSettings,
      dictationCommands: commands,
    };

    setProviderSettings(nextSettings);
    await persistProviderSettings(nextSettings);
    setEvalBanner('Saved dictation command library.');
  }

  async function handleVoiceGuideAction() {
    const nextSettings = {
      ...providerSettings,
      dictationVoiceProfile: {
        ...providerSettings.dictationVoiceProfile,
        baselineCompletedAt: new Date().toISOString(),
      },
    };

    setProviderSettings(nextSettings);
    await persistProviderSettings(nextSettings);
    setEvalBanner(
      dictationVoiceGuide.needsAttention
        ? 'Saved the current voice check so dictation can start from a calibrated baseline.'
        : 'Refreshed the voice check marker for this provider.',
    );
  }

  function handleDiscardDictationSegment(segmentId: string) {
    setDictationSession((current) => discardPendingSegment(current, segmentId));
    setEditedDictationSegments((current) => {
      const next = { ...current };
      delete next[segmentId];
      return next;
    });
    setDictationUploadStatus('Ready');
  }

  function handleReturnToCompose() {
    setWorkflowStage('compose');
    setActiveComposeLane('source');
    composeWorkspaceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function registerComposeSection(sectionId: string) {
    return function setComposeSectionNode(node: HTMLDivElement | null) {
      composeSectionRefs.current[sectionId] = node;
    };
  }

  function scrollToDraftControls() {
    setWorkflowStage('compose');
    setActiveComposeLane('finish');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollToWorkspaceActiveLaneTop();
      });
    });
  }

  function scrollToWorkspaceActiveLaneTop() {
    const target = document.getElementById('workspace-active-lane-top') || composeWorkspaceRef.current;
    if (!target) {
      return;
    }

    const targetTop = window.scrollY + target.getBoundingClientRect().top;
    const nextTop = Math.max(0, Math.min(targetTop - 96, 160));
    window.scrollTo({ top: nextTop, left: 0, behavior: 'smooth' });
  }

  function scrollToElementWhenReady(
    targetId: string,
    options: ScrollIntoViewOptions = { behavior: 'smooth', block: 'start' },
    onReady?: (target: HTMLElement) => void,
    attemptsRemaining = 10,
  ) {
    const target = document.getElementById(targetId);

    if (target) {
      onReady?.(target);
      target.scrollIntoView(options);
      return;
    }

    if (attemptsRemaining <= 0) {
      return;
    }

    window.setTimeout(() => {
      scrollToElementWhenReady(targetId, options, onReady, attemptsRemaining - 1);
    }, 80);
  }

  function scrollToOutputPreferences() {
    setWorkflowStage('compose');
    setActiveComposeLane('finish');
    flashJumpHighlight('output-preferences');
    if (outputPreferencesDetailsRef.current) {
      outputPreferencesDetailsRef.current.open = true;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.setTimeout(() => {
          document.getElementById('output-preferences-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 40);
      });
    });
  }

  function scrollToMyNotePrompt() {
    setWorkflowStage('compose');
    setActiveComposeLane('finish');
    flashJumpHighlight('output-preferences');
    setEvalBanner(`My Note Prompt is where reusable instructions for ${noteType} live. These instructions guide generation along with the patient source packet.`);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollToElementWhenReady(
          'my-note-prompt-panel',
          { behavior: 'smooth', block: 'start' },
          (target) => {
            if (outputPreferencesDetailsRef.current) {
              outputPreferencesDetailsRef.current.open = true;
            }
            target.querySelector<HTMLElement>('input, textarea')?.focus({ preventScroll: true });
          },
          14,
        );
      });
    });
  }

  function focusAfterScroll<T extends HTMLElement>(target: T | null) {
    if (!target) {
      return;
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.setTimeout(() => {
          target.focus({ preventScroll: true });
        }, 120);
      });
    });
  }

  function flashJumpHighlight(target: 'setup' | 'output-preferences' | 'site-presets') {
    setJumpHighlightTarget(target);
    if (jumpHighlightTimeoutRef.current) {
      clearTimeout(jumpHighlightTimeoutRef.current);
    }
    jumpHighlightTimeoutRef.current = setTimeout(() => {
      setJumpHighlightTarget((current) => (current === target ? null : current));
      jumpHighlightTimeoutRef.current = null;
    }, 1800);
  }

  function scrollToNoteLaneSetup() {
    scrollToComposeLane('setup');
    flashJumpHighlight('setup');
    focusAfterScroll(noteTypeSelectRef.current || specialtySelectRef.current || roleSelectRef.current || templateSelectRef.current);
  }

  function scrollToSitePresetPreferences() {
    scrollToOutputPreferences();
    flashJumpHighlight('site-presets');
    focusAfterScroll(activeOutputProfileSelectRef.current || outputProfileNameInputRef.current);
  }

  function openProviderStartChoice(target: 'role' | 'specialty' | 'destination' | 'note-type') {
    if (target === 'destination') {
      setSessionSnapshotPanel('destination-fit');
      scrollToSitePresetPreferences();
      return;
    }

    setSessionSnapshotPanel('setup');
    scrollToComposeLane('setup');
    flashJumpHighlight('setup');

    const focusTargetByChoice = {
      role: roleSelectRef.current,
      specialty: specialtySelectRef.current,
      'note-type': noteTypeSelectRef.current,
    };

    focusAfterScroll(focusTargetByChoice[target]);
  }

  function handleCaptureOptionToggle(mode: 'dictation' | 'transcript') {
    const isActive = sourceWorkspaceMode === mode;
    handleSourceWorkspaceModeChange(isActive ? 'manual' : mode);
    if (!isActive && mode === 'dictation') {
      setActiveSourceTab('clinicianNotes');
      scrollToTopDictationControls();
    } else {
      scrollToComposeLane('source');
    }
    setEvalBanner(
      isActive
        ? 'Capture option turned off. Manual source entry is active.'
        : mode === 'dictation'
          ? 'Dictation lane opened. Choose the target source section, then start provider voice capture.'
          : 'Ambient listening lane opened. Start or resume the encounter from the ambient workspace.',
    );
  }

  function openCaptureOption(mode: 'dictation' | 'transcript') {
    if (sourceWorkspaceMode !== mode) {
      handleSourceWorkspaceModeChange(mode);
    }

    if (mode === 'dictation') {
      setActiveSourceTab('clinicianNotes');
      scrollToTopDictationControls();
      setEvalBanner('Dictation lane opened. Choose the target source section, then start provider voice capture.');
      return;
    }

    setActiveSourceTab('patientTranscript');
    scrollToComposeLane('source');
    setEvalBanner('Ambient listening lane opened. Use the Ambient Transcript field for encounter dialogue and spoken-session material.');
  }

  function scrollToTopDictationControls() {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const target = topDictationControlsRef.current || document.getElementById('web-dictation-start-controls');
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (target instanceof HTMLElement) {
          target.focus({ preventScroll: true });
        }
      });
    });
  }

  function scrollToComposeLane(lane: DraftComposeLane) {
    setWorkflowStage('compose');
    setActiveComposeLane(lane);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollToWorkspaceActiveLaneTop();
      });
    });
  }

  function handlePasteSourceJump() {
    setActiveComposeLane('source');
    setActiveSourceTab('intakeCollateral');
    setEvalBanner('Paste source into Pre-Visit Data first. Use Live Visit Notes, Ambient Transcript, or Provider Add-On only when that information fits better.');

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const target = document.getElementById('source-field-intakeCollateral');
        target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        window.setTimeout(() => {
          target?.querySelector('textarea')?.focus({ preventScroll: true });
        }, 120);
      });
    });
  }

  function handleDocumentSourceJump() {
    setActiveComposeLane('source');
    setSourceWorkspaceMode('manual');
    setEvalBanner('Use Source documents to review outside records, OCR text, or a summary before loading it into Pre-Visit Data.');

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.getElementById('document-source-intake')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
  }

  function scrollToPatientContinuityPanel() {
    setActiveComposeLane('source');
    setSourceWorkspaceMode('manual');
    setEvalBanner('Patient Continuity lets you search prior Veranote snapshots by label, date, note type, risk/medication/open-loop category, or draft clue.');

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.getElementById('patient-continuity-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
  }

  async function loadPatientContinuityRecords(overrides: Partial<{
    query: string;
    dateFrom: string;
    dateTo: string;
    noteType: string;
    category: PatientContinuityFactCategory | 'all';
  }> = {}) {
    setContinuityLoading(true);
    setContinuityStatus('');

    try {
      const params = new URLSearchParams({ providerId: resolvedProviderIdentityId });
      const query = overrides.query ?? continuitySearchQuery;
      const dateFrom = overrides.dateFrom ?? continuityDateFrom;
      const dateTo = overrides.dateTo ?? continuityDateTo;
      const noteTypeFilter = overrides.noteType ?? continuityNoteTypeFilter;
      const category = overrides.category ?? continuityCategory;

      if (query.trim()) {
        params.set('query', query.trim());
      }
      if (dateFrom) {
        params.set('dateFrom', dateFrom);
      }
      if (dateTo) {
        params.set('dateTo', dateTo);
      }
      if (noteTypeFilter.trim()) {
        params.set('noteType', noteTypeFilter.trim());
      }
      if (category && category !== 'all') {
        params.set('category', category);
      }

      const response = await fetch(`/api/patient-continuity?${params.toString()}`, { cache: 'no-store' });
      const payload = await response.json() as { records?: PatientContinuityRecord[]; activeRecord?: PatientContinuityRecord | null };

      if (!response.ok || !Array.isArray(payload.records)) {
        throw new Error('Patient continuity search did not return records.');
      }

      setContinuityRecords(payload.records);
      setSelectedContinuityId((current) => (
        current && payload.records?.some((record) => record.id === current)
          ? current
          : payload.activeRecord?.id || payload.records?.[0]?.id || ''
      ));
      setContinuityStatus(payload.records.length
        ? `Found ${payload.records.length} continuity snapshot${payload.records.length === 1 ? '' : 's'}.`
        : 'No continuity snapshots matched those filters.');
    } catch (error) {
      setContinuityStatus(error instanceof Error ? error.message : 'Unable to search continuity snapshots right now.');
    } finally {
      setContinuityLoading(false);
    }
  }

  async function handleApplyContinuityToSource(recordId = selectedContinuityId) {
    if (!recordId) {
      setContinuityStatus('Choose a continuity snapshot first.');
      return;
    }

    setContinuityLoading(true);
    setContinuityStatus('');

    try {
      const response = await fetch('/api/patient-continuity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: resolvedProviderIdentityId,
          recordId,
          action: 'mark-used',
        }),
      });
      const payload = await response.json() as {
        record?: PatientContinuityRecord;
        continuitySourceBlock?: string;
        error?: string;
      };

      if (!response.ok || !payload.record) {
        throw new Error(payload.error || 'Unable to apply continuity snapshot.');
      }

      const sourceBlock = payload.continuitySourceBlock || buildContinuitySourceBlock(payload.record);
      setSourceWorkspaceMode('manual');
      setActiveSourceTab('intakeCollateral');
      setSourceSections((current) => {
        const existing = current.intakeCollateral.trim();
        return {
          ...current,
          intakeCollateral: existing
            ? `${existing}\n\n---\n\n${sourceBlock}`
            : sourceBlock,
        };
      });
      setContinuityRecords((current) => [
        payload.record as PatientContinuityRecord,
        ...current.filter((record) => record.id !== payload.record?.id),
      ]);
      setSelectedContinuityId(payload.record.id);
      setContinuityPatientLabel(payload.record.patientLabel);
      setContinuityPatientDescription(payload.record.patientDescription || '');
      setContinuityPrivacyMode(payload.record.privacyMode);
      setContinuityStatus('Continuity loaded into Box 1: Pre-Visit Data. Verify today before using prior facts.');
      setEvalBanner('Loaded prior Veranote continuity into Pre-Visit Data as source context. It stays marked as prior context, not today’s fact.');

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document.getElementById('source-field-intakeCollateral')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      });
    } catch (error) {
      setContinuityStatus(error instanceof Error ? error.message : 'Unable to apply continuity snapshot right now.');
    } finally {
      setContinuityLoading(false);
    }
  }

  async function handleSaveContinuitySnapshot() {
    const noteText = generatedSession?.note || draftCheckpoint?.note || '';
    const sourceText = sourceInput;

    if (!noteText.trim() && !sourceText.trim()) {
      setContinuityStatus('Add source or generate a draft before saving continuity.');
      return;
    }

    setContinuityLoading(true);
    setContinuityStatus('');

    try {
      const response = await fetch('/api/patient-continuity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: resolvedProviderIdentityId,
          recordId: selectedContinuityId || undefined,
          patientLabel: continuityPatientLabel || selectedContinuityRecord?.patientLabel || undefined,
          patientDescription: continuityPatientDescription || selectedContinuityRecord?.patientDescription || undefined,
          privacyMode: continuityPrivacyMode,
          sourceDraftId: generatedSession?.draftId || draftCheckpoint?.draftId || undefined,
          sourceNoteType: noteType,
          sourceDate: new Date().toISOString(),
          sourceText,
          noteText,
          action: 'save-snapshot',
        }),
      });
      const payload = await response.json() as {
        record?: PatientContinuityRecord;
        records?: PatientContinuityRecord[];
        error?: string;
      };

      if (!response.ok || !payload.record) {
        throw new Error(payload.error || 'Unable to save continuity snapshot.');
      }

      setContinuityRecords(payload.records?.length ? payload.records : [
        payload.record,
        ...continuityRecords.filter((record) => record.id !== payload.record?.id),
      ]);
      setSelectedContinuityId(payload.record.id);
      setContinuityPatientLabel(payload.record.patientLabel);
      setContinuityPatientDescription(payload.record.patientDescription || '');
      setContinuityPrivacyMode(payload.record.privacyMode);
      setContinuityStatus('Continuity snapshot saved for future follow-up notes.');
      setEvalBanner('Saved a Veranote continuity snapshot. Future notes can search and pull it back into Pre-Visit Data.');
    } catch (error) {
      setContinuityStatus(error instanceof Error ? error.message : 'Unable to save continuity snapshot right now.');
    } finally {
      setContinuityLoading(false);
    }
  }

  function handleWorkflowStageJump(stageId: (typeof workspaceStageItems)[number]['id']) {
    if (stageId === 'source') {
      handlePasteSourceJump();
      return;
    }

    if (stageId === 'shape') {
      scrollToComposeLane(generatedSession ? 'finish' : 'setup');
      return;
    }

    if (stageId === 'review') {
      scrollToComposeLane(generatedSession ? 'finish' : 'source');
      return;
    }

    scrollToComposeLane('finish');
  }

  function clearLocalDraftState() {
    localStorage.removeItem(draftSessionStorageKey);
    localStorage.removeItem(draftRecoveryStorageKey);
    localStorage.removeItem(draftStageStorageKey);
  }

  function clearAmbientResumeState() {
    localStorage.removeItem(ambientSessionResumeStorageKey);
    localStorage.removeItem(AMBIENT_RESUME_FALLBACK_STORAGE_KEY);
    setAmbientResumeSnapshot(null);
  }

  function handleAmbientSessionPersistenceChange(snapshot: AmbientSessionPersistenceSnapshot) {
    if (shouldIgnoreAmbientResumeClearDuringHydration({
      hydrated: ambientResumeHydrated,
      sessionId: snapshot.sessionId,
    })) {
      return;
    }

    const nextSnapshot = buildAmbientResumeSnapshot({
      sessionId: snapshot.sessionId,
      encounterId: snapshot.encounterId,
      sessionState: snapshot.sessionState,
      updatedAt: snapshot.updatedAt,
    });

    if (!nextSnapshot) {
      clearAmbientResumeState();
      return;
    }

    setAmbientResumeSnapshot((current) => (
      current?.sessionId === nextSnapshot.sessionId
      && current?.sessionState === nextSnapshot.sessionState
      && current?.encounterId === nextSnapshot.encounterId
        ? current
        : nextSnapshot
    ));
    localStorage.setItem(ambientSessionResumeStorageKey, JSON.stringify(nextSnapshot));
    localStorage.setItem(AMBIENT_RESUME_FALLBACK_STORAGE_KEY, JSON.stringify(nextSnapshot));
  }

  function resetWorkspaceState() {
    clearLocalDraftState();
    clearAmbientResumeState();
    setAmbientWorkspaceResetToken((current) => current + 1);
    void handleStopDictation();
    setSourceSections(EMPTY_SOURCE_SECTIONS);
    setDictationInsertions({});
    setDictationSession(createLocalDictationSession({}));
    setEditedDictationSegments({});
    setDictationMockDraft('');
    setDictationHasStream(false);
    setDictationCapturePaused(false);
    setDictationRequestingPermission(false);
    setDictationCaptureError('');
    setDictationUploadStatus('');
    setDictationTechnicalStatus('');
    setDictationUploadedChunkCount(0);
    setDictationUploadedAudioBytes(0);
    setDictationProviderLabel('not started');
    setDictationProviderNote('No dictation provider selected yet.');
    setDictationBackendStatus('idle');
    setDictationQueuedEventCount(0);
    setDictationTransportLabel('polling standby');
    setDictationAuditEvents([]);
    setSelectedDictationHistorySessionId('');
    setSelectedDictationHistoryEvents([]);
    setSelectedDictationHistoryLoading(false);
    dictationChunkSequenceRef.current = 0;
    setEncounterSupport(createEncounterSupportDefaults(noteType));
    setMedicationProfile([]);
    setDiagnosisProfile([]);
    setAmbientTranscriptHandoff(undefined);
    setDraftCheckpointStatus('idle');
    setGeneratedSession(null);
    setDraftCheckpoint(null);
    setWorkflowStage('compose');
    setActiveComposeLane('source');
    setDictationTargetManuallySelected(false);
    setActiveSourceTab('intakeCollateral');
    setError('');
    setRecoveryMessage('');
    setEvalBanner('');
  }

  function handleResumeCurrentCheckpoint() {
    if (!currentCheckpoint) {
      return;
    }

    const nextStage = currentCheckpoint.recoveryState?.workflowStage || (currentCheckpoint.note?.trim() ? 'review' : 'compose');
    const nextLane = currentCheckpoint.recoveryState?.composeLane || (currentCheckpoint.note?.trim() ? 'finish' : 'source');

    if (nextStage === 'review' && currentCheckpoint.note?.trim()) {
      setGeneratedSession(currentCheckpoint);
      setWorkflowStage('review');
      requestAnimationFrame(() => {
        document.getElementById('generated-note-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      return;
    }

    setWorkflowStage('compose');
    setActiveComposeLane(nextLane);
    requestAnimationFrame(() => {
      scrollToComposeLane(nextLane);
    });
  }

  async function handleArchiveAndStartFresh() {
    if (!currentCheckpoint?.draftId) {
      resetWorkspaceState();
      return;
    }

    setRecoveryActionState('archiving');
    setRecoveryMessage('');

    try {
      const response = await fetch(`/api/drafts/${encodeURIComponent(currentCheckpoint.draftId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'archive',
          providerId: resolvedProviderIdentityId,
        }),
      });

      if (!response.ok) {
        const payload = await response.json() as { error?: string };
        throw new Error(payload.error || 'Unable to archive the current draft.');
      }

      resetWorkspaceState();
      setRecoveryMessage('Current draft archived. Workspace reset for a fresh note.');
    } catch (err) {
      setRecoveryMessage(err instanceof Error ? err.message : 'Unable to archive the current draft.');
    } finally {
      setRecoveryActionState('idle');
    }
  }

  async function handleDiscardCheckpoint() {
    if (!currentCheckpoint?.draftId) {
      resetWorkspaceState();
      return;
    }

    setRecoveryActionState('discarding');
    setRecoveryMessage('');

    try {
      const response = await fetch(`/api/drafts/${encodeURIComponent(currentCheckpoint.draftId)}?providerId=${encodeURIComponent(resolvedProviderIdentityId)}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const payload = await response.json() as { error?: string };
        throw new Error(payload.error || 'Unable to discard the current checkpoint.');
      }

      resetWorkspaceState();
      setRecoveryMessage('Current checkpoint discarded from this provider workspace.');
    } catch (err) {
      setRecoveryMessage(err instanceof Error ? err.message : 'Unable to discard the current checkpoint.');
    } finally {
      setRecoveryActionState('idle');
    }
  }

  function updateEncounterSupport<K extends keyof EncounterSupport>(key: K, value: EncounterSupport[K]) {
    setEncounterSupport((current) => ({ ...current, [key]: value }));
  }

  function updateMedicationProfileEntry(id: string, patch: Partial<StructuredPsychMedicationProfileEntry>) {
    setMedicationProfile((current) => normalizeMedicationProfile(current.map((entry) => (
      entry.id === id ? { ...entry, ...patch } : entry
    ))));
  }

  function updateDiagnosisProfileEntry(id: string, patch: Partial<StructuredPsychDiagnosisProfileEntry>) {
    setDiagnosisProfile((current) => normalizeDiagnosisProfile(current.map((entry) => (
      entry.id === id ? { ...entry, ...patch } : entry
    ))));
  }

  function addMedicationProfileEntry() {
    setMedicationProfile((current) => [...current, createEmptyMedicationProfileEntry()]);
  }

  function addDiagnosisProfileEntry() {
    setDiagnosisProfile((current) => [...current, createEmptyDiagnosisProfileEntry()]);
  }

  function removeMedicationProfileEntry(id: string) {
    setMedicationProfile((current) => current.filter((entry) => entry.id !== id));
  }

  function removeDiagnosisProfileEntry(id: string) {
    setDiagnosisProfile((current) => current.filter((entry) => entry.id !== id));
  }

  function handlePresetChange(presetId: string) {
    setSelectedPresetId(presetId);
    const preset = presets.find((item) => item.id === presetId);
    if (!preset) {
      setPresetName('');
      return;
    }

    setPresetName(preset.name);
    setOutputScope(preset.outputScope);
    setRequestedSections(preset.requestedSections);
    setOutputStyle(preset.outputStyle);
    setFormat(preset.format);
    setKeepCloserToSource(preset.keepCloserToSource);
    setFlagMissingInfo(preset.flagMissingInfo);
    setCustomInstructions(preset.customInstructions || '');
  }

  function toggleRequestedSection(section: NoteSectionKey) {
    setRequestedSections((current) => current.includes(section) ? current.filter((item) => item !== section) : [...current, section]);
  }

  function handleSavePreset() {
    const existingPreset = presets.find((item) => item.id === selectedPresetId);
    const isLocked = Boolean(existingPreset?.locked);
    const presetId = selectedPresetId && !isLocked ? selectedPresetId : `preset-custom-${Date.now()}`;
    const preset: NotePreset = {
      id: presetId,
      name: sanitizeProviderPromptName(presetName || existingPreset?.name || `${noteType} Custom`),
      noteType,
      outputScope,
      requestedSections,
      outputStyle,
      format,
      keepCloserToSource,
      flagMissingInfo,
      customInstructions,
      isDefault: false,
      locked: false,
    };

    const nextPresets = mergePresetCatalog([
      ...presets.filter((item) => item.id !== preset.id),
      preset,
    ]);
    const presetsStorageKey = getNotePresetsStorageKey(resolvedProviderIdentityId);
    setPresets(nextPresets);
    setSelectedPresetId(preset.id);
    setPresetName(preset.name);
    localStorage.setItem(presetsStorageKey, JSON.stringify(nextPresets));
    void fetch('/api/presets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ presets: nextPresets, providerId: resolvedProviderIdentityId }),
    }).catch(() => {
      // Keep local presets even if backend save fails.
    });
    assistantMemoryService.recordLaneSelection({
      noteType,
      outputScope,
      outputStyle,
      format,
      requestedSections,
    }, resolvedProviderIdentityId);
    setLanePreferenceSuggestion(getLanePreferenceSuggestion(noteType, resolvedProviderIdentityId));
  }

  function handleDeletePreset() {
    const preset = presets.find((item) => item.id === selectedPresetId);
    if (!preset || preset.locked) {
      return;
    }

    const nextPresets = presets.filter((item) => item.id !== preset.id);
    const presetsStorageKey = getNotePresetsStorageKey(resolvedProviderIdentityId);
    setPresets(nextPresets);
    setSelectedPresetId('');
    setPresetName('');
    localStorage.setItem(presetsStorageKey, JSON.stringify(nextPresets));
    void fetch('/api/presets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ presets: nextPresets, providerId: resolvedProviderIdentityId }),
    }).catch(() => {
      // Keep local presets even if backend save fails.
    });
  }

  function togglePromptBuilderGoal(goalId: ProviderPromptStudioGoalId) {
    setPromptBuilderGoalIds((current) => (
      current.includes(goalId)
        ? current.filter((item) => item !== goalId)
        : [...current, goalId]
    ));
  }

  function handleBuildPromptStudioDraft() {
    const nextDraft = buildProviderPromptStudioDraft({
      noteType,
      specialty,
      outputDestination: providerSettings.outputDestination,
      selectedGoalIds: promptBuilderGoalIds,
      freeText: assistantPreferenceRequest,
    });

    setAssistantPreferenceDraft(nextDraft);
  }

  function handleBuildPreferenceDraft(seed?: string) {
    const request = seed ?? assistantPreferenceRequest;
    const nextDraft = buildPreferenceAssistantDraft({
      noteType,
      specialty,
      outputDestination: providerSettings.outputDestination,
      request,
    });

    setAssistantPreferenceRequest(request);
    setAssistantPreferenceDraft(nextDraft);
  }

  function handleUseAssistantDraft(mode: 'replace' | 'append') {
    if (!assistantPreferenceDraft.trim()) {
      return;
    }

    assistantMemoryService.recordPromptSelection({
      noteType,
      request: assistantPreferenceRequest,
      draft: assistantPreferenceDraft,
      profileId: providerSettings.providerProfileId,
    }, resolvedProviderIdentityId);
    setPromptPreferenceSuggestion(getPromptPreferenceSuggestion(noteType, resolvedProviderIdentityId));
    setProfilePromptPreferenceSuggestion(
      assistantMemoryService.getProfilePromptSuggestion(providerSettings.providerProfileId, resolvedProviderIdentityId),
    );

    if (mode === 'replace') {
      setCustomInstructions(assistantPreferenceDraft.trim());
      return;
    }

    setCustomInstructions((current) => (
      current.trim()
        ? `${current.trim()}\n\n${assistantPreferenceDraft.trim()}`
        : assistantPreferenceDraft.trim()
    ));
  }

  async function handleGenerate() {
    setError('');

    if (!sourceInput.trim()) {
      setError('Please enter source input before generating a draft.');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/generate-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          specialty,
          role,
          noteType,
          template,
          outputStyle,
          format,
          flagMissingInfo,
          keepCloserToSource,
          outputScope,
          requestedSections,
          customInstructions,
          sourceSections,
          encounterSupport,
          medicationProfile,
          diagnosisProfile,
          sourceInput,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || 'Unable to generate draft right now.');
      }

      const draftSession: DraftSession = {
        providerIdentityId: resolvedProviderIdentityId,
        specialty,
        role,
        noteType,
        template,
        outputStyle,
        format,
        keepCloserToSource,
        flagMissingInfo,
        outputScope,
        requestedSections,
        selectedPresetId,
        presetName,
        customInstructions,
        encounterSupport,
        medicationProfile,
        diagnosisProfile,
        sourceInput,
        sourceSections,
        ambientTranscriptHandoff,
        dictationInsertions,
        note: data.note,
        flags: Array.isArray(data.flags) ? data.flags : [],
        copilotSuggestions: Array.isArray(data.copilotSuggestions) ? data.copilotSuggestions : [],
        sectionReviewState: undefined,
        recoveryState: buildDraftRecoveryState({
          sourceInput,
          note: data.note,
          sectionReviewState: undefined,
        }, {
          workflowStage: 'review',
          composeLane: 'finish',
        }),
        mode: data.mode,
        warning: typeof data.warning === 'string' ? data.warning : undefined,
      };
      let sessionToPersist: DraftSession = draftSession;

      try {
        const saveResponse = await fetch('/api/drafts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...draftSession,
            providerId: resolvedProviderIdentityId,
          }),
        });

        if (saveResponse.ok) {
          const savedData = await saveResponse.json() as { draft?: PersistedDraftSession };
          const savedDraft = savedData.draft;
          if (savedDraft) {
            sessionToPersist = savedDraft;
            localStorage.setItem(draftSessionStorageKey, JSON.stringify(savedDraft));
            localStorage.setItem(draftRecoveryStorageKey, JSON.stringify({
              draftId: savedDraft.id,
              recoveryState: savedDraft.recoveryState,
            }));
            setDraftCheckpoint(savedDraft);
            setDraftCheckpointStatus('saved');
            setGeneratedSession(savedDraft);
          } else {
            localStorage.setItem(draftSessionStorageKey, JSON.stringify(draftSession));
            setDraftCheckpoint(draftSession);
            setGeneratedSession(draftSession);
          }
        } else {
          localStorage.setItem(draftSessionStorageKey, JSON.stringify(draftSession));
          setDraftCheckpoint(draftSession);
          setGeneratedSession(draftSession);
        }
      } catch {
        localStorage.setItem(draftSessionStorageKey, JSON.stringify(draftSession));
        localStorage.setItem(draftRecoveryStorageKey, JSON.stringify({
          draftId: draftSession.draftId || null,
          recoveryState: draftSession.recoveryState,
        }));
        setDraftCheckpoint(draftSession);
        setGeneratedSession(draftSession);
        // Local draft persistence still works if server-backed save fails.
      }

      assistantMemoryService.recordLaneSelection({
        noteType,
        outputScope,
        outputStyle,
        format,
        requestedSections,
      }, resolvedProviderIdentityId);
      setLanePreferenceSuggestion(getLanePreferenceSuggestion(noteType, resolvedProviderIdentityId));

      setWorkflowStage('review');
      setActiveComposeLane('finish');
      persistDraftRecovery({
        draftId: sessionToPersist.draftId,
        workflowStage: 'review',
        composeLane: 'finish',
        note: sessionToPersist.note,
        sectionReviewState: sessionToPersist.sectionReviewState,
      });
      requestAnimationFrame(() => {
        document.getElementById('generated-note-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate draft right now.');
    } finally {
      setIsLoading(false);
    }
  }

  function handleClear() {
    resetWorkspaceState();
  }

  function handleLoadExample() {
    void handleStopDictation();
    clearAmbientResumeState();
    setAmbientWorkspaceResetToken((current) => current + 1);
    setSourceSections({
      ...EMPTY_SOURCE_SECTIONS,
      clinicianNotes: sampleSourceInput,
    });
    setAmbientTranscriptHandoff(undefined);
    setDictationInsertions({});
    setDictationSession(createLocalDictationSession({ targetSection: 'clinicianNotes' }));
    setEditedDictationSegments({});
    setDictationMockDraft('');
    setDictationHasStream(false);
    setDictationCapturePaused(false);
    setDictationRequestingPermission(false);
    setDictationCaptureError('');
    setDictationUploadStatus('');
    setDictationTechnicalStatus('');
    setDictationUploadedChunkCount(0);
    setDictationUploadedAudioBytes(0);
    setDictationProviderLabel('not started');
    setDictationProviderNote('No dictation provider selected yet.');
    setDictationBackendStatus('idle');
    setDictationQueuedEventCount(0);
    setDictationTransportLabel('polling standby');
    setDictationAuditEvents([]);
    setSelectedDictationHistorySessionId('');
    setSelectedDictationHistoryEvents([]);
    setSelectedDictationHistoryLoading(false);
    dictationChunkSequenceRef.current = 0;
    setSpecialty('Psychiatry');
    setRole('Psychiatric NP');
    setNoteType('Inpatient Psych Progress Note');
    setTemplate('Default Inpatient Psych Progress Note');
    setEncounterSupport(createEncounterSupportDefaults('Inpatient Psych Progress Note'));
    setMedicationProfile([]);
    setDiagnosisProfile([]);
    setDraftCheckpoint(null);
    setDraftCheckpointStatus('idle');
    setGeneratedSession(null);
    setWorkflowStage('compose');
    setActiveComposeLane('source');
    setDictationTargetManuallySelected(false);
    setActiveSourceTab('clinicianNotes');
    setOutputStyle('Standard');
    setFormat(providerSettings.paragraphOnly ? 'Paragraph Style' : 'Labeled Sections');
    setFlagMissingInfo(true);
    setKeepCloserToSource(providerSettings.closerToSourceDefault);
    setError('');
    setEvalBanner('Loaded example source into clinician notes.');
  }

  function handleLoadBlueprintStarter(starterId: string) {
    const starter = founderWorkflowStarters.find((item) => item.id === starterId);
    if (!starter) {
      return;
    }

    void handleStopDictation();
    clearAmbientResumeState();
    setAmbientWorkspaceResetToken((current) => current + 1);
    setSpecialty('Psychiatry');
    setRole('Psychiatric NP');
    setNoteType(starter.noteType);
    setTemplate(starter.template);
    setOutputStyle(starter.outputStyle);
    setFormat(providerSettings.paragraphOnly ? 'Paragraph Style' : starter.format);
    setFlagMissingInfo(true);
    setKeepCloserToSource(providerSettings.closerToSourceDefault);
    setOutputScope('full-note');
    setRequestedSections([]);
    setPresetName('');
    setCustomInstructions('');
    setSourceSections(starter.sections);
    setDictationInsertions({});
    setDictationSession(createLocalDictationSession({}));
    setEditedDictationSegments({});
    setDictationMockDraft('');
    setDictationHasStream(false);
    setDictationCapturePaused(false);
    setDictationRequestingPermission(false);
    setDictationCaptureError('');
    setDictationUploadStatus('');
    setDictationTechnicalStatus('');
    setDictationUploadedChunkCount(0);
    setDictationUploadedAudioBytes(0);
    setDictationProviderLabel('not started');
    setDictationProviderNote('No dictation provider selected yet.');
    setDictationBackendStatus('idle');
    setDictationQueuedEventCount(0);
    setDictationTransportLabel('polling standby');
    setDictationAuditEvents([]);
    setSelectedDictationHistorySessionId('');
    setSelectedDictationHistoryEvents([]);
    setSelectedDictationHistoryLoading(false);
    dictationChunkSequenceRef.current = 0;
    setEncounterSupport(createEncounterSupportDefaults(starter.noteType));
    setMedicationProfile([]);
    setDiagnosisProfile([]);
    setDraftCheckpoint(null);
    setDraftCheckpointStatus('idle');
    setGeneratedSession(null);
    setWorkflowStage('compose');
    setActiveComposeLane('source');
    setDictationTargetManuallySelected(false);
    setActiveSourceTab('intakeCollateral');
    setError('');
    setEvalBanner(`Loaded blueprint starter: ${starter.title}`);
  }

  function openAtlasAssistant() {
    if (typeof window === 'undefined') {
      return;
    }

    window.dispatchEvent(new CustomEvent(ASSISTANT_OPEN_EVENT));
  }

  const hasGeneratedDraft = Boolean(generatedSession?.note?.trim());
  const hasSource = sourceCompletionCount > 0;
  const atlasAttentionCount = composeNudges.filter((item) => item.tone === 'warning' || item.tone === 'danger').length;
  const atlasSourceCompletionLabel = `${sourceCompletionCount}/${sourceEntrySteps.length} source`;
  const atlasStatusLabel = hasGeneratedDraft
    ? atlasAttentionCount
      ? `${assistantPersona.name} flagged ${atlasAttentionCount} issue${atlasAttentionCount === 1 ? '' : 's'}`
      : `${assistantPersona.name} ready`
    : hasSource
      ? 'Source started; no draft yet'
      : 'No draft yet';
  const atlasDetail = hasGeneratedDraft
    ? `Use ${assistantPersona.name} to check risk wording, source fidelity, missing MSE details, and finish readiness.`
    : `${assistantPersona.name} becomes active once a draft exists.`;
  const atlasReviewActions: AtlasReviewDockAction[] = [
    {
      label: `Review Draft with ${assistantPersona.name}`,
      disabled: !hasGeneratedDraft,
      onClick: hasGeneratedDraft ? openAtlasAssistant : undefined,
      primary: hasGeneratedDraft,
      title: hasGeneratedDraft ? `Review this draft with ${assistantPersona.name}.` : `Generate a draft before asking ${assistantPersona.name} to review it.`,
    },
    {
      label: 'Check risk wording',
      disabled: !hasGeneratedDraft,
      onClick: hasGeneratedDraft ? openAtlasAssistant : undefined,
      title: hasGeneratedDraft ? `Ask ${assistantPersona.name} to focus on risk wording.` : 'Risk wording review is available after a draft exists.',
    },
    {
      label: 'Check source fidelity',
      disabled: !hasGeneratedDraft,
      onClick: hasGeneratedDraft ? openAtlasAssistant : undefined,
      title: hasGeneratedDraft ? `Ask ${assistantPersona.name} to compare source and draft.` : 'Source fidelity review is available after a draft exists.',
    },
    {
      label: hasGeneratedDraft ? 'Summarize issues before finish' : 'Find missing MSE details',
      disabled: !hasGeneratedDraft,
      onClick: hasGeneratedDraft ? openAtlasAssistant : undefined,
      title: hasGeneratedDraft ? `Ask ${assistantPersona.name} for finish-readiness issues.` : 'MSE detail review is available after a draft exists.',
    },
  ];
  const workspaceQuickFindItems = useMemo<WorkspaceQuickFindItem[]>(() => [
    {
      id: 'paste-source',
      label: 'Paste Source Here',
      helper: 'Jump to box 1: Pre-Visit Data / Paste Source Here.',
      keywords: ['source', 'paste', 'paste source', 'paste source here', 'previsit', 'pre-visit', 'intake', 'labs', 'nursing', 'collateral', 'raw data'],
      action: handlePasteSourceJump,
    },
    {
      id: 'source-documents',
      label: 'Source Documents',
      helper: 'Load outside records, OCR text, referrals, or ER packets.',
      keywords: ['document', 'documents', 'upload', 'ocr', 'pdf', 'er', 'referral', 'outside record', 'scan'],
      action: handleDocumentSourceJump,
    },
    {
      id: 'patient-continuity',
      label: 'Prior Patient / Note Search',
      helper: 'Search prior continuity by date, note type, medication, risk, open loop, label, or draft clue.',
      keywords: ['patient', 'prior', 'previous', 'history', 'continuity', 'recall', 'date', 'follow up', 'follow-up', 'old note'],
      action: scrollToPatientContinuityPanel,
    },
    {
      id: 'dictation',
      label: 'Dictation',
      helper: 'Open provider voice capture controls.',
      keywords: ['dictation', 'voice', 'mic', 'microphone', 'speak', 'audio'],
      action: () => openCaptureOption('dictation'),
    },
    {
      id: 'ambient',
      label: 'Ambient Listening',
      helper: 'Open the ambient transcript lane.',
      keywords: ['ambient', 'listening', 'transcript', 'patient dialogue', 'conversation', 'session'],
      action: () => openCaptureOption('transcript'),
    },
    {
      id: 'generate-draft',
      label: 'Generate Draft',
      helper: sourceCompletionCount ? 'Generate a draft from the source packet.' : 'Add source first, then generate a draft.',
      keywords: ['generate', 'draft', 'create note', 'make note', 'build note'],
      disabled: isLoading || sourceCompletionCount === 0,
      action: () => {
        scrollToDraftControls();
        void handleGenerate();
      },
    },
    {
      id: 'review-draft',
      label: 'Review Draft',
      helper: 'Review happens inside this workspace with copy/export and finish controls.',
      keywords: ['review', 'finish', 'copy', 'export', 'complete', 'final', 'sign'],
      action: scrollToDraftControls,
    },
    {
      id: 'cpt-support',
      label: 'CPT Support',
      helper: 'Find post-note coding-support candidates after a draft exists.',
      keywords: ['cpt', 'billing', 'code', 'coding', '90833', '99214', 'claim'],
      action: () => {
        setWorkflowStage('compose');
        setActiveComposeLane(hasGeneratedDraft ? 'finish' : 'source');
        window.scrollTo({ top: 0, behavior: 'auto' });
        [80, 220, 420].forEach((delay) => {
          window.setTimeout(() => {
            window.scrollTo({ top: 0, behavior: 'auto' });
          }, delay);
        });
        setEvalBanner(
          hasGeneratedDraft
            ? 'CPT support appears in Review Draft after generation. Treat candidates as coding-support only.'
            : 'Generate a draft first. CPT support appears after note completion and stays non-final billing guidance.',
        );
      },
    },
    {
      id: 'my-note-prompt',
      label: 'My Note Prompt',
      helper: 'Edit reusable provider instructions for this note type.',
      keywords: ['prompt', 'instruction', 'custom', 'template', 'preset', 'my note prompt'],
      action: scrollToMyNotePrompt,
    },
    {
      id: 'ehr-preferences',
      label: 'EHR / Output Preferences',
      helper: 'Change EHR target, field formatting, and copy/paste destination rules.',
      keywords: ['ehr', 'wellsky', 'tebra', 'simplepractice', 'output', 'preferences', 'copy paste', 'destination', 'export', 'finish', 'copy'],
      action: scrollToOutputPreferences,
    },
    {
      id: 'role-field-note',
      label: 'Role, Field, Note Type',
      helper: 'Change provider role, specialty, EHR, or note type.',
      keywords: ['role', 'field', 'specialty', 'note type', 'psychiatry', 'therapy', 'provider', 'setup'],
      action: scrollToNoteLaneSetup,
    },
    {
      id: 'optional-support',
      label: 'Optional Support',
      helper: 'Open medication, diagnosis, MSE, risk, and encounter-support helpers.',
      keywords: ['optional', 'support', 'mse', 'risk', 'medication', 'diagnosis', 'encounter', 'medical necessity'],
      action: () => scrollToComposeLane('support'),
    },
    {
      id: 'assistant',
      label: `Ask ${assistantPersona.name}`,
      helper: 'Open the assistant for workflow or clinical-reference questions.',
      keywords: ['assistant', 'atlas', 'ask', 'question', 'help', 'vera'],
      action: openAtlasAssistant,
    },
    {
      id: 'saved-drafts',
      label: 'Saved Drafts',
      helper: 'Open the saved drafts page.',
      keywords: ['saved', 'drafts', 'recover', 'history', 'old note'],
      action: () => router.push('/dashboard/drafts'),
    },
    {
      id: 'deep-review',
      label: 'Deep Review Screen',
      helper: 'Secondary screen for focused review when you want separation.',
      keywords: ['deep review', 'review screen', 'separate review', 'full review'],
      action: () => router.push('/dashboard/review'),
    },
  ], [
    assistantPersona.name,
    hasGeneratedDraft,
    isLoading,
    router,
    sourceCompletionCount,
  ]);
  const workspaceFindTerms = workspaceFindQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const workspaceQuickFindResults = workspaceFindTerms.length
    ? workspaceQuickFindItems.filter((item) => {
      const haystack = [item.label, item.helper, ...item.keywords].join(' ').toLowerCase();
      return workspaceFindTerms.every((term) => haystack.includes(term));
    }).slice(0, 5)
    : workspaceQuickFindItems.slice(0, 4);

  function runWorkspaceQuickFind(item: WorkspaceQuickFindItem) {
    if (item.disabled) {
      return;
    }

    item.action();
    setWorkspaceFindQuery('');
    setWorkspaceFindFocused(false);
  }

  if (!draftHydrationComplete) {
    return (
      <div className="grid gap-4">
        <div className="workspace-shell overflow-visible rounded-[24px] p-[1px]">
          <div className="rounded-[23px] bg-[linear-gradient(180deg,rgba(10,23,39,0.92),rgba(9,18,31,0.88))] p-4 shadow-[0_18px_46px_rgba(2,8,18,0.26)]">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100/58">Preparing your note workspace</div>
            <p className="mt-1 text-sm leading-6 text-cyan-50/72">
              Checking saved work so the page opens in the right place.
            </p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full border border-cyan-200/10 bg-[rgba(255,255,255,0.06)]">
              <div className="h-full w-1/2 rounded-full bg-[linear-gradient(90deg,rgba(103,232,249,0.2),rgba(103,232,249,0.92),rgba(45,212,191,0.72))]" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!showUnifiedWorkspace && workflowStage === 'review' && generatedSession) {
    return (
      <div className="grid gap-4">
        <div className="aurora-soft-panel rounded-[24px] border border-emerald-200 px-5 py-4 text-sm text-emerald-900">
          Review opened inside the same patient-note workspace. Source stays beside the draft on wide screens so you can compare, revise, and finish without jumping around.
        </div>

        <div className="workspace-shell workspace-grid overflow-visible rounded-[38px] p-[1px]">
          <div className="min-w-0 bg-[linear-gradient(180deg,rgba(10,23,39,0.92),rgba(9,18,31,0.88))] p-3 sm:p-4 md:p-5">
            <div className="mb-4 flex flex-col gap-4 rounded-[26px] border border-cyan-200/12 bg-[rgba(255,255,255,0.04)] p-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-100/70">Note workspace</div>
                <h2 className="mt-1.5 text-xl font-semibold tracking-[-0.02em] text-white">Source and draft review stay together</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-cyan-50/76">
                  Working note: <span className="font-semibold text-white">{generatedSession.noteType}</span>. Adjust source on the left, review and finish on the right, then copy or export when the note reads truthfully.
                </p>
	                <button
	                  type="button"
	                  onClick={() => router.push('/dashboard/review')}
	                  className="mt-2 text-sm font-medium text-cyan-100 underline decoration-cyan-200/40 underline-offset-4 transition hover:text-white"
	                >
	                  Open the deep-review screen only if you want to separate review from this workspace.
	                </button>
              </div>
              <div className="flex flex-wrap gap-2 lg:justify-end">
                <button type="button" onClick={handleReturnToCompose} className="aurora-secondary-button rounded-xl px-4 py-2 text-sm font-medium">
                  Back to Compose
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleArchiveAndStartFresh();
                  }}
                  className="aurora-secondary-button rounded-xl px-4 py-2 text-sm font-medium"
                >
                  Archive and start fresh
                </button>
              </div>
            </div>

            <div className="grid gap-4 2xl:grid-cols-[minmax(0,0.45fr)_minmax(0,0.55fr)] 2xl:items-start">
              <div id="source-panel" className="workspace-panel grid gap-4 rounded-[30px] p-4 text-white 2xl:sticky 2xl:top-4 2xl:max-h-[calc(100vh-10rem)] 2xl:overflow-y-auto">
                <div className="rounded-[22px] border border-cyan-200/12 bg-[rgba(255,255,255,0.04)] p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/68">Source packet</div>
                  <div className="mt-1 text-lg font-semibold tracking-[-0.02em] text-white">Edit source while reviewing the draft</div>
                  <p className="mt-2 text-sm leading-6 text-cyan-50/72">
                    These are the same four source fields used to generate the draft. Keep them editable so review can stay source-close.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full border border-cyan-200/14 bg-white/[0.06] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-50">
                      {sourceCompletionCount}/{sourceEntrySteps.length} fields loaded
                    </span>
                    <span className="rounded-full border border-cyan-200/14 bg-white/[0.06] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-50">
                      {sourceCompletionPercent}% ready
                    </span>
                  </div>
                </div>

                <div className="grid gap-3">
                  {sourceEntrySteps.map((step) => (
                    <SourceInput
                      key={step.key}
                      label={step.label}
                      hint={step.description}
                      value={sourceSections[step.key]}
                      onChange={(value) => updateSourceSection(step.key, value)}
                      placeholder={
                        step.key === 'intakeCollateral'
                          ? 'Paste labs, vitals, nursing intake, chart review, med list, collateral, or copied EHR data here.'
                          : step.key === 'clinicianNotes'
                            ? 'Type or dictate your live visit notes, HPI, MSE impressions, risk wording, and plan thoughts here.'
                            : step.key === 'patientTranscript'
                              ? 'Ambient listening transcript, corrected dialogue, direct quotes, or spoken-session material can go here.'
                              : 'Add diagnosis codes, billing code preference, plan language, discharge wording, or site-specific instructions here.'
	                      }
	                      tone={step.tone}
	                      compact
	                    />
                  ))}
                </div>

	                <details className="workspace-subpanel workspace-expandable rounded-[20px] px-4 py-3">
                  <summary className="cursor-pointer text-sm font-semibold text-cyan-50">Preview combined source</summary>
                  <div className="mt-4">
                    <CombinedView value={sourceInput} />
                  </div>
                </details>
              </div>

              <div id="generated-note-workspace" className="grid gap-4 2xl:max-h-[calc(100vh-10rem)] 2xl:overflow-y-auto 2xl:pr-1">
                <AtlasReviewDock
                  statusLabel={atlasStatusLabel}
                  detail={atlasDetail}
                  noteType={generatedSession.noteType}
                  sourceCompletionLabel={atlasSourceCompletionLabel}
                  attentionCount={atlasAttentionCount}
                  hasDraft={hasGeneratedDraft}
                  actions={atlasReviewActions}
                  assistantName={assistantPersona.name}
                  assistantAvatar={assistantPersona.avatar}
                />
                <ReviewWorkspace
                  initialSession={generatedSession}
                  embedded
                  onBackToEdit={handleReturnToCompose}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

	  return (
	    <div ref={composeWorkspaceRef} className="workspace-left-shell">
	      <aside className="workspace-left-rail">
	        <div className="workspace-left-rail-header">
	          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100/54">Veranote</div>
          <div className="mt-1 text-lg font-semibold leading-tight tracking-[-0.03em] text-white">New note</div>
          <p className="mt-1 text-xs leading-5 text-cyan-50/60">
            {noteType} • {sourceCompletionCount}/{sourceEntrySteps.length} source fields
          </p>
	        </div>

	        <div className="workspace-rail-search" data-testid="workspace-quick-find">
	          <label htmlFor="workspace-quick-find-input">Find in workspace</label>
	          <input
	            id="workspace-quick-find-input"
	            data-testid="workspace-quick-find-input"
	            type="search"
	            value={workspaceFindQuery}
	            onChange={(event) => setWorkspaceFindQuery(event.target.value)}
	            onFocus={() => setWorkspaceFindFocused(true)}
	            onKeyDown={(event) => {
	              if (event.key === 'Escape') {
	                setWorkspaceFindQuery('');
	                setWorkspaceFindFocused(false);
	              }
	              if (event.key === 'Enter' && workspaceQuickFindResults[0] && !workspaceQuickFindResults[0].disabled) {
	                event.preventDefault();
	                runWorkspaceQuickFind(workspaceQuickFindResults[0]);
	              }
	            }}
	            placeholder="Search actions..."
	            aria-label="Find in workspace"
	          />
	          {workspaceFindFocused || workspaceFindQuery.trim() ? (
	            <div className="workspace-rail-search-results">
	              {workspaceQuickFindResults.length ? (
	                workspaceQuickFindResults.map((item) => (
	                  <button
	                    key={item.id}
	                    type="button"
	                    data-testid="workspace-quick-find-result"
	                    onMouseDown={(event) => event.preventDefault()}
	                    onClick={() => runWorkspaceQuickFind(item)}
	                    disabled={item.disabled}
	                    className="workspace-rail-search-result"
	                  >
	                    <span>{item.label}</span>
	                    <small>{item.helper}</small>
	                  </button>
	                ))
	              ) : (
	                <div className="workspace-rail-search-empty">
	                  No match yet. Try paste, dictation, ambient, CPT, prompt, EHR, export, or saved.
	                </div>
	              )}
	            </div>
	          ) : (
	            <div className="workspace-rail-search-hint">Find source, dictation, prompt, EHR, CPT, or saved drafts.</div>
	          )}
	        </div>

	        <div className="grid gap-2">
	          <button
	            type="button"
	            onClick={handlePasteSourceJump}
	            className="workspace-rail-primary"
	          >
	            Paste Source
	          </button>
	          <button
	            type="button"
	            onClick={() => {
	              scrollToDraftControls();
	              void handleGenerate();
	            }}
	            disabled={isLoading || sourceCompletionCount === 0}
	            className="workspace-rail-action disabled:cursor-not-allowed disabled:opacity-50"
	          >
	            {isLoading ? 'Generating...' : 'Generate Draft'}
	          </button>
	          <button
	            type="button"
	            onClick={() => router.push('/dashboard/drafts')}
	            className="workspace-rail-tab"
	          >
	            Saved Drafts
	          </button>
	        </div>

	        <div className="workspace-rail-section">
	          <div className="workspace-rail-section-title">Workflow</div>
	          <div className="grid gap-1.5">
	            {[
	              { label: 'Setup', lane: 'setup' as const },
	              { label: 'Source', lane: 'source' as const },
	              { label: 'Review Draft', lane: 'finish' as const },
	            ].map((item) => (
	              <button
	                key={item.lane}
	                type="button"
	                onClick={() => scrollToComposeLane(item.lane)}
	                className={`workspace-rail-tab ${activeComposeLane === item.lane ? 'workspace-rail-tab-active' : ''}`}
	              >
	                {item.label}
	              </button>
	            ))}
	          </div>
	        </div>

	        <details className="workspace-rail-section workspace-rail-details">
	          <summary>
	            <span>Setup</span>
	            <small>{role} • {providerSettings.outputDestination}</small>
	          </summary>
	          <div className="grid gap-2">
	            <label className="workspace-rail-field">
	              <span>Role</span>
	              <select value={role} onChange={(event) => setRole(event.target.value)} aria-label="Select provider role">
	                {PROVIDER_ROLE_OPTIONS.map((item) => (
	                  <option key={item}>{item}</option>
	                ))}
	              </select>
	            </label>
	            <label className="workspace-rail-field">
	              <span>Field</span>
	              <select value={specialty} onChange={(event) => handleTopSpecialtyChange(event.target.value)} aria-label="Select clinical field">
	                {SPECIALTY_OPTIONS.map((item) => (
	                  <option key={item}>{item}</option>
	                ))}
	              </select>
	            </label>
	            <label className="workspace-rail-field">
	              <span>EHR</span>
	              <select
	                value={providerSettings.outputDestination}
	                onChange={(event) => void handleTopDestinationChange(event.target.value as ProviderSettings['outputDestination'])}
	                aria-label="Select EHR destination"
	              >
	                {getOutputDestinationOptions().map((item) => (
	                  <option key={item.label} value={item.label}>
	                    {item.summaryLabel}
	                  </option>
	                ))}
	              </select>
	            </label>
	            <label className="workspace-rail-field">
	              <span>Note</span>
	              <select value={noteType} onChange={(event) => handleTopNoteTypeChange(event.target.value)} aria-label="Select note type">
	                {noteTypeOptions.map((item) => (
	                  <option key={item}>{item}</option>
	                ))}
	              </select>
	            </label>
	          </div>
	        </details>

	        <details className="workspace-rail-section workspace-rail-details">
	          <summary>
	            <span>Options</span>
	            <small>Documents, prompt, review</small>
	          </summary>
	          <div className="grid gap-1.5">
	            <button type="button" onClick={handleDocumentSourceJump} className="workspace-rail-tab">Source Documents</button>
	            <button type="button" onClick={scrollToDraftControls} className="workspace-rail-tab">Draft Settings</button>
	            <button type="button" onClick={scrollToMyNotePrompt} className="workspace-rail-tab">My Note Prompt</button>
	            <button type="button" onClick={scrollToOutputPreferences} className="workspace-rail-tab">Preferences</button>
	            <button type="button" onClick={() => scrollToComposeLane('support')} className="workspace-rail-tab">Support Tools</button>
	            <button type="button" onClick={() => router.push('/dashboard/review')} className="workspace-rail-tab">Deep Review (optional)</button>
	          </div>
	        </details>
	      </aside>

	      <div className="workspace-main-column grid gap-4">
	      {evalBanner ? <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">{evalBanner.replace('Loaded evaluation case:', 'Loaded example case:').replace('Loaded blueprint starter:', 'Loaded starter:')}</div> : null}
	      <div id="workspace-active-lane-top" className="scroll-mt-28" aria-hidden="true" />

		      <div className="hidden">
	        <div className="grid gap-3 2xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.55fr)]">
	          <div className="grid gap-3">
	            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
	              <div>
	                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-100/62">Veranote provider console</div>
	                <h1 className="mt-1.5 text-[1.35rem] font-semibold tracking-[-0.04em] text-white sm:text-[1.65rem]">
	                  Source-first drafting with review-ready structure.
	                </h1>
	                <p className="mt-2 hidden max-w-3xl text-sm leading-6 text-cyan-50/72 md:block">
	                  Add source, generate a draft, review, then copy into the chart.
	                </p>
	                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
	                  <button
	                    type="button"
	                    onClick={() => scrollToComposeLane('source')}
	                    className="rounded-[18px] bg-[linear-gradient(135deg,#d8fbff_0%,#bff4ff_46%,#8ae8ff_100%)] px-5 py-3 text-sm font-semibold text-slate-950 shadow-[0_18px_46px_rgba(100,220,255,0.2)] transition hover:-translate-y-[1px] hover:shadow-[0_24px_60px_rgba(100,220,255,0.28)] focus:outline-none focus:ring-2 focus:ring-cyan-100/80"
	                  >
	                    Start Note from Source
	                  </button>
                  <div className="flex flex-wrap gap-2">
	                    <button
	                      type="button"
                      onClick={handlePasteSourceJump}
	                      className="rounded-full border border-cyan-200/18 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-cyan-50/86 transition hover:border-cyan-100/34 hover:bg-white/10"
                    >
                      Paste Source
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCaptureOptionToggle('dictation')}
	                      className="rounded-full border border-cyan-200/18 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-cyan-50/86 transition hover:border-cyan-100/34 hover:bg-white/10"
                    >
                      Start Dictation
                    </button>
                    <button
                      type="button"
                      onClick={() => router.push('/dashboard/drafts')}
	                      className="rounded-full border border-cyan-200/18 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-cyan-50/86 transition hover:border-cyan-100/34 hover:bg-white/10"
                    >
                      Open Draft
                    </button>
                  </div>
                </div>
              </div>
		              <details className="workspace-expandable rounded-[18px] border border-cyan-200/12 bg-white/5 p-2.5 text-cyan-50/82 md:hidden">
		                <summary className="cursor-pointer">
		                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/66">
		                    Current setup
		                  </div>
		                  <div className="mt-1 text-sm font-semibold text-white">
		                    {role} • {specialty} • {providerSettings.outputDestination}
		                  </div>
		                  <div className="mt-1 text-xs leading-5 text-cyan-50/60">
		                    {noteType}
		                  </div>
		                </summary>
		                <div className="mt-3 grid gap-2">
		                  <label className="workspace-badge-static workspace-select-card grid gap-1 rounded-[16px] px-3 py-2 text-cyan-50">
		                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-100/58">Role</span>
		                    <select
		                      value={role}
		                      onChange={(event) => setRole(event.target.value)}
		                      className="w-full cursor-pointer appearance-none bg-transparent text-sm font-semibold text-cyan-50 outline-none"
		                      aria-label="Select provider role"
		                    >
		                      {PROVIDER_ROLE_OPTIONS.map((item) => (
		                        <option key={item}>{item}</option>
		                      ))}
		                    </select>
		                  </label>
		                  <label className="workspace-badge-static workspace-select-card grid gap-1 rounded-[16px] px-3 py-2 text-cyan-50">
		                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-100/58">Field</span>
		                    <select
		                      value={specialty}
		                      onChange={(event) => handleTopSpecialtyChange(event.target.value)}
		                      className="w-full cursor-pointer appearance-none bg-transparent text-sm font-semibold text-cyan-50 outline-none"
		                      aria-label="Select clinical field"
		                    >
		                      {SPECIALTY_OPTIONS.map((item) => (
		                        <option key={item}>{item}</option>
		                      ))}
		                    </select>
		                  </label>
		                  <label className="workspace-badge-static workspace-select-card grid gap-1 rounded-[16px] px-3 py-2 text-cyan-50">
		                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-100/58">EHR / Site</span>
		                    <select
		                      value={providerSettings.outputDestination}
		                      onChange={(event) => void handleTopDestinationChange(event.target.value as ProviderSettings['outputDestination'])}
		                      className="w-full cursor-pointer appearance-none bg-transparent text-sm font-semibold text-cyan-50 outline-none"
		                      aria-label="Select EHR destination"
		                    >
		                      {getOutputDestinationOptions().map((item) => (
		                        <option key={item.label} value={item.label}>
		                          {item.summaryLabel}
		                        </option>
		                      ))}
		                    </select>
		                  </label>
		                  <label className="workspace-badge-static workspace-select-card grid gap-1 rounded-[16px] px-3 py-2 text-cyan-50">
		                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-100/58">Note type</span>
		                    <select
		                      value={noteType}
		                      onChange={(event) => handleTopNoteTypeChange(event.target.value)}
		                      className="w-full cursor-pointer appearance-none bg-transparent text-sm font-semibold text-cyan-50 outline-none"
		                      aria-label="Select note type"
		                    >
		                      {noteTypeOptions.map((item) => (
		                        <option key={item}>{item}</option>
		                      ))}
		                    </select>
		                  </label>
		                </div>
		              </details>
		              <div className="hidden w-full rounded-[18px] border border-cyan-200/12 bg-white/5 p-2.5 text-cyan-50/82 md:block lg:max-w-[620px]">
	                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/66">
	                  Note setup
	                </div>
		                <div className="mt-2 grid gap-2 lg:grid-cols-2">
		                <label className="workspace-badge-static workspace-select-card grid gap-1 rounded-[16px] px-3 py-2 text-cyan-50">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-100/58">Role</span>
                  <select
                    value={role}
                    onChange={(event) => setRole(event.target.value)}
                    className="w-full cursor-pointer appearance-none bg-transparent text-sm font-semibold text-cyan-50 outline-none"
                    aria-label="Select provider role"
                  >
                    {PROVIDER_ROLE_OPTIONS.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
		                <label className="workspace-badge-static workspace-select-card grid gap-1 rounded-[16px] px-3 py-2 text-cyan-50">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-100/58">Field</span>
                  <select
                    value={specialty}
                    onChange={(event) => handleTopSpecialtyChange(event.target.value)}
                    className="w-full cursor-pointer appearance-none bg-transparent text-sm font-semibold text-cyan-50 outline-none"
                    aria-label="Select clinical field"
                  >
                    {SPECIALTY_OPTIONS.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
		                <label className="workspace-badge-static workspace-select-card grid gap-1 rounded-[16px] px-3 py-2 text-cyan-50">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-100/58">EHR / Site</span>
                  <select
                    value={providerSettings.outputDestination}
                    onChange={(event) => void handleTopDestinationChange(event.target.value as ProviderSettings['outputDestination'])}
                    className="w-full cursor-pointer appearance-none bg-transparent text-sm font-semibold text-cyan-50 outline-none"
                    aria-label="Select EHR destination"
                  >
                    {getOutputDestinationOptions().map((item) => (
                      <option key={item.label} value={item.label}>
                        {item.summaryLabel}
                      </option>
                    ))}
                  </select>
                </label>
		                <label className="workspace-badge-static workspace-select-card grid gap-1 rounded-[16px] px-3 py-2 text-cyan-50">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-100/58">Note type</span>
                  <select
                    value={noteType}
                    onChange={(event) => handleTopNoteTypeChange(event.target.value)}
                    className="w-full cursor-pointer appearance-none bg-transparent text-sm font-semibold text-cyan-50 outline-none"
                    aria-label="Select note type"
                  >
                    {noteTypeOptions.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
                {visibleActiveOutputProfile ? (
                  <div className="workspace-badge-static rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-50">
                    Site: {visibleActiveOutputProfile.name}
                  </div>
                ) : null}
                {activeProviderProfile ? (
                  <div className="workspace-badge-static rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-50">
                    Profile: {activeProviderProfile.name}
                  </div>
                ) : null}
		                </div>
		              </div>
		            </div>

		            <details className="workspace-expandable rounded-[18px] border border-cyan-200/12 bg-[rgba(255,255,255,0.045)] p-2.5 text-cyan-50/82 md:hidden">
		              <summary className="cursor-pointer">
		                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/66">Capture options</div>
		                <div className="mt-1 text-sm font-semibold text-white">
		                  Ambient {sourceWorkspaceMode === 'transcript' ? 'on' : 'off'} • Dictation {sourceWorkspaceMode === 'dictation' ? 'on' : 'off'}
		                </div>
		              </summary>
		              <div className="mt-3 flex flex-wrap gap-2">
		                {[
		                  {
		                    id: 'transcript' as const,
		                    label: 'Ambient listening',
		                    detail: sourceWorkspaceMode === 'transcript' ? 'On - ambient lane open' : 'Off - open ambient lane',
		                  },
		                  {
		                    id: 'dictation' as const,
		                    label: 'Dictation',
		                    detail: sourceWorkspaceMode === 'dictation' ? 'On - dictation lane open' : 'Off - open dictation lane',
		                  },
		                ].map((captureOption) => {
		                  const isActive = sourceWorkspaceMode === captureOption.id;

		                  return (
		                    <button
		                      key={captureOption.id}
		                      type="button"
		                      onClick={() => handleCaptureOptionToggle(captureOption.id)}
		                      className={`${isActive ? '' : 'workspace-action-card'} rounded-[14px] border px-3 py-2 text-left transition focus:outline-none focus:ring-2 focus:ring-cyan-200/50 ${
		                        isActive
		                          ? 'border-emerald-300/34 bg-emerald-400/14 text-white shadow-[0_18px_44px_rgba(16,185,129,0.14)]'
		                          : 'border-cyan-200/12 bg-[rgba(8,24,42,0.66)] text-cyan-50/82 hover:border-cyan-200/28 hover:bg-[rgba(16,40,67,0.72)]'
		                      }`}
		                    >
		                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em]">
		                        {captureOption.label}
		                      </div>
		                      <div className={`mt-1 text-xs leading-5 ${isActive ? 'text-emerald-50/82' : 'text-cyan-50/60'}`}>
		                        {captureOption.detail}
		                      </div>
		                    </button>
		                  );
		                })}
		              </div>
		            </details>
		            <div className="hidden rounded-[18px] border border-cyan-200/12 bg-[rgba(255,255,255,0.045)] p-2.5 text-cyan-50/82 md:block">
	              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
	                <div>
	                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/66">Capture options</div>
		                  <p className="mt-1 hidden text-sm leading-6 text-cyan-50/72 md:block">Ambient and dictation stay optional; source typing always works.</p>
	                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    {
                      id: 'transcript' as const,
                      label: 'Ambient listening',
                      detail: sourceWorkspaceMode === 'transcript' ? 'On - ambient lane open' : 'Off - open ambient lane',
                    },
                    {
                      id: 'dictation' as const,
                      label: 'Dictation',
                      detail: sourceWorkspaceMode === 'dictation' ? 'On - dictation lane open' : 'Off - open dictation lane',
                    },
                  ].map((captureOption) => {
                    const isActive = sourceWorkspaceMode === captureOption.id;

                    return (
                      <button
                        key={captureOption.id}
                        type="button"
                        onClick={() => handleCaptureOptionToggle(captureOption.id)}
		                        className={`${isActive ? '' : 'workspace-action-card'} rounded-[14px] border px-3 py-2 text-left transition focus:outline-none focus:ring-2 focus:ring-cyan-200/50 ${
                          isActive
                            ? 'border-emerald-300/34 bg-emerald-400/14 text-white shadow-[0_18px_44px_rgba(16,185,129,0.14)]'
                            : 'border-cyan-200/12 bg-[rgba(8,24,42,0.66)] text-cyan-50/82 hover:border-cyan-200/28 hover:bg-[rgba(16,40,67,0.72)]'
                        }`}
                      >
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em]">
                          {captureOption.label}
                        </div>
                        <div className={`mt-1 text-xs leading-5 ${isActive ? 'text-emerald-50/82' : 'text-cyan-50/60'}`}>
                          {captureOption.detail}
                        </div>
                      </button>
                    );
                  })}
                </div>
	              </div>
	            </div>

            {false && sourceWorkspaceMode === 'dictation' ? (
              <div
                id="web-dictation-start-controls"
                ref={topDictationControlsRef}
                tabIndex={-1}
                className="sticky top-3 z-20 rounded-[26px] border border-emerald-300/22 bg-[linear-gradient(145deg,rgba(6,78,59,0.88),rgba(8,47,73,0.9))] p-3.5 shadow-[0_18px_50px_rgba(4,12,24,0.28)] outline-none backdrop-blur-xl focus:ring-2 focus:ring-emerald-200/45"
                aria-label="Web dictation start controls"
              >
                <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/74">Dictation Box</div>
                    <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em] text-white">
                      Record, correct, and insert from here
                    </h2>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-cyan-50/74">
                      Chrome may ask for microphone permission after Start. Correct the final transcript here before it becomes source text.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      handleSourceWorkspaceModeChange('transcript');
                      scrollToComposeLane('source');
                    }}
                    className="aurora-secondary-button rounded-xl px-4 py-2 text-sm font-medium"
                  >
                    Open full transcript review
                  </button>
                </div>

                <DictationControlBar
                  enabled={Boolean(dictationTargetSection)}
                  uiState={dictationSession.uiState}
                  captureState={dictationCaptureState}
                  captureLabel={dictationCaptureLabel}
                  providerLabel={dictationProviderLabel}
                  providerNote={dictationProviderNote}
                  providerOptions={dictationProviderOptions}
                  requestedProviderId={dictationRequestedProviderId}
                  allowMockFallback={dictationAllowMockFallback}
                  providerStatusLoading={dictationProviderStatusLoading}
                  sessionStatusLabel={`${dictationBackendStatus} • ${dictationTransportLabel}`}
                  targetLabel={dictationTargetLabel}
                  helperText={dictationTargetSection
                    ? 'Click Start, dictate the full phrase, then click Stop to transcribe. Final text stays in review until you explicitly insert it.'
                    : 'Choose Pre-Visit Data, Live Visit Notes, Ambient Transcript, or Provider Add-On before starting dictation.'}
                  voiceGuide={dictationVoiceGuide}
                  onVoiceGuideAction={() => {
                    void handleVoiceGuideAction();
                  }}
                  onRequestedProviderChange={setDictationRequestedProviderId}
                  onAllowMockFallbackChange={setDictationAllowMockFallback}
                  onRefreshProviderStatus={() => {
                    void refreshDictationProviderStatuses();
                  }}
                  onStart={() => {
                    void handleStartDictation();
                  }}
                  onPause={() => {
                    void handlePauseDictation();
                  }}
                  onStop={() => {
                    void handleStopDictation();
                  }}
                  onStopAndInsert={() => {
                    void handleStopAndInsertDictation();
                  }}
                />

                <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,0.72fr)_minmax(260px,0.28fr)]">
                  <div className="workspace-subpanel rounded-[20px] p-3.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/66">Transcript preview and review queue</div>
                        <div className="mt-1 text-sm font-semibold text-white">Review-first insertion stays visible while recording</div>
                      </div>
                      <div className="flex gap-2 text-xs text-cyan-50/72">
                        <span>{dictationSession.pendingSegments.length} pending</span>
                        <span>{dictationSession.insertedSegments.length} inserted</span>
                      </div>
                    </div>
                    <div className="mt-3 rounded-[16px] border border-white/10 bg-white/5 p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/62">Interim preview</div>
                      <div className="mt-1.5 whitespace-pre-wrap text-sm text-cyan-50/78">
                        {dictationSession.interimSegment?.text?.trim() || 'Live words appear here while recording.'}
                      </div>
                    </div>
                    <div className="mt-3 space-y-2">
                      {dictationSession.pendingSegments.length ? dictationSession.pendingSegments.slice(0, 2).map((segment) => (
                        <div key={`top-dictation-${segment.id}`} className="rounded-[16px] border border-amber-300/20 bg-[rgba(245,158,11,0.08)] p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-100/78">Transcript ready for review</div>
                            <span className="rounded-full border border-amber-200/20 bg-amber-200/10 px-2.5 py-1 text-[11px] font-medium text-amber-50">
                              editable
                            </span>
                          </div>
                          <textarea
                            value={editedDictationSegments[segment.id] ?? segment.text}
                            onChange={(event) => setEditedDictationSegments((current) => ({
                              ...current,
                              [segment.id]: event.target.value,
                            }))}
                            className="mt-2 min-h-[104px] w-full rounded-[14px] border border-amber-200/16 bg-[rgba(2,8,18,0.36)] px-3 py-2 text-sm leading-6 text-white outline-none transition focus:border-amber-100/44 focus:ring-2 focus:ring-amber-200/18"
                            aria-label="Editable final dictation transcript"
                          />
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                void handleAcceptDictationSegment(segment.id, editedDictationSegments[segment.id] ?? segment.text);
                              }}
                              className="rounded-xl bg-[rgba(34,197,94,0.18)] px-3 py-2 text-sm font-medium text-emerald-50"
                            >
                              Insert into {dictationTargetShortLabel}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDiscardDictationSegment(segment.id)}
                              className="rounded-xl bg-[rgba(255,255,255,0.08)] px-3 py-2 text-sm font-medium text-cyan-50/80"
                            >
                              Discard
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                void handleStartDictation();
                              }}
                              className="rounded-xl bg-[rgba(56,189,248,0.16)] px-3 py-2 text-sm font-medium text-sky-50"
                            >
                              Continue Dictating
                            </button>
                          </div>
                        </div>
                      )) : (
                        <div className="rounded-[16px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-3 text-sm text-cyan-50/72">
                          No transcript is ready yet. Click Start, dictate, then click Stop to transcribe the complete recording into this editable review box.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="workspace-subpanel rounded-[20px] p-3.5">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/66">Mic and queue status</div>
                    <div className="mt-2 space-y-2 text-sm text-cyan-50/76">
                      <div className="rounded-[14px] border border-emerald-300/16 bg-emerald-400/10 p-3">
                        <div className="text-xs uppercase tracking-[0.12em] text-emerald-100/72">Status</div>
                        <div className="mt-1 font-semibold text-white">{dictationBoxStatusLabel}</div>
                        {dictationTechnicalStatus ? (
                          <div className="mt-1 text-xs text-cyan-50/62">{dictationTechnicalStatus}</div>
                        ) : null}
                      </div>
                      <div className="rounded-[14px] border border-white/10 bg-white/5 p-3">
                        <div className="text-xs uppercase tracking-[0.12em] text-cyan-100/58">Capture</div>
                        <div className="mt-1 font-medium text-white">{dictationCaptureLabel}</div>
                      </div>
                      <div className="rounded-[14px] border border-white/10 bg-white/5 p-3">
                        <div className="text-xs uppercase tracking-[0.12em] text-cyan-100/58">Backend intake</div>
                        <div className="mt-1 font-medium text-white">
                          {dictationUploadedChunkCount} chunk{dictationUploadedChunkCount === 1 ? '' : 's'} • {dictationUploadedAudioBytes} bytes
                        </div>
                      </div>
                      <div className="rounded-[14px] border border-white/10 bg-white/5 p-3">
                        <div className="text-xs uppercase tracking-[0.12em] text-cyan-100/58">Review queue</div>
                        <div className="mt-1 font-medium text-white">{dictationQueuedEventCount} queued event{dictationQueuedEventCount === 1 ? '' : 's'}</div>
                      </div>
                      {showInternalDictationDebug ? (
                        <details className="rounded-[14px] border border-amber-200/16 bg-amber-300/8 p-3">
                          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-amber-100/78">
                            Internal Dictation Debug
                          </summary>
                          <div className="mt-3 space-y-3 text-xs leading-5 text-cyan-50/74">
                            {[
                              ['Raw STT transcript', dictationDebugSnapshot.rawTranscript],
                              ['Normalized transcript', dictationDebugSnapshot.normalizedTranscript],
                              ['Inserted transcript', dictationDebugSnapshot.insertedTranscript],
                            ].map(([label, value]) => (
                              <div key={label} className="rounded-[12px] border border-white/10 bg-[rgba(2,8,18,0.24)] p-2">
                                <div className="font-semibold uppercase tracking-[0.12em] text-cyan-100/58">{label}</div>
                                <div className="mt-1 whitespace-pre-wrap text-cyan-50/78">
                                  {value || 'Not captured yet.'}
                                </div>
                              </div>
                            ))}
                          </div>
                        </details>
                      ) : null}
                    </div>
                  </div>
                </div>
	              </div>
	            ) : null}

		            <div className="hidden rounded-[22px] border border-cyan-200/12 bg-[rgba(255,255,255,0.04)] p-3.5 text-cyan-50/78 xl:block">
	              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
	                <div className="min-w-0">
	                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/66">Workflow strip</div>
	                  <div className="mt-1 text-sm font-semibold text-white">
	                    {hasGeneratedDraft ? `Draft ready. Review with ${assistantPersona.name}.` : hasSource ? 'Source started. Generate the draft next.' : 'Choose setup, then add source.'}
	                  </div>
	                </div>
	                <div className="flex flex-wrap gap-2">
	                  {workspaceStageItems.map((item, index) => (
	                    <button
	                      key={item.id}
	                      type="button"
	                      onClick={() => handleWorkflowStageJump(item.id)}
		                      className={`workspace-action-pill rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] transition hover:border-cyan-100/38 ${getWorkspaceStageTone(item.status)}`}
	                    >
	                      {index + 1}. {item.label}
	                    </button>
	                  ))}
	                </div>
	              </div>
	              <div className="mt-3">
	                <StatusStrip items={composeReadinessItems} />
	              </div>
	            </div>
	          </div>
	        </div>
	      </div>

	      <div className="workspace-shell workspace-grid overflow-visible rounded-[38px] p-[1px]">
        <div className="min-w-0 bg-[linear-gradient(180deg,rgba(10,23,39,0.92),rgba(9,18,31,0.88))]">
	          <div className="grid gap-4 p-3 sm:p-4 md:p-5 xl:min-h-[620px]">
            {showUnifiedWorkspace || activeComposeLane === 'setup' ? (
              <div
                id="setup-panel"
                ref={registerComposeSection('core-setup')}
                className={`workspace-panel workspace-shine rounded-[28px] p-4 shadow-md backdrop-blur-xl transition-all ${jumpHighlightTarget === 'setup' ? 'ring-2 ring-cyan-300/70 shadow-[0_0_0_4px_rgba(34,211,238,0.14)]' : ''}`}
              >
                <div className="grid gap-3 2xl:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
                  <div className="grid gap-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/62">Compose session</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <h2 className="text-lg font-semibold tracking-[-0.02em] text-white">Set the note lane, then work from source</h2>
                          <div className="workspace-chip rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-50">
                            {role}
                          </div>
                        </div>
                        <p className="mt-1 text-sm text-cyan-50/70">
                          Keep this row quick. Choose the note frame here, then spend the rest of the workflow in the source and review panes below.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        <button onClick={handleClear} className="aurora-secondary-button rounded-xl px-3.5 py-2 text-sm font-medium">Clear note</button>
                        <button onClick={handleLoadExample} className="aurora-secondary-button rounded-xl px-3.5 py-2 text-sm font-medium">Load example</button>
                      </div>
                    </div>

                    <StatusStrip items={workspaceStatusItems} />

                    <div className="grid gap-2 rounded-[20px] border border-cyan-200/12 bg-[rgba(255,255,255,0.04)] p-3 sm:grid-cols-2 xl:grid-cols-4">
                      {[
                        '1. Choose note type',
                        '2. Paste source',
                        '3. Generate draft',
                        '4. Review before copy',
                      ].map((step) => (
                        <div
                          key={step}
                          className="rounded-[14px] border border-cyan-200/10 bg-[rgba(13,30,50,0.42)] px-3 py-2 text-sm font-medium text-cyan-50"
                        >
                          {step}
                        </div>
                      ))}
                    </div>

                    <div className="rounded-[20px] border border-cyan-200/12 bg-[rgba(255,255,255,0.04)] px-4 py-3 text-sm leading-6 text-cyan-50/78">
                      Generate from source. Use {assistantPersona.name} after the draft exists.
                    </div>

                    <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-4">
                      <Field label="Specialty">
                        <select ref={specialtySelectRef} value={specialty} onChange={(event) => handleTopSpecialtyChange(event.target.value)} className="workspace-control w-full rounded-xl px-3 py-2.5">
                          {SPECIALTY_OPTIONS.map((item) => (
                            <option key={item}>{item}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Role">
                        <select ref={roleSelectRef} value={role} onChange={(event) => setRole(event.target.value)} className="workspace-control w-full rounded-xl px-3 py-2.5">
                          {PROVIDER_ROLE_OPTIONS.map((item) => (
                            <option key={item}>{item}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Note Type">
                        <select ref={noteTypeSelectRef} value={noteType} onChange={(event) => setNoteType(event.target.value)} className={`workspace-control w-full rounded-xl px-3 py-2.5 transition-all ${jumpHighlightTarget === 'setup' ? 'ring-2 ring-cyan-300/70' : ''}`}>
                          {noteTypeOptions.map((item) => (
                            <option key={item}>{item}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Template">
                        <select ref={templateSelectRef} value={template} onChange={(event) => setTemplate(event.target.value)} className="workspace-control w-full rounded-xl px-3 py-2.5">
                          {templateOptions.map((item) => (
                            <option key={item}>{item}</option>
                          ))}
                        </select>
                      </Field>
                    </div>
                  </div>

                  <div className="workspace-subpanel rounded-[24px] p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/62">Current frame</div>
                    <div className="mt-1 text-base font-semibold text-white">{noteType}</div>
                    <p className="mt-2 text-sm leading-6 text-cyan-50/72">
                      {workflowGuidance?.intro || currentTemplateDescription}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <div className="workspace-chip rounded-full px-3 py-1 text-xs font-medium text-cyan-50">
                        Template: {template}
                      </div>
                      <div className="rounded-full border border-cyan-300/18 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-50">
                        Source coverage: {sourceCompletionCount}/{sourceEntrySteps.length}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className={`grid gap-4 xl:flex-1 xl:items-start ${
              hasGeneratedDraft
                ? 'xl:grid-cols-[minmax(0,0.46fr)_minmax(0,0.54fr)]'
                : 'xl:grid-cols-[minmax(0,0.52fr)_minmax(340px,0.48fr)]'
            }`}>
              <div className="grid gap-4 xl:min-h-0 xl:pr-2">

      {(
	      <div id="source-panel" ref={registerComposeSection('source-input')} className="workspace-panel flex flex-col rounded-[28px] p-2.5 text-white sm:p-3 xl:sticky xl:top-4 xl:max-h-[calc(100vh-9rem)] xl:min-h-[560px] xl:overflow-y-auto">
	        <div className="mb-2 flex flex-col gap-2 rounded-[20px] border border-cyan-200/10 bg-[rgba(255,255,255,0.035)] px-3 py-2.5 2xl:flex-row 2xl:items-center 2xl:justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100/62">Source</div>
            <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em] text-white">Paste or dictate source.</h2>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.13em] text-cyan-50/78">
            <span className="rounded-full border border-cyan-200/12 bg-white/[0.05] px-3 py-1">{sourceCompletionCount}/{sourceEntrySteps.length} fields</span>
            {populatedSectionLabels.length ? (
              <span className="rounded-full border border-cyan-200/12 bg-white/[0.05] px-3 py-1">
                Active: {populatedSectionLabels[0]}
              </span>
            ) : (
              <span className="rounded-full border border-cyan-200/12 bg-white/[0.05] px-3 py-1">Ready for source</span>
            )}
          </div>
        </div>
	        {(composeNudges.length || sectionExpectationSignals.length) ? (
		          <details className="hidden">
		            <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/66">
		              Optional nudges · {composeNudges.length + sectionExpectationSignals.length}
		            </summary>
	            <div className="workspace-nudge-scroll mt-2">
	              <div className="text-xs leading-5 text-cyan-50/62">
	                Optional guidance. Keep writing unless a review blocker needs attention.
	              </div>
	              {composeNudges.length ? (
	                <div className="mt-3 grid gap-2">
	                  {composeNudges.map((item) => (
	                    <div key={item.id} className={`rounded-[16px] border px-3 py-2.5 ${getWorkflowSignalClasses(item.tone)}`}>
	                      <div className="text-[10px] font-semibold uppercase tracking-[0.14em]">{item.label}</div>
	                      <div className="mt-1.5 text-xs leading-5 opacity-90">{item.detail}</div>
	                    </div>
	                  ))}
	                </div>
	              ) : null}
	              {sectionExpectationSignals.length ? (
		                <details className="workspace-expandable mt-3 rounded-[16px] border border-cyan-200/10 bg-white/5 p-3">
	                  <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100/62">
	                    Expected sections
	                  </summary>
	                  <div className="mt-2 grid gap-2">
	                    {sectionExpectationSignals.map((item) => (
	                      <div key={item.id} className={`rounded-[14px] border px-3 py-2 ${getSectionExpectationClasses(item.status)}`}>
	                        <div className="flex flex-wrap items-center justify-between gap-2">
	                          <div className="text-[10px] font-semibold uppercase tracking-[0.12em]">{item.status}</div>
	                          <div className="text-xs font-semibold">{item.label}</div>
	                        </div>
	                        <div className="mt-1.5 text-xs leading-5 opacity-90">{item.detail}</div>
	                      </div>
	                    ))}
	                  </div>
	                </details>
	              ) : null}
	            </div>
	          </details>
	        ) : null}
		        <div className="grid flex-1 gap-3">
	          {sourceWorkspaceMode === 'transcript' ? (
	            <div className="grid gap-3">
	              {ambientResumeStatus ? (
	                <div className="rounded-[20px] border border-cyan-200/16 bg-[rgba(56,189,248,0.08)] px-4 py-3 text-cyan-50">
	                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/72">Ambient resume</div>
	                  <div className="mt-1 text-sm font-semibold text-white">{ambientResumeStatus.title}</div>
	                  <p className="mt-1 text-sm leading-6 text-cyan-50/74">{ambientResumeStatus.detail}</p>
	                </div>
	              ) : null}
	              <AmbientEncounterWorkspace
	                key={ambientWorkspaceResetToken}
	                providerIdentityId={resolvedProviderIdentityId}
	                encounterId={draftCheckpoint?.draftId || 'new-note-encounter'}
	                transcriptModeActive={sourceWorkspaceMode === 'transcript'}
	                defaultCareSetting={ambientCareSetting}
	                defaultMode={ambientListeningMode}
	                initialSessionId={ambientResumeSnapshot?.sessionId || null}
	                onCommitTranscriptToSource={handleAmbientTranscriptCommit}
	                onOpenTranscriptMode={() => handleSourceWorkspaceModeChange('transcript')}
	                onOpenDraftControls={scrollToDraftControls}
	                onSessionSummaryChange={setAmbientSessionSummary}
	                onSessionPersistenceChange={handleAmbientSessionPersistenceChange}
	              />
	            </div>
	          ) : null}

	          <div className="grid gap-3">
		            <details className="hidden">
	              <summary className="cursor-pointer">
	                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
	                  <div>
	                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/66">Source mode</div>
	                    <div className="mt-1 text-sm font-semibold text-white">
	                      Active: {sourceModeCards.find((item) => item.id === sourceWorkspaceMode)?.label || 'Manual'}
	                    </div>
	                  </div>
	                  <div className="rounded-full border border-cyan-200/14 bg-[rgba(255,255,255,0.05)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-50">
	                    Change mode
	                  </div>
	                </div>
	              </summary>
	              <div className="mt-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                {sourceModeCards.map((modeCard) => {
                  const isActive = sourceWorkspaceMode === modeCard.id;

                  return (
                    <button
                      key={modeCard.id}
                      type="button"
                      onClick={() => handleSourceWorkspaceModeChange(modeCard.id)}
	                      className={`${isActive ? '' : 'workspace-action-card'} rounded-[16px] border px-3.5 py-3 text-left transition ${
                        isActive
                          ? 'border-cyan-300/30 bg-[linear-gradient(145deg,rgba(20,184,166,0.2),rgba(14,165,233,0.24))] text-white shadow-[0_20px_44px_rgba(4,12,24,0.28)]'
                          : 'border-white/10 bg-[rgba(255,255,255,0.035)] text-cyan-50/84 hover:border-cyan-200/24 hover:bg-white/8'
                      }`}
                    >
                      <div className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${isActive ? 'text-cyan-50/80' : 'text-cyan-100/54'}`}>
                        {modeCard.label}
                      </div>
                      <div className={`mt-1.5 text-xs leading-5 ${isActive ? 'text-cyan-50/78' : 'text-cyan-50/60'}`}>
                        {modeCard.detail}
                      </div>
                    </button>
                  );
                })}
	              </div>
	            </details>

            {sourceWorkspaceMode === 'manual' || sourceWorkspaceMode === 'dictation' || sourceWorkspaceMode === 'transcript' ? (
              <div className="grid gap-3">
                <details className="workspace-subpanel workspace-expandable workspace-source-options rounded-[20px] p-3.5">
                  <summary className="cursor-pointer">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/66">Options</div>
                        <div className="mt-1 text-sm font-semibold text-white">Documents and prior notes</div>
                      </div>
                      <div className="rounded-full border border-cyan-200/14 bg-[rgba(255,255,255,0.05)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-50">
                        Open
                      </div>
                    </div>
                  </summary>

                  <div className="mt-3 grid gap-3">
                <div id="document-source-intake">
                  <DocumentSourceIntake onCommitToSource={handleReviewedDocumentSourceCommit} />
                </div>

                <div id="patient-continuity-panel" className="workspace-subpanel rounded-[20px] p-3.5">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/66">Patient Continuity</div>
                      <div className="mt-1 text-sm font-semibold text-white">Search prior Veranote snapshots, then load only relevant context into Box 1.</div>
                      <p className="mt-1 max-w-3xl text-xs leading-5 text-cyan-50/68">
                        Search by label, identifying description, date, note type, source/draft clue, medication, risk, open loops, or prior interventions. This is recall support, not a replacement for the EHR.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void loadPatientContinuityRecords();
                        }}
                        disabled={continuityLoading}
                        className="workspace-action-pill rounded-full border border-cyan-200/18 bg-cyan-300/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-50 transition hover:border-cyan-100/38 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {continuityLoading ? 'Searching...' : 'Search prior notes'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void handleApplyContinuityToSource();
                        }}
                        disabled={continuityLoading || !selectedContinuityRecord}
                        className="workspace-action-card rounded-full border border-emerald-200/22 bg-emerald-300/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-50 transition disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Use in Pre-Visit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void handleSaveContinuitySnapshot();
                        }}
                        disabled={continuityLoading || (!sourceInput.trim() && !generatedSession?.note?.trim() && !draftCheckpoint?.note?.trim())}
                        className="workspace-action-card rounded-full border border-amber-200/24 bg-amber-300/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-50 transition disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Save snapshot
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1.15fr)_repeat(4,minmax(120px,0.5fr))]">
                    <label className="grid gap-1 text-xs text-cyan-50/74">
                      <span className="font-semibold uppercase tracking-[0.12em] text-cyan-100/62">Search</span>
                      <input
                        value={continuitySearchQuery}
                        onChange={(event) => setContinuitySearchQuery(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            void loadPatientContinuityRecords();
                          }
                        }}
                        className="workspace-control rounded-xl px-3 py-2"
                        placeholder="Patient label, med, risk, draft ID, referral clue..."
                      />
                    </label>
                    <label className="grid gap-1 text-xs text-cyan-50/74">
                      <span className="font-semibold uppercase tracking-[0.12em] text-cyan-100/62">From date</span>
                      <input
                        type="date"
                        value={continuityDateFrom}
                        onChange={(event) => setContinuityDateFrom(event.target.value)}
                        className="workspace-control rounded-xl px-3 py-2"
                      />
                    </label>
                    <label className="grid gap-1 text-xs text-cyan-50/74">
                      <span className="font-semibold uppercase tracking-[0.12em] text-cyan-100/62">To date</span>
                      <input
                        type="date"
                        value={continuityDateTo}
                        onChange={(event) => setContinuityDateTo(event.target.value)}
                        className="workspace-control rounded-xl px-3 py-2"
                      />
                    </label>
                    <label className="grid gap-1 text-xs text-cyan-50/74">
                      <span className="font-semibold uppercase tracking-[0.12em] text-cyan-100/62">Note type</span>
                      <select
                        value={continuityNoteTypeFilter}
                        onChange={(event) => setContinuityNoteTypeFilter(event.target.value)}
                        className="workspace-control rounded-xl px-3 py-2"
                      >
                        <option value="">Any note</option>
                        {continuityNoteTypeOptions.map((item) => (
                          <option key={item} value={item}>{item}</option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-xs text-cyan-50/74">
                      <span className="font-semibold uppercase tracking-[0.12em] text-cyan-100/62">Find category</span>
                      <select
                        value={continuityCategory}
                        onChange={(event) => setContinuityCategory(event.target.value as PatientContinuityFactCategory | 'all')}
                        className="workspace-control rounded-xl px-3 py-2"
                      >
                        {CONTINUITY_CATEGORY_OPTIONS.map((item) => (
                          <option key={item.value} value={item.value}>{item.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,0.95fr)_minmax(280px,0.55fr)]">
                    <div className="rounded-[16px] border border-cyan-200/12 bg-[rgba(7,18,32,0.48)] p-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100/60">Matches</div>
                          <div className="mt-1 text-sm font-semibold text-white">
                            {continuityRecords.length ? `${continuityRecords.length} continuity snapshot${continuityRecords.length === 1 ? '' : 's'}` : 'No snapshots loaded yet'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setContinuityNoteTypeFilter(noteType);
                            void loadPatientContinuityRecords({ noteType });
                          }}
                          className="workspace-action-pill rounded-full border border-cyan-200/18 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-50"
                        >
                          Current note type
                        </button>
                      </div>

                      {continuityRecords.length ? (
                        <div className="mt-3 grid max-h-52 gap-2 overflow-y-auto pr-1">
                          {continuityRecords.slice(0, 8).map((record) => {
                            const isSelected = selectedContinuityId === record.id;

                            return (
                              <button
                                key={record.id}
                                type="button"
                                onClick={() => {
                                  setSelectedContinuityId(record.id);
                                  setContinuityPatientLabel(record.patientLabel);
                                  setContinuityPatientDescription(record.patientDescription || '');
                                  setContinuityPrivacyMode(record.privacyMode);
                                }}
                                className={`workspace-action-card rounded-[14px] border px-3 py-2.5 text-left transition ${
                                  isSelected
                                    ? 'border-emerald-200/34 bg-emerald-300/12 text-white'
                                    : 'border-white/10 bg-white/5 text-cyan-50/80 hover:border-cyan-200/24'
                                }`}
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-sm font-semibold">{record.patientLabel}</span>
                                  <span className="text-[11px] text-cyan-50/58">
                                    {formatContinuityDateLabel(record.lastSourceDate)}
                                  </span>
                                </div>
                                <div className="mt-1 line-clamp-2 text-xs leading-5 text-cyan-50/62">{record.recallSummary}</div>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="mt-3 rounded-[14px] border border-white/10 bg-white/5 p-3 text-sm leading-6 text-cyan-50/68">
                          After an initial evaluation or completed note, save a continuity snapshot here. Follow-up notes can pull it back by date, note type, med/risk category, or search text.
                        </div>
                      )}
                    </div>

                    <div className="rounded-[16px] border border-cyan-200/12 bg-[rgba(7,18,32,0.48)] p-3">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100/60">Selected snapshot</div>
                      {selectedContinuityRecord ? (
                        <div className="mt-2 space-y-3 text-sm text-cyan-50/74">
                          <div>
                            <div className="font-semibold text-white">{selectedContinuityRecord.patientLabel}</div>
                            {selectedContinuityRecord.patientDescription ? (
                              <div className="mt-1 text-xs leading-5 text-cyan-50/58">{selectedContinuityRecord.patientDescription}</div>
                            ) : null}
                          </div>
                          <div className="rounded-[14px] border border-white/10 bg-white/5 p-3 text-xs leading-5 text-cyan-50/68">
                            {selectedContinuityRecord.recallSummary}
                          </div>
                          {selectedContinuityRecord.todayPrepChecklist.length ? (
                            <div className="space-y-1">
                              {selectedContinuityRecord.todayPrepChecklist.slice(0, 3).map((item) => (
                                <div key={item} className="rounded-[12px] border border-cyan-200/10 bg-cyan-300/8 px-3 py-2 text-xs leading-5 text-cyan-50/72">
                                  {item}
                                </div>
                              ))}
                            </div>
                          ) : null}
                          {continuityTodaySignals.length ? (
                            <div className="space-y-1">
                              {continuityTodaySignals.map((signal) => (
                                <div key={signal.id} className={`rounded-[12px] border px-3 py-2 text-xs leading-5 ${
                                  signal.tone === 'caution'
                                    ? 'border-amber-200/24 bg-amber-300/10 text-amber-50'
                                    : signal.tone === 'review'
                                      ? 'border-sky-200/22 bg-sky-300/10 text-sky-50'
                                      : 'border-cyan-200/16 bg-cyan-300/8 text-cyan-50/72'
                                }`}>
                                  <div className="font-semibold">{signal.label}</div>
                                  <div className="mt-1 opacity-80">{signal.detail}</div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <p className="mt-2 text-sm leading-6 text-cyan-50/64">
                          Pick a match to preview what Veranote will carry forward into today’s source packet.
                        </p>
                      )}
                    </div>
                  </div>

                  <details className="mt-3 rounded-[16px] border border-cyan-200/10 bg-white/5 p-3">
                    <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/66">
                      Save settings for future recall
                    </summary>
                    <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)_minmax(160px,0.4fr)]">
                      <label className="grid gap-1 text-xs text-cyan-50/74">
                        <span className="font-semibold uppercase tracking-[0.12em] text-cyan-100/62">Patient label</span>
                        <input
                          value={continuityPatientLabel}
                          onChange={(event) => setContinuityPatientLabel(event.target.value)}
                          className="workspace-control rounded-xl px-3 py-2"
                          placeholder="Room 214, initials, or patient name if allowed"
                        />
                      </label>
                      <label className="grid gap-1 text-xs text-cyan-50/74">
                        <span className="font-semibold uppercase tracking-[0.12em] text-cyan-100/62">Identifying description</span>
                        <input
                          value={continuityPatientDescription}
                          onChange={(event) => setContinuityPatientDescription(event.target.value)}
                          className="workspace-control rounded-xl px-3 py-2"
                          placeholder="Optional: referral source, unit, short descriptor"
                        />
                      </label>
                      <label className="grid gap-1 text-xs text-cyan-50/74">
                        <span className="font-semibold uppercase tracking-[0.12em] text-cyan-100/62">Privacy mode</span>
                        <select
                          value={continuityPrivacyMode}
                          onChange={(event) => setContinuityPrivacyMode(event.target.value as PatientContinuityPrivacyMode)}
                          className="workspace-control rounded-xl px-3 py-2"
                        >
                          <option value="neutral-id">Neutral ID</option>
                          <option value="description-only">Description only</option>
                          <option value="patient-name">Patient name allowed</option>
                        </select>
                      </label>
                    </div>
                  </details>

                  {continuityStatus ? (
                    <div className="mt-3 rounded-[14px] border border-cyan-200/12 bg-cyan-300/8 px-3 py-2 text-xs leading-5 text-cyan-50/72">
                      {continuityStatus}
                    </div>
                  ) : null}
                </div>
                  </div>
                </details>

                <div className="workspace-subpanel workspace-source-entry-card rounded-[20px] p-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/66">Source</div>
                      <div className="mt-1 text-sm font-semibold text-white">Paste, type, dictate, or review ambient source.</div>
                    </div>
                    <div className="rounded-full border border-cyan-200/14 bg-[rgba(255,255,255,0.05)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-50">
                      {sourceCompletionCount}/{sourceEntrySteps.length} fields loaded
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2" aria-label="Source entry mode">
                    {sourceModeCards.map((modeCard) => {
                      const isActive = sourceWorkspaceMode === modeCard.id;
                      const shortLabel = modeCard.id === 'manual' ? 'Manual' : modeCard.id === 'dictation' ? 'Dictation' : 'Ambient';

                      return (
                        <button
                          key={modeCard.id}
                          type="button"
                          onClick={() => handleSourceWorkspaceModeChange(modeCard.id)}
                          className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                            isActive
                              ? 'border-cyan-200/36 bg-cyan-300/14 text-white shadow-[0_10px_24px_rgba(34,211,238,0.12)]'
                              : 'workspace-action-pill border-white/10 bg-white/5 text-cyan-50/74 hover:border-cyan-200/24 hover:text-white'
                          }`}
                        >
                          {shortLabel}
                        </button>
                      );
                    })}
                    <details className="workspace-inline-details">
                      <summary>What goes where?</summary>
                      <div className="mt-2 grid gap-2 rounded-[16px] border border-cyan-200/12 bg-[rgba(7,18,32,0.68)] p-3 md:grid-cols-3">
                        {captureFlowGuides.map((item) => (
                          <div key={item.label}>
                            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100/70">{item.label}</div>
                            <div className="mt-1 text-xs leading-5 text-cyan-50/66">{item.detail}</div>
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                </div>

                <div className="workspace-source-fields grid gap-3">
                  {sourceEntrySteps.map((step) => (
                    <SourceInput
                      key={step.key}
                      id={`source-field-${step.key}`}
                      label={step.label}
                      hint={step.description}
                      value={sourceSections[step.key]}
                      onChange={(value) => updateSourceSection(step.key, value)}
                      placeholder={
                        step.key === 'intakeCollateral'
                          ? 'Paste labs, vitals, nursing intake, chart review, med list, collateral, or copied EHR data here.'
                          : step.key === 'clinicianNotes'
                            ? 'Type or dictate your live visit notes, HPI, MSE impressions, risk wording, and plan thoughts here.'
                            : step.key === 'patientTranscript'
                              ? 'Ambient listening transcript, corrected dialogue, direct quotes, or spoken-session material can go here.'
                              : 'Add diagnosis codes, billing code preference, plan language, discharge wording, or site-specific instructions here.'
	                      }
	                      tone={step.tone}
	                    />
                  ))}
                </div>

                <div className="workspace-source-next-action rounded-[20px] border border-cyan-200/16 bg-[linear-gradient(145deg,rgba(4,12,24,0.88),rgba(8,32,58,0.9))] px-4 py-3 shadow-[0_10px_30px_rgba(4,12,24,0.22)] backdrop-blur-xl">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/66">Next action</div>
                <div className="mt-1 text-sm font-semibold text-white">
                        {isLoading ? 'Generating draft...' : hasSource ? 'Generate Draft from Source.' : 'Paste, dictate, or upload source to start.'}
                      </div>
                      <div className="mt-1 text-xs text-cyan-50/66">
                        {sourceCompletionCount}/{sourceEntrySteps.length} source steps loaded • {composeNudges.filter((item) => item.tone === 'warning' || item.tone === 'danger').length} attention item{composeNudges.filter((item) => item.tone === 'warning' || item.tone === 'danger').length === 1 ? '' : 's'}
                      </div>
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={() => {
                          scrollToDraftControls();
                          void handleGenerate();
                        }}
                        disabled={isLoading || sourceCompletionCount === 0}
                        className="aurora-primary-button rounded-xl px-4 py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isLoading ? 'Generating draft...' : 'Generate Draft from Source'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {sourceWorkspaceMode === 'dictation' ? (
              <div className="grid gap-4">
                <div className="workspace-subpanel rounded-[22px] p-3.5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/66">Dictation source mode</div>
                      <div className="mt-1 text-base font-semibold text-white">Provider voice capture stays in source capture, not encounter control</div>
                      <p className="mt-1 max-w-2xl text-sm text-cyan-50/74">
                        This lane stays focused on provider-directed insertion into note source sections. Ambient transcript review remains separate in Transcript mode.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {manualSourceSteps.map((step) => {
                        const isTarget = step.key === dictationTargetSection;
                        return (
                          <button
                            key={step.key}
                            type="button"
                            aria-pressed={isTarget}
                            title={`Dictate into ${step.label}`}
                            onClick={() => {
                              setDictationTargetManuallySelected(true);
                              setActiveSourceTab(step.key);
                            }}
                            className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] ${
                              isTarget
                                ? 'border-cyan-300/30 bg-cyan-400/12 text-cyan-50'
                                : 'border-white/10 bg-white/5 text-cyan-50/70'
                            }`}
                          >
                            {step.shortLabel}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div
                  id="web-dictation-start-controls"
                  ref={topDictationControlsRef}
                  tabIndex={-1}
                  className="rounded-[24px] border border-emerald-300/22 bg-[linear-gradient(145deg,rgba(6,78,59,0.88),rgba(8,47,73,0.9))] p-3.5 shadow-[0_18px_50px_rgba(4,12,24,0.28)] outline-none backdrop-blur-xl focus:ring-2 focus:ring-emerald-200/45"
                  aria-label="Web dictation start controls"
                >
                  <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/74">Dictation Box</div>
                      <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em] text-white">
                        Record, correct, and insert from here
                      </h2>
                      <p className="mt-1 max-w-3xl text-sm leading-6 text-cyan-50/74">
                        Correct the final transcript here before it becomes source text.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        handleSourceWorkspaceModeChange('transcript');
                        scrollToComposeLane('source');
                      }}
                      className="aurora-secondary-button rounded-xl px-4 py-2 text-sm font-medium"
                    >
                      Open transcript review
                    </button>
                  </div>

                  <DictationControlBar
                    enabled={Boolean(dictationTargetSection)}
                    uiState={dictationSession.uiState}
                    captureState={dictationCaptureState}
                    captureLabel={dictationCaptureLabel}
                    providerLabel={dictationProviderLabel}
                    providerNote={dictationProviderNote}
                    providerOptions={dictationProviderOptions}
                    requestedProviderId={dictationRequestedProviderId}
                    allowMockFallback={dictationAllowMockFallback}
                    providerStatusLoading={dictationProviderStatusLoading}
                    sessionStatusLabel={`${dictationBackendStatus} • ${dictationTransportLabel}`}
                    targetLabel={dictationTargetLabel}
                    helperText={dictationTargetSection
                      ? 'Click Start, dictate the full phrase, then click Stop to transcribe. Final text stays in review until you explicitly insert it.'
                      : 'Choose Pre-Visit Data, Live Visit Notes, Ambient Transcript, or Provider Add-On before starting dictation.'}
                    voiceGuide={dictationVoiceGuide}
                    onVoiceGuideAction={() => {
                      void handleVoiceGuideAction();
                    }}
                    onRequestedProviderChange={setDictationRequestedProviderId}
                    onAllowMockFallbackChange={setDictationAllowMockFallback}
                    onRefreshProviderStatus={() => {
                      void refreshDictationProviderStatuses();
                    }}
                    onStart={() => {
                      void handleStartDictation();
                    }}
                    onPause={() => {
                      void handlePauseDictation();
                    }}
                    onStop={() => {
                      void handleStopDictation();
                    }}
                    onStopAndInsert={() => {
                      void handleStopAndInsertDictation();
                    }}
                  />
                </div>

                <div className="grid gap-3 xl:grid-cols-[minmax(0,0.72fr)_minmax(260px,0.28fr)]">
                  <div className="workspace-subpanel rounded-[22px] p-3.5">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/66">Dictation Box pinned above</div>
                        <div className="mt-1 text-base font-semibold text-white">
                          {activeDictationTargetStep?.label || 'Choose a target section'}
                        </div>
                        <p className="mt-1 max-w-2xl text-sm text-cyan-50/74">
                          Use the sticky Dictation Box above for Start, Stop, transcript correction, and insertion. These controls only change the target or open the deeper transcript ledger.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSourceWorkspaceModeChange('transcript')}
                        className="aurora-secondary-button rounded-xl px-4 py-2 text-sm font-medium"
                      >
                        Open transcript review
                      </button>
                    </div>
                  </div>

	                  <details className="workspace-subpanel workspace-expandable rounded-[22px] p-3.5">
                    <summary className="cursor-pointer text-sm font-semibold text-cyan-50">Stored commands</summary>
                    <div className="mt-1 text-xs text-cyan-50/66">
                      Keep the dictation phrases you use often close by, without crowding the capture lane.
                    </div>
                    <div className="mt-3">
                      <DictationCommandManager
                        commands={effectiveDictationCommands}
                        onSave={handleSaveDictationCommands}
                        compact
                      />
                    </div>
                  </details>
                </div>
              </div>
            ) : null}

            {sourceWorkspaceMode === 'transcript' ? (
              <div className="grid gap-4">
                <div className="workspace-subpanel rounded-[22px] p-3.5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/66">Transcript mode</div>
                      <div className="mt-1 text-base font-semibold text-white">Review spoken source before it becomes note input</div>
                      <p className="mt-1 max-w-2xl text-sm text-cyan-50/74">
                        This lane is for queued spoken source, transcript history, and reviewable insertion decisions. Return to Dictation when you want to keep capturing.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleSourceWorkspaceModeChange('dictation')}
                        className="aurora-secondary-button rounded-xl px-4 py-2 text-sm font-medium"
                      >
                        Back to dictation
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSourceWorkspaceModeChange('manual')}
                        className="aurora-secondary-button rounded-xl px-4 py-2 text-sm font-medium"
                      >
                        Back to manual
                      </button>
                    </div>
                  </div>
                </div>

                <DictationTranscriptPanel
                  enabled={Boolean(dictationTargetSection)}
                  captureLabel={dictationCaptureLabel}
                  providerLabel={dictationProviderLabel}
                  providerNote={dictationProviderNote}
                  transportLabel={dictationTransportLabel}
                  auditEvents={dictationAuditEvents}
                  sessionHistory={dictationSessionHistory}
                  selectedSessionId={selectedDictationHistorySessionId}
                  selectedSessionEvents={selectedDictationHistoryEvents}
                  selectedSessionLoading={selectedDictationHistoryLoading}
                  queuedTranscriptEventCount={dictationQueuedEventCount}
                  uploadedChunkCount={dictationUploadedChunkCount}
                  uploadedAudioBytes={dictationUploadedAudioBytes}
                  interimText={dictationSession.interimSegment?.text}
                  mockDraft={dictationMockDraft}
                  onMockDraftChange={setDictationMockDraft}
                  onQueueMockUtterance={() => {
                    void handleQueueMockUtterance();
                  }}
                  pendingSegments={dictationSession.pendingSegments}
                  insertedSegments={dictationSession.insertedSegments}
                  commandLibrary={effectiveDictationCommands}
                  insertionTargetLabel={dictationTargetShortLabel}
                  editedSegmentTexts={editedDictationSegments}
                  onEditedSegmentTextChange={(segmentId, text) => {
                    setEditedDictationSegments((current) => ({
                      ...current,
                      [segmentId]: text,
                    }));
                  }}
                  onAcceptSegment={(segmentId, text) => {
                    void handleAcceptDictationSegment(segmentId, text);
                  }}
                  onDiscardSegment={handleDiscardDictationSegment}
                  onContinueDictating={() => {
                    void handleStartDictation();
                  }}
                  onSelectSessionHistory={setSelectedDictationHistorySessionId}
                />
              </div>
            ) : null}

            {sourceWorkspaceMode === 'objective' ? (
              <div className="grid gap-4">
                <div className="workspace-subpanel rounded-[22px] p-3.5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/66">Provider add-on mode</div>
                      <div className="mt-1 text-base font-semibold text-white">Extra provider direction stays separate from the main source packet</div>
                      <p className="mt-1 max-w-2xl text-sm text-cyan-50/74">
                        Diagnosis codes, billing preference, plan wording, discharge language, and site-specific instructions can stay here without crowding the live visit note.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSourceWorkspaceModeChange('manual')}
                      className="aurora-secondary-button rounded-xl px-4 py-2 text-sm font-medium"
                    >
                      Back to manual
                    </button>
                  </div>
                </div>

                <SourceInput
                  label="Provider Add-On"
                  hint="Diagnosis or billing codes, preferred plan language, site-specific instructions, discharge wording, or anything important that does not fit the other fields."
                  value={sourceSections.objectiveData}
                  onChange={(value) => updateSourceSection('objectiveData', value)}
	                  placeholder="Add diagnosis codes, billing code preference, plan language, discharge wording, or site-specific instructions here."
	                  tone="addon"
	                  autoFocus
	                  compact
	                />
              </div>
            ) : null}
          </div>

		          <details className="hidden">
            <summary className="cursor-pointer text-sm font-semibold text-cyan-50">Preview combined source</summary>
            <div className="mt-4">
              <CombinedView value={sourceInput} />
            </div>
          </details>

	          <div className="hidden">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/70">Draft</div>
                <div className="mt-1 text-base font-semibold text-white">{hasSource ? 'Ready to generate' : 'Source needed'}</div>
                <p className="mt-1 max-w-2xl text-sm text-cyan-50/76">
                  {hasSource ? 'Generate from the current source packet.' : 'Paste, dictate, or upload source to start.'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-cyan-200/16 bg-[rgba(255,255,255,0.06)] px-3 py-1.5 text-xs font-medium text-cyan-50">
                  Missing info: {flagMissingInfo ? 'Flagged' : 'Off'}
                </span>
                <span className="rounded-full border border-cyan-200/16 bg-[rgba(255,255,255,0.06)] px-3 py-1.5 text-xs font-medium text-cyan-50">
                  Source-close: {keepCloserToSource ? 'On' : 'Off'}
                </span>
                <span className="rounded-full border border-cyan-200/16 bg-[rgba(255,255,255,0.06)] px-3 py-1.5 text-xs font-medium text-cyan-50">
                  Style: {outputStyle}
                </span>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  scrollToDraftControls();
                  void handleGenerate();
                }}
                disabled={isLoading || sourceCompletionCount === 0}
                className="aurora-primary-button rounded-xl px-5 py-3 font-medium disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? 'Generating draft...' : 'Generate Draft from Source'}
              </button>
              <a
                href="#generate-note-panel"
                onClick={(event) => {
                  event.preventDefault();
                  scrollToDraftControls();
                }}
                className="aurora-primary-button rounded-xl px-5 py-3 font-medium"
              >
                Open Draft Settings
              </a>
              <a
                href="#output-preferences-panel"
                onClick={(event) => {
                  event.preventDefault();
                  scrollToOutputPreferences();
                }}
                className="aurora-secondary-button rounded-xl px-5 py-3 font-medium"
              >
                Advanced Preferences
              </a>
            </div>
          </div>
        </div>
      </div>
      )}

              </div>

		              <div className="grid gap-4 xl:min-h-0 xl:overflow-hidden xl:pl-2">
	      {generatedSession ? (
	      <div id="generated-note-workspace" className="grid gap-4 xl:min-h-0 xl:max-h-[calc(100vh-9rem)] xl:overflow-y-auto xl:pr-1">
        <AtlasReviewDock
          statusLabel={atlasStatusLabel}
          detail={atlasDetail}
          noteType={generatedSession.noteType}
          sourceCompletionLabel={atlasSourceCompletionLabel}
          attentionCount={atlasAttentionCount}
          hasDraft={hasGeneratedDraft}
          actions={atlasReviewActions}
          assistantName={assistantPersona.name}
          assistantAvatar={assistantPersona.avatar}
        />
	        <ReviewWorkspace
	          initialSession={generatedSession}
	          embedded
	          onBackToEdit={handleReturnToCompose}
	        />
      </div>
      ) : (
      <div id="generated-note-workspace" className="workspace-panel flex flex-col rounded-[28px] p-4 text-sm text-cyan-50/72 xl:sticky xl:top-4 xl:max-h-[calc(100vh-9rem)] xl:min-h-[560px] xl:overflow-y-auto">
        <div className="rounded-[24px] border border-cyan-200/12 bg-[rgba(255,255,255,0.04)] p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100/64">Draft</div>
              <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-white">
                {isLoading ? 'Generating draft...' : hasSource ? 'Ready to generate.' : 'No draft yet.'}
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-cyan-50/70">
                {hasSource
                  ? 'Generate from the source on the left, then review the note here.'
                  : 'Paste, dictate, or upload source on the left to begin.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span title={noteType} className="max-w-[190px] truncate rounded-full border border-cyan-200/12 bg-white/[0.05] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.13em] text-cyan-50">
                {noteType}
              </span>
              <span className="rounded-full border border-cyan-200/12 bg-white/[0.05] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.13em] text-cyan-50">
                {sourceCompletionCount}/{sourceEntrySteps.length} fields
              </span>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                scrollToDraftControls();
                void handleGenerate();
              }}
              disabled={isLoading || sourceCompletionCount === 0}
              className="aurora-primary-button rounded-xl px-4 py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? 'Generating draft...' : 'Generate Draft from Source'}
            </button>
            <button
              type="button"
              onClick={() => scrollToComposeLane('source')}
              className="aurora-secondary-button rounded-xl px-4 py-2.5 text-sm font-medium"
            >
              Edit source
            </button>
            <button
              type="button"
              onClick={scrollToDraftControls}
              className="aurora-secondary-button rounded-xl px-4 py-2.5 text-sm font-medium"
            >
              Draft settings
            </button>
            <button
              type="button"
              onClick={handleLoadExample}
              className="aurora-secondary-button rounded-xl px-4 py-2.5 text-sm font-medium"
            >
              Load example
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-[20px] border border-cyan-200/10 bg-[rgba(255,255,255,0.035)] p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-100/60">{assistantPersona.name} Review</div>
          <div className="mt-1 text-base font-semibold text-white">{atlasStatusLabel}</div>
          <p className="mt-2 text-sm leading-6 text-cyan-50/68">
            {assistantPersona.name} becomes useful after a draft exists. Until then, keep the source clean and generate when the left pane reflects the encounter.
          </p>
        </div>

        <details className="mt-4 rounded-[20px] border border-cyan-200/10 bg-[rgba(255,255,255,0.03)] p-4">
          <summary className="cursor-pointer text-sm font-semibold text-cyan-50">What happens after generation?</summary>
          <div className="mt-3 grid gap-2 text-sm leading-6 text-cyan-50/70">
            <p>1. The generated note appears in this right pane.</p>
            <p>2. Source remains scrollable on the left for comparison.</p>
            <p>3. {assistantPersona.name} review and copy/export actions stay with the draft.</p>
          </div>
        </details>
      </div>
      )}
              </div>
            </div>

            <details
              open={showUnifiedWorkspace || activeComposeLane === 'support'}
              className={`${activeComposeLane === 'support' || activeComposeLane === 'finish' ? '' : 'hidden'} rounded-[22px] border border-cyan-200/12 bg-[rgba(7,18,32,0.42)] px-4 py-3 text-cyan-50/82`}
            >
              <summary className="cursor-pointer list-none">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/70">Support tools</div>
                    <div className="mt-1 text-sm font-semibold text-cyan-50">Advanced tools and reference</div>
                    <p className="mt-1 text-xs leading-5 text-cyan-50/68">
                      Open only when you want optional psychiatry helpers, structured support, or extra documentation detail.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <div className="rounded-full border border-cyan-200/14 bg-[rgba(13,30,50,0.58)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-50">
                      {activeSupportPanels} active
                    </div>
                    <div className="rounded-full border border-cyan-200/14 bg-[rgba(13,30,50,0.58)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-50">
                      Optional only
                    </div>
                  </div>
                </div>
              </summary>
              <div className="mt-4 grid gap-4">
                <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-4">
                  {supportOverviewItems.map((item) => (
                    <div key={item.id} className="rounded-[18px] border border-cyan-200/12 bg-[rgba(255,255,255,0.04)] px-4 py-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/60">{item.label}</div>
                      <div className="mt-1 text-sm font-semibold text-cyan-50">{item.value}</div>
                    </div>
                  ))}
                </div>
      {showUnifiedWorkspace || activeComposeLane === 'support' ? (
      <div id="support-panel" ref={registerComposeSection('psychiatry-starters')}>
      <CollapsibleFormSection
        title="Optional psychiatry starters"
        subtitle="Use one of these if you want a faster psychiatry-specific starting point after the core note setup is already chosen."
        toneClassName="border-violet-200 bg-violet-50 text-violet-950"
      >
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="font-semibold text-violet-950">Psychiatry starters</div>
            <p className="mt-1 text-sm leading-6 text-violet-900">
              These starters reflect common psychiatry documentation patterns. They are useful starting points, not universal defaults.
            </p>
            {activeProviderProfile ? (
              <p className="mt-2 text-xs font-medium text-violet-900">
                Showing strongest matches first for the active provider profile: {activeProviderProfile.name}
              </p>
            ) : null}
          </div>
          <div className="rounded-full border border-violet-200 bg-white px-3 py-1 text-xs font-medium text-violet-900">
            Optional
          </div>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {prioritizedWorkflowStarters.map((starter) => {
            const isProfileRecommended = Boolean(activeProviderProfile?.defaults.starterWorkflowIds.includes(starter.id));

            return (
            <div key={starter.id} className={`rounded-xl border bg-white p-4 shadow-sm ${isProfileRecommended ? 'border-violet-400 ring-1 ring-violet-200' : 'border-violet-200'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm font-semibold text-violet-950">{starter.title}</div>
                {isProfileRecommended ? (
                  <div className="rounded-full border border-violet-300 bg-violet-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-violet-950">
                    Profile fit
                  </div>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-violet-900">{starter.summary}</p>
              <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-violet-800">Review focus</div>
              <p className="mt-1 text-xs text-violet-900">{starter.reviewFocus}</p>
              <button
                onClick={() => handleLoadBlueprintStarter(starter.id)}
                className="mt-4 rounded-lg border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-950"
              >
                Load starter
              </button>
            </div>
          )})}
        </div>
      </CollapsibleFormSection>
      </div>
      ) : null}

      {showUnifiedWorkspace || activeComposeLane === 'support' ? (
      <div ref={registerComposeSection('medication-details')}>
      <CollapsibleFormSection
        title="Optional psychiatric medication details"
        subtitle="Open this if you want to enter a structured psych-med profile instead of relying only on free-text source parsing."
        toneClassName="border-cyan-200 bg-cyan-50 text-cyan-950"
        summaryTag="Structured support"
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-cyan-950">Current Psychiatric Medications</h2>
            <p className="mt-1 text-sm leading-6 text-cyan-900">
              Optional structured med-profile support. Use this when you want Veranote to check the patient’s psych-med list more directly instead of relying only on free-text source parsing.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="rounded-full border border-cyan-200 bg-white px-3 py-1 text-xs font-medium text-cyan-950">
              Review-first only
            </div>
            <ProvenancePill label="Medication reference" />
            <ProvenancePill label="Matching help" />
          </div>
        </div>
        <div className="mt-4 rounded-lg border border-cyan-200 bg-white p-3 text-sm text-cyan-900">
          These entries help with medication review, warning support, and draft fidelity. They do not replace medication reconciliation, prescribing judgment, or final compatibility review.
        </div>
        {medicationProfileHasUnresolved ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <div className="font-semibold">Medication trust reminder</div>
            <p className="mt-1 text-amber-900">
              The structured medication profile is still incomplete. Veranote should keep those gaps visible in the draft instead of guessing a cleaner regimen.
            </p>
            <div className="mt-3 space-y-2 text-sm text-amber-900">
              {medicationProfileGapSummary.unresolvedEntries.length ? (
                <div className="rounded-lg border border-amber-200 bg-white p-3">
                  Unresolved medication names: {medicationProfileGapSummary.unresolvedEntries.map((entry) => entry.rawName.trim()).join(', ')}.
                </div>
              ) : null}
              {medicationProfileGapSummary.missingRegimenEntries.length ? (
                <div className="rounded-lg border border-amber-200 bg-white p-3">
                  Missing dose or schedule detail for: {medicationProfileGapSummary.missingRegimenEntries.map((entry) => entry.normalizedDisplayName || entry.rawName.trim()).join(', ')}.
                </div>
              ) : null}
              {medicationProfileGapSummary.missingRouteEntries.length ? (
                <div className="rounded-lg border border-amber-200 bg-white p-3">
                  Route not recorded for: {medicationProfileGapSummary.missingRouteEntries.map((entry) => entry.normalizedDisplayName || entry.rawName.trim()).join(', ')}.
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        <div className="mt-4 space-y-4">
          {medicationProfile.map((entry) => (
            <div key={entry.id} className="rounded-xl border border-cyan-200 bg-white p-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Medication name">
                  <input
                    value={entry.rawName}
                    onChange={(event) => updateMedicationProfileEntry(entry.id, { rawName: event.target.value })}
                    className="w-full rounded-lg border border-border bg-white p-3"
                    placeholder="Example: sertraline"
                  />
                </Field>
                <Field label="Status">
                  <select
                    value={entry.status || 'current'}
                    onChange={(event) => updateMedicationProfileEntry(entry.id, { status: event.target.value as StructuredPsychMedicationProfileEntry['status'] })}
                    className="w-full rounded-lg border border-border bg-white p-3"
                  >
                    <option value="current">Current</option>
                    <option value="recently-stopped">Recently stopped</option>
                    <option value="prn">PRN</option>
                    <option value="unclear">Unclear</option>
                  </select>
                </Field>
                <Field label="Dose">
                  <input
                    value={entry.doseText || ''}
                    onChange={(event) => updateMedicationProfileEntry(entry.id, { doseText: event.target.value })}
                    className="w-full rounded-lg border border-border bg-white p-3"
                    placeholder="Example: 100 mg"
                  />
                </Field>
                <Field label="Schedule / frequency">
                  <input
                    value={entry.scheduleText || ''}
                    onChange={(event) => updateMedicationProfileEntry(entry.id, { scheduleText: event.target.value })}
                    className="w-full rounded-lg border border-border bg-white p-3"
                    placeholder="Example: daily"
                  />
                </Field>
                <Field label="Route">
                  <input
                    value={entry.route || ''}
                    onChange={(event) => updateMedicationProfileEntry(entry.id, { route: event.target.value })}
                    className="w-full rounded-lg border border-border bg-white p-3"
                    placeholder="Example: oral"
                  />
                </Field>
                <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-3 text-xs text-cyan-900">
                  <div className="mb-2 flex flex-wrap gap-2">
                    <ProvenancePill label="Medication matching" />
                    <ProvenancePill label="Unresolved stays visible" />
                  </div>
                  {entry.normalizedDisplayName ? (
                    <>Matched to medication reference as <span className="font-semibold">{entry.normalizedDisplayName}</span>.</>
                  ) : entry.rawName ? (
                    <>Not yet matched to the medication reference. Veranote will keep this visible as unresolved rather than pretending it normalized it.</>
                  ) : (
                    <>Enter a medication name to try a reference match.</>
                  )}
                </div>
                <label className="md:col-span-2 grid gap-2 text-sm font-medium text-ink">
                  <span>Adherence / side effects / comment</span>
                  <div className="grid gap-3 md:grid-cols-3">
                    <input
                      value={entry.adherenceNote || ''}
                      onChange={(event) => updateMedicationProfileEntry(entry.id, { adherenceNote: event.target.value })}
                      className="w-full rounded-lg border border-border bg-white p-3"
                      placeholder="Adherence note"
                    />
                    <input
                      value={entry.sideEffectNote || ''}
                      onChange={(event) => updateMedicationProfileEntry(entry.id, { sideEffectNote: event.target.value })}
                      className="w-full rounded-lg border border-border bg-white p-3"
                      placeholder="Side-effect note"
                    />
                    <input
                      value={entry.clinicianComment || ''}
                      onChange={(event) => updateMedicationProfileEntry(entry.id, { clinicianComment: event.target.value })}
                      className="w-full rounded-lg border border-border bg-white p-3"
                      placeholder="Clinician comment"
                    />
                  </div>
                </label>
              </div>
              <div className="mt-3">
                <button
                  onClick={() => removeMedicationProfileEntry(entry.id)}
                  className="rounded-lg border border-cyan-200 bg-white px-4 py-2 text-sm font-medium text-cyan-950"
                >
                  Remove medication
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={addMedicationProfileEntry}
            className="rounded-lg border border-cyan-200 bg-white px-4 py-2 text-sm font-medium text-cyan-950"
          >
            Add psych medication
          </button>
        </div>
        {medicationProfileSummary.length ? (
          <div className="mt-4 rounded-xl border border-cyan-200 bg-white p-4">
            <div className="text-sm font-semibold text-cyan-950">Current med-profile summary</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {medicationProfileSummary.map((item) => (
                <div key={item} className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-950">
                  {item}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </CollapsibleFormSection>
      </div>
      ) : null}

      {showUnifiedWorkspace || activeComposeLane === 'support' ? (
      <div ref={registerComposeSection('diagnosis-details')}>
      <CollapsibleFormSection
        title="Optional diagnosis and assessment details"
        subtitle="Open this if you want extra support for working impressions, differentials, historical labels, or timeframe-sensitive diagnoses."
        toneClassName="border-rose-200 bg-rose-50 text-rose-950"
        summaryTag="Structured support"
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-rose-950">Current Diagnostic Impression / Assessment Frame</h2>
            <p className="mt-1 text-sm leading-6 text-rose-900">
              Optional structured diagnosis support for working impressions, historical labels, rule-outs, and differential thinking. Use this to keep assessment language honest and explicitly uncertainty-aware.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="rounded-full border border-rose-200 bg-white px-3 py-1 text-xs font-medium text-rose-950">
              Preserve uncertainty
            </div>
            <ProvenancePill label="Diagnosis reference" />
            <ProvenancePill label="Timeframe + differential help" />
          </div>
        </div>
        <div className="mt-4 rounded-lg border border-rose-200 bg-white p-3 text-sm text-rose-900">
          These entries support assessment framing, not final coding truth. Veranote should preserve historical labels, differentials, rule-outs, and timeframe limits instead of upgrading them into cleaner certainty.
        </div>
        {diagnosisProfileHasUnresolved ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <div className="font-semibold">Assessment trust reminder</div>
            <p className="mt-1 text-amber-900">
              One or more diagnosis entries are still unresolved against the diagnosis reference. That should make the assessment more cautious, not more confident.
            </p>
          </div>
        ) : null}
        <div className="mt-4 space-y-4">
          {diagnosisProfile.map((entry) => (
            <div key={entry.id} className="rounded-xl border border-rose-200 bg-white p-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2 text-sm font-medium text-ink">
                  <span>Diagnosis / formulation label</span>
                  <div className="grid gap-3">
                    <input
                      list={`diagnosis-suggestions-${entry.id}`}
                      value={entry.rawLabel}
                      onChange={(event) => updateDiagnosisProfileEntry(entry.id, { rawLabel: event.target.value })}
                      className="w-full rounded-lg border border-border bg-white p-3"
                      placeholder="Example: major depressive disorder, rule out bipolar II"
                    />
                    <datalist id={`diagnosis-suggestions-${entry.id}`}>
                      {listDiagnosisSuggestions(entry.familyFocus).map((suggestion) => (
                        <option key={`${entry.id}-${suggestion}`} value={suggestion} />
                      ))}
                    </datalist>
                    <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-xs text-rose-900">
                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div className="font-semibold">Diagnosis family suggestions</div>
                        <div className="flex flex-wrap gap-2">
                          <ProvenancePill label="Family guide" />
                          <ProvenancePill label="Suggestions only" />
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {diagnosisCategoryQuickPicks.map((category) => {
                          const isActive = entry.familyFocus === category;
                          return (
                            <button
                              key={`${entry.id}-${category}`}
                              type="button"
                              onClick={() => updateDiagnosisProfileEntry(entry.id, { familyFocus: isActive ? '' : category })}
                              className={`rounded-full border px-3 py-1 text-[11px] font-medium ${
                                isActive
                                  ? 'border-rose-300 bg-white text-rose-950'
                                  : 'border-rose-200 bg-rose-100 text-rose-900'
                              }`}
                            >
                              {category}
                            </button>
                          );
                        })}
                      </div>
                      <div className="mt-2 text-rose-800">
                        {entry.familyFocus?.trim()
                          ? `Suggestions are currently filtered to ${entry.familyFocus}.`
                          : 'Pick a family to narrow suggestions without auto-confirming a diagnosis.'}
                      </div>
                      {entry.familyFocus?.trim() ? (
                        <div className="mt-3">
                          <div className="font-semibold text-rose-950">Quick suggestions</div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {listDiagnosisSuggestions(entry.familyFocus).slice(0, 8).map((suggestion) => (
                              <button
                                key={`${entry.id}-${entry.familyFocus}-${suggestion}`}
                                type="button"
                                onClick={() => updateDiagnosisProfileEntry(entry.id, { rawLabel: suggestion })}
                                className="rounded-full border border-rose-200 bg-white px-3 py-1 text-[11px] font-medium text-rose-950"
                              >
                                {suggestion}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
                <Field label="Status">
                  <select
                    value={entry.status || 'current-working'}
                    onChange={(event) => updateDiagnosisProfileEntry(entry.id, { status: event.target.value as StructuredPsychDiagnosisProfileEntry['status'] })}
                    className="w-full rounded-lg border border-border bg-white p-3"
                  >
                    <option value="current-working">Current working impression</option>
                    <option value="historical">Historical label</option>
                    <option value="rule-out">Rule out</option>
                    <option value="differential">Differential / possible</option>
                    <option value="symptom-level">Symptom-level only</option>
                  </select>
                </Field>
                <Field label="Certainty">
                  <select
                    value={entry.certainty || 'unclear'}
                    onChange={(event) => updateDiagnosisProfileEntry(entry.id, { certainty: event.target.value as StructuredPsychDiagnosisProfileEntry['certainty'] })}
                    className="w-full rounded-lg border border-border bg-white p-3"
                  >
                    <option value="unclear">Unclear</option>
                    <option value="low">Low</option>
                    <option value="moderate">Moderate</option>
                    <option value="high">High</option>
                  </select>
                </Field>
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-xs text-rose-900">
                  <div className="mb-2 flex flex-wrap gap-2">
                    <ProvenancePill label="Diagnosis matching" />
                    <ProvenancePill label="Unresolved stays visible" />
                  </div>
                  {entry.normalizedDisplayName ? (
                    <>Matched to diagnosis reference as <span className="font-semibold">{entry.normalizedDisplayName}</span>{entry.category ? ` (${entry.category})` : ''}.</>
                  ) : entry.rawLabel ? (
                    <>Not yet matched to the diagnosis reference. Veranote will keep this visible as unresolved instead of pretending it normalized it.</>
                  ) : (
                    <>Enter a diagnosis or formulation label to try a reference match.</>
                  )}
                </div>
                {entry.normalizedDisplayName ? (() => {
                  const timeframeRule = getTimeframeRuleForDiagnosis(entry.normalizedDisplayName);
                  const differentialCaution = getDifferentialCautionForDiagnosis(entry.normalizedDisplayName);

                  if (!timeframeRule && !differentialCaution) {
                    return null;
                  }

                  return (
                    <div className="md:col-span-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-xs text-rose-900">
                      <div className="mb-2 flex flex-wrap gap-2">
                        {timeframeRule ? <ProvenancePill label="Timeframe guidance" /> : null}
                        {differentialCaution ? <ProvenancePill label="Differential guidance" /> : null}
                      </div>
                      {timeframeRule ? (
                        <div>
                          <span className="font-semibold">Timeframe helper:</span> {timeframeRule.minimum_duration_timeframe}
                        </div>
                      ) : null}
                      {timeframeRule ? (
                        <div className="mt-1 text-rose-800">
                          Why this matters: {timeframeRule.common_product_failure_mode_if_ignored}
                        </div>
                      ) : null}
                      {differentialCaution ? (
                        <div className={timeframeRule ? 'mt-2 text-rose-800' : 'text-rose-800'}>
                          <span className="font-semibold">Differential caution:</span> {differentialCaution.when_app_should_preserve_uncertainty}
                        </div>
                      ) : null}
                    </div>
                  );
                })() : null}
                {(() => {
                  const guidance = getDiagnosisStatusGuidance(entry.status, entry.certainty);

                  return (
                    <div className="md:col-span-2 rounded-lg border border-rose-200 bg-white px-3 py-3 text-xs text-rose-900">
                      <div className="mb-2 flex flex-wrap gap-2">
                        <ProvenancePill label="Wording guidance" />
                      </div>
                      <div className="font-semibold">{guidance.title}</div>
                      <div className="mt-1 text-rose-800">{guidance.text}</div>
                    </div>
                  );
                })()}
                <Field label="Timeframe / episode note">
                  <input
                    value={entry.timeframeNote || ''}
                    onChange={(event) => updateDiagnosisProfileEntry(entry.id, { timeframeNote: event.target.value })}
                    className="w-full rounded-lg border border-border bg-white p-3"
                    placeholder="Example: depressive symptoms 3 weeks; no clear hypomanic episode documented"
                  />
                </Field>
                <label className="md:col-span-2 grid gap-2 text-sm font-medium text-ink">
                  <span>Evidence / uncertainty / comment</span>
                  <div className="grid gap-3 md:grid-cols-2">
                    <input
                      value={entry.evidenceNote || ''}
                      onChange={(event) => updateDiagnosisProfileEntry(entry.id, { evidenceNote: event.target.value })}
                      className="w-full rounded-lg border border-border bg-white p-3"
                      placeholder="What supports or limits this impression?"
                    />
                    <input
                      value={entry.clinicianComment || ''}
                      onChange={(event) => updateDiagnosisProfileEntry(entry.id, { clinicianComment: event.target.value })}
                      className="w-full rounded-lg border border-border bg-white p-3"
                      placeholder="Clinician comment or differential note"
                    />
                  </div>
                </label>
              </div>
              <div className="mt-3">
                <button
                  onClick={() => removeDiagnosisProfileEntry(entry.id)}
                  className="rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm font-medium text-rose-950"
                >
                  Remove diagnosis entry
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={addDiagnosisProfileEntry}
            className="rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm font-medium text-rose-950"
          >
            Add diagnosis / assessment entry
          </button>
        </div>
        {diagnosisProfileHasUnresolved ? (
          <div className="mt-4 rounded-lg border border-rose-200 bg-white p-3 text-xs text-rose-900">
            Some diagnosis entries are not matched to the diagnosis reference yet. That is okay. Veranote should keep the uncertainty visible instead of forcing a false normalization.
          </div>
        ) : null}
        {diagnosisProfileSummary.length ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-white p-4">
            <div className="text-sm font-semibold text-rose-950">Current diagnosis-profile summary</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {diagnosisProfileSummary.map((item) => (
                <div key={item} className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-medium text-rose-950">
                  {item}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </CollapsibleFormSection>
      </div>
      ) : null}

      {showUnifiedWorkspace || activeComposeLane === 'support' ? (
      <div ref={registerComposeSection('encounter-details')}>
      <CollapsibleFormSection
        title="Optional encounter and documentation details"
        subtitle="Open this when telehealth, psychotherapy time, crisis timing, or other documentation-support details need to be carried into review."
        toneClassName="border-amber-200 bg-amber-50 text-amber-950"
        summaryTag="Documentation support"
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-amber-950">{encounterSupportConfig.title}</h2>
            <p className="mt-1 text-sm leading-6 text-amber-900">{encounterSupportConfig.intro}</p>
          </div>
          <div className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-medium text-amber-950">
            Assistive only
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {encounterSupportConfig.codeFamilies.map((item) => (
            <div key={item} className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-medium text-amber-950">
              {item}
            </div>
          ))}
        </div>
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-amber-900">
          {encounterSupportConfig.reminders.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Service date">
            <input
              type="date"
              value={encounterSupport.serviceDate || ''}
              onChange={(event) => updateEncounterSupport('serviceDate', event.target.value)}
              className="w-full rounded-lg border border-border bg-white p-3"
            />
          </Field>
          {encounterSupportConfig.showTimeFields ? (
            <Field label="Total documented minutes">
              <input
                value={encounterSupport.totalMinutes || ''}
                onChange={(event) => updateEncounterSupport('totalMinutes', event.target.value)}
                className="w-full rounded-lg border border-border bg-white p-3"
                placeholder="Example: 40"
              />
            </Field>
          ) : null}
          {encounterSupportConfig.showPsychotherapyFields ? (
            <Field label="Psychotherapy minutes">
              <input
                value={encounterSupport.psychotherapyMinutes || ''}
                onChange={(event) => updateEncounterSupport('psychotherapyMinutes', event.target.value)}
                className="w-full rounded-lg border border-border bg-white p-3"
                placeholder="Enter only if separately documented"
              />
            </Field>
          ) : null}
          {encounterSupportConfig.showTimeFields ? (
            <Field label="Visit start / end (optional)">
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  type="time"
                  value={encounterSupport.sessionStartTime || ''}
                  onChange={(event) => updateEncounterSupport('sessionStartTime', event.target.value)}
                  className="w-full rounded-lg border border-border bg-white p-3"
                />
                <input
                  type="time"
                  value={encounterSupport.sessionEndTime || ''}
                  onChange={(event) => updateEncounterSupport('sessionEndTime', event.target.value)}
                  className="w-full rounded-lg border border-border bg-white p-3"
                />
              </div>
            </Field>
          ) : null}
        </div>

        {encounterSupportConfig.showTelehealthFields ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Telehealth modality">
              <select
                value={encounterSupport.telehealthModality || 'audio-video'}
                onChange={(event) => updateEncounterSupport('telehealthModality', event.target.value as EncounterSupport['telehealthModality'])}
                className="w-full rounded-lg border border-border bg-white p-3"
              >
                <option value="audio-video">Audio-video</option>
                <option value="audio-only">Audio-only</option>
                <option value="in-person">In-person</option>
                <option value="not-applicable">Not applicable</option>
              </select>
            </Field>
            <Field label="Patient location">
              <input
                value={encounterSupport.patientLocation || ''}
                onChange={(event) => updateEncounterSupport('patientLocation', event.target.value)}
                className="w-full rounded-lg border border-border bg-white p-3"
                placeholder="Example: home in Illinois"
              />
            </Field>
            <Field label="Provider location">
              <input
                value={encounterSupport.providerLocation || ''}
                onChange={(event) => updateEncounterSupport('providerLocation', event.target.value)}
                className="w-full rounded-lg border border-border bg-white p-3"
                placeholder="Example: clinic office"
              />
            </Field>
            <Field label="Emergency contact / local safety support">
              <input
                value={encounterSupport.emergencyContact || ''}
                onChange={(event) => updateEncounterSupport('emergencyContact', event.target.value)}
                className="w-full rounded-lg border border-border bg-white p-3"
                placeholder="Family member, local support, or mobile crisis contact"
              />
            </Field>
            <label className="md:col-span-2 flex items-start gap-3 rounded-lg border border-amber-200 bg-white p-3 text-sm text-amber-950">
              <input
                type="checkbox"
                checked={Boolean(encounterSupport.telehealthConsent)}
                onChange={(event) => updateEncounterSupport('telehealthConsent', event.target.checked)}
              />
              <span>Telehealth consent documented</span>
            </label>
          </div>
        ) : null}

        {encounterSupportConfig.showInteractiveComplexity ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-white p-4">
            <label className="flex items-start gap-3 text-sm text-amber-950">
              <input
                type="checkbox"
                checked={Boolean(encounterSupport.interactiveComplexity)}
                onChange={(event) => updateEncounterSupport('interactiveComplexity', event.target.checked)}
              />
              <span>Interactive complexity support may be relevant for this encounter</span>
            </label>
            {encounterSupport.interactiveComplexity ? (
              <textarea
                value={encounterSupport.interactiveComplexityReason || ''}
                onChange={(event) => updateEncounterSupport('interactiveComplexityReason', event.target.value)}
                className="mt-3 min-h-[90px] w-full rounded-lg border border-border p-3"
                placeholder="Briefly note the communication barrier, third-party dynamic, safety issue, or other factor."
              />
            ) : null}
          </div>
        ) : null}

        {encounterSupportConfig.showCrisisFields ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Crisis start time">
              <input
                type="time"
                value={encounterSupport.crisisStartTime || ''}
                onChange={(event) => updateEncounterSupport('crisisStartTime', event.target.value)}
                className="w-full rounded-lg border border-border bg-white p-3"
              />
            </Field>
            <Field label="Crisis end time">
              <input
                type="time"
                value={encounterSupport.crisisEndTime || ''}
                onChange={(event) => updateEncounterSupport('crisisEndTime', event.target.value)}
                className="w-full rounded-lg border border-border bg-white p-3"
              />
            </Field>
            <label className="md:col-span-2 grid gap-2 text-sm font-medium text-ink">
              <span>Crisis interventions / actions</span>
              <textarea
                value={encounterSupport.crisisInterventionSummary || ''}
                onChange={(event) => updateEncounterSupport('crisisInterventionSummary', event.target.value)}
                className="min-h-[110px] rounded-lg border border-border p-3"
                placeholder="De-escalation, safety planning, collateral contact, ED escalation, crisis resources, disposition boundaries."
              />
            </label>
          </div>
        ) : null}

        {encounterSupportSummary.length ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-white p-4">
            <div className="text-sm font-semibold text-amber-950">Current encounter summary</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {encounterSupportSummary.map((item) => (
                <div key={item} className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-950">
                  {item}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </CollapsibleFormSection>
      </div>
      ) : null}
              </div>
            </details>

      {showUnifiedWorkspace || activeComposeLane === 'finish' ? (
        <div className="grid gap-4">
          <div
            id="generate-note-panel"
            ref={registerComposeSection('finish-actions')}
            className="rounded-[26px] border border-cyan-200/12 bg-[linear-gradient(145deg,rgba(4,12,24,0.96),rgba(8,32,58,0.92))] p-5 shadow-[0_22px_56px_rgba(4,12,24,0.28)]"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/80">Draft</div>
                <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-white">Generate Draft from Source</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-cyan-50/78">
                  Generate once, then review before copying.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="rounded-full border border-cyan-200/16 bg-[rgba(255,255,255,0.08)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-50">
                  {noteType}
                </div>
                <div className="rounded-full border border-cyan-200/16 bg-[rgba(255,255,255,0.08)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-50">
                  {outputScope.replace('-', ' ')}
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {currentCheckpoint ? (
                <div className="w-full rounded-[22px] border border-cyan-200/14 bg-[rgba(255,255,255,0.06)] p-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/76">Current recovery checkpoint</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <div className="text-base font-semibold text-white">
	                        {currentCheckpoint.note?.trim() ? 'Draft saved' : 'Source checkpoint saved'}
                        </div>
                        {currentCheckpoint.draftVersion ? (
                          <span className="rounded-full border border-cyan-200/16 bg-[rgba(255,255,255,0.05)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-50">
                            v{currentCheckpoint.draftVersion}
                          </span>
                        ) : null}
                        <span className="rounded-full border border-cyan-200/16 bg-[rgba(255,255,255,0.05)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-50">
                          {currentCheckpoint.recoveryState?.workflowStage === 'review' ? 'Review' : 'Compose'}
                        </span>
                        <span className="rounded-full border border-cyan-200/16 bg-[rgba(255,255,255,0.05)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-50">
                          {draftCheckpointStatus === 'saving' ? 'Saving' : draftCheckpointStatus === 'error' ? 'Local only' : `Saved ${formatRelativeCheckpointTime(currentCheckpoint.lastSavedAt || currentCheckpoint.recoveryState?.updatedAt)}`}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-cyan-50/78">
                        {currentCheckpoint.note?.trim()
                          ? 'You already have a generated note for this workspace. Keep reviewing here, or jump back to the saved compose step without leaving the page.'
                          : 'This workspace is carrying a saved compose checkpoint. You can keep editing in place, reset for a new note, or discard this checkpoint entirely.'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleResumeCurrentCheckpoint}
                        className="rounded-xl border border-cyan-200/16 bg-[rgba(255,255,255,0.08)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[rgba(255,255,255,0.12)]"
                      >
	                        Continue Draft
                      </button>
                      {currentCheckpoint.note?.trim() ? (
                        <button
                          type="button"
                          onClick={() => {
                            setGeneratedSession(currentCheckpoint);
                            setWorkflowStage('review');
                            requestAnimationFrame(() => {
                              document.getElementById('generated-note-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            });
                          }}
                          className="rounded-xl border border-cyan-200/16 bg-[rgba(255,255,255,0.08)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[rgba(255,255,255,0.12)]"
                        >
                          Open Draft Review
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={recoveryActionState !== 'idle'}
                        onClick={() => void handleArchiveAndStartFresh()}
                        className="rounded-xl border border-cyan-200/16 bg-[rgba(255,255,255,0.08)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[rgba(255,255,255,0.12)] disabled:opacity-60"
                      >
                        {recoveryActionState === 'archiving' ? 'Archiving...' : 'Archive and start fresh'}
                      </button>
                      <button
                        type="button"
                        disabled={recoveryActionState !== 'idle'}
                        onClick={() => void handleDiscardCheckpoint()}
                        className="rounded-xl border border-red-300/30 bg-red-400/10 px-4 py-2 text-sm font-medium text-red-100 transition hover:bg-red-400/18 disabled:opacity-60"
                      >
                        {recoveryActionState === 'discarding' ? 'Discarding...' : 'Discard checkpoint'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
              <span className="rounded-full border border-cyan-200/14 bg-[rgba(255,255,255,0.05)] px-3 py-1.5 text-xs font-medium text-cyan-50">
                Style: {outputStyle}
              </span>
              <span className="rounded-full border border-cyan-200/14 bg-[rgba(255,255,255,0.05)] px-3 py-1.5 text-xs font-medium text-cyan-50">
                Format: {format}
              </span>
              <span className="rounded-full border border-cyan-200/14 bg-[rgba(255,255,255,0.05)] px-3 py-1.5 text-xs font-medium text-cyan-50">
                Sections: {sectionPlan.sections.length ? sectionPlan.sections.map((section) => SECTION_LABELS[section]).join(' • ') : 'None'}
              </span>
              {activePreset ? (
                <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-100">
                  Preset: {activePreset.name}
                </span>
              ) : null}
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-3">
              <label className="rounded-[20px] border border-cyan-200/12 bg-[rgba(255,255,255,0.05)] p-4 text-sm text-cyan-50">
                <div className="flex items-start gap-3">
                  <input type="checkbox" checked={flagMissingInfo} onChange={(event) => setFlagMissingInfo(event.target.checked)} />
                  <div>
                    <div className="font-semibold text-white">Keep missing details visible</div>
                    <p className="mt-1 text-xs leading-5 text-cyan-50/70">Preserve gaps instead of smoothing thin source into cleaner prose.</p>
                  </div>
                </div>
              </label>
              <label className="rounded-[20px] border border-cyan-200/12 bg-[rgba(255,255,255,0.05)] p-4 text-sm text-cyan-50">
                <div className="flex items-start gap-3">
                  <input type="checkbox" checked={keepCloserToSource} onChange={(event) => setKeepCloserToSource(event.target.checked)} />
                  <div>
                    <div className="font-semibold text-white">Stay closer to source wording</div>
                    <p className="mt-1 text-xs leading-5 text-cyan-50/70">Favor fidelity over polish when the source is messy, partial, or conflicting.</p>
                  </div>
                </div>
              </label>
              <div className="rounded-[20px] border border-cyan-200/12 bg-[rgba(255,255,255,0.05)] p-4 text-sm text-cyan-50">
                <div className="font-semibold text-white">Fact-preserving mode</div>
                <p className="mt-1 text-xs leading-5 text-cyan-50/70">
                  Unsupported findings and treatment details stay out. Final trust still comes from review against source.
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-[20px] border border-cyan-200/12 bg-[rgba(255,255,255,0.05)] p-4">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/62">Before you generate</div>
                  <div className="mt-1 text-sm leading-6 text-cyan-50/76">
                    Veranote stays light here: one last compose check before the first draft.
                  </div>
                </div>
                <div className="text-xs text-cyan-50/58">
                  {composeNudges.some((item) => item.tone === 'warning' || item.tone === 'danger') ? 'A little more source detail would make review smoother.' : 'Compose looks healthy enough to draft.'}
                </div>
              </div>
              <div className="mt-3 grid gap-3 lg:grid-cols-3">
                {composeNudges.slice(0, 3).map((item) => (
                  <div key={item.id} className={`rounded-[16px] border px-4 py-3 ${getWorkflowSignalClasses(item.tone)}`}>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em]">{item.label}</div>
                    <div className="mt-2 text-sm leading-6 opacity-90">{item.detail}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button onClick={handleGenerate} disabled={isLoading || !hasSource} className="aurora-primary-button rounded-xl px-5 py-3 font-medium shadow-[0_18px_40px_rgba(2,8,18,0.22)] disabled:cursor-not-allowed disabled:opacity-60">
	                {isLoading ? 'Generating draft...' : 'Generate Draft from Source'}
	              </button>
	              <button onClick={handleClear} className="aurora-secondary-button rounded-xl px-5 py-3 font-medium">Clear Workspace</button>
	              <button onClick={handleLoadExample} className="aurora-secondary-button rounded-xl px-5 py-3 font-medium">Load Example Source</button>
            </div>

            <div className="mt-4 rounded-[18px] border border-cyan-200/12 bg-[rgba(255,255,255,0.05)] px-4 py-3 text-sm text-cyan-50/82">
              Destination fit before generation: <span className="font-semibold text-white">{destinationFitSummary}</span>
            </div>

            {recoveryMessage ? (
              <div className="mt-4 rounded-xl border border-cyan-200/14 bg-[rgba(255,255,255,0.05)] px-4 py-3 text-sm text-cyan-50/84">
                {recoveryMessage}
              </div>
            ) : null}

            <div className="mt-4 text-sm text-cyan-50/76">
              Review opens here after generation so dates, meds, quoted statements, objective data, and wording can be checked before anything is copied or exported.
            </div>
          </div>

          <div
            id="output-preferences-panel"
            ref={registerComposeSection('output-preferences')}
            className={`transition-all ${jumpHighlightTarget === 'output-preferences' || jumpHighlightTarget === 'site-presets' ? 'rounded-[28px] ring-2 ring-cyan-300/40 shadow-[0_0_0_4px_rgba(34,211,238,0.1)]' : ''}`}
          >
            <details ref={outputPreferencesDetailsRef} className="rounded-[24px] border border-white/75 bg-white/78 p-4 shadow-md backdrop-blur-xl">
              <summary className="cursor-pointer list-none">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Prompt settings</div>
                    <div className="mt-1 text-base font-semibold text-slate-950">My Note Prompt, presets, and output preferences</div>
                    <p className="mt-1 text-sm text-slate-600">
                      Open when you want reusable instructions for how this note type should be written.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700">
                      {noteTypePresets.length} preset{noteTypePresets.length === 1 ? '' : 's'}
                    </div>
                    <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700">
                      Style: {outputStyle}
                    </div>
                  </div>
                </div>
              </summary>

              <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <div className="grid gap-4">
                  <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-slate-950">Partner Setup</div>
                        <p className="mt-1 text-xs leading-5 text-slate-600">
                          Personalize the helper name and avatar without changing the clinical logic behind Veranote review.
                        </p>
                      </div>
                      <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700">
                        Verified by Veranote
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 2xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)]">
                      <div className="grid gap-4">
                        <label className="grid gap-2 text-sm font-medium text-slate-900">
                          <span>Assistant name</span>
                          <input
                            value={providerSettings.userAiName}
                            onChange={(event) => setProviderSettings((current) => ({ ...current, userAiName: event.target.value }))}
                            onBlur={() => void persistAssistantPersonaPatch({ userAiName: providerSettings.userAiName })}
                            maxLength={28}
                            className="w-full rounded-lg border border-border bg-white p-3"
                            placeholder="Assistant"
                          />
                          <span className="text-[11px] leading-5 text-slate-500">Used only in the UI. Clinical reasoning and safety stay the same.</span>
                        </label>

                        <label className="grid gap-2 text-sm font-medium text-slate-900">
                          <span>Role label</span>
                          <input
                            value={providerSettings.userAiRole}
                            onChange={(event) => setProviderSettings((current) => ({ ...current, userAiRole: event.target.value }))}
                            onBlur={() => void persistAssistantPersonaPatch({ userAiRole: providerSettings.userAiRole })}
                            maxLength={32}
                            className="w-full rounded-lg border border-border bg-white p-3"
                            placeholder="Clinical Assistant"
                          />
                          <span className="text-[11px] leading-5 text-slate-500">Optional. Leave blank if you only want the personalized name.</span>
                        </label>

                        <div>
                          <div className="text-sm font-medium text-slate-900">Avatar</div>
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            {assistantAvatarOptions.map((option) => {
                              const isSelected = assistantPersona.avatar === option.id;

                              return (
                                <button
                                  key={option.id}
                                  type="button"
                                  onClick={() => void persistAssistantPersonaPatch({ userAiAvatar: option.id })}
                                  className={`rounded-[18px] border p-3 text-left transition ${
                                    isSelected
                                      ? 'border-cyan-300 bg-cyan-50 shadow-[0_18px_40px_rgba(34,211,238,0.12)]'
                                      : 'border-slate-200 bg-white hover:border-cyan-200 hover:bg-cyan-50/60'
                                  }`}
                                >
                                  <div className="flex items-center gap-3">
                                    <AssistantPersonaAvatar
                                      avatar={option.id}
                                      label={option.label}
                                      size="sm"
                                      selected={isSelected}
                                    />
                                    <div>
                                      <div className="text-sm font-semibold text-slate-900">{option.label}</div>
                                      <div className="mt-1 text-[11px] leading-5 text-slate-500">{option.description}</div>
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-[20px] border border-cyan-200/20 bg-[linear-gradient(145deg,rgba(4,12,24,0.96),rgba(8,32,58,0.92))] p-4">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/70">Preview</div>
                        <div className="mt-4 flex items-center gap-3">
                          <AssistantPersonaAvatar avatar={assistantPersona.avatar} label={assistantPersona.name} size="md" />
                          <div>
                            <div className="text-lg font-semibold text-white">Ask {assistantPersona.name}</div>
                            <div className="text-sm text-cyan-50/78">{assistantPersona.role || 'No role label shown'}</div>
                          </div>
                        </div>
                        <div className="mt-4 rounded-[16px] border border-cyan-200/12 bg-[rgba(255,255,255,0.06)] px-3 py-3 text-sm text-cyan-50/82">
                          <div className="font-semibold text-white">Drafted by {assistantPersona.name}</div>
                          <div className="mt-1 text-xs uppercase tracking-[0.14em] text-cyan-100/70">Verified by Veranote</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-slate-950">Provider memory and preferences</div>
                        <p className="mt-1 text-xs leading-5 text-slate-600">
                          This keeps continuity visible across note types, saved site presets, and remembered workflow habits so providers do not have to reteach the system every session.
                        </p>
                      </div>
                      <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700">
                        {rememberedWorkflowFacts.length ? `${rememberedWorkflowFacts.length} remembered workflow note${rememberedWorkflowFacts.length === 1 ? '' : 's'}` : 'Learning from current workflow'}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-[16px] border border-slate-200 bg-white px-4 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Note-type presets</div>
                        <div className="mt-2 text-sm font-semibold text-slate-950">{noteTypePresets.length}</div>
                        <div className="mt-1 text-xs leading-5 text-slate-600">Reusable prompt/preset options tied to {noteType}.</div>
                      </div>
                      <div className="rounded-[16px] border border-slate-200 bg-white px-4 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Site presets</div>
                        <div className="mt-2 text-sm font-semibold text-slate-950">{visibleOutputProfiles.length}</div>
                        <div className="mt-1 text-xs leading-5 text-slate-600">Saved site/EHR workflows providers can switch between quickly.</div>
                      </div>
                      <div className="rounded-[16px] border border-slate-200 bg-white px-4 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Active note preference</div>
                        <div className="mt-2 text-sm font-semibold text-slate-950">{activePreset?.name || 'No note preset selected'}</div>
                        <div className="mt-1 text-xs leading-5 text-slate-600">Current note-type preference that will shape this draft.</div>
                      </div>
                      <div className="rounded-[16px] border border-slate-200 bg-white px-4 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Active site preference</div>
                        <div className="mt-2 text-sm font-semibold text-slate-950">{visibleActiveOutputProfile?.name || 'No site preset selected'}</div>
                        <div className="mt-1 text-xs leading-5 text-slate-600">Current destination behavior Veranote is formatting toward.</div>
                      </div>
                    </div>

                    {rememberedWorkflowFacts.length ? (
                      <div className="mt-4 grid gap-2">
                        {rememberedWorkflowFacts.map((fact) => (
                          <div key={fact.key} className="rounded-[14px] border border-slate-200 bg-white px-3 py-2.5">
                            <div className="text-sm leading-6 text-slate-900">{fact.fact}</div>
                            <div className="mt-1 text-[11px] text-slate-500">
                              Seen {fact.count} time{fact.count === 1 ? '' : 's'}{fact.lastSeenAt ? ` • last updated ${new Date(fact.lastSeenAt).toLocaleDateString()}` : ''}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-4 rounded-[16px] border border-dashed border-slate-200 bg-white p-3 text-sm leading-6 text-slate-600">
                        {assistantPersona.name} has not learned many explicit workflow notes yet. As repeated habits show up, they will appear here and in {assistantPersona.name}’s memory center.
                      </div>
                    )}
                  </div>

                  <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-slate-950">Output preferences</div>
                        <p className="mt-1 text-xs leading-5 text-slate-600">
                          These settings stay scoped to the current note type so evals, progress notes, and follow-ups can behave differently.
                        </p>
                      </div>
                      <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700">
                        Current note type: {noteType}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <Field label="Saved prompt / preset">
                        <select value={selectedPresetId} onChange={(event) => handlePresetChange(event.target.value)} className="w-full rounded-lg border border-border bg-white p-3">
                          <option value="">No saved prompt for this note type</option>
                          {noteTypePresets.map((preset) => (
                            <option key={preset.id} value={preset.id}>{preset.name}{preset.locked ? ' • Starter' : ''}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Output scope">
                        <select value={outputScope} onChange={(event) => setOutputScope(event.target.value as OutputScope)} className="w-full rounded-lg border border-border bg-white p-3">
                          <option value="hpi-only">HPI only</option>
                          <option value="selected-sections">Selected sections</option>
                          <option value="full-note">Full note</option>
                        </select>
                      </Field>
                      <Field label="Output Style">
                        <select value={outputStyle} onChange={(event) => setOutputStyle(event.target.value)} className="w-full rounded-lg border border-border bg-white p-3">
                          <option>Standard</option>
                          <option>Concise</option>
                          <option>Polished</option>
                        </select>
                      </Field>
                      <Field label="Format">
                        <select value={format} onChange={(event) => setFormat(event.target.value)} className="w-full rounded-lg border border-border bg-white p-3">
                          <option>Paragraph Style</option>
                          <option>Labeled Sections</option>
                          <option>Minimal Headings</option>
                        </select>
                      </Field>
                    </div>

                    <div className={`mt-4 rounded-[20px] border border-slate-200 bg-white p-4 transition-all ${jumpHighlightTarget === 'site-presets' ? 'ring-2 ring-cyan-300/60 shadow-[0_0_0_4px_rgba(34,211,238,0.12)]' : ''}`}>
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="text-sm font-semibold text-slate-950">Site / EHR presets</div>
                          <p className="mt-1 text-xs leading-5 text-slate-600">
                            Save the current destination, note focus, and formatting rules so providers working across multiple sites can switch quickly without re-teaching Veranote.
                          </p>
                        </div>
                        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                          {visibleActiveOutputProfile ? `Active: ${visibleActiveOutputProfile.name}` : 'No saved site preset active'}
                        </div>
                      </div>

                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <Field label="Preset name">
                          <input
                            ref={outputProfileNameInputRef}
                            value={outputProfileName}
                            onChange={(event) => setOutputProfileName(event.target.value)}
                            className={`w-full rounded-lg border border-border bg-white p-3 transition-all ${jumpHighlightTarget === 'site-presets' ? 'ring-2 ring-cyan-300/60' : ''}`}
                            placeholder="Example: Hospital A - Tebra Psych Initial"
                          />
                        </Field>
                        <Field label="Site label">
                          <input
                            value={outputProfileSiteLabel}
                            onChange={(event) => setOutputProfileSiteLabel(event.target.value)}
                            className="w-full rounded-lg border border-border bg-white p-3"
                            placeholder="Example: Hospital A"
                          />
                        </Field>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-3">
                        <button type="button" onClick={() => void handleSaveOutputProfile()} className="aurora-secondary-button rounded-xl px-4 py-2 text-sm font-medium">
                          Save current as site preset
                        </button>
                        {(outputProfileName || outputProfileSiteLabel) ? (
                          <button type="button" onClick={resetOutputProfileDraft} className="aurora-secondary-button rounded-xl px-4 py-2 text-sm font-medium">
                            Clear draft
                          </button>
                        ) : null}
                      </div>

                      {visibleOutputProfiles.length ? (
                        <div className="mt-4 grid gap-3">
                          {visibleOutputProfiles.map((profile) => (
                            <div key={profile.id} className="rounded-[16px] border border-slate-200 bg-slate-50 p-3">
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div>
                                  <div className="text-sm font-semibold text-slate-950">{profile.name}</div>
                                  <div className="mt-1 text-xs text-slate-600">
                                    {profile.siteLabel} • {getOutputDestinationMeta(profile.destination).summaryLabel} • {getOutputNoteFocusLabel(profile.noteFocus)}
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <button type="button" onClick={() => void handleApplyOutputProfile(profile.id)} className="aurora-secondary-button rounded-xl px-3 py-2 text-xs font-medium">
                                    Apply
                                  </button>
                                  <button type="button" onClick={() => void handleDeleteOutputProfile(profile.id)} className="aurora-secondary-button rounded-xl px-3 py-2 text-xs font-medium">
                                    Delete
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-4 grid gap-3">
                          <div className="rounded-[16px] border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                            No saved site/EHR presets yet. Save one here and it will appear in the top workspace selector and the review workspace.
                          </div>
                          <div className="rounded-[16px] border border-slate-200 bg-slate-50 p-3">
                            <div className="text-sm font-semibold text-slate-950">Suggested starters</div>
                            <p className="mt-1 text-xs leading-5 text-slate-600">
                              Start with one of these and adjust later if the provider works across multiple sites.
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {starterOutputProfiles.map((profile) => (
                                <button
                                  key={profile.name}
                                  type="button"
                                  onClick={() => void handleCreateStarterOutputProfile(profile)}
                                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 transition hover:border-cyan-200 hover:bg-cyan-50"
                                >
                                  {profile.name}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 rounded-[20px] border border-slate-200 bg-white p-4">
                      <div className="text-sm font-semibold text-slate-950">Section plan</div>
                      <p className="mt-1 text-xs leading-5 text-slate-600">
                        Full-note mode uses the note profile defaults. Selected-sections mode lets you choose exactly what gets rendered.
                      </p>
                      <div className="mt-3 text-xs text-slate-600">
                        Planned sections: {sectionPlan.sections.length ? sectionPlan.sections.map((section) => SECTION_LABELS[section]).join(' • ') : 'None'}
                      </div>
                      <div className="mt-2 text-xs text-slate-600">
                        Standalone MSE required for this scope: {sectionPlan.requiresStandaloneMse ? 'Yes' : 'No'}
                      </div>
                      {outputScope === 'selected-sections' && availableSectionEntries.length ? (
                        <div className="mt-4 grid gap-2 md:grid-cols-2">
                          {availableSectionEntries.map((section) => (
                            <label key={section} className="flex items-start gap-3 rounded-[18px] border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900">
                              <input type="checkbox" checked={requestedSections.includes(section)} onChange={() => toggleRequestedSection(section)} />
                              <span>{SECTION_LABELS[section]}</span>
                            </label>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4">
                  <div
                    id="my-note-prompt-panel"
                    data-testid="my-note-prompt-panel"
                    className="rounded-[22px] border border-cyan-200/16 bg-[linear-gradient(145deg,rgba(4,12,24,0.96),rgba(8,32,58,0.92))] p-4 scroll-mt-24"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/70">My Note Prompt</div>
                        <div className="mt-1 text-lg font-semibold text-white">Reusable instructions for this note type</div>
                        <p className="mt-1 text-xs leading-5 text-cyan-50/72">
                          Name the prompt, write how you want <span className="font-semibold text-white">{noteType}</span> generated, then save it as a preset. Patient-specific facts still belong in the source fields.
                        </p>
                      </div>
                      <div className="rounded-full border border-cyan-200/14 bg-[rgba(255,255,255,0.06)] px-3 py-1 text-xs font-medium text-cyan-50">
                        {activePreset ? activePreset.name : 'No preset selected'}
                      </div>
                    </div>

                    <div className="mt-4 rounded-[18px] border border-cyan-200/14 bg-[rgba(255,255,255,0.06)] p-3 text-xs leading-5 text-cyan-50/76">
                      <span className="font-semibold text-white">How generation uses this:</span> when you click Generate Draft, Veranote sends this prompt as provider-specific saved preferences along with Role, Field, EHR, Note Type, and the four source boxes. It guides structure, tone, sections, and destination formatting, but it does not replace the patient source.
                    </div>

                    {lanePreferenceSuggestion ? (
                      <div className="mt-4 rounded-[20px] border border-cyan-200/12 bg-[rgba(255,255,255,0.05)] p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="text-sm font-semibold text-white">Preference insight</div>
                            <p className="mt-1 text-xs text-cyan-50/78">
                              You have repeated this {noteType.toLowerCase()} lane setup {lanePreferenceSuggestion.count} times. Veranote can draft it into a reusable prompt and note preference instead of making you rebuild it each time.
                            </p>
                          </div>
                          <div className="aurora-pill rounded-full px-3 py-1 text-xs font-medium">
                            Repeated pattern
                          </div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <span className="rounded-full border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] px-3 py-1.5 text-xs font-medium text-cyan-50">
                            Scope: {lanePreferenceSuggestion.outputScope.replace('-', ' ')}
                          </span>
                          <span className="rounded-full border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] px-3 py-1.5 text-xs font-medium text-cyan-50">
                            Style: {lanePreferenceSuggestion.outputStyle}
                          </span>
                          <span className="rounded-full border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] px-3 py-1.5 text-xs font-medium text-cyan-50">
                            Format: {lanePreferenceSuggestion.format}
                          </span>
                          {lanePreferenceSuggestion.requestedSections.length ? (
                            <span className="rounded-full border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] px-3 py-1.5 text-xs font-medium text-cyan-50">
                              Sections: {lanePreferenceSuggestion.requestedSections.map((section) => SECTION_LABELS[section as NoteSectionKey]).join(', ')}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={() => handleBuildPreferenceDraft(buildLanePreferencePrompt({
                              noteType,
                              outputScope: lanePreferenceSuggestion.outputScope as OutputScope,
                              outputStyle: lanePreferenceSuggestion.outputStyle,
                              format: lanePreferenceSuggestion.format,
                              requestedSections: lanePreferenceSuggestion.requestedSections as NoteSectionKey[],
                            }))}
                            className="aurora-secondary-button rounded-xl px-4 py-2 text-sm font-medium"
                          >
                            Draft preference suggestion
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              dismissLanePreferenceSuggestion(noteType, lanePreferenceSuggestion.key, resolvedProviderIdentityId);
                              setLanePreferenceSuggestion(null);
                            }}
                            className="aurora-secondary-button rounded-xl px-4 py-2 text-sm font-medium"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {promptPreferenceSuggestion ? (
                      <div className="mt-4 rounded-[20px] border border-cyan-200/12 bg-[rgba(255,255,255,0.05)] p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="text-sm font-semibold text-white">{assistantPersona.name} insight</div>
                            <p className="mt-1 text-xs text-cyan-50/78">
                              {assistantPersona.name} has noticed that you repeatedly use this kind of prompt preference for {noteType.toLowerCase()}: <span className="font-semibold text-white">{promptPreferenceSuggestion.label}</span>.
                            </p>
                          </div>
                          <div className="aurora-pill rounded-full px-3 py-1 text-xs font-medium">
                            Repeated assistant pattern
                          </div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={() => handleBuildPreferenceDraft(promptPreferenceSuggestion.seedPrompt)}
                            className="aurora-secondary-button rounded-xl px-4 py-2 text-sm font-medium"
                          >
                            Draft from this pattern
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              dismissPromptPreferenceSuggestion(noteType, promptPreferenceSuggestion.key, resolvedProviderIdentityId);
                              setPromptPreferenceSuggestion(null);
                            }}
                            className="aurora-secondary-button rounded-xl px-4 py-2 text-sm font-medium"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {profilePromptPreferenceSuggestion && activeProviderProfile ? (
                      <div className="mt-4 rounded-[20px] border border-cyan-200/12 bg-[rgba(255,255,255,0.05)] p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="text-sm font-semibold text-white">{assistantPersona.name} profile insight</div>
                            <p className="mt-1 text-xs text-cyan-50/78">
                              Across the <span className="font-semibold text-white">{activeProviderProfile.name}</span> profile, {assistantPersona.name} has noticed a repeated preference pattern: <span className="font-semibold text-white">{profilePromptPreferenceSuggestion.label}</span>.
                            </p>
                          </div>
                          <div className="aurora-pill rounded-full px-3 py-1 text-xs font-medium">
                            Cross-note pattern
                          </div>
                        </div>
                        <div className="mt-3 text-xs text-cyan-50/72">
                          Seen in: {profilePromptPreferenceSuggestion.noteTypes.join(' • ')}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={() => handleBuildPreferenceDraft(profilePromptPreferenceSuggestion.seedPrompt)}
                            className="aurora-secondary-button rounded-xl px-4 py-2 text-sm font-medium"
                          >
                            Draft profile-level preference
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              assistantMemoryService.dismissProfilePromptSuggestion(
                                providerSettings.providerProfileId,
                                profilePromptPreferenceSuggestion.key,
                                resolvedProviderIdentityId,
                              );
                              setProfilePromptPreferenceSuggestion(null);
                            }}
                            className="aurora-secondary-button rounded-xl px-4 py-2 text-sm font-medium"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    ) : null}

                    <div data-testid="prompt-builder-coach" className="mt-4 rounded-[20px] border border-slate-200 bg-white p-4">
                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="text-sm font-semibold text-slate-950">Prompt Studio Coach</div>
                          <p className="mt-1 text-xs leading-5 text-slate-600">
                            Build a reusable prompt from structured choices. This keeps prompt creation safer than a blank box and easier to test later.
                          </p>
                        </div>
                        <div className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-900">
                          Guided builder
                        </div>
                      </div>
                      <div className="mt-4 rounded-[16px] border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-950">
                        <span className="font-semibold">Safe prompt rule:</span> reusable prompts control structure, tone, section order, EHR formatting, and guardrails. Patient facts stay in the four source boxes so Veranote can trace them.
                      </div>
                      <div className="mt-4 grid gap-2 md:grid-cols-2">
                        {promptStudioGoalOptions.map((goal) => {
                          const isSelected = promptBuilderGoalIds.includes(goal.id);

                          return (
                            <button
                              key={goal.id}
                              type="button"
                              data-testid="prompt-builder-goal-chip"
                              aria-pressed={isSelected}
                              onClick={() => togglePromptBuilderGoal(goal.id)}
                              className={`workspace-action-card rounded-[16px] border px-3 py-2 text-left transition ${
                                isSelected
                                  ? 'border-cyan-300 bg-cyan-50 text-cyan-950 shadow-[0_12px_28px_rgba(14,165,233,0.14)]'
                                  : 'border-slate-200 bg-slate-50 text-slate-800 hover:border-cyan-200 hover:bg-cyan-50'
                              }`}
                            >
                              <div className="text-xs font-semibold">{goal.label}</div>
                              <div className="mt-1 text-[11px] leading-4 opacity-75">
                                {goal.instruction}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      <label className="mt-4 grid gap-2 text-sm font-medium text-ink">
                        <span>Optional plain-language preference</span>
                        <textarea
                          value={assistantPreferenceRequest}
                          onChange={(event) => setAssistantPreferenceRequest(event.target.value)}
                          className="min-h-[92px] w-full rounded-lg border border-border bg-white p-3"
                          placeholder={`Example: For ${noteType}, make the HPI read like a story, keep MSE and risk source-close, and format it for ${providerSettings.outputDestination === 'Generic' ? 'my EHR' : getOutputDestinationMeta(providerSettings.outputDestination).label}.`}
                        />
                      </label>
                      <div className="mt-3 flex flex-wrap gap-3">
                        <button
                          type="button"
                          data-testid="build-safe-prompt-button"
                          onClick={handleBuildPromptStudioDraft}
                          className="aurora-primary-button rounded-xl px-4 py-2 text-sm font-medium"
                        >
                          Build safe prompt from selections
                        </button>
                        <button
                          type="button"
                          onClick={() => handleBuildPreferenceDraft()}
                          className="aurora-secondary-button rounded-xl px-4 py-2 text-sm font-medium"
                        >
                          Draft {assistantPersona.name} suggestion
                        </button>
                        {assistantPreferenceDraft ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleUseAssistantDraft('replace')}
                              className="aurora-secondary-button rounded-xl px-4 py-2 text-sm font-medium"
                            >
                              Use as note preferences
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUseAssistantDraft('append')}
                              className="aurora-secondary-button rounded-xl px-4 py-2 text-sm font-medium"
                            >
                              Append to current preferences
                            </button>
                          </>
                        ) : null}
                      </div>
                      <div className="mt-4">
                        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Fast starts</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {[
                            `Make ${noteType} more concise.`,
                            'Keep the assessment more conservative and differential-aware.',
                            'Make the plan shorter and easier to scan.',
                            `Format this cleanly for ${providerSettings.outputDestination === 'Generic' ? 'my destination workflow' : getOutputDestinationMeta(providerSettings.outputDestination).label}.`,
                          ].map((seed) => (
                            <button
                              key={seed}
                              type="button"
                              onClick={() => handleBuildPreferenceDraft(seed)}
                              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-800 transition hover:border-cyan-200 hover:bg-cyan-50"
                            >
                              {seed}
                            </button>
                          ))}
                        </div>
                      </div>
                      {assistantPreferenceDraft ? (
                        <div className="aurora-soft-panel mt-4 rounded-[18px] p-4">
                          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{assistantPersona.name} draft</div>
                          <div className="mt-2 whitespace-pre-wrap text-sm text-ink">{assistantPreferenceDraft}</div>
                          {assistantPromptDraftWarnings.length ? (
                            <div data-testid="assistant-prompt-draft-warning" className="mt-3 grid gap-2">
                              {assistantPromptDraftWarnings.map((warning) => (
                                <div key={warning.id} className={`rounded-[14px] border p-3 text-xs leading-5 ${
                                  warning.severity === 'caution'
                                    ? 'border-amber-200 bg-amber-50 text-amber-950'
                                    : 'border-sky-200 bg-sky-50 text-sky-950'
                                }`}>
                                  <div className="font-semibold">{warning.label}</div>
                                  <div className="mt-1">{warning.detail}</div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-[20px] border border-slate-200 bg-white p-4">
                      <Field label="Prompt name">
                        <input
                          data-testid="provider-prompt-name-input"
                          value={presetName}
                          onChange={(event) => setPresetName(event.target.value)}
                          className="w-full rounded-lg border border-border bg-white p-3"
                          placeholder={`${noteType} - My Standard Prompt`}
                        />
                      </Field>
                      <label className="mt-3 grid gap-2 text-sm font-medium text-ink">
                        <span>Provider prompt / note style instructions</span>
                        <textarea
                          data-testid="provider-prompt-instructions-textarea"
                          value={customInstructions}
                          onChange={(event) => setCustomInstructions(event.target.value)}
                          className="min-h-[150px] w-full rounded-lg border border-border p-3"
                          placeholder="Example: For this note type, keep the HPI concise, preserve source uncertainty, use bullet points in the plan, avoid unsupported diagnoses, and format output for WellSky."
                        />
                        <span className="text-xs leading-5 text-slate-600">
                          This applies to the next draft immediately. Save it as a named prompt if the provider wants to reuse it for this note type.
                        </span>
                      </label>
                      {providerPromptWarnings.length ? (
                        <div data-testid="provider-prompt-safety-warning" className="mt-3 grid gap-2">
                          {providerPromptWarnings.map((warning) => (
                            <div key={warning.id} className={`rounded-[16px] border p-3 text-xs leading-5 ${
                              warning.severity === 'caution'
                                ? 'border-amber-200 bg-amber-50 text-amber-950'
                                : 'border-sky-200 bg-sky-50 text-sky-950'
                            }`}>
                              <div className="font-semibold">{warning.label}</div>
                              <div className="mt-1">{warning.detail}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div data-testid="provider-prompt-safety-checklist" className="mt-3 rounded-[16px] border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-950">
                          Prompt safety check: no obvious identifiers, encounter-specific facts, unsafe auto-completion, or billing-overreach language detected.
                        </div>
                      )}
                      <div className="mt-3 flex flex-wrap gap-3">
                        <button
                          type="button"
                          data-testid="save-named-prompt-button"
                          onClick={handleSavePreset}
                          className="aurora-secondary-button rounded-xl px-4 py-2 text-sm font-medium"
                        >
                          Save named prompt for this note type
                        </button>
                        <button
                          type="button"
                          data-testid="delete-selected-prompt-button"
                          onClick={handleDeletePreset}
                          disabled={!selectedPresetId || Boolean(activePreset?.locked)}
                          className="aurora-secondary-button rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Delete selected preset
                        </button>
                      </div>
                      {selectedPresetId ? (
                        <div className="mt-2 text-xs text-slate-600">
                          Active named prompt: {activePreset?.name || selectedPresetId}
                          {activePreset?.locked ? ' (starter preset)' : ''} • {noteType}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </details>
          </div>
        </div>
      ) : null}

      {(showUnifiedWorkspace || activeComposeLane === 'finish') && error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <details
        open={activeComposeLane === 'support'}
        className={`${activeComposeLane === 'support' ? '' : 'hidden'} rounded-[26px] border border-cyan-200/12 bg-[rgba(7,18,32,0.5)] p-4 text-cyan-50/82 md:p-5`}
      >
        <summary className="cursor-pointer list-none">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/76">Reference</div>
              <div className="mt-1 text-base font-semibold text-white">Open only if you need source or workflow guidance</div>
              <p className="mt-1 text-xs leading-5 text-cyan-50/66">
                Keep the main path focused on source, draft controls, and review. Use this drawer for guidance only when you want a quick reminder.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="rounded-full border border-cyan-200/14 bg-[rgba(13,30,50,0.58)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-50">
                Source-first
              </div>
              <div className="rounded-full border border-cyan-200/14 bg-[rgba(13,30,50,0.58)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-50">
                Open if needed
              </div>
            </div>
          </div>
        </summary>
        <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-900">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="font-semibold">Source guidance</div>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  The source can stay rough. The goal is truth-preserving cleanup, not a note that looks confident when the record is thin.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <ProvenancePill label="Source-first review" />
              </div>
            </div>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-slate-800">
              <li>Raw bullets, fragmented chronology, copied chart snippets, and incomplete source are all acceptable.</li>
              <li>Separate clinician notes, collateral, transcript material, and objective data when you can, but you do not need polished prose to start.</li>
              <li>The goal is polished wording without invented facts, not a note that sounds confident when the source is thin.</li>
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => scrollToComposeLane('source')}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800"
              >
                Back to source
              </button>
              <button
                type="button"
                onClick={scrollToDraftControls}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800"
              >
	                Open Draft Settings
              </button>
            </div>
          </div>

          {workflowGuidance ? (
            <div ref={registerComposeSection('workflow-guidance')} className="rounded-[22px] border border-emerald-200 bg-emerald-50 p-4 text-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="font-semibold text-emerald-950">{workflowGuidance.title}</div>
                  <p className="mt-1 text-sm leading-6 text-emerald-900">{workflowGuidance.intro}</p>
                </div>
                <div className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-medium text-emerald-900">
                  {workflowGuidance.careSetting}
                </div>
              </div>
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-emerald-900">
                {workflowGuidance.intakeBullets.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <div className="mt-4 rounded-lg border border-emerald-200 bg-white p-3 text-xs text-emerald-900">
                Review reminder: {workflowGuidance.reviewReminder}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => scrollToComposeLane('source')}
                  className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-900"
                >
                  Back to source
                </button>
                <button
                  type="button"
                  onClick={() => scrollToComposeLane('support')}
                  className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-900"
                >
                  Open support tools
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </details>
          </div>
        </div>
      </div>
    </div>
  </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-medium text-ink">
      <span className="text-[12px] font-semibold uppercase tracking-[0.16em] text-cyan-100/62">{label}</span>
      {children}
    </label>
  );
}

function CollapsibleFormSection({
  title,
  subtitle,
  toneClassName,
  summaryTag = 'Optional',
  children,
}: {
  title: string;
  subtitle: string;
  toneClassName: string;
  summaryTag?: string;
  children: React.ReactNode;
}) {
  return (
    <details className={`rounded-[24px] border p-4 shadow-sm md:p-5 ${toneClassName}`}>
      <summary className="cursor-pointer list-none">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-base font-semibold md:text-lg">{title}</div>
            <p className="mt-1 max-w-3xl text-xs leading-6 opacity-85 md:text-sm">{subtitle}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="rounded-full border border-current/15 bg-white/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] opacity-90">
              {summaryTag}
            </div>
            <div className="rounded-full border border-current/15 bg-white/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] opacity-90">
              Open details
            </div>
          </div>
        </div>
      </summary>
      <div className="mt-4">
        {children}
      </div>
    </details>
  );
}

function SourceField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="aurora-soft-panel grid gap-3 rounded-[22px] p-4 text-sm font-medium text-ink">
      <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</span>
      <span className="text-xs font-normal leading-6 text-muted">{hint}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} className="min-h-[190px] rounded-[18px] border border-border p-4" />
    </label>
  );
}
