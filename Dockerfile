# Use official Node.js LTS image
FROM node:18

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to install dependencies
COPY package*.json ./

# Install dependencies (shared for frontend & backend)
RUN npm install

# Copy the entire project into the container
COPY . .

# Default command (will be overridden by docker-compose.yml)
CMD ["npm", "start"]
