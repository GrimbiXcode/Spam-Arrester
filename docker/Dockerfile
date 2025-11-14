FROM --platform=linux/amd64 node:20-slim

# Install build dependencies for native modules (tdl requires them)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Set up app directory
WORKDIR /app

# Copy package files
COPY agent/package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY agent/ ./
COPY config/ ./config/

# Build TypeScript
RUN npm run build

# Create directories for TDLib
RUN mkdir -p tdlib-data tdlib-files logs

# Run as non-root user
RUN groupadd -g 1001 appuser && \
    useradd -u 1001 -g appuser -m -s /bin/bash appuser && \
    chown -R appuser:appuser /app

USER appuser

# Expose auth server port
EXPOSE 3100

CMD ["node", "dist/index.js"]
