# Multi-stage Dockerfile for Cram ($0 Free Deployment on Render, Fly.io, or Railway)
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json tsconfig.json ./

# Install all dependencies
RUN npm ci

# Copy source code and database assets
COPY src ./src

# Build TypeScript to dist
RUN npm run build

# Runtime Stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/cram.db

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled code from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/db/schema.sql ./dist/db/schema.sql
COPY src/db/schema.sql ./src/db/schema.sql

# Copy static frontend assets
COPY web ./web

# Create data directory for SQLite database
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "dist/server.js"]
