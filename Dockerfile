FROM node:20-alpine

WORKDIR /app

# Cài dependencies trước (tận dụng layer cache)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source
COPY src ./src
COPY public ./public

EXPOSE 3083

CMD ["node", "src/server.js"]
