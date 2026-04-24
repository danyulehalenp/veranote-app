import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

function loadEnvFile(path) {
  const content = fs.readFileSync(path, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    if (!line || /^\s*#/.test(line)) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  loadEnvFile(new URL('../.env.local', import.meta.url));
}

const hasClient = Boolean(
  process.env.SUPABASE_URL?.trim()
  && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  && createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }),
);

console.log(JSON.stringify({ hasClient }));
