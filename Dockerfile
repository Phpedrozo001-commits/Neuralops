FROM node:22-alpine

WORKDIR /app

# Copiar package.json e package-lock.json
COPY package*.json ./

# Instalar dependências
RUN npm ci --only=production

# Copiar todos os arquivos da aplicação
COPY . .

# Criar diretórios necessários
RUN mkdir -p logs data

# NÃO hardcodar EXPOSE - Railway injeta PORT dinamicamente
# O app deve usar process.env.PORT

# Health check usando PORT dinâmico
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})" || exit 1

  CMD ["node", "index.js"]
  
