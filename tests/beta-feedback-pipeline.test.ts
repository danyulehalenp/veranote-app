import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { renderToStaticMarkup } from 'react-dom/server';
import { InlineFeedbackControl } from '@/components/veranote/feedback/inline-feedback-control';
import { buildFeedbackRegressionScaffold } from '@/lib/beta/feedback-regression';
import type { BetaFeedbackItem } from '@/types/beta-feedback';

const ORIGINAL_ENV = { ...process.env };
let tempDir = '';

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'veranote-beta-feedback-'));
  process.env = {
    ...ORIGINAL_ENV,
    PROTOTYPE_DATA_DIR: tempDir,
    PROTOTYPE_DB_PATH: path.join(tempDir, 'prototype-db.json'),
  };
  vi.resetModules();
});

afterEach(async () => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
  }
});

async function loadFeedbackRoute() {
  return import('@/app/api/beta-feedback/route');
}

describe('beta feedback pipeline', () => {
  it('submits lightweight feedback without requiring comments', async () => {
    const route = await loadFeedbackRoute();
    const response = await route.POST(new Request('http://localhost/api/beta-feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pageContext: 'Note builder review',
        workflowArea: 'note_builder',
        noteType: 'Inpatient Psych Progress Note',
        feedbackLabel: 'helpful',
      }),
    }));

    const payload = await response.json() as { feedback: BetaFeedbackItem };

    expect(response.ok).toBe(true);
    expect(payload.feedback.feedbackLabel).toBe('helpful');
    expect(payload.feedback.workflowArea).toBe('note_builder');
    expect(payload.feedback.status).toBe('new');
    expect(payload.feedback.userComment).toBeUndefined();
  });

  it('stores optional negative feedback comments when provided', async () => {
    const route = await loadFeedbackRoute();
    const response = await route.POST(new Request('http://localhost/api/beta-feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pageContext: 'Atlas assistant',
        workflowArea: 'vera_assistant',
        feedbackLabel: 'missing-key-fact',
        userComment: 'It left out the collateral report.',
        desiredBehavior: 'Keep the patient report and collateral report separate.',
      }),
    }));

    const payload = await response.json() as { feedback: BetaFeedbackItem };

    expect(response.ok).toBe(true);
    expect(payload.feedback.userComment).toContain('collateral report');
    expect(payload.feedback.desiredBehavior).toContain('patient report');
  });

  it('shows the PHI warning copy in the inline feedback control', () => {
    const markup = renderToStaticMarkup(
      React.createElement(InlineFeedbackControl, {
        pageContext: 'Note builder review',
        workflowArea: 'note_builder',
        noteType: 'Inpatient Psych Progress Note',
        promptSummary: 'messy source',
        responseSummary: 'clean draft',
      }),
    );

    expect(markup).toContain('Please avoid names, DOBs, MRNs, or other identifiers in feedback.');
    expect(markup).toContain('Helpful');
    expect(markup).toContain('Needs work');
  });

  it('updates admin status and notes', async () => {
    const route = await loadFeedbackRoute();
    const createResponse = await route.POST(new Request('http://localhost/api/beta-feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pageContext: 'Medication reference',
        workflowArea: 'medication_reference',
        feedbackLabel: 'too-generic',
      }),
    }));
    const created = await createResponse.json() as { feedback: BetaFeedbackItem };

    const updateResponse = await route.PATCH(new Request('http://localhost/api/beta-feedback', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: created.feedback.id,
        status: 'needs_regression',
        adminNotes: 'Turn this into a med-reference stress case.',
      }),
    }));
    const updated = await updateResponse.json() as { feedback: BetaFeedbackItem };

    expect(updateResponse.ok).toBe(true);
    expect(updated.feedback.status).toBe('needs_regression');
    expect(updated.feedback.adminNotes).toContain('med-reference stress case');
  });

  it('generates a regression scaffold from reviewed feedback', () => {
    const scaffold = buildFeedbackRegressionScaffold({
      id: 'feedback_1',
      createdAt: '2026-04-25T00:00:00.000Z',
      pageContext: 'Atlas assistant',
      category: 'workflow',
      message: 'Provider marked this response as missing key fact.',
      status: 'needs_regression',
      workflowArea: 'vera_assistant',
      noteType: 'Inpatient Psych Progress Note',
      feedbackLabel: 'missing-key-fact',
      severity: 'medium',
      answerMode: 'chart_ready_wording',
      promptSummary: 'pt better but still hearing voices wants dc',
      desiredBehavior: 'Keep improvement and persistent psychosis in one compact paragraph.',
    });

    expect(scaffold.source).toBe('beta_feedback');
    expect(scaffold.failure_category).toBe('missing_key_fact');
    expect(scaffold.expected_answer_mode).toBe('chart_ready_wording');
    expect(scaffold.prompt_pattern).toContain('hearing voices');
  });

  it('stores sanitized summaries instead of raw full note text by default', async () => {
    const route = await loadFeedbackRoute();
    const longPrompt = `DOB 01/01/1990 MRN 123456 patient says ${'very long note '.repeat(80)}`;
    const longResponse = `123 Main Street ${'response text '.repeat(80)}`;
    const response = await route.POST(new Request('http://localhost/api/beta-feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pageContext: 'Note builder review',
        workflowArea: 'note_builder',
        feedbackLabel: 'unsafe-wording',
        promptSummary: longPrompt,
        responseSummary: longResponse,
      }),
    }));

    const payload = await response.json() as { feedback: BetaFeedbackItem };

    expect(response.ok).toBe(true);
    expect(payload.feedback.promptSummary).not.toBe(longPrompt);
    expect(payload.feedback.responseSummary).not.toBe(longResponse);
    expect(payload.feedback.promptSummary?.length || 0).toBeLessThanOrEqual(280);
    expect(payload.feedback.responseSummary?.length || 0).toBeLessThanOrEqual(280);
    expect(payload.feedback.promptSummary).toContain('[redacted]');
    expect(payload.feedback.phiRiskFlag).toBe(true);
    expect((payload.feedback as Record<string, unknown>).rawPrompt).toBeUndefined();
    expect((payload.feedback as Record<string, unknown>).rawResponse).toBeUndefined();
  });
});
