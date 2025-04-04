# Use an official Node runtime as a parent image
FROM node:18-alpine

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json (if available)
COPY app/package*.json ./app/

# Install app dependencies
RUN cd app && npm install --omit=dev

# Copy the rest of the app code
COPY app/ ./app/

# Copy data directory structure (optional, but good for initial setup if needed)
# The actual data will be mounted via volume, but this ensures dirs exist if volume isn't mounted initially

RUN mkdir -p /app/data/ && mkdir -p /app/data/namespaces && mkdir -p /app/data/uploads

# Make port 3000 available to the world outside this container
EXPOSE 3000

# Define environment variable (optional)
# ENV NODE_ENV production

# Run the app when the container launches
CMD ["node", "app/src/server.js"]