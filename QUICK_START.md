# ⚡ Quick Start Guide

Get NeuralOps running in 5 minutes!

## 1️⃣ Install Dependencies

```bash
npm install
```

## 2️⃣ Start the Server

```bash
npm start
```

You should see:
```
╔════════════════════════════════════════╗
║   🤖 NeuralOps Backend Started         ║
║   Port: 3001                           ║
║   Database: SQLite                     ║
║   Scheduler: Active                    ║
╚════════════════════════════════════════╝
```

## 3️⃣ Test the API

Open another terminal:

```bash
# Health check
curl http://localhost:3001/api/health

# Get dashboard overview
curl http://localhost:3001/api/dashboard/overview

# Create a test customer
curl -X POST http://localhost:3001/api/customers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Company",
    "email": "test@company.com",
    "mrr": 5000,
    "engagement_score": 65
  }'

# Trigger churn agent
curl -X POST http://localhost:3001/api/churn/trigger

# Get churn risks
curl http://localhost:3001/api/churn/risks

# Chat with AI
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Show me churn risks"}'
```

## 4️⃣ Integrate with Frontend

Copy this into your HTML:

```html
<script>
const API_URL = 'http://localhost:3001';

// Get churn risks
fetch(`${API_URL}/api/churn/risks`)
  .then(r => r.json())
  .then(data => console.log('Churn risks:', data));

// Send chat message
fetch(`${API_URL}/api/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'Show me churn risks' })
})
.then(r => r.json())
.then(data => console.log('AI Response:', data.response));
</script>
```

## 5️⃣ Deploy to Vercel

```bash
npm install -g vercel
vercel
```

## 📊 What's Running

- ✅ **Churn Agent**: Every 15 minutes
- ✅ **Upsell Agent**: Every hour
- ✅ **Financial Agent**: Every 15 minutes
- ✅ **Contract Agent**: Every 6 hours
- ✅ **Approval System**: Ready for 1-click decisions
- ✅ **Chat Interface**: Natural language queries
- ✅ **REST API**: 40+ endpoints

## 🎯 Next Steps

1. Read [README.md](./README.md) for full documentation
2. Check [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md) for frontend examples
3. Customize thresholds in `.env`
4. Add your real data to the database
5. Deploy to production

## 🆘 Troubleshooting

### Port already in use
```bash
# Use different port
PORT=3002 npm start
```

### Database error
```bash
# Delete and recreate database
rm neuralops.db
npm start
```

### CORS errors
Update your frontend API_URL or check CORS configuration in `index.js`

---

**That's it! Your autonomous business intelligence system is running! 🚀**
