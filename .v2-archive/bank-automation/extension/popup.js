const serverInput = document.getElementById('server');
const keyInput = document.getElementById('key');
const statusBox = document.getElementById('status');
const autoInput = document.getElementById('auto');
const intervalInput = document.getElementById('interval');

async function refresh() {
  const stored = await chrome.storage.local.get(['serverUrl', 'connectorKey', 'syncState', 'autoSync', 'intervalMinutes']);
  serverInput.value = stored.serverUrl || 'https://rof.aprwatch.com';
  keyInput.value = stored.connectorKey || '';
  autoInput.checked = stored.autoSync !== false;
  intervalInput.value = String(stored.intervalMinutes || 4);
  if (stored.syncState?.message) {
    const time = stored.syncState.updatedAt ? new Date(stored.syncState.updatedAt).toLocaleTimeString('vi-VN') : '';
    statusBox.textContent = `${time ? `[${time}] ` : ''}${stored.syncState.message}`;
  }
}

document.getElementById('start').addEventListener('click', async () => {
  const serverUrl = serverInput.value.trim().replace(/\/$/, '');
  const connectorKey = keyInput.value.trim();
  if (!serverUrl.startsWith('https://') || !connectorKey.startsWith('rof_tcb_')) {
    statusBox.textContent = 'URL hoặc khóa ghép nối chưa hợp lệ.';
    return;
  }
  const autoSync = autoInput.checked;
  const intervalMinutes = Number(intervalInput.value) || 4;
  await chrome.storage.local.set({ serverUrl, connectorKey, autoSync, intervalMinutes });
  const result = await chrome.runtime.sendMessage({ type: 'START_CAPTURE', autoSync, intervalMinutes });
  statusBox.textContent = result?.success ? 'Đang chờ response giao dịch từ Techcombank…' : (result?.error || 'Không thể bắt đầu.');
});

chrome.storage.onChanged.addListener(refresh);
refresh();
