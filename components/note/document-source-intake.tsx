'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  buildReviewedDocumentSourceBlock,
  documentExtractionModeLabel,
  getDocumentIntakePlan,
  normalizeReviewedDocumentText,
  type DocumentExtractionMode,
  type DocumentSourceKind,
} from '@/lib/document-intake/source-document-intake';

type DocumentSourceIntakeProps = {
  onCommitToSource: (sourceBlock: string) => void;
};

function sourceKindLabel(kind: DocumentSourceKind) {
  switch (kind) {
    case 'pdf':
      return 'PDF';
    case 'image':
      return 'Image / scan';
    case 'word':
      return 'Word document';
    case 'spreadsheet':
      return 'Spreadsheet';
    case 'text':
      return 'Readable text';
    case 'unknown':
    default:
      return 'Document';
  }
}

export function DocumentSourceIntake({ onCommitToSource }: DocumentSourceIntakeProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState('');
  const [mimeType, setMimeType] = useState('');
  const [sourceKind, setSourceKind] = useState<DocumentSourceKind>('unknown');
  const [extractionMode, setExtractionMode] = useState<DocumentExtractionMode>('manual-summary');
  const [reviewText, setReviewText] = useState('');
  const [status, setStatus] = useState('Choose a file, paste OCR text, or type a reviewed summary.');
  const [error, setError] = useState('');
  const [isHydrated, setIsHydrated] = useState(false);
  const intakePlan = getDocumentIntakePlan(fileName, mimeType);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  async function handleFileSelection(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setError('');

    if (!file) {
      return;
    }

    const nextPlan = getDocumentIntakePlan(file.name, file.type);
    const nextSourceKind = nextPlan.sourceKind;
    setFileName(file.name);
    setMimeType(file.type);
    setSourceKind(nextSourceKind);

    if (nextPlan.canAutoReadBrowserText) {
      try {
        const extractedText = normalizeReviewedDocumentText(await file.text());
        setReviewText(extractedText);
        setExtractionMode('browser-text');
        setStatus('Text extracted locally in the browser. Review it before loading into source.');
      } catch {
        setReviewText('');
        setExtractionMode('manual-summary');
        setStatus('Could not read this file locally. Paste reviewed text or a summary below.');
        setError('This file could not be read as browser text.');
      }
      return;
    }

    setReviewText('');
    setExtractionMode(nextPlan.extractionMode);
    setStatus(nextPlan.providerInstruction);
  }

  function handleCommit() {
    const sourceBlock = buildReviewedDocumentSourceBlock({
      fileName,
      mimeType,
      sourceKind,
      extractionMode,
      reviewedText: reviewText,
    });

    if (!sourceBlock) {
      setError('Add reviewed document text before loading it into source.');
      return;
    }

    onCommitToSource(sourceBlock);
    setStatus('Reviewed document text was loaded into Pre-Visit Data.');
    setError('');
  }

  function handleClear() {
    setFileName('');
    setMimeType('');
    setSourceKind('unknown');
    setExtractionMode('manual-summary');
    setReviewText('');
    setError('');
    setStatus('Choose a file, paste OCR text, or type a reviewed summary.');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  return (
    <section className="workspace-subpanel workspace-glow rounded-[22px] border-l-4 border-l-sky-300/70 bg-[linear-gradient(90deg,rgba(56,189,248,0.12),rgba(255,255,255,0.035)_28%,rgba(255,255,255,0.02))] p-4 text-white shadow-[0_24px_56px_rgba(2,8,18,0.22)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-100/82">Source documents</div>
          <h3 className="mt-1 text-base font-semibold text-white">Upload or paste outside records for review</h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-cyan-50/74">
            Use this for ER packets, referral notes, prior-provider notes, labs, scans, or OCR text. Veranote only loads reviewed text into Pre-Visit Data.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-sky-200/24 bg-sky-300/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-50">
            Provider review required
          </span>
          <span className="rounded-full border border-cyan-200/18 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-50/78">
            Local draft intake
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)]">
        <div className="grid gap-3">
          <label className="grid gap-2 rounded-[18px] border border-cyan-200/12 bg-[rgba(8,24,42,0.66)] p-3 text-sm text-cyan-50/84">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/66">Document file</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.markdown,.csv,.json,.rtf,.pdf,.png,.jpg,.jpeg,.heic,.tif,.tiff,.webp,.doc,.docx,.xls,.xlsx"
              onChange={handleFileSelection}
              className="block w-full cursor-pointer rounded-xl border border-cyan-200/14 bg-white/5 px-3 py-2 text-xs text-cyan-50 file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-950"
              data-testid="document-source-file-input"
            />
          </label>

          <div className="rounded-[18px] border border-cyan-200/12 bg-white/[0.045] p-3 text-sm text-cyan-50/76">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/66">Review state</div>
            <div className="mt-2 grid gap-1.5 text-xs leading-5">
              <div>File: <span className="font-semibold text-white">{fileName || 'None selected'}</span></div>
              <div>Type: <span className="font-semibold text-white">{sourceKindLabel(sourceKind)}</span></div>
              <div>Mode: <span className="font-semibold text-white">{documentExtractionModeLabel(extractionMode)}</span></div>
              <div>Target: <span className="font-semibold text-white">{intakePlan.targetSourceLane}</span></div>
              <div>Automation: <span className="font-semibold text-white">{intakePlan.futureAutomation}</span></div>
              <div className="pt-1 text-cyan-50/68">{status}</div>
            </div>
          </div>
        </div>

        <div className="grid gap-2">
          <label className="grid gap-2 text-sm">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/66">Reviewed text or OCR output</span>
            <textarea
              value={reviewText}
              onChange={(event) => {
                setReviewText(event.target.value);
                setError('');
              }}
              placeholder="Paste OCR text, referral note excerpts, ER packet summary, prior-provider note details, labs, or a provider-reviewed document summary here."
              className="workspace-control min-h-[190px] rounded-[18px] px-4 py-3.5 text-[14px] leading-6"
              data-testid="document-source-review-text"
            />
          </label>
          {error ? <div className="rounded-xl border border-red-300/30 bg-red-400/10 px-3 py-2 text-sm text-red-100">{error}</div> : null}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <button
              type="button"
              onClick={handleCommit}
              disabled={!isHydrated}
              className="aurora-primary-button rounded-xl px-4 py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
              data-hydrated={isHydrated ? 'true' : 'false'}
              data-testid="document-source-commit-button"
            >
              Load reviewed document into source
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="aurora-secondary-button rounded-xl px-4 py-2.5 text-sm font-medium"
              data-testid="document-source-clear-button"
            >
              Clear document intake
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
