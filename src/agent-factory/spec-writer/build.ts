export interface RawAgentIdea {
  name: string;
  purpose: string;
  inputs?: string[];
  outputs?: string[];
  constraints?: string[];
}

export interface GeneratedSpec {
  name: string;
  purpose: string;
  inputs: string[];
  outputs: string[];
  toolsAllowed: string[];
  filesAllowedToEdit: string[];
  filesNeverEdit: string[];
  escalationTriggers: string[];
  definitionOfDone: string[];
}

export function generateSubagentSpec(idea: RawAgentIdea): GeneratedSpec {
  return {
    name: idea.name,
    purpose: idea.purpose,
    inputs: idea.inputs ?? [],
    outputs: idea.outputs ?? [],
    toolsAllowed: ["local_files", "validation_only"],
    filesAllowedToEdit: ["src/agent-factory/**", "components/agent-factory/**"],
    filesNeverEdit: [".env*", "package-lock.json", "pnpm-lock.yaml", "openclaw.json"],
    escalationTriggers: [
      "Touches runtime core",
      "Touches credentials or secrets",
      "Needs cross-system config change",
      "Requires destructive file edits"
    ],
    definitionOfDone: [
      "Spec is structurally complete",
      "Subagent is visible in dashboard registry",
      "Approval path is defined",
      "Validation checklist exists"
    ]
  };
}
