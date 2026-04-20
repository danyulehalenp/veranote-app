import type { EncounterSupport, TelehealthModality } from '@/types/session';

type EncounterSupportConfig = {
  title: string;
  intro: string;
  codeFamilies: string[];
  reminders: string[];
  showTimeFields: boolean;
  showPsychotherapyFields: boolean;
  showTelehealthFields: boolean;
  showInteractiveComplexity: boolean;
  showCrisisFields: boolean;
};

function defaultTelehealthModality(noteType: string): TelehealthModality {
  if (/telehealth/i.test(noteType)) {
    return 'audio-video';
  }

  return 'not-applicable';
}

export function getEncounterSupportConfig(noteType: string): EncounterSupportConfig {
  if (/psychiatric crisis/i.test(noteType)) {
    return {
      title: 'Crisis encounter support',
      intro: 'Capture the minimum timing and intervention details needed to keep a crisis note reviewable without pretending Veranote is deciding the code for you.',
      codeFamilies: ['Psychotherapy for crisis (90839/90840)', 'Interactive complexity when separately supported'],
      reminders: [
        'Document crisis timing literally if you intend to support crisis psychotherapy.',
        'Keep intervention details concrete rather than substituting generic reassurance language.',
        'If interactive complexity is marked, name the actual communication barrier or third-party dynamic.',
      ],
      showTimeFields: true,
      showPsychotherapyFields: false,
      showTelehealthFields: false,
      showInteractiveComplexity: true,
      showCrisisFields: true,
    };
  }

  if (/telehealth/i.test(noteType)) {
    return {
      title: 'Telehealth encounter support',
      intro: 'Capture the telehealth and time details that help the draft stay reviewable, especially when the visit includes medication management, psychotherapy time, or remote safety language.',
      codeFamilies: ['Office / outpatient E/M support', 'Psychotherapy add-on support when separately documented', 'Telehealth behavioral-health support'],
      reminders: [
        'Keep modality, consent, and location details literal rather than implied.',
        'Psychotherapy minutes should only be entered if they are actually documented for the encounter.',
        'Remote visits should not sound like in-person visits just because the note is cleaner.',
      ],
      showTimeFields: true,
      showPsychotherapyFields: true,
      showTelehealthFields: true,
      showInteractiveComplexity: true,
      showCrisisFields: false,
    };
  }

  if (/outpatient psych follow-up|psychiatry follow-up/i.test(noteType)) {
    return {
      title: 'Outpatient follow-up encounter support',
      intro: 'Use this when the follow-up visit needs structured time or psychotherapy-add-on context, while keeping medical necessity and symptom change grounded in the actual source.',
      codeFamilies: ['Office / outpatient E/M support', 'Psychotherapy add-on support when separately documented'],
      reminders: [
        'Minutes help only when they are actually documented for the visit.',
        'Psychotherapy add-on context should stay separate from med-management facts.',
        'Interactive complexity is assistive only and needs a real reason, not a checked box alone.',
      ],
      showTimeFields: true,
      showPsychotherapyFields: true,
      showTelehealthFields: false,
      showInteractiveComplexity: true,
      showCrisisFields: false,
    };
  }

  if (/outpatient psychiatric evaluation/i.test(noteType)) {
    return {
      title: 'Outpatient evaluation encounter support',
      intro: 'Use this to keep a psychiatric evaluation note reviewable around visit timing, interactive complexity, and telehealth context when relevant.',
      codeFamilies: ['Psychiatric diagnostic evaluation support (90791/90792)', 'Office / outpatient E/M support when applicable'],
      reminders: [
        'Keep diagnosis uncertainty visible even if the evaluation is long or detailed.',
        'Interactive complexity should be tied to a documented communication barrier or participant dynamic.',
        'Do not use encounter structure to overstate diagnostic certainty.',
      ],
      showTimeFields: true,
      showPsychotherapyFields: false,
      showTelehealthFields: false,
      showInteractiveComplexity: true,
      showCrisisFields: false,
    };
  }

  if (/therapy/i.test(noteType)) {
    return {
      title: 'Psychotherapy encounter support',
      intro: 'Use this to preserve therapy time and complexity support without letting the note invent interventions, gains, or risk statements.',
      codeFamilies: ['Psychotherapy support (90832/90834/90837)', 'Interactive complexity when separately supported'],
      reminders: [
        'Time should reflect what is actually documented, not what is typical for the appointment slot.',
        'Interactive complexity needs a real communication factor or participant dynamic.',
        'Therapy notes should stay clinically meaningful without turning into billing prose.',
      ],
      showTimeFields: true,
      showPsychotherapyFields: true,
      showTelehealthFields: false,
      showInteractiveComplexity: true,
      showCrisisFields: false,
    };
  }

  return {
    title: 'Encounter support',
    intro: 'This layer is optional and assistive. It carries structured encounter details into drafting and review without turning Veranote into a coding oracle.',
    codeFamilies: ['General encounter support only'],
    reminders: [
      'Use this only for facts you already have.',
      'Encounter support should guide review, not replace clinical judgment or coding review.',
    ],
    showTimeFields: false,
    showPsychotherapyFields: false,
    showTelehealthFields: false,
    showInteractiveComplexity: false,
    showCrisisFields: false,
  };
}

export function createEncounterSupportDefaults(noteType: string): EncounterSupport {
  return {
    serviceDate: '',
    totalMinutes: '',
    psychotherapyMinutes: '',
    sessionStartTime: '',
    sessionEndTime: '',
    telehealthModality: defaultTelehealthModality(noteType),
    telehealthConsent: false,
    patientLocation: '',
    providerLocation: '',
    emergencyContact: '',
    interactiveComplexity: false,
    interactiveComplexityReason: '',
    crisisStartTime: '',
    crisisEndTime: '',
    crisisInterventionSummary: '',
  };
}

export function normalizeEncounterSupport(
  value: unknown,
  noteType: string,
): EncounterSupport {
  const defaults = createEncounterSupportDefaults(noteType);
  const candidate = (value && typeof value === 'object') ? value as Partial<EncounterSupport> : {};

  const telehealthModality = candidate.telehealthModality;
  const normalizedModality: TelehealthModality =
    telehealthModality === 'audio-video'
    || telehealthModality === 'audio-only'
    || telehealthModality === 'in-person'
    || telehealthModality === 'not-applicable'
      ? telehealthModality
      : defaults.telehealthModality || 'not-applicable';

  return {
    ...defaults,
    serviceDate: typeof candidate.serviceDate === 'string' ? candidate.serviceDate : defaults.serviceDate,
    totalMinutes: typeof candidate.totalMinutes === 'string' ? candidate.totalMinutes : defaults.totalMinutes,
    psychotherapyMinutes: typeof candidate.psychotherapyMinutes === 'string' ? candidate.psychotherapyMinutes : defaults.psychotherapyMinutes,
    sessionStartTime: typeof candidate.sessionStartTime === 'string' ? candidate.sessionStartTime : defaults.sessionStartTime,
    sessionEndTime: typeof candidate.sessionEndTime === 'string' ? candidate.sessionEndTime : defaults.sessionEndTime,
    telehealthModality: normalizedModality,
    telehealthConsent: Boolean(candidate.telehealthConsent),
    patientLocation: typeof candidate.patientLocation === 'string' ? candidate.patientLocation : defaults.patientLocation,
    providerLocation: typeof candidate.providerLocation === 'string' ? candidate.providerLocation : defaults.providerLocation,
    emergencyContact: typeof candidate.emergencyContact === 'string' ? candidate.emergencyContact : defaults.emergencyContact,
    interactiveComplexity: Boolean(candidate.interactiveComplexity),
    interactiveComplexityReason: typeof candidate.interactiveComplexityReason === 'string' ? candidate.interactiveComplexityReason : defaults.interactiveComplexityReason,
    crisisStartTime: typeof candidate.crisisStartTime === 'string' ? candidate.crisisStartTime : defaults.crisisStartTime,
    crisisEndTime: typeof candidate.crisisEndTime === 'string' ? candidate.crisisEndTime : defaults.crisisEndTime,
    crisisInterventionSummary: typeof candidate.crisisInterventionSummary === 'string' ? candidate.crisisInterventionSummary : defaults.crisisInterventionSummary,
  };
}

export function buildEncounterSupportPromptLines(encounterSupport: EncounterSupport | undefined, noteType: string) {
  if (!encounterSupport) {
    return [];
  }

  const config = getEncounterSupportConfig(noteType);
  const lines = [
    `Encounter support mode: ${config.title}.`,
    'Treat these fields as assistive documentation context only. Do not state or imply a billing code decision in the draft.',
  ];

  if (encounterSupport.serviceDate?.trim()) {
    lines.push(`Service date documented: ${encounterSupport.serviceDate.trim()}.`);
  }

  if (config.showTimeFields && encounterSupport.totalMinutes?.trim()) {
    lines.push(`Total documented encounter minutes: ${encounterSupport.totalMinutes.trim()}.`);
  }

  if (config.showPsychotherapyFields && encounterSupport.psychotherapyMinutes?.trim()) {
    lines.push(`Psychotherapy minutes documented separately: ${encounterSupport.psychotherapyMinutes.trim()}.`);
  }

  if (config.showTelehealthFields) {
    lines.push(`Telehealth modality: ${encounterSupport.telehealthModality || 'not documented'}.`);
    if (encounterSupport.telehealthConsent) {
      lines.push('Telehealth consent documented in the structured encounter fields.');
    }
    if (encounterSupport.patientLocation?.trim()) {
      lines.push(`Patient location documented: ${encounterSupport.patientLocation.trim()}.`);
    }
    if (encounterSupport.providerLocation?.trim()) {
      lines.push(`Provider location documented: ${encounterSupport.providerLocation.trim()}.`);
    }
    if (encounterSupport.emergencyContact?.trim()) {
      lines.push(`Emergency contact / local safety support documented: ${encounterSupport.emergencyContact.trim()}.`);
    }
  }

  if (encounterSupport.interactiveComplexity) {
    lines.push('Interactive complexity support was marked for this encounter.');
    if (encounterSupport.interactiveComplexityReason?.trim()) {
      lines.push(`Interactive complexity context: ${encounterSupport.interactiveComplexityReason.trim()}.`);
    }
  }

  if (config.showCrisisFields) {
    if (encounterSupport.crisisStartTime?.trim()) {
      lines.push(`Crisis service start time documented: ${encounterSupport.crisisStartTime.trim()}.`);
    }
    if (encounterSupport.crisisEndTime?.trim()) {
      lines.push(`Crisis service end time documented: ${encounterSupport.crisisEndTime.trim()}.`);
    }
    if (encounterSupport.crisisInterventionSummary?.trim()) {
      lines.push(`Documented crisis interventions / actions: ${encounterSupport.crisisInterventionSummary.trim()}.`);
    }
  }

  return lines;
}

export function buildEncounterSupportSummary(encounterSupport: EncounterSupport | undefined, noteType: string) {
  if (!encounterSupport) {
    return [];
  }

  const config = getEncounterSupportConfig(noteType);
  const summary = [];

  if (encounterSupport.serviceDate?.trim()) {
    summary.push(`Service date: ${encounterSupport.serviceDate.trim()}`);
  }

  if (config.showTimeFields && encounterSupport.totalMinutes?.trim()) {
    summary.push(`Total minutes: ${encounterSupport.totalMinutes.trim()}`);
  }

  if (config.showPsychotherapyFields && encounterSupport.psychotherapyMinutes?.trim()) {
    summary.push(`Psychotherapy minutes: ${encounterSupport.psychotherapyMinutes.trim()}`);
  }

  if (config.showTelehealthFields) {
    summary.push(`Modality: ${encounterSupport.telehealthModality || 'not documented'}`);
    if (encounterSupport.telehealthConsent) {
      summary.push('Telehealth consent documented');
    }
    if (encounterSupport.patientLocation?.trim()) {
      summary.push(`Patient location: ${encounterSupport.patientLocation.trim()}`);
    }
    if (encounterSupport.providerLocation?.trim()) {
      summary.push(`Provider location: ${encounterSupport.providerLocation.trim()}`);
    }
    if (encounterSupport.emergencyContact?.trim()) {
      summary.push(`Emergency support: ${encounterSupport.emergencyContact.trim()}`);
    }
  }

  if (encounterSupport.interactiveComplexity) {
    summary.push(`Interactive complexity: ${encounterSupport.interactiveComplexityReason?.trim() || 'marked'}`);
  }

  if (config.showCrisisFields) {
    if (encounterSupport.crisisStartTime?.trim() || encounterSupport.crisisEndTime?.trim()) {
      summary.push(`Crisis time: ${encounterSupport.crisisStartTime?.trim() || '?'} to ${encounterSupport.crisisEndTime?.trim() || '?'}`);
    }
    if (encounterSupport.crisisInterventionSummary?.trim()) {
      summary.push(`Crisis actions: ${encounterSupport.crisisInterventionSummary.trim()}`);
    }
  }

  return summary;
}

export function buildEncounterSupportWarnings(encounterSupport: EncounterSupport | undefined, noteType: string) {
  if (!encounterSupport) {
    return [];
  }

  const config = getEncounterSupportConfig(noteType);
  const warnings = [];

  if (config.showTelehealthFields) {
    if (!encounterSupport.telehealthConsent) {
      warnings.push('Telehealth consent is not marked in encounter support.');
    }
    if (!encounterSupport.patientLocation?.trim()) {
      warnings.push('Patient location is still blank for this telehealth note.');
    }
    if (!encounterSupport.telehealthModality || encounterSupport.telehealthModality === 'not-applicable') {
      warnings.push('Telehealth modality is still missing or marked not applicable.');
    }
  }

  if (config.showPsychotherapyFields && !encounterSupport.psychotherapyMinutes?.trim() && /therapy|follow-up|follow up/i.test(noteType)) {
    warnings.push('Psychotherapy minutes are blank. Leave them blank if not documented, but review whether the encounter included separately documented psychotherapy time.');
  }

  if (config.showCrisisFields) {
    if (!encounterSupport.crisisStartTime?.trim() || !encounterSupport.crisisEndTime?.trim()) {
      warnings.push('Crisis timing is incomplete.');
    }
    if (!encounterSupport.crisisInterventionSummary?.trim()) {
      warnings.push('Crisis intervention summary is blank.');
    }
  }

  if (encounterSupport.interactiveComplexity && !encounterSupport.interactiveComplexityReason?.trim()) {
    warnings.push('Interactive complexity is marked without a supporting reason.');
  }

  return warnings;
}
