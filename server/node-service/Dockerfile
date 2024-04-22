# Using Ubuntu as the base image
FROM ubuntu:jammy as lowcoder-ce-node-service

LABEL maintainer="lowcoder"

# Install prerequisites including build tools and Python
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y \
    curl \
    ca-certificates \
    gnupg \
    gosu \
    build-essential \
    python3 \
    && ln -s /usr/bin/python3 /usr/bin/python \
    && rm -rf /var/lib/apt/lists/*

# Add Node.js repository
RUN curl -fsSL https://deb.nodesource.com/setup_21.x | bash -

# Install Node.js and Yarn
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs \
    && npm install -g yarn \
    && rm -rf /var/lib/apt/lists/*

# Setup lowcoder user
RUN groupadd --system --gid 9001 lowcoder \
    && useradd --system --gid lowcoder --uid 9001 --shell /bin/bash --create-home lowcoder

# Set work directory
WORKDIR /lowcoder/node-service

# Copy your Node.js application
COPY . .

# Install Node modules
RUN yarn install --frozen-lockfile

# Optionally install peer dependencies if necessary
# RUN yarn add react react-dom

# Build the application
RUN yarn build

# Adjust permissions
RUN chown -R lowcoder:lowcoder /lowcoder/node-service

# Setup exposed port
EXPOSE 6060

# Entrypoint to manage local user IDs
COPY node-service/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

CMD ["/entrypoint.sh"]
