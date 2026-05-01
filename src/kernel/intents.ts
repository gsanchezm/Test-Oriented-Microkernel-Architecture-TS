// Single source of truth for action IDs that flow through the chaos-proxy.
//
// We use `as const` + a derived union type instead of a TypeScript `enum`:
//   - no runtime overhead (enum compiles to a JS object; this stays as string literals)
//   - the type IS the literal value, so handler keys (case-insensitive 'TYPE') still match
//   - no enum heterogeneity / reverse-mapping foot-guns
//
// Consumers should import `INTENT` and use `INTENT.CLICK` etc. instead of raw strings.

export const INTENT = {
    // UI primitives (web-ui + mobile-ui)
    CLICK: 'CLICK',
    TYPE: 'TYPE',
    NAVIGATE: 'NAVIGATE',
    EVALUATE: 'EVALUATE',
    READ_TEXT: 'READ_TEXT',
    ASSERT_TEXT: 'ASSERT_TEXT',
    WAIT_FOR_ELEMENT: 'WAIT_FOR_ELEMENT',
    SCROLL_TO: 'SCROLL_TO',

    // Mobile-only
    DEEP_LINK: 'DEEP_LINK',
    HIDE_KEYBOARD: 'HIDE_KEYBOARD',
    SWITCH_CONTEXT: 'SWITCH_CONTEXT',

    // Lifecycle
    TEARDOWN: 'TEARDOWN',

    // Visual oracle
    CAPTURE_SNAPSHOT: 'CAPTURE_SNAPSHOT',
    COMPARE_SNAPSHOT: 'COMPARE_SNAPSHOT',
    UPDATE_BASELINE: 'UPDATE_BASELINE',
    VALIDATE_VISUAL_CONTRACT: 'VALIDATE_VISUAL_CONTRACT',

    // API contracts
    EXECUTE_CONTRACT_ENDPOINT: 'EXECUTE_CONTRACT_ENDPOINT',
    VALIDATE_CONTRACT_ENDPOINT: 'VALIDATE_CONTRACT_ENDPOINT',

    // Performance / load
    RUN_SIMULATION: 'RUN_SIMULATION',
    RUN_CHECKOUT_LOAD: 'RUN_CHECKOUT_LOAD',
    PARSE_GATLING_STATS: 'PARSE_GATLING_STATS',
    VALIDATE_THRESHOLDS: 'VALIDATE_THRESHOLDS',
} as const;

export type IntentAction = typeof INTENT[keyof typeof INTENT];

// Legacy aliases the chaos-proxy still recognizes for external compatibility.
// Don't introduce new callers using these names — prefer the INTENT.* canonical IDs.
export const LEGACY_INTENT_ALIASES = [
    'VISUAL_CAPTURE',
    'VISUAL_COMPARE',
    'VISUAL_VALIDATE',
    'EXECUTE_API_CONTRACT',
    'HTTP_GET',
    'HTTP_POST',
    'HTTP_PUT',
    'HTTP_PATCH',
    'HTTP_DELETE',
] as const;
