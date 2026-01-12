// API Helper
async function api(endpoint, options = {}) {
  const response = await fetch(`/api${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || 'API error');
  }

  return data;
}

// Toast notifications
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast show ${type}`;

  setTimeout(() => {
    toast.className = 'toast';
  }, 3000);
}

// Tab handling
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    tab.classList.add('active');
    document.getElementById(`${tab.dataset.tab}-tab`).classList.add('active');
  });
});

// Connections
let connections = [];

async function loadConnections() {
  try {
    const data = await api('/connections');
    connections = data.connections;
    renderConnections();
    updateConnectionSelect();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function renderConnections() {
  const list = document.getElementById('connections-list');

  if (connections.length === 0) {
    list.innerHTML = '<p class="empty-state">No connections saved. Click "Add Connection" to create one.</p>';
    return;
  }

  list.innerHTML = connections.map(conn => `
    <div class="connection-card" data-id="${conn.id}">
      <div class="connection-info">
        <h3>${conn.name}</h3>
        <p>${conn.username}@${conn.host}:${conn.port}</p>
      </div>
      <div class="connection-actions">
        <button class="btn" onclick="testConnection('${conn.id}')">Test</button>
        <button class="btn btn-danger" onclick="deleteConnection('${conn.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}

function updateConnectionSelect() {
  const select = document.getElementById('session-connection');
  select.innerHTML = connections.map(conn =>
    `<option value="${conn.id}">${conn.name} (${conn.host})</option>`
  ).join('');
}

async function testConnection(id) {
  try {
    showToast('Testing connection...', 'info');
    const data = await api(`/connections/${id}/test`, { method: 'POST' });

    if (data.success) {
      showToast('Connection successful!', 'success');
    } else {
      showToast(`Connection failed: ${data.message}`, 'error');
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function deleteConnection(id) {
  if (!confirm('Are you sure you want to delete this connection?')) return;

  try {
    await api(`/connections/${id}`, { method: 'DELETE' });
    showToast('Connection deleted', 'success');
    loadConnections();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// Add Connection Modal
const addConnectionModal = document.getElementById('add-connection-modal');
const addConnectionForm = document.getElementById('add-connection-form');
const authTypeSelect = document.getElementById('conn-auth-type');

document.getElementById('add-connection-btn').addEventListener('click', () => {
  addConnectionModal.classList.add('show');
});

document.querySelectorAll('.modal .close-btn, #cancel-add-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    addConnectionModal.classList.remove('show');
  });
});

authTypeSelect.addEventListener('change', () => {
  const isPassword = authTypeSelect.value === 'password';
  document.getElementById('password-group').style.display = isPassword ? 'block' : 'none';
  document.getElementById('key-group').style.display = isPassword ? 'none' : 'block';
});

addConnectionForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const formData = {
    name: document.getElementById('conn-name').value,
    host: document.getElementById('conn-host').value,
    port: parseInt(document.getElementById('conn-port').value, 10),
    username: document.getElementById('conn-username').value,
    authType: document.getElementById('conn-auth-type').value,
    password: document.getElementById('conn-password').value || undefined,
    privateKeyPath: document.getElementById('conn-key-path').value || undefined,
  };

  try {
    await api('/connections', { method: 'POST', body: formData });
    showToast('Connection added', 'success');
    addConnectionModal.classList.remove('show');
    addConnectionForm.reset();
    loadConnections();
  } catch (error) {
    showToast(error.message, 'error');
  }
});

// Session
let sessionActive = false;

async function checkSessionStatus() {
  try {
    const data = await api('/session/status');
    sessionActive = data.active;
    updateSessionUI(data.state);
  } catch (error) {
    console.error('Failed to check session status:', error);
  }
}

function updateSessionUI(state) {
  const startBtn = document.getElementById('start-session-btn');
  const stopBtn = document.getElementById('stop-session-btn');
  const connectionStatus = document.getElementById('connection-status');

  if (state) {
    document.getElementById('ssh-status').textContent = state.ssh;
    document.getElementById('pf-status').textContent = state.portForward;
    document.getElementById('browser-status').textContent = state.browser;
    document.getElementById('cdp-status').textContent = state.cdp;
  }

  if (sessionActive) {
    startBtn.disabled = true;
    stopBtn.disabled = false;
    connectionStatus.classList.add('connected');
    connectionStatus.querySelector('.status-text').textContent = 'Connected';
  } else {
    startBtn.disabled = false;
    stopBtn.disabled = true;
    connectionStatus.classList.remove('connected');
    connectionStatus.querySelector('.status-text').textContent = 'Disconnected';
  }
}

// Start Session Modal
const startSessionModal = document.getElementById('start-session-modal');
const startSessionForm = document.getElementById('start-session-form');

document.getElementById('start-session-btn').addEventListener('click', () => {
  if (connections.length === 0) {
    showToast('Please add a connection first', 'error');
    return;
  }
  startSessionModal.classList.add('show');
});

document.querySelectorAll('#start-session-modal .close-btn, #cancel-session-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    startSessionModal.classList.remove('show');
  });
});

startSessionForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const formData = {
    connectionId: document.getElementById('session-connection').value,
    headless: document.getElementById('session-headless').checked,
  };

  try {
    showToast('Starting session...', 'info');
    const data = await api('/session/start', { method: 'POST', body: formData });
    sessionActive = true;
    updateSessionUI(data.state);
    showToast('Session started!', 'success');
    startSessionModal.classList.remove('show');
  } catch (error) {
    showToast(error.message, 'error');
  }
});

document.getElementById('stop-session-btn').addEventListener('click', async () => {
  try {
    showToast('Stopping session...', 'info');
    await api('/session/stop', { method: 'POST' });
    sessionActive = false;
    updateSessionUI(null);
    showToast('Session stopped', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
});

// Browser
document.getElementById('go-btn').addEventListener('click', navigate);
document.getElementById('url-input').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') navigate();
});

async function navigate() {
  const url = document.getElementById('url-input').value;
  if (!url) return;

  try {
    showToast('Navigating...', 'info');
    const data = await api('/browser/navigate', { method: 'POST', body: { url } });
    document.getElementById('page-title').textContent = data.title;
    document.getElementById('url-input').value = data.url;
    showToast('Page loaded', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

document.getElementById('back-btn').addEventListener('click', async () => {
  try {
    const data = await api('/browser/back', { method: 'POST' });
    document.getElementById('url-input').value = data.url;
  } catch (error) {
    showToast(error.message, 'error');
  }
});

document.getElementById('forward-btn').addEventListener('click', async () => {
  try {
    const data = await api('/browser/forward', { method: 'POST' });
    document.getElementById('url-input').value = data.url;
  } catch (error) {
    showToast(error.message, 'error');
  }
});

document.getElementById('reload-btn').addEventListener('click', async () => {
  try {
    await api('/browser/reload', { method: 'POST' });
    showToast('Page reloaded', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
});

document.getElementById('screenshot-btn').addEventListener('click', async () => {
  try {
    showToast('Taking screenshot...', 'info');
    const data = await api('/browser/screenshot', { method: 'POST', body: { format: 'png' } });

    const preview = document.getElementById('screenshot-preview');
    preview.innerHTML = `<img src="data:image/png;base64,${data.data}" alt="Screenshot" />`;
    showToast('Screenshot taken', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
});

// Network
let recording = false;

document.getElementById('start-recording-btn').addEventListener('click', async () => {
  try {
    await api('/network/start', { method: 'POST' });
    recording = true;
    updateRecordingUI();
    showToast('Recording started', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
});

document.getElementById('stop-recording-btn').addEventListener('click', async () => {
  try {
    await api('/network/stop', { method: 'POST' });
    recording = false;
    updateRecordingUI();
    loadNetworkEntries();
    showToast('Recording stopped', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
});

document.getElementById('clear-recording-btn').addEventListener('click', async () => {
  try {
    await api('/network/clear', { method: 'DELETE' });
    document.getElementById('network-entries').innerHTML =
      '<tr><td colspan="6" class="empty">No requests recorded</td></tr>';
    showToast('Recording cleared', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
});

document.getElementById('export-har-btn').addEventListener('click', async () => {
  try {
    const response = await fetch('/api/network/export?format=har');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'network.har';
    a.click();
    URL.revokeObjectURL(url);
    showToast('HAR exported', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
});

function updateRecordingUI() {
  const startBtn = document.getElementById('start-recording-btn');
  const stopBtn = document.getElementById('stop-recording-btn');
  const status = document.getElementById('recording-status');

  startBtn.disabled = recording;
  stopBtn.disabled = !recording;
  status.classList.toggle('active', recording);
  status.querySelector('.text').textContent = recording ? 'Recording' : 'Not recording';
}

async function loadNetworkEntries() {
  try {
    const data = await api('/network/entries?limit=100');

    if (data.entries.length === 0) {
      document.getElementById('network-entries').innerHTML =
        '<tr><td colspan="6" class="empty">No requests recorded</td></tr>';
      return;
    }

    document.getElementById('network-entries').innerHTML = data.entries.map(entry => `
      <tr>
        <td>${entry.request.method}</td>
        <td>${entry.response?.status || '-'}</td>
        <td>${entry.request.resourceType}</td>
        <td>${formatBytes(entry.response?.contentLength)}</td>
        <td>${formatDuration(entry.duration)}</td>
        <td title="${entry.request.url}">${truncate(entry.request.url, 60)}</td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Failed to load network entries:', error);
  }
}

function formatBytes(bytes) {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(ms) {
  if (!ms) return '-';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function truncate(str, len) {
  return str.length > len ? str.slice(0, len) + '...' : str;
}

// WebSocket for real-time updates
function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${window.location.host}/api/events`);

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);

    switch (message.type) {
      case 'session:state':
        updateSessionUI(message.payload);
        break;
      case 'network:request':
        if (recording) loadNetworkEntries();
        break;
      case 'error':
        showToast(message.payload.message, 'error');
        break;
    }
  };

  ws.onclose = () => {
    // Reconnect after 3 seconds
    setTimeout(connectWebSocket, 3000);
  };
}

// Initialize
loadConnections();
checkSessionStatus();
connectWebSocket();

// Poll session status every 5 seconds
setInterval(checkSessionStatus, 5000);
