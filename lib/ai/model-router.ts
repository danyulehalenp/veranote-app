export function selectModel(task: string) {
  switch (task) {
    case 'assistant':
      return 'google/gemini-2.5-flash-lite';
    case 'note':
      return process.env.OPENAI_MODEL || 'gpt-4.1-mini';
    case 'rewrite':
      return process.env.OPENAI_MODEL || 'gpt-4.1-mini';
    default:
      return process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  }
}
