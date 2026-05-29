// Dependency-free Gherkin feature parser (@cucumber/gherkin is not resolvable under pnpm here).
// Shared by scenario-inventory and platform-coverage so the two stay in lock-step.
import { readFileSync } from 'fs';
import { relPosix, walk } from './paths';

export interface ParsedScenario {
  featureFile: string;
  featureName: string;
  scenarioName: string;
  scenarioType: 'Scenario' | 'Scenario Outline';
  tags: string[];
  exampleRows: number;
  stepCount: number;
}

const TAG_RE = /(@[^\s@]+)/g;

function parseTagLine(line: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(line)) !== null) out.push(m[1]);
  return out;
}

const STEP_KEYWORDS = ['Given ', 'When ', 'Then ', 'And ', 'But ', '* '];
const isStep = (t: string) => STEP_KEYWORDS.some((k) => t.startsWith(k));

/** Parse a single .feature file into its scenarios (outlines counted with example rows + step count). */
export function parseFeatureFile(absPath: string): ParsedScenario[] {
  const lines = readFileSync(absPath, 'utf8').split(/\r?\n/);
  const featureFile = relPosix(absPath);

  let featureName = '';
  const featureTags: string[] = [];
  let pendingTags: string[] = [];

  const scenarios: ParsedScenario[] = [];
  let current: ParsedScenario | null = null;
  let inExamples = false;
  let examplesHeaderConsumed = false;

  const flush = () => {
    if (current) scenarios.push(current);
    current = null;
    inExamples = false;
    examplesHeaderConsumed = false;
  };

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    if (trimmed.startsWith('@')) {
      pendingTags.push(...parseTagLine(trimmed));
      continue;
    }
    if (trimmed.startsWith('Feature:')) {
      flush();
      featureName = trimmed.slice('Feature:'.length).trim();
      featureTags.push(...pendingTags);
      pendingTags = [];
      continue;
    }
    const isOutline = trimmed.startsWith('Scenario Outline:');
    const isScenario = !isOutline && trimmed.startsWith('Scenario:');
    if (isOutline || isScenario) {
      flush();
      const kw = isOutline ? 'Scenario Outline:' : 'Scenario:';
      current = {
        featureFile,
        featureName,
        scenarioName: trimmed.slice(kw.length).trim(),
        scenarioType: isOutline ? 'Scenario Outline' : 'Scenario',
        tags: Array.from(new Set([...featureTags, ...pendingTags])),
        exampleRows: 0,
        stepCount: 0,
      };
      pendingTags = [];
      continue;
    }
    if (trimmed.startsWith('Background:')) {
      flush();
      pendingTags = [];
      continue;
    }
    if (trimmed.startsWith('Examples:') || trimmed.startsWith('Scenarios:')) {
      inExamples = true;
      examplesHeaderConsumed = false;
      pendingTags = [];
      continue;
    }
    if (!current) {
      pendingTags = [];
      continue;
    }
    if (inExamples) {
      if (trimmed.startsWith('|')) {
        if (!examplesHeaderConsumed) examplesHeaderConsumed = true;
        else current.exampleRows += 1;
      }
      continue;
    }
    if (isStep(trimmed)) current.stepCount += 1;
  }
  flush();
  return scenarios;
}

/** Parse every *.feature under the given root, tolerant of unreadable files. */
export function parseAllFeatures(featuresRoot: string): ParsedScenario[] {
  const out: ParsedScenario[] = [];
  for (const f of walk(featuresRoot, '.feature')) {
    try {
      out.push(...parseFeatureFile(f));
    } catch {
      // tolerant — skip unreadable feature
    }
  }
  return out;
}
