FROM node:24-alpine

WORKDIR /app

# Copiar apenas os arquivos necessários
COPY public/ ./public/
COPY server-simple.js ./

# Criar diretórios necessários
RUN mkdir -p logs

# Expor porta
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})" || exit 1

# Start
CMD ["node", "server-simple.js"]
