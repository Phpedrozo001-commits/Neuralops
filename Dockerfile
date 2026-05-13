FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN mkdir -p logs data

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})" || exit 1

CMD ["node", "index.js"]