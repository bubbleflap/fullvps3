#!/bin/bash
trap 'kill $BACKEND_PID 2>/dev/null; exit' SIGTERM SIGINT EXIT

node server.js &
BACKEND_PID=$!

sleep 3

npx vite --host 0.0.0.0 --port 5000
