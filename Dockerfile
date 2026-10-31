# Use Node.js base image
FROM node:20-alpine

# Set working directory inside container
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install ONLY production dependencies securely and cleanly
RUN npm ci --only=production

# Copy the rest of the backend code
COPY . .

# Change ownership of files to the non-root 'node' user
RUN chown -R node:node /app

# Switch to the non-root user for security
USER node

# Expose backend port
EXPOSE 4000

# Start the server
CMD ["npm", "start"]
