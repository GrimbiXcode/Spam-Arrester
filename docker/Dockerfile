FROM node:20-alpine

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
RUN addgroup -g 1001 -S appuser && \
    adduser -u 1001 -S appuser -G appuser && \
    chown -R appuser:appuser /app

USER appuser

CMD ["node", "dist/index.js"]
