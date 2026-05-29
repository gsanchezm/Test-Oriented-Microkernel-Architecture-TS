// Standardized failure-bucket classifier. Objective, deterministic keyword matching.
// status !== 'FAIL' returns null. Unmatched failures fall back to UNKNOWN_FAILURE.

export const FAILURE_BUCKETS = [
  'API_CONTRACT_FAILURE',
  'API_RESPONSE_FAILURE',
  'UI_ACTION_FAILURE',
  'LOCATOR_RESOLUTION_FAILURE',
  'VISUAL_DIFF_FAILURE',
  'VISUAL_BASELINE_MISSING',
  'PERFORMANCE_THRESHOLD_FAILURE',
  'MOBILE_SESSION_FAILURE',
  'WEB_SESSION_FAILURE',
  'INFRASTRUCTURE_FAILURE',
  'DATA_SETUP_FAILURE',
  'ASSERTION_FAILURE',
  'TIMEOUT_FAILURE',
  'UNKNOWN_FAILURE',
] as const;

export type FailureBucket = (typeof FAILURE_BUCKETS)[number];

export interface ClassifyCtx {
  toolName?: string;
  platform?: string;
  step?: string;
}

// Ordered rules — first match wins.
const RULES: Array<{ re: RegExp; bucket: FailureBucket }> = [
  { re: /timeout|timed out|exceeded.*time|waiting for/i, bucket: 'TIMEOUT_FAILURE' },
  { re: /baseline missing|no baseline|baseline not found/i, bucket: 'VISUAL_BASELINE_MISSING' },
  { re: /pixel|diff ratio|diff pixels|visual drift|snapshot mismatch|compare_snapshot/i, bucket: 'VISUAL_DIFF_FAILURE' },
  { re: /locator|selector|element not found|no node found|no element|unable to find/i, bucket: 'LOCATOR_RESOLUTION_FAILURE' },
  { re: /threshold|p95|p99|response time exceeded|slo/i, bucket: 'PERFORMANCE_THRESHOLD_FAILURE' },
  { re: /schema|contract violation|invalid (response )?body|json schema/i, bucket: 'API_CONTRACT_FAILURE' },
  { re: /status code|response status|expected status|http \d{3}|unexpected status/i, bucket: 'API_RESPONSE_FAILURE' },
  { re: /session not created|appium|emulator|simulator|device (offline|not)|adb|xcrun/i, bucket: 'MOBILE_SESSION_FAILURE' },
  { re: /browser|page crash|playwright|webdriver|target closed|context was destroyed/i, bucket: 'WEB_SESSION_FAILURE' },
  { re: /econnrefused|ehostunreach|enotfound|grpc|proxy|plugin not (running|available)|connect failed/i, bucket: 'INFRASTRUCTURE_FAILURE' },
  { re: /seed|fixture|setup|precondition|login failed|could not authenticate|data setup/i, bucket: 'DATA_SETUP_FAILURE' },
  { re: /click|type|tap|fill|navigate|scroll|interact/i, bucket: 'UI_ACTION_FAILURE' },
  { re: /expected|assert|to equal|to contain|to be|should/i, bucket: 'ASSERTION_FAILURE' },
];

export function classifyFailure(
  status: string,
  errorMessage: string | null,
  ctx: ClassifyCtx = {},
): FailureBucket | null {
  if (String(status).toUpperCase() !== 'FAIL') return null;
  const msg = (errorMessage || '').toString();
  for (const rule of RULES) {
    if (rule.re.test(msg)) return rule.bucket;
  }
  // Context-based fallback when the message is unhelpful.
  const platform = (ctx.platform || '').toLowerCase();
  const tool = (ctx.toolName || '').toLowerCase();
  if (platform === 'android' || platform === 'ios' || tool.startsWith('appium')) return 'MOBILE_SESSION_FAILURE';
  if (tool === 'api') return 'API_RESPONSE_FAILURE';
  if (tool === 'pixelmatch') return 'VISUAL_DIFF_FAILURE';
  if (tool === 'gatling') return 'PERFORMANCE_THRESHOLD_FAILURE';
  return 'UNKNOWN_FAILURE';
}

/** Buckets that represent infrastructure/environment problems rather than product/test logic. */
export const INFRA_BUCKETS: FailureBucket[] = [
  'INFRASTRUCTURE_FAILURE',
  'MOBILE_SESSION_FAILURE',
  'WEB_SESSION_FAILURE',
];
