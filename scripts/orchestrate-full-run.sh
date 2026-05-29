#!/usr/bin/env bash
# One-shot local orchestration: web (desktop+responsive) + visual (desktop+responsive) + gatling,
# then merge + ingest into the dashboard. Sequential (single-tenancy lock). Mirrors
# ahm-execution-helix.yml env per phase. Continues through test failures (we want results
# captured even if some scenarios fail; retry:1 in cucumber.js absorbs cold-start flakes).
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
LOG=".ahm-orch-logs"
mkdir -p "$LOG"
SUMMARY="$LOG/summary.log"
: > "$SUMMARY"

CUKE="./node_modules/.bin/cucumber-js"
TS="$(date +%Y-%m-%dT%H-%M)"
RUN_ID="real-$TS"

say(){ echo "[$(date +%H:%M:%S)] $*" | tee -a "$SUMMARY"; }

wait_port(){ # port
  local port="$1" i
  for i in $(seq 1 90); do
    if node -e "require('net').connect($port,'127.0.0.1').on('connect',function(){process.exit(0)}).on('error',function(){process.exit(1)})" 2>/dev/null; then
      return 0
    fi
    sleep 1
  done
  return 1
}

teardown(){ # "p1,p2,..."
  powershell.exe -NoProfile -Command "foreach(\$p in $1){ \$c=Get-NetTCPConnection -State Listen -LocalPort \$p -ErrorAction SilentlyContinue; foreach(\$x in \$c){ try{ Stop-Process -Id \$x.OwningProcess -Force -ErrorAction Stop }catch{} } }" >/dev/null 2>&1
  rm -f .ahm-run.lock
  sleep 2
}

start_web_stack(){ # viewport pixelmatch
  local vp="$1" px="$2"
  PLATFORM=web VIEWPORT="$vp" DRIVER=playwright HEADLESS=true \
    npx ts-node -r tsconfig-paths/register -r dotenv/config src/kernel/chaos-proxy.ts > "$LOG/proxy.log" 2>&1 &
  PLATFORM=web VIEWPORT="$vp" DRIVER=playwright HEADLESS=true \
    PLUGIN_PLAYWRIGHT=true PLUGIN_PIXELMATCH="$px" PLAYWRIGHT_PLUGIN_PORT=50052 PIXELMATCH_PLUGIN_PORT=50056 \
    npx ts-node -r tsconfig-paths/register -r dotenv/config src/plugins/playwright/server.ts > "$LOG/playwright.log" 2>&1 &
  PLUGIN_API=true API_PLUGIN_PORT=50055 \
    npx ts-node -r tsconfig-paths/register -r dotenv/config src/plugins/api/server.ts > "$LOG/api.log" 2>&1 &
  wait_port 50051 && wait_port 50052 && wait_port 50055
}

start_android_stack(){ # mirrors ahm-execution-helix.yml android job: proxy + appium plugin + api plugin.
  # PLATFORM=android makes the proxy load android locators (it caches by PLATFORM —
  # starting it as web would resolve android keys against the web cache → timeouts).
  # Device specifics (DEVICE_PROFILE, APPIUM_HOST/PORT) come from .env via dotenv/config.
  PLATFORM=android DRIVER=appium \
    npx ts-node -r tsconfig-paths/register -r dotenv/config src/kernel/chaos-proxy.ts > "$LOG/proxy.log" 2>&1 &
  PLATFORM=android DRIVER=appium PLUGIN_APPIUM=true APPIUM_PLUGIN_PORT=50053 \
    npx ts-node -r tsconfig-paths/register -r dotenv/config src/plugins/appium/server.ts > "$LOG/appium-plugin.log" 2>&1 &
  PLUGIN_API=true API_PLUGIN_PORT=50055 \
    npx ts-node -r tsconfig-paths/register -r dotenv/config src/plugins/api/server.ts > "$LOG/api.log" 2>&1 &
  wait_port 50051 && wait_port 50053 && wait_port 50055
}

# Stale mobile scratch from a PRIOR run must not leak into THIS run's ingest: one
# run = one ingest. The per-run ingested copies (reports/<runId>/appium.json) are the
# durable record and are untouched; only the top-level scratch is cleared.
rm -f reports/android.json reports/ios.json

# ---------------- Phase B: Web Desktop (functional) ----------------
say "PHASE B — web desktop: starting stack"
if start_web_stack desktop false; then
  say "PHASE B — stack up; running cucumber @desktop"
  PLATFORM=web VIEWPORT=desktop DRIVER=playwright HEADLESS=true PLUGIN_PIXELMATCH=false \
    "$CUKE" --tags "@desktop" --format json:reports/playwright-desktop.json --format progress > "$LOG/phaseB.log" 2>&1
  say "PHASE B — cucumber exit=$? ($(grep -aoE '[0-9]+ scenarios \([^)]*\)' "$LOG/phaseB.log" | tail -1))"
else
  say "PHASE B — STACK FAILED to come up (see proxy/playwright/api logs)"
fi
teardown "50051,50052,50055,50056"

# ---------------- Phase C: Web Responsive (functional) ----------------
say "PHASE C — web responsive: starting stack"
if start_web_stack responsive false; then
  say "PHASE C — stack up; running cucumber @responsive"
  PLATFORM=web VIEWPORT=responsive DRIVER=playwright HEADLESS=true PLUGIN_PIXELMATCH=false \
    "$CUKE" --tags "@responsive" --format json:reports/playwright-responsive.json --format progress > "$LOG/phaseC.log" 2>&1
  say "PHASE C — cucumber exit=$? ($(grep -aoE '[0-9]+ scenarios \([^)]*\)' "$LOG/phaseC.log" | tail -1))"
else
  say "PHASE C — STACK FAILED to come up"
fi
teardown "50051,50052,50055,50056"

# ---------------- Phase D: Visual Desktop (regen = green by construction) ----------------
say "PHASE D — visual desktop: starting stack (pixelmatch on)"
if start_web_stack desktop true; then
  say "PHASE D — stack up; running visual-regen desktop"
  PLATFORM=web VIEWPORT=desktop DRIVER=playwright HEADLESS=true \
    node scripts/visual-regen.js desktop > "$LOG/phaseD.log" 2>&1
  say "PHASE D — visual-regen exit=$? ($(grep -aoE '[0-9]+ scenarios \([^)]*\)' "$LOG/phaseD.log" | tail -1))"
else
  say "PHASE D — STACK FAILED to come up"
fi
teardown "50051,50052,50055,50056"

# ---------------- Phase E: Visual Responsive ----------------
say "PHASE E — visual responsive: starting stack (pixelmatch on)"
if start_web_stack responsive true; then
  say "PHASE E — stack up; running visual-regen responsive"
  PLATFORM=web VIEWPORT=responsive DRIVER=playwright HEADLESS=true \
    node scripts/visual-regen.js responsive > "$LOG/phaseE.log" 2>&1
  say "PHASE E — visual-regen exit=$? ($(grep -aoE '[0-9]+ scenarios \([^)]*\)' "$LOG/phaseE.log" | tail -1))"
else
  say "PHASE E — STACK FAILED to come up"
fi
teardown "50051,50052,50055,50056"

# ---------------- Phase F: Gatling (smoke, both simulations — standalone, no proxy) ----------------
say "PHASE F — gatling smoke: checkout-load"
PERF_PROFILE=smoke pnpm perf:smoke > "$LOG/phaseF-checkout.log" 2>&1
say "PHASE F — checkout-load exit=$?"
say "PHASE F — gatling smoke: invalid-login-load"
PERF_PROFILE=smoke pnpm perf:login-invalid:smoke > "$LOG/phaseF-login.log" 2>&1
say "PHASE F — invalid-login-load exit=$?"

# ---------------- Phase G: Android (Appium) — conditional on a connected device ----------------
# Runs LAST: a single reused Appium session over @android is ~60 min on a physical device,
# so web/visual/gatling land first. Auto-skips when there's no adb device or no Appium daemon
# on :4723, so this orchestrator still runs end-to-end on a dev box without a phone. The daemon
# (port 4723) is started externally (`appium`); we only require it to be reachable. Continues
# through scenario failures by design (contract-drift is captured, not fatal); retry:1 absorbs
# cold-starts. Produces reports/android.json, which the INGEST step below turns into the
# (android-only, empty-iOS) Appium card.
say "PHASE G — android: pre-flight (adb device + Appium daemon :4723)"
if ! command -v adb >/dev/null 2>&1; then
  say "PHASE G — SKIP: adb not on PATH"
elif [ -z "$(adb devices | awk 'NR>1 && $2=="device"{print $1}')" ]; then
  say "PHASE G — SKIP: no adb device in 'device' state (connect a phone or start an emulator)"
elif ! node -e "require('net').connect(4723,'127.0.0.1').on('connect',function(){process.exit(0)}).on('error',function(){process.exit(1)})" 2>/dev/null; then
  say "PHASE G — SKIP: Appium daemon not reachable on :4723 (start it with \`appium\`)"
else
  ANDROID_DEV="$(adb devices | awk 'NR>1 && $2=="device"{print $1; exit}')"
  say "PHASE G — device $ANDROID_DEV + daemon up; starting android stack"
  if start_android_stack; then
    say "PHASE G — stack up; running cucumber @android (single Appium session, ~60min)"
    PLATFORM=android DRIVER=appium PLUGIN_APPIUM=true PLUGIN_API=true \
      "$CUKE" --tags "@android" --format json:reports/android.json --format progress > "$LOG/phaseG.log" 2>&1
    say "PHASE G — cucumber exit=$? ($(grep -aoE '[0-9]+ scenarios \([^)]*\)' "$LOG/phaseG.log" | tail -1))"
  else
    say "PHASE G — STACK FAILED to come up (see proxy/appium-plugin logs)"
  fi
  teardown "50051,50053,50055"
fi

# ---------------- Ingest ----------------
# No merge needed: the dashboard ingest (ingest-run.ts) now reads
# reports/playwright-<viewport>.json directly as viewport blocks and they take
# precedence over a flat reports/playwright.json. Remove any stale flat file so
# the per-viewport files are used unambiguously.
rm -f reports/playwright.json

say "INGEST — dashboard ingest as run-id $RUN_ID"
PROJECT="AHM" pnpm dashboard:ingest --run-id "$RUN_ID" > "$LOG/ingest.log" 2>&1
say "INGEST — exit=$?"
tail -12 "$LOG/ingest.log" | tee -a "$SUMMARY"

say "DONE — run-id: $RUN_ID"
