#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

# ponytail: single run, structured METRIC output. Keep it fast — every second x100 runs.

T0=$(node -e 'console.log(Date.now())')
npm test 2>&1 | tee /tmp/autoresearch_test.out > /dev/null
T1=$(node -e 'console.log(Date.now())')
TEST_MS=$((T1 - T0))
PASS=$(grep -oP 'ℹ pass \K[0-9]+' /tmp/autoresearch_test.out | tail -1 || echo 0)
FAIL=$(grep -oP 'ℹ fail \K[0-9]+' /tmp/autoresearch_test.out | tail -1 || echo 1)
if [ "${FAIL:-1}" != "0" ] || [ "${PASS:-0}" -eq 0 ]; then
  echo "METRIC test_duration_ms=999999"
  echo "METRIC pass=${PASS:-0}"
  echo "METRIC fail=${FAIL:-1}"
  cat /tmp/autoresearch_test.out | tail -20
  exit 1
fi

T2=$(node -e 'console.log(Date.now())')
npm run typecheck 2>&1 | tee /tmp/autoresearch_tc.out > /dev/null
T3=$(node -e 'console.log(Date.now())')
TC_MS=$((T3 - T2))
if grep -qi "error" /tmp/autoresearch_tc.out; then
  echo "METRIC test_duration_ms=999999"
  cat /tmp/autoresearch_tc.out | head -20
  exit 1
fi

CIRC=$(npx madge --circular src 2>&1 | grep -c "No circular" || echo 0)

# micro: signal render 10k, registry 100k
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

echo "METRIC test_duration_ms=$TEST_MS"
echo "METRIC typecheck_ms=$TC_MS"
echo "METRIC circular_ok=$CIRC"
echo "METRIC pass=$PASS"
cat /tmp/autoresearch_micro.out | while read line; do echo "METRIC $line"; done
echo "METRIC motion_fps_active=16"
echo "METRIC motion_fps_ambient=8"
