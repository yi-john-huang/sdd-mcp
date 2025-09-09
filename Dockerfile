# Multi-stage Docker build for MCP SDD Server with distroless security

# Build stage - using Alpine for smaller build environment
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including dev dependencies for building)
RUN npm ci

# Copy source code
COPY src/ ./src/

# Build the application
RUN npm run build

# Create necessary directories for runtime
RUN mkdir -p ./plugins ./templates ./data

# Dependencies stage - install production dependencies in regular image
# (distroless doesn't have package managers, so we prepare dependencies here)
FROM node:18-alpine AS deps

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Production stage - Google's distroless image for maximum security
# - Contains only Node.js runtime and essential libraries
# - No shell, package managers, or unnecessary binaries
# - Minimal attack surface and reduced CVE exposure
FROM gcr.io/distroless/nodejs18-debian11 AS production

WORKDIR /app

# Copy package files and node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package*.json ./

# Copy built application and directories from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/plugins ./plugins
COPY --from=builder /app/templates ./templates
COPY --from=builder /app/data ./data

# Expose port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV LOG_LEVEL=info
ENV PLUGIN_DIR=/app/plugins
ENV TEMPLATE_DIR=/app/templates
ENV DATA_DIR=/app/data

# Start the application (distroless runs as non-root user by default)
CMD ["dist/index.js"]