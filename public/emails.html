<!DOCTYPE html>
<html lang="pt-BR" translate="no">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>NeuralOps — Histórico de Emails</title>
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{--black:#05060a;--void:#080c12;--ink:#0d1420;--panel:#111827;--border:#1e2d42;--text-dim:#6b8aaa;--text-mid:#9ab5cc;--text:#cce0f0;--text-bright:#e8f4ff;--white:#f5faff;--accent:#00d4ff;--accent2:#00ff88;--accent3:#ff6b35;--danger:#ff4466;--whatsapp:#25D366;}
*{margin:0;padding:0;box-sizing:border-box;}
body{background:var(--black);color:var(--text);font-family:'DM Mono',monospace;font-size:13px;min-height:100vh;}
body::before{content:'';position:fixed;inset:0;background-image:linear-gradient(rgba(0,212,255,.02) 1px,transparent 1px),linear-gradient(90deg,rgba(0,212,255,.02) 1px,transparent 1px);background-size:60px 60px;pointer-events:none;}
nav{background:rgba(5,6,10,.9);backdrop-filter:blur(20px);border-bottom:1px solid var(--border);padding:14px 24px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100;}
.nav-logo{font-family:'Syne',sans-serif;font-size:18px;font-weight:800;color:var(--white);text-decoration:none;}
.nav-logo span{color:var(--accent);}
.nav-links{display:flex;gap:4px;}
.nav-link{color:var(--text-dim);text-decoration:none;font-size:12px;padding:7px 14px;border-radius:4px;transition:all .2s;}
.nav-link:hover{color:var(--accent);background:rgba(0,212,255,.06);}
.nav-link.active{color:var(--accent);background:rgba(0,212,255,.08);}
.btn{background:var(--accent);color:var(--black);border:none;padding:8px 18px;font-family:'DM Mono',monospace;font-size:11px;font-weight:700;cursor:pointer;border-radius:4px;transition:all .2s;}
.btn:hover{background:var(--accent2);}
.btn.ghost{background:transparent;color:var(--text-dim);border:1px solid var(--border);}
.btn.ghost:hover{border-color:var(--accent);color:var(--accent);}
.btn.wa{background:var(--whatsapp);color:#fff;}
.btn.wa:hover{background:#1da851;}
main{padding:24px;max-width:1100px;margin:0 auto;}
.page-title{font-family:'Syne',sans-serif;font-size:22px;font-weight:800;color:var(--white);margin-bottom:20px;}
.stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:24px;}
.stat{background:var(--panel);border:1px solid var(--border);padding:16px;border-left:3px solid var(--accent);}
.stat.green{border-left-color:var(--accent2);}
.stat.orange{border-left-color:var(--accent3);}
.stat.purple{border-left-color:#a855f7;}
.stat-label{font-size:9px;color:var(--text-dim);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:6px;}
.stat-val{font-family:'Syne',sans-serif;font-size:24px;font-weight:700;color:var(--white);}
.filters{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;align-items:center;}
.filter-btn{background:var(--ink);border:1px solid var(--border);color:var(--text-dim);padding:6px 14px;font-family:'DM Mono',monospace;font-size:11px;cursor:pointer;border-radius:3px;transition:all .2s;}
.filter-btn:hover,.filter-btn.active{border-color:var(--accent);color:var(--accent);background:rgba(0,212,255,.06);}
.table-wrap{background:var(--panel);border:1px solid var(--border);border-radius:4px;overflow:hidden;}
table{width:100%;border-collapse:collapse;}
th{font-size:9px;color:var(--text-dim);letter-spacing:1.5px;text-transform:uppercase;padding:10px 16px;text-align:left;border-bottom:1px solid var(--border);background:var(--void);}
td{padding:12px 16px;border-bottom:1px solid rgba(30,45,66,.4);vertical-align:top;}
tr:last-child td{border-bottom:none;}
tr:hover td{background:rgba(0,212,255,.02);}
.ch-type{display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:600;}
.ch-email{background:rgba(0,212,255,.1);border:1px solid rgba(0,212,255,.2);color:var(--accent);}
.ch-whatsapp{background:rgba(37,211,102,.1);border:1px solid rgba(37,211,102,.2);color:var(--whatsapp);}
.agent-pill{display:inline-block;padding:2px 8px;border-radius:3px;font-size:9px;letter-spacing:.5px;text-transform:uppercase;}
.ap-churn{background:rgba(255,68,102,.1);color:var(--danger);}
.ap-upsell{background:rgba(0,255,136,.1);color:var(--accent2);}
.ap-contract{background:rgba(255,107,53,.1);color:var(--accent3);}
.ap-sales{background:rgba(168,85,247,.1);color:#a855f7;}
.ap-delinquency{background:rgba(255,68,102,.15);color:var(--danger);}
.ap-whatsapp{background:rgba(37,211,102,.1);color:var(--whatsapp);}
.preview-btn{background:transparent;border:1px solid var(--border);color:var(--text-dim);padding:3px 10px;font-family:'DM Mono',monospace;font-size:10px;cursor:pointer;border-radius:3px;transition:all .2s;}
.preview-btn:hover{border-color:var(--accent);color:var(--accent);}
.empty{padding:60px;text-align:center;color:var(--text-dim);}
#modal{display:none;position:fixed;inset:0;background:rgba(5,6,10,.92);z-index:1000;align-items:center;justify-content:center;backdrop-filter:blur(10px);}
#modal.open{display:flex;}
.modal-box{background:var(--panel);border:1px solid var(--border);padding:28px;border-radius:8px;width:560px;max-width:95vw;max-height:80vh;overflow-y:auto;}
.modal-title{font-family:'Syne',sans-serif;font-size:18px;color:var(--white);margin-bottom:16px;font-weight:700;}
.email-preview{background:var(--void);border:1px solid var(--border);border-radius:4px;padding:16px;font-size:12px;color:var(--text);line-height:1.8;white-space:pre-wrap;word-break:break-word;}
#toast{position:fixed;bottom:16px;right:16px;background:var(--panel);border:1px solid var(--border);color:var(--text-bright);padding:10px 18px;font-size:11px;z-index:9999;opacity:0;transform:translateY(6px);transition:all .3s;border-radius:3px;}
#toast.show{opacity:1;transform:translateY(0);}
#toast.ok{border-color:rgba(0,255,136,.4);color:var(--accent2);}
</style>
</head>
<body>
<div id="toast"></div>
<nav>
  <a href="/dashboard" class="nav-logo">N<span>euralOps</span></a>
  <div class="nav-links">
    <a href="/dashboard" class="nav-link">Dashboard</a>
    <a href="/pipeline" class="nav-link">Pipeline</a>
    <a href="/historico" class="nav-link">Histórico</a>
    <a href="/emails" class="nav-link active">Emails</a>
    <a href="/relatorios" class="nav-link">Relatórios</a>
  </div>
  <button class="btn ghost" onclick="window.location.href='/dashboard'">← Dashboard</button>
</nav>

<main>
  <div class="page-title">📧 Histórico de Envios</div>

  <div class="stats-grid">
    <div class="stat"><div class="stat-label">Total Enviados</div><div class="stat-val" id="s-total">—</div></div>
    <div class="stat green"><div class="stat-label">Hoje</div><div class="stat-val" id="s-today">—</div></div>
    <div class="stat orange"><div class="stat-label">Este Mês</div><div class="stat-val" id="s-month">—</div></div>
    <div class="stat purple"><div class="stat-label">Via WhatsApp</div><div class="stat-val" id="s-wa">—</div></div>
  </div>

  <div class="filters">
    <span style="font-size:11px;color:var(--text-dim);">Filtrar:</span>
    <button class="filter-btn active" onclick="filter('all',this)">Todos</button>
    <button class="filter-btn" onclick="filter('email',this)">📧 Email</button>
    <button class="filter-btn" onclick="filter('whatsapp',this)">💬 WhatsApp</button>
    <div style="flex:1;"></div>
    <button class="btn ghost" onclick="loadHistory()" style="font-size:10px;padding:6px 14px;">↻ Atualizar</button>
  </div>

  <div class="table-wrap">
    <div id="history-body"><div class="empty">Carregando...</div></div>
  </div>
</main>

<div id="modal">
  <div class="modal-box">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <div class="modal-title" id="modal-title">Conteúdo do Email</div>
      <button onclick="closeModal()" style="background:none;border:none;color:var(--text-dim);font-size:20px;cursor:pointer;">×</button>
    </div>
    <div id="modal-meta" style="font-size:11px;color:var(--text-dim);margin-bottom:12px;"></div>
    <div class="email-preview" id="modal-body"></div>
  </div>
</div>

<script>
const token = localStorage.getItem('neuralops_token');
if (!token) window.location.href = '/login';

let allHistory = [];
let currentFilter = 'all';

function api(path, opts = {}) {
  return fetch('/api' + path, { headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, ...opts }).then(r => r.json()).catch(() => null);
}

function toast(msg, type = 'ok') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'show ' + type;
  setTimeout(() => t.className = '', 3000);
}

const AGENT_LABELS = { churn_prediction:'Churn', upsell_crosssell:'Upsell', contract_renegotiation:'Contract', sales_pipeline:'Vendas', delinquency:'Cobrança', whatsapp:'WhatsApp' };
const AGENT_CLASS = { churn_prediction:'ap-churn', upsell_crosssell:'ap-upsell', contract_renegotiation:'ap-contract', sales_pipeline:'ap-sales', delinquency:'ap-delinquency', whatsapp:'ap-whatsapp' };

async function loadHistory() {
  const r = await api('/email-history?limit=100');
  if (!r) { document.getElementById('history-body').innerHTML = '<div class="empty">Erro ao carregar.</div>'; return; }
  allHistory = r.history || [];
  const stats = r.stats || {};

  document.getElementById('s-total').textContent = stats.total || allHistory.length;
  document.getElementById('s-today').textContent = stats.today || 0;
  document.getElementById('s-month').textContent = stats.month || 0;
  document.getElementById('s-wa').textContent = allHistory.filter(h => h.channel === 'whatsapp').length;

  renderTable();
}

function filter(type, el) {
  currentFilter = type;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  renderTable();
}

function renderTable() {
  const data = currentFilter === 'all' ? allHistory : allHistory.filter(h => h.channel === currentFilter);
  const el = document.getElementById('history-body');

  if (!data.length) {
    el.innerHTML = `<div class="empty">📭 Nenhum ${currentFilter === 'whatsapp' ? 'WhatsApp' : 'email'} enviado ainda.<br><small>Aprovações com Gmail conectado aparecem aqui automaticamente.</small></div>`;
    return;
  }

  el.innerHTML = `<table>
    <thead><tr>
      <th>Data / Hora</th>
      <th>Destinatário</th>
      <th>Canal</th>
      <th>Agente</th>
      <th>Assunto / Resumo</th>
      <th>Ação</th>
    </tr></thead>
    <tbody>${data.map(h => {
      const date = new Date(h.sent_at).toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
      const agentKey = h.agent_type || h.channel || 'email';
      const subject = (h.subject || 'Email enviado').substring(0, 45) + ((h.subject || '').length > 45 ? '...' : '');
      const channelBadge = h.channel === 'whatsapp'
        ? `<span class="ch-type ch-whatsapp">💬 WhatsApp</span>`
        : `<span class="ch-type ch-email">📧 Email</span>`;
      const agentBadge = `<span class="agent-pill ${AGENT_CLASS[agentKey]||'ap-churn'}">${AGENT_LABELS[agentKey]||agentKey}</span>`;
      return `<tr>
        <td style="font-size:11px;color:var(--text-dim);white-space:nowrap">${date}</td>
        <td>
          <div style="color:var(--white);font-weight:600;font-size:12px">${h.customer_name||'—'}</div>
          <div style="font-size:10px;color:var(--text-dim)">${h.customer_email||''}</div>
        </td>
        <td>${channelBadge}</td>
        <td>${agentBadge}</td>
        <td style="font-size:11px;color:var(--text)">${subject}</td>
        <td>${h.body ? `<button class="preview-btn" onclick="showPreview(${h.id})">👁 Ver</button>` : '—'}</td>
      </tr>`;
    }).join('')}
    </tbody>
  </table>`;
}

function showPreview(id) {
  const h = allHistory.find(x => x.id === id);
  if (!h) return;
  document.getElementById('modal-title').textContent = h.channel === 'whatsapp' ? '💬 Mensagem WhatsApp' : '📧 Conteúdo do Email';
  document.getElementById('modal-meta').textContent = `Para: ${h.customer_name || '—'} (${h.customer_email || h.channel}) · ${new Date(h.sent_at).toLocaleString('pt-BR')}`;
  document.getElementById('modal-body').textContent = h.body || 'Conteúdo não disponível.';
  document.getElementById('modal').classList.add('open');
}

function closeModal() { document.getElementById('modal').classList.remove('open'); }

loadHistory();
</script>
</body>
</html>
