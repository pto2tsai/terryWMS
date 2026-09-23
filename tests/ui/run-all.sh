#!/bin/bash
# 依序執行所有畫面走查流程（需先有 Firestore/Auth 模擬器：npm run ui 會自動啟動）
cd "$(dirname "$0")"
fail=0; pass=0
for f in flow0-slow-login flow1-inbound flow1b-orders flow1c-external flow2-container flow3-wave flow4-rm flow5-transfer flow6-palletchange flow7-dispatch flow8-external flow9-edit flow10-stocktake flow11-xss flow12-mobile-camera flow13-mobile-ops flow14-acceptance; do
  echo "===== $f ====="
  out=$(timeout 300 node $f.mjs 2>&1)
  echo "$out" | grep -E "^(✔|✘)"
  p=$(echo "$out" | grep -c "^✔"); x=$(echo "$out" | grep -c "^✘")
  if [ "$p" -eq 0 ]; then echo "$out" | tail -5; x=$((x+1)); fi
  pass=$((pass+p)); fail=$((fail+x))
done
echo "UI 走查：pass $pass fail $fail"
[ "$fail" -eq 0 ]
