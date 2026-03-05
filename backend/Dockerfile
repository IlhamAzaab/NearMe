# Backend Dockerfile
FROM node:22-alpine

# Set working directory
WORKDIR /app/backend

# Set production environment
ENV NODE_ENV=production

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies (ci = clean install for reproducible builds)
RUN npm ci --omit=dev

# Copy application code
COPY . .

# Create non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# Expose port
EXPOSE 5000

# Start the application
CMD ["node", "index.js"]
