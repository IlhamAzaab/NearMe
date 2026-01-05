# Backend Dockerfile
FROM node:20-alpine

# Set working directory
WORKDIR /app/backend

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application code
COPY . .

# Expose port (adjust if your backend uses different port)
EXPOSE 5000

# Start the application
CMD ["node", "index.js"]
