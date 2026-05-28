module.exports = {
  default: {
    paths: ["src/core/tests/**/*.feature"],

    requireModule: ["tsconfig-paths/register", "ts-node/register", "dotenv/config"],
    require: [
      "src/core/tests/support/**/*.ts",
      "src/core/tests/**/step_definitions/**/*.ts",
    ],

    format: ["progress"],

    timeout: 300000,
    parallel: 1,

    // Render free-tier hosting (BASE_URL / API_BASE_URL on onrender.com) can
    // re-sleep a dyno mid-run or answer the first navigation slowly enough to
    // blow a step's element-wait budget — a transient flake that warm-up.ts
    // mitigates but cannot fully eliminate (it is best-effort/non-fatal by
    // design). A single bounded retry self-heals that residual blip without
    // masking deterministic failures: a real break still fails twice. Cucumber
    // marks retried-then-passed scenarios as flaky in the report, so the signal
    // is preserved rather than hidden.
    retry: 1,
  },
};
