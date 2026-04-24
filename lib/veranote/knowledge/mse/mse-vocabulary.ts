export type MseDomainKey =
  | 'appearance'
  | 'behavior'
  | 'speech'
  | 'mood'
  | 'affect'
  | 'thought_process'
  | 'thought_content'
  | 'perception'
  | 'cognition'
  | 'insight'
  | 'judgment';

export type MseDomainVocabulary = {
  key: MseDomainKey;
  label: string;
  normalDescriptors: string[];
  abnormalDescriptors: string[];
  cautionRules: string[];
  unsupportedNormalWarning: string;
};

export const MSE_VOCABULARY: Record<MseDomainKey, MseDomainVocabulary> = {
  appearance: {
    key: 'appearance',
    label: 'Appearance',
    normalDescriptors: ['well-groomed', 'appropriate hygiene', 'appears stated age', 'clean attire'],
    abnormalDescriptors: ['disheveled', 'unkempt', 'malodorous', 'bizarre dress', 'poor hygiene'],
    cautionRules: ['Do not assume grooming, hygiene, or dress if not described.', 'Avoid adding appears stated age unless source says it.'],
    unsupportedNormalWarning: 'Appearance is not described; do not add normal grooming or hygiene findings.',
  },
  behavior: {
    key: 'behavior',
    label: 'Behavior',
    normalDescriptors: ['calm', 'cooperative', 'engaged', 'appropriate eye contact'],
    abnormalDescriptors: ['agitated', 'restless', 'guarded', 'withdrawn', 'pacing', 'combative', 'tearful'],
    cautionRules: ['Calm or cooperative does not imply euthymic mood.', 'Do not convert agitation into violence intent unless source supports it.'],
    unsupportedNormalWarning: 'Behavior is incompletely described; do not auto-complete calm or cooperative behavior.',
  },
  speech: {
    key: 'speech',
    label: 'Speech',
    normalDescriptors: ['normal rate', 'normal volume', 'clear speech'],
    abnormalDescriptors: ['pressured', 'rapid', 'slow', 'soft', 'loud', 'mute', 'nonverbal'],
    cautionRules: ['Do not assume normal rate, volume, or articulation without observation.', 'Speech abnormality does not settle thought process by itself.'],
    unsupportedNormalWarning: 'Speech is not described; do not add normal rate, tone, or volume.',
  },
  mood: {
    key: 'mood',
    label: 'Mood',
    normalDescriptors: ['euthymic', 'okay', 'stable mood'],
    abnormalDescriptors: ['depressed', 'anxious', 'irritable', 'sad', 'angry', 'overwhelmed'],
    cautionRules: ['Mood should stay patient-reported when possible.', 'Do not infer mood from behavior alone.'],
    unsupportedNormalWarning: 'Mood is not directly described; do not infer euthymic or stable mood.',
  },
  affect: {
    key: 'affect',
    label: 'Affect',
    normalDescriptors: ['full affect', 'appropriate affect', 'reactive affect', 'congruent affect'],
    abnormalDescriptors: ['flat', 'blunted', 'restricted', 'labile', 'incongruent'],
    cautionRules: ['Do not assume affect from a reported mood statement.', 'Avoid normal affect language when only mood is documented.'],
    unsupportedNormalWarning: 'Affect is not described; do not add full, reactive, or appropriate affect.',
  },
  thought_process: {
    key: 'thought_process',
    label: 'Thought process',
    normalDescriptors: ['linear', 'goal directed', 'organized'],
    abnormalDescriptors: ['tangential', 'circumstantial', 'flight of ideas', 'loose associations', 'disorganized'],
    cautionRules: ['Speech style and thought process should not be silently merged.', 'Do not infer linearity if source only says calm or cooperative.'],
    unsupportedNormalWarning: 'Thought process is not described; do not add linear or goal-directed thinking.',
  },
  thought_content: {
    key: 'thought_content',
    label: 'Thought content',
    normalDescriptors: ['no delusions', 'no suicidal ideation', 'no homicidal ideation'],
    abnormalDescriptors: ['paranoid', 'delusional', 'hopeless', 'suicidal ideation', 'homicidal ideation', 'violent thoughts'],
    cautionRules: ['Absence of risk must be explicitly documented.', 'Do not infer denial of SI/HI from missing risk language.'],
    unsupportedNormalWarning: 'Thought content is incompletely described; do not add no delusions or denial of SI/HI.',
  },
  perception: {
    key: 'perception',
    label: 'Perception',
    normalDescriptors: ['no hallucinations', 'denies AH/VH'],
    abnormalDescriptors: ['auditory hallucinations', 'visual hallucinations', 'responding to internal stimuli', 'internally preoccupied'],
    cautionRules: ['Observed internal preoccupation and patient denial should be kept side by side if both are present.', 'Do not infer absence of hallucinations without explicit support.'],
    unsupportedNormalWarning: 'Perception is not fully described; do not add denial of hallucinations or AH/VH.',
  },
  cognition: {
    key: 'cognition',
    label: 'Cognition',
    normalDescriptors: ['alert and oriented', 'intact memory', 'intact attention'],
    abnormalDescriptors: ['disoriented', 'confused', 'poor concentration', 'memory impairment'],
    cautionRules: ['Do not assume orientation, attention, or memory if not documented.', 'Objective confusion and narrative coherence can coexist; preserve both.'],
    unsupportedNormalWarning: 'Cognition is not described; do not add alert and oriented or intact memory.',
  },
  insight: {
    key: 'insight',
    label: 'Insight',
    normalDescriptors: ['good insight', 'fair insight'],
    abnormalDescriptors: ['poor insight', 'limited insight', 'lacks insight'],
    cautionRules: ['Do not infer insight from agreement with treatment alone.', 'Keep source wording conservative if insight is only partially described.'],
    unsupportedNormalWarning: 'Insight is not described; do not add good or fair insight.',
  },
  judgment: {
    key: 'judgment',
    label: 'Judgment',
    normalDescriptors: ['good judgment', 'fair judgment'],
    abnormalDescriptors: ['poor judgment', 'impaired judgment'],
    cautionRules: ['Do not infer judgment from cooperation alone.', 'Avoid normal judgment wording unless source explicitly supports it.'],
    unsupportedNormalWarning: 'Judgment is not described; do not add good or fair judgment.',
  },
};

export const ALL_MSE_DOMAINS = Object.keys(MSE_VOCABULARY) as MseDomainKey[];
