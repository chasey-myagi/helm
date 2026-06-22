#!/usr/bin/env bash
# Reproducible live-demo driver for helm (luban: showcase must be reproducible).
# Run it; a board opens and animates through a fake "migrate auth → JWT" task.
# Screen-record that board to produce a showcase GIF, or just watch helm work.
# It builds nothing real — pure illustration.
#
#   bash examples/record-demo.sh
#
# Then edit the GOAL in the page and run the printed `helm goal` command to see
# the steering round-trip. Stop with the printed `helm ... stop` command.
set -euo pipefail

HELM="$(cd "$(dirname "$0")/.." && pwd)/dist/helm.mjs"
DIR="$(mktemp -d)/.helm/demo"
mkdir -p "$DIR"
h() { node "$HELM" --dir "$DIR" "$@" >/dev/null; }

node "$HELM" --dir "$DIR" init \
  --title "Demo · 迁移 auth → JWT" \
  --subtitle "把会话中间件从 cookie 换成 JWT" \
  --agent "Claude Code" --model claude-opus-4-8 \
  --goal "把 auth 迁到无状态 JWT，不丢在线会话（在板上改这行试试操舵）"
sleep 1.2

h plan "备份 users 表" "接入 RS256 签发/校验" "迁移现有会话" "灰度切流 + 双读兼容" "回归测试"
sleep 1

for i in 1 2 3; do
  h step "$i"; sleep 1.3
  h event ok "step $i 完成"; sleep 1.1
done

h decide "签名用 RS256，多服务只持公钥校验"
h decide "默认先迁 staging，prod 等你确认" --assumption
sleep 1
h ask "staging 验证已过，放行 prod 数据库迁移吗？"
h status "等你放行 prod 迁移" --state blocked --pct 70

echo
echo "▶ Demo board is live (a browser tab opened)."
echo "  Edit the GOAL in the page, then read it back as the agent would:"
echo "      node $HELM --dir $DIR goal"
echo "  Stop the board when done:"
echo "      node $HELM --dir $DIR stop"
