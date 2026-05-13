#!/bin/bash
# Keep-alive script for Next.js dev server
# Restarts the server automatically if it dies

cd /home/z/my-project

while true; do
    # Check if next dev is already running
    if ! pgrep -f "next-server" > /dev/null 2>&1 && ! pgrep -f "next dev" > /dev/null 2>&1; then
        echo "[$(date)] Server not running, starting..."
        rm -f dev.log
        nohup bun run dev > dev.log 2>&1 &
        echo "[$(date)] Started with PID $!"
        sleep 10
    fi
    sleep 15
done
