#!/usr/bin/env node

process.env.VERANOTE_ALLOW_MOCK_AUTH ||= 'true';

const DEFAULT_BATCH_ID = 'batch1-medication-reference';

function parseArgs(argv) {
  return argv.reduce((acc, arg) => {
    if (arg.startsWith('--batch=')) {
      acc.batchId = arg.slice('--batch='.length);
    } else if (arg === '--strict') {
      acc.strict = true;
    }
    return acc;
  }, {
    batchId: process.env.LIVE_ASSISTANT_QA_BATCH || DEFAULT_BATCH_ID,
    strict: process.env.LIVE_ASSISTANT_QA_STRICT === '1',
  });
}

function toMarkdown(summary, results) {
  const lines = [
    `# Live Assistant Route QA: ${summary.batchId}`,
    '',
    `- Total: ${summary.total}`,
    `- Passed: ${summary.passed}`,
    `- Failed: ${summary.failed}`,
    `- Pass rate: ${summary.passRate}`,
    '',
    '## Top Failures',
    '',
  ];

  const failures = results.filter((result) => !result.passed).slice(0, 20);
  if (!failures.length) {
    lines.push('No failures.');
  } else {
    for (const failure of failures) {
      lines.push(`### ${failure.id}`);
      lines.push('');
      lines.push(`Question: ${failure.question}`);
      lines.push('');
      lines.push(`Failures: ${failure.failureReasons.join('; ')}`);
      lines.push('');
      lines.push(`Answer excerpt: ${failure.answerExcerpt}`);
      lines.push('');
    }
  }

  return `${lines.join('\n')}\n`;
}

function classifyFailureReason(reason) {
  if (reason.startsWith('too long')) {
    return 'too long';
  }

  if (reason.includes('unsafe/directive')) {
    return 'unsafe';
  }

  if (reason.startsWith('missing expected text')) {
    return 'missed direct answer';
  }

  if (reason.startsWith('included forbidden text')) {
    return 'wrong route';
  }

  return 'other';
}

function countFailureTypes(results) {
  const counts = {
    'too long': 0,
    'wrong route': 0,
    'missed direct answer': 0,
    unsafe: 0,
    other: 0,
  };

  for (const result of results) {
    for (const reason of result.failureReasons) {
      counts[classifyFailureReason(reason)] += 1;
    }
  }

  return counts;
}

async function askThroughAssistantRoute(POST, testCase) {
  const response = await POST(new Request('http://localhost/api/assistant/respond?eval=true', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer veranote-provider-token',
    },
    body: JSON.stringify({
      stage: 'review',
      mode: 'workflow-help',
      message: testCase.question,
      context: {
        providerAddressingName: 'Live QA Provider',
        noteType: 'Medication Reference',
        currentDraftText: '',
      },
      recentMessages: testCase.recentMessages || [],
    }),
  }));

  if (!response.ok) {
    return {
      message: `HTTP ${response.status}`,
      answerMode: 'error',
      status: response.status,
    };
  }

  return response.json();
}

async function main() {
  const { batchId, strict } = parseArgs(process.argv.slice(2));
  const [
    { POST },
    { getLiveAssistantStagedBatch },
    { CLINICIAN_LIVE_ASSISTANT_BATCH_1 },
    { evaluateLiveAssistantAnswer, summarizeLiveAssistantEvaluations },
    fs,
    path,
  ] = await Promise.all([
    import('../app/api/assistant/respond/route.ts'),
    import('../lib/eval/live-assistant/staged-live-assistant-question-bank.ts'),
    import('../lib/eval/live-assistant/clinician-live-assistant-question-bank.ts'),
    import('../lib/eval/live-assistant/evaluate-live-assistant-answer.ts'),
    import('node:fs/promises'),
    import('node:path'),
  ]);

  const cases = batchId === 'clinician-batch1'
    ? CLINICIAN_LIVE_ASSISTANT_BATCH_1
    : getLiveAssistantStagedBatch(batchId);
  if (!cases?.length) {
    throw new Error(`Unknown or empty live assistant QA batch: ${batchId}`);
  }

  const results = [];
  for (const testCase of cases) {
    const payload = await askThroughAssistantRoute(POST, testCase);
    const evaluation = evaluateLiveAssistantAnswer(testCase, payload.message || '');
    results.push({
      ...evaluation,
      question: testCase.question,
      category: testCase.category,
      expectedLane: testCase.expectedLane,
      expectedMode: testCase.expectedMode,
      answerMode: payload.answerMode,
      safetyLevel: testCase.safetyLevel,
      answerExcerpt: (payload.message || '').slice(0, 360),
    });
  }

  const baseSummary = summarizeLiveAssistantEvaluations(results);
  const summary = {
    batchId,
    total: baseSummary.total,
    passed: baseSummary.passed,
    failed: baseSummary.failed,
    passRate: `${((baseSummary.passed / baseSummary.total) * 100).toFixed(2)}%`,
    failureTypeCounts: countFailureTypes(results),
  };

  const date = new Date().toISOString().slice(0, 10);
  const outputDir = path.resolve('test-results');
  await fs.mkdir(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, `live-assistant-${batchId}-route-${date}.json`);
  const markdownPath = path.join(outputDir, `live-assistant-${batchId}-route-${date}.md`);
  await fs.writeFile(jsonPath, JSON.stringify({ summary, results }, null, 2));
  await fs.writeFile(markdownPath, toMarkdown(summary, results));

  console.log(JSON.stringify({
    ...summary,
    jsonPath,
    markdownPath,
    failures: results.filter((result) => !result.passed).slice(0, 10),
  }, null, 2));

  if (strict && summary.failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
