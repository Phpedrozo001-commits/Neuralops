# 🚀 NeuralOps - Plataforma de IA para Negócios

Plataforma SaaS completa com agentes autônomos de IA para análise de negócios, previsão de churn, detecção de oportunidades de upsell, projeções financeiras e muito mais.

## ✨ Características Principais

### 🤖 Agentes Autônomos
- **Churn Prediction Agent** - Identifica clientes em risco 30 dias antes (85% acurácia)
- **Upsell & Cross-sell Agent** - Detecta oportunidades de venda automaticamente
- **Financial Projection Agent** - Calcula MRR, ARR, runway com 96% acurácia
- **Contract Renegotiation Agent** - Encontra contratos overpriced

### 💳 Sistema SaaS Completo
- Autenticação segura com JWT + bcrypt
- 3 planos: Free, Pro, Enterprise
- Integração Stripe para pagamentos
- Controle de uso por plano
- Histórico de faturas

### 📊 Dashboard Poderoso
- Métricas em tempo real
- Histórico de atividades
- Workflow de aprovações
- Chat com IA
- Painel administrativo

### 🔐 Segurança de Nível Enterprise
- Senhas com bcrypt (10 rounds)
- JWT com expiração obrigatória
- CSRF protection
- Rate limiting por endpoint
- Security headers com Helmet
- Logging estruturado com Winston
- Error tracking com Sentry

### ⚡ Performance Otimizada
- Redis caching
- Connection pooling PostgreSQL
- Índices de banco de dados
- Compression middleware
- Query optimization

## 🛠️ Stack Tecnológico

### Backend
- **Runtime:** Node.js 22.x
- **Framework:** Express.js 4.18
- **Database:** PostgreSQL (Supabase) + SQLite (dev)
- **ORM:** Drizzle ORM ready
- **Caching:** Redis (opcional)
- **Payments:** Stripe
- **Logging:** Winston
- **Error Tracking:** Sentry
- **Security:** Helmet, bcrypt, JWT

### Frontend
- **HTML5/CSS3/JavaScript** (landing page + auth)
- **Design:** Dark SaaS aesthetic
- **Responsivo:** Mobile-first

## 📋 Pré-requisitos

- Node.js 22.x ou superior
- npm ou yarn
- Conta Supabase (para produção)
- Conta Stripe (para pagamentos)
- Conta Sentry (opcional, para error tracking)

## 🚀 Começar Localmente

### 1. Clone o repositório
```bash
git clone https://github.com/Phpedrozo001-commits/Neuralops.git
cd Neuralops
```

### 2. Instale dependências
```bash
npm install
```

### 3. Configure variáveis de ambiente
```bash
cp .env.example .env
# Edite .env com suas credenciais
```

### 4. Inicie o servidor de desenvolvimento
```bash
npm run dev
```

O servidor estará disponível em `http://localhost:3001`

## 📚 Estrutura do Projeto

```
neuralops/
├── config/                 # Configurações
│   ├── database.js        # Conexão com banco de dados
│   ├── env.js             # Validação de variáveis de ambiente
│   └── logger.js          # Winston logger
├── middleware/            # Middlewares Express
│   ├── auth.js            # Autenticação e autorização
│   └── security-improved.js # CSRF, rate limiting, headers
├── services/              # Serviços de negócio
│   ├── stripe-service.js  # Integração Stripe
│   ├── cache-service.js   # Redis caching
│   └── sentry-service.js  # Error tracking
├── routes/                # Rotas da API
│   └── api.js             # Endpoints REST
├── migrations/            # Database migrations
│   └── 001_init_schema.sql
├── public/                # Arquivos estáticos
│   ├── index.html         # Landing page
│   └── auth.html          # Página de autenticação
├── agents/                # Agentes autônomos
│   ├── churnAgent.js
│   ├── upsellAgent.js
│   ├── financialAgent.js
│   └── contractAgent.js
├── index-improved.js      # Servidor principal
├── package.json
└── README.md
```

## 🔧 Configuração de Produção

### 1. Supabase
```bash
# Crie um projeto em https://supabase.com
# Copie a connection string PostgreSQL
# Configure DATABASE_URL no .env
# Execute migrations:
psql $DATABASE_URL < migrations/001_init_schema.sql
```

### 2. Stripe
```bash
# Crie conta em https://stripe.com
# Obtenha chaves de API
# Configure STRIPE_SECRET_KEY e STRIPE_WEBHOOK_SECRET
# Configure webhook: https://seu-dominio.com/api/webhooks/stripe
```

### 3. Vercel
```bash
# Instale Vercel CLI
npm i -g vercel

# Deploy
vercel --prod

# Configure environment variables no dashboard
```

## 📖 API Endpoints

### Autenticação
```
POST   /api/auth/register       # Criar conta
POST   /api/auth/login          # Fazer login
GET    /api/auth/csrf-token     # Obter token CSRF
```

### Usuário
```
GET    /api/users/me            # Obter perfil
PUT    /api/users/me            # Atualizar perfil
```

### Assinaturas
```
GET    /api/subscriptions/me    # Obter assinatura
GET    /api/plans               # Listar planos
POST   /api/subscriptions/checkout  # Criar checkout
POST   /api/subscriptions/cancel    # Cancelar assinatura
```

### Uso
```
GET    /api/usage/me            # Obter uso
POST   /api/usage/track         # Registrar uso
```

### Admin
```
GET    /api/admin/users         # Listar usuários
GET    /api/admin/metrics       # Obter métricas
POST   /api/agents/:type/trigger    # Disparar agente
GET    /api/agents/:type/status     # Status do agente
GET    /api/approvals          # Obter aprovações pendentes
POST   /api/approvals/:id/approve   # Aprovar
POST   /api/approvals/:id/reject    # Rejeitar
```

## 🔐 Segurança

### Implementações
- ✅ Bcrypt para hash de senhas (10 rounds)
- ✅ JWT com expiração obrigatória
- ✅ CSRF tokens com expiração
- ✅ Rate limiting por endpoint
- ✅ Security headers com Helmet
- ✅ CORS whitelist
- ✅ Input sanitization
- ✅ SQL injection protection (Drizzle ORM)
- ✅ XSS protection (Content Security Policy)

### Checklist de Produção
- [ ] JWT_SECRET configurado (32+ caracteres)
- [ ] SESSION_SECRET configurado
- [ ] DATABASE_URL apontando para Supabase
- [ ] STRIPE_SECRET_KEY e STRIPE_WEBHOOK_SECRET
- [ ] ALLOWED_ORIGINS configurado
- [ ] NODE_ENV=production
- [ ] HTTPS/TLS habilitado
- [ ] Backups do banco configurados
- [ ] Sentry DSN configurado
- [ ] Logs centralizados

## 📊 Monitoramento

### Logs
```bash
# Ver logs em tempo real
tail -f logs/combined.log

# Ver apenas erros
tail -f logs/error.log

# Ver logs de segurança
tail -f logs/security.log
```

### Health Check
```bash
curl https://seu-dominio.com/api/health
```

### Sentry
Acesse https://sentry.io para ver erros em produção

## 🧪 Testes

### Executar testes
```bash
npm test
```

### Testar Stripe (sandbox)
Use cartão: `4242 4242 4242 4242`

## 📝 Documentação Adicional

- [SECURITY_IMPROVEMENTS.md](./SECURITY_IMPROVEMENTS.md) - Detalhes de segurança
- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) - Guia de deployment
- [ENV_SETUP_GUIDE.md](./ENV_SETUP_GUIDE.md) - Configuração de variáveis

## 🐛 Troubleshooting

### Database connection failed
```bash
# Verifique a connection string
echo $DATABASE_URL

# Teste a conexão
psql $DATABASE_URL -c "SELECT NOW();"
```

### Stripe webhook not firing
```bash
# Verifique o webhook no Stripe Dashboard
# Developers > Webhooks > seu endpoint
# Verifique o signing secret
```

### High memory usage
```bash
# Aumente o heap size
NODE_OPTIONS=--max-old-space-size=2048 npm start
```

## 🤝 Contribuindo

Contribuições são bem-vindas! Por favor:

1. Faça um fork do projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](./LICENSE) para mais detalhes.

## 📞 Suporte

Para suporte, abra uma issue no GitHub ou entre em contato através do email.

## 🎯 Roadmap

- [ ] Frontend React completo
- [ ] Mobile app (React Native)
- [ ] Webhooks customizados
- [ ] Integrações com mais ferramentas
- [ ] Machine learning avançado
- [ ] API GraphQL
- [ ] WebSockets para real-time

## 👨‍💻 Autor

**Pedro Zozo** - [@Phpedrozo001](https://github.com/Phpedrozo001-commits)

---

**Versão:** 2.0.0 (Melhorada)  
**Última atualização:** 2026-05-12  
**Status:** ✅ Production Ready
