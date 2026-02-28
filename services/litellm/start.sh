#!/bin/sh
exec litellm --config /app/config.yaml --port "${PORT:-4000}" --num_workers 2
