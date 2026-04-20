import { promises as fs } from 'fs';
import path from 'path';

export async function loadPromptFile(filename: string) {
  const filePath = path.join(process.cwd(), 'prompts', filename);
  return fs.readFile(filePath, 'utf8');
}
