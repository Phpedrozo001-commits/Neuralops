FROM node:24-alpine

WORKDIR /app

# Copiar package.json e package-lock.json
COPY package*.json ./

# Instalar dependências
RUN npm ci --only=production

# Copiar todos os arquivos da aplicação
COPY . .

# Criar diretórios necessários
RUN mkdir -p logs data

# Expor porta
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})" || exit 1

# Start com index.js completo
CMD ["node", "index.js"]
