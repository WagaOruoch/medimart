#!/usr/bin/env bash
set -e
. venv/bin/activate
echo "MediMart: http://127.0.0.1:${PORT:-5000}"
python app.py
