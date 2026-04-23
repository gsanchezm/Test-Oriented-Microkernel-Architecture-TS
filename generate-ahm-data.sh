#!/bin/bash
# =============================================================================
# AHM Thesis - Stochastic Data Generator
# Queues N executions of the DAG Helix to generate Markov Chain telemetry
# =============================================================================

set -euo pipefail

CYCLES="${CYCLES:-50}"
PLATFORM="${PLATFORM:-android}" # Options: all, web, android, ios, perf
REF="${REF:-main}"
WORKFLOW="${WORKFLOW:-AHM — Execution Helix}"
ANDROID_API_LEVEL="${ANDROID_API_LEVEL:-33}"
PERF_PROFILE="${PERF_PROFILE:-smoke}"
SLEEP_SECONDS="${SLEEP_SECONDS:-5}"

latest_dispatch_run_id() {
  gh run list \
    --workflow "$WORKFLOW" \
    --branch "$REF" \
    --event workflow_dispatch \
    --limit 1 \
    --json databaseId \
    --jq '.[0].databaseId // 0' 2>/dev/null || echo 0
}

dispatch_workflow() {
  local before_run_id dispatch_output status after_run_id

  before_run_id="$(latest_dispatch_run_id)"

  if dispatch_output="$(gh "${args[@]}" 2>&1)"; then
    [[ -n "$dispatch_output" ]] && echo "$dispatch_output"
    return 0
  fi

  status=$?
  [[ -n "$dispatch_output" ]] && echo "$dispatch_output" >&2

  if [[ "$dispatch_output" == *"HTTP 500: Failed to run workflow dispatch"* ]]; then
    sleep 3
    after_run_id="$(latest_dispatch_run_id)"

    if [[ "$after_run_id" != "0" && "$after_run_id" != "$before_run_id" ]]; then
      echo "GitHub returned HTTP 500, but workflow run $after_run_id was queued."
      return 0
    fi
  fi

  return $status
}

echo "Initiating AHM Data Generation..."
echo "Target Platform: $PLATFORM"
echo "Git Ref: $REF"
echo "Requested Cycles: $CYCLES"
if [[ "$PLATFORM" == "android" || "$PLATFORM" == "all" ]]; then
  echo "Android API Level: $ANDROID_API_LEVEL"
fi
echo "------------------------------------------------"

for ((i=1; i<=CYCLES; i++))
do
  echo "Queuing Execution Helix #$i..."

  args=(
    workflow
    run
    "$WORKFLOW"
    --ref "$REF"
    -f "platform=$PLATFORM"
  )

  if [[ "$PLATFORM" == "android" || "$PLATFORM" == "all" ]]; then
    args+=(-f "android_api_level=$ANDROID_API_LEVEL")
  fi

  if [[ "$PLATFORM" == "perf" || "$PLATFORM" == "all" ]]; then
    args+=(-f "perf_profile=$PERF_PROFILE")
  fi

  # Trigger the GitHub Action via API.
  dispatch_workflow
  
  # 5-second buffer to prevent hitting GitHub's API rate limits
  sleep "$SLEEP_SECONDS"
done

echo "------------------------------------------------"
echo "Successfully queued $CYCLES cycles to the DAG Hypervisor!"
echo "Monitor progress at: https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner)/actions"
