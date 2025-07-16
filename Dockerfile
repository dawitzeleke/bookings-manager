# Use Node.js base image
FROM node:18

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Expose port (must match the one your Express app listens to)
EXPOSE 3000

# Start the server
CMD ["npx", "ts-node", "src/app.ts"]
