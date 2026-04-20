import type { GeneratedSpec } from "./build";

export function validateGeneratedSpec(spec: GeneratedSpec): string[] {
  const errors: string[] = [];

  if (!spec.name?.trim()) errors.push("Missing subagent name");
  if (!spec.purpose?.trim()) errors.push("Missing subagent purpose");
  if (!spec.definitionOfDone?.length) errors.push("Missing definition of done");
  if (!spec.escalationTriggers?.length) errors.push("Missing escalation triggers");
  if (!spec.filesNeverEdit?.length) errors.push("Missing protected file list");

  return errors;
}
