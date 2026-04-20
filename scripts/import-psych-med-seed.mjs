import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_SOURCE_DIR = '/Users/danielhale/Desktop/veranote-medication-research/app_integration';
const SOURCE_DIR = process.env.VERANOTE_MED_SOURCE_DIR || DEFAULT_SOURCE_DIR;
const APP_ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const DATA_DIR = path.join(APP_ROOT, 'data');
const MEDICATION_OUTPUT = path.join(DATA_DIR, 'psych-medication-library.seed.json');
const WARNING_OUTPUT = path.join(DATA_DIR, 'psych-medication-warning-rules.seed.json');

function parseCsv(text) {
  const rows = [];
  let current = '';
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];

    if (character === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === ',' && !inQuotes) {
      row.push(current);
      current = '';
      continue;
    }

    if ((character === '\n' || character === '\r') && !inQuotes) {
      if (character === '\r' && next === '\n') {
        index += 1;
      }
      row.push(current);
      current = '';
      if (row.some((value) => value.length > 0)) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    current += character;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    if (row.some((value) => value.length > 0)) {
      rows.push(row);
    }
  }

  if (!rows.length) {
    return [];
  }

  const [headers, ...body] = rows;
  return body.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

function readCsv(fileName) {
  return parseCsv(fs.readFileSync(path.join(SOURCE_DIR, fileName), 'utf8'));
}

function readJson(fileName) {
  return JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, fileName), 'utf8'));
}

function groupBy(rows, keyName, valueName, rankName) {
  const grouped = new Map();

  for (const row of rows) {
    const key = row[keyName];
    if (!key) {
      continue;
    }
    const bucket = grouped.get(key) || [];
    bucket.push({
      rank: Number.parseInt(row[rankName] || `${bucket.length + 1}`, 10) || bucket.length + 1,
      value: row[valueName],
    });
    grouped.set(key, bucket);
  }

  return new Map(
    [...grouped.entries()].map(([key, items]) => [
      key,
      items
        .sort((left, right) => left.rank - right.rank)
        .map((item) => item.value)
        .filter(Boolean),
    ]),
  );
}

function groupRowsBy(rows, keyName) {
  const grouped = new Map();

  for (const row of rows) {
    const key = row[keyName];
    if (!key) {
      continue;
    }
    const bucket = grouped.get(key) || [];
    bucket.push(row);
    grouped.set(key, bucket);
  }

  return grouped;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeBoolean(value) {
  return String(value).trim().toLowerCase() === 'true';
}

function mapSourceStatus(value) {
  if (
    value === 'provisional_unverified'
    || value === 'attached_current_label_pointer'
    || value === 'attached_supporting_extract'
    || value === 'needs_human_review'
  ) {
    return value;
  }

  return 'unknown';
}

function normalizeWarningSeverity(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'hard_stop' || normalized.startsWith('hard_stop_or_major')) {
    return 'hard_stop';
  }
  if (normalized === 'major' || normalized === 'moderate' || normalized === 'info') {
    return normalized;
  }
  return 'major';
}

function mapMedicationCategories(primary, secondary) {
  const categories = new Set();
  const primaryKey = String(primary || '').trim().toLowerCase();
  const secondaryKey = String(secondary || '').trim().toLowerCase();

  switch (primaryKey) {
    case 'antidepressant':
      categories.add('antidepressant');
      break;
    case 'antipsychotic':
      categories.add('antipsychotic');
      break;
    case 'mood_stabilizer':
      categories.add('mood-stabilizer');
      break;
    case 'adhd_medication':
      if (secondaryKey.includes('nonstimulant') || secondaryKey.includes('alpha2')) {
        categories.add('non-stimulant-adhd');
      } else {
        categories.add('stimulant');
      }
      break;
    case 'anxiolytic':
      categories.add('anxiolytic');
      break;
    case 'hypnotic':
      categories.add('hypnotic-sedative');
      categories.add('sleep-agent');
      break;
    case 'substance_use_treatment':
      categories.add('substance-use-treatment');
      break;
    case 'wake_promoting_agent':
      categories.add('other-psych');
      break;
    default:
      categories.add('other-psych');
      break;
  }

  if (secondaryKey.includes('alpha2')) {
    categories.add('alpha-agonist');
  }

  if (secondaryKey.includes('benzodiazepine') && !categories.has('hypnotic-sedative')) {
    categories.add('anxiolytic');
  }

  if (secondaryKey.includes('orexin') || secondaryKey.includes('melatonin') || secondaryKey.includes('hypnotic')) {
    categories.add('sleep-agent');
  }

  return [...categories];
}

function buildMedicationBundle() {
  const exportSummary = readJson('export_summary.json');
  const medications = readCsv('medications.csv');
  const brandsByMedication = groupBy(readCsv('medication_brands.csv'), 'medication_id', 'brand_name', 'brand_rank');
  const usesByMedication = groupBy(readCsv('medication_core_uses.csv'), 'medication_id', 'core_psych_use', 'use_rank');
  const flagsByMedication = groupBy(readCsv('medication_high_risk_flags.csv'), 'medication_id', 'high_risk_flag', 'flag_rank');
  const normalizationByMedication = new Map(
    readCsv('medication_normalization_priority_pass.csv').map((row) => [row.medication_id, row]),
  );
  const sourceDocumentsById = new Map(
    readCsv('high_risk_source_documents.csv').map((row) => [row.source_document_id, row]),
  );
  const sourceRowsByMedication = groupRowsBy(readCsv('high_risk_medication_field_sources.csv'), 'entity_id');

  return {
    libraryVersion: 'veranote-psych-med-v1',
    generatedAt: new Date().toISOString(),
    sourceSummary: [
      `Imported from ${SOURCE_DIR}`,
      `Provisional psych medication concept seed with ${exportSummary.medications} medication rows, ${exportSummary.brand_rows} brand rows, ${exportSummary.use_rows} core-use rows, and ${exportSummary.flag_rows} high-risk flag rows.`,
      'This bundle is for recognition, review support, autocomplete, class lookup, and warning-rule routing only.',
      'Missing source-backed detail must remain unreviewed or needs-review rather than being treated as safe or complete.',
    ],
    medications: medications.map((row) => {
      const medicationId = row.id;
      const sourceRows = sourceRowsByMedication.get(medicationId) || [];
      const sourceDocumentIds = unique(sourceRows.map((item) => item.source_document_id));
      const linkedSourceRows = sourceDocumentIds
        .map((sourceDocumentId) => sourceDocumentsById.get(sourceDocumentId))
        .filter(Boolean);
      const normalization = normalizationByMedication.get(medicationId) || {};
      const brandNames = brandsByMedication.get(medicationId) || [];
      const genericName = row.generic_name || medicationId;
      const displayName = genericName;
      const sourceLinks = unique(linkedSourceRows.map((item) => item.canonical_url));
      const sourceTitles = unique(linkedSourceRows.map((item) => item.notes));

      return {
        id: medicationId,
        displayName,
        genericName,
        brandNames,
        commonAliases: unique([
          ...brandNames,
          normalization.rxnorm_name,
          normalization.dailymed_title,
        ]).filter((item) => item.toLowerCase() !== displayName.toLowerCase()),
        commonAbbreviations: [],
        categories: mapMedicationCategories(row.psych_primary_class, row.psych_secondary_class),
        seedPrimaryClass: row.psych_primary_class || undefined,
        seedSecondaryClass: row.psych_secondary_class || undefined,
        classFamily: row.psych_primary_class || 'other',
        subclass: row.psych_secondary_class || undefined,
        controlledSubstanceSchedule: row.controlled_substance_schedule || 'unknown',
        isLai: normalizeBoolean(row.is_lai),
        sourceStatus: mapSourceStatus(row.source_status),
        usMarketStatus: row.us_market_status || undefined,
        provisional: true,
        indications: usesByMedication.get(medicationId) || [],
        formulations: [],
        commonDoseUnits: [],
        commonScheduleTerms: [],
        blackBoxSummary: undefined,
        pregnancyRisk: 'unknown',
        lactationSummary: undefined,
        renalConsiderations: undefined,
        hepaticConsiderations: undefined,
        highRiskFlags: flagsByMedication.get(medicationId) || [],
        commonAdverseEffects: [],
        highRiskAdverseEffects: [],
        monitoring: [],
        interactionRules: [],
        notesForDocumentation: row.notes ? [row.notes] : [],
        evidenceTier: 'structured-database',
        normalization: {
          priorityBucket: normalization.priority_bucket || undefined,
          rxnormSearchTerm: normalization.rxnorm_search_term || undefined,
          rxnormCui: normalization.rxnorm_cui || undefined,
          rxnormTermType: normalization.rxnorm_term_type || undefined,
          rxnormName: normalization.rxnorm_name || undefined,
          normalizationLevel: normalization.normalization_level || undefined,
          productFamilyTarget: normalization.product_family_target || undefined,
          dailymedSetid: normalization.dailymed_setid || undefined,
          dailymedTitle: normalization.dailymed_title || undefined,
          normalizationStatus: normalization.normalization_status || undefined,
          unresolvedGap: normalization.unresolved_gap || undefined,
        },
        sourceReview: {
          sourceDocumentIds,
          fieldSourceCount: sourceRows.length,
        },
        sourceLinks,
        sourceTitles,
      };
    }),
  };
}

function buildWarningBundle() {
  const warningRules = readCsv('warning_rules.csv');
  const tagMap = groupBy(readCsv('warning_rule_medication_tags.csv'), 'rule_id', 'medication_tag', 'tag_rank');
  const drugMap = groupBy(readCsv('warning_rule_drug_ids.csv'), 'rule_id', 'drug_id', 'drug_rank');
  const contextMap = groupBy(readCsv('warning_rule_context_inputs.csv'), 'rule_id', 'context_input', 'input_rank');
  const filterRowsByRule = groupRowsBy(readCsv('warning_rule_filters.csv'), 'rule_id');
  const ruleSeedById = new Map(
    readJson('runtime_warning_engine_seed.json').rules.map((rule) => [rule.code, rule]),
  );

  return {
    libraryVersion: 'veranote-psych-med-warning-v1',
    generatedAt: new Date().toISOString(),
    sourceSummary: [
      `Imported from ${SOURCE_DIR}`,
      `Provisional warning scaffold with ${warningRules.length} rules.`,
      'Hard-stop rules downgrade when required context is missing and always require clinician review.',
      'This warning bundle is additive review support, not prescribing guidance.',
    ],
    rules: warningRules.map((row) => {
      const seed = ruleSeedById.get(row.rule_id);
      const evidenceBasis = seed?.evidence_basis || 'provisional_seed_logic';
      const filters = Object.fromEntries(
        (filterRowsByRule.get(row.rule_id) || []).map((item) => [item.filter_key, item.filter_value]),
      );

      return {
        ruleId: row.rule_id,
        status: row.status,
        severity: normalizeWarningSeverity(row.severity),
        category: row.category,
        triggerDescription: row.trigger_description,
        actionSummary: row.action,
        medicationTags: tagMap.get(row.rule_id) || [],
        medicationIds: unique([
          ...(drugMap.get(row.rule_id) || []),
          ...(seed?.medication_ids_any || []),
        ]),
        contextInputs: unique([
          ...(contextMap.get(row.rule_id) || []),
          ...(seed?.required_context || []),
        ]),
        filters,
        evidenceBasis,
        sourceDocumentIds: seed?.source_document_ids || [],
        provisional: true,
        sourceBacked: evidenceBasis.startsWith('source_backed_'),
      };
    }),
  };
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function main() {
  if (!fs.existsSync(SOURCE_DIR)) {
    throw new Error(`Medication source directory not found: ${SOURCE_DIR}`);
  }

  ensureDataDir();

  const medicationBundle = buildMedicationBundle();
  const warningBundle = buildWarningBundle();

  writeJson(MEDICATION_OUTPUT, medicationBundle);
  writeJson(WARNING_OUTPUT, warningBundle);

  console.log(`Wrote ${MEDICATION_OUTPUT}`);
  console.log(`Wrote ${WARNING_OUTPUT}`);
  console.log(`Imported ${medicationBundle.medications.length} medications and ${warningBundle.rules.length} warning rules.`);
}

main();
