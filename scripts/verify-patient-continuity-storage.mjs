#!/usr/bin/env node

/**
 * Verifies whether the remote Supabase patient-continuity table is reachable
 * through the server-only service-role path. This script never prints secrets.
 */

import fs from 'node:fs';
import path from 'node:path';

function readEnvFile() {
  const envPath = path.resolve('.env.local');
  if (!fs.existsSync(envPath)) {
    return '';
  }

  return fs.readFileSync(envPath, 'utf8');
}

const envText = readEnvFile();

function env(name) {
  if (process.env[name]) {
    return process.env[name];
  }

  const match = envText.match(new RegExp(`^${name}\\s*=\\s*(.*)$`, 'm'));
  return (match?.[1] || '').trim().replace(/^['"]|['"]$/g, '');
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 240) };
  }

  return { response, body };
}

function safeResult(result) {
  return JSON.stringify(result, null, 2);
}

async function main() {
  const supabaseUrl = env('SUPABASE_URL') || env('NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const strict = process.env.PATIENT_CONTINUITY_STORAGE_VERIFY_STRICT === '1';

  if (!supabaseUrl || !serviceRoleKey) {
    const result = {
      ok: false,
      phase: 'blocked',
      reason: 'missing_supabase_url_or_service_role_key',
      safeMessage: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to verify durable continuity storage.',
    };
    console.log(safeResult(result));
    process.exit(strict ? 1 : 0);
  }

  const baseUrl = supabaseUrl.replace(/\/$/, '');
  const headers = {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    'content-type': 'application/json',
  };
  const probeUrl = `${baseUrl}/rest/v1/veranote_patient_continuity?select=id&limit=1`;
  const probe = await fetchJson(probeUrl, { headers });

  if (!probe.response.ok) {
    const result = {
      ok: false,
      phase: 'blocked',
      status: probe.response.status,
      code: probe.body?.code,
      safeMessage: probe.body?.code === 'PGRST205'
        ? 'Remote Supabase does not expose/find public.veranote_patient_continuity yet. Apply supabase/migrations/20260509110000_veranote_patient_continuity.sql.'
        : probe.body?.message || probe.response.statusText,
    };
    console.log(safeResult(result));
    process.exit(strict ? 1 : 0);
  }

  const qaId = `continuity_storage_qa_${Date.now()}`;
  const now = new Date().toISOString();
  const qaRecord = {
    id: qaId,
    provider_id: 'provider-storage-qa',
    patient_label: 'storage qa neutral patient',
    last_source_date: now,
    data: {
      id: qaId,
      providerIdentityId: 'provider-storage-qa',
      patientLabel: 'storage qa neutral patient',
      privacyMode: 'neutral-id',
      createdAt: now,
      updatedAt: now,
      sourceDraftIds: ['storage-qa-draft'],
      sourceNoteTypes: ['Storage QA Note'],
      lastSourceDate: now,
      continuityFacts: [],
      todayPrepChecklist: ['Storage QA test row only.'],
      recallSummary: 'Storage QA test row only.',
    },
  };

  const insert = await fetchJson(`${baseUrl}/rest/v1/veranote_patient_continuity`, {
    method: 'POST',
    headers: {
      ...headers,
      prefer: 'return=representation',
    },
    body: JSON.stringify(qaRecord),
  });

  if (!insert.response.ok) {
    const result = {
      ok: false,
      phase: 'insert_failed',
      status: insert.response.status,
      code: insert.body?.code,
      safeMessage: insert.body?.message || insert.response.statusText,
    };
    console.log(safeResult(result));
    process.exit(strict ? 1 : 0);
  }

  const read = await fetchJson(`${baseUrl}/rest/v1/veranote_patient_continuity?id=eq.${encodeURIComponent(qaId)}&select=id,provider_id,patient_label`, {
    headers,
  });
  const remove = await fetchJson(`${baseUrl}/rest/v1/veranote_patient_continuity?id=eq.${encodeURIComponent(qaId)}`, {
    method: 'DELETE',
    headers,
  });

  const result = {
    ok: read.response.ok && remove.response.ok && Array.isArray(read.body) && read.body.length === 1,
    phase: 'verified',
    readStatus: read.response.status,
    deleteStatus: remove.response.status,
    rowsRead: Array.isArray(read.body) ? read.body.length : 0,
    safeMessage: 'Remote Supabase patient-continuity storage accepted insert/read/delete through the server-only service-role path.',
  };

  console.log(safeResult(result));
  process.exit(result.ok ? 0 : strict ? 1 : 0);
}

main().catch((error) => {
  console.error(safeResult({
    ok: false,
    phase: 'error',
    safeMessage: error instanceof Error ? error.message : 'Unknown storage verification error.',
  }));
  process.exit(process.env.PATIENT_CONTINUITY_STORAGE_VERIFY_STRICT === '1' ? 1 : 0);
});
