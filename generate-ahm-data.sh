#!/bin/bash
# =============================================================================
# AHM Thesis - Stochastic Data Generator
# Queues N executions of the DAG Helix to generate Markov Chain telemetry
# =============================================================================

CYCLES=25
PLATFORM="all" # Options: all, web, android, ios, perf

echo "Initiating AHM Data Generation..."
echo "Target Platform: $PLATFORM"
echo "Requested Cycles: $CYCLES"
echo "------------------------------------------------"

for ((i=1; i<=CYCLES; i++))
do
  echo "Queuing Execution Helix #$i..."
  
  # Trigger the GitHub Action via API
  gh workflow run ahm-execution-helix.yml -f platform=$PLATFORM
  
  # 5-second buffer to prevent hitting GitHub's API rate limits
  sleep 5 
done

echo "------------------------------------------------"
echo "Successfully queued $CYCLES cycles to the DAG Hypervisor!"
echo "Monitor progress at: https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner)/actions"