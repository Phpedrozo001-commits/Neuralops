# 🔐 NeuralOps - Environment Variables Setup Guide

## 📋 Overview

Este guia mostra como configurar todas as variáveis de ambiente necessárias para que seu backend NeuralOps funcione 100% no Vercel.

---

## 🚀 Passo 1: Acessar Vercel Dashboard

1. Vá para: https://vercel.com/neural-ops-projects/neuralops
2. Clique em **"Settings"** (engrenagem no topo)
3. Clique em **"Environment Variables"** na barra lateral esquerda

---

## 🗄️ Passo 2: Configurar Banco de Dados (Supabase)

### O que você precisa:
- **DATABASE_URL**: Connection string do Supabase

### Como pegar do Supabase:

1. Vá para: https://app.supabase.com
2. Faça login com suas credenciais
3. Selecione seu projeto "neuralops"
4. Clique em **"Settings"** (engrenagem)
5. Clique em **"Database"**
6. Copie a **"Connection string"** (escolha **Node.js**)
7. A string será algo como:
   ```
   postgresql://postgres:[PASSWORD]@db.[REGION].supabase.co:5432/postgres
   ```

### No Vercel:
1. Cole em **"Name"**: `DATABASE_URL`
2. Cole a connection string em **"Value"**
3. Selecione todos os ambientes: ✅ Production, ✅ Preview, ✅ Development
4. Clique em **"Save"**

---

## 🔑 Passo 3: Configurar JWT Secret

### O que é:
- Uma chave secreta para assinar tokens de autenticação

### Como gerar:
Você pode usar qualquer string aleatória. Recomendamos usar uma ferramenta online:
- https://generate-random.org/api-key-generator
- Ou use este comando no terminal:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

### No Vercel:
1. Cole em **"Name"**: `JWT_SECRET`
2. Cole a chave gerada em **"Value"**
3. Selecione todos os ambientes
4. Clique em **"Save"**

---

## 🤖 Passo 4: Configurar OpenAI API (Opcional)

Se você quer usar a IA dos agentes com OpenAI:

### Como pegar:
1. Vá para: https://platform.openai.com/api-keys
2. Faça login ou crie uma conta
3. Clique em **"Create new secret key"**
4. Copie a chave

### No Vercel:
1. Cole em **"Name"**: `OPENAI_API_KEY`
2. Cole a chave em **"Value"**
3. Selecione todos os ambientes
4. Clique em **"Save"**

---

## 📊 Passo 5: Variáveis Opcionais

Se você tiver as seguintes chaves do Manus, adicione também:

| Nome | Valor | Obrigatório |
|------|-------|------------|
| `BUILT_IN_FORGE_API_KEY` | Sua chave Manus | ❌ Não |
| `BUILT_IN_FORGE_API_URL` | URL da API Manus | ❌ Não |
| `VITE_FRONTEND_FORGE_API_KEY` | Chave frontend Manus | ❌ Não |
| `VITE_FRONTEND_FORGE_API_URL` | URL frontend Manus | ❌ Não |

---

## ✅ Checklist Final

Depois de adicionar todas as variáveis:

- [ ] `DATABASE_URL` - Adicionada ✅
- [ ] `JWT_SECRET` - Adicionada ✅
- [ ] `OPENAI_API_KEY` - Adicionada (opcional)
- [ ] Todos os ambientes selecionados (Production, Preview, Development)

---

## 🔄 Passo 6: Redeploy no Vercel

Depois de adicionar as variáveis:

1. Vá para: https://vercel.com/neural-ops-projects/neuralops
2. Clique em **"Deployments"**
3. Clique no deployment mais recente
4. Clique em **"Redeploy"** (botão no topo)
5. Aguarde a compilação terminar

---

## 🧪 Passo 7: Testar a Conexão

Depois do redeploy:

1. Acesse: https://neuralops-sage.vercel.app/api/health
2. Você deve ver uma resposta JSON:
   ```json
   {
     "status": "ok",
     "timestamp": "2026-05-12T10:00:00Z",
     "database": "connected"
   }
   ```

Se receber erro, verifique:
- ✅ DATABASE_URL está correta
- ✅ Supabase está online
- ✅ Firewall permite conexões do Vercel

---

## 🆘 Troubleshooting

### Erro: "Database connection failed"
- Verifique se a `DATABASE_URL` está correta
- Confirme que o Supabase está rodando
- Teste a conexão localmente: `psql <DATABASE_URL>`

### Erro: "Invalid JWT Secret"
- Gere uma nova chave aleatória
- Certifique-se de que tem pelo menos 32 caracteres

### Erro: "OpenAI API key invalid"
- Verifique a chave em: https://platform.openai.com/api-keys
- Confirme que a conta tem créditos disponíveis

---

## 📞 Suporte

Se tiver dúvidas:
1. Verifique os logs do Vercel: https://vercel.com/neural-ops-projects/neuralops/logs
2. Teste localmente com um arquivo `.env`
3. Contacte o suporte do Supabase ou Vercel

---

**Tudo pronto! Seu backend está 100% configurado e pronto para produção.** 🚀
