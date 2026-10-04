FROM node:20-alpine

WORKDIR /app

# Install dependencies first so this layer is cached until package files change
COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src

# The official image ships an unprivileged "node" user
USER node

ENV PORT=3000
EXPOSE 3000

CMD ["node", "src/server.js"]
