'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { noteTypeOptionsBySpecialty, sampleSourceInput, templateDescriptions, templateOptionsByNoteType } from '@/lib/constants/mock-data';
import { founderWorkflowStarters } from '@/lib/constants/founder-workflows';
import { DEFAULT_PROVIDER_SETTINGS, type ProviderSettings } from '@/lib/constants/settings';
import { findProviderProfile } from '@/lib/constants/provider-profiles';
import { DRAFT_SESSION_KEY, EVAL_CASE_KEY } from '@/lib/constants/storage';
import { buildSourceInputFromSections, describePopulatedSourceSections, EMPTY_SOURCE_SECTIONS, normalizeSourceSections } from '@/lib/ai/source-sections';
import { ReviewWorkspace } from '@/components/note/review-workspace';
import { CombinedView } from '@/components/veranote/input/CombinedView';
import { SourceInput } from '@/components/veranote/input/SourceInput';
import { SourceIntegrity } from '@/components/veranote/input/SourceIntegrity';
import { SourceTabs, type SourceTabKey } from '@/components/veranote/input/SourceTabs';
import { StatusStrip, type StatusStripItem } from '@/components/veranote/ui/StatusStrip';
import { getDifferentialCautionForDiagnosis, getTimeframeRuleForDiagnosis, listDiagnosisCategoryQuickPicks, listDiagnosisSuggestions } from '@/lib/psychiatry-diagnosis/seed-loader';
import { buildDiagnosisProfileSummary, createEmptyDiagnosisProfileEntry, hasDiagnosisProfileUnresolvedEntries, normalizeDiagnosisProfile } from '@/lib/note/diagnosis-profile';
import { buildMedicationProfileGapSummary, buildMedicationProfileSummary, createEmptyMedicationProfileEntry, hasMedicationProfileUnresolvedEntries, normalizeMedicationProfile } from '@/lib/note/medication-profile';
import { mergePresetCatalog, findPresetForNoteType, type NotePreset } from '@/lib/note/presets';
import { buildEncounterSupportSummary, createEncounterSupportDefaults, getEncounterSupportConfig, normalizeEncounterSupport } from '@/lib/note/encounter-support';
import { planSections, SECTION_LABELS, type NoteSectionKey, type OutputScope } from '@/lib/note/section-profiles';
import { ASSISTANT_ACTION_EVENT, ASSISTANT_PENDING_ACTION_KEY, publishAssistantContext } from '@/lib/veranote/assistant-context';
import { assistantMemoryService } from '@/lib/veranote/assistant-memory-service';
import { buildLanePreferencePrompt, buildPreferenceAssistantDraft } from '@/lib/veranote/preference-draft';
import { getCurrentProviderId, getNotePresetsStorageKey, getProviderSettingsStorageKey } from '@/lib/veranote/provider-identity';
import { resolveVeraAddress } from '@/lib/veranote/vera-relationship';
import {
  dismissLanePreferenceSuggestion,
  dismissPromptPreferenceSuggestion,
  getLanePreferenceSuggestion,
  getPromptPreferenceSuggestion,
} from '@/lib/veranote/assistant-learning';
import type { DraftSession, EncounterSupport, SourceSections, StructuredPsychDiagnosisProfileEntry, StructuredPsychMedicationProfileEntry } from '@/types/session';
import type { EvalCaseSelection } from '@/types/eval';

function defaultRoleForSpecialty(specialty: string) {
  switch (specialty) {
    case 'Therapy':
      return 'Therapist';
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

type WorkflowGuidance = {
  careSetting: 'Inpatient' | 'Outpatient' | 'Telehealth' | 'Mixed';
  title: string;
  intro: string;
  intakeBullets: string[];
  reviewReminder: string;
  sectionHints: Partial<Record<keyof SourceSections, string>>;
};

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

export function NewNoteForm() {
  const router = useRouter();
  const composeWorkspaceRef = useRef<HTMLDivElement | null>(null);
  const hydratedFromSavedStateRef = useRef(false);
  const providerProfileAppliedRef = useRef(false);
  const [workflowStage, setWorkflowStage] = useState<'compose' | 'review'>('compose');
  const [generatedSession, setGeneratedSession] = useState<DraftSession | null>(null);
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
  const [activeSourceTab, setActiveSourceTab] = useState<SourceTabKey>('all');
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
  const [lanePreferenceSuggestion, setLanePreferenceSuggestion] = useState<ReturnType<typeof getLanePreferenceSuggestion>>(null);
  const [promptPreferenceSuggestion, setPromptPreferenceSuggestion] = useState<ReturnType<typeof getPromptPreferenceSuggestion>>(null);
  const [profilePromptPreferenceSuggestion, setProfilePromptPreferenceSuggestion] = useState<ReturnType<typeof assistantMemoryService.getProfilePromptSuggestion>>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [providerSettings, setProviderSettings] = useState<ProviderSettings>(DEFAULT_PROVIDER_SETTINGS);
  const [evalBanner, setEvalBanner] = useState('');

  const noteTypeOptions = useMemo(() => noteTypeOptionsBySpecialty[specialty] || [], [specialty]);
  const templateOptions = useMemo(() => templateOptionsByNoteType[noteType] || [], [noteType]);
  const sourceInput = useMemo(() => buildSourceInputFromSections(sourceSections), [sourceSections]);
  const populatedSectionLabels = useMemo(() => describePopulatedSourceSections(sourceSections), [sourceSections]);
  const currentTemplateDescription = templateDescriptions[template] || 'Template description not yet defined.';
  const sectionPlan = useMemo(() => planSections({ noteType, requestedScope: outputScope, requestedSections }), [noteType, outputScope, requestedSections]);
  const availableSectionEntries = useMemo(() => sectionPlan.profile?.availableSections ?? [], [sectionPlan.profile]);
  const activeProviderProfile = useMemo(() => findProviderProfile(providerSettings.providerProfileId), [providerSettings.providerProfileId]);
  const workspaceStatusItems = useMemo<StatusStripItem[]>(() => {
    const items: StatusStripItem[] = [];

    if (activeProviderProfile) {
      items.push({
        id: 'profile',
        label: 'Profile',
        value: activeProviderProfile.name,
      });
    }

    if (generatedSession) {
      items.push({
        id: 'draft',
        label: 'Draft',
        value: 'Available',
      });
    }

    if (providerSettings.asciiSafe || providerSettings.outputDestination !== 'Generic') {
      items.push({
        id: 'constraints',
        label: 'Constraints',
        value: 'Active',
      });
    }

    if (providerSettings.outputDestination) {
      items.push({
        id: 'output',
        label: 'Output',
        value: providerSettings.outputDestination,
      });
    }

    return items;
  }, [activeProviderProfile, generatedSession, providerSettings.asciiSafe, providerSettings.outputDestination]);
  const workflowGuidance = useMemo(() => specialty === 'Psychiatry' ? getPsychWorkflowGuidance(noteType) : null, [noteType, specialty]);
  const encounterSupportConfig = useMemo(() => getEncounterSupportConfig(noteType), [noteType]);
  const encounterSupportSummary = useMemo(() => buildEncounterSupportSummary(encounterSupport, noteType), [encounterSupport, noteType]);
  const medicationProfileSummary = useMemo(() => buildMedicationProfileSummary(medicationProfile), [medicationProfile]);
  const medicationProfileGapSummary = useMemo(() => buildMedicationProfileGapSummary(medicationProfile), [medicationProfile]);
  const medicationProfileHasUnresolved = useMemo(() => hasMedicationProfileUnresolvedEntries(medicationProfile), [medicationProfile]);
  const diagnosisProfileSummary = useMemo(() => buildDiagnosisProfileSummary(diagnosisProfile), [diagnosisProfile]);
  const diagnosisProfileHasUnresolved = useMemo(() => hasDiagnosisProfileUnresolvedEntries(diagnosisProfile), [diagnosisProfile]);
  const diagnosisCategoryQuickPicks = useMemo(() => listDiagnosisCategoryQuickPicks().slice(0, 8), []);
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

  useEffect(() => {
    async function hydratePresets() {
      const providerId = getCurrentProviderId();
      const presetsStorageKey = getNotePresetsStorageKey(providerId);
      const rawPresets = localStorage.getItem(presetsStorageKey);
      const localPresets = mergePresetCatalog(rawPresets ? JSON.parse(rawPresets) as NotePreset[] : []);
      setPresets(localPresets);

      try {
        const response = await fetch(`/api/presets?providerId=${encodeURIComponent(providerId)}`, { cache: 'no-store' });
        const data = await response.json() as { presets?: NotePreset[] };
        const mergedPresets = mergePresetCatalog(data?.presets || localPresets);
        setPresets(mergedPresets);
        localStorage.setItem(presetsStorageKey, JSON.stringify(mergedPresets));
      } catch {
        // Local presets remain available if backend persistence is unavailable.
      }
    }

    void hydratePresets();
  }, []);

  useEffect(() => {
    async function hydrateDraft() {
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
          setGeneratedSession(null);
          setWorkflowStage('compose');
          setEvalBanner(`Loaded evaluation case: ${parsed.id} — ${parsed.title}`);
          localStorage.removeItem(EVAL_CASE_KEY);
          return;
        } catch {
          localStorage.removeItem(EVAL_CASE_KEY);
        }
      }

      const raw = localStorage.getItem(DRAFT_SESSION_KEY);

      if (raw) {
        try {
          const parsed = JSON.parse(raw) as DraftSession;
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
          setPresetName('');
          setGeneratedSession(parsed.note ? parsed : null);
          return;
        } catch {
          localStorage.removeItem(DRAFT_SESSION_KEY);
        }
      }

      try {
        const response = await fetch('/api/drafts/latest', { cache: 'no-store' });
        const data = (await response.json()) as { draft?: DraftSession | null };
        const parsed = data?.draft;

        if (!parsed) {
          return;
        }

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
        setPresetName('');
        setGeneratedSession(parsed.note ? parsed : null);
        localStorage.setItem(DRAFT_SESSION_KEY, JSON.stringify(parsed));
      } catch {
        // Keep the prototype usable even if backend draft restore is unavailable.
      }
    }

    void hydrateDraft();
  }, []);

  useEffect(() => {
    async function hydrateProviderSettings() {
      const providerId = getCurrentProviderId();
      const storageKey = getProviderSettingsStorageKey(providerId);
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as ProviderSettings;
          const merged = { ...DEFAULT_PROVIDER_SETTINGS, ...parsed };
          setProviderSettings(merged);
          const activeProfile = findProviderProfile(merged.providerProfileId);
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
          setKeepCloserToSource(merged.closerToSourceDefault);
          setFormat(merged.paragraphOnly ? 'Paragraph Style' : 'Labeled Sections');
          return;
        } catch {
          localStorage.removeItem(storageKey);
        }
      }

      try {
        const response = await fetch(`/api/settings/provider?providerId=${encodeURIComponent(providerId)}`, { cache: 'no-store' });
        const data = (await response.json()) as { settings?: ProviderSettings };
        const merged = { ...DEFAULT_PROVIDER_SETTINGS, ...(data?.settings || {}) };
        setProviderSettings(merged);
        const activeProfile = findProviderProfile(merged.providerProfileId);
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
        setKeepCloserToSource(merged.closerToSourceDefault);
        setFormat(merged.paragraphOnly ? 'Paragraph Style' : 'Labeled Sections');
        localStorage.setItem(storageKey, JSON.stringify(merged));
      } catch {
        // Fall back to local defaults if server-backed settings are unavailable.
      }
    }

    void hydrateProviderSettings();
  }, []);

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
    setLanePreferenceSuggestion(getLanePreferenceSuggestion(noteType));
  }, [noteType]);

  useEffect(() => {
    setPromptPreferenceSuggestion(getPromptPreferenceSuggestion(noteType));
  }, [noteType]);

  useEffect(() => {
    setProfilePromptPreferenceSuggestion(assistantMemoryService.getProfilePromptSuggestion(providerSettings.providerProfileId));
  }, [providerSettings.providerProfileId, noteType]);

  useEffect(() => {
    let isMounted = true;

    async function hydrateLearning() {
      try {
        await assistantMemoryService.hydrateLearning();
        if (!isMounted) {
          return;
        }
        setLanePreferenceSuggestion(getLanePreferenceSuggestion(noteType));
        setPromptPreferenceSuggestion(getPromptPreferenceSuggestion(noteType));
        setProfilePromptPreferenceSuggestion(assistantMemoryService.getProfilePromptSuggestion(providerSettings.providerProfileId));
      } catch {
        // Keep local provider-scoped Vera memory available if backend hydration fails.
      }
    }

    void hydrateLearning();

    return () => {
      isMounted = false;
    };
  }, [noteType, providerSettings.providerProfileId]);

  useEffect(() => {
    publishAssistantContext({
      stage: workflowStage,
      noteType: workflowStage === 'review' && generatedSession ? generatedSession.noteType : noteType,
      specialty: workflowStage === 'review' && generatedSession ? generatedSession.specialty : specialty,
      currentDraftText: workflowStage === 'review' && generatedSession?.note ? generatedSession.note.slice(0, 4000) : undefined,
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
    });
  }, [
    customInstructions,
    generatedSession,
    noteType,
    presetName,
    providerSettings.providerProfileId,
    providerSettings.veraInteractionStyle,
    providerSettings.veraMemoryNotes,
    providerSettings.veraProactivityLevel,
    providerSettings.outputDestination,
    selectedPresetId,
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
      setPresetName(nextPresetName?.trim() || `${noteType} Assistant Preset`);
      setCustomInstructions(instructions.trim());
    }

    window.addEventListener(ASSISTANT_ACTION_EVENT, handleAssistantAction);
    return () => window.removeEventListener(ASSISTANT_ACTION_EVENT, handleAssistantAction);
  }, [noteType, workflowStage]);

  useEffect(() => {
    if (workflowStage !== 'compose') {
      return;
    }

    const raw = localStorage.getItem(ASSISTANT_PENDING_ACTION_KEY);

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
        setPresetName(pending.presetName?.trim() || `${noteType} Assistant Preset`);
        setCustomInstructions(pending.instructions.trim());
      }
    } catch {
      // Ignore malformed pending assistant actions.
    } finally {
      localStorage.removeItem(ASSISTANT_PENDING_ACTION_KEY);
    }
  }, [noteType, workflowStage]);

  function updateSourceSection<K extends keyof SourceSections>(key: K, value: SourceSections[K]) {
    setSourceSections((current) => ({ ...current, [key]: value }));
  }

  function handleReturnToCompose() {
    setWorkflowStage('compose');
    composeWorkspaceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
      name: (presetName || existingPreset?.name || `${noteType} Custom`).trim(),
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
    const providerId = getCurrentProviderId();
    const presetsStorageKey = getNotePresetsStorageKey(providerId);
    setPresets(nextPresets);
    setSelectedPresetId(preset.id);
    setPresetName(preset.name);
    localStorage.setItem(presetsStorageKey, JSON.stringify(nextPresets));
    void fetch('/api/presets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ presets: nextPresets, providerId }),
    }).catch(() => {
      // Keep local presets even if backend save fails.
    });
    assistantMemoryService.recordLaneSelection({
      noteType,
      outputScope,
      outputStyle,
      format,
      requestedSections,
    });
    setLanePreferenceSuggestion(getLanePreferenceSuggestion(noteType));
  }

  function handleDeletePreset() {
    const preset = presets.find((item) => item.id === selectedPresetId);
    if (!preset || preset.locked) {
      return;
    }

    const nextPresets = presets.filter((item) => item.id !== preset.id);
    const providerId = getCurrentProviderId();
    const presetsStorageKey = getNotePresetsStorageKey(providerId);
    setPresets(nextPresets);
    setSelectedPresetId('');
    setPresetName('');
    localStorage.setItem(presetsStorageKey, JSON.stringify(nextPresets));
    void fetch('/api/presets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ presets: nextPresets, providerId }),
    }).catch(() => {
      // Keep local presets even if backend save fails.
    });
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
    });
    setPromptPreferenceSuggestion(getPromptPreferenceSuggestion(noteType));
    setProfilePromptPreferenceSuggestion(assistantMemoryService.getProfilePromptSuggestion(providerSettings.providerProfileId));

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
        note: data.note,
        flags: Array.isArray(data.flags) ? data.flags : [],
        copilotSuggestions: Array.isArray(data.copilotSuggestions) ? data.copilotSuggestions : [],
        sectionReviewState: undefined,
        mode: data.mode,
        warning: typeof data.warning === 'string' ? data.warning : undefined,
      };

      localStorage.setItem(DRAFT_SESSION_KEY, JSON.stringify(draftSession));
      setGeneratedSession(draftSession);

      try {
        await fetch('/api/drafts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(draftSession),
        });
      } catch {
        // Local draft persistence still works if server-backed save fails.
      }

      assistantMemoryService.recordLaneSelection({
        noteType,
        outputScope,
        outputStyle,
        format,
        requestedSections,
      });
      setLanePreferenceSuggestion(getLanePreferenceSuggestion(noteType));

      setWorkflowStage('review');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate draft right now.');
    } finally {
      setIsLoading(false);
    }
  }

  function handleClear() {
    setSourceSections(EMPTY_SOURCE_SECTIONS);
    setEncounterSupport(createEncounterSupportDefaults(noteType));
    setMedicationProfile([]);
    setDiagnosisProfile([]);
    setGeneratedSession(null);
    setWorkflowStage('compose');
    setError('');
    setEvalBanner('');
  }

  function handleLoadExample() {
    setSourceSections({
      ...EMPTY_SOURCE_SECTIONS,
      clinicianNotes: sampleSourceInput,
    });
    setSpecialty('Psychiatry');
    setRole('Psychiatric NP');
    setNoteType('Inpatient Psych Progress Note');
    setTemplate('Default Inpatient Psych Progress Note');
    setEncounterSupport(createEncounterSupportDefaults('Inpatient Psych Progress Note'));
    setMedicationProfile([]);
    setDiagnosisProfile([]);
    setGeneratedSession(null);
    setWorkflowStage('compose');
    setOutputStyle('Standard');
    setFormat(providerSettings.paragraphOnly ? 'Paragraph Style' : 'Labeled Sections');
    setFlagMissingInfo(true);
    setKeepCloserToSource(providerSettings.closerToSourceDefault);
    setError('');
    setEvalBanner('');
  }

  function handleLoadBlueprintStarter(starterId: string) {
    const starter = founderWorkflowStarters.find((item) => item.id === starterId);
    if (!starter) {
      return;
    }

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
    setEncounterSupport(createEncounterSupportDefaults(starter.noteType));
    setMedicationProfile([]);
    setDiagnosisProfile([]);
    setGeneratedSession(null);
    setWorkflowStage('compose');
    setError('');
    setEvalBanner(`Loaded blueprint starter: ${starter.title}`);
  }

  if (workflowStage === 'review' && generatedSession) {
    return (
      <div className="grid gap-6">
        <div className="aurora-soft-panel rounded-[24px] border border-emerald-200 px-5 py-4 text-sm text-emerald-900">
          Review opened inside the same patient-note workspace so you can finish the note without jumping around the app.
        </div>

        <div className="aurora-panel rounded-[28px] p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-sm font-semibold uppercase tracking-wide text-slate-500">Note workspace</div>
              <h2 className="mt-1 text-xl font-semibold text-slate-950">Review the draft and finish the note</h2>
              <p className="mt-2 text-sm text-slate-700">
                Working note: <span className="font-medium">{generatedSession.noteType}</span>. Review source support, adjust wording, then copy or export when the note reads truthfully.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button onClick={handleReturnToCompose} className="aurora-secondary-button rounded-xl px-4 py-2 text-sm font-medium">
                Back to Edit
              </button>
              <button onClick={() => router.push('/dashboard/review')} className="aurora-secondary-button rounded-xl px-4 py-2 text-sm font-medium">
                Open full review page
              </button>
              <button
                onClick={() => {
                  handleReturnToCompose();
                  setGeneratedSession(null);
                  setError('');
                }}
                className="aurora-secondary-button rounded-xl px-4 py-2 text-sm font-medium"
              >
                Start another note
              </button>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="aurora-soft-panel rounded-[22px] border border-slate-200 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step 1</div>
              <div className="mt-1 font-medium text-slate-950">Compose source and setup</div>
              <p className="mt-1 text-sm text-slate-700">Your source input and note settings remain available if you need to jump back and adjust them.</p>
            </div>
            <div className="aurora-soft-panel rounded-[22px] border border-emerald-200 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Step 2</div>
              <div className="mt-1 font-medium text-emerald-950">Review, revise, and finish</div>
              <p className="mt-1 text-sm text-emerald-900">This is now the main finish path for the current patient note.</p>
            </div>
          </div>
        </div>

        <ReviewWorkspace
          initialSession={generatedSession}
          embedded
          onBackToEdit={handleReturnToCompose}
        />
      </div>
    );
  }

  return (
    <div ref={composeWorkspaceRef} className="grid gap-6">
      <div className="aurora-panel rounded-[24px] border border-cyan-200/60 px-5 py-4 text-sm text-cyan-50">
        Veranote is designed for messy real-world input. Paste shorthand, collateral, rough transcripts, med/lab snippets, or partial charting here first. Review opens in this same workspace after generation so the trust work stays close to the source.
      </div>

      <div className="aurora-panel aurora-edge-emphasis rounded-[28px] p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-semibold uppercase tracking-wide text-cyan-100">Note workspace</div>
            <h2 className="mt-1 text-lg font-semibold text-white">One note, two simple stages</h2>
            <p className="mt-1 text-sm text-cyan-50/88">Use Compose to set up the note and Review to finish it. The goal is to keep one patient note mostly on one working page.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleReturnToCompose}
              className={`rounded-xl border px-4 py-2 text-sm font-medium ${workflowStage === 'compose' ? 'border-sky-200 bg-sky-100 text-sky-950 shadow-[0_10px_24px_rgba(13,54,84,0.18)]' : 'aurora-secondary-button border-border text-slate-700'}`}
            >
              1. Compose
            </button>
            <button
              onClick={() => generatedSession ? setWorkflowStage('review') : null}
              disabled={!generatedSession}
              className="aurora-secondary-button rounded-xl px-4 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              2. Review
            </button>
          </div>
        </div>
      </div>

      {evalBanner ? <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">{evalBanner.replace('Loaded evaluation case:', 'Loaded example case:').replace('Loaded blueprint starter:', 'Loaded starter:')}</div> : null}

      <StatusStrip items={workspaceStatusItems} />

      <div className="aurora-hero rounded-[32px] p-6">
        <div className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-100">Quick start</div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="rounded-[22px] border border-white/10 bg-white/10 p-4 backdrop-blur-sm">
            <div className="font-medium text-white">1. Choose the note setup</div>
            <p className="mt-1 text-sm text-cyan-50/90">Pick the specialty, note type, and template that match the visit.</p>
          </div>
          <div className="rounded-[22px] border border-white/10 bg-white/10 p-4 backdrop-blur-sm">
            <div className="font-medium text-white">2. Add source material</div>
            <p className="mt-1 text-sm text-cyan-50/90">Paste rough notes, collateral, transcript text, and objective data as available.</p>
          </div>
          <div className="rounded-[22px] border border-cyan-200/20 bg-[linear-gradient(135deg,rgba(59,224,185,0.16),rgba(255,255,255,0.12))] p-4 backdrop-blur-sm">
            <div className="font-medium text-white">3. Generate a review-first draft</div>
            <p className="mt-1 text-sm text-cyan-50/90">Review opens right here next so the trust work happens before export without extra page-hopping.</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-900">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div className="font-semibold">Good input for Veranote</div>
          <div className="flex flex-wrap gap-2">
            <ProvenancePill label="Voice planning only" />
            <ProvenancePill label="Transcript stays source-first" />
          </div>
        </div>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-800">
          <li>Raw bullets, fragmented chronology, copied chart snippets, and incomplete source are all acceptable.</li>
          <li>Separate clinician notes, collateral, transcript material, and objective data when you can, but you do not need polished prose to start.</li>
          <li>If you later use provider-controlled listening or transcription, that content belongs in the patient conversation / transcript section rather than replacing manual review.</li>
          <li>The goal is polished wording without invented facts, not a note that sounds confident when the source is thin.</li>
        </ul>
      </div>

      <CollapsibleFormSection
        title="Optional psych workflow starters"
        subtitle="Use one of these if you want a fast psych-specific starting point. You can skip this and build the note manually below."
        toneClassName="border-violet-200 bg-violet-50 text-violet-950"
      >
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="font-semibold text-violet-950">Psych workflow starters</div>
            <p className="mt-1 text-sm text-violet-900">
              These starters are based on real psych documentation patterns from your prior note-help history. They are useful starting points, not universal defaults.
            </p>
            {activeProviderProfile ? (
              <p className="mt-2 text-xs font-medium text-violet-900">
                Showing strongest matches first for the active provider profile: {activeProviderProfile.name}
              </p>
            ) : null}
          </div>
          <div className="rounded-full border border-violet-200 bg-white px-3 py-1 text-xs font-medium text-violet-900">
            Sample workflows
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

      <div className="grid gap-4 md:grid-cols-4">
        <Field label="Specialty">
          <select value={specialty} onChange={(event) => setSpecialty(event.target.value)} className="w-full rounded-lg border border-border bg-white p-3">
            <option>Psychiatry</option>
            <option>Therapy</option>
            <option>General Medical</option>
          </select>
        </Field>
        <Field label="Role">
          <select value={role} onChange={(event) => setRole(event.target.value)} className="w-full rounded-lg border border-border bg-white p-3">
            <option>Psychiatric NP</option>
            <option>Psychiatrist</option>
            <option>Therapist</option>
            <option>Psychologist</option>
            <option>PCP</option>
          </select>
        </Field>
        <Field label="Note Type">
          <select value={noteType} onChange={(event) => setNoteType(event.target.value)} className="w-full rounded-lg border border-border bg-white p-3">
            {noteTypeOptions.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </Field>
        <Field label="Template / Profile">
          <select value={template} onChange={(event) => setTemplate(event.target.value)} className="w-full rounded-lg border border-border bg-white p-3">
            {templateOptions.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
        <div className="font-semibold">Current template profile</div>
        <p className="mt-1">{currentTemplateDescription}</p>
        {workflowGuidance ? (
          <div className="mt-2 text-xs font-medium text-violet-950">
            Workflow frame: {workflowGuidance.careSetting} psychiatry
          </div>
        ) : null}
      </div>

      {workflowGuidance ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="font-semibold text-emerald-950">{workflowGuidance.title}</div>
              <p className="mt-1 text-sm text-emerald-900">{workflowGuidance.intro}</p>
            </div>
            <div className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-medium text-emerald-900">
              {workflowGuidance.careSetting}
            </div>
          </div>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-emerald-900">
            {workflowGuidance.intakeBullets.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <div className="mt-3 rounded-lg border border-emerald-200 bg-white p-3 text-xs text-emerald-900">
            Review reminder: {workflowGuidance.reviewReminder}
          </div>
        </div>
      ) : null}

      <div className="rounded-[28px] border border-white/80 bg-white/78 p-6 shadow-md backdrop-blur-xl">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Structured Source Input</h2>
            <p className="text-sm text-muted">Keep source material separated so the draft engine can stay closer to what came from the clinician, intake, transcript, and objective data.</p>
          </div>
          <SourceIntegrity
            filledCount={populatedSectionLabels.length}
            totalCount={4}
            activeLabels={populatedSectionLabels}
          />
        </div>
        <div className="grid gap-4">
          <SourceTabs activeTab={activeSourceTab} onChange={setActiveSourceTab} />
          {activeSourceTab === 'all' ? (
            <CombinedView value={sourceInput} />
          ) : null}
          {activeSourceTab === 'clinicianNotes' ? (
            <SourceInput
              label="Clinician Raw Notes"
              hint={workflowGuidance?.sectionHints.clinicianNotes || 'Shorthand, rough bullets, your own impressions, partial charting.'}
              value={sourceSections.clinicianNotes}
              onChange={(value) => updateSourceSection('clinicianNotes', value)}
            />
          ) : null}
          {activeSourceTab === 'intakeCollateral' ? (
            <SourceInput
              label="Intake / Collateral"
              hint={workflowGuidance?.sectionHints.intakeCollateral || 'Nursing intake, collateral history, social work documentation, family report.'}
              value={sourceSections.intakeCollateral}
              onChange={(value) => updateSourceSection('intakeCollateral', value)}
            />
          ) : null}
          {activeSourceTab === 'patientTranscript' ? (
            <SourceInput
              label="Patient Conversation / Transcript"
              hint={workflowGuidance?.sectionHints.patientTranscript || 'Interview text, transcript excerpts, direct quotes, chronology from conversation.'}
              value={sourceSections.patientTranscript}
              onChange={(value) => updateSourceSection('patientTranscript', value)}
            />
          ) : null}
          {activeSourceTab === 'objectiveData' ? (
            <SourceInput
              label="Objective Data / Labs / Vitals / Medications"
              hint={workflowGuidance?.sectionHints.objectiveData || 'Vitals, labs, meds, relevant objective findings, other structured data.'}
              value={sourceSections.objectiveData}
              onChange={(value) => updateSourceSection('objectiveData', value)}
            />
          ) : null}
        </div>
      </div>

      <CollapsibleFormSection
        title="Optional psychiatric medication details"
        subtitle="Open this if you want to enter a structured psych-med profile instead of relying only on free-text source parsing."
        toneClassName="border-cyan-200 bg-cyan-50 text-cyan-950"
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-cyan-950">Current Psychiatric Medications</h2>
            <p className="mt-1 text-sm text-cyan-900">
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

      <CollapsibleFormSection
        title="Optional diagnosis and assessment details"
        subtitle="Open this if you want extra support for working impressions, differentials, historical labels, or timeframe-sensitive diagnoses."
        toneClassName="border-rose-200 bg-rose-50 text-rose-950"
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-rose-950">Current Diagnostic Impression / Assessment Frame</h2>
            <p className="mt-1 text-sm text-rose-900">
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

      <CollapsibleFormSection
        title="Optional encounter and documentation details"
        subtitle="Open this when telehealth, psychotherapy time, crisis timing, or other documentation-support details need to be carried into review."
        toneClassName="border-amber-200 bg-amber-50 text-amber-950"
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-amber-950">{encounterSupportConfig.title}</h2>
            <p className="mt-1 text-sm text-amber-900">{encounterSupportConfig.intro}</p>
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

      {specialty === 'Psychiatry' ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Psychiatry workflows are first-class here. The review step will specifically help you inspect risk language, mental-status wording, collateral conflicts, medication details, labs, and anything that should stay uncertain instead of being smoothed over.
        </div>
      ) : null}

      <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
        <div className="aurora-panel rounded-[28px] p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Output Preferences</h2>
              <p className="mt-1 text-sm text-muted">These prompt and output settings apply to the current note type, so providers can keep evals, progress notes, and follow-ups configured differently.</p>
            </div>
            <div className="aurora-pill rounded-full px-3 py-1 text-xs font-medium">
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

          <div className="aurora-soft-panel mt-4 rounded-[22px] p-4">
            <div className="text-sm font-semibold text-ink">Section plan</div>
            <p className="mt-1 text-xs text-muted">Providers can decide what sections are included. Full-note mode uses the note profile defaults; selected-sections mode lets you choose exactly what gets rendered.</p>
            <div className="mt-3 text-xs text-muted">
              Planned sections: {sectionPlan.sections.length ? sectionPlan.sections.map((section) => SECTION_LABELS[section]).join(' • ') : 'None'}
            </div>
            <div className="mt-2 text-xs text-muted">
              Standalone MSE required for this scope: {sectionPlan.requiresStandaloneMse ? 'Yes' : 'No'}
            </div>
            {outputScope === 'selected-sections' && availableSectionEntries.length ? (
              <div className="mt-4 grid gap-2 md:grid-cols-2">
                {availableSectionEntries.map((section) => (
                  <label key={section} className="flex items-start gap-3 rounded-[18px] bg-white p-3 text-sm text-ink">
                    <input type="checkbox" checked={requestedSections.includes(section)} onChange={() => toggleRequestedSection(section)} />
                    <span>{SECTION_LABELS[section]}</span>
                  </label>
                ))}
              </div>
            ) : null}
          </div>

          <div className="aurora-soft-panel mt-4 rounded-[22px] p-4">
            <div className="text-sm font-semibold text-ink">Prompt and note preferences</div>
            <p className="mt-1 text-xs text-muted">Set reusable note instructions so Veranote works around the provider, not the other way around. The built-in assistant should follow these preferences for evals, progress notes, and destination-specific formatting.</p>
            <div className="mt-3 text-xs text-muted">
              Saved prompts shown here are scoped to <span className="font-semibold text-slate-700">{noteType}</span>. If you switch note types, Veranote swaps to the matching prompt/preset lane.
            </div>
            {lanePreferenceSuggestion ? (
              <div className="aurora-panel mt-4 rounded-[20px] p-4">
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
                      dismissLanePreferenceSuggestion(noteType, lanePreferenceSuggestion.key);
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
              <div className="aurora-panel mt-4 rounded-[20px] p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-white">Vera insight</div>
                    <p className="mt-1 text-xs text-cyan-50/78">
                      Vera has noticed that you repeatedly use this kind of prompt preference for {noteType.toLowerCase()}: <span className="font-semibold text-white">{promptPreferenceSuggestion.label}</span>. If that is intentional, Vera can draft it again as a reusable preference starting point.
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
                      dismissPromptPreferenceSuggestion(noteType, promptPreferenceSuggestion.key);
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
              <div className="aurora-panel mt-4 rounded-[20px] p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-white">Vera profile insight</div>
                    <p className="mt-1 text-xs text-cyan-50/78">
                      Across the <span className="font-semibold text-white">{activeProviderProfile.name}</span> profile, Vera has noticed a repeated preference pattern: <span className="font-semibold text-white">{profilePromptPreferenceSuggestion.label}</span>. This has shown up across {profilePromptPreferenceSuggestion.noteTypes.length} note types, so Vera can draft it as a broader provider-level starting preference.
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
                      assistantMemoryService.dismissProfilePromptSuggestion(providerSettings.providerProfileId, profilePromptPreferenceSuggestion.key);
                      setProfilePromptPreferenceSuggestion(null);
                    }}
                    className="aurora-secondary-button rounded-xl px-4 py-2 text-sm font-medium"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ) : null}
            <div className="aurora-panel mt-4 rounded-[20px] p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-sm font-semibold text-white">Vera quick builder</div>
                  <p className="mt-1 text-xs text-cyan-50/78">Describe how you want this note lane to behave, then let Vera draft a reusable preference block for you.</p>
                </div>
                <div className="aurora-pill rounded-full px-3 py-1 text-xs font-medium">
                  {noteType}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {[
                  `Make ${noteType} more concise.`,
                  'Keep the assessment more conservative and differential-aware.',
                  'Make the plan shorter and easier to scan.',
                  `Format this cleanly for ${providerSettings.outputDestination === 'Generic' ? 'my destination workflow' : providerSettings.outputDestination}.`,
                ].map((seed) => (
                  <button
                    key={seed}
                    type="button"
                    onClick={() => handleBuildPreferenceDraft(seed)}
                    className="rounded-full border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] px-3 py-1.5 text-xs font-medium text-cyan-50 transition hover:border-cyan-200/24 hover:bg-[rgba(18,181,208,0.12)]"
                  >
                    {seed}
                  </button>
                ))}
              </div>
              <label className="mt-4 grid gap-2 text-sm font-medium text-ink">
                <span>Ask the built-in assistant for help with this note lane</span>
                <textarea
                  value={assistantPreferenceRequest}
                  onChange={(event) => setAssistantPreferenceRequest(event.target.value)}
                  className="min-h-[92px] w-full rounded-lg border border-border bg-white p-3"
                  placeholder={`Example: For ${noteType}, keep the note source-close, make the plan short, and avoid a standalone MSE unless the source clearly supports it.`}
                />
              </label>
              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => handleBuildPreferenceDraft()}
                  className="aurora-secondary-button rounded-xl px-4 py-2 text-sm font-medium"
                >
                  Draft Vera suggestion
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
              {assistantPreferenceDraft ? (
                <div className="aurora-soft-panel mt-4 rounded-[18px] p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Vera draft</div>
                  <div className="mt-2 whitespace-pre-wrap text-sm text-ink">{assistantPreferenceDraft}</div>
                </div>
              ) : null}
            </div>
            <Field label="Preset name">
              <input value={presetName} onChange={(event) => setPresetName(event.target.value)} className="w-full rounded-lg border border-border bg-white p-3" placeholder={`${noteType} Custom`} />
            </Field>
            <textarea value={customInstructions} onChange={(event) => setCustomInstructions(event.target.value)} className="mt-3 min-h-[110px] w-full rounded-lg border border-border p-3" placeholder="Example: For psychiatric evals, keep the assessment differential-aware and source-close. For progress notes, keep the plan brief. In WellSky, only generate HPI and keep psych observations inside HPI rather than a standalone MSE." />
            <div className="mt-3 flex flex-wrap gap-3">
              <button onClick={handleSavePreset} className="aurora-secondary-button rounded-xl px-4 py-2 text-sm font-medium">Save prompt and setup as preset</button>
              <button onClick={handleDeletePreset} disabled={!selectedPresetId || Boolean(presets.find((item) => item.id === selectedPresetId)?.locked)} className="aurora-secondary-button rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50">Delete selected preset</button>
            </div>
            {selectedPresetId ? (
              <div className="mt-2 text-xs text-muted">
                Active prompt: {presets.find((item) => item.id === selectedPresetId)?.name || selectedPresetId}
                {presets.find((item) => item.id === selectedPresetId)?.locked ? ' (starter preset)' : ''} • {noteType}
              </div>
            ) : null}
          </div>
        </div>
        <div className="aurora-panel rounded-[28px] p-6">
          <h2 className="text-lg font-semibold">Trust Settings</h2>
          <div className="mt-4 space-y-3 text-sm text-ink">
            <label className="flex items-start gap-3"><input type="checkbox" checked={flagMissingInfo} onChange={(event) => setFlagMissingInfo(event.target.checked)} /> Flag missing information</label>
            <label className="flex items-start gap-3"><input type="checkbox" checked={keepCloserToSource} onChange={(event) => setKeepCloserToSource(event.target.checked)} /> Keep closer to source wording</label>
            <label className="flex items-start gap-3"><input type="checkbox" defaultChecked disabled /> Strict fact-preserving mode</label>
            <p className="text-muted">Prevents the system from inventing unsupported symptoms, findings, or treatment details.</p>
            <div className="aurora-soft-panel rounded-[18px] p-3 text-xs text-slate-700">
              Draft generation does not replace review. Veranote should help you turn messy input into a cleaner note, but final trust still comes from checking the draft against source in the review stage of this workspace.
            </div>
          </div>
        </div>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="flex flex-wrap gap-3">
        <button onClick={handleGenerate} disabled={isLoading} className="aurora-primary-button rounded-xl px-5 py-3 font-medium disabled:cursor-not-allowed disabled:opacity-60">{isLoading ? 'Generating Draft...' : 'Generate Draft'}</button>
        <button onClick={handleClear} className="aurora-secondary-button rounded-xl px-5 py-3 font-medium">Clear</button>
        <button onClick={handleLoadExample} className="aurora-secondary-button rounded-xl px-5 py-3 font-medium">Load Example</button>
      </div>
      <div className="text-sm text-muted">
        After generation, Veranote opens review inside this same workspace so you can confirm dates, meds, objective data, quoted statements, and psych-specific wording before anything is copied or exported.
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-medium text-ink">
      <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function CollapsibleFormSection({
  title,
  subtitle,
  toneClassName,
  children,
}: {
  title: string;
  subtitle: string;
  toneClassName: string;
  children: React.ReactNode;
}) {
  return (
    <details className={`aurora-panel rounded-[28px] p-6 ${toneClassName}`}>
      <summary className="cursor-pointer list-none">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xl font-semibold">{title}</div>
            <p className="mt-2 max-w-3xl text-sm leading-7 opacity-90">{subtitle}</p>
          </div>
          <div className="aurora-pill rounded-full px-3 py-1 text-xs font-medium opacity-90">
            Open details
          </div>
        </div>
      </summary>
      <div className="mt-5">
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
