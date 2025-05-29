FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Expose RTMP and HTTP ports
EXPOSE 1935 8000

# Start the application
CMD ["npm", "start"]