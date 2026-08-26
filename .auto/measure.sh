#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

# ponytail: fast, noisy benchmark — median of 3 for stability is overkill for this slow suite, single run with timings
# Primary: test wall time. Secondary: typecheck, circular, micro-benchmarks.

START_TEST=$(date +%s%3N)
npm test 2>&1 | tail -5 > /tmp/autoresearch_test.out
END_TEST=$(date +%s%3N)
TEST_MS=$((END_TEST - START_TEST))
# parse pass count
PASS=$(grep -oP 'ℹ pass \K[0-9]+' /tmp/autoresearch_test.out || echo 0)
FAIL=$(grep -oP 'ℹ fail \K[0-9]+' /tmp/autoresearch_test.out || echo 1)
if [ "$FAIL" != "0" ]; then
  echo "METRIC test_duration_ms=999999"
  echo "METRIC pass=$PASS"
  echo "METRIC fail=$FAIL"
  exit 1
fi

START_TC=$(date +%s%3N)
npm run typecheck 2>&1 | grep -i error > /tmp/autoresearch_tc.out || true
END_TC=$(date +%s%3N)
TC_MS=$((END_TC - START_TC))
if grep -q "error" /tmp/autoresearch_tc.out; then
  echo "METRIC test_duration_ms=999999"
  exit 1
fi

CIRC=$(npx madge --circular src 2>&1 | grep -c "No circular" || echo 0)

# micro: signal render 10k calls, registry lookup 100k calls
node --input-type=module <<'NODE' > /tmp/autoresearch_micro.out 2>&1
import { renderActivity } from "./src/signal/render.ts";
import { getSettingDefinition } from "./src/config/settings-registry.ts";
import { createSignalRuntime } from "./src/signal/controller.ts";
import { getStructuralPreset } from "./src/config/structural-presets.ts";
const signal = createSignalRuntime(0);
signal.active = true; signal.tick = 5; signal.motionId = "ember-relay"; signal.activity = "streaming";
const spec = getStructuralPreset("lanternwake").signal;
const t0 = performance.now();
for (let i=0;i<10000;i++) renderActivity(signal, spec, false);
const t1 = performance.now();
const r0 = performance.now();
for (let i=0;i<100000;i++) getSettingDefinition("powerline.preset");
const r1 = performance.now();
console.log(`signal_render_us=${Math.round((t1-t0)/10000*1000)}`);
console.log(`registry_lookup_us=${Math.round((r1-r0)/100000*1000)}`);
NODE
cat /tmp/autoresearch_micro.out

# motion FPS from policy (static, not timed)
echo "METRIC test_duration_ms=$TEST_MS"
echo "METRIC typecheck_ms=$TC_MS"
echo "METRIC circular_ok=$CIRC"
echo "METRIC pass=$PASS"
cat /tmp/autoresearch_micro.out | while read line; do echo "METRIC $line"; done
echo "METRIC motion_fps_active=16"
echo "METRIC motion_fps_ambient=8"

