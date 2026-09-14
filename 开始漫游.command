#!/bin/zsh
# 启动本地静态服务并在默认浏览器中打开游戏
cd -- "${0:A:h}"
PORT=8321
if ! lsof -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  nohup python3 dev_server.py $PORT >/dev/null 2>&1 &
  sleep 0.8
fi
open "http://127.0.0.1:$PORT/"
