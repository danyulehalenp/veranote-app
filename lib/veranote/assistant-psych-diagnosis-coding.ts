import type { AssistantReferenceSource, AssistantResponsePayload } from '@/types/assistant';
import { getAssistantReferencePolicy } from '@/lib/veranote/assistant-source-policy';
import {
  buildPriorityStructuredPsychDiagnosisHelp,
  buildStructuredPsychDiagnosisCatalogHelp,
} from '@/lib/veranote/assistant-psych-diagnosis-catalog';

function hasKeyword(message: string, keywords: string[]) {
  return keywords.some((keyword) => message.includes(keyword));
}

function hasCodingCue(message: string) {
  return /(icd|icd-10|icd10|diagnosis code|coding|code|dx\b)/i.test(message);
}

function buildCodingReferences(query: string) {
  const policy = getAssistantReferencePolicy(query);
  return [...policy.directReferences, ...policy.searchReferences].slice(0, 4);
}

function payload(message: string, suggestions: string[], references: AssistantReferenceSource[]): AssistantResponsePayload {
  return {
    message,
    suggestions,
    references,
  };
}

export function buildPsychDiagnosisCodingHelp(normalizedMessage: string, directLead = ''): AssistantResponsePayload | null {
  const normalized = normalizedMessage.toLowerCase();

  if (!hasCodingCue(normalized)) {
    return null;
  }

  const references = buildCodingReferences(normalized);
  const priorityCatalogHelp = buildPriorityStructuredPsychDiagnosisHelp(normalized, directLead);
  if (priorityCatalogHelp) {
    return priorityCatalogHelp;
  }

  if (hasKeyword(normalized, ['mdd', 'major depressive disorder', 'depression'])) {
    if (hasKeyword(normalized, ['single episode']) && hasKeyword(normalized, ['partial remission'])) {
      return payload(
        `${directLead}for major depressive disorder, single episode, in partial remission, the ICD-10-CM code is F32.4.`,
        [
          'If the documentation supports full remission instead, the code changes to F32.5.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['single episode']) && hasKeyword(normalized, ['full remission'])) {
      return payload(
        `${directLead}for major depressive disorder, single episode, in full remission, the ICD-10-CM code is F32.5.`,
        [
          'If the documentation supports partial remission instead, the code changes to F32.4.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['recurrent']) && hasKeyword(normalized, ['partial remission'])) {
      return payload(
        `${directLead}for major depressive disorder, recurrent, in partial remission, the ICD-10-CM code is F33.41.`,
        [
          'If the documentation supports full remission instead, the code changes to F33.42.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['recurrent']) && hasKeyword(normalized, ['full remission'])) {
      return payload(
        `${directLead}for major depressive disorder, recurrent, in full remission, the ICD-10-CM code is F33.42.`,
        [
          'If the documentation supports partial remission instead, the code changes to F33.41.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['recurrent', 'severe']) && hasKeyword(normalized, ['without psychotic', 'no psychotic'])) {
      return payload(
        `${directLead}for major depressive disorder, recurrent, severe, without psychotic features, the ICD-10-CM code is F33.2.`,
        [
          'If you want, I can also help narrow single-episode versus recurrent and severity-based MDD coding choices.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['single episode', 'single']) && hasKeyword(normalized, ['severe']) && hasKeyword(normalized, ['without psychotic', 'no psychotic'])) {
      return payload(
        `${directLead}for major depressive disorder, single episode, severe, without psychotic features, the ICD-10-CM code is F32.2.`,
        [
          'If you want, I can also help narrow other MDD severity and recurrence combinations.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    return payload(
      `${directLead}the ICD-10-CM code for major depressive disorder depends on whether the episode is single or recurrent and how severity is documented. Common examples are F32.A for major depressive disorder, single episode, unspecified, and F33.9 for major depressive disorder, recurrent, unspecified. If severity or psychotic features are documented, the code changes.`,
      [
        'Tell me whether you mean single episode or recurrent, and whether severity is documented, and I can narrow it down.',
        'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
      ],
      references,
    );
  }

  if (hasKeyword(normalized, ['persistent depressive disorder', 'pdd', 'dysthymia', 'dysthymic disorder', 'prolonged grief disorder', 'disruptive mood dysregulation disorder', 'cyclothymic disorder'])) {
    if (hasKeyword(normalized, ['disruptive mood dysregulation disorder'])) {
      return payload(
        `${directLead}for disruptive mood dysregulation disorder, the ICD-10-CM code is F34.81.`,
        [
          'If the documentation supports another depressive or bipolar-spectrum diagnosis instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['cyclothymic disorder'])) {
      return payload(
        `${directLead}for cyclothymic disorder, the ICD-10-CM code is F34.0.`,
        [
          'If the documentation supports bipolar disorder or another persistent mood disorder instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['prolonged grief disorder'])) {
      return payload(
        `${directLead}for prolonged grief disorder, the ICD-10-CM code is F43.81.`,
        [
          'If the documentation supports major depressive disorder, adjustment disorder, or another trauma- or stressor-related disorder instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    return payload(
      `${directLead}for persistent depressive disorder, also called dysthymia or dysthymic disorder in ICD-10-CM terminology, the code is F34.1.`,
      [
        'If the documentation instead supports major depressive disorder, the code path changes.',
        'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
      ],
      references,
    );
  }

  if (hasKeyword(normalized, ['anxiety', 'gad', 'generalized anxiety disorder', 'panic disorder', 'agoraphobia', 'social anxiety', 'social phobia', 'specific phobia', 'claustrophobia', 'phobic anxiety disorder', 'ocd', 'obsessive-compulsive disorder', 'hoarding disorder', 'excoriation disorder', 'body dysmorphic disorder'])) {
    if (hasKeyword(normalized, ['generalized anxiety disorder', 'gad'])) {
      return payload(
        `${directLead}for generalized anxiety disorder, the ICD-10-CM code is F41.1.`,
        [
          'If you mean unspecified anxiety rather than generalized anxiety disorder, the code may be different.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['panic disorder']) && !hasKeyword(normalized, ['agoraphobia'])) {
      return payload(
        `${directLead}for panic disorder without agoraphobia, the ICD-10-CM code is F41.0.`,
        [
          'If agoraphobia is also documented, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['panic disorder']) && hasKeyword(normalized, ['agoraphobia'])) {
      return payload(
        `${directLead}for agoraphobia with panic disorder, the ICD-10-CM code is F40.01. If the documentation supports agoraphobia without panic disorder, the code is F40.00.`,
        [
          'If you want, I can help separate panic disorder without agoraphobia from agoraphobia with or without panic disorder.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['social anxiety', 'social phobia'])) {
      return payload(
        `${directLead}for social anxiety disorder, the ICD-10-CM code depends on whether the documentation supports unspecified versus generalized social phobia. Common examples are F40.10 for social phobia, unspecified, and F40.11 for social phobia, generalized.`,
        [
          'If the note specifically supports generalized social anxiety, that narrows the code choice.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['agoraphobia'])) {
      return payload(
        `${directLead}for agoraphobia, the ICD-10-CM code depends on whether panic disorder is also documented. Common anchors are F40.00 for agoraphobia without panic disorder and F40.01 for agoraphobia with panic disorder.`,
        [
          'If you tell me whether panic disorder is also documented, I can narrow it down further.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['claustrophobia', 'specific phobia', 'phobic anxiety disorder'])) {
      return payload(
        `${directLead}for specific or phobic anxiety disorders, the ICD-10-CM code depends on the documented phobia. Common anchors are F40.298 for other specified phobia, F40.240 for claustrophobia, and F40.9 for phobic anxiety disorder, unspecified.`,
        [
          'If you tell me the specific documented phobia, I can narrow it down further.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['ocd', 'obsessive-compulsive disorder', 'obsessive compulsive disorder'])) {
      return payload(
        `${directLead}for obsessive-compulsive spectrum diagnoses, the ICD-10-CM code depends on the documented subtype. Common examples are F42.9 for obsessive-compulsive disorder, unspecified, F42.2 for mixed obsessional thoughts and acts, F42.3 for hoarding disorder, and F42.4 for excoriation disorder.`,
        [
          'If you tell me the documented OCD-spectrum subtype, I can narrow it down further.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['body dysmorphic disorder'])) {
      return payload(
        `${directLead}for body dysmorphic disorder, the ICD-10-CM code is F45.22.`,
        [
          'If the documentation supports another obsessive-compulsive-related disorder instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    return payload(
      `${directLead}the ICD-10-CM code for anxiety depends on the documented anxiety disorder. Common examples are F41.9 for anxiety disorder, unspecified, F41.1 for generalized anxiety disorder, and F41.0 for panic disorder without agoraphobia.`,
      [
        'Tell me whether you mean generalized anxiety disorder, panic disorder, social anxiety disorder, OCD-spectrum illness, or unspecified anxiety, and I can narrow it down.',
        'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
      ],
      references,
    );
  }

  if (hasKeyword(normalized, ['bipolar', 'bipolar disorder', 'bipolar ii', 'bipolar 2', 'bipolar i', 'bipolar 1'])) {
    if (hasKeyword(normalized, ['bipolar ii', 'bipolar 2'])) {
      return payload(
        `${directLead}for bipolar II disorder, the ICD-10-CM code is F31.81.`,
        [
          'If you mean bipolar disorder, unspecified or a bipolar I current-episode code, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['current episode manic'])) {
      return payload(
        `${directLead}for bipolar disorder with a current manic episode, the ICD-10-CM code depends on severity and psychotic features. A common anchor is F31.10 for bipolar disorder, current episode manic without psychotic features, unspecified severity.`,
        [
          'If severity or psychotic features are documented, the specific code changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['current episode depressed'])) {
      if (hasKeyword(normalized, ['severe']) && hasKeyword(normalized, ['without psychotic', 'no psychotic'])) {
        return payload(
          `${directLead}for bipolar disorder, current episode depressed, severe, without psychotic features, the ICD-10-CM code is F31.4.`,
          [
            'If psychotic features are documented, the code changes to F31.5.',
            'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
          ],
          references,
        );
      }

      if (hasKeyword(normalized, ['severe']) && hasKeyword(normalized, ['with psychotic', 'psychotic features'])) {
        return payload(
          `${directLead}for bipolar disorder, current episode depressed, severe, with psychotic features, the ICD-10-CM code is F31.5.`,
          [
            'If psychotic features are not documented, the code changes to F31.4.',
            'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
          ],
          references,
        );
      }

      return payload(
        `${directLead}for bipolar disorder with a current depressive episode, the ICD-10-CM code depends on severity, remission status, and psychotic features. A common anchor is F31.30 for bipolar disorder, current episode depressed, mild or moderate severity, unspecified.`,
        [
          'If the note documents severe depression, psychotic features, or remission, the specific code changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['mixed episode', 'current episode mixed'])) {
      if (hasKeyword(normalized, ['severe']) && hasKeyword(normalized, ['without psychotic', 'no psychotic'])) {
        return payload(
          `${directLead}for bipolar disorder, current episode mixed, severe, without psychotic features, the ICD-10-CM code is F31.63.`,
          [
            'If psychotic features are documented, the code changes to F31.64.',
            'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
          ],
          references,
        );
      }

      if (hasKeyword(normalized, ['severe']) && hasKeyword(normalized, ['with psychotic', 'psychotic features'])) {
        return payload(
          `${directLead}for bipolar disorder, current episode mixed, severe, with psychotic features, the ICD-10-CM code is F31.64.`,
          [
            'If psychotic features are not documented, the code changes to F31.63.',
            'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
          ],
          references,
        );
      }
    }

    if (hasKeyword(normalized, ['in remission', 'partial remission', 'full remission'])) {
      if (hasKeyword(normalized, ['most recent episode depressed'])) {
        if (hasKeyword(normalized, ['partial remission'])) {
          return payload(
            `${directLead}for bipolar disorder, in partial remission, most recent episode depressed, the ICD-10-CM code is F31.75.`,
            [
              'If the documentation supports full remission instead, the code changes to F31.76.',
              'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
            ],
            references,
          );
        }

        return payload(
          `${directLead}for bipolar disorder, in full remission, most recent episode depressed, the ICD-10-CM code is F31.76.`,
          [
            'If the documentation supports partial remission instead, the code changes to F31.75.',
            'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
          ],
          references,
        );
      }

      if (hasKeyword(normalized, ['most recent episode manic'])) {
        if (hasKeyword(normalized, ['partial remission'])) {
          return payload(
            `${directLead}for bipolar disorder, in partial remission, most recent episode manic, the ICD-10-CM code is F31.73.`,
            [
              'If the documentation supports full remission instead, the code changes to F31.74.',
              'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
            ],
            references,
          );
        }

        return payload(
          `${directLead}for bipolar disorder, in full remission, most recent episode manic, the ICD-10-CM code is F31.74.`,
          [
            'If the documentation supports partial remission instead, the code changes to F31.73.',
            'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
          ],
          references,
        );
      }

      if (hasKeyword(normalized, ['most recent episode hypomanic'])) {
        if (hasKeyword(normalized, ['partial remission'])) {
          return payload(
            `${directLead}for bipolar disorder, in partial remission, most recent episode hypomanic, the ICD-10-CM code is F31.71.`,
            [
              'If the documentation supports full remission instead, the code changes to F31.72.',
              'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
            ],
            references,
          );
        }

        return payload(
          `${directLead}for bipolar disorder, in full remission, most recent episode hypomanic, the ICD-10-CM code is F31.72.`,
          [
            'If the documentation supports partial remission instead, the code changes to F31.71.',
            'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
          ],
          references,
        );
      }

      if (hasKeyword(normalized, ['most recent episode mixed'])) {
        if (hasKeyword(normalized, ['partial remission'])) {
          return payload(
            `${directLead}for bipolar disorder, in partial remission, most recent episode mixed, the ICD-10-CM code is F31.77.`,
            [
              'If the documentation supports full remission instead, the code changes to F31.78.',
              'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
            ],
            references,
          );
        }

        return payload(
          `${directLead}for bipolar disorder, in full remission, most recent episode mixed, the ICD-10-CM code is F31.78.`,
          [
            'If the documentation supports partial remission instead, the code changes to F31.77.',
            'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
          ],
          references,
        );
      }
    }

    return payload(
      `${directLead}the ICD-10-CM code for bipolar disorder depends on the documented bipolar subtype and current episode. Common examples are F31.9 for bipolar disorder, unspecified, and F31.81 for bipolar II disorder.`,
      [
        'If you tell me whether you mean bipolar I, bipolar II, unspecified bipolar disorder, or a specific current episode, I can narrow it down further.',
        'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
      ],
      references,
    );
  }

  if (hasKeyword(normalized, ['ptsd', 'post-traumatic stress disorder', 'post traumatic stress disorder', 'adjustment disorder'])) {
    if (hasKeyword(normalized, ['adjustment disorder'])) {
      if (hasKeyword(normalized, ['mixed disturbance of emotions and conduct', 'mixed disturbance of emotion and conduct'])) {
        return payload(
          `${directLead}for adjustment disorder with mixed disturbance of emotions and conduct, the ICD-10-CM code is F43.25.`,
          [
            'If the documentation instead supports mixed anxiety and depressed mood without conduct disturbance, the code changes to F43.23.',
            'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
          ],
          references,
        );
      }

      if (hasKeyword(normalized, ['disturbance of conduct'])) {
        return payload(
          `${directLead}for adjustment disorder with disturbance of conduct, the ICD-10-CM code is F43.24.`,
          [
            'If the documentation instead supports mixed disturbance of emotions and conduct, the code changes to F43.25.',
            'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
          ],
          references,
        );
      }

      if (hasKeyword(normalized, ['mixed anxiety and depressed mood'])) {
        return payload(
          `${directLead}for adjustment disorder with mixed anxiety and depressed mood, the ICD-10-CM code is F43.23.`,
          [
            'If the documentation supports anxiety only, the code changes to F43.22. If it supports depressed mood only, the code changes to F43.21.',
            'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
          ],
          references,
        );
      }

      if (hasKeyword(normalized, ['with anxiety'])) {
        return payload(
          `${directLead}for adjustment disorder with anxiety, the ICD-10-CM code is F43.22.`,
          [
            'If the documentation supports mixed anxiety and depressed mood instead, the code changes to F43.23.',
            'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
          ],
          references,
        );
      }

      if (hasKeyword(normalized, ['with depressed mood'])) {
        return payload(
          `${directLead}for adjustment disorder with depressed mood, the ICD-10-CM code is F43.21.`,
          [
            'If the documentation supports mixed anxiety and depressed mood instead, the code changes to F43.23.',
            'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
          ],
          references,
        );
      }

      return payload(
        `${directLead}for adjustment disorder, the ICD-10-CM code depends on the documented subtype. Common examples are F43.20 for adjustment disorder, unspecified, F43.21 for adjustment disorder with depressed mood, F43.22 for adjustment disorder with anxiety, F43.23 for adjustment disorder with mixed anxiety and depressed mood, F43.24 for adjustment disorder with disturbance of conduct, and F43.25 for adjustment disorder with mixed disturbance of emotions and conduct.`,
        [
          'If the documentation supports a specific adjustment-disorder subtype, I can narrow it down further.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    return payload(
      `${directLead}the ICD-10-CM code for PTSD depends on the documented PTSD type. Common examples are F43.10 for post-traumatic stress disorder, unspecified, F43.11 for acute PTSD, and F43.12 for chronic PTSD.`,
      [
        'If you know whether the documentation supports acute, chronic, or unspecified PTSD, I can narrow it down.',
        'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
      ],
      references,
    );
  }

  if (hasKeyword(normalized, ['acute stress disorder', 'reactive attachment disorder', 'disinhibited social engagement disorder'])) {
    if (hasKeyword(normalized, ['acute stress disorder'])) {
      return payload(
        `${directLead}for acute stress disorder, the ICD-10-CM code is F43.0.`,
        [
          'If the documentation supports PTSD, adjustment disorder, or another trauma- and stressor-related disorder instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['reactive attachment disorder'])) {
      return payload(
        `${directLead}for reactive attachment disorder, the ICD-10-CM code is F94.1.`,
        [
          'If the documentation supports disinhibited social engagement disorder instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    return payload(
      `${directLead}for disinhibited social engagement disorder, the ICD-10-CM code is F94.2.`,
      [
        'If the documentation supports reactive attachment disorder instead, the code path changes.',
        'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
      ],
      references,
    );
  }

  if (hasKeyword(normalized, ['delirium', 'dementia', 'major neurocognitive disorder', 'mild neurocognitive disorder', 'neurocognitive disorder', 'amnestic disorder', 'vascular dementia'])) {
    if (hasKeyword(normalized, ['delirium'])) {
      return payload(
        `${directLead}for delirium due to a known physiological condition, the ICD-10-CM code is F05. If the documentation instead supports a substance-induced intoxication or withdrawal delirium, the coding path changes to the substance-specific disorder family.`,
        [
          'If you mean a substance-related delirium rather than delirium due to a known physiological condition, I can help narrow the code family.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['vascular dementia'])) {
      return payload(
        `${directLead}for vascular dementia, the ICD-10-CM code depends on severity and whether agitation, other behavioral disturbance, psychotic disturbance, mood disturbance, or anxiety are documented. Common legacy anchors include F01.50 for vascular dementia without behavioral disturbance and F01.51 for vascular dementia with behavioral disturbance, but current ICD-10-CM versions use more granular severity and disturbance coding.`,
        [
          'If you tell me the documented severity and whether agitation, psychosis, mood disturbance, or anxiety are present, I can narrow the current vascular-dementia coding path.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['mild neurocognitive disorder'])) {
      return payload(
        `${directLead}for mild neurocognitive disorder due to a known physiological condition, common ICD-10-CM anchors are F06.70 without behavioral disturbance and F06.71 with behavioral disturbance.`,
        [
          'If the documentation instead supports dementia or another neurocognitive diagnosis, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['amnestic disorder'])) {
      return payload(
        `${directLead}for amnestic disorder due to a known physiological condition, the ICD-10-CM code is F04.`,
        [
          'If the documentation supports a broader neurocognitive disorder rather than amnestic disorder, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    return payload(
      `${directLead}for dementia or major neurocognitive disorder, the ICD-10-CM code depends on the underlying condition, documented severity, and whether agitation, other behavioral disturbance, psychotic disturbance, mood disturbance, or anxiety are present. Common unspecified-dementia anchors in current ICD-10-CM include F03.A0 for mild unspecified dementia without disturbance, F03.B0 for moderate unspecified dementia without disturbance, and F03.C0 for severe unspecified dementia without disturbance.`,
      [
        'If you tell me the documented neurocognitive diagnosis, severity, and whether behavioral or psychotic features are present, I can narrow it down further.',
        'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
      ],
      references,
    );
  }

  if (
    hasKeyword(normalized, ['schizophrenia', 'schizoaffective', 'psychosis', 'brief psychotic'])
    && !hasKeyword(normalized, ['substance induced', 'substance-induced', 'medication induced', 'medication-induced', 'drug induced'])
  ) {
    if (hasKeyword(normalized, ['schizoaffective'])) {
      return payload(
        `${directLead}for schizoaffective disorder, the ICD-10-CM code depends on the documented schizoaffective subtype. Common examples are F25.0 for schizoaffective disorder, bipolar type, and F25.1 for schizoaffective disorder, depressive type.`,
        [
          'If the documentation supports another schizoaffective subtype, I can help narrow it further.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['brief psychotic'])) {
      return payload(
        `${directLead}for brief psychotic disorder, the ICD-10-CM code is F23.`,
        [
          'If you actually mean unspecified psychosis rather than brief psychotic disorder, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['psychosis']) && !hasKeyword(normalized, ['schizophrenia'])) {
      return payload(
        `${directLead}for unspecified psychosis not due to a substance or known physiological condition, the ICD-10-CM code is F29.`,
        [
          'If the documentation supports schizophrenia, schizoaffective disorder, or brief psychotic disorder, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    return payload(
      `${directLead}for schizophrenia-spectrum diagnoses, the ICD-10-CM code depends on the documented psychotic disorder. Common examples are F20.9 for schizophrenia, unspecified, F25.0 for schizoaffective disorder, bipolar type, F25.1 for schizoaffective disorder, depressive type, F23 for brief psychotic disorder, and F29 for unspecified psychosis not due to a substance or known physiological condition.`,
      [
        'If you tell me the documented psychotic diagnosis, I can narrow it down further.',
        'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
      ],
      references,
    );
  }

  if (hasKeyword(normalized, ['delusional disorder', 'schizophreniform', 'schizophreniform disorder'])) {
    if (hasKeyword(normalized, ['delusional disorder'])) {
      return payload(
        `${directLead}for delusional disorder, the ICD-10-CM code is F22.`,
        [
          'If the documentation supports a different psychotic disorder such as schizophrenia, schizophreniform disorder, or brief psychotic disorder, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    return payload(
      `${directLead}for schizophreniform disorder, the ICD-10-CM code is F20.81.`,
      [
        'If the documentation supports schizophrenia, schizoaffective disorder, or brief psychotic disorder instead, the code path changes.',
        'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
      ],
      references,
    );
  }

  if (hasKeyword(normalized, ['adhd', 'attention-deficit', 'attention deficit'])) {
    if (hasKeyword(normalized, ['inattentive'])) {
      return payload(
        `${directLead}for ADHD, predominantly inattentive type, the ICD-10-CM code is F90.0.`,
        [
          'If you mean combined type or unspecified ADHD, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['combined'])) {
      return payload(
        `${directLead}for ADHD, combined type, the ICD-10-CM code is F90.2.`,
        [
          'If you mean inattentive or unspecified ADHD, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    return payload(
      `${directLead}the ICD-10-CM code for ADHD depends on the documented ADHD type. Common examples are F90.9 for ADHD, unspecified type, F90.0 for predominantly inattentive type, and F90.2 for combined type.`,
      [
        'If you know the documented ADHD subtype, I can narrow it down further.',
        'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
      ],
      references,
    );
  }

  if (hasKeyword(normalized, ['autism', 'autism spectrum disorder', 'asd', 'asperger', 'intellectual disability', 'global developmental delay', 'tic disorder', 'tourette'])) {
    if (hasKeyword(normalized, ['autism', 'autism spectrum disorder', 'asd', 'asperger'])) {
      return payload(
        `${directLead}for autism spectrum disorder, the ICD-10-CM code is F84.0.`,
        [
          'If the documentation supports another neurodevelopmental disorder rather than autism spectrum disorder, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['intellectual disability'])) {
      return payload(
        `${directLead}for intellectual disability, the ICD-10-CM code depends on severity. Common examples are F70 for mild intellectual disabilities, F71 for moderate intellectual disabilities, F72 for severe intellectual disabilities, and F73 for profound intellectual disabilities.`,
        [
          'If you know the documented severity, I can narrow it down further.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['global developmental delay'])) {
      return payload(
        `${directLead}for global developmental delay, the ICD-10-CM code is F88.`,
        [
          'If the documentation supports another neurodevelopmental disorder instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['tourette'])) {
      return payload(
        `${directLead}for Tourette syndrome, the ICD-10-CM code is F95.2.`,
        [
          'If the documentation supports another tic disorder rather than Tourette syndrome, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    return payload(
      `${directLead}for tic disorders, the ICD-10-CM code depends on the documented tic disorder. Common examples are F95.2 for Tourette syndrome, F95.1 for chronic motor or vocal tic disorder, and F95.0 for transient tic disorder.`,
      [
        'If you tell me the documented tic disorder, I can narrow it down further.',
        'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
      ],
      references,
    );
  }

  if (hasKeyword(normalized, ['expressive language disorder', 'mixed receptive-expressive language disorder', 'social pragmatic communication disorder', 'developmental disorder of speech and language', 'specific reading disorder', 'mathematics disorder', 'disorder of written expression', 'learning disorder', 'language disorder', 'speech disorder'])) {
    if (hasKeyword(normalized, ['expressive language disorder'])) {
      return payload(
        `${directLead}for expressive language disorder, the ICD-10-CM code is F80.1.`,
        [
          'If the documentation supports another speech or language disorder instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['mixed receptive-expressive language disorder'])) {
      return payload(
        `${directLead}for mixed receptive-expressive language disorder, the ICD-10-CM code is F80.2.`,
        [
          'If the documentation supports another speech or language disorder instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['social pragmatic communication disorder'])) {
      return payload(
        `${directLead}for social pragmatic communication disorder, the ICD-10-CM code is F80.82.`,
        [
          'If the documentation supports autism spectrum disorder or another communication disorder instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['specific reading disorder', 'reading disorder'])) {
      return payload(
        `${directLead}for specific reading disorder, the ICD-10-CM code is F81.0.`,
        [
          'If the documentation supports another learning disorder instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['mathematics disorder'])) {
      return payload(
        `${directLead}for mathematics disorder, the ICD-10-CM code is F81.2.`,
        [
          'If the documentation supports another learning disorder instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['disorder of written expression', 'written expression disorder'])) {
      return payload(
        `${directLead}for disorder of written expression, the ICD-10-CM code is F81.81.`,
        [
          'If the documentation supports another learning disorder instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    return payload(
      `${directLead}for developmental speech, language, and learning disorders, the ICD-10-CM code depends on the documented disorder. Common anchors are F80.1 for expressive language disorder, F80.2 for mixed receptive-expressive language disorder, F80.82 for social pragmatic communication disorder, F81.0 for specific reading disorder, F81.2 for mathematics disorder, F81.81 for disorder of written expression, and F81.9 for developmental disorder of scholastic skills, unspecified.`,
      [
        'If you tell me the documented speech, language, or learning disorder, I can narrow it down further.',
        'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
      ],
      references,
    );
  }

  if (hasKeyword(normalized, ['oppositional defiant disorder', 'odd', 'conduct disorder', 'childhood-onset conduct disorder', 'adolescent-onset conduct disorder', 'selective mutism'])) {
    if (hasKeyword(normalized, ['oppositional defiant disorder', 'odd'])) {
      return payload(
        `${directLead}for oppositional defiant disorder, the ICD-10-CM code is F91.3.`,
        [
          'If the documentation supports conduct disorder rather than oppositional defiant disorder, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['childhood-onset conduct disorder', 'childhood onset conduct disorder'])) {
      return payload(
        `${directLead}for conduct disorder, childhood-onset type, the ICD-10-CM code is F91.1.`,
        [
          'If the documentation supports adolescent-onset or unspecified conduct disorder instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['adolescent-onset conduct disorder', 'adolescent onset conduct disorder'])) {
      return payload(
        `${directLead}for conduct disorder, adolescent-onset type, the ICD-10-CM code is F91.2.`,
        [
          'If the documentation supports childhood-onset or unspecified conduct disorder instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['selective mutism'])) {
      return payload(
        `${directLead}for selective mutism, the ICD-10-CM code is F94.0.`,
        [
          'If the documentation supports another childhood emotional or social-functioning disorder instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    return payload(
      `${directLead}for disruptive and childhood-onset behavioral disorders, the ICD-10-CM code depends on the documented disorder. Common anchors are F91.3 for oppositional defiant disorder, F91.1 for conduct disorder, childhood-onset type, F91.2 for conduct disorder, adolescent-onset type, F91.9 for conduct disorder, unspecified, and F94.0 for selective mutism.`,
      [
        'If you tell me the documented disruptive or childhood-onset disorder, I can narrow it down further.',
        'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
      ],
      references,
    );
  }

  if (hasKeyword(normalized, ['insomnia', 'hypersomnia', 'nightmare disorder', 'parasomnia', 'sleep terror', 'sleepwalking'])) {
    if (hasKeyword(normalized, ['hypersomnia'])) {
      return payload(
        `${directLead}for hypersomnia, the ICD-10-CM code commonly used is G47.10 for hypersomnia, unspecified.`,
        [
          'If the documentation supports a more specific sleep-wake disorder instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['nightmare disorder'])) {
      return payload(
        `${directLead}for nightmare disorder, the ICD-10-CM code is F51.5.`,
        [
          'If the documentation supports another parasomnia instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['sleep terror'])) {
      return payload(
        `${directLead}for sleep terror disorder, the ICD-10-CM code is F51.4.`,
        [
          'If the documentation supports another parasomnia instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['sleepwalking'])) {
      return payload(
        `${directLead}for sleepwalking disorder, the ICD-10-CM code is F51.3.`,
        [
          'If the documentation supports another parasomnia instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    return payload(
      `${directLead}the ICD-10-CM code for insomnia depends on the documented insomnia type. Common examples are G47.00 for insomnia, unspecified, F51.01 for primary insomnia, and F51.02 for adjustment insomnia.`,
      [
        'If you know whether the documentation supports unspecified insomnia, primary insomnia, or adjustment insomnia, I can narrow it down.',
        'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
      ],
      references,
    );
  }

  if (hasKeyword(normalized, ['dissociative identity disorder', 'dissociative amnesia', 'depersonalization', 'derealization', 'dissociative disorder'])) {
    if (hasKeyword(normalized, ['dissociative identity disorder'])) {
      return payload(
        `${directLead}for dissociative identity disorder, the ICD-10-CM code is F44.81.`,
        [
          'If the documentation supports another dissociative disorder instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['dissociative amnesia'])) {
      return payload(
        `${directLead}for dissociative amnesia, the ICD-10-CM code is F44.0.`,
        [
          'If the documentation supports another dissociative disorder instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['depersonalization', 'derealization'])) {
      return payload(
        `${directLead}for depersonalization-derealization disorder, the ICD-10-CM code is F48.1.`,
        [
          'If the documentation supports another dissociative disorder instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    return payload(
      `${directLead}for dissociative disorders, the ICD-10-CM code depends on the documented dissociative diagnosis. Common examples are F44.81 for dissociative identity disorder, F44.0 for dissociative amnesia, and F48.1 for depersonalization-derealization disorder.`,
      [
        'If you tell me the documented dissociative disorder, I can narrow it down further.',
        'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
      ],
      references,
    );
  }

  if (hasKeyword(normalized, ['somatic symptom disorder', 'illness anxiety disorder', 'conversion disorder', 'functional neurological symptom disorder', 'factitious disorder'])) {
    if (hasKeyword(normalized, ['somatic symptom disorder'])) {
      return payload(
        `${directLead}for somatic symptom disorder, the ICD-10-CM code is F45.1.`,
        [
          'If the documentation supports illness anxiety disorder, conversion disorder, or another somatic-symptom-related condition instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['illness anxiety disorder'])) {
      return payload(
        `${directLead}for illness anxiety disorder, the ICD-10-CM code is F45.21.`,
        [
          'If the documentation supports somatic symptom disorder or another related disorder instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['conversion disorder', 'functional neurological symptom disorder'])) {
      return payload(
        `${directLead}for conversion disorder, also called functional neurological symptom disorder, the ICD-10-CM code commonly used is F44.4.`,
        [
          'If the documentation supports a more specific functional neurological presentation, the exact coding path may need narrowing.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    return payload(
      `${directLead}for factitious disorder, the ICD-10-CM code depends on the documented factitious presentation. Common examples include F68.10 for factitious disorder, unspecified, and F68.A for factitious disorder imposed on self.`,
      [
        'If you tell me the documented somatic-symptom or factitious subtype, I can narrow it down further.',
        'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
      ],
      references,
    );
  }

  if (hasKeyword(normalized, ['enuresis', 'encopresis', 'elimination disorder'])) {
    if (hasKeyword(normalized, ['enuresis'])) {
      return payload(
        `${directLead}for enuresis not due to a substance or known physiological condition, the ICD-10-CM code is F98.0.`,
        [
          'If the documentation supports a medical or substance-related cause instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['encopresis'])) {
      return payload(
        `${directLead}for encopresis not due to a substance or known physiological condition, the ICD-10-CM code is F98.1.`,
        [
          'If the documentation supports a medical or substance-related cause instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    return payload(
      `${directLead}for elimination disorders, common ICD-10-CM codes are F98.0 for enuresis and F98.1 for encopresis when not due to a substance or known physiological condition.`,
      [
        'If you tell me which elimination disorder is documented, I can narrow it down.',
        'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
      ],
      references,
    );
  }

  if (hasKeyword(normalized, ['gender dysphoria', 'gender identity disorder', 'transsexualism', 'gender dysphoria in childhood', 'gender dysphoria in adolescent', 'gender dysphoria in adult', 'dual role transvestism'])) {
    if (hasKeyword(normalized, ['transsexualism'])) {
      return payload(
        `${directLead}in ICD-10-CM, the code for transsexualism is F64.0.`,
        [
          'ICD-10-CM terminology may use older labels than current clinician language, so verify the exact diagnostic terminology you are coding from.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['dual role transvestism'])) {
      return payload(
        `${directLead}in ICD-10-CM, the code for dual role transvestism is F64.1.`,
        [
          'ICD-10-CM terminology may use older labels than current clinician language, so verify the exact diagnostic terminology you are coding from.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['childhood'])) {
      return payload(
        `${directLead}in ICD-10-CM, the code for gender identity disorder of childhood is F64.2.`,
        [
          'ICD-10-CM terminology may use older labels than current clinician language, so verify the exact diagnostic terminology you are coding from.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    return payload(
      `${directLead}for gender-dysphoria-related coding, ICD-10-CM terminology may use older labels than current clinician language. Common ICD-10-CM anchors are F64.0 for transsexualism, F64.2 for gender identity disorder of childhood, F64.8 for other gender identity disorders, and F64.9 for gender identity disorder, unspecified.`,
      [
        'If you tell me the exact documented diagnosis wording you need to map, I can help narrow the ICD-10-CM path while keeping the terminology caveat visible.',
        'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
      ],
      references,
    );
  }

  if (hasKeyword(normalized, ['sexual dysfunction', 'hypoactive sexual desire', 'erectile disorder', 'female sexual arousal disorder', 'female orgasmic disorder', 'male orgasmic disorder', 'premature ejaculation', 'sexual aversion', 'dyspareunia'])) {
    if (hasKeyword(normalized, ['hypoactive sexual desire'])) {
      return payload(
        `${directLead}for hypoactive sexual desire disorder, the ICD-10-CM code is F52.0.`,
        [
          'If the documentation supports another sexual dysfunction diagnosis instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['erectile disorder'])) {
      return payload(
        `${directLead}for male erectile disorder, the ICD-10-CM code is F52.21.`,
        [
          'If the documentation supports another sexual dysfunction diagnosis instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['female sexual arousal disorder'])) {
      return payload(
        `${directLead}for female sexual arousal disorder, the ICD-10-CM code is F52.22.`,
        [
          'If the documentation supports another sexual dysfunction diagnosis instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['female orgasmic disorder'])) {
      return payload(
        `${directLead}for female orgasmic disorder, the ICD-10-CM code is F52.31.`,
        [
          'If the documentation supports another sexual dysfunction diagnosis instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['male orgasmic disorder'])) {
      return payload(
        `${directLead}for male orgasmic disorder, the ICD-10-CM code is F52.32.`,
        [
          'If the documentation supports another sexual dysfunction diagnosis instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['premature ejaculation'])) {
      return payload(
        `${directLead}for premature ejaculation, the ICD-10-CM code is F52.4.`,
        [
          'If the documentation supports another sexual dysfunction diagnosis instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['sexual aversion'])) {
      return payload(
        `${directLead}for sexual aversion disorder, the ICD-10-CM code is F52.1.`,
        [
          'If the documentation supports another sexual dysfunction diagnosis instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['dyspareunia'])) {
      return payload(
        `${directLead}for dyspareunia not due to a substance or known physiological condition, the ICD-10-CM code is F52.6.`,
        [
          'If the documentation supports another sexual dysfunction diagnosis instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    return payload(
      `${directLead}for sexual dysfunction diagnoses not due to a substance or known physiological condition, the ICD-10-CM code depends on the documented sexual dysfunction. Common anchors are F52.0 for hypoactive sexual desire disorder, F52.21 for male erectile disorder, F52.22 for female sexual arousal disorder, F52.31 for female orgasmic disorder, F52.32 for male orgasmic disorder, F52.4 for premature ejaculation, F52.6 for dyspareunia, and F52.9 for unspecified sexual dysfunction.`,
      [
        'If you tell me the documented sexual dysfunction diagnosis, I can narrow it down further.',
        'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
      ],
      references,
    );
  }

  if (hasKeyword(normalized, ['paraphilia', 'fetishism', 'transvestic fetishism', 'exhibitionism', 'voyeurism', 'pedophilia', 'sexual masochism', 'sexual sadism', 'frotteurism'])) {
    if (hasKeyword(normalized, ['fetishism'])) {
      return payload(
        `${directLead}for fetishism, the ICD-10-CM code is F65.0.`,
        [
          'If the documentation supports another paraphilic disorder instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['transvestic fetishism'])) {
      return payload(
        `${directLead}for transvestic fetishism, the ICD-10-CM code is F65.1.`,
        [
          'If the documentation supports another paraphilic disorder instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['exhibitionism'])) {
      return payload(
        `${directLead}for exhibitionism, the ICD-10-CM code is F65.2.`,
        [
          'If the documentation supports another paraphilic disorder instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['voyeurism'])) {
      return payload(
        `${directLead}for voyeurism, the ICD-10-CM code is F65.3.`,
        [
          'If the documentation supports another paraphilic disorder instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['pedophilia'])) {
      return payload(
        `${directLead}for pedophilia, the ICD-10-CM code is F65.4.`,
        [
          'If the documentation supports another paraphilic disorder instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['sexual masochism'])) {
      return payload(
        `${directLead}for sexual masochism, the ICD-10-CM code is F65.51.`,
        [
          'If the documentation supports another paraphilic disorder instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['sexual sadism'])) {
      return payload(
        `${directLead}for sexual sadism, the ICD-10-CM code is F65.52.`,
        [
          'If the documentation supports another paraphilic disorder instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['frotteurism'])) {
      return payload(
        `${directLead}for frotteurism, the ICD-10-CM code is F65.81.`,
        [
          'If the documentation supports another paraphilic disorder instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    return payload(
      `${directLead}for paraphilic disorders, the ICD-10-CM code depends on the documented diagnosis. Common anchors are F65.0 for fetishism, F65.1 for transvestic fetishism, F65.2 for exhibitionism, F65.3 for voyeurism, F65.4 for pedophilia, F65.51 for sexual masochism, F65.52 for sexual sadism, F65.81 for frotteurism, and F65.9 for paraphilia, unspecified.`,
      [
        'If you tell me the documented paraphilic diagnosis, I can narrow it down further.',
        'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
      ],
      references,
    );
  }

  if (hasKeyword(normalized, ['intermittent explosive disorder', 'pathological gambling', 'gambling disorder', 'kleptomania', 'pyromania', 'trichotillomania', 'impulse disorder'])) {
    if (hasKeyword(normalized, ['intermittent explosive disorder'])) {
      return payload(
        `${directLead}for intermittent explosive disorder, the ICD-10-CM code is F63.81.`,
        [
          'If the documentation supports another impulse-control disorder instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['pathological gambling', 'gambling disorder'])) {
      return payload(
        `${directLead}for pathological gambling, the ICD-10-CM code is F63.0.`,
        [
          'If the documentation supports another impulse-control disorder instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['kleptomania'])) {
      return payload(
        `${directLead}for kleptomania, the ICD-10-CM code is F63.2.`,
        [
          'If the documentation supports another impulse-control disorder instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['pyromania'])) {
      return payload(
        `${directLead}for pyromania, the ICD-10-CM code is F63.1.`,
        [
          'If the documentation supports another impulse-control disorder instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['trichotillomania'])) {
      return payload(
        `${directLead}for trichotillomania, the ICD-10-CM code is F63.3.`,
        [
          'If the documentation supports another obsessive-compulsive-related or impulse-control disorder instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    return payload(
      `${directLead}for impulse-control disorders, the ICD-10-CM code depends on the documented disorder. Common anchors are F63.81 for intermittent explosive disorder, F63.0 for pathological gambling, F63.2 for kleptomania, F63.1 for pyromania, F63.3 for trichotillomania, and F63.9 for impulse disorder, unspecified.`,
      [
        'If you tell me the documented impulse-control disorder, I can narrow it down further.',
        'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
      ],
      references,
    );
  }

  if (hasKeyword(normalized, ['anorexia', 'bulimia', 'binge eating disorder', 'eating disorder', 'avoidant restrictive food intake disorder', 'arfid'])) {
    if (hasKeyword(normalized, ['anorexia'])) {
      return payload(
        `${directLead}for anorexia nervosa, the ICD-10-CM code depends on the documented subtype. Common examples are F50.00 for anorexia nervosa, unspecified, F50.01 for anorexia nervosa, restricting type, and F50.02 for anorexia nervosa, binge eating/purging type.`,
        [
          'If you know the documented anorexia subtype, I can narrow it down further.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['bulimia'])) {
      return payload(
        `${directLead}for bulimia nervosa, the ICD-10-CM code is F50.2.`,
        [
          'If the documentation supports another eating-disorder subtype rather than bulimia nervosa, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['binge eating disorder'])) {
      return payload(
        `${directLead}for binge eating disorder, the ICD-10-CM code is F50.81.`,
        [
          'If the documentation supports bulimia nervosa, anorexia nervosa, or another feeding or eating disorder instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['avoidant restrictive food intake disorder', 'arfid'])) {
      return payload(
        `${directLead}for avoidant/restrictive food intake disorder, the ICD-10-CM code is F50.82.`,
        [
          'If the documentation supports another feeding or eating disorder instead, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    return payload(
      `${directLead}for feeding and eating disorders, the ICD-10-CM code depends on the documented disorder and subtype. Common examples are F50.00 for anorexia nervosa, unspecified, F50.2 for bulimia nervosa, F50.81 for binge eating disorder, F50.82 for avoidant/restrictive food intake disorder, and F50.9 for feeding or eating disorder, unspecified.`,
      [
        'If you tell me the documented eating-disorder diagnosis and subtype, I can narrow it down further.',
        'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
      ],
      references,
    );
  }

  if (hasKeyword(normalized, ['borderline personality', 'antisocial personality', 'narcissistic personality', 'avoidant personality', 'dependent personality', 'obsessive-compulsive personality', 'ocpd', 'paranoid personality', 'schizoid personality', 'histrionic personality', 'personality disorder'])) {
    if (hasKeyword(normalized, ['borderline'])) {
      return payload(
        `${directLead}for borderline personality disorder, the ICD-10-CM code is F60.3.`,
        [
          'If you actually mean another personality-disorder subtype, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['antisocial'])) {
      return payload(
        `${directLead}for antisocial personality disorder, the ICD-10-CM code is F60.2.`,
        [
          'If you actually mean another personality-disorder subtype, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['narcissistic'])) {
      return payload(
        `${directLead}for narcissistic personality disorder, the ICD-10-CM code is F60.81.`,
        [
          'If you actually mean another personality-disorder subtype, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['avoidant'])) {
      return payload(
        `${directLead}for avoidant personality disorder, the ICD-10-CM code is F60.6.`,
        [
          'If you actually mean another personality-disorder subtype, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['dependent personality'])) {
      return payload(
        `${directLead}for dependent personality disorder, the ICD-10-CM code is F60.7.`,
        [
          'If you actually mean another personality-disorder subtype, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['obsessive-compulsive personality', 'obsessive compulsive personality', 'ocpd'])) {
      return payload(
        `${directLead}for obsessive-compulsive personality disorder, the ICD-10-CM code is F60.5.`,
        [
          'If you actually mean OCD rather than obsessive-compulsive personality disorder, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['paranoid personality'])) {
      return payload(
        `${directLead}for paranoid personality disorder, the ICD-10-CM code is F60.0.`,
        [
          'If you actually mean another personality-disorder subtype, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['schizoid personality'])) {
      return payload(
        `${directLead}for schizoid personality disorder, the ICD-10-CM code is F60.1.`,
        [
          'If you actually mean another personality-disorder subtype, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['histrionic personality'])) {
      return payload(
        `${directLead}for histrionic personality disorder, the ICD-10-CM code is F60.4.`,
        [
          'If you actually mean another personality-disorder subtype, the code path changes.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    return payload(
      `${directLead}for personality disorders, the ICD-10-CM code depends on the documented subtype. Common examples are F60.3 for borderline personality disorder, F60.2 for antisocial personality disorder, F60.81 for narcissistic personality disorder, F60.6 for avoidant personality disorder, F60.7 for dependent personality disorder, F60.5 for obsessive-compulsive personality disorder, and F60.9 for personality disorder, unspecified.`,
      [
        'If you tell me the documented personality-disorder subtype, I can narrow it down further.',
        'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
      ],
      references,
    );
  }

  if (hasKeyword(normalized, ['alcohol use disorder', 'alcohol dependence', 'alcohol abuse', 'opioid use disorder', 'opioid dependence', 'opioid abuse', 'cannabis use disorder', 'cannabis dependence', 'cannabis abuse', 'stimulant use disorder', 'stimulant dependence', 'stimulant abuse', 'methamphetamine use disorder', 'amphetamine use disorder', 'cocaine use disorder', 'cocaine dependence', 'cocaine abuse', 'sedative use disorder', 'sedative hypnotic use disorder', 'sedative dependence', 'sedative abuse', 'benzodiazepine use disorder', 'substance use disorder'])) {
    if (hasKeyword(normalized, ['alcohol use disorder', 'alcohol dependence', 'alcohol abuse'])) {
      if (hasKeyword(normalized, ['in remission', 'remission'])) {
        return payload(
          `${directLead}for alcohol dependence in remission, the ICD-10-CM code is F10.21. If the documentation instead supports alcohol abuse in remission, the code is F10.11.`,
          [
            'If you need alcohol withdrawal, intoxication, or substance-induced complication coding instead, I can narrow that down too.',
            'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
          ],
          references,
        );
      }

      if (hasKeyword(normalized, ['withdrawal delirium'])) {
        return payload(
          `${directLead}for alcohol dependence with withdrawal delirium, the ICD-10-CM code is F10.231. If the documentation instead supports alcohol abuse with withdrawal delirium, the code is F10.131.`,
          [
            'If you need alcohol withdrawal without delirium or with perceptual disturbance, I can narrow that down too.',
            'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
          ],
          references,
        );
      }

      if (hasKeyword(normalized, ['withdrawal'])) {
        return payload(
          `${directLead}for alcohol dependence with withdrawal, uncomplicated, the ICD-10-CM code is F10.230. If the documentation instead supports alcohol abuse with withdrawal, uncomplicated, the code is F10.130.`,
          [
            'If withdrawal delirium or perceptual disturbance is documented, the code path changes.',
            'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
          ],
          references,
        );
      }

      return payload(
        `${directLead}for alcohol use disorder, the ICD-10-CM code depends on whether the documentation supports unspecified use, abuse, or dependence and whether there are intoxication, withdrawal, remission, or substance-induced complications. Common anchors are F10.90 for alcohol use, unspecified, uncomplicated and F10.20 for alcohol dependence, uncomplicated.`,
        [
          'If you tell me whether the documentation supports unspecified use versus dependence and whether withdrawal, remission, or complications are documented, I can narrow it down further.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['opioid use disorder', 'opioid dependence', 'opioid abuse'])) {
      if (hasKeyword(normalized, ['withdrawal'])) {
        return payload(
          `${directLead}for opioid dependence with withdrawal, the ICD-10-CM code is F11.23.`,
          [
            'If the documentation supports opioid use unspecified, abuse, remission, or another opioid-induced condition instead, the code path changes.',
            'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
          ],
          references,
        );
      }

      return payload(
        `${directLead}for opioid use disorder, the ICD-10-CM code depends on whether the documentation supports unspecified use, abuse, or dependence and whether intoxication, withdrawal, remission, or substance-induced complications are documented. Common anchors are F11.90 for opioid use, unspecified, uncomplicated and F11.20 for opioid dependence, uncomplicated.`,
        [
          'If you tell me whether the documentation supports unspecified use versus dependence and whether withdrawal, remission, or complications are documented, I can narrow it down further.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['cannabis use disorder', 'cannabis dependence', 'cannabis abuse'])) {
      if (hasKeyword(normalized, ['in remission', 'remission'])) {
        return payload(
          `${directLead}for cannabis dependence in remission, the ICD-10-CM code is F12.21. If the documentation instead supports cannabis abuse in remission, the code is F12.11.`,
          [
            'If you need cannabis withdrawal or another cannabis-induced condition instead, I can narrow that down too.',
            'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
          ],
          references,
        );
      }

      if (hasKeyword(normalized, ['withdrawal'])) {
        return payload(
          `${directLead}for cannabis use, unspecified, with withdrawal, the ICD-10-CM code is F12.93.`,
          [
            'If the documentation instead supports cannabis abuse or dependence with withdrawal or remission, the code path changes.',
            'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
          ],
          references,
        );
      }

      return payload(
        `${directLead}for cannabis use disorder, the ICD-10-CM code depends on whether the documentation supports unspecified use, abuse, or dependence and whether intoxication, remission, or substance-induced complications are documented. Common anchors are F12.90 for cannabis use, unspecified, uncomplicated and F12.20 for cannabis dependence, uncomplicated.`,
        [
          'If you tell me whether the documentation supports unspecified use versus dependence and whether complications or remission are documented, I can narrow it down further.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['stimulant use disorder', 'stimulant dependence', 'stimulant abuse'])) {
      if (hasKeyword(normalized, ['withdrawal'])) {
        return payload(
          `${directLead}for other stimulant use, unspecified, with withdrawal, the ICD-10-CM code is F15.93.`,
          [
            'If the documentation instead supports abuse, dependence, remission, or another stimulant-induced condition, the code path changes.',
            'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
          ],
          references,
        );
      }

      return payload(
        `${directLead}for stimulant use disorder, the ICD-10-CM code depends on the specific stimulant and whether the documentation supports unspecified use, abuse, or dependence with any intoxication, withdrawal, remission, or substance-induced complications. A common anchor for other stimulant use, unspecified, uncomplicated is F15.90.`,
        [
          'If you tell me the specific stimulant and whether the documentation supports use versus dependence, I can narrow it down further.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['methamphetamine use disorder', 'amphetamine use disorder', 'methamphetamine dependence', 'amphetamine dependence'])) {
      return payload(
        `${directLead}for amphetamine-type stimulant use disorder, the ICD-10-CM code depends on whether the documentation supports unspecified use, abuse, or dependence and whether intoxication, withdrawal, remission, or substance-induced complications are documented. Common anchors are F15.10 for other stimulant abuse, uncomplicated and F15.20 for other stimulant dependence, uncomplicated.`,
        [
          'If you tell me whether the documentation supports abuse versus dependence and whether there are intoxication, withdrawal, remission, or complications, I can narrow it down further.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['cocaine use disorder', 'cocaine dependence', 'cocaine abuse'])) {
      return payload(
        `${directLead}for cocaine use disorder, the ICD-10-CM code depends on whether the documentation supports unspecified use, abuse, or dependence and whether intoxication, withdrawal, remission, or complications are documented. Common anchors are F14.10 for cocaine abuse, uncomplicated and F14.20 for cocaine dependence, uncomplicated.`,
        [
          'If you tell me whether the documentation supports abuse versus dependence and whether there are intoxication, withdrawal, remission, or complications, I can narrow it down further.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    if (hasKeyword(normalized, ['sedative use disorder', 'sedative hypnotic use disorder', 'benzodiazepine use disorder', 'sedative dependence', 'benzodiazepine dependence'])) {
      return payload(
        `${directLead}for sedative, hypnotic, or anxiolytic use disorder, the ICD-10-CM code depends on whether the documentation supports unspecified use, abuse, or dependence and whether intoxication, withdrawal, remission, or complications are documented. Common anchors are F13.10 for sedative, hypnotic, or anxiolytic abuse, uncomplicated and F13.20 for sedative, hypnotic, or anxiolytic dependence, uncomplicated.`,
        [
          'If you tell me whether the documentation supports abuse versus dependence and whether there are intoxication, withdrawal, remission, or complications, I can narrow it down further.',
          'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
        ],
        references,
      );
    }

    return payload(
      `${directLead}for substance use disorders, the ICD-10-CM code depends on the specific substance and whether the documentation supports unspecified use, abuse, or dependence, along with remission, withdrawal, intoxication, or substance-induced complications.`,
      [
        'Tell me the specific substance and whether the documentation supports use, abuse, or dependence, and I can narrow it down.',
        'Use the current ICD-10-CM browser or coding reference to verify the final code against your note.',
      ],
      references,
    );
  }

  const structuredCatalogHelp = buildStructuredPsychDiagnosisCatalogHelp(normalized, directLead);
  if (structuredCatalogHelp) {
    return structuredCatalogHelp;
  }

  return null;
}
