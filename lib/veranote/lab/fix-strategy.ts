import type { VeraLabAssignedLayer, VeraLabSuggestedFixStrategy } from '@/lib/veranote/lab/types';

const STRATEGIES: Record<VeraLabAssignedLayer, VeraLabSuggestedFixStrategy> = {
  routing: {
    layer: 'routing',
    why_this_layer: 'The failure pattern suggests Vera entered the wrong lane or defaulted to a utility/fallback path instead of staying in the intended clinical path.',
    recommended_change: 'Tighten task detection, route guards, or mode selection so the prompt consistently enters the intended answer lane.',
    do_not_change: 'Do not widen downstream wording or knowledge logic first if the prompt is reaching the wrong lane entirely.',
    validation_approach: 'Retest the original failure, nearby paraphrases, mixed-boundary prompts, and previously passing prompts that share the same surface wording.',
  },
  'answer-mode': {
    layer: 'answer-mode',
    why_this_layer: 'The route is likely close to correct, but the returned answer shape does not match the expected provider-facing mode.',
    recommended_change: 'Adjust answer-mode selection or output shaping so the same routed prompt returns the correct response type.',
    do_not_change: 'Do not rewrite knowledge content broadly if the main failure is the wrong answer form rather than wrong facts.',
    validation_approach: 'Validate answer-mode on the original failed prompt, follow-up turns, and neighboring prompts with similar intent but different wording.',
  },
  'knowledge-layer': {
    layer: 'knowledge-layer',
    why_this_layer: 'The failure implies missing, weak, or misapplied clinical reasoning or source-bounded knowledge once the request reached the correct lane.',
    recommended_change: 'Strengthen the relevant knowledge rules, concept coverage, or source-support guardrails for this clinical domain.',
    do_not_change: 'Do not loosen safety refusals or route guards just to make the answer sound more complete.',
    validation_approach: 'Retest the failed prompt plus adjacent prompts in the same domain, especially ones that differentiate source-supported versus unsupported conclusions.',
  },
  wording: {
    layer: 'wording',
    why_this_layer: 'The lane and knowledge appear roughly correct, but the phrasing is not provider-usable enough, too generic, or too machine-like.',
    recommended_change: 'Refine output phrasing, note-usable sentence shape, and section wording while preserving the same safety and source constraints.',
    do_not_change: 'Do not change route selection or knowledge rules unless there is independent evidence they are wrong.',
    validation_approach: 'Compare the revised wording across the failed prompt, nearby same-subtype prompts, and previously passing prompts for tone consistency.',
  },
  'ui-workflow': {
    layer: 'ui-workflow',
    why_this_layer: 'The underlying answer may be acceptable, but the way it is surfaced or acted on is creating workflow confusion or hiding the recommendation.',
    recommended_change: 'Improve labeling, action affordances, grouping, or visibility so the provider can use the answer without extra interpretation.',
    do_not_change: 'Do not change model behavior or clinical reasoning if the primary issue is how the result is presented or applied.',
    validation_approach: 'Check the same failure in the UI flow, verify the important action is visible, and confirm the recommended state is obvious during triage.',
  },
};

export function getSuggestedFixStrategy(layer: VeraLabAssignedLayer) {
  return STRATEGIES[layer];
}
