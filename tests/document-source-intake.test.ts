import { describe, expect, it } from 'vitest';

import {
  buildReviewedDocumentSourceBlock,
  canReadDocumentAsBrowserText,
  classifyDocumentSourceKind,
  getDocumentIntakePlan,
  getDocumentReliabilityWarnings,
  inferDocumentSourceBucket,
  normalizeReviewedDocumentText,
  sanitizeDocumentFileName,
} from '@/lib/document-intake/source-document-intake';

describe('document source intake', () => {
  it('classifies common outside-record file types', () => {
    expect(classifyDocumentSourceKind('referral.txt', 'text/plain')).toBe('text');
    expect(classifyDocumentSourceKind('ER packet.pdf', 'application/pdf')).toBe('pdf');
    expect(classifyDocumentSourceKind('scan.jpeg', 'image/jpeg')).toBe('image');
    expect(classifyDocumentSourceKind('prior-note.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('word');
    expect(classifyDocumentSourceKind('labs.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('spreadsheet');
  });

  it('only auto-reads browser-safe text files', () => {
    expect(canReadDocumentAsBrowserText('nursing-intake.md', '')).toBe(true);
    expect(canReadDocumentAsBrowserText('scan.pdf', 'application/pdf')).toBe(false);
    expect(canReadDocumentAsBrowserText('prior-note.docx', '')).toBe(false);
  });

  it('describes current and future intake automation by file type', () => {
    expect(getDocumentIntakePlan('nursing-intake.md').capability).toBe('browser-text-now');
    expect(getDocumentIntakePlan('ER packet.pdf', 'application/pdf')).toMatchObject({
      sourceKind: 'pdf',
      extractionMode: 'manual-ocr-review',
      capability: 'future-pdf-text-extraction',
      targetSourceLane: 'Pre-Visit Data',
    });
    expect(getDocumentIntakePlan('scan.jpeg', 'image/jpeg')).toMatchObject({
      extractionMode: 'manual-ocr-review',
      capability: 'future-image-ocr',
    });
    expect(getDocumentIntakePlan('prior-note.docx')).toMatchObject({
      extractionMode: 'manual-summary',
      capability: 'future-word-parser',
    });
    expect(getDocumentIntakePlan('labs.xlsx')).toMatchObject({
      extractionMode: 'manual-summary',
      capability: 'future-spreadsheet-parser',
    });
  });

  it('normalizes noisy extracted text without inventing content', () => {
    expect(normalizeReviewedDocumentText('Line 1\u0000  \r\n\n\n\nLine 2  \n')).toBe('Line 1\n\n\nLine 2');
  });

  it('sanitizes document names before placing them in source', () => {
    expect(sanitizeDocumentFileName('ER<packet>|scan.pdf')).toBe('ER_packet__scan.pdf');
  });

  it('infers likely source bucket for reviewed clinical text', () => {
    expect(inferDocumentSourceBucket('CBC, CMP, UDS, and lithium level were listed.')).toBe('labs / objective data');
    expect(inferDocumentSourceBucket('Mother collateral reports suicidal texts.')).toBe('referral / collateral');
    expect(inferDocumentSourceBucket('Emergency department discharge note from admission.')).toBe('ER / hospital record');
  });

  it('builds a provider-reviewed source block with safety attribution', () => {
    const block = buildReviewedDocumentSourceBlock({
      fileName: 'ER packet.pdf',
      mimeType: 'application/pdf',
      extractionMode: 'manual-ocr-review',
      reviewedText: 'ED note says lithium level pending and collateral concern remains.',
    });

    expect(block).toContain('Reviewed Document Source: ER packet.pdf');
    expect(block).toContain('Review status: provider reviewed before loading into source.');
    expect(block).toContain('preserve attribution and uncertainty');
    expect(block).toContain('Reliability warnings:');
    expect(block).toContain('Reviewed OCR/scanned-source limitations apply.');
    expect(block).toContain('lithium level pending');
  });

  it('detects reliability warnings before reviewed document text enters note generation', () => {
    const warningIds = getDocumentReliabilityWarnings({
      extractionMode: 'manual-ocr-review',
      sourceKind: 'pdf',
      reviewedText: [
        'Prior diagnosis listed: bipolar disorder.',
        'Lithium level ordered but not resulted.',
        'Transfer says med clear? with question mark.',
        'Mother collateral conflicts with patient denial.',
      ].join('\n'),
    }).map((warning) => warning.id);

    expect(warningIds).toEqual(expect.arrayContaining([
      'pending-results',
      'clearance-uncertain',
      'diagnosis-overclaim-risk',
      'collateral-conflict',
      'ocr-review-required',
    ]));
  });
});
