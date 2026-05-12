# 🔗 Frontend Integration Guide

This guide shows how to integrate the NeuralOps backend with your existing HTML/JavaScript frontend.

## 🚀 Quick Start

### 1. Backend URL Configuration

In your HTML/JavaScript, set the backend URL:

```javascript
const API_URL = 'http://localhost:3001'; // Development
// const API_URL = 'https://your-vercel-domain.vercel.app'; // Production
```

### 2. Core API Functions

Create a helper file `api.js`:

```javascript
const API_URL = 'http://localhost:3001';

// Churn Risks
async function getChurnRisks() {
  const res = await fetch(`${API_URL}/api/churn/risks`);
  return res.json();
}

async function triggerChurnAgent() {
  const res = await fetch(`${API_URL}/api/churn/trigger`, { method: 'POST' });
  return res.json();
}

// Upsell Opportunities
async function getUpsellOpportunities() {
  const res = await fetch(`${API_URL}/api/upsell/opportunities`);
  return res.json();
}

async function triggerUpsellAgent() {
  const res = await fetch(`${API_URL}/api/upsell/trigger`, { method: 'POST' });
  return res.json();
}

// Financial Data
async function getFinancialSnapshot() {
  const res = await fetch(`${API_URL}/api/financial/snapshot`);
  return res.json();
}

async function triggerFinancialAgent() {
  const res = await fetch(`${API_URL}/api/financial/trigger`, { method: 'POST' });
  return res.json();
}

// Contracts
async function getOverpricedContracts() {
  const res = await fetch(`${API_URL}/api/contracts/overpriced`);
  return res.json();
}

async function triggerContractAgent() {
  const res = await fetch(`${API_URL}/api/contracts/trigger`, { method: 'POST' });
  return res.json();
}

// Approvals
async function getPendingApprovals() {
  const res = await fetch(`${API_URL}/api/approvals/pending`);
  return res.json();
}

async function approveDecision(approvalId, approvedBy) {
  const res = await fetch(`${API_URL}/api/approvals/${approvalId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approvedBy })
  });
  return res.json();
}

async function rejectDecision(approvalId, rejectedBy, reason) {
  const res = await fetch(`${API_URL}/api/approvals/${approvalId}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rejectedBy, reason })
  });
  return res.json();
}

// Chat
async function sendChatMessage(message) {
  const res = await fetch(`${API_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message })
  });
  return res.json();
}

// Activity Logs
async function getActivityLogs() {
  const res = await fetch(`${API_URL}/api/activity/logs`);
  return res.json();
}

// Dashboard
async function getDashboardOverview() {
  const res = await fetch(`${API_URL}/api/dashboard/overview`);
  return res.json();
}

export {
  getChurnRisks,
  triggerChurnAgent,
  getUpsellOpportunities,
  triggerUpsellAgent,
  getFinancialSnapshot,
  triggerFinancialAgent,
  getOverpricedContracts,
  triggerContractAgent,
  getPendingApprovals,
  approveDecision,
  rejectDecision,
  sendChatMessage,
  getActivityLogs,
  getDashboardOverview
};
```

## 📊 Dashboard Integration

### Display Churn Risks

```html
<div id="churn-risks">
  <h2>High-Risk Customers</h2>
  <div id="churn-list"></div>
  <button onclick="refreshChurnRisks()">Refresh</button>
  <button onclick="triggerChurnAnalysis()">Run Analysis</button>
</div>

<script>
import { getChurnRisks, triggerChurnAgent } from './api.js';

async function refreshChurnRisks() {
  const risks = await getChurnRisks();
  const html = risks.map(r => `
    <div class="risk-item" style="background: ${r.risk_level === 'critical' ? '#fee' : '#fef'}; padding: 10px; margin: 5px; border-radius: 5px;">
      <strong>${r.name}</strong> (${r.email})<br>
      Risk: ${r.risk_level.toUpperCase()} - ${Math.round(r.risk_score)}%<br>
      MRR: $${Math.round(r.mrr)}
    </div>
  `).join('');
  
  document.getElementById('churn-list').innerHTML = html || '<p>No high-risk customers</p>';
}

async function triggerChurnAnalysis() {
  const result = await triggerChurnAgent();
  alert(`Analysis complete: ${result.decisions} decisions, ${result.approvalsRequired} approvals needed`);
  refreshChurnRisks();
}

// Load on page load
refreshChurnRisks();
</script>
```

### Display Approvals Panel

```html
<div id="approvals-panel">
  <h2>Pending Approvals</h2>
  <div id="approvals-list"></div>
</div>

<script>
import { getPendingApprovals, approveDecision, rejectDecision } from './api.js';

async function refreshApprovals() {
  const approvals = await getPendingApprovals();
  
  const html = approvals.map(a => `
    <div class="approval-item" style="border: 1px solid #ddd; padding: 15px; margin: 10px 0; border-radius: 5px;">
      <h4>${a.agent_type}</h4>
      <p>Action: ${a.action_type}</p>
      <p>Confidence: ${Math.round(a.confidence_score)}%</p>
      <p>Details: ${a.decision_data}</p>
      <button onclick="handleApprove(${a.id})">✓ Approve</button>
      <button onclick="handleReject(${a.id})">✗ Reject</button>
    </div>
  `).join('');
  
  document.getElementById('approvals-list').innerHTML = html || '<p>No pending approvals</p>';
}

async function handleApprove(id) {
  const result = await approveDecision(id, 'admin@company.com');
  alert('Decision approved and executed!');
  refreshApprovals();
}

async function handleReject(id) {
  const reason = prompt('Rejection reason:');
  if (reason) {
    const result = await rejectDecision(id, 'admin@company.com', reason);
    alert('Decision rejected');
    refreshApprovals();
  }
}

refreshApprovals();
</script>
```

### Display Financial Snapshot

```html
<div id="financial-dashboard">
  <h2>Financial Health</h2>
  <div id="financial-data"></div>
</div>

<script>
import { getFinancialSnapshot } from './api.js';

async function refreshFinancial() {
  const snapshot = await getFinancialSnapshot();
  
  if (!snapshot) {
    document.getElementById('financial-data').innerHTML = '<p>No data available</p>';
    return;
  }
  
  const html = `
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
      <div style="background: #f0f; padding: 15px; border-radius: 5px;">
        <strong>MRR</strong><br>
        $${Math.round(snapshot.mrr).toLocaleString()}
      </div>
      <div style="background: #0f0; padding: 15px; border-radius: 5px;">
        <strong>Runway</strong><br>
        ${Math.round(snapshot.runway_months)} months
      </div>
      <div style="background: #00f; padding: 15px; border-radius: 5px;">
        <strong>Growth Rate</strong><br>
        ${snapshot.growth_rate.toFixed(1)}% MoM
      </div>
      <div style="background: #ff0; padding: 15px; border-radius: 5px;">
        <strong>Churn Rate</strong><br>
        ${snapshot.churn_rate.toFixed(1)}% MoM
      </div>
      <div style="background: #0ff; padding: 15px; border-radius: 5px;">
        <strong>Burn Rate</strong><br>
        $${Math.round(snapshot.burn_rate).toLocaleString()}/mo
      </div>
      <div style="background: #f00; padding: 15px; border-radius: 5px;">
        <strong>Cash Balance</strong><br>
        $${Math.round(snapshot.cash_balance).toLocaleString()}
      </div>
    </div>
  `;
  
  document.getElementById('financial-data').innerHTML = html;
}

refreshFinancial();
</script>
```

### Chat Interface

```html
<div id="chat-widget">
  <div id="chat-messages" style="height: 300px; overflow-y: auto; border: 1px solid #ddd; padding: 10px; margin-bottom: 10px;"></div>
  <div style="display: flex; gap: 5px;">
    <input type="text" id="chat-input" placeholder="Ask about churn, upsell, financial, contracts..." style="flex: 1; padding: 10px;">
    <button onclick="sendMessage()">Send</button>
  </div>
</div>

<script>
import { sendChatMessage } from './api.js';

async function sendMessage() {
  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  
  if (!message) return;
  
  // Add user message
  addChatMessage('You', message, 'user');
  input.value = '';
  
  // Get AI response
  const response = await sendChatMessage(message);
  addChatMessage('NeuralOps', response.response, 'ai');
}

function addChatMessage(sender, text, type) {
  const messagesDiv = document.getElementById('chat-messages');
  const messageEl = document.createElement('div');
  messageEl.style.marginBottom = '10px';
  messageEl.style.padding = '10px';
  messageEl.style.borderRadius = '5px';
  messageEl.style.backgroundColor = type === 'user' ? '#e3f2fd' : '#f5f5f5';
  messageEl.innerHTML = `<strong>${sender}:</strong><br>${text}`;
  messagesDiv.appendChild(messageEl);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

document.getElementById('chat-input').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});
</script>
```

## 🔄 Auto-Refresh Dashboard

```javascript
// Refresh dashboard every 30 seconds
setInterval(async () => {
  await refreshChurnRisks();
  await refreshApprovals();
  await refreshFinancial();
}, 30000);
```

## 🌐 CORS Configuration

If your frontend is on a different domain, ensure CORS is enabled on the backend (already configured in `index.js`).

For production, update CORS:

```javascript
app.use(cors({
  origin: 'https://your-frontend-domain.com',
  credentials: true
}));
```

## 📱 Example: Complete Dashboard Page

```html
<!DOCTYPE html>
<html>
<head>
  <title>NeuralOps Dashboard</title>
  <style>
    body { font-family: Arial; margin: 20px; background: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; }
    .card { background: white; padding: 20px; margin: 10px 0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    button { padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; }
    button:hover { background: #0056b3; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🤖 NeuralOps Dashboard</h1>
    
    <div class="card">
      <h2>Financial Health</h2>
      <div id="financial-data"></div>
      <button onclick="location.reload()">Refresh</button>
    </div>
    
    <div class="card">
      <h2>Pending Approvals</h2>
      <div id="approvals-list"></div>
    </div>
    
    <div class="card">
      <h2>High-Risk Customers</h2>
      <div id="churn-list"></div>
      <button onclick="triggerChurnAnalysis()">Run Churn Analysis</button>
    </div>
    
    <div class="card">
      <h2>Upsell Opportunities</h2>
      <div id="upsell-list"></div>
    </div>
    
    <div class="card">
      <h2>Overpriced Contracts</h2>
      <div id="contracts-list"></div>
    </div>
    
    <div class="card">
      <h2>AI Chat</h2>
      <div id="chat-messages" style="height: 200px; overflow-y: auto; border: 1px solid #ddd; padding: 10px; margin-bottom: 10px;"></div>
      <div style="display: flex; gap: 5px;">
        <input type="text" id="chat-input" placeholder="Ask anything..." style="flex: 1; padding: 10px;">
        <button onclick="sendMessage()">Send</button>
      </div>
    </div>
  </div>

  <script type="module">
    import * as api from './api.js';
    
    // Load all data on page load
    async function loadDashboard() {
      // Financial
      const financial = await api.getFinancialSnapshot();
      document.getElementById('financial-data').innerHTML = `
        MRR: $${Math.round(financial?.mrr || 0).toLocaleString()} | 
        Runway: ${Math.round(financial?.runway_months || 0)} months | 
        Growth: ${(financial?.growth_rate || 0).toFixed(1)}%
      `;
      
      // Approvals
      const approvals = await api.getPendingApprovals();
      document.getElementById('approvals-list').innerHTML = approvals.length > 0 
        ? `${approvals.length} pending decisions`
        : 'No pending approvals';
      
      // Churn
      const churn = await api.getChurnRisks();
      document.getElementById('churn-list').innerHTML = churn.length > 0
        ? `${churn.length} high-risk customers`
        : 'No high-risk customers';
      
      // Upsell
      const upsell = await api.getUpsellOpportunities();
      document.getElementById('upsell-list').innerHTML = upsell.length > 0
        ? `${upsell.length} opportunities found`
        : 'No opportunities';
      
      // Contracts
      const contracts = await api.getOverpricedContracts();
      document.getElementById('contracts-list').innerHTML = contracts.length > 0
        ? `${contracts.length} overpriced contracts`
        : 'All contracts fairly priced';
    }
    
    window.triggerChurnAnalysis = async () => {
      await api.triggerChurnAgent();
      loadDashboard();
    };
    
    window.sendMessage = async () => {
      const input = document.getElementById('chat-input');
      const message = input.value;
      if (!message) return;
      
      const response = await api.sendChatMessage(message);
      const messagesDiv = document.getElementById('chat-messages');
      messagesDiv.innerHTML += `<p><strong>You:</strong> ${message}</p>`;
      messagesDiv.innerHTML += `<p><strong>AI:</strong> ${response.response}</p>`;
      input.value = '';
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    };
    
    loadDashboard();
    setInterval(loadDashboard, 30000); // Refresh every 30s
  </script>
</body>
</html>
```

## 🔑 Key Integration Points

1. **Real-time Updates**: Use `setInterval()` to refresh data
2. **User Actions**: Buttons trigger agent execution
3. **Approvals**: 1-click approve/reject with user confirmation
4. **Chat**: Natural language interface for queries
5. **Error Handling**: Add try-catch for all API calls

## 🚀 Production Deployment

1. Update `API_URL` to your Vercel domain
2. Add authentication headers if needed
3. Implement error handling and user feedback
4. Add loading states for better UX
5. Cache data locally to reduce API calls

---

For more details, see the main [README.md](./README.md)
