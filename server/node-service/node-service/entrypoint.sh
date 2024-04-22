#!/bin/bash

set -e

# Update ID of lowcoder user and group if required
USER_ID=${LOWCODER_PUID:-9001}
GROUP_ID=${LOWCODER_PGID:-9001}

usermod --uid ${USER_ID} lowcoder
groupmod --gid ${GROUP_ID} lowcoder
chown -R ${USER_ID}:${GROUP_ID} /lowcoder/node-service

# Environment variable for port
export PORT=6060

# Start application
echo "Starting application on port $PORT..."
exec gosu ${USER_ID}:${GROUP_ID} yarn start
