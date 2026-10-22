# syntax=docker/dockerfile:1

# The service has zero runtime dependencies, so there is no install stage:
# the image is the official slim Node runtime plus our source.
FROM node:24-alpine

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080

WORKDIR /app
COPY package.json ./
COPY src ./src

# Run as the unprivileged user that ships with the node image.
USER node

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/healthz || exit 1

# exec form so the Node process is PID 1 and receives SIGTERM directly,
# which triggers graceful shutdown.
CMD ["node", "src/index.js"]
