// Simple admin password (in production, use proper auth)
const ADMIN_PASSWORD = 'kiru';

// DOM Elements
const loginSection = document.getElementById('login-section');
const adminContent = document.getElementById('admin-content');
const loginBtn = document.getElementById('login-btn');
const adminPassword = document.getElementById('admin-password');
const loginError = document.getElementById('login-error');
const verifyBtn = document.getElementById('verify-btn');
const verifyInput = document.getElementById('verify-input');
const verifyResult = document.getElementById('verify-result');
const refreshBtn = document.getElementById('refresh-btn');
const searchInput = document.getElementById('search-input');
const filterStatus = document.getElementById('filter-status');
const flappyKeyInput = document.getElementById('flappy-key-input');
const saveSettingsBtn = document.getElementById('save-settings-btn');

// Store all keys for filtering
let allKeys = [];

// Login handler
loginBtn.addEventListener('click', login);
adminPassword.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') login();
});

// Verify handler
verifyBtn.addEventListener('click', verifyKey);
verifyInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') verifyKey();
});

// Refresh handler
refreshBtn.addEventListener('click', () => {
    loadStats();
    loadKeys();
});

// Settings handler
saveSettingsBtn.addEventListener('click', saveSettings);

// Search and filter handlers
searchInput.addEventListener('input', filterKeys);
filterStatus.addEventListener('change', filterKeys);

function login() {
    if (adminPassword.value === ADMIN_PASSWORD) {
        loginSection.style.display = 'none';
        adminContent.style.display = 'block';
        loadStats();
        loadKeys();
        loadSettings();
    } else {
        loginError.textContent = 'Invalid password!';
        adminPassword.value = '';
        adminPassword.focus();
    }
}

// API Functions
async function loadStats() {
    try {
        const response = await fetch('/api/admin/stats');
        const data = await response.json();
        document.getElementById('total-keys').textContent = data.total;
        document.getElementById('active-keys').textContent = data.active;
        document.getElementById('revoked-keys').textContent = data.revoked;
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

async function loadSettings() {
    try {
        const response = await fetch('/api/admin/settings');
        const data = await response.json();
        if (data.flappy_key) {
            flappyKeyInput.value = data.flappy_key;
        }
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

async function saveSettings() {
    const flappyKey = flappyKeyInput.value.trim();
    if (!flappyKey) {
        alert('Please enter a key value');
        return;
    }

    try {
        const response = await fetch('/api/admin/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ flappy_key: flappyKey })
        });
        const data = await response.json();
        
        if (data.success) {
            alert('Settings saved successfully!');
        } else {
            alert('Failed to save settings');
        }
    } catch (error) {
        console.error('Error saving settings:', error);
        alert('Error saving settings');
    }
}

async function loadKeys() {
    try {
        const response = await fetch('/api/admin/keys');
        const data = await response.json();
        allKeys = data.keys;
        filterKeys();
    } catch (error) {
        console.error('Error loading keys:', error);
        renderEmptyState('Error loading keys');
    }
}

function filterKeys() {
    const searchTerm = searchInput.value.toLowerCase();
    const statusFilter = filterStatus.value;
    
    let filteredKeys = allKeys;
    
    // Filter by status
    if (statusFilter === 'active') {
        filteredKeys = filteredKeys.filter(key => key.is_active);
    } else if (statusFilter === 'revoked') {
        filteredKeys = filteredKeys.filter(key => !key.is_active);
    }
    
    // Filter by search term
    if (searchTerm) {
        filteredKeys = filteredKeys.filter(key => 
            key.key_value.toLowerCase().includes(searchTerm) ||
            (key.ip_address && key.ip_address.toLowerCase().includes(searchTerm))
        );
    }
    
    renderKeysTable(filteredKeys);
}

async function verifyKey() {
    const key = verifyInput.value.trim();
    
    if (!key) {
        verifyResult.textContent = 'Please enter a key to verify';
        verifyResult.className = 'invalid';
        return;
    }
    
    try {
        const response = await fetch(`/api/verify-key?key=${encodeURIComponent(key)}`);
        const data = await response.json();
        
        if (data.valid) {
            verifyResult.textContent = '✅ Key is VALID and ACTIVE';
            verifyResult.className = 'valid';
        } else {
            verifyResult.textContent = `❌ Key is INVALID: ${data.message || 'Not found or revoked'}`;
            verifyResult.className = 'invalid';
        }
    } catch (error) {
        console.error('Error verifying key:', error);
        verifyResult.textContent = '❌ Error verifying key';
        verifyResult.className = 'invalid';
    }
}

async function revokeKey(key) {
    if (confirm(`Are you sure you want to revoke key:\n${key}?`)) {
        try {
            const response = await fetch('/api/revoke-key', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key })
            });
            const data = await response.json();
            
            if (data.success) {
                alert('Key revoked successfully!');
                loadStats();
                loadKeys();
            } else {
                alert(`Failed to revoke key: ${data.message || 'Unknown error'}`);
            }
        } catch (error) {
            console.error('Error revoking key:', error);
            alert('Error revoking key');
        }
    }
}

function renderKeysTable(keys) {
    const tbody = document.getElementById('keys-tbody');
    
    if (!keys || keys.length === 0) {
        renderEmptyState('No keys found');
        return;
    }
    
    tbody.innerHTML = keys.map(key => `
        <tr class="${key.is_active ? '' : 'revoked'}">
            <td><code>${escapeHtml(key.key_value)}</code></td>
            <td>${getGameType(key.key_value)}</td>
            <td>${formatDate(key.created_at)}</td>
            <td>${escapeHtml(key.ip_address || 'N/A')}</td>
            <td>${key.is_active ? '✅ Active' : '❌ Revoked'}</td>
            <td>
                ${key.is_active ? `<button onclick="revokeKey('${escapeHtml(key.key_value)}')">Revoke</button>` : '-'}
            </td>
        </tr>
    `).join('');
}

function getGameType(keyValue) {
    if (keyValue.startsWith('CHESS-')) {
        return '♔ Chess';
    } else if (keyValue.startsWith('MINE-')) {
        return '💣 Minesweeper';
    }
    return '❓ Unknown';
}

function renderEmptyState(message) {
    const tbody = document.getElementById('keys-tbody');
    tbody.innerHTML = `
        <tr>
            <td colspan="6" class="empty-state">
                <span>📭</span>
                ${escapeHtml(message)}
            </td>
        </tr>
    `;
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString);
        return date.toLocaleString();
    } catch {
        return dateString;
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Check if already logged in (for development)
document.addEventListener('DOMContentLoaded', () => {
    adminPassword.focus();
});