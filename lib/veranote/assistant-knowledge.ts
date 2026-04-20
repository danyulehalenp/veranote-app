import type { AssistantApiContext, AssistantReferenceSource, AssistantResponsePayload } from '@/types/assistant';
import { buildMedicalNecessityHelp } from '@/lib/veranote/assistant-medical-necessity-help';
import { buildPsychCptHelp } from '@/lib/veranote/assistant-psych-cpt-knowledge';
import { buildPsychDiagnosisCodingHelp } from '@/lib/veranote/assistant-psych-diagnosis-coding';
import { buildPsychDiagnosisConceptHelp } from '@/lib/veranote/assistant-psych-diagnosis-concepts';
import { buildPsychMedicationReferenceHelp } from '@/lib/veranote/assistant-psych-med-knowledge';
import { getAssistantReferencePolicy } from '@/lib/veranote/assistant-source-policy';

function hasKeyword(message: string, keywords: string[]) {
  return keywords.some((keyword) => message.includes(keyword));
}

function shortProviderName(address?: string) {
  if (!address?.trim()) {
    return null;
  }

  const cleaned = address.replace(/,.*$/, '').trim();
  if (!cleaned) {
    return null;
  }

  if (cleaned.startsWith('Dr. ')) {
    return cleaned;
  }

  return cleaned.split(/\s+/)[0] || cleaned;
}

export function buildGeneralKnowledgeHelp(normalizedMessage: string, context?: AssistantApiContext): AssistantResponsePayload | null {
  const normalized = normalizedMessage.toLowerCase();
  const providerName = shortProviderName(context?.providerAddressingName);
  const directLead = providerName ? `${providerName}, ` : '';
  const diagnosisCodingHelp = buildPsychDiagnosisCodingHelp(normalized, directLead);

  if (diagnosisCodingHelp) {
    return diagnosisCodingHelp;
  }

  const medicalNecessityHelp = buildMedicalNecessityHelp(normalized, context);

  if (medicalNecessityHelp) {
    return medicalNecessityHelp;
  }

  const psychCptHelp = buildPsychCptHelp(normalized, context?.currentDraftText);

  if (psychCptHelp) {
    return psychCptHelp;
  }

  const diagnosisConceptHelp = buildPsychDiagnosisConceptHelp(normalized);

  if (diagnosisConceptHelp) {
    return diagnosisConceptHelp;
  }

  const psychMedicationHelp = buildPsychMedicationReferenceHelp(normalized);

  if (psychMedicationHelp) {
    return psychMedicationHelp;
  }

  const referenceLinks = buildTrustedReferenceLinks(normalized);
  if (hasKeyword(normalized, ['what is soap', 'what does soap mean', 'soap note'])) {
    return {
      message: 'SOAP stands for Subjective, Objective, Assessment, and Plan. It is a note structure that separates what the patient reports, what is observed or measured, the clinician’s assessment, and the documented next steps.',
      suggestions: ['If you want, I can help shape raw details into a SOAP-style note.'],
      references: referenceLinks,
    };
  }

  if (hasKeyword(normalized, ['difference between h&p and consult', 'difference between consult and h&p', 'h&p vs consult', 'consult vs h&p'])) {
    return {
      message: 'An H&P is the primary history and physical for a patient encounter or admission. A consult note is narrower: it answers a specific question or evaluates one problem at the request of another clinician or service.',
      suggestions: ['If you want, I can help structure the same source material as either an H&P or a consult note.'],
      references: referenceLinks,
    };
  }

  if (
    hasKeyword(normalized, ['what does', 'what is', 'meaning of'])
    && hasKeyword(normalized, ['h&p', 'history and physical', 'hpi', 'mse', 'uds', 'upt', 'icd 10', 'icd-10', 'a1c', 'cbc', 'cmp', 'phq-9', 'phq 9', 'c-ssrs', 'cssrs'])
  ) {
    if (hasKeyword(normalized, ['h&p', 'history and physical'])) {
      return {
        message: 'H&P means History and Physical. It is the core admission or encounter note that documents the history, relevant review, exam findings when appropriate, assessment, and plan for the patient.',
        suggestions: ['If you want, I can help structure the same raw details as an H&P or as a consult note.'],
        references: referenceLinks,
      };
    }

    if (hasKeyword(normalized, ['hpi'])) {
      return {
        message: 'HPI means History of Present Illness. In practice, it is the section that captures the current story of why the patient is being seen and what has changed since the last contact.',
        suggestions: ['If you want, I can help draft the HPI from your patient details.'],
        references: referenceLinks,
      };
    }

    if (hasKeyword(normalized, ['mse'])) {
      return {
        message: 'MSE means Mental Status Exam. It documents observed presentation such as appearance, behavior, speech, mood, affect, thought process, thought content, cognition, insight, and judgment.',
        suggestions: ['If you want, I can help keep MSE wording brief and source-faithful.'],
        references: referenceLinks,
      };
    }

    if (hasKeyword(normalized, ['uds'])) {
      return {
        message: 'UDS means urine drug screen.',
        suggestions: ['If you send the actual results, I can help place them into the note cleanly.'],
        references: referenceLinks,
      };
    }

    if (hasKeyword(normalized, ['upt'])) {
      return {
        message: 'UPT means urine pregnancy test.',
        suggestions: ['If you send the actual result, I can help place it into the note cleanly.'],
        references: referenceLinks,
      };
    }

    if (hasKeyword(normalized, ['a1c', 'hba1c'])) {
      return {
        message: 'A1c, or hemoglobin A1c, reflects average blood glucose over roughly the last 2 to 3 months.',
        suggestions: ['If you want, I can help place A1c results into the note in a cleaner objective section.'],
        references: referenceLinks,
      };
    }

    if (hasKeyword(normalized, ['cbc', 'complete blood count'])) {
      return {
        message: 'CBC means complete blood count. It measures components such as white blood cells, hemoglobin, hematocrit, and platelets.',
        suggestions: ['If you want, I can help place CBC findings into the objective section without overinterpreting them.'],
        references: referenceLinks,
      };
    }

    if (hasKeyword(normalized, ['cmp', 'comprehensive metabolic panel'])) {
      return {
        message: 'CMP means comprehensive metabolic panel. It includes electrolytes, kidney function, liver-related markers, glucose, and related chemistry values.',
        suggestions: ['If you want, I can help summarize CMP results in a clean, source-faithful way.'],
        references: referenceLinks,
      };
    }

    if (hasKeyword(normalized, ['phq-9', 'phq 9'])) {
      return {
        message: 'PHQ-9 is a nine-item depression screening questionnaire commonly used to screen for and track depressive symptom burden.',
        suggestions: ['If you want, I can help document PHQ-9 results without overstating what they mean clinically.'],
        references: referenceLinks,
      };
    }

    if (hasKeyword(normalized, ['c-ssrs', 'cssrs'])) {
      return {
        message: 'C-SSRS stands for the Columbia-Suicide Severity Rating Scale. It is a structured suicide risk screening and assessment tool.',
        suggestions: ['If you want, I can help keep C-SSRS results literal and time-aware in the note.'],
        references: referenceLinks,
      };
    }
  }

  if (hasKeyword(normalized, ['what goes in assessment', 'what belongs in assessment'])) {
    return {
      message: 'The assessment is where you summarize the current clinical picture, explain what you think is going on, preserve uncertainty or differential thinking when needed, and connect the documented facts to the plan.',
      suggestions: ['If you want, I can help make an assessment more concise, more conservative, or more source-faithful.'],
      references: referenceLinks,
    };
  }

  if (hasKeyword(normalized, ['what goes in plan', 'what belongs in plan'])) {
    return {
      message: 'The plan should document the actual next steps: medications, monitoring, follow-up, safety actions, coordination, testing, and any disposition or treatment steps that are clearly supported.',
      suggestions: ['If you want, I can help tighten a plan so it stays brief without dropping important next steps.'],
      references: referenceLinks,
    };
  }

  return null;
}

export function buildReferenceLookupHelp(normalizedMessage: string, context?: AssistantApiContext): AssistantResponsePayload | null {
  const knowledge = buildGeneralKnowledgeHelp(normalizedMessage.toLowerCase(), context);
  if (knowledge) {
    return {
      ...knowledge,
      suggestions: [
        ...(knowledge.suggestions || []),
        'This answer is using Vera reference lookup rather than note-grounded source review.',
      ],
    };
  }

  const references = buildTrustedReferenceLinks(normalizedMessage.toLowerCase());
  return {
    message: "I don't have a trusted reference answer for that yet. Use Teach Vera this if you want me to learn this lookup next.",
    suggestions: [
      'Reference lookup is currently limited to trusted source topics Vera already knows how to answer.',
    ],
    references,
  };
}

function buildTrustedReferenceLinks(normalizedMessage: string): AssistantReferenceSource[] {
  return getAssistantReferencePolicy(normalizedMessage).directReferences;
}

function dedupeReferences(links: AssistantReferenceSource[]) {
  const seen = new Set<string>();
  return links.filter((link) => {
    if (seen.has(link.url)) {
      return false;
    }
    seen.add(link.url);
    return true;
  });
}
