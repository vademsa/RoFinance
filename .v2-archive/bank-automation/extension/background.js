const TCB_HOST = 'onlinebanking.techcombank.com.vn';
const TRANSACTION_PATH = '/api/transaction-manager/client-api/v3/transactions';
const attachedTabs = new Set();
const pendingResponses = new Map();

async function updateState(patch) {
  const current = await chrome.storage.local.get('syncState');
  await chrome.storage.local.set({ syncState: { ...(current.syncState || {}), ...patch } });
}

async function ensureCapture(tabId) {
  if (!attachedTabs.has(tabId)) {
    try {
      await chrome.debugger.attach({ tabId }, '1.3');
    } catch (error) {
      if (!String(error?.message || error).toLowerCase().includes('already attached')) throw error;
    }
    attachedTabs.add(tabId);
  }
  await chrome.debugger.sendCommand({ tabId }, 'Network.enable', {
    maxTotalBufferSize: 10000000,
    maxResourceBufferSize: 5000000,
  });
  await chrome.debugger.sendCommand({ tabId }, 'Network.setCacheDisabled', { cacheDisabled: true });
}

async function configureAutoSync(enabled, intervalMinutes = 4) {
  await chrome.alarms.clear('tcbAutoSync');
  const safeInterval = [2, 3, 4].includes(Number(intervalMinutes)) ? Number(intervalMinutes) : 4;
  await chrome.storage.local.set({ autoSync: Boolean(enabled), intervalMinutes: safeInterval });
  if (enabled) {
    await chrome.alarms.create('tcbAutoSync', { delayInMinutes: safeInterval, periodInMinutes: safeInterval });
  }
}

async function runAutomaticSync() {
  const settings = await chrome.storage.local.get(['autoSync', 'connectorKey', 'intervalMinutes']);
  if (!settings.autoSync || !String(settings.connectorKey || '').startsWith('rof_tcb_')) return;
  const tabs = await chrome.tabs.query({ url: `https://${TCB_HOST}/*` });
  if (!tabs.length) {
    await updateState({ status: 'waiting', message: 'Tự động đồng bộ đang chờ bạn mở tab Techcombank.', updatedAt: new Date().toISOString() });
    return;
  }
  for (const tab of tabs) {
    if (!tab.id) continue;
    try {
      await ensureCapture(tab.id);
      await updateState({ status: 'refreshing', message: `Đang tự động làm mới Techcombank (chu kỳ ${settings.intervalMinutes || 4} phút)…`, updatedAt: new Date().toISOString() });
      await chrome.tabs.reload(tab.id);
    } catch (error) {
      await updateState({ status: 'error', message: `Tự động đồng bộ lỗi: ${error.message || error}`, updatedAt: new Date().toISOString() });
    }
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'tcbAutoSync') runAutomaticSync();
});

chrome.runtime.onStartup.addListener(async () => {
  const settings = await chrome.storage.local.get(['autoSync', 'intervalMinutes']);
  if (settings.autoSync) await configureAutoSync(true, settings.intervalMinutes || 4);
});

chrome.debugger.onDetach.addListener((source) => {
  if (source.tabId != null) attachedTabs.delete(source.tabId);
});

chrome.debugger.onEvent.addListener(async (source, method, params) => {
  if (source.tabId == null) return;
  if (method === 'Network.responseReceived') {
    const url = params.response?.url || '';
    if (!url.includes(TCB_HOST) || !url.includes(TRANSACTION_PATH)) return;
    if (params.response.status !== 200) {
      if (params.response.status === 401 || params.response.status === 403) {
        await configureAutoSync(false, 4);
      }
      await updateState({ status: 'error', message: `Đã thấy API giao dịch nhưng Techcombank trả về HTTP ${params.response.status}.`, updatedAt: new Date().toISOString() });
      return;
    }
    pendingResponses.set(`${source.tabId}:${params.requestId}`, { tabId: source.tabId, requestId: params.requestId });
    await updateState({ status: 'captured', message: 'Đã thấy API lịch sử giao dịch, đang chờ tải dữ liệu hoàn tất…', updatedAt: new Date().toISOString() });
    return;
  }
  if (method !== 'Network.loadingFinished') return;
  const pendingKey = `${source.tabId}:${params.requestId}`;
  const pending = pendingResponses.get(pendingKey);
  if (!pending) return;
  pendingResponses.delete(pendingKey);
  try {
    const body = await chrome.debugger.sendCommand({ tabId: pending.tabId }, 'Network.getResponseBody', { requestId: pending.requestId });
    const responseText = body.base64Encoded ? atob(body.body) : body.body;
    const parsed = JSON.parse(responseText);
    const transactions = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.transactions)
        ? parsed.transactions
        : Array.isArray(parsed?.data)
          ? parsed.data
          : [];
    if (!transactions.length) throw new Error('Response không chứa danh sách giao dịch');
    await updateState({ status: 'sending', message: `Đã đọc ${transactions.length} giao dịch, đang gửi tới RoFinance…`, updatedAt: new Date().toISOString() });
    const settings = await chrome.storage.local.get(['serverUrl', 'connectorKey']);
    const serverUrl = String(settings.serverUrl || 'https://rof.aprwatch.com').replace(/\/$/, '');
    const response = await fetch(`${serverUrl}/api/tcb/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-rofinance-connector-key': settings.connectorKey || '',
      },
      body: JSON.stringify({ transactions }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `RoFinance HTTP ${response.status}`);
    await updateState({ status: 'success', message: `Đã đọc ${result.received}, ghi mới ${result.recorded ?? result.imported} giao dịch vào RoFinance`, updatedAt: new Date().toISOString() });
  } catch (error) {
    await updateState({ status: 'error', message: error.message || 'Không thể đồng bộ response', updatedAt: new Date().toISOString() });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'START_CAPTURE') return;
  (async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.startsWith(`https://${TCB_HOST}/`)) {
      await chrome.tabs.create({ url: `https://${TCB_HOST}/` });
      throw new Error('Đã mở Techcombank. Hãy đăng nhập, mở lịch sử giao dịch rồi bấm lại Đồng bộ.');
    }
    await ensureCapture(tab.id);
    await configureAutoSync(Boolean(message.autoSync), message.intervalMinutes || 4);
    await updateState({ status: 'listening', message: 'Đang lắng nghe. Sau khi trang tải lại, hãy chọn tài khoản và mở mục lịch sử giao dịch.', updatedAt: new Date().toISOString() });
    await chrome.tabs.reload(tab.id);
    return { success: true };
  })().then(sendResponse).catch(async (error) => {
    await updateState({ status: 'error', message: error.message, updatedAt: new Date().toISOString() });
    sendResponse({ success: false, error: error.message });
  });
  return true;
});
