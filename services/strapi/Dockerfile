FROM node:22-slim

WORKDIR /app

# Install Strapi system dependencies
RUN apt-get update && apt-get install -y libvips-dev && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps

COPY . .

RUN npm run build

EXPOSE 1337

# Run as non-root (Semgrep: missing-user)
USER node

CMD ["npm", "run", "start"]
