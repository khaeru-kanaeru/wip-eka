// ==========================================
// 1. FIREBASE DATA ENGINE (FILE-BASED PARTITIONING)
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyDpxgbqlgCbYLKGiKmqw44DMRory_iMFBo",
    authDomain: "e-wip-7ea42.firebaseapp.com",
    databaseURL: "https://e-wip-7ea42-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "e-wip-7ea42",
    storageBucket: "e-wip-7ea42.firebasestorage.app",
    messagingSenderId: "202301603639",
    appId: "1:202301603639:web:24c0ee15102abe3080a4b2"
};

let isFirebaseActive = false;
let db = null;

const CLIENT_INSTANCE_ID = 'ewip_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now();
const lastKnownRunIds = {};
const realtimeUnsubscribers = [];
const realtimeSyncTimers = {};
const realtimePendingKeys = new Set();
let realtimeUiRefreshTimer = null;
let lastRealtimeToastAt = 0;
let lastConsolidatedSyncAt = 0;
let isApplyingRealtimeSync = false;

if(firebaseConfig.apiKey && firebaseConfig.apiKey !== "MASUKKAN_API_KEY_ANDA_DI_SINI") {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    db.settings({ experimentalForceLongPolling: true });
    isFirebaseActive = true;
}

async function saveDB(key, data, progressCb) {
    if (!isFirebaseActive) return;
    try { 
        const serializedData = JSON.stringify(data); 
        const chunkSize = 400000; 
        const chunksCount = Math.ceil(serializedData.length / chunkSize);
        const runId = Date.now().toString() + '_' + Math.random().toString(36).slice(2, 6);

        let oldRunId = null;
        let oldChunksCount = 0;
        try {
            const oldMeta = await db.collection("wip_dashboard").doc(key + "_meta").get();
            if(oldMeta.exists) {
                oldRunId = oldMeta.data().runId;
                oldChunksCount = oldMeta.data().chunks;
            }
        } catch(e) {}

        for (let i = 0; i < chunksCount; i++) {
            let chunkStr = serializedData.substring(i * chunkSize, (i + 1) * chunkSize);
            let retriesChunk = 3;
            while(retriesChunk > 0) {
                try {
                    await db.collection("wip_dashboard").doc(`${key}_${runId}_${i}`).set({ payload: chunkStr });
                    break;
                } catch(e) {
                    retriesChunk--;
                    if(retriesChunk === 0) throw e;
                    await new Promise(r => setTimeout(r, 1500));
                }
            }
            if(progressCb) progressCb(Math.round(((i + 1) / chunksCount) * 100));
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Catat runId lokal sebelum menulis meta agar listener snapshot lokal mengabaikan write sendiri
        lastKnownRunIds[key] = runId;

        let retriesMetaEnd = 3;
        while(retriesMetaEnd > 0) {
            try {
                await db.collection("wip_dashboard").doc(key + "_meta").set({
                    chunks: chunksCount,
                    runId: runId,
                    updatedBy: CLIENT_INSTANCE_ID,
                    updatedAt: Date.now()
                });
                break;
            } catch(e) {
                retriesMetaEnd--;
                if(retriesMetaEnd === 0) throw e;
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        if (oldChunksCount > 0) {
            for(let i = 0; i < oldChunksCount; i++){
                const oldDocId = oldRunId ? `${key}_${oldRunId}_${i}` : `${key}_${i}`;
                try { await db.collection("wip_dashboard").doc(oldDocId).delete(); } catch(e){}
                await new Promise(r => setTimeout(r, 20)); // Memberi jeda napas ke Firebase agar tidak Resource-Exhausted
            }
        }
    } catch(e) { throw e; }
}

async function loadDB(key) {
    if (!isFirebaseActive) return null;
    try { 
        const metaSnap = await db.collection("wip_dashboard").doc(key + "_meta").get();
        if (!metaSnap.exists) {
            const oldSnap = await db.collection("wip_dashboard").doc(key).get();
            if (oldSnap.exists) return JSON.parse(oldSnap.data().payload);
            return null;
        }

        const metaData = metaSnap.data() || {};
        const chunksCount = metaData.chunks;
        const runId = metaData.runId;
        if (runId) lastKnownRunIds[key] = runId;
        let fullString = "";
        
        for (let i = 0; i < chunksCount; i++) {
            const docId = runId ? `${key}_${runId}_${i}` : `${key}_${i}`;
            const chunkSnap = await db.collection("wip_dashboard").doc(docId).get();
            if (chunkSnap.exists) {
                fullString += chunkSnap.data().payload;
            } else { return null; }
        }
        return JSON.parse(fullString);
    } catch(e) { return null; }
}

// ==========================================
// 1B. REALTIME DATABASE SYNC ENGINE
// ==========================================
const REALTIME_SYNC_KEYS = [
    'consolidated_master',
    'uploaded_master_files',
    'uploaded_wip_files',
    'stwc_settings',
    'sh_materials',
    'daily_history',
    'assy_paylater',
    'assy_rocket',
    'global_cutoff_key',
    'global_delay_key',
    'master_headers',
    'last_wip_date'
];

function scheduleRealtimeUiRefresh() {
    if (realtimeUiRefreshTimer) clearTimeout(realtimeUiRefreshTimer);
    realtimeUiRefreshTimer = setTimeout(() => {
        realtimeUiRefreshTimer = null;
        const changedKeys = Array.from(realtimePendingKeys);
        realtimePendingKeys.clear();
        if (changedKeys.length === 0) return;

        isApplyingRealtimeSync = true;
        try {
            const needsDeps = changedKeys.some(k =>
                k === 'consolidated_master' ||
                k === 'uploaded_master_files' ||
                k === 'uploaded_wip_files' ||
                k === 'stwc_settings'
            );
            const needsThresholds = needsDeps || changedKeys.includes('global_cutoff_key') || changedKeys.includes('global_delay_key');
            const needsHeaders = changedKeys.includes('master_headers');

            if (needsDeps && typeof updateWipDependencies === 'function') updateWipDependencies();
            if (needsThresholds && typeof updateGlobalThresholdUI === 'function') updateGlobalThresholdUI();
            if (needsHeaders && typeof setupControlHeaders === 'function') {
                try { setupControlHeaders(); } catch(e) {}
            }
            if (typeof updateInputStats === 'function') updateInputStats();
            if (typeof renderUploadedFiles === 'function') renderUploadedFiles();
            safeSetText('info-master-count', globalMasterData.length.toLocaleString() + ' Assy');

            const activeTab = window.currentActiveTab || 'overview';
            if (activeTab === 'overview' && typeof renderOverviewDashboard === 'function') {
                renderOverviewDashboard();
            } else if (activeTab === 'report' && typeof renderReportWIP === 'function') {
                renderReportWIP();
            } else if (activeTab === 'control') {
                if (typeof renderControlPeriodeTabs === 'function') renderControlPeriodeTabs();
                if (typeof renderControlOutstanding === 'function') renderControlOutstanding();
            } else if (activeTab === 'sh' && typeof renderShMaterials === 'function') {
                renderShMaterials();
            } else if (activeTab === 'paylater' && typeof renderPaylaterTable === 'function') {
                renderPaylaterTable();
            } else if (activeTab === 'rocket' && typeof renderRocketTable === 'function') {
                renderRocketTable();
            }

            if (window.lucide) window.lucide.createIcons();

            const overlay = document.getElementById('loading-overlay');
            const isOverlayVisible = overlay && !overlay.classList.contains('hidden');
            const now = Date.now();
            if (!isOverlayVisible && now - lastRealtimeToastAt > 4500 && typeof showToast === 'function') {
                lastRealtimeToastAt = now;
                showToast('Data diperbarui secara realtime.', 'info');
            }
        } catch(err) {
            console.warn('Realtime UI refresh error:', err);
        } finally {
            isApplyingRealtimeSync = false;
        }
    }, 280);
}

async function applyRemoteKeySync(key) {
    try {
        const val = await loadDB(key);
        if (key === 'consolidated_master') {
            if (Array.isArray(val)) {
                globalMasterData = val;
                lastConsolidatedSyncAt = Date.now();
            }
        } else if (key === 'uploaded_master_files') {
            uploadedMasterFiles = Array.isArray(val) ? val : [];
            if (Date.now() - lastConsolidatedSyncAt > 3000) {
                if (uploadedMasterFiles.length === 0) {
                    globalMasterData = [];
                } else {
                    const results = await Promise.all(uploadedMasterFiles.map(f => loadDB('master_file_' + f)));
                    const merged = [];
                    results.forEach(arr => { if (Array.isArray(arr) && arr.length > 0) merged.push(...arr); });
                    if (merged.length > 0) globalMasterData = merged;
                }
            }
        } else if (key === 'uploaded_wip_files') {
            uploadedWipFiles = Array.isArray(val) ? val : [];
            if (uploadedWipFiles.length === 0) {
                globalWipData = [];
            } else {
                const wipResults = await Promise.all(uploadedWipFiles.map(f => loadDB('wip_file_' + f)));
                const mergedWip = [];
                wipResults.forEach(arr => { if (Array.isArray(arr) && arr.length > 0) mergedWip.push(...arr); });
                globalWipData = mergedWip;
            }
        } else if (key === 'stwc_settings') {
            globalSTWCSettings = (val && typeof val === 'object') ? val : {};
        } else if (key === 'sh_materials') {
            globalShMaterials = Array.isArray(val) ? val : [];
        } else if (key === 'daily_history') {
            dailyHistory = Array.isArray(val) ? val : [];
        } else if (key === 'assy_paylater') {
            globalAssyPaylater = Array.isArray(val) ? val : [];
        } else if (key === 'assy_rocket') {
            globalAssyRocket = Array.isArray(val) ? val : [];
        } else if (key === 'global_cutoff_key') {
            globalCutoffPWKey = val || null;
        } else if (key === 'global_delay_key') {
            globalDelayPWKey = val || null;
        } else if (key === 'master_headers') {
            masterHeaders = sanitizeHeaders(val);
            masterHeadersSet.clear();
            masterHeaders.forEach(h => masterHeadersSet.add(h));
        } else if (key === 'last_wip_date') {
            // Tracked for day transitions across clients
        }

        realtimePendingKeys.add(key);
        scheduleRealtimeUiRefresh();
    } catch(err) {
        console.warn('Realtime sync fetch failed for key:', key, err);
    }
}

function initRealtimeSyncListeners() {
    if (!isFirebaseActive || !db) return;
    while (realtimeUnsubscribers.length > 0) {
        try { realtimeUnsubscribers.pop()(); } catch(e) {}
    }

    REALTIME_SYNC_KEYS.forEach((key) => {
        let isInitialEvent = true;
        const unsub = db.collection("wip_dashboard").doc(key + "_meta").onSnapshot((doc) => {
            if (isInitialEvent) {
                isInitialEvent = false;
                if (doc.exists) {
                    const initialRun = (doc.data() || {}).runId;
                    if (initialRun && !lastKnownRunIds[key]) lastKnownRunIds[key] = initialRun;
                }
                return;
            }
            if (!doc.exists) return;
            const meta = doc.data() || {};
            if (meta.updatedBy === CLIENT_INSTANCE_ID) return;
            if (meta.runId && lastKnownRunIds[key] === meta.runId) return;

            lastKnownRunIds[key] = meta.runId || ('remote_' + Date.now());
            if (realtimeSyncTimers[key]) clearTimeout(realtimeSyncTimers[key]);
            realtimeSyncTimers[key] = setTimeout(() => {
                delete realtimeSyncTimers[key];
                applyRemoteKeySync(key);
            }, 350);
        }, (err) => {
            console.warn('Realtime listener warning for ' + key + ':', err);
        });
        realtimeUnsubscribers.push(unsub);
    });
}

async function syncMasterToCloud(globalProgressCb) {
    let groups = {};
    globalMasterData.forEach(m => {
        let f = m._sourceFile || 'unknown_master.xlsx';
        if(!groups[f]) groups[f] = [];
        groups[f].push(m);
    });
    let validFiles = Object.keys(groups);
    for(let i=0; i<validFiles.length; i++) {
        let f = validFiles[i];
        await saveDB('master_file_' + f, groups[f], (pct) => {
            if(globalProgressCb) globalProgressCb(Math.round(((i * 100) + pct) / validFiles.length));
        });
        if(!uploadedMasterFiles.includes(f)) uploadedMasterFiles.push(f);
    }
    uploadedMasterFiles = uploadedMasterFiles.filter(f => validFiles.includes(f));
    await saveDB('uploaded_master_files', uploadedMasterFiles);
}

async function syncWipToCloud(globalProgressCb) {
    let groups = {};
    globalWipData.forEach(m => {
        let f = m._sourceFile || 'unknown_wip.xlsx';
        if(!groups[f]) groups[f] = [];
        groups[f].push(m);
    });
    let validFiles = Object.keys(groups);
    for(let i=0; i<validFiles.length; i++) {
        let f = validFiles[i];
        await saveDB('wip_file_' + f, groups[f], (pct) => {
            if(globalProgressCb) globalProgressCb(Math.round(((i * 100) + pct) / validFiles.length));
        });
        if(!uploadedWipFiles.includes(f)) uploadedWipFiles.push(f);
    }
    uploadedWipFiles = uploadedWipFiles.filter(f => validFiles.includes(f));
    await saveDB('uploaded_wip_files', uploadedWipFiles);
}

// ==========================================
// 2. GLOBALS & HELPERS (Termasuk Auth & PIN)
// ==========================================
const AUTH_PROFILES = {
    '110603': 'Adysti E.A.',
    '050205': 'MCL',
    '010625': 'PPIC',
    '111111': 'Admin Ganteng',
    '111222': 'Hamdan Fadhly',
    '222111': 'Slamet Arifin',
    '121212': 'Angga Erlangga Braja',
    '212121': 'Kurniawan Nugraha',
    '122122': 'Ismail Nuryadin',
    '221221': 'Acep Kunaepi',
    '122221': 'Wahmi Maulana',
    '211112': 'Yuyus'
};

let activeUserPin = null;
let pendingAuthCallback = null;
let pendingAllowedPins = [];

window.requireAccess = function(allowedPins, callback) {
    // Mewariskan Hak Akses Adysti E.A ke Tim Baru secara dinamis
    let finalAllowed = [...allowedPins];
    if (finalAllowed.includes('110603')) {
        finalAllowed.push('111222', '222111', '121212', '212121', '122122', '221221', '122221', '211112');
    }

    if (activeUserPin && finalAllowed.includes(activeUserPin)) {
        callback();
    } else {
        pendingAllowedPins = finalAllowed;
        pendingAuthCallback = callback;
        document.getElementById('auth-pin-input').value = '';
        document.getElementById('auth-modal').classList.remove('hidden');
        setTimeout(() => document.getElementById('auth-pin-input').focus(), 100);
    }
};

window.closeAuthModal = function() {
    document.getElementById('auth-modal').classList.add('hidden');
    pendingAuthCallback = null;
    pendingAllowedPins = [];
};

window.submitAuth = function() {
    let pin = document.getElementById('auth-pin-input').value;
    if (pendingAllowedPins.includes(pin)) {
        activeUserPin = pin;
        let userName = AUTH_PROFILES[pin];
        showToast(`Akses Diberikan. Halo, ${userName}!`, 'success');
        closeAuthModal();
        updateGreetings();
        if (pendingAuthCallback) pendingAuthCallback();
    } else {
        showToast('PIN Salah atau Akses Ditolak!', 'error');
    }
};

window.logoutAuth = function() {
    activeUserPin = null;
    updateGreetings();
    switchTab('overview');
    showToast('Sesi diakhiri.', 'info');
};

window.lastDuckRainTime = 0;
window.triggerDuckRain = function() {
    // Mencegah spam jika sedang hujan bebek
    if(document.querySelectorAll('.duck-rain').length > 0) return;
    
    for(let i = 0; i < 40; i++) {
        let duck = document.createElement('div');
        duck.innerText = '🍗';
        duck.className = 'duck-rain';
        duck.style.left = (Math.random() * 100) + 'vw';
        let duration = Math.random() * 2 + 1.5; // Jatuh dalam waktu 1.5s sampai 3.5s
        duck.style.animationDuration = duration + 's';
        duck.style.fontSize = (Math.random() * 1.5 + 1.5) + 'rem';
        document.body.appendChild(duck);
        
        setTimeout(() => duck.remove(), duration * 1000); // Bersihkan setelah selesai jatuh
    }
};

const SH_ACTION_PINS = [
    '110603', '111111', '111222', '222111', '121212',
    '212121', '122122', '221221', '122221', '211112'
];
const SH_BATCH_REMARKS_PINS = ['010625', '111111', '050205'];

window.updateShActionButtonsVisibility = function() {
    const isLoggedIn = Boolean(activeUserPin);
    const canUseShActions = Boolean(activeUserPin && SH_ACTION_PINS.includes(activeUserPin));
    const canUseBatchRemarks = Boolean(activeUserPin && SH_BATCH_REMARKS_PINS.includes(activeUserPin));

    const loginBtn = document.getElementById('btn-sh-login');
    if (loginBtn) loginBtn.classList.toggle('hidden', isLoggedIn);

    ['btn-sh-refresh-all', 'btn-sh-batch-confirm', 'btn-sh-batch-input', 'btn-sh-single-input'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('hidden', !canUseShActions);
    });

    const remarksBtn = document.getElementById('btn-sh-batch-remarks');
    if (remarksBtn) remarksBtn.classList.toggle('hidden', !canUseBatchRemarks);
};

window.updateGreetings = function() {
    const userName = activeUserPin ? AUTH_PROFILES[activeUserPin] : null;
    const greetHtml = userName ? `<div class="flex items-center gap-2 bg-white border border-gray-200 px-3 py-1.5 rounded-lg shadow-sm"><span class="text-[10px] text-gray-700 font-bold">Halo, <span class="text-brand-600">${userName}</span></span><button onclick="logoutAuth()" class="text-[9px] bg-red-50 text-red-600 px-2 py-0.5 rounded hover:bg-red-100 font-bold transition shadow-sm">Logout</button></div>` : '';
    
    safeSetHTML('greet-master', greetHtml);
    safeSetHTML('greet-input', greetHtml);
    safeSetHTML('greet-sh', greetHtml);
    safeSetHTML('greet-rocket', greetHtml);
    safeSetHTML('greet-control', greetHtml);
    window.updateShActionButtonsVisibility();
};


const MCL_CONFIRM_OPTIONS = [
    '', 'Confirming', 'Increasing', 'Ready Stock PP', 'ETA',
    'Persamaan', 'Deviasi', 'Arriving', 'New Part', 'Lain-lain'
];

window.openBatchRemarksModal = function() {
    const openItems = globalShMaterials.filter(sh => sh.tanggalKedatangan === null);
    safeSetText('brm-open-count', `${openItems.length} Material OPEN`);
    const searchEl = document.getElementById('brm-search-input');
    if (searchEl) searchEl.value = '';

    if (openItems.length === 0) {
        safeSetHTML('brm-tbody', `<tr><td colspan="6" class="text-center p-8 text-gray-400 font-medium">Tidak ada material SH berstatus OPEN saat ini.</td></tr>`);
    } else {
        const html = openItems.map(sh => {
            const mclOpts = MCL_CONFIRM_OPTIONS.map(opt => {
                const sel = (sh.konfirmasiMcl || '') === opt ? 'selected' : '';
                return `<option value="${opt}" ${sel}>${opt || '- Set Status -'}</option>`;
            }).join('');
            const assyCount = sh.targetUids ? sh.targetUids.length : 0;

            return `
            <tr class="brm-row hover:bg-violet-50/50 transition" data-sh-id="${sh.id}">
                <td class="p-2 align-middle">
                    <div class="font-black text-gray-800 text-[11px]">${sh.partName || '-'}</div>
                    <div class="text-[9px] text-gray-500">ID: ${sh.itemId || '-'}</div>
                </td>
                <td class="p-2 text-center font-bold text-gray-600 text-[10px] align-middle">${sh.type || '-'}</td>
                <td class="p-2 text-right font-bold text-indigo-700 text-[10px] align-middle">${assyCount} Assy</td>
                <td class="p-2 align-middle">
                    <select class="brm-mcl w-full text-[10px] border border-gray-300 rounded px-2 py-1.5 bg-white font-bold text-gray-800 outline-none focus:border-violet-500">${mclOpts}</select>
                </td>
                <td class="p-2 align-middle">
                    <input type="date" class="brm-est w-full text-[10px] border border-gray-300 rounded px-2 py-1.5 bg-white font-bold text-gray-800 outline-none focus:border-violet-500" value="${sh.estimasiKedatangan || ''}">
                </td>
                <td class="p-2 align-middle">
                    <input type="text" class="brm-remark w-full text-[11px] border border-gray-300 rounded px-2.5 py-1.5 bg-white text-gray-800 outline-none focus:border-violet-500" placeholder="Paste / ketik remarks baru...">
                </td>
            </tr>`;
        }).join('');
        safeSetHTML('brm-tbody', html);
    }

    document.getElementById('sh-batch-remarks-modal').classList.remove('hidden');
    lucide.createIcons();
};

window.closeBatchRemarksModal = function() {
    const modal = document.getElementById('sh-batch-remarks-modal');
    if (modal) modal.classList.add('hidden');
};

window.filterBatchRemarksRows = function() {
    const q = (document.getElementById('brm-search-input')?.value || '').toLowerCase().trim();
    document.querySelectorAll('#brm-tbody .brm-row').forEach(row => {
        const txt = row.innerText.toLowerCase();
        row.style.display = (!q || txt.includes(q)) ? '' : 'none';
    });
};

window.saveBatchRemarks = async function() {
    const btn = document.getElementById('btn-save-batch-remarks');
    const origHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Menyimpan...';
        lucide.createIcons();
    }

    setLoaderState('Menyimpan Batch Remarks...', 'Memperbarui Remarks, Konfirmasi MCL & Estimasi', 40, 'Proses Batch');
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.remove('hidden');

    try {
        const senderName = activeUserPin ? (AUTH_PROFILES[activeUserPin] || 'PPIC') : 'PPIC';
        const now = new Date();
        const timeStr = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) + ' ' + now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

        let updatedCount = 0;
        document.querySelectorAll('#brm-tbody .brm-row').forEach(row => {
            const shId = Number(row.getAttribute('data-sh-id'));
            const sh = globalShMaterials.find(x => Number(x.id) === shId);
            if (!sh) return;

            const newMcl = row.querySelector('.brm-mcl')?.value || null;
            const newEst = row.querySelector('.brm-est')?.value || null;
            const newRemark = (row.querySelector('.brm-remark')?.value || '').trim();

            let rowChanged = false;
            if ((sh.konfirmasiMcl || null) !== newMcl) {
                sh.konfirmasiMcl = newMcl;
                rowChanged = true;
            }
            if ((sh.estimasiKedatangan || null) !== newEst) {
                sh.estimasiKedatangan = newEst;
                rowChanged = true;
            }
            if (newRemark) {
                if (!Array.isArray(sh.remarksLog)) sh.remarksLog = [];
                sh.remarksLog.push({ sender: senderName, message: newRemark, time: timeStr });
                rowChanged = true;
            }
            if (rowChanged) updatedCount++;
        });

        if (updatedCount === 0) {
            showToast('Tidak ada perubahan yang diisi.', 'info');
            return;
        }

        setLoaderState('Menyimpan Batch Remarks...', 'Menyinkronkan ke Cloud Database', 80, `${updatedCount} material`);
        await saveDB('sh_materials', globalShMaterials);
        setLoaderState('Menyimpan Batch Remarks...', 'Selesai', 100, 'Complete');

        renderShMaterials();
        if (document.getElementById('view-overview') && !document.getElementById('view-overview').classList.contains('hidden')) renderOverviewDashboard();
        if (document.getElementById('view-report') && !document.getElementById('view-report').classList.contains('hidden')) renderReportWIP();
        if (document.getElementById('view-control') && !document.getElementById('view-control').classList.contains('hidden')) renderControlOutstanding();

        closeBatchRemarksModal();
        showToast(`Berhasil memperbarui ${updatedCount} material SH (Batch Remarks).`, 'success');
    } catch (e) {
        console.error(e);
        showToast('Gagal menyimpan Batch Remarks: ' + e.message, 'error');
    } finally {
        if (overlay) overlay.classList.add('hidden');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = origHtml;
            lucide.createIcons();
        }
    }
};

let globalMasterData = []; 
let globalWipData = [];    
let globalShMaterials = [];
let globalSTWCSettings = {};
let dailyHistory = [];
let controlFilters = {};

let globalUniquePeriodeWPP = []; 
let globalCutoffPWKey = null; 
let globalDelayPWKey = null;  

	let globalChatData = [];
let lastReadChatCount = 0;
let globalAssyRocket = [];
	let globalAssyPaylater = [];

// ==========================================
// MESIN PENDETEKSI IDLE (AFK TIMEOUT)
// ==========================================
let idleMinutes = 0;
const IDLE_LIMIT = 30; // Batas 30 Menit
let idleInterval;

function resetIdleTimer() { idleMinutes = 0; }

function initIdleDetection() {
    // Deteksi semua aktivitas fisik pengguna
    ['mousemove', 'mousedown', 'keypress', 'touchstart', 'scroll'].forEach(evt => 
        window.addEventListener(evt, resetIdleTimer, true)
    );

    idleInterval = setInterval(() => {
        idleMinutes++;
        if (idleMinutes >= IDLE_LIMIT) {
            clearInterval(idleInterval);
            isFirebaseActive = false; // Putus paksa koneksi Firebase agar tidak error di background
            document.getElementById('idle-modal').classList.remove('hidden');
            lucide.createIcons();
        }
    }, 60000); // Berdetak setiap 1 menit (60.000 ms)
}

let uploadedMasterFiles = [];
let uploadedWipFiles = [];
let masterHeadersSet = new Set();

let activePeriodeTab = 'ALL';
let activeOverviewCat = 'ALL';
let activeOverdueWP = 'ALL'; 
let activeClosedWP = 'ALL'; 

let masterHeaders = []; 
let charts = {}; 

const CATEGORIES = ['ADD', 'CAT', 'REG', 'SMC', 'SMV'];
const dateKeywords = ['STWC', 'TANGGAL', 'DATE', 'HOUSING', 'ASSEMBLING', 'VISUAL', 'CHECKER', 'FINISHING', 'PREDEL', 'RFG'];

function getAvgQtyOutlierEliminated(qtyArray) {
    let valid = qtyArray.map(v => parseFloat(v)).filter(v => !isNaN(v) && v > 0);
    if(valid.length === 0) return 0;
    if(valid.length < 3) return Math.round(valid.reduce((a,b)=>a+b,0)/valid.length);
    let mean = valid.reduce((a,b)=>a+b,0)/valid.length;
    let variance = valid.reduce((a,b)=>a + Math.pow(b-mean, 2), 0) / valid.length;
    let stdDev = Math.sqrt(variance);
    let filtered = valid.filter(v => v >= mean - stdDev && v <= mean + stdDev);
    if(filtered.length === 0) return Math.round(mean);
    return Math.round(filtered.reduce((a,b)=>a+b,0)/filtered.length);
}

window.clearColumnFilter = function(colName) {
    delete controlFilters[colName]; setupControlHeaders(); 
};
window.clearAllFilters = function() {
    controlFilters = {}; activePeriodeTab = 'ALL'; setupControlHeaders();
};
window.filterThisItemOnly = function(colIdx, val, colName) {
    document.querySelectorAll(`.filter-checkbox[data-col-idx="${colIdx}"]`).forEach(cb => cb.checked = false);
    let targetCb = document.querySelector(`.filter-checkbox[data-col-idx="${colIdx}"][value="${val.replace(/"/g, '&quot;')}"]`);
    if(targetCb) targetCb.checked = true;
    updateCheckboxFilters(colIdx);
};

// =========================================================
// INDONESIAN BATIK CANVAS PATTERN & CHART ART ENGINE
// =========================================================
const _batikPatternCache = {};
function createBatikPattern(motif, baseColor, strokeColor, accentColor) {
    const key = `${motif}_${baseColor}_${strokeColor}_${accentColor}`;
    if (_batikPatternCache[key]) return _batikPatternCache[key];

    const size = 28;
    const dpr = 2;
    const pCanvas = document.createElement('canvas');
    pCanvas.width = size * dpr;
    pCanvas.height = size * dpr;
    const pctx = pCanvas.getContext('2d');
    pctx.scale(dpr, dpr);

    // Base sogan/jewel fill
    pctx.fillStyle = baseColor;
    pctx.fillRect(0, 0, size, size);

    pctx.strokeStyle = strokeColor;
    pctx.fillStyle = strokeColor;
    pctx.lineWidth = 1.05;

    if (motif === 'kawung') {
        // Batik Kawung: Four interlocking golden palm-fruit ellipses + cecek
        const cx = size / 2, cy = size / 2;
        const drawKawungPetal = (x, y, ang) => {
            pctx.save();
            pctx.translate(x, y);
            pctx.rotate(ang);
            pctx.beginPath();
            pctx.ellipse(0, 0, 7.2, 3.6, 0, 0, Math.PI * 2);
            pctx.stroke();
            pctx.fillStyle = accentColor;
            pctx.beginPath();
            pctx.arc(0, 0, 1.05, 0, Math.PI * 2);
            pctx.fill();
            pctx.restore();
        };
        drawKawungPetal(cx / 2, cy / 2, Math.PI / 4);
        drawKawungPetal(cx + cx / 2, cy / 2, -Math.PI / 4);
        drawKawungPetal(cx / 2, cy + cy / 2, -Math.PI / 4);
        drawKawungPetal(cx + cx / 2, cy + cy / 2, Math.PI / 4);
        pctx.fillStyle = strokeColor;
        pctx.beginPath();
        pctx.arc(cx, cy, 1.8, 0, Math.PI * 2);
        pctx.fill();
    } else if (motif === 'parang') {
        // Batik Parang: Diagonal wave blades + mlinjon diamond seeds
        pctx.lineWidth = 1.3;
        for (let offset = -size; offset <= size * 2; offset += 14) {
            pctx.beginPath();
            pctx.moveTo(offset, size);
            pctx.bezierCurveTo(offset + 5, size * 0.65, offset + 9, size * 0.35, offset + 14, 0);
            pctx.stroke();
            // Mlinjon diamond between waves
            pctx.fillStyle = accentColor;
            pctx.beginPath();
            pctx.moveTo(offset + 7, size * 0.5 - 2.4);
            pctx.lineTo(offset + 9.4, size * 0.5);
            pctx.lineTo(offset + 7, size * 0.5 + 2.4);
            pctx.lineTo(offset + 4.6, size * 0.5);
            pctx.closePath();
            pctx.fill();
        }
    } else if (motif === 'nitik') {
        // Batik Nitik: Woven gold stippled cross-dots & diamond frame
        pctx.lineWidth = 0.9;
        pctx.beginPath();
        pctx.moveTo(size / 2, 2); pctx.lineTo(size - 2, size / 2);
        pctx.lineTo(size / 2, size - 2); pctx.lineTo(2, size / 2);
        pctx.closePath();
        pctx.stroke();
        const pts = [[size/2, size/2], [size/2-4, size/2], [size/2+4, size/2], [size/2, size/2-4], [size/2, size/2+4], [2,2], [size-2,2], [2,size-2], [size-2,size-2]];
        pctx.fillStyle = accentColor;
        pts.forEach(([px, py]) => {
            pctx.beginPath();
            pctx.arc(px, py, 1.25, 0, Math.PI * 2);
            pctx.fill();
        });
    } else if (motif === 'ceplok') {
        // Batik Ceplok: 8-petal star lotus rosette
        const cx = size / 2, cy = size / 2;
        pctx.lineWidth = 1;
        for (let i = 0; i < 4; i++) {
            pctx.save();
            pctx.translate(cx, cy);
            pctx.rotate((i * Math.PI) / 4);
            pctx.beginPath();
            pctx.ellipse(0, 0, 9.5, 2.6, 0, 0, Math.PI * 2);
            pctx.stroke();
            pctx.restore();
        }
        pctx.fillStyle = accentColor;
        pctx.beginPath();
        pctx.arc(cx, cy, 2.3, 0, Math.PI * 2);
        pctx.fill();
    }

    const dummyCtx = document.createElement('canvas').getContext('2d');
    const pattern = dummyCtx.createPattern(pCanvas, 'repeat');
    if (pattern && typeof pattern.setTransform === 'function') {
        const mat = new DOMMatrix();
        mat.scaleSelf(1 / dpr, 1 / dpr);
        pattern.setTransform(mat);
    }
    _batikPatternCache[key] = pattern || baseColor;
    return _batikPatternCache[key];
}

function getActiveChartTheme() {
    return (window.getThemeConfig ? window.getThemeConfig() : null)?.chart || {
        plotBgTop: 'rgba(32, 19, 11, 0.55)',
        plotBgBottom: 'rgba(18, 10, 5, 0.72)',
        plotWatermark: 'rgba(212, 168, 67, 0.065)',
        plotCorners: 'rgba(244, 212, 124, 0.42)',
        gridColor: 'rgba(212, 168, 67, 0.14)',
        borderColor: 'rgba(212, 168, 67, 0.32)',
        tickColor: '#d6be93',
        tooltipBg: 'rgba(23, 13, 7, 0.96)',
        tooltipBorder: '#d4a843',
        tooltipTitle: '#f4d47c',
        tooltipBody: '#f7ebd4',
        delayZoneBg: 'rgba(145, 28, 28, 0.24)',
        delayZoneHatch: 'rgba(229, 169, 68, 0.14)',
        delayDivider: '#e8be59',
        delayLabel: '#fda4af',
        donutCenterBg: '#190e07',
        donutRingOuter: 'rgba(244, 212, 124, 0.65)',
        donutRingInner: 'rgba(212, 168, 67, 0.35)',
        donutRays: 'rgba(244, 212, 124, 0.45)',
        donutPctColor: '#f4d47c',
        donutSubColor: '#cbb184'
    };
}

const batikChartPlugin = {
    id: 'batikChartArt',
    beforeDraw: (chart) => {
        const { ctx, chartArea, config } = chart;
        if (!chartArea) return;
        const ct = getActiveChartTheme();
        const { left, top, right, bottom, width, height } = chartArea;
        if (config.type === 'bar' || config.type === 'line') {
            ctx.save();
            ctx.beginPath();
            ctx.rect(left, top, width, height);
            ctx.clip();

            const bgGrad = ctx.createLinearGradient(0, top, 0, bottom);
            bgGrad.addColorStop(0, ct.plotBgTop);
            bgGrad.addColorStop(1, ct.plotBgBottom);
            ctx.fillStyle = bgGrad;
            ctx.fillRect(left, top, width, height);

            if (ct.plotWatermark) {
                ctx.strokeStyle = ct.plotWatermark;
                ctx.lineWidth = 0.9;
                if (ct.plotWatermarkStyle === 'uzumaki') {
                    // Royal Japanese Uzumaki (golden spiral) & Kumo (cloud wave) subtle plot motif
                    const stepX = 68;
                    const stepY = 56;
                    for (let x = left + 20; x < right + stepX; x += stepX) {
                        for (let y = top + 20; y < bottom + stepY; y += stepY) {
                            ctx.beginPath();
                            for (let a = 0; a < Math.PI * 3.6; a += 0.28) {
                                const r = 1.4 + a * 1.15;
                                const px = x + Math.cos(a) * r;
                                const py = y + Math.sin(a) * r;
                                if (a === 0) ctx.moveTo(px, py);
                                else ctx.lineTo(px, py);
                            }
                            ctx.stroke();

                            // Delicate Kumo cloud arc offset between spirals
                            const cx = x + stepX * 0.5;
                            const cy = y + stepY * 0.45;
                            ctx.beginPath();
                            ctx.arc(cx - 7, cy, 5, Math.PI, 0);
                            ctx.arc(cx, cy - 2, 6, Math.PI * 1.05, Math.PI * -0.05);
                            ctx.arc(cx + 7, cy, 5, Math.PI, 0);
                            ctx.stroke();
                        }
                    }
                } else {
                    const step = 36;
                    for (let x = left; x < right + step; x += step) {
                        for (let y = top; y < bottom + step; y += step) {
                            ctx.beginPath();
                            ctx.arc(x, y, 8, 0, Math.PI * 2);
                            ctx.stroke();
                            ctx.beginPath();
                            ctx.moveTo(x - 4, y); ctx.lineTo(x + 4, y);
                            ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4);
                            ctx.stroke();
                        }
                    }
                }
            }

            if (ct.plotCorners) {
                ctx.strokeStyle = ct.plotCorners;
                ctx.lineWidth = 1.4;
                const bLen = 10;
                ctx.beginPath();
                ctx.moveTo(left + 2, top + bLen); ctx.lineTo(left + 2, top + 2); ctx.lineTo(left + bLen, top + 2);
                ctx.moveTo(right - bLen, top + 2); ctx.lineTo(right - 2, top + 2); ctx.lineTo(right - 2, top + bLen);
                ctx.moveTo(left + 2, bottom - bLen); ctx.lineTo(left + 2, bottom - 2); ctx.lineTo(left + bLen, bottom - 2);
                ctx.moveTo(right - bLen, bottom - 2); ctx.lineTo(right - 2, bottom - 2); ctx.lineTo(right - 2, bottom - bLen);
                ctx.stroke();
            }
            ctx.restore();
        }
    },
    afterDatasetsDraw: (chart) => {
        if (chart.config.type !== 'doughnut') return;
        const meta = chart.getDatasetMeta(0);
        if (!meta || !meta.data || !meta.data.length) return;
        const firstArc = meta.data[0];
        const cx = firstArc.x;
        const cy = firstArc.y;
        const innerR = firstArc.innerRadius || 0;
        if (innerR < 18) return;

        const ct = getActiveChartTheme();
        const ctx = chart.ctx;
        ctx.save();

        ctx.beginPath();
        ctx.arc(cx, cy, innerR - 2, 0, Math.PI * 2);
        ctx.fillStyle = ct.donutCenterBg;
        ctx.fill();

        if (ct.donutRingOuter) {
            ctx.strokeStyle = ct.donutRingOuter;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.arc(cx, cy, innerR - 3.5, 0, Math.PI * 2);
            ctx.stroke();
        }

        if (ct.donutRingInner) {
            ctx.strokeStyle = ct.donutRingInner;
            ctx.lineWidth = 0.9;
            ctx.setLineDash([2.5, 2.5]);
            ctx.beginPath();
            ctx.arc(cx, cy, innerR - 7.5, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        if (ct.donutRays) {
            ctx.fillStyle = ct.donutRays;
            for (let i = 0; i < 8; i++) {
                const ang = (i * Math.PI) / 4;
                const rOut = innerR - 4;
                const rIn = innerR - 11;
                const spread = 0.14;
                ctx.beginPath();
                ctx.moveTo(cx + Math.cos(ang) * rOut, cy + Math.sin(ang) * rOut);
                ctx.lineTo(cx + Math.cos(ang - spread) * rIn, cy + Math.sin(ang - spread) * rIn);
                ctx.lineTo(cx + Math.cos(ang + spread) * rIn, cy + Math.sin(ang + spread) * rIn);
                ctx.closePath();
                ctx.fill();
            }
        }

        const rawVals = chart.data.datasets[0]?.data || [];
        const total = rawVals.reduce((a, b) => a + (Number(b) || 0), 0);
        const onSchedSum = (Number(rawVals[2]) || 0) + (Number(rawVals[3]) || 0);
        const pct = total > 0 ? Math.round((onSchedSum / total) * 100) : 0;

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const numFontSize = Math.max(12, Math.min(22, Math.round(innerR * 0.44)));
        ctx.font = `800 ${numFontSize}px "JetBrains Mono", monospace`;
        ctx.fillStyle = ct.donutPctColor;
        ctx.fillText(`${pct}%`, cx, cy - numFontSize * 0.14);

        const subFontSize = Math.max(7, Math.min(10, Math.round(innerR * 0.17)));
        ctx.font = `700 ${subFontSize}px "Plus Jakarta Sans", "Inter", sans-serif`;
        ctx.fillStyle = ct.donutSubColor;
        ctx.fillText('ON SCHED', cx, cy + numFontSize * 0.58);

        ctx.restore();
    }
};

const thresholdBgPlugin = {
    id: 'thresholdBg',
    beforeDatasetsDraw: (chart) => {
        if (!chart.canvas.id.includes('chartLine')) return;
        const ct = getActiveChartTheme();
        const ctx = chart.ctx; const chartArea = chart.chartArea; const xAxis = chart.scales.x;
        let delayIndex = globalUniquePeriodeWPP.indexOf(globalDelayPWKey);
        let cutoffIndex = globalUniquePeriodeWPP.indexOf(globalCutoffPWKey);
        if(cutoffIndex === -1) cutoffIndex = 0;
        if(delayIndex === -1) delayIndex = 0;
        
        let activeDelayIndex = delayIndex - cutoffIndex;
        if(activeDelayIndex <= 0) return; 
        
        let splitPixel = chartArea.left;
        if (activeDelayIndex > 0 && activeDelayIndex < xAxis.ticks.length) {
            let tickPix = xAxis.getPixelForTick(activeDelayIndex); 
            let prevTickPix = xAxis.getPixelForTick(activeDelayIndex - 1);
            splitPixel = prevTickPix + (tickPix - prevTickPix) / 2;
        } else if (activeDelayIndex >= xAxis.ticks.length) {
            splitPixel = chartArea.right;
        }

        ctx.save();
        if (splitPixel > chartArea.left) {
            const zoneW = splitPixel - chartArea.left;
            const zoneH = chartArea.bottom - chartArea.top;
            ctx.beginPath();
            ctx.rect(chartArea.left, chartArea.top, zoneW, zoneH);
            ctx.clip();

            ctx.fillStyle = ct.delayZoneBg;
            ctx.fillRect(chartArea.left, chartArea.top, zoneW, zoneH);

            if (ct.delayZoneHatch) {
                ctx.strokeStyle = ct.delayZoneHatch;
                ctx.lineWidth = 1.2;
                for (let x = chartArea.left - zoneH; x < splitPixel + zoneH; x += 14) {
                    ctx.beginPath();
                    ctx.moveTo(x, chartArea.bottom);
                    ctx.lineTo(x + zoneH, chartArea.top);
                    ctx.stroke();
                }
            }
            ctx.restore();

            ctx.save();
            ctx.strokeStyle = ct.delayDivider;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([5, 4]);
            ctx.beginPath();
            ctx.moveTo(splitPixel, chartArea.top);
            ctx.lineTo(splitPixel, chartArea.bottom);
            ctx.stroke();
            ctx.setLineDash([]);

            if (zoneW > 68) {
                ctx.font = '700 8px "Plus Jakarta Sans", "Inter", sans-serif';
                ctx.fillStyle = ct.delayLabel;
                ctx.textAlign = 'left';
                ctx.fillText('ZONA DELAY', chartArea.left + 8, chartArea.top + 13);
            }
        }
        ctx.restore();
    }
};

const safeSetHTML = (id, htmlContent) => { const el = document.getElementById(id); if (el) el.innerHTML = htmlContent; };
const safeSetText = (id, textContent) => { const el = document.getElementById(id); if (el) el.innerText = textContent; };
function preventD(e) { e.preventDefault(); e.stopPropagation(); }

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container'); 
    if(!container) return;
    const toast = document.createElement('div'); toast.className = `toast ${type}`;
    toast.innerHTML = `<div class="flex items-center gap-2"><i data-lucide="${type === 'success' ? 'check-circle' : 'info'}" class="w-4 h-4"></i>${message}</div>`;
    container.appendChild(toast); lucide.createIcons(); setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 4000);
}

function sanitizeHeaders(headersArray) {
    if (!headersArray) return [];
    if (typeof headersArray === 'string') headersArray = headersArray.split(',');
    if (Array.isArray(headersArray)) {
        if (headersArray.length > 20 && String(headersArray[0]).length === 1 && String(headersArray[1]).length === 1) return []; 
        return headersArray.filter(h => h && String(h).trim().length > 1);
    } return [];
}

function getCategoryName(wpStr) {
    let wp = String(wpStr).toUpperCase();
    if(wp.includes('E') || wp.includes('A')) return 'ADD'; if(wp.includes('C')) return 'CAT'; if(wp.includes('/')) return 'REG'; if(wp.includes('S')) return 'SMC'; if(wp.includes('-')) return 'SMV'; return 'OTHER';
}

function getCategorySymbol(catName) {
    if(catName === 'ADD') return 'E/A';
    if(catName === 'CAT') return 'C';
    if(catName === 'REG') return '/';
    if(catName === 'SMC') return 'S';
    if(catName === 'SMV') return '-';
    return '';
}

function getWorkdayDiff(startDateMs, endDateMs) {
    let start = new Date(startDateMs); start.setHours(0,0,0,0);
    let end = new Date(endDateMs); end.setHours(0,0,0,0);
    let count = 0;
    let current = new Date(start);
    while(current < end) {
        current.setDate(current.getDate() + 1);
        // Abaikan Minggu (0) dan Sabtu (6)
        if(current.getDay() !== 0 && current.getDay() !== 6) count++;
    }
    return count;
}
function getWPP(wpStr) { let match = String(wpStr).trim().match(/^(\d+)/); return match ? match[1] : wpStr; }

function isDateColumn(headerName) { return dateKeywords.some(kw => String(headerName).toUpperCase().includes(kw)); }

function parseExcelDate(value) {
    if(!value) return null;
    if(typeof value === 'number') { let d = new Date(Math.round((value - 25569) * 86400 * 1000)); return isNaN(d.getTime()) ? null : d; }
    if(typeof value === 'string') {
        let parts = value.split(/[-/]/);
        if (parts.length === 3) {
            if (parts[2].length === 4) { let d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0])); return isNaN(d.getTime()) ? null : d; }
            if (parts[0].length === 4) { let d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])); return isNaN(d.getTime()) ? null : d; }
        } return isNaN(new Date(value).getTime()) ? null : new Date(value);
    } return null;
}

function formatExcelDateStr(value) {
    let d = parseExcelDate(value);
    if(d instanceof Date && !isNaN(d.getTime())) return String(d.getDate()).padStart(2,'0') + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + d.getFullYear();
    return value;
}

function getTodayDateStr() {
    let d = new Date(); d.setHours(0,0,0,0);
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function parseIndoDate(str) {
    if (!str) return 0;
    let parts = str.split(/[-/]/); 
    if(parts.length === 3) {
        let d = parts[2].length === 4 ? new Date(parseInt(parts[2]), parseInt(parts[1])-1, parseInt(parts[0])) : new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));
        d.setHours(0,0,0,0); return d.getTime();
    } return 0;
}

function createOrUpdateChart(ctxId, type, data, options) {
    let el = document.getElementById(ctxId); if(!el) return;
    if(charts[ctxId]) { charts[ctxId].destroy(); } 
    if(!options) options = {};
    if (window.__ewipThemeSwitching) {
        options.animation = false;
    }
    const theme = window.getThemeConfig ? window.getThemeConfig() : null;
    const isWin98 = theme && theme.id === 'windows-98';
    const ct = getActiveChartTheme();
    if (isWin98 && data && Array.isArray(data.datasets)) {
        data.datasets.forEach(ds => {
            if (ds && (type === 'bar' || ds.type === 'bar')) {
                ds.borderRadius = 0;
            }
        });
    }
    options.devicePixelRatio = window.devicePixelRatio > 1 ? window.devicePixelRatio : 2;
    options.plugins = options.plugins || {};
    options.plugins.tooltip = Object.assign({
        backgroundColor: ct.tooltipBg,
        borderColor: ct.tooltipBorder,
        borderWidth: 1,
        titleColor: ct.tooltipTitle,
        bodyColor: ct.tooltipBody,
        padding: 10,
        cornerRadius: isWin98 ? 0 : 8,
        titleFont: { family: isWin98 ? 'Tahoma, sans-serif' : 'Plus Jakarta Sans, Inter, sans-serif', weight: '700', size: 11 },
        bodyFont: { family: 'JetBrains Mono, monospace', weight: '600', size: 11 }
    }, options.plugins.tooltip || {});

    if (options.scales) {
        ['x', 'y'].forEach(axis => {
            if (options.scales[axis]) {
                options.scales[axis].ticks = Object.assign({
                    color: ct.tickColor,
                    font: { family: 'JetBrains Mono, monospace', size: 10, weight: '600' }
                }, options.scales[axis].ticks || {});
                options.scales[axis].grid = Object.assign({
                    color: ct.gridColor
                }, options.scales[axis].grid || {});
                options.scales[axis].border = Object.assign({
                    color: ct.borderColor
                }, options.scales[axis].border || {});
            }
        });
    }
    charts[ctxId] = new Chart(el.getContext('2d'), { type: type, data: data, options: options, plugins: [batikChartPlugin, thresholdBgPlugin] });
}

// Fungsi pembersih string super toleran
function superCleanAssy(assyStr) {
    if(!assyStr) return '';
    return String(assyStr).toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^0+/, '');
}

// Fungsi Render Badge Problem Ganda Dinamis (SH & Paylater)
window.getShBadgeHtml = function(uid, assyName) {
    let html = '';
    let safeAssy = String(assyName).replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    let impacts = globalShMaterials.filter(sh => sh.targetUids && sh.targetUids.includes(uid));
    if(impacts.length > 0) {
        let isAllArrived = impacts.every(sh => sh.tanggalKedatangan !== null);
        let badgeClass = isAllArrived ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-red-100 text-red-700 border-red-200 animate-pulse';
        html += `<button onclick="event.stopPropagation(); window.showShDetailPopup('${uid}', '${safeAssy}')" class="px-1.5 py-0.5 rounded border text-[9px] font-bold shadow-sm hover:scale-105 transition-transform ${badgeClass} mr-1">SH</button>`;
    }

    let pyList = globalAssyPaylater.filter(py => py.uid === uid);
    if(pyList.length > 0) {
        let isAllDorong = pyList.every(py => py.dorongDate !== null);
        let badgeClass = isAllDorong ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-purple-100 text-purple-700 border-purple-200 animate-pulse';
        html += `<button onclick="event.stopPropagation(); window.showPaylaterDetailPopup('${uid}', '${safeAssy}')" class="px-1.5 py-0.5 rounded border text-[9px] font-bold shadow-sm hover:scale-105 transition-transform ${badgeClass}">Py</button>`;
    }

    return html || '-';
}

// Fungsi Tampilkan Pop-Up SH Details
window.showShDetailPopup = function(uid, assyName) {
    let impacts = globalShMaterials.filter(sh => sh.targetUids && sh.targetUids.includes(uid));
    if(impacts.length === 0) return;
    let listHtml = impacts.map(sh => `
        <div class="border-b border-gray-100 py-2">
            <div class="font-bold text-gray-800 text-xs">${sh.partName} <span class="text-[9px] text-gray-500 font-normal">(${sh.type})</span></div>
            <div class="text-[10px] text-gray-500 flex justify-between mt-1">
                <span>Tgl Input: <strong class="text-gray-700">${sh.tanggalSH}</strong></span>
                <span>Status: ${sh.tanggalKedatangan ? '<strong class="text-emerald-600">Arrived ('+sh.tanggalKedatangan+')</strong>' : '<strong class="text-amber-600 animate-pulse">Waiting</strong>'}</span>
            </div>
        </div>`).join('');
    let overlay = document.createElement('div');
    overlay.id = 'sh-detail-popup';
    overlay.className = 'fixed inset-0 bg-gray-900/60 z-[10000] flex items-center justify-center p-4 backdrop-blur-sm transition-opacity';
    overlay.innerHTML = `
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col scale-100 transition-transform border border-gray-200">
            <div class="px-4 py-3 border-b border-gray-200 flex justify-between items-center bg-gray-50 shrink-0">
                <div>
                    <h3 class="font-bold text-sm text-gray-800 tracking-tight flex items-center gap-1.5"><i data-lucide="shield-alert" class="w-4 h-4 text-red-500"></i> History Shortage Material</h3>
                    <p class="text-[10px] text-gray-500 mt-0.5">ASSY: <strong class="text-brand-600 text-xs">${assyName}</strong></p>
                </div>
                <button onclick="document.getElementById('sh-detail-popup').remove()" class="text-gray-400 hover:text-red-500 bg-white shadow-sm border border-gray-200 p-1.5 rounded transition"><i data-lucide="x" class="w-4 h-4"></i></button>
            </div>
            <div class="p-4 max-h-80 overflow-y-auto bg-white flex flex-col gap-1">${listHtml}</div>
        </div>`;
    document.body.appendChild(overlay); lucide.createIcons();
};

// Fungsi Tampilkan Pop-Up Paylater Details
window.showPaylaterDetailPopup = function(uid, assyName) {
    let pyList = globalAssyPaylater.filter(py => py.uid === uid);
    if(pyList.length === 0) return;
    let listHtml = pyList.map(py => {
        let isDorong = py.dorongDate !== null;
        let endDate = isDorong ? new Date(py.dorongDate) : new Date();
        let startDate = new Date(py.scanoutDate);
        let diffTime = Math.abs(endDate - startDate);
        let dayCount = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if(dayCount === 0) dayCount = 1;
        return `
        <div class="border-b border-gray-100 py-3">
            <div class="font-bold text-gray-800 text-xs mb-1">Periode: ${py.periode} | WP: ${py.wp}</div>
            <div class="text-[10px] text-gray-500 flex justify-between items-center mb-1.5">
                <span>Scanout/Closed: <strong class="text-gray-700">${py.scanoutDate}</strong></span>
                <span>Oleh: <strong class="text-gray-700">${py.inputter}</strong></span>
            </div>
            <div class="text-[10px] text-gray-500 flex justify-between items-center mt-2 mb-2">
                <span>Status: ${isDorong ? '<strong class="text-emerald-600">DORONG ('+py.dorongDate+')</strong>' : '<strong class="text-purple-600 animate-pulse">BELUM DORONG</strong>'}</span>
                <span class="bg-gray-100 px-2 py-0.5 rounded font-bold text-gray-600 border border-gray-200">Tertahan: ${dayCount} Hari</span>
            </div>
            <div class="text-[10px] text-gray-600 bg-gray-50 p-2 rounded border border-gray-200 max-w-full break-words shadow-inner max-h-24 overflow-y-auto">
                <div class="font-bold text-gray-400 mb-1 border-b border-gray-200 pb-1">Remarks Log:</div>
                ${py.remarksLog && py.remarksLog.length > 0 ? py.remarksLog.map(l => `<div class="mb-1"><span class="font-bold text-purple-700">${l.sender}:</span>${l.message}</div>`).join('') : `<div>${py.remarks || '-'}</div>`}
            </div>
        </div>`;
    }).join('');
    let overlay = document.createElement('div');
    overlay.id = 'py-detail-popup';
    overlay.className = 'fixed inset-0 bg-gray-900/60 z-[10000] flex items-center justify-center p-4 backdrop-blur-sm transition-opacity';
    overlay.innerHTML = `
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col scale-100 transition-transform border border-gray-200">
            <div class="px-4 py-3 border-b border-gray-200 flex justify-between items-center bg-purple-50 shrink-0">
                <div>
                    <h3 class="font-bold text-sm text-purple-900 tracking-tight flex items-center gap-1.5"><i data-lucide="truck" class="w-4 h-4 text-purple-600"></i> Detail Assy Paylater</h3>
                    <p class="text-[10px] text-purple-700 mt-0.5 font-bold">ASSY: <strong class="text-purple-900 text-xs">${assyName}</strong></p>
                </div>
                <button onclick="document.getElementById('py-detail-popup').remove()" class="text-purple-400 hover:text-red-500 hover:bg-white shadow-sm border border-transparent p-1.5 rounded transition"><i data-lucide="x" class="w-4 h-4"></i></button>
            </div>
            <div class="p-4 max-h-80 overflow-y-auto bg-white flex flex-col gap-1">${listHtml}</div>
        </div>`;
    document.body.appendChild(overlay); lucide.createIcons();
};

// ==========================================
// MANAJEMEN REVIEW (SISTEM CHAT & NOTIF)
// ==========================================
function initChatListener() {
    if (!isFirebaseActive) return;
    db.collection("management_chat").orderBy("timestamp", "asc").onSnapshot((snapshot) => {
        globalChatData = [];
        snapshot.forEach((doc) => { globalChatData.push({ id: doc.id, ...doc.data() }); });
        
        renderChatMessages();
        
        const isModalOpen = !document.getElementById('chat-modal').classList.contains('hidden');
        if (isModalOpen) {
            lastReadChatCount = globalChatData.length;
            saveDB('last_read_chat', lastReadChatCount); 
        }
        updateChatBadge();
    });
}

window.openChatModal = function() {
    document.getElementById('chat-modal').classList.remove('hidden');
    lastReadChatCount = globalChatData.length;
    saveDB('last_read_chat', lastReadChatCount);
    updateChatBadge();
    setTimeout(() => { scrollToBottomChat(); document.getElementById('chat-message-input').focus(); }, 100);
};

window.closeChatModal = function() {
    document.getElementById('chat-modal').classList.add('hidden');
};

function updateChatBadge() {
    const badge = document.getElementById('chat-badge');
    const unread = globalChatData.length - lastReadChatCount;
    if (unread > 0) {
        badge.innerText = unread > 99 ? '99+' : unread;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

function renderChatMessages() {
    const container = document.getElementById('chat-log-container');
    if (!container) return;
    
    if (globalChatData.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-400 text-xs font-medium mt-10 flex flex-col items-center gap-2"><i data-lucide="message-square-dashed" class="w-10 h-10 opacity-30"></i> Belum ada percakapan terdata.</div>';
        lucide.createIcons();
        return;
    }
    
    let html = '';
    let lastDate = '';
    
    globalChatData.forEach(msg => {
        let dateObj = new Date(msg.timestamp);
        let dateStr = dateObj.toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' });
        let timeStr = dateObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        
        if(dateStr !== lastDate) {
            html += `<div class="flex justify-center my-5"><span class="bg-sky-100 text-sky-800 text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-sm">${dateStr}</span></div>`;
            lastDate = dateStr;
        }
        
        let initial = (msg.sender || 'U').charAt(0).toUpperCase();
        
        html += `
        <div class="flex flex-col gap-1 items-start w-full">
            <div class="flex items-end gap-2.5 max-w-[85%]">
                <div class="w-8 h-8 rounded-full bg-gradient-to-br from-sky-500 to-sky-700 shrink-0 flex items-center justify-center text-white font-black text-sm shadow-md border border-white">
                    ${initial}
                </div>
                <div class="bg-white p-3.5 rounded-2xl rounded-bl-sm shadow-sm border border-gray-200 flex flex-col relative group">
                    <span class="text-[10px] font-black text-sky-700 mb-1">${msg.sender || 'Unknown'}</span>
                    <p class="text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">${msg.message}</p>
                    <span class="text-[8px] text-gray-400 font-bold mt-2 text-right">${timeStr}</span>
                </div>
            </div>
        </div>`;
    });
    
    container.innerHTML = html;
    lucide.createIcons();
    
    if (!document.getElementById('chat-modal').classList.contains('hidden')) {
        scrollToBottomChat();
    }
}

function scrollToBottomChat() {
    const container = document.getElementById('chat-log-container');
    if (container) container.scrollTop = container.scrollHeight;
}

window.sendChatMessage = async function() {
    if (!isFirebaseActive) { showToast('Firebase belum aktif', 'error'); return; }
    
    const senderInput = document.getElementById('chat-sender-input');
    const messageInput = document.getElementById('chat-message-input');
    const sender = senderInput.value.trim();
    const message = messageInput.value.trim();
    const btn = document.getElementById('btn-send-chat');
    
    if (!sender) { showToast('Nama pengirim (Signature) wajib diisi', 'warning'); senderInput.focus(); return; }
    if (!message) { showToast('Pesan tidak boleh kosong', 'warning'); messageInput.focus(); return; }
    
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Mengirim...';
    lucide.createIcons();
    
    try {
        await db.collection("management_chat").add({
            sender: sender,
            message: message,
            timestamp: Date.now()
        });
        messageInput.value = '';
        scrollToBottomChat();
    } catch(e) {
        showToast('Gagal mengirim pesan', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="send" class="w-4 h-4"></i> Kirim Pesan';
        lucide.createIcons();
    }
};

// ==========================================
// ==========================================
// 3. INIT & TAB LOGIC + AUTO RESET
// ==========================================

let notesIntervalId = null;
const RANDOM_NOTES = [
    "Pastikan file Master Data (MPP) yang di-upload adalah versi terbaru agar validasi akurat.",
    "Sistem E-WIP secara otomatis melakukan mapping WPP dan menyesuaikan target tanggal STWC.",
    "Dampak Shortage (SH) akan diakumulasi ke seluruh List Assy yang terkait secara presisi.",
    "Fitur Assy Rocket memungkinkan Override STWC khusus untuk list produksi yang mendesak.",
    "Hindari penulisan spasi berlebih pada file Excel untuk mengurangi potensi error pembacaan.",
    "Sinkronisasi Cloud memastikan semua user melihat data yang sama secara Real-Time.",
    "Tips: Menekan Ctrl+Enter di menu Manajemen Review akan langsung mengirim pesan chat.",
    "Fitur Delay & Cut-Off secara pintar menyeleksi Assy mana yang masih valid diproduksi."
];

function startLoadingNotes() {
    const skeleton = document.getElementById('loading-notes-skeleton');
    const textEl = document.getElementById('loading-notes-text');
    if(skeleton) skeleton.classList.add('hidden');
    if(textEl) {
        textEl.classList.remove('hidden');
        textEl.innerText = RANDOM_NOTES[Math.floor(Math.random() * RANDOM_NOTES.length)];
        
        notesIntervalId = setInterval(() => {
            textEl.style.opacity = '0'; // Fade out
            setTimeout(() => {
                textEl.innerText = RANDOM_NOTES[Math.floor(Math.random() * RANDOM_NOTES.length)];
                textEl.style.opacity = '1'; // Fade in
            }, 400); 
        }, 7000);
    }
}

function stopLoadingNotes() {
    if(notesIntervalId) clearInterval(notesIntervalId);
}

// ==========================================
// SISTEM SILENT CRUD (BACKGROUND LOADING)
// ==========================================
window.executeSilentCRUD = async function(crudCallback, successMsg, btnElement = null) {
    let origHtml = '';
    if (btnElement) {
        origHtml = btnElement.innerHTML;
        btnElement.disabled = true;
        btnElement.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Memproses...';
        lucide.createIcons();
    }
    showToast("Sedang memproses di latar belakang...", "info");
    
    try {
        await crudCallback();
        
        // Refresh UI otomatis tanpa loading screen
        if(typeof renderShMaterials === 'function') renderShMaterials();
        if(typeof renderPaylaterTable === 'function') renderPaylaterTable();
        if(typeof renderRocketTable === 'function') renderRocketTable();
        if(document.getElementById('view-overview') && !document.getElementById('view-overview').classList.contains('hidden')) renderOverviewDashboard();
        if(document.getElementById('view-report') && !document.getElementById('view-report').classList.contains('hidden')) renderReportWIP();
        if(document.getElementById('view-control') && !document.getElementById('view-control').classList.contains('hidden')) renderControlOutstanding();
        
        showToast(successMsg, "success");
    } catch(e) {
        console.error(e);
        showToast("Gagal memproses data: " + e.message, "error");
    } finally {
        if (btnElement) {
            btnElement.disabled = false;
            btnElement.innerHTML = origHtml;
            lucide.createIcons();
        }
    }
};

window.dismissIdleModal = function() {
    document.getElementById('idle-modal').classList.add('hidden');
    showToast("Mode Read-Only. Data mungkin usang, silakan Segarkan Data jika ingin input.", "warning");
};

// ==========================================
// BATCH INPUT SH MATERIAL (WHERE USED KHUSUS)
// ==========================================
window.tempBatchShParts = [];
window.tempBatchShExcelData = [];

window.openBatchShModal = function() {
    let optHtml = '';
    globalUniquePeriodeWPP.forEach(pwKey => {
        let [per, wp] = pwKey.split('_');
        optHtml += `<option value="${pwKey}">${per} - WP ${wp}</option>`;
    });
    safeSetHTML('bsh-start', `<option value="" disabled selected>- Awal -</option>` + optHtml);
    safeSetHTML('bsh-end', `<option value="" disabled selected>- Akhir -</option>` + optHtml + `<option value="Sekarang" class="font-bold text-sky-600">Sekarang</option>`);
    
    window.tempBatchShParts = [];
    window.tempBatchShExcelData = [];
    document.getElementById('bsh-part').value = '';
    document.getElementById('sh-batch-excel').value = '';
    safeSetHTML('bsh-added-tbody', '');
    safeSetHTML('bsh-validation-tbody', '<tr><td colspan="6" class="text-center p-8 text-gray-400 font-medium">Lengkapi Form dan Upload Where Used, lalu klik Validasi.</td></tr>');
    
    document.getElementById('sh-batch-input-modal').classList.remove('hidden');
};
window.closeBatchShModal = function() { document.getElementById('sh-batch-input-modal').classList.add('hidden'); };

window.addBatchShPart = function() {
    let part = document.getElementById('bsh-part').value.trim();
    let cat = document.getElementById('bsh-cat').value;
    let pStart = document.getElementById('bsh-start').value;
    let pEnd = document.getElementById('bsh-end').value;
    
    if(!part || !pStart || !pEnd) { showToast("Lengkapi Nama Part dan Rentang Periode!", "warning"); return; }
    if(window.tempBatchShParts.some(p => p.part === part)) { showToast("Part ini sudah ditambahkan!", "warning"); return; }
    
    window.tempBatchShParts.push({ part, cat, pStart, pEnd, id: Date.now() });
    document.getElementById('bsh-part').value = '';
    renderBatchShAddedParts();
};

window.removeBatchShPart = function(id) {
    window.tempBatchShParts = window.tempBatchShParts.filter(p => p.id !== id);
    renderBatchShAddedParts();
};

function renderBatchShAddedParts() {
    let html = window.tempBatchShParts.map(p => `
        <tr class="border-b border-gray-100">
            <td class="p-1.5"><button onclick="removeBatchShPart(${p.id})" class="text-red-500 hover:bg-red-50 p-1 rounded"><i data-lucide="trash-2" class="w-3 h-3"></i></button></td>
            <td class="p-1.5 font-bold text-gray-800">${p.part}</td>
            <td class="p-1.5 text-gray-500">${p.cat}</td>
            <td class="p-1.5 text-indigo-600">${p.pStart} s.d ${p.pEnd}</td>
        </tr>`).join('');
    safeSetHTML('bsh-added-tbody', html); lucide.createIcons();
}

window.handleBatchShExcel = async function(event) {
    let file = event.target.files[0];
    if(!file) return;
    try {
        let fileObj = await readExcelFile(file);
        let workbook = XLSX.read(fileObj.data, {type: 'array'});
        let jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {header: 1, defval: ""});

        let partIdx = -1, assyIdx = -1, qtyIdx = -1, startRow = -1;
        for(let r=0; r<Math.min(20, jsonData.length); r++) {
            let row = jsonData[r]; if(!row) continue;
            for(let c=0; c<row.length; c++) {
                let val = String(row[c] || '').toUpperCase().replace(/\s+/g, '');
                if(val === 'PARTNO' || val.includes('ITEMID')) partIdx = c;
                if(val === 'ASSYNO' || val === 'ASSY') assyIdx = c;
                if(val === 'QTY' || val === 'USAGE') qtyIdx = c;
            }
            if(partIdx !== -1 && assyIdx !== -1 && qtyIdx !== -1) { startRow = r + 1; break; }
        }
        
        if(startRow !== -1) {
            window.tempBatchShExcelData = [];
            for(let i=startRow; i<jsonData.length; i++) {
                let row = jsonData[i];
                if(row && row[partIdx] && row[assyIdx]) {
                    window.tempBatchShExcelData.push({
                        part: String(row[partIdx]).trim(),
                        assy: superCleanAssy(row[assyIdx]),
                        usage: parseFloat(row[qtyIdx] || 1)
                    });
                }
            }
            showToast(`Berhasil ekstrak data Where Used (${window.tempBatchShExcelData.length} baris).`, "success");
        } else { showToast("Format Excel salah. Butuh kolom PART NO, ASSY NO, dan QTY/USAGE.", "error"); }
    } catch(e) { showToast("Gagal membaca Excel.", "error"); }
};

window.validateBatchSh = function() {
    if(window.tempBatchShParts.length === 0) { showToast("Tambahkan Part terlebih dahulu!", "warning"); return; }
    if(window.tempBatchShExcelData.length === 0) { showToast("Upload file Where Used terlebih dahulu!", "warning"); return; }

    window.tempBatchShValidated = [];
    let wipMap = new Map(); globalWipData.forEach(w => wipMap.set(w._uid, w));

    let findIdx = (val) => {
        let v = String(val).trim();
        let idx = globalUniquePeriodeWPP.indexOf(v);
        if(idx === -1 && !v.includes('_')) idx = globalUniquePeriodeWPP.findIndex(k => k.startsWith(v));
        return idx;
    };

    window.tempBatchShParts.forEach(formPart => {
        let sIdx = findIdx(formPart.pStart);
        let validKeys = [];
        if (formPart.pEnd === 'Sekarang') {
            validKeys = sIdx !== -1 ? globalUniquePeriodeWPP.slice(sIdx) : [];
        } else {
            let eIdx = findIdx(formPart.pEnd);
            if(sIdx !== -1 && eIdx !== -1) validKeys = globalUniquePeriodeWPP.slice(sIdx, eIdx + 1);
        }

        let excelRows = window.tempBatchShExcelData.filter(x => x.part.toUpperCase() === formPart.part.toUpperCase());
        let usageMap = {};
        excelRows.forEach(r => { usageMap[r.assy] = r.usage; });
        let relevantAssys = excelRows.map(x => x.assy);

        let matchingMaster = globalMasterData.filter(m => {
            if(m._status === 'CLOSED') return false;
            let mPwKey = (m.PERIODE || '-') + '_' + getWPP(String(m.WP || '-').trim());
            return validKeys.includes(mPwKey) && relevantAssys.includes(superCleanAssy(m.ASSY));
        });

        let totalCct = 0; let totalNeed = 0; let uids = [];
        matchingMaster.forEach(m => {
            let w = wipMap.get(m._uid);
            totalCct += (w && w['PP CCT'] ? parseFloat(w['PP CCT']) : parseFloat(m['TOTAL CCT'] || 0));
            let usage = usageMap[superCleanAssy(m.ASSY)] || 1;
            totalNeed += parseFloat(m['QTY'] || 0) * usage;
            uids.push(m._uid);
        });

        window.tempBatchShValidated.push({
            partName: formPart.part, type: formPart.cat, startPeriod: formPart.pStart, endPeriod: formPart.pEnd,
            targetUids: uids, affectedAssys: relevantAssys, assyUsageMap: usageMap,
            totalNeedMaterial: totalNeed, totalCct: totalCct
        });
    });

    let html = window.tempBatchShValidated.map(v => `
        <tr class="border-b border-gray-100 hover:bg-gray-50">
            <td class="p-2 font-bold text-gray-800">${v.partName}</td>
            <td class="p-2 text-gray-500">${v.type}</td>
            <td class="p-2 text-indigo-600">${v.startPeriod} - ${v.endPeriod}</td>
            <td class="p-2 text-center font-bold text-gray-900">${v.targetUids.length} Assy</td>
            <td class="p-2 text-right text-pink-700 font-bold">${v.totalNeedMaterial.toLocaleString()}</td>
            <td class="p-2 text-left text-red-600 font-bold">${v.totalCct.toLocaleString()}</td>
        </tr>
    `).join('');
    safeSetHTML('bsh-validation-tbody', html);
    safeSetText('bsh-validation-summary', `${window.tempBatchShValidated.length} Part siap diproses.`);
};

window.confirmBatchSh = async function() {
    if(!window.tempBatchShValidated || window.tempBatchShValidated.length === 0) { showToast("Lakukan validasi terlebih dahulu!", "warning"); return; }
    let btn = document.getElementById('btn-save-batch-sh');
    
    let dateToday = getTodayDateStr().split('-').reverse().join('-');
    window.tempBatchShValidated.forEach(v => {
        globalShMaterials.push({
            partName: v.partName, type: v.type, itemId: v.partName, startPeriod: v.startPeriod, endPeriod: v.endPeriod,
            targetUids: v.targetUids, affectedAssys: v.affectedAssys, assyUsageMap: v.assyUsageMap,
            totalNeedMaterial: v.totalNeedMaterial, totalCct: v.totalCct,
            tanggalSH: dateToday, estimasiKedatangan: null, remarks: null, id: Date.now() + Math.random(),
            tanggalKedatangan: null, inputter: activeUserPin ? AUTH_PROFILES[activeUserPin] : 'Sistem'
        });
    });

    await executeSilentCRUD(async () => {
        await saveDB('sh_materials', globalShMaterials);
    }, "Batch Shortage Berhasil Disimpan!", btn);
    closeBatchShModal();
};

// ==========================================
// BATCH CONFIRM KEDATANGAN SH
// ==========================================
window.tempBatchConfirmList = [];

window.openBatchConfirmModal = function() {
    document.getElementById('bc-manual-input').value = '';
    document.getElementById('bc-date-input').value = getTodayDateStr();
    safeSetHTML('bc-validation-tbody', '<tr><td colspan="3" class="text-center p-8 text-gray-400 font-medium">Paste data material yang datang lalu klik Validasi.</td></tr>');
    window.tempBatchConfirmList = [];
    document.getElementById('sh-batch-confirm-modal').classList.remove('hidden');
};
window.closeBatchConfirmModal = function() { document.getElementById('sh-batch-confirm-modal').classList.add('hidden'); };

window.validateBatchConfirm = function() {
    let text = document.getElementById('bc-manual-input').value.trim();
    if(!text) { showToast("List material kosong!", "warning"); return; }
    
    let lines = text.split('\n').map(l => l.trim()).filter(l => l !== '');
    window.tempBatchConfirmList = [];
    
    lines.forEach(line => {
        let matches = globalShMaterials.filter(sh => sh.tanggalKedatangan === null && (sh.partName.toUpperCase().includes(line.toUpperCase()) || sh.itemId.toUpperCase().includes(line.toUpperCase())));
        window.tempBatchConfirmList.push({ pasted: line, matches: matches, selectedId: matches.length === 1 ? matches[0].id : '' });
    });

    let html = window.tempBatchConfirmList.map((item, idx) => {
        let selectHtml = '';
        if(item.matches.length === 0) selectHtml = `<span class="text-[10px] text-red-500 font-bold">Tidak ditemukan di sistem.</span>`;
        else if(item.matches.length === 1) selectHtml = `<span class="text-[10px] text-emerald-600 font-bold"><i data-lucide="check" class="w-3 h-3 inline"></i> ${item.matches[0].partName}</span>`;
        else {
            let opts = `<option value="">-- Pilih Material Yang Sesuai --</option>` + item.matches.map(m => `<option value="${m.id}">${m.partName}</option>`).join('');
            selectHtml = `<select class="w-full text-[10px] border border-gray-300 p-1 rounded focus:border-sky-500" onchange="window.tempBatchConfirmList[${idx}].selectedId = parseInt(this.value)">${opts}</select>`;
        }
        
        return `
        <tr class="border-b border-gray-100 hover:bg-gray-50">
            <td class="p-2 text-center"><button onclick="this.parentElement.parentElement.remove(); window.tempBatchConfirmList.splice(${idx}, 1);" class="text-red-500 hover:bg-red-50 p-1 rounded"><i data-lucide="trash-2" class="w-4 h-4"></i></button></td>
            <td class="p-2 text-gray-800 font-mono text-[10px]">${item.pasted}</td>
            <td class="p-2">${selectHtml}</td>
        </tr>`;
    }).join('');
    safeSetHTML('bc-validation-tbody', html); lucide.createIcons();
};

window.executeBatchConfirm = async function() {
    let confDate = document.getElementById('bc-date-input').value;
    if(!confDate) { showToast("Tanggal Kedatangan wajib diisi!", "warning"); return; }
    let formattedDate = confDate.split('-').reverse().join('-');
    
    let updatedCount = 0;
    window.tempBatchConfirmList.forEach(item => {
        if(item.selectedId) {
            let sh = globalShMaterials.find(x => x.id === item.selectedId);
            if(sh) {
                sh.tanggalKedatangan = formattedDate;
                sh.picClosed = activeUserPin ? AUTH_PROFILES[activeUserPin] : 'Sistem';
                updatedCount++;
            }
        }
    });

    if(updatedCount === 0) { showToast("Tidak ada material yang divalidasi.", "warning"); return; }
    let btn = document.getElementById('btn-save-bc');

    await executeSilentCRUD(async () => {
        await saveDB('sh_materials', globalShMaterials);
    }, `${updatedCount} Material berhasil di-Closed (Arrived)!`, btn);
    closeBatchConfirmModal();
};

// ==========================================
// FITUR REFRESH ALL OPEN SH (Tarik CCT Baru)
// ==========================================
window.refreshAllOpenShImpact = async function() {
    if(!confirm("Fitur ini akan menyinkronkan ulang data WIP terdampak untuk SELURUH Shortage berstatus OPEN dengan file Where Used asal mereka. Lanjutkan?")) return;
    let updated = 0;
    
    await executeSilentCRUD(async () => {
        let wipMapTemp = new Map(); globalWipData.forEach(w => wipMapTemp.set(w._uid, w));
        let findIdx = (val) => {
            let v = String(val).trim();
            let idx = globalUniquePeriodeWPP.indexOf(v);
            if(idx === -1 && !v.includes('_')) idx = globalUniquePeriodeWPP.findIndex(k => k.startsWith(v));
            return idx;
        };

        globalShMaterials.forEach(sh => {
            if(sh.tanggalKedatangan === null) {
                let startIndex = findIdx(sh.startPeriod);
                let validPwKeys = [];
                if (sh.endPeriod === 'Sekarang') {
                    if(startIndex !== -1) validPwKeys = globalUniquePeriodeWPP.slice(startIndex);
                } else {
                    let endIndex = findIdx(sh.endPeriod);
                    if(startIndex !== -1 && endIndex !== -1) validPwKeys = globalUniquePeriodeWPP.slice(startIndex, endIndex + 1);
                }
                
                if(validPwKeys.length > 0) {
                    let newActiveUids = globalMasterData.filter(m => {
                        if (m._status === 'CLOSED') return false;
                        let mPwKey = (m.PERIODE || '-') + '_' + getWPP(String(m.WP || '-').trim());
                        return validPwKeys.includes(mPwKey) && sh.affectedAssys.includes(superCleanAssy(m.ASSY));
                    }).map(m => m._uid);
                    
                    let newCct = 0; let newNeed = 0;
                    newActiveUids.forEach(uid => {
                        let m = globalMasterData.find(x => x._uid === uid);
                        if(m) {
                            let w = wipMapTemp.get(uid);
                            newCct += (w && w['PP CCT'] ? parseFloat(w['PP CCT']) : parseFloat(m['TOTAL CCT'] || 0));
                            let cleanA = superCleanAssy(m.ASSY);
                            let usage = (sh.assyUsageMap && sh.assyUsageMap[cleanA]) ? sh.assyUsageMap[cleanA] : 1;
                            newNeed += parseFloat(m['QTY'] || 0) * usage;
                        }
                    });
                    sh.targetUids = newActiveUids; sh.totalCct = newCct; sh.totalNeedMaterial = newNeed;
                    updated++;
                }
            }
        });
        await saveDB('sh_materials', globalShMaterials);
    }, `Sinkronisasi Massal ${updated} SH Berhasil!`, null);
};

window.onload = async function() {
    applyNavTabClasses(window.currentActiveTab || 'overview');
    lucide.createIcons();
    window.updateShActionButtonsVisibility();
    Chart.register(ChartDataLabels);
    Chart.defaults.set('plugins.datalabels', { display: false });

    const overlay = document.getElementById('loading-overlay'); 
    if(overlay) overlay.classList.remove('hidden');
    
    // Atur progress awal
    setLoaderState('Inisialisasi Sistem...', 'Menyiapkan modul aplikasi', 5, 'Starting...');
    setTimeout(startLoadingNotes, 1500);

    if (!isFirebaseActive) {
        stopLoadingNotes();
        if (overlay) overlay.classList.remove('hidden'); // Paksa overlay tetap muncul
        
        safeSetHTML('loading-notes-text', '<span class="text-red-400 font-bold">Koneksi Terputus / Sangat Lambat!</span>');
        document.getElementById('loading-notes-text').classList.remove('hidden');
        
        // Matikan skeleton dan animasi bar
        let skel = document.getElementById('loading-notes-skeleton'); if(skel) skel.style.display = 'none';
        let bar = document.getElementById('loading-bar'); if(bar) bar.style.display = 'none';
        
        // Ubah tampilan loading text menjadi peringatan Error
        safeSetHTML('loading-title', '<span class="text-red-500 font-black text-xl">Koneksi Server Gagal!</span>');
        safeSetHTML('loading-rows', 'Sistem tidak menerima respon dari Cloud Database. Pastikan internet Anda stabil.');
        
        // Tambahkan tombol segarkan halaman besar di tengah layar loading
        let badge = document.getElementById('loading-badge'); if(badge) badge.style.display = 'none';
        
        let container = document.querySelector('.progress-bar-fill').parentElement;
        container.outerHTML = `
            <div class="flex justify-center mt-4 w-full relative z-[999999]">
                <button onclick="window.location.reload()" class="bg-red-600 hover:bg-red-700 text-white font-black py-4 px-8 rounded-xl shadow-[0_0_20px_rgba(220,38,38,0.5)] flex items-center justify-center gap-3 transition-transform transform hover:scale-105 pointer-events-auto">
                    <i data-lucide="refresh-cw" class="w-6 h-6"></i> KLIK UNTUK SEGARKAN HALAMAN (RELOAD)
                </button>
            </div>
        `;
        lucide.createIcons();
        return;
    }
    
    setLoaderState('Menghubungkan ke Cloud...', 'Memeriksa koneksi database', 10, 'Firebase Connected');
    initIdleDetection();

    // CHECK DATABASE KONSOLIDASI (SUPER CEPAT)
    setLoaderState('Memuat Database Utama...', 'Mengambil Consolidated Master', 30, 'Optimizing...');
    let consolidatedMaster = await loadDB('consolidated_master');
    
    uploadedMasterFiles = (await loadDB('uploaded_master_files')) || [];
    uploadedWipFiles = (await loadDB('uploaded_wip_files')) || [];

    if(consolidatedMaster && consolidatedMaster.length > 0) {
        globalMasterData = consolidatedMaster;
        // Hanya butuh list file WIP untuk memancing tampilan riwayat upload harian
        let lastWipFile = uploadedWipFiles[uploadedWipFiles.length - 1];
        globalWipData = lastWipFile ? (await loadDB('wip_file_' + lastWipFile) || []) : [];
    } else {
        // FALLBACK: JIKA KONSOLIDASI BELUM ADA, LOAD MANUAL PER FILE
        globalMasterData = []; let validMasterLocal = [];
        let masterPromises = uploadedMasterFiles.map(f => loadDB('master_file_' + f).then(data => ({f, data})));
        let masterResults = await Promise.all(masterPromises); 
        masterResults.forEach(res => { if(res.data && res.data.length > 0) { globalMasterData.push(...res.data); validMasterLocal.push(res.f); } });
        uploadedMasterFiles = validMasterLocal;

        if (globalMasterData.length === 0) {
            let legacyMaster = await loadDB('master_data');
            if (legacyMaster && legacyMaster.length > 0) {
                globalMasterData = legacyMaster;
                await syncMasterToCloud();
                showToast("Sistem: Data Master lama dimigrasi.", "success");
            }
        }

        globalWipData = []; let validWipLocal = [];
        let wipPromises = uploadedWipFiles.map(f => loadDB('wip_file_' + f).then(data => ({f, data})));
        let wipResults = await Promise.all(wipPromises); 
        wipResults.forEach(res => { if(res.data && res.data.length > 0) { globalWipData.push(...res.data); validWipLocal.push(res.f); } });
        uploadedWipFiles = validWipLocal;

        if (globalWipData.length === 0) {
            let legacyWip = await loadDB('wip_data');
            if (legacyWip && legacyWip.length > 0) {
                globalWipData = legacyWip;
                await syncWipToCloud();
                showToast("Sistem: Data WIP lama dimigrasi.", "success");
            }
        }
    }

    setLoaderState('Menarik Konfigurasi...', 'Mendapatkan setting dan history', 75, 'Fetching Preferences');
    globalSTWCSettings = (await loadDB('stwc_settings')) || {};
    globalShMaterials = (await loadDB('sh_materials')) || [];
    dailyHistory = (await loadDB('daily_history')) || [];
    globalAssyPaylater = (await loadDB('assy_paylater')) || [];
    globalCutoffPWKey = await loadDB('global_cutoff_key');
    globalDelayPWKey = await loadDB('global_delay_key');
    
    setLoaderState('Validasi Header...', 'Memeriksa struktur data', 80, 'Checking Layout');
    masterHeaders = sanitizeHeaders(await loadDB('master_headers'));
    masterHeaders.forEach(h => masterHeadersSet.add(h));
    globalAssyRocket = (await loadDB('assy_rocket')) || [];

    setLoaderState('Memuat Chat Log...', 'Sinkronisasi riwayat obrolan', 85, 'Fetching Chat');
    let readChat = await loadDB('last_read_chat');
    lastReadChatCount = readChat ? parseInt(readChat) : 0;
    initChatListener();

    setLoaderState('Validasi Harian...', 'Memeriksa pergantian hari', 90, 'Checking Date');
    let lastWipDate = await loadDB('last_wip_date');
    let todayStr = getTodayDateStr();

    if (lastWipDate && lastWipDate !== todayStr && globalWipData.length > 0) {
        globalWipData = []; uploadedWipFiles = [];
        await saveDB('uploaded_wip_files', []);
        showToast("Hari baru dimulai! Data WIP kemarin telah dibersihkan otomatis.", "warning");
    }

    setLoaderState('Menyiapkan Dashboard...', 'Merender antarmuka pengguna', 98, 'Finishing up');
    
    if(globalMasterData.length > 0) {
        updateWipDependencies(); updateInputStats(); updateGlobalThresholdUI(); renderUploadedFiles();
        try { setupControlHeaders(); } catch(e) { console.error(e); }
        let btnReset = document.getElementById('btn-reset'); if(btnReset) btnReset.classList.remove('hidden');
        switchTab('overview');
    } else { switchTab('master'); }
    
    await window.checkWeeklyConsolidation();
    initRealtimeSyncListeners();
    
    stopLoadingNotes();
    if(overlay) overlay.classList.add('hidden');
};

function updateWipDependencies() {
    let uniqueSet = new Set();
    globalWipData.forEach(r => {
        let periode = String(r['PERIODE'] || '').trim(); let wppVal = getWPP(r['WP']);
        if(periode && wppVal && wppVal !== '-') uniqueSet.add(periode + '_' + wppVal);
    });
    globalUniquePeriodeWPP = Array.from(uniqueSet).sort((a,b) => {
        let [perA, wpA] = a.split('_'); let [perB, wpB] = b.split('_');
        if (perA !== perB) return perA.localeCompare(perB); return parseInt(wpA) - parseInt(wpB);
    });
    if(!globalCutoffPWKey && globalUniquePeriodeWPP.length > 0) globalCutoffPWKey = globalUniquePeriodeWPP[0];
    if(!globalDelayPWKey && globalUniquePeriodeWPP.length > 0) globalDelayPWKey = globalUniquePeriodeWPP[0];

    // AUTO-INJECT STWC KE MASTER DATA SAAT REFRESH / STARTUP
    globalMasterData.forEach(m => {
        let pwKey = (m.PERIODE || '-') + '_' + getWPP(m.WP || '-');
        if (globalSTWCSettings && globalSTWCSettings[pwKey]) {
            m.STWC = globalSTWCSettings[pwKey];
        }
    });
}

window.currentActiveTab = 'overview';

function applyNavTabClasses(tabId) {
    const ui = window.getThemeConfig().ui;
    ['overview', 'report', 'control', 'sh', 'paylater', 'rocket', 'master', 'input'].forEach(id => {
        let btn = document.getElementById(`btn-tab-${id}`);
        if(!btn) return;
        if(id === 'master') btn.className = ui.navMasterIdle;
        else if(id === 'input') btn.className = ui.navInputIdle;
        else if(id === 'rocket') btn.className = ui.navInactiveRocket;
        else if(id === 'paylater') btn.className = ui.navInactivePaylater;
        else btn.className = ui.navInactive;
    });

    let activeBtn = document.getElementById(`btn-tab-${tabId}`);
    if(activeBtn) {
        if(tabId === 'master' || tabId === 'input') activeBtn.className = ui.navActionActive;
        else if(tabId === 'rocket') activeBtn.className = ui.navActiveRocket;
        else if(tabId === 'paylater') activeBtn.className = ui.navActivePaylater;
        else activeBtn.className = ui.navActive;
    }
}

window.syncAppAfterThemeChange = function() {
    applyNavTabClasses(window.currentActiveTab || 'overview');
    if (typeof window.applyOverviewSubTabClasses === 'function') window.applyOverviewSubTabClasses();
    if (window.currentActiveTab === 'overview' && typeof renderOverviewDashboard === 'function') {
        renderOverviewDashboard();
    } else if (window.currentActiveTab === 'report' && typeof renderReportWIP === 'function') {
        renderReportWIP();
    } else if (window.currentActiveTab === 'sh' && typeof renderShMaterials === 'function') {
        renderShMaterials();
    }
    if (window.lucide) window.lucide.createIcons();
};

function switchTab(tabId) {
    window.currentActiveTab = tabId;
    ['overview', 'report', 'control', 'sh', 'paylater', 'rocket', 'master', 'input'].forEach(id => {
        let view = document.getElementById(`view-${id}`); if(view) view.classList.add('hidden');
    });

    applyNavTabClasses(tabId);

    const viewActive = document.getElementById(`view-${tabId}`);
    if(viewActive) viewActive.classList.remove('hidden');

    if(tabId === 'overview') renderOverviewDashboard();
    if(tabId === 'report') renderReportWIP();
    if(tabId === 'control') { renderControlPeriodeTabs(); renderControlOutstanding(); }
    if(tabId === 'sh') renderShMaterials();
    if(tabId === 'paylater') renderPaylaterTable();
    if(tabId === 'rocket') renderRocketTable();
    if(tabId === 'master') { safeSetText('info-master-count', globalMasterData.length.toLocaleString() + ' Assy'); renderUploadedFiles(); }
    if(tabId === 'input') { updateInputStats(); renderUploadedFiles(); }
    lucide.createIcons();
}

async function resetData() {
    if(confirm("Yakin melakukan Factory Reset? Seluruh Data Master, WIP, dan SH Material akan dihapus permanen di Server Cloud.")) {
        globalMasterData = []; globalWipData = []; globalUniquePeriodeWPP = []; dailyHistory = []; globalSTWCSettings = {};
        globalCutoffPWKey = null; globalDelayPWKey = null; masterHeaders = []; activePeriodeTab = 'ALL'; activeOverviewCat = 'ALL'; activeOverdueWP = 'ALL'; activeClosedWP = 'ALL';
        uploadedMasterFiles = []; uploadedWipFiles = []; masterHeadersSet.clear();
        
        try {
            await saveDB('daily_history', []); await saveDB('stwc_settings', {});
            await saveDB('global_cutoff_key', null); await saveDB('global_delay_key', null); await saveDB('master_headers', []);
            await saveDB('uploaded_master_files', []); await saveDB('uploaded_wip_files', []);
            await saveDB('last_wip_consolidate', null);
            
            document.getElementById('nav-center-menus').classList.remove('flex'); document.getElementById('nav-center-menus').classList.add('hidden');
            document.getElementById('global-threshold-bar').classList.add('hidden');
            document.getElementById('btn-reset').classList.add('hidden');
            updateInputStats(); switchTab('master'); showToast('Factory Reset Berhasil.', 'success');
        } catch(e) {}
    }
}

async function resetMasterData() {
    if(confirm("Hapus SELURUH Master Data MPP dari Server? Tindakan ini tidak dapat dibatalkan.")) {
        globalMasterData = []; masterHeaders = []; activePeriodeTab = 'ALL'; uploadedMasterFiles = []; masterHeadersSet.clear();
        try {
            await saveDB('master_headers', []); await saveDB('uploaded_master_files', []);
            safeSetText('info-master-count', '0 Assy');
            showToast('Database Master telah dikosongkan.', 'success');
            try { setupControlHeaders(); } catch(e){} renderUploadedFiles(); renderOverviewDashboard();
        } catch(e) {}
    }
}

async function resetWipData() {
    if(confirm("Hapus Data WIP Harian dari Server? Ini akan mengosongkan matriks Resume Analisis.")) {
        globalWipData = []; uploadedWipFiles = [];
        try {
            await saveDB('last_wip_date', null); await saveDB('uploaded_wip_files', []);
            await saveDB('last_wip_consolidate', null);
            safeSetText('info-last-sync', '-');
            updateWipDependencies(); renderUploadedFiles(); renderOverviewDashboard(); renderReportWIP();
            showToast('Data WIP Harian telah dikosongkan.', 'success');
        } catch(e) {}
    }
}

window.checkWeeklyConsolidation = async function() {
    if (!isFirebaseActive) return;
    if (globalWipData.length === 0) return;

    let todayStr = getTodayDateStr();
    let isSunday = new Date().getDay() === 0; // 0 adalah hari Minggu
    let lastConsolidate = await loadDB('last_wip_consolidate');

    // Konsolidasi jika hari Minggu dan belum pernah hari ini, ATAU jika tumpukan file WIP sudah lebih dari 7 (untuk jaga-jaga)
    if ((isSunday && lastConsolidate !== todayStr && uploadedWipFiles.length > 1) || uploadedWipFiles.length > 7) {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.classList.remove('hidden');
        
        setLoaderState('Pemeliharaan Otomatis...', 'Konsolidasi & Kompresi Data WIP Mingguan', 0, 'Mohon Tunggu');

        let oldFiles = [...uploadedWipFiles];

        // Satukan semua data WIP ke dalam satu bucket "BACKUP_MINGGUAN_WIP"
        globalWipData.forEach(w => {
            w._sourceFile = 'BACKUP_MINGGUAN_WIP';
        });

        await syncWipToCloud((pct) => {
            setLoaderState('Konsolidasi WIP...', 'Menyatukan file harian ke Cloud', pct, 'Optimasi Database');
        });

        // Hapus rekam jejak file lama dari database Firebase untuk menghemat memori
        for(let f of oldFiles) {
            if(f !== 'BACKUP_MINGGUAN_WIP') {
                db.collection("wip_dashboard").doc("wip_file_" + f + "_meta").delete().catch(()=>{});
            }
        }

        await saveDB('last_wip_consolidate', todayStr);
        renderUploadedFiles();
        showToast("Konsolidasi Mingguan WIP berhasil! Beban loading aplikasi lebih ringan.", "success");
    }
};

window.repairDatabase = async function() {
    if(!confirm('Jalankan Data Repair Tool? Ini akan menormalkan galat pembacaan QTY dan CCT dari file Excel.')) return;
    setLoaderState('Memperbaiki Data...', 'Menormalkan kolom QTY & CCT...', 50, '');
    document.getElementById('loading-overlay').classList.remove('hidden');
    
    globalMasterData.forEach(m => {
        if(m['Qty'] !== undefined && m['QTY'] === undefined) m['QTY'] = m['Qty'];
        if(m['qty'] !== undefined && m['QTY'] === undefined) m['QTY'] = m['qty'];
        
        let qtyVal = parseFloat(m['QTY'] || 0);
        let cctVal = parseFloat(m['CCT'] || m['QTY CCT'] || 0);
        m['TOTAL CCT'] = qtyVal * cctVal;
    });

    try {
        await syncMasterToCloud();
        await recalculateValidation();
        document.getElementById('loading-overlay').classList.add('hidden');
        showToast('Database berhasil diperbaiki!', 'success');
    } catch(e) {
        document.getElementById('loading-overlay').classList.add('hidden');
    }
};

function updateInputStats() {
    loadDB('last_wip_date').then(date => { safeSetText('info-last-sync', date ? date : '-'); });
}

function setLoaderState(title, desc, pct, rowsTxt) {
    safeSetText('loading-title', title); 
    
    // Gabungkan deskripsi dan status row agar lebih ringkas
    let subText = desc || '';
    if (rowsTxt && rowsTxt !== '') subText += ` | ${rowsTxt}`;
    safeSetText('loading-rows', subText);

    // Validasi Max 100%
    let safePct = Math.min(100, Math.max(0, Math.floor(pct)));
    
    let loadingBar = document.getElementById('loading-bar');
    if(loadingBar) loadingBar.style.width = safePct + '%'; 
    
    // Pindahkan dan update teks pada Badge Persentase
    let badge = document.getElementById('loading-badge');
    if (badge) {
        badge.style.left = safePct + '%';
        badge.innerText = safePct + '%';
    }
}

// ==========================================
// 4. MULTI-UPLOAD & PARSING LOGIC
// ==========================================
function readExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve({ name: file.name, data: new Uint8Array(e.target.result) });
        reader.onerror = (e) => reject(e);
        reader.readAsArrayBuffer(file);
    });
}

function renderUploadedFiles() {
    const masterList = document.getElementById('master-file-list');
    if(masterList) {
        if(uploadedMasterFiles.length === 0) masterList.innerHTML = '<p class="text-[10px] text-gray-400 font-medium">Belum ada file Master tergabung.</p>';
        else {
            masterList.innerHTML = uploadedMasterFiles.map(f => `
                <div class="flex items-center justify-between bg-white border border-indigo-100 px-3 py-2 rounded-lg shadow-sm hover:border-indigo-300 transition group">
                    <div class="flex items-center gap-2 truncate"><i data-lucide="file-spreadsheet" class="w-4 h-4 text-indigo-500 shrink-0"></i><span class="text-[11px] font-bold text-gray-700 truncate" title="${f}">${f}</span></div>
                    <button onclick="removeMasterFile('${f}')" title="Hapus spesifik file ini" class="text-gray-300 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-md transition shrink-0"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </div>
            `).join('');
        }
    }
    const wipList = document.getElementById('wip-file-list');
    if(wipList) {
        if(uploadedWipFiles.length === 0) wipList.innerHTML = '<p class="text-[10px] text-gray-400 font-medium">Belum ada file WIP tergabung.</p>';
        else {
            wipList.innerHTML = uploadedWipFiles.map(f => `
                <div class="flex items-center justify-between bg-white border border-brand-100 px-3 py-2 rounded-lg shadow-sm hover:border-brand-300 transition group">
                    <div class="flex items-center gap-2 truncate"><i data-lucide="file-spreadsheet" class="w-4 h-4 text-brand-500 shrink-0"></i><span class="text-[11px] font-bold text-gray-700 truncate" title="${f}">${f}</span></div>
                    <button onclick="removeWipFile('${f}')" title="Hapus spesifik file ini" class="text-gray-300 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-md transition shrink-0"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </div>
            `).join('');
        }
    }
    lucide.createIcons();
}

window.removeMasterFile = function(filename) {
    requireSuperAdmin(async () => {
        if(confirm(`Yakin ingin MENCABUT seluruh data yang berasal dari file: ${filename}?`)) {
            globalMasterData = globalMasterData.filter(m => m._sourceFile !== filename);
            uploadedMasterFiles = uploadedMasterFiles.filter(f => f !== filename);
            try {
                await db.collection("wip_dashboard").doc("master_file_" + filename + "_meta").delete().catch(()=>{});
                await syncMasterToCloud();
                safeSetText('info-master-count', globalMasterData.length.toLocaleString() + ' Assy');
                renderUploadedFiles();
                try { setupControlHeaders(); } catch(e){}
                await recalculateValidation();
                showToast(`Data dari file ${filename} berhasil dicabut.`, 'success');
            } catch(e) {}
        }
    });
};

async function removeWipFile(filename) {
    if(confirm(`Yakin ingin MENCABUT data WIP yang berasal dari file: ${filename}?`)) {
        globalWipData = globalWipData.filter(w => w._sourceFile !== filename);
        uploadedWipFiles = uploadedWipFiles.filter(f => f !== filename);
        try {
            await db.collection("wip_dashboard").doc("wip_file_" + filename + "_meta").delete().catch(()=>{});
            await syncWipToCloud();
            renderUploadedFiles();
            await recalculateValidation();
            showToast(`Data WIP dari file ${filename} berhasil dicabut.`, 'success');
        } catch(e) {}
    }
}

// ==========================================
// FUNGSI OTORISASI SUPER ADMIN KHUSUS
// ==========================================
window.requireSuperAdmin = function(callback) {
    let code = prompt("RESTRICTED AREA: Masukkan kode Super Admin untuk mengeksekusi perintah ini:");
    if (code === "EKAGANTENG2026") {
        callback();
    } else if (code !== null && code !== "") {
        showToast("Kode Super Admin Salah! Akses Ditolak.", "error");
    }
};

const dropZoneMaster = document.getElementById('drop-zone-master'); const fileInputMaster = document.getElementById('file-input-master');

// Gembok event Click
dropZoneMaster.addEventListener('click', () => requireSuperAdmin(() => fileInputMaster.click()));

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(e => { dropZoneMaster.addEventListener(e, preventD, false); document.body.addEventListener(e, preventD, false); });
['dragenter', 'dragover'].forEach(e => dropZoneMaster.addEventListener(e, () => dropZoneMaster.classList.add('drag-active'), false));
['dragleave', 'drop'].forEach(e => dropZoneMaster.addEventListener(e, () => dropZoneMaster.classList.remove('drag-active'), false));

// Gembok event Drag & Drop
dropZoneMaster.addEventListener('drop', (e) => { 
    if(e.dataTransfer.files.length > 0) {
        requireSuperAdmin(() => processMasterFiles(e.dataTransfer.files));
    }
});

fileInputMaster.addEventListener('change', (e) => { if(e.target.files.length > 0) processMasterFiles(e.target.files); });

async function processMasterFiles(files) {
    if(!isFirebaseActive) { showToast("Firebase belum aktif!", "error"); return; }
    const overlay = document.getElementById('loading-overlay'); overlay.classList.remove('hidden');
    let newAssyCount = 0; let updatedAssyCount = 0;
    
    for(let i=0; i<files.length; i++) {
        let file = files[i];
        let pct = Math.floor((i / files.length) * 100);
        setLoaderState('Membaca File Master...', `Memproses ${file.name}`, pct, `File ${i+1} dari ${files.length}`);
        
        try {
            let fileObj = await readExcelFile(file);
            let workbook = XLSX.read(fileObj.data, {type: 'array'});
            
            globalMasterData = globalMasterData.filter(m => m._sourceFile !== file.name);
            
            let totalSheets = workbook.SheetNames.length;
            let sheetsToProcess = totalSheets > 1 ? totalSheets - 1 : 1;
            
            for(let s=0; s<sheetsToProcess; s++) {
                let sheetName = workbook.SheetNames[s];
                const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {header: 1});
                
                let headerIndex = -1;
                for (let r = 0; r < jsonData.length; r++) { 
                    if (!jsonData[r] || !Array.isArray(jsonData[r])) continue;
                    let rowStr = jsonData[r].map(c => String(c).toUpperCase()).join('|');
                    if (rowStr.includes('CUSTOMER') && rowStr.includes('ASSY')) { headerIndex = r; break; } 
                }
                
                if(headerIndex !== -1) {
                    let rawHeaders = jsonData[headerIndex];
                    let mappedHeaders = rawHeaders.map(h => {
                        if (!h) return '';
                        let cleanH = String(h).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
                        if (cleanH === 'ASSY NO' || cleanH === 'ASSY NO.') return 'ASSY';
                        if (cleanH === 'TOTAL CCT ') return 'TOTAL CCT'; 
                        return cleanH;
                    });
                    mappedHeaders.forEach(h => { if(h) masterHeadersSet.add(h); });

                    for (let r = headerIndex + 1; r < jsonData.length; r++) {
                        if (r % 3000 === 0) {
                            setLoaderState('Membaca File Master...', `Memproses baris ${r.toLocaleString()} / ${jsonData.length.toLocaleString()}`, Math.floor((r/jsonData.length)*100), `File ${i+1} dari ${files.length}`);
                            await new Promise(resolve => setTimeout(resolve, 0));
                        }
                        const row = jsonData[r]; if(!row || row.length === 0) continue;
                        let obj = {};
                        mappedHeaders.forEach((h, index) => { 
                            if(h && row[index] !== undefined) {
                                let finalH = h;
                                let counter = 2;
                                while(obj[finalH] !== undefined) {
                                    finalH = h + '_' + counter;
                                    counter++;
                                }
                                let val = row[index];
                                if (isDateColumn(finalH) && typeof val === 'number' && val > 30000) obj[finalH] = formatExcelDateStr(val);
                                else obj[finalH] = val;
                            } 
                        });
                        
                        if(!obj['ASSY']) continue;
                        
                        let lineVal = String(obj['LINE'] || obj['LINE '] || '').toUpperCase();
                        if (lineVal.includes('PROTO') || /\bPT\b/.test(lineVal) || lineVal === 'LINE PT') continue;

                        let rawQty = obj['QTY'] !== undefined ? obj['QTY'] : (obj['Qty'] !== undefined ? obj['Qty'] : obj['qty']);
                        let qtyVal = parseFloat(rawQty || 0);
                        let cctVal = parseFloat(obj['CCT'] || obj['QTY CCT'] || 0);
                        obj['QTY'] = qtyVal;
                        obj['TOTAL CCT'] = qtyVal * cctVal;

                        let assyStr = String(obj['ASSY']).trim().toUpperCase();
                        let perStr = String(obj['PERIODE'] || '').trim().toUpperCase();
                        let wpStr = String(obj['WP'] || '').trim().toUpperCase();
                        let uid = `${assyStr}_${perStr}_${wpStr}`;
                        
                        obj._uid = uid; obj._sourceFile = file.name;

                        let existingIdx = globalMasterData.findIndex(m => m._uid === uid);
                        if(existingIdx !== -1) {
                            Object.assign(globalMasterData[existingIdx], obj); 
                            if(!globalMasterData[existingIdx]._status) globalMasterData[existingIdx]._status = 'CND 1';
                            updatedAssyCount++;
                        } else {
                            obj._status = 'CND 1'; globalMasterData.push(obj); newAssyCount++;
                        }
                    }
                }
            }
        } catch(err) { console.error(err); showToast(`Error pada file ${file.name}`, 'error'); }
    }
    
    masterHeaders = sanitizeHeaders(Array.from(masterHeadersSet));
    
    try {
        await saveDB('master_headers', masterHeaders);
        await syncMasterToCloud((pct) => {
            setLoaderState('Menyimpan ke Cloud...', 'Sinkronisasi Master Data', pct, 'Proses Upload Database');
        });
        
        setLoaderState('Menyelesaikan...', 'Merender tampilan UI', 99, '');
        await new Promise(resolve => setTimeout(resolve, 100));

        try { setupControlHeaders(); } catch(e){}
        updateInputStats(); updateGlobalThresholdUI(); renderUploadedFiles();
        
        document.getElementById('nav-center-menus').classList.remove('hidden'); document.getElementById('nav-center-menus').classList.add('flex');
        document.getElementById('global-threshold-bar').classList.remove('hidden');
        document.getElementById('btn-reset').classList.remove('hidden');
        
        stopLoadingNotes();
        overlay.classList.add('hidden');
        showToast(`Master Update Selesai: ${newAssyCount} Baru, ${updatedAssyCount} Ditimpa.`, 'success');
        
        if(globalWipData.length > 0) await recalculateValidation(true); // Render dari cloud, jangan diupload balik!
        else switchTab('overview');
    } catch(e) { stopLoadingNotes(); overlay.classList.add('hidden'); }
}

const dropZoneWip = document.getElementById('drop-zone-wip'); const fileInputWip = document.getElementById('file-input-wip');
dropZoneWip.addEventListener('click', () => fileInputWip.click());
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(e => { dropZoneWip.addEventListener(e, preventD, false); document.body.addEventListener(e, preventD, false); });
['dragenter', 'dragover'].forEach(e => dropZoneWip.addEventListener(e, () => dropZoneWip.classList.add('drag-active'), false));
['dragleave', 'drop'].forEach(e => dropZoneWip.addEventListener(e, () => dropZoneWip.classList.remove('drag-active'), false));
dropZoneWip.addEventListener('drop', (e) => { if(e.dataTransfer.files.length > 0) processWIPFiles(e.dataTransfer.files); });
fileInputWip.addEventListener('change', (e) => { if(e.target.files.length > 0) processWIPFiles(e.target.files); });

async function processWIPFiles(files) {
    if(!isFirebaseActive) { showToast("Firebase belum aktif!", "error"); return; }
    if(globalMasterData.length === 0) { showToast('Upload Master Data (MPP) terlebih dahulu!', 'warning'); return; }
    
    const overlay = document.getElementById('loading-overlay'); overlay.classList.remove('hidden');
    let todayStr = getTodayDateStr();

    for(let i=0; i<files.length; i++) {
        let file = files[i];
        let pct = Math.floor((i / files.length) * 100);
        setLoaderState('Menyiapkan Validasi...', `Memproses WIP: ${file.name}`, pct, `File ${i+1}/${files.length}`);

        try {
            let fileObj = await readExcelFile(file);
            let workbook = XLSX.read(fileObj.data, {type: 'array'});
            const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {header: 1});

            globalWipData = globalWipData.filter(w => w._sourceFile !== file.name);

            let headerIndex = -1;
            for (let r = 0; r < jsonData.length; r++) { 
                if (!jsonData[r] || !Array.isArray(jsonData[r])) continue;
                let rowStr = jsonData[r].map(c => String(c).toUpperCase()).join('|');
                if (rowStr.includes('CUSTOMER') && rowStr.includes('ASSY')) { headerIndex = r; break; } 
            }

            if(headerIndex !== -1) {
                let rawHeaders = jsonData[headerIndex];
                let headers = rawHeaders.map(h => {
                    if(!h) return '';
                    let cleanH = String(h).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
                    if (cleanH === 'ASSY NO' || cleanH === 'ASSY NO.') return 'ASSY';
                    return cleanH;
                });
                
                if(!headers[2] || String(headers[2]).trim() === '') headers[2] = 'LINE';
                
                for (let r = headerIndex + 1; r < jsonData.length; r++) {
                    if (r % 3000 === 0) {
                        setLoaderState('Membaca Report WIP...', `Memproses baris ${r.toLocaleString()} / ${jsonData.length.toLocaleString()}`, Math.floor((r/jsonData.length)*100), `File ${i+1}/${files.length}`);
                        await new Promise(resolve => setTimeout(resolve, 0));
                    }
                    const row = jsonData[r]; if(!row || row.length === 0 || !row[0]) continue;
                    let obj = {}; 
                    headers.forEach((cleanH, idx) => { 
                        if(cleanH && row[idx] !== undefined) { 
                            let finalH = cleanH;
                            let counter = 2;
                            while(obj[finalH] !== undefined) {
                                finalH = cleanH + '_' + counter;
                                counter++;
                            }
                            let val = row[idx];
                            if (isDateColumn(finalH) && typeof val === 'number' && val > 30000) obj[finalH] = formatExcelDateStr(val);
                            else obj[finalH] = val;
                        } 
                    });

                    let lineVal = String(obj['LINE'] || '').toUpperCase();
                    if (lineVal.includes('PROTO') || /\bPT\b/.test(lineVal) || lineVal === 'LINE PT') continue;

                    let ppValRaw = String(obj['PP'] || '').trim();
                    if (ppValRaw === '-' || ppValRaw === '') continue; 
                    let ppVal = parseFloat(ppValRaw);
                    if(isNaN(ppVal) || ppVal <= 0) continue; 
                    
                    let cctVal = parseFloat(obj['CCT'] || obj['QTY CCT'] || 0);
                    obj['PP CCT'] = ppVal * cctVal;

                    let assy = String(obj['ASSY'] || '').trim().toUpperCase();
                    let perStr = String(obj['PERIODE'] || '').trim().toUpperCase();
                    let wpStr = String(obj['WP'] || '').trim().toUpperCase();
                    let uid = `${assy}_${perStr}_${wpStr}`;
                    
                    obj._uid = uid; obj._sourceFile = file.name;
                    
                    let existingIdx = globalWipData.findIndex(w => w._uid === uid);
                    if(existingIdx !== -1) globalWipData[existingIdx] = obj;
                    else globalWipData.push(obj);

                    let masterIdx = globalMasterData.findIndex(m => m._uid === uid);
                    if(masterIdx === -1) {
                        let wpPrefix = getWPP(wpStr);
                        let pwKey = `${perStr}_${wpPrefix}`;
                        let stwcVal = globalSTWCSettings[pwKey] || ""; 
                        
                        let newMasterObj = { ...obj, _status: 'CND 1', 'TOTAL CCT': obj['PP CCT'] || 0, STWC: stwcVal };
                        
                        let wppMatches = globalMasterData.filter(m => m.PERIODE === perStr && getWPP(String(m.WP || '').trim()) === wpPrefix);
                        
                        if (wppMatches.length > 0 && wppMatches[0].STWC) {
                            newMasterObj.STWC = wppMatches[0].STWC;
                        } else if (stwcVal) {
                            newMasterObj.STWC = stwcVal;
                        } else {
                            newMasterObj.STWC = ""; // Kosongkan agar PPIC mengatur manual
                        }
                        globalMasterData.push(newMasterObj);
                    }
                }
            } else { showToast(`Format File WIP Salah: ${file.name}`, 'error'); }
        } catch(err) { console.error(err); showToast(`Error WIP ${file.name}`, 'error'); }
    }

    try {
        // 1. Simpan Master Konsolidasi Tunggal (Meningkatkan Kecepatan Reload & Realtime Sync)
        await saveDB('consolidated_master', globalMasterData, (pct) => {
            setLoaderState('Optimasi Database...', 'Menyimpan Master Permanen', pct, 'Tahap 1 dari 1');
        });

        // 2. Simpan WIP Harian (Latar belakang)
        syncWipToCloud(); 
        
        await saveDB('last_wip_date', todayStr);
        
        updateInputStats(); renderUploadedFiles();
        
        updateWipDependencies(); 
        updateGlobalThresholdUI(); 
        
        await recalculateValidation();
        
        await window.checkWeeklyConsolidation();
        
        stopLoadingNotes();
        overlay.classList.add('hidden');
        
    } catch(e) { stopLoadingNotes(); overlay.classList.add('hidden'); }
}

// ==========================================
// STWC SETTING MODAL LOGIC
// ==========================================
function openStwcModal() {
    const tbody = document.getElementById('stwc-tbody');
    let html = '';
    
    // Re-sync Unique WPP list just in case
    updateWipDependencies();
    
    if(globalUniquePeriodeWPP.length === 0) {
        html = `<tr><td colspan="3" class="text-center p-4 text-gray-400">Belum ada data WPP terdaftar.</td></tr>`;
    } else {
        globalUniquePeriodeWPP.forEach(pwKey => {
            let [per, wpp] = pwKey.split('_');
            
            let currentStwc = globalSTWCSettings[pwKey] || '';
            if(!currentStwc) {
                let mppMatch = globalMasterData.find(m => String(m.PERIODE).trim() === String(per).trim() && parseInt(getWPP(m.WP || '')) === parseInt(wpp) && m.STWC && m.STWC !== '-' && m.STWC !== '');
                if(mppMatch) currentStwc = mppMatch.STWC;
            }

            let inputVal = '';
            if(currentStwc) {
                let parts = currentStwc.split('-');
                if(parts.length === 3) inputVal = `${parts[2]}-${parts[1]}-${parts[0]}`; // To YYYY-MM-DD for input date
            }
            html += `
            <tr class="hover:bg-gray-50 transition">
                <td class="p-2 font-bold text-gray-800">${per}</td>
                <td class="p-2 text-center font-mono text-indigo-600 font-bold">${wpp}</td>
                <td class="p-2 text-right">
                    <input type="date" id="input_stwc_${pwKey}" value="${inputVal}" class="border border-gray-300 rounded px-2 py-1 outline-none focus:border-indigo-500 text-xs text-gray-700">
                </td>
            </tr>`;
        });
    }
    tbody.innerHTML = html;
    document.getElementById('stwc-modal').classList.remove('hidden');
}

function closeStwcModal() { document.getElementById('stwc-modal').classList.add('hidden'); }

async function saveStwcSettings() {
    setLoaderState('Menyimpan Pengaturan...', 'Memperbarui seluruh STWC di Database Bersih', 50, '');
    document.getElementById('loading-overlay').classList.remove('hidden');

    globalUniquePeriodeWPP.forEach(pwKey => {
        let el = document.getElementById(`input_stwc_${pwKey}`);
        if(el && el.value) {
            let parts = el.value.split('-');
            globalSTWCSettings[pwKey] = `${parts[2]}-${parts[1]}-${parts[0]}`; // Back to DD-MM-YYYY
        } else {
            delete globalSTWCSettings[pwKey];
        }
    });

    globalMasterData.forEach(m => {
        let pwKey = (m.PERIODE || '-') + '_' + getWPP(m.WP || '-');
        if (globalSTWCSettings[pwKey]) {
            m.STWC = globalSTWCSettings[pwKey];
        }
    });

    try {
        await saveDB('stwc_settings', globalSTWCSettings);
        // Kita menghapus syncMasterToCloud disini, cukup kalkulasi UI saja
        await recalculateValidation(true); 
        closeStwcModal();
        showToast('Konfigurasi STWC Berhasil Diterapkan.', 'success');
    } catch(e) { document.getElementById('loading-overlay').classList.add('hidden'); }
}

// ==========================================
// 5. DASHBOARD OVERVIEW & MULTI THRESHOLD
// ==========================================
function updateGlobalThresholdUI() {
    const selCutoff = document.getElementById('cutoff-wpp-select');
    const selDelay = document.getElementById('delay-wpp-select');
    
    let html = globalUniquePeriodeWPP.length === 0 ? `<option value="">- Data Kosong -</option>` : '';
    globalUniquePeriodeWPP.forEach(key => { 
        let [per, wp] = key.split('_'); 
        html += `<option value="${key}">Periode: ${per} - WPP: ${wp}</option>`; 
    });
    
    if(selCutoff && selDelay) {
        safeSetHTML('cutoff-wpp-select', html); safeSetHTML('delay-wpp-select', html);
        selCutoff.value = globalCutoffPWKey;
        selDelay.value = globalDelayPWKey;
    }
}

window.attemptUpdateCutoff = function(selectEl) {
    let newVal = selectEl.value;
    // Kembalikan visual ke nilai awal sebelum proses Auth selesai
    selectEl.value = globalCutoffPWKey || selectEl.options[0].value; 
    
    requireAccess(['110603', '111111'], () => {
        selectEl.value = newVal; // Terapkan nilai baru karena auth berhasil
        updateCutoffThreshold(newVal);
    });
};

window.attemptUpdateDelay = function(selectEl) {
    let newVal = selectEl.value;
    // Kembalikan visual ke nilai awal sebelum proses Auth selesai
    selectEl.value = globalDelayPWKey || selectEl.options[0].value; 
    
    requireAccess(['110603', '111111'], () => {
        selectEl.value = newVal; // Terapkan nilai baru karena auth berhasil
        updateDelayThreshold(newVal);
    });
};

async function updateCutoffThreshold(val) { globalCutoffPWKey = val; await saveDB('global_cutoff_key', val); refreshDashboards(); }
async function updateDelayThreshold(val) { globalDelayPWKey = val; await saveDB('global_delay_key', val); refreshDashboards(); }

function refreshDashboards() {
    const isOverview = !document.getElementById('view-overview')?.classList.contains('hidden');
    if(isOverview) renderOverviewDashboard();
    const isReport = !document.getElementById('view-report')?.classList.contains('hidden');
    if(isReport) renderReportWIP();
}

async function recalculateValidation(skipMasterSync = false) {
    if(!isFirebaseActive) return;
    if (globalMasterData.length === 0) return;

    const overlay = document.getElementById('loading-overlay');
    if(overlay) overlay.classList.remove('hidden');
    setLoaderState('Menghitung Ulang...', 'Auto-Expand SH & Validasi Tanggal', 0, '');

    // ==========================================
    // SISTEM PELINDUNG & MERGE DATA SH (ANTI-RESET)
    // ==========================================
    try {
        let cloudShData = (await loadDB('sh_materials')) || [];
        if (cloudShData.length > 0) {
            globalShMaterials.forEach(localSh => {
                let cSh = cloudShData.find(x => x.id === localSh.id);
                if (cSh) {
                    // JANGAN biarkan nilai-nilai manual ini tertimpa oleh default!
                    localSh.tanggalKedatangan = cSh.tanggalKedatangan || null;
                    localSh.estimasiKedatangan = cSh.estimasiKedatangan || null;
                    localSh.konfirmasiMcl = cSh.konfirmasiMcl || null;
                    localSh.picClosed = cSh.picClosed || null;
                    localSh.remarks = cSh.remarks || '';
                    localSh.remarksLog = cSh.remarksLog || [];
                }
            });
        }
    } catch (e) {
        console.warn("Gagal mengambil backup Cloud SH, menggunakan memori lokal.");
    }

    // ==========================================
    // MESIN AUTO-EXPAND SH (WATCHLIST NON-EXISTENT ASSYS)
    // ==========================================
    let isShModified = false;
    let wipMapTemp = new Map(); globalWipData.forEach(w => wipMapTemp.set(w._uid, w));
    globalShMaterials.forEach(sh => {
        if (sh.tanggalKedatangan === null && sh.affectedAssys && sh.affectedAssys.length > 0) {
            let periodes = Array.from(new Set(globalMasterData.map(m => String(m['PERIODE'] || '').trim()).filter(p => p && p !== '-'))).sort();
            let startIndex = periodes.indexOf(sh.startPeriod);
            
            let validPeriods = [];
            if (sh.endPeriod === 'Sekarang') {
                if(startIndex !== -1) validPeriods = periodes.slice(startIndex);
            } else {
                let endIndex = periodes.indexOf(sh.endPeriod);
                if(startIndex !== -1 && endIndex !== -1) validPeriods = periodes.slice(startIndex, endIndex + 1);
            }

            if(validPeriods.length > 0) {
                let newUids = globalMasterData.filter(m => m._status !== 'CLOSED' && validPeriods.includes(String(m.PERIODE).trim()) && sh.affectedAssys.includes(superCleanAssy(m.ASSY))).map(m => m._uid);
                
                let oldUidCount = sh.targetUids ? sh.targetUids.length : 0;
                let mergedUids = Array.from(new Set([...(sh.targetUids||[]), ...newUids]));
                
                if(mergedUids.length > oldUidCount) { // Jika mendeteksi ada Assy target yang baru diupload!
                    sh.targetUids = mergedUids;
                    let newCct = 0;
                    let newNeed = 0;
                    sh.targetUids.forEach(uid => {
                        let m = globalMasterData.find(x => x._uid === uid);
                        if(m) {
                            let w = wipMapTemp.get(uid);
                            newCct += (w && w['PP CCT'] ? parseFloat(w['PP CCT']) : parseFloat(m['TOTAL CCT'] || 0));
                            
                            let cleanA = superCleanAssy(m.ASSY);
                            let usage = (sh.assyUsageMap && sh.assyUsageMap[cleanA]) ? sh.assyUsageMap[cleanA] : 1;
                            let qtyDisplay = parseFloat(m['QTY'] || 0);
                            newNeed += (qtyDisplay * usage);
                        }
                    });
                    sh.totalCct = newCct;
                    sh.totalNeedMaterial = newNeed;
                    isShModified = true;
                }
            }
        }
    });
    if(isShModified) {
        await saveDB('sh_materials', globalShMaterials);
        try { renderShMaterials(); } catch(e){} 
    }
    // ==========================================

    let today = new Date(); today.setHours(0,0,0,0);
    let todayStr = getTodayDateStr();
    let todayTime = today.getTime();

    let wipUidSet = new Set();
    let wipRowMap = new Map();

    globalWipData.forEach(row => {
        let assyClean = superCleanAssy(row.ASSY);
        let wpClean = superCleanAssy(row.WP);
        let per = String(row.PERIODE || '').trim().toUpperCase();
        let uid = `${assyClean}_${per}_${wpClean}`;
        wipUidSet.add(uid); 
        wipRowMap.set(uid, row);
    });

    let closedCount = 0; let cnd3Count = 0; let cnd2Count = 0; let openCount = 0;

    globalMasterData.forEach(masterRow => {
        let assyClean = superCleanAssy(masterRow.ASSY);
        let wpClean = superCleanAssy(masterRow.WP);
        let per = String(masterRow.PERIODE || '').trim().toUpperCase();
        let uidMatch = `${assyClean}_${per}_${wpClean}`;
        
        // Cek apakah Assy ini termasuk Rocket
        let actualStwc = masterRow['STWC'];
        let isRocket = false;
        let rocketMatch = globalAssyRocket.find(r => r.assy === assyClean && r.wp === wpClean && r.periode === masterRow.PERIODE);
        if(rocketMatch) {
            actualStwc = rocketMatch.stwc;
            isRocket = true;
        }

        let stwcTime = parseIndoDate(actualStwc);
        let diffDays = 0;
        if(stwcTime > 0) {
            let stwcDateObj = new Date(stwcTime);
            stwcDateObj.setHours(0,0,0,0);
            let diffTime = todayTime - stwcDateObj.getTime();
            diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
        }
        
        if (globalWipData.length === 0) {
            // JIKA TIDAK ADA DATA WIP HARIAN, PERTAHANKAN STATUS SEBELUMNYA!
            if (masterRow._status === 'CLOSED') closedCount++;
            else if (masterRow._status === 'CND 3') cnd3Count++;
            else if (masterRow._status === 'CND 2') cnd2Count++;
            else openCount++;
            return;
        }

        let wipRow = wipRowMap.get(uidMatch);
        let isWipCnd3 = wipRow && String(wipRow['CND'] || '').toUpperCase().includes('CND 3');

        if (!wipUidSet.has(uidMatch)) {
            if(masterRow._status !== 'CLOSED') { masterRow._closedDate = todayStr; }
            masterRow._status = 'CLOSED';
            closedCount++;
        } else {
            if (isWipCnd3 || diffDays >= 2) {
                masterRow._status = 'CND 3'; cnd3Count++;
            } else if (diffDays === 1) {
                masterRow._status = 'CND 2'; cnd2Count++;
            } else {
                masterRow._status = 'CND 1'; openCount++;
            }
        }
    });

    let totalAct = openCount + cnd3Count + cnd2Count;
    let pctOnSched = totalAct > 0 ? (openCount / totalAct) * 100 : 0;
    let newHistoryEntry = { dateKey: todayStr, label: new Date().toLocaleDateString('id-ID', {day:'numeric', month:'short'}), cnd3: cnd3Count + cnd2Count, open: openCount, closed: globalMasterData.filter(m=>m._status==='CLOSED').length, pct: pctOnSched, catPct: {} };
    
    let existingHistoryIdx = dailyHistory.findIndex(h => h.dateKey === todayStr);
    if(existingHistoryIdx !== -1) {
        dailyHistory[existingHistoryIdx].cnd3 = cnd3Count + cnd2Count;
        dailyHistory[existingHistoryIdx].open = openCount;
        dailyHistory[existingHistoryIdx].closed = globalMasterData.filter(m=>m._status==='CLOSED').length;
        dailyHistory[existingHistoryIdx].pct = pctOnSched;
    } else {
        dailyHistory.push(newHistoryEntry);
    }

    try {
        // PENGHEMATAN KUOTA 99%: Kita hanya me-sync Master jika sedang memproses file WIP/Master baru
        if (!skipMasterSync) {
            await syncMasterToCloud((pct) => {
                setLoaderState('Update Database...', 'Sinkronisasi Override Status Master', 20 + Math.floor(pct * 0.7), 'Tahap Sinkronisasi');
            });
        }
        await saveDB('daily_history', dailyHistory);
        setLoaderState('Menyelesaikan...', 'Merender ulang UI', 99, '');
        await new Promise(r => setTimeout(r, 100));

        stopLoadingNotes();
        if(overlay) overlay.classList.add('hidden');
        refreshDashboards();
        try { renderControlOutstanding(); } catch(e){}
    } catch(e) { stopLoadingNotes(); if(overlay) overlay.classList.add('hidden'); }
}

// Context Switcher logic
window.activeOverviewSubTab = 'summary';

window.applyOverviewSubTabClasses = function() {
    const ui = window.getThemeConfig().ui;
    const btnSummary = document.getElementById('btn-ov-sub-summary');
    const btnTrend = document.getElementById('btn-ov-sub-trend');
    const panelSummary = document.getElementById('overview-panel-summary');
    const panelTrend = document.getElementById('overview-panel-trend-daily');
    const isTrend = window.activeOverviewSubTab === 'trend-daily';

    if (btnSummary) {
        btnSummary.className = `px-3 py-1.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider transition flex items-center gap-1.5 whitespace-nowrap ${isTrend ? ui.catInactive : ui.catActive}`;
    }
    if (btnTrend) {
        btnTrend.className = `px-3 py-1.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider transition flex items-center gap-1.5 whitespace-nowrap ${isTrend ? ui.catActive : ui.catInactive}`;
    }
    if (panelSummary) panelSummary.classList.toggle('hidden', isTrend);
    if (panelTrend) panelTrend.classList.toggle('hidden', !isTrend);
};

window.setOverviewSubTab = function(subTab) {
    window.activeOverviewSubTab = subTab === 'trend-daily' ? 'trend-daily' : 'summary';
    window.applyOverviewSubTabClasses();
    if (window.activeOverviewSubTab === 'trend-daily') {
        if (typeof window.renderTrendFifoDaily === 'function') window.renderTrendFifoDaily(false);
    } else {
        renderOverviewDashboard();
    }
    if (window.lucide) window.lucide.createIcons();
};

function setOverviewCat(cat) { activeOverviewCat = cat; renderOverviewDashboard(); }
function setOverdueWPFilter(wpType) { activeOverdueWP = wpType; renderOverviewDashboard(); }
function setClosedWPFilter(wpType) { activeClosedWP = wpType; renderOverviewDashboard(); }

// PERBAIKAN EXPORT DASHBOARD OVERVIEW 
function downloadOverviewImage() {
    const source = document.getElementById('view-overview-export-wrapper');
    if(!source) return;

    setLoaderState('Menyiapkan Gambar...', 'Merender struktur grafik dan layout.', 50, ''); 
    document.getElementById('loading-overlay').classList.remove('hidden');

    const btns = document.getElementById('overview-export-buttons-hide');
    if(btns) btns.style.display = 'none';

    // Gunakan lebar resolusi desktop standar agar grid/flex sejajar dan rapi
    const targetWidth = 1440;

    const exp = window.getThemeConfig().export;
    const printBox = document.createElement('div');
    printBox.style.position = 'absolute';
    printBox.style.top = '-9999px';
    printBox.style.left = '-9999px';
    printBox.style.width = targetWidth + 'px'; 
    printBox.style.background = exp.bg;
    printBox.style.padding = '28px';
    printBox.style.border = `3px solid ${exp.border}`;
    
    const clone = source.cloneNode(true);
    const cloneBtns = clone.querySelector('#overview-export-buttons-hide');
    if(cloneBtns) cloneBtns.remove();

    printBox.appendChild(clone);
    document.body.appendChild(printBox);

    const sourceCanvases = source.querySelectorAll('canvas');
    const clonedCanvases = clone.querySelectorAll('canvas');
    sourceCanvases.forEach((canvas, index) => {
        clonedCanvases[index].width = canvas.width;
        clonedCanvases[index].height = canvas.height;
        const ctx = clonedCanvases[index].getContext('2d');
        ctx.drawImage(canvas, 0, 0);
    });

    setTimeout(() => {
        html2canvas(printBox, { 
            scale: 2, 
            useCORS: true, 
            backgroundColor: exp.bg, 
            logging: false,
            windowWidth: targetWidth
        }).then(canvas => {
            document.body.removeChild(printBox);
            document.getElementById('loading-overlay').classList.add('hidden');
            if(btns) btns.style.display = 'flex';
            const link = document.createElement('a'); link.download = `Dashboard_Executive_${new Date().toISOString().replace(/[:.]/g, '-')}.png`; link.href = canvas.toDataURL('image/png'); link.click();
        }).catch(err => { 
            document.body.removeChild(printBox); 
            document.getElementById('loading-overlay').classList.add('hidden');
            if(btns) btns.style.display = 'flex';
            showToast('Gagal Export Dashboard', 'error'); 
        });
    }, 800);
}

window.exportDrilldownXLSX = function() {
    if(!window.currentDrilldownData || window.currentDrilldownData.length === 0) {
        showToast("Tidak ada data untuk diexport", "warning"); 
        return;
    }
    const ws = XLSX.utils.json_to_sheet(window.currentDrilldownData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data");
    
    const titleEl = document.getElementById('drilldown-title');
    const title = titleEl ? titleEl.innerText.replace(/[^a-zA-Z0-9 ]/g, "_") : "List_Assy";
    XLSX.writeFile(wb, `${title}.xlsx`);
};

window.openAdvancedDrilldown = function(mode, param1, param2) {
    const modal = document.getElementById('drilldown-modal');
    let filtered = []; let titleStr = "";

    let cutoffIndex = globalUniquePeriodeWPP.indexOf(globalCutoffPWKey); 
    if(cutoffIndex === -1) cutoffIndex = 0;
    let delayIndex = globalUniquePeriodeWPP.indexOf(globalDelayPWKey);
    if(delayIndex === -1) delayIndex = 0;

    let wipMap = new Map(); globalWipData.forEach(w => wipMap.set(w._uid, w));

    if(mode === 'TOP_KPI') {
        titleStr = `List Assy - Filter Status: ${param1}`;
        filtered = globalMasterData.filter(m => {
            if (param1 === 'ALL') return m._status !== 'CLOSED';
            if (m._status !== param1) return false;
            if(activeOverviewCat !== 'ALL') return getCategoryName(m['WP']) === activeOverviewCat;
            return true;
        });
    }
    else if (mode === 'MID_KPI') {
        titleStr = `List Assy - Analisis Loading: ${param1} (${activeOverviewCat})`;
        filtered = globalMasterData.filter(m => {
            // 1. Pengecekan Filter Kategori & Cut-Off diterapkan di awal
            let mCat = getCategoryName(m['WP']);
            if(activeOverviewCat !== 'ALL' && mCat !== activeOverviewCat) return false;
            
            let pwKey = (m['PERIODE'] || '-') + '_' + getWPP(String(m['WP'] || '').trim());
            let wppIndex = globalUniquePeriodeWPP.indexOf(pwKey);
            if(wppIndex !== -1 && wppIndex < cutoffIndex) return false;

            // 2. Filter Khusus Drilldown Paylater
            if (param1 === 'PAYLATER') {
                return globalAssyPaylater.some(py => py.uid === m._uid && py.dorongDate === null);
            }
            
            // 3. Untuk kotak KPI lain, abaikan jika CLOSED
            if(m._status === 'CLOSED') return false;

            // 4. Kalkulasi SH & Delay
            let w = wipMap.get(m._uid);
            let isSHInSystem = globalShMaterials.some(sh => sh.tanggalKedatangan === null && sh.targetUids && sh.targetUids.includes(m._uid));
            let problemStrRaw = w ? Object.keys(w).find(k => k.includes('KETERANGAN') || k.includes('PROBLEM') || k.includes('POTENSI')) : null;
            let isPotensiSH = problemStrRaw ? String(w[problemStrRaw]).toUpperCase().includes('SH') : false;
            let isSH = isSHInSystem || isPotensiSH;
            let isDelay = wppIndex < delayIndex;

            let isSHArrived = globalShMaterials.some(sh => sh.tanggalKedatangan !== null && sh.targetUids && sh.targetUids.includes(m._uid));

            if (param1 === 'ALL') return true;
            if (param1 === 'SH') return isSH;
            if (param1 === 'SH_DELAY') return isSH && isDelay;
            if (param1 === 'SH_ONSCHED') return isSH && !isDelay;
            if (param1 === 'RIWAYAT_SH') return isSHArrived;
            if (param1 === 'DELAY') return !isSH && isDelay;
            if (param1 === 'ONSCHED') return !isSH && !isDelay;
            return false;
        });
    }
    else if(mode === 'WPP') {
        let [per, wpp] = param1.split('_');
        titleStr = `List Assy - WPP ${per} - ${wpp} (${param2})`;
        filtered = globalMasterData.filter(m => {
            if(m._status === 'CLOSED') return false;
            let mPer = String(m['PERIODE'] || '').trim();
            let mWppStr = String(m['WP'] || '').trim();
            if(mPer !== per || parseInt(getWPP(mWppStr)) !== parseInt(wpp)) return false;
            if(param2 !== 'ALL' && param2 !== 'GRAND' && getCategoryName(mWppStr) !== param2) return false;
            return true;
        });
    }
    else if(mode === 'PIE_LEGEND') {
        titleStr = `List Assy - Kategori ${param2} (${param1})`;
        filtered = globalMasterData.filter(m => {
            if(m._status === 'CLOSED') return false;
            let mCat = getCategoryName(m['WP']);
            if(param2 !== 'ALL' && param2 !== 'GRAND' && mCat !== param2) return false;

            let pwKey = (m['PERIODE'] || '-') + '_' + getWPP(String(m['WP'] || '').trim());
            let wppIndex = globalUniquePeriodeWPP.indexOf(pwKey);
            if(wppIndex !== -1 && wppIndex < cutoffIndex) return false;

            let w = wipMap.get(m._uid);
            let isSHInSystem = globalShMaterials.some(sh => sh.tanggalKedatangan === null && sh.targetUids && sh.targetUids.includes(m._uid));
            let problemStrRaw = w ? Object.keys(w).find(k => k.includes('KETERANGAN') || k.includes('PROBLEM') || k.includes('POTENSI')) : null;
            let isPotensiSH = problemStrRaw ? String(w[problemStrRaw]).toUpperCase().includes('SH') : false;
            let isSH = isSHInSystem || isPotensiSH;
            let isDelay = wppIndex < delayIndex;

            if (param1 === 'SH') return isSH;
            if (param1 === 'DELAY') return !isSH && isDelay;
            if (param1 === 'ONSCHED') return !isSH && !isDelay;
            return true;
        });
    }
    else if(mode === 'LEGEND') {
        titleStr = `List Assy - Semua Status (${param1})`;
        filtered = globalMasterData.filter(m => {
            if(m._status === 'CLOSED') return false;
            if(param1 !== 'ALL' && param1 !== 'GRAND' && getCategoryName(m['WP']) !== param1) return false;
            return true;
        });
    }
    else if (mode === 'SINGLE') {
        let m = globalMasterData.find(x => x._uid === param1);
        if(m) {
            filtered = [m];
            titleStr = `Detail Assy: ${m.ASSY}`;
        }
    }

    filtered.sort((a,b) => parseIndoDate(a['STWC']) - parseIndoDate(b['STWC']));

    let totalList = filtered.length;
    let qtyArr = []; let totalCct = 0;

    let html = '';
    window.currentDrilldownData = [];

    // Update Header for Modal
    let theadHtml = `<tr><th class="w-20">STATUS</th><th class="text-left w-48">ASSY NO</th><th class="w-24 text-left">WP</th><th class="w-20 text-center">PROBLEM</th><th class="w-24 text-center">STWC</th><th class="w-20 text-center">QTY</th><th class="w-20 text-center text-purple-700">QTY CCT</th><th class="w-20 text-center">TOTAL CCT</th><th class="text-left w-32">ACTIVE SH</th><th class="text-left w-32">RIWAYAT SH</th><th class="text-left">CUSTOMER</th></tr>`;
    safeSetHTML('drilldown-thead', theadHtml);

    filtered.forEach(m => {
        let badge = m._status === 'CND 3' ? '<span class="bg-red-500 text-white px-2 py-0.5 rounded font-bold text-[9px] shadow-sm">CND 3</span>' : 
                    m._status === 'CND 2' ? '<span class="bg-amber-500 text-white px-2 py-0.5 rounded font-bold text-[9px] shadow-sm">CND 2</span>' :
                    (m._status === 'CLOSED' ? '<span class="bg-emerald-500 text-white px-2 py-0.5 rounded font-bold text-[9px] shadow-sm">CLOSED</span>' : '<span class="bg-blue-500 text-white px-2 py-0.5 rounded font-bold text-[9px] shadow-sm">CND 1</span>');
        
        let w = wipMap.get(m._uid);
        
        let qtyDisplay = parseFloat(m['QTY'] || 0);
        let qtyCctDisplay = parseFloat(m['CCT'] || m['QTY CCT'] || 0);
        let cctDisplay = w && w['PP CCT'] ? parseFloat(w['PP CCT']) : parseFloat(m['TOTAL CCT'] || 0);
        let problemBadge = window.getShBadgeHtml(m._uid, m.ASSY);
        
        totalCct += cctDisplay; if(qtyDisplay > 0) qtyArr.push(qtyDisplay);

        let activeShNames = [];
        let riwayatShNames = [];
        globalShMaterials.forEach(sh => {
            if (sh.targetUids && sh.targetUids.includes(m._uid)) {
                if (sh.tanggalKedatangan === null) activeShNames.push(sh.partName);
                else riwayatShNames.push(sh.partName);
            }
        });
        
        let activeShStr = activeShNames.join(', ') || '-';
        let riwayatShStr = riwayatShNames.join(', ') || '-';

        window.currentDrilldownData.push({
            "STATUS": m._status,
            "ASSY NO": m.ASSY || '-',
            "WP": m.WP || '-',
            "STWC": m.STWC || '-',
            "QTY": qtyDisplay,
            "QTY CCT": qtyCctDisplay,
            "TOTAL CCT": cctDisplay,
            "ACTIVE SH": activeShStr,
            "RIWAYAT SH": riwayatShStr,
            "CUSTOMER": m.CUSTOMER || '-'
        });

        html += `<tr class="border-b border-gray-100 hover:bg-gray-50 transition drill-row"><td class="p-2.5 text-center stat-cell">${badge}</td><td class="p-2.5 font-bold text-gray-800 assy-cell">${m.ASSY||'-'}</td><td class="p-2.5 font-mono text-gray-500 wp-cell">${m.WP||'-'}</td><td class="p-2.5 text-center">${problemBadge}</td><td class="p-2.5 text-center font-bold">${m.STWC||'-'}</td><td class="p-2.5 text-center text-indigo-700 font-bold">${qtyDisplay}</td><td class="p-2.5 text-center text-purple-600 font-bold">${qtyCctDisplay}</td><td class="p-2.5 text-center font-bold text-gray-800 bg-gray-50/50">${cctDisplay}</td><td class="p-2.5 text-left text-[9px] text-red-600 font-bold max-w-[150px] truncate" title="${activeShStr}">${activeShStr}</td><td class="p-2.5 text-left text-[9px] text-emerald-600 font-bold max-w-[150px] truncate" title="${riwayatShStr}">${riwayatShStr}</td><td class="p-2.5 text-gray-600 truncate max-w-[200px] cust-cell">${m.CUSTOMER||'-'}</td></tr>`;
    });
    
    if(filtered.length === 0) html = '<tr><td colspan="11" class="text-center p-6 text-gray-400 font-medium">Tidak ada data aktif.</td></tr>';
    
    if (mode === 'SINGLE' && filtered.length > 0) {
         let m = filtered[0];
         let today = new Date(); today.setHours(0,0,0,0);
         let stwcTime = parseIndoDate(m['STWC']);
         let overdueText = "";
         
         if(m._status !== 'CLOSED' && stwcTime > 0) {
             let diffDays = Math.round((today.getTime() - stwcTime) / 86400000);
             if(diffDays > 0) overdueText = `<span class="bg-red-100 text-red-700 px-2 py-0.5 rounded ml-2 text-xs font-bold shadow-sm animate-pulse">⚠️ Terlambat ${diffDays} Hari dari STWC</span>`;
             else overdueText = `<span class="bg-blue-100 text-blue-700 px-2 py-0.5 rounded ml-2 text-xs font-bold shadow-sm">⏳ On Schedule (Aman)</span>`;
         } else if(m._status === 'CLOSED') {
             overdueText = `<span class="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded ml-2 text-xs font-bold shadow-sm">✅ Telah Selesai (Closed)</span>`;
         }
         safeSetHTML('drilldown-subtitle', `Periode: <strong class="text-gray-800">${m.PERIODE||'-'}</strong> &nbsp;|&nbsp; WPP: <strong class="text-gray-800">${getWPP(m.WP||'-')}</strong> ${overdueText}`);
    } else {
         let avgQty = getAvgQtyOutlierEliminated(qtyArr);
         safeSetHTML('drilldown-subtitle', `Total List: <strong class="text-gray-800">${totalList}</strong> &nbsp;|&nbsp; Total QTY Aktual: <strong class="text-indigo-700">${qtyArr.reduce((a,b)=>a+b,0).toLocaleString()}</strong> &nbsp;|&nbsp; Rata-rata QTY (Normalisasi): <strong class="text-indigo-700">${avgQty.toLocaleString()}</strong>`);
    }
    
    safeSetText('drilldown-title', titleStr);
    safeSetHTML('drilldown-tbody', html);

    const thead = document.querySelector('#drilldown-modal thead');
    if(thead) {
        const oldFilterRow = thead.querySelector('.modal-filter-row');
        if(oldFilterRow) oldFilterRow.remove();

        let filterRow = document.createElement('tr');
        filterRow.className = 'modal-filter-row bg-gray-50 border-t border-gray-200';
        filterRow.innerHTML = `
            <th class="p-1"><input type="text" placeholder="Filter..." class="w-full text-[9px] border px-1.5 py-1 rounded font-normal outline-none focus:border-brand-500" onkeyup="filterDrillTable(0, this.value)"></th>
            <th class="p-1"><input type="text" placeholder="Cari Assy..." class="w-full text-[9px] border px-1.5 py-1 rounded font-normal outline-none focus:border-brand-500" onkeyup="filterDrillTable(1, this.value)"></th>
            <th class="p-1"><input type="text" placeholder="Cari WP..." class="w-full text-[9px] border px-1.5 py-1 rounded font-normal outline-none focus:border-brand-500" onkeyup="filterDrillTable(2, this.value)"></th>
            <th></th><th></th><th></th><th></th><th></th>
            <th class="p-1"><input type="text" placeholder="Cari Active SH..." class="w-full text-[9px] border px-1.5 py-1 rounded font-normal outline-none focus:border-brand-500" onkeyup="filterDrillTable(8, this.value)"></th>
            <th class="p-1"><input type="text" placeholder="Cari Riwayat..." class="w-full text-[9px] border px-1.5 py-1 rounded font-normal outline-none focus:border-brand-500" onkeyup="filterDrillTable(9, this.value)"></th>
            <th class="p-1"><input type="text" placeholder="Cari Customer..." class="w-full text-[9px] border px-1.5 py-1 rounded font-normal outline-none focus:border-brand-500" onkeyup="filterDrillTable(10, this.value)"></th>
        `;
        thead.appendChild(filterRow);
    }

    if(modal) modal.classList.remove('hidden');
}

window.filterDrillTable = function(colIdx, val) {
    let filter = val.toUpperCase();
    let rows = document.querySelectorAll('.drill-row');
    rows.forEach(r => {
        let cell = r.getElementsByTagName('td')[colIdx];
        if(cell) {
            let txt = cell.textContent || cell.innerText;
            r.style.display = txt.toUpperCase().indexOf(filter) > -1 ? "" : "none";
        }
    });
}

window.closeDrilldown = function() {
    const modal = document.getElementById('drilldown-modal');
    if(modal) modal.classList.add('hidden');
}

function renderOverviewDashboard() {
    const theme = window.getThemeConfig();
    const ui = theme.ui;
    const ct = theme.chart;
    const catBtnsContainer = document.getElementById('overview-cat-buttons');
    if(catBtnsContainer) {
        let btnHtml = '';
        ['ALL', ...CATEGORIES].forEach(cat => {
            let activeClass = activeOverviewCat === cat ? ui.catActive : ui.catInactive;
            btnHtml += `<button onclick="setOverviewCat('${cat}')" class="px-3 py-1 text-[10px] font-bold rounded-md transition whitespace-nowrap ${activeClass}">${cat}</button>`;
        });
        catBtnsContainer.innerHTML = btnHtml;
    }

    let cutoffIndex = globalUniquePeriodeWPP.indexOf(globalCutoffPWKey); 
    if(cutoffIndex === -1) cutoffIndex = 0;
    let delayIndex = globalUniquePeriodeWPP.indexOf(globalDelayPWKey);
    if(delayIndex === -1) delayIndex = 0;

    // --- STWC MISSING ALERT LOGIC ---
    let missingStwcWpps = new Set();
    globalMasterData.forEach(m => {
        if (m._status !== 'CLOSED' && (!m.STWC || m.STWC === '-' || m.STWC === '')) {
            let p = String(m.PERIODE || '-').trim();
            let w = getWPP(String(m.WP || '-').trim());
            missingStwcWpps.add(`WP ${w} (${p})`);
        }
    });
    let alertEl = document.getElementById('overview-stwc-alert');
    let alertTextEl = document.getElementById('overview-stwc-alert-text');
    if (missingStwcWpps.size > 0 && alertEl && alertTextEl) {
        let missingArr = Array.from(missingStwcWpps).sort();
        let text = missingArr.slice(0, 3).join(', ');
        if(missingArr.length > 3) text += ` dan ${missingArr.length - 3} lainnya`;
        alertTextEl.innerText = `Data baru terdeteksi: ${text}.`;
        alertEl.classList.remove('hidden');
    } else if (alertEl) {
        alertEl.classList.add('hidden');
    }

    // --- STANDARD FIFO LOGIC ---
    let timeline = [];
    
    // Penentuan separator WP dinamis berdasarkan Filter
    let wpSep = '/';
    if (activeOverviewCat === 'SMC') wpSep = 'S';
    else if (activeOverviewCat === 'CAT') wpSep = 'C';
    else if (activeOverviewCat === 'SMV') wpSep = '-';
    else if (activeOverviewCat === 'ADD') wpSep = 'E';

    globalUniquePeriodeWPP.forEach(pwKey => {
        let [per, wp] = pwKey.split('_');
        
        let stwcDateStr = globalSTWCSettings[pwKey];
        if (!stwcDateStr) {
            let matches = globalMasterData.filter(m => m.PERIODE === per && getWPP(String(m.WP||'').trim()) === wp && m.STWC && m.STWC !== '-' && m.STWC !== '');
            if (matches.length > 0) stwcDateStr = matches[0].STWC;
        }
        if (stwcDateStr) {
            timeline.push({ pwKey, per, wp, time: parseIndoDate(stwcDateStr), dateStr: stwcDateStr });
        }
    });
    timeline.sort((a,b) => a.time - b.time);

    let todayTime = new Date().setHours(0,0,0,0);
    let currentStwcIndex = -1;
    let daysPassed = 0;
    
    for(let i = 0; i < timeline.length; i++) {
        if (timeline[i].time <= todayTime) {
            currentStwcIndex = i;
            daysPassed = getWorkdayDiff(timeline[i].time, todayTime);
        } else {
            break;
        }
    }

    let textJoint = "-", textCrimp = "-", textCut = "-";

    if (currentStwcIndex !== -1) {
        let formatLabel = (item) => {
            if (!item) return `<span class="text-xl font-black text-white/50 leading-none tracking-tight drop-shadow-sm">Menunggu Data...</span>`;
            let shortPer = item.per.length >= 6 ? item.per.slice(4,6) : item.per;
            return `<span class="text-2xl font-black text-white leading-none tracking-tight drop-shadow-sm flex items-center">WP ${item.wp}${wpSep}${shortPer} Hari Ke-${daysPassed + 1}</span>`;
        };
        textJoint = formatLabel(timeline[currentStwcIndex + 1]);
        textCrimp = formatLabel(timeline[currentStwcIndex + 2]);
        textCut   = formatLabel(timeline[currentStwcIndex + 3]);
    } else if (timeline.length > 0 && timeline[0].time > todayTime) {
        let formatLabel = (item) => {
            if (!item) return `<span class="text-xl font-black text-white/50 leading-none tracking-tight drop-shadow-sm">Menunggu Data...</span>`;
            let shortPer = item.per.length >= 6 ? item.per.slice(4,6) : item.per;
            return `<span class="text-2xl font-black text-white leading-none tracking-tight drop-shadow-sm flex items-center">WP ${item.wp}${wpSep}${shortPer} Belum Mulai</span>`;
        };
        textJoint = formatLabel(timeline[0]);
        textCrimp = formatLabel(timeline[1]);
        textCut   = formatLabel(timeline[2]);
    }

    safeSetHTML('fifo-joint', textJoint);
    safeSetHTML('fifo-crimping', textCrimp);
    safeSetHTML('fifo-cutting', textCut);

    let activeMasterData = globalMasterData.filter(m => {
        let rPer = String(m['PERIODE'] || '-').trim();
        let rWp = getWPP(String(m['WP'] || '-').trim());
        
        if (activeOverviewCat !== 'ALL') {
            if (getCategoryName(m.WP) !== activeOverviewCat) return false;
        }

        if (globalCutoffPWKey) {
            let [cutPer, cutWp] = globalCutoffPWKey.split('_');
            if (!rPer || rPer === '-' || !rWp || rWp === '-' || rWp === 'undefined') return true; 
            if (rPer < cutPer) return false;
            if (rPer === cutPer && parseInt(rWp) < parseInt(cutWp)) return false;
        }
        return true;
    });

    let tMaster = activeMasterData.length;
    let tCnd3 = activeMasterData.filter(m => m._status === 'CND 3').length;
    let tCnd2 = activeMasterData.filter(m => m._status === 'CND 2').length;
    let tClosed = activeMasterData.filter(m => m._status === 'CLOSED').length;
    
    // Perbaikan Bug: Hitung status CND 1 (yang dulunya OPEN)
    let tOpen = activeMasterData.filter(m => m._status === 'CND 1').length;
    
    safeSetText('ov-master-total', tMaster.toLocaleString());
    safeSetText('ov-master-cnd3', tCnd3.toLocaleString());
    safeSetText('ov-master-cnd2', tCnd2.toLocaleString());
    safeSetText('ov-master-closed', tClosed.toLocaleString());
    safeSetText('ov-master-onsched', tOpen.toLocaleString());

    let todayStr = getTodayDateStr();
    let closedToday = activeMasterData.filter(m => m._status === 'CLOSED' && m._closedDate === todayStr);
    let overdueList = activeMasterData.filter(m => m._status === 'CND 3' || m._status === 'CND 2');
    
    if(activeOverdueWP !== 'ALL') {
        overdueList = overdueList.filter(m => {
            let w = String(m['WP'] || '').toUpperCase();
            if(activeOverdueWP === 'REG') return w.includes('/');
            if(activeOverdueWP === 'SMV') return w.includes('-');
            return w.includes(activeOverdueWP);
        });
    }

    if(activeClosedWP !== 'ALL') {
        closedToday = closedToday.filter(m => {
            let w = String(m['WP'] || '').toUpperCase();
            if(activeClosedWP === 'REG') return w.includes('/');
            if(activeClosedWP === 'SMV') return w.includes('-');
            return w.includes(activeClosedWP);
        });
    }

    closedToday.sort((a, b) => parseIndoDate(a['STWC']) - parseIndoDate(b['STWC']));
    overdueList.sort((a, b) => parseIndoDate(a['STWC']) - parseIndoDate(b['STWC']));

    // Simpan ke variabel global untuk diexport
    window.currentClosedExportData = closedToday;
    window.currentOverdueExportData = overdueList;

    const ovWpFilterContainer = document.getElementById('overdue-wp-filters');
    if(ovWpFilterContainer) {
        let wpFiltersHtml = '';
        const filterBtns = [ {l:'ALL', v:'ALL'}, {l:'ADD (E/A)', v:'E'}, {l:'CAT (C)', v:'C'}, {l:'REG (/)', v:'REG'}, {l:'SMC (S)', v:'S'}, {l:'SMV (-)', v:'SMV'} ];
        filterBtns.forEach(fb => {
            let actClass = activeOverdueWP === fb.v
                ? 'bg-red-600 text-white shadow-sm border-red-500'
                : 'bg-white text-gray-600 border-gray-200 hover:border-red-300 hover:text-red-600';
            wpFiltersHtml += `<button onclick="setOverdueWPFilter('${fb.v}')" class="px-2 py-0.5 text-[8px] font-bold rounded border transition whitespace-nowrap ${actClass}">${fb.l}</button>`;
        });
        ovWpFilterContainer.innerHTML = wpFiltersHtml;
    }

    const clWpFilterContainer = document.getElementById('closed-wp-filters');
    if(clWpFilterContainer) {
        let clFiltersHtml = '';
        const filterBtns = [ {l:'ALL', v:'ALL'}, {l:'ADD (E/A)', v:'E'}, {l:'CAT (C)', v:'C'}, {l:'REG (/)', v:'REG'}, {l:'SMC (S)', v:'S'}, {l:'SMV (-)', v:'SMV'} ];
        filterBtns.forEach(fb => {
            let actClass = activeClosedWP === fb.v
                ? 'bg-emerald-600 text-white shadow-sm border-emerald-500'
                : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-300 hover:text-emerald-600';
            clFiltersHtml += `<button onclick="setClosedWPFilter('${fb.v}')" class="px-2 py-0.5 text-[8px] font-bold rounded border transition whitespace-nowrap ${actClass}">${fb.l}</button>`;
        });
        clWpFilterContainer.innerHTML = clFiltersHtml;
    }

    let wipMap = new Map(); globalWipData.forEach(w => wipMap.set(w._uid, w));

    safeSetText('ov-closed-today-count', closedToday.length.toString());
    const listEl = document.getElementById('overview-closed-list');
    if(listEl) {
        if(closedToday.length === 0) listEl.innerHTML = `<div class="text-center ewip-panel-sub text-[10px] mt-4 font-medium">Belum ada Assy yang selesai hari ini.</div>`;
        else {
            let logHtml = '';
            closedToday.forEach(m => {
                let w = wipMap.get(m._uid);
                let qty = parseFloat(m['QTY'] || 0);
                let qtyCct = parseFloat(m['CCT'] || m['QTY CCT'] || 0);
                let totalCct = w && w['PP CCT'] ? parseFloat(w['PP CCT']) : parseFloat(m['TOTAL CCT'] || 0);
                logHtml += `
                <div onclick="openAdvancedDrilldown('SINGLE', '${m._uid}')" class="p-2 border rounded-lg ${ui.closedCard} transition cursor-pointer shadow-sm hover:scale-[1.01]">
                    <div class="flex justify-between items-center w-full text-[9px]">
                        <span class="font-bold font-mono tabular-nums ${ui.closedTitle}">${m['ASSY'] || '-'} <span class="${ui.closedSub} font-normal ml-1">(${m['PERIODE']||'-'} | ${m['WP'] || '-'})</span></span>
                        <span class="${ui.closedSub} font-bold font-mono">${m._closedDate || todayStr}</span>
                    </div>
                    <div class="flex justify-between items-center w-full mt-1.5 text-[8px] font-mono">
                        <span class="${ui.closedChip} px-1.5 py-0.5 rounded border">QTY: <strong class="${ui.closedChipVal}">${qty}</strong></span>
                        <span class="${ui.closedChip} px-1.5 py-0.5 rounded border">CCT: <strong class="text-purple-600">${qtyCct}</strong></span>
                        <span class="${ui.closedChip} px-1.5 py-0.5 rounded border">TOTAL: <strong class="ewip-accent-text">${totalCct}</strong></span>
                    </div>
                </div>`;
            });
            listEl.innerHTML = logHtml;
        }
    }

    safeSetText('ov-overdue-list-count', overdueList.length.toString());
    const listOverdueEl = document.getElementById('overview-overdue-list');
    if(listOverdueEl) {
        if(overdueList.length === 0) listOverdueEl.innerHTML = `<div class="text-center ewip-panel-sub text-[10px] mt-4 font-medium">Tidak ada Assy yang overdue.</div>`;
        else {
            let logHtml = '';
            overdueList.forEach(m => {
                let isCnd3 = m._status === 'CND 3';
                let bg = isCnd3 ? ui.cnd3Card : ui.cnd2Card;
                let w = wipMap.get(m._uid);
                let qty = parseFloat(m['QTY'] || 0);
                let qtyCct = parseFloat(m['CCT'] || m['QTY CCT'] || 0);
                let totalCct = w && w['PP CCT'] ? parseFloat(w['PP CCT']) : parseFloat(m['TOTAL CCT'] || 0);
                logHtml += `
                <div onclick="openAdvancedDrilldown('SINGLE', '${m._uid}')" class="p-2 border rounded-lg ${bg} transition cursor-pointer shadow-sm hover:scale-[1.01]">
                    <div class="flex justify-between items-center w-full text-[9px]">
                        <span class="font-bold font-mono tabular-nums ${ui.cndTitle}">${m['ASSY'] || '-'} <span class="font-normal ml-1 opacity-90">(${m['PERIODE']||'-'} | ${m['WP']||'-'})</span></span>
                        <span class="font-bold font-mono">${m['STWC'] || '-'}</span>
                    </div>
                    <div class="flex justify-between items-center w-full mt-1.5 text-[8px] font-mono">
                        <span class="${ui.closedChip} px-1.5 py-0.5 rounded border">QTY: <strong class="${ui.closedChipVal}">${qty}</strong></span>
                        <span class="${ui.closedChip} px-1.5 py-0.5 rounded border">CCT: <strong class="text-purple-600">${qtyCct}</strong></span>
                        <span class="${ui.closedChip} px-1.5 py-0.5 rounded border">TOTAL: <strong class="ewip-accent-text">${totalCct}</strong></span>
                    </div>
                </div>`;
            });
            listOverdueEl.innerHTML = logHtml;
        }
    }

    // Populate SH Overview List
    const shListContainer = document.getElementById('overview-sh-list');
    if(shListContainer) {
        let activeShCount = globalShMaterials.filter(sh => !sh.tanggalKedatangan).length;
        safeSetText('ov-sh-list-count', activeShCount.toString() + ' Aktif');
        
        if(globalShMaterials.length === 0) {
            shListContainer.innerHTML = `<div class="text-center ewip-panel-sub text-[10px] mt-4 font-medium">Belum ada riwayat SH.</div>`;
        } else {
            let sortedSh = [...globalShMaterials].sort((a, b) => {
                if (a.tanggalKedatangan === null && b.tanggalKedatangan !== null) return -1;
                if (a.tanggalKedatangan !== null && b.tanggalKedatangan === null) return 1;
                return b.id - a.id; 
            });

            let shHtml = '';
            sortedSh.forEach(sh => {
                let isArrived = sh.tanggalKedatangan !== null;
                let bg = isArrived ? ui.shArrivedCard : ui.shOpenCard;
                let statusBadge = isArrived
                    ? `<span class="text-[8px] font-bold ${ui.shArrivedBadge} border px-1.5 py-0.5 rounded">Arrived</span>`
                    : `<span class="text-[8px] font-bold ${ui.shOpenBadge} border px-1.5 py-0.5 rounded animate-pulse">OPEN</span>`;
                let assyCount = sh.targetUids ? sh.targetUids.length : 0;
                
                shHtml += `
                <div onclick="openShDetailModal(${sh.id})" class="p-2 border rounded-lg ${bg} transition shadow-sm flex flex-col gap-1.5 cursor-pointer hover:scale-[1.015]">
                    <div class="flex justify-between items-center w-full text-[9px]">
                        <span class="font-bold font-mono ${ui.closedTitle} truncate pr-1" title="${sh.partName}">${sh.partName || '-'}</span>
                        ${statusBadge}
                    </div>
                    <div class="flex justify-between items-center w-full text-[8px] ewip-panel-sub font-mono">
                        <span><strong class="ewip-accent-text">${sh.type || '-'}</strong> | ${assyCount} Assy</span>
                        ${isArrived ? `<span class="${ui.closedSub} font-bold">${sh.tanggalKedatangan}</span>` : `<span>In: ${sh.tanggalSH}</span>`}
                    </div>
                </div>`;
            });
            shListContainer.innerHTML = shHtml;
        }
    }

    let wppSums = {}; let catSums = { ADD:{}, CAT:{}, REG:{}, SMC:{}, SMV:{} };
    let catStats = { 
        ADD: {load:0, delay:0, onsched:0, sh_delay:0, sh_onsched:0, sh:0, count_delay:0, count_onsched:0, count_sh:0, qtyArr_delay:[], qtyArr_onsched:[], qtyArr_sh:[], avg_delay:0, avg_onsched:0, avg_sh:0}, 
        CAT: {load:0, delay:0, onsched:0, sh_delay:0, sh_onsched:0, sh:0, count_delay:0, count_onsched:0, count_sh:0, qtyArr_delay:[], qtyArr_onsched:[], qtyArr_sh:[], avg_delay:0, avg_onsched:0, avg_sh:0}, 
        REG: {load:0, delay:0, onsched:0, sh_delay:0, sh_onsched:0, sh:0, count_delay:0, count_onsched:0, count_sh:0, qtyArr_delay:[], qtyArr_onsched:[], qtyArr_sh:[], avg_delay:0, avg_onsched:0, avg_sh:0}, 
        SMC: {load:0, delay:0, onsched:0, sh_delay:0, sh_onsched:0, sh:0, count_delay:0, count_onsched:0, count_sh:0, qtyArr_delay:[], qtyArr_onsched:[], qtyArr_sh:[], avg_delay:0, avg_onsched:0, avg_sh:0}, 
        SMV: {load:0, delay:0, onsched:0, sh_delay:0, sh_onsched:0, sh:0, count_delay:0, count_onsched:0, count_sh:0, qtyArr_delay:[], qtyArr_onsched:[], qtyArr_sh:[], avg_delay:0, avg_onsched:0, avg_sh:0} 
    };
    let kpiTotalLoad = 0; let kpiDelay = 0; let kpiOnSched = 0; let kpiSH = 0;
    let globalTotalLoad = 0; let globalDelay = 0; let globalOnSched = 0; let globalSH = 0;
    let stackedData = { grand: { sched: [], delay: [], sh_delay: [], sh_onsched: [] }, add: { sched: [], delay: [], sh_delay: [], sh_onsched: [] }, cat: { sched: [], delay: [], sh_delay: [], sh_onsched: [] }, reg: { sched: [], delay: [], sh_delay: [], sh_onsched: [] }, smc: { sched: [], delay: [], sh_delay: [], sh_onsched: [] }, smv: { sched: [], delay: [], sh_delay: [], sh_onsched: [] } };

    if (globalWipData.length > 0) {
        globalUniquePeriodeWPP.forEach(pwKey => { 
            wppSums[pwKey] = 0; CATEGORIES.forEach(c => catSums[c][pwKey] = 0); 
            stackedData.grand.sched.push(0); stackedData.grand.delay.push(0); stackedData.grand.sh_delay.push(0); stackedData.grand.sh_onsched.push(0);
            CATEGORIES.forEach(cat => { stackedData[cat.toLowerCase()].sched.push(0); stackedData[cat.toLowerCase()].delay.push(0); stackedData[cat.toLowerCase()].sh_delay.push(0); stackedData[cat.toLowerCase()].sh_onsched.push(0); });
        });

        let wipMap = new Map(); globalWipData.forEach(w => wipMap.set(w._uid, w));

        globalMasterData.forEach(m => {
            if(m._status === 'CLOSED') return;
            let pwKey = (m['PERIODE'] || '-') + '_' + getWPP(String(m['WP'] || '').trim());
            let wppIndex = globalUniquePeriodeWPP.indexOf(pwKey);
            if (wppIndex !== -1 && wppIndex < cutoffIndex) return; 

            let w = wipMap.get(m._uid);
            if(!w) return;

            const ppCct = parseFloat(w['PP CCT']) || 0; 
            const qtyDisplay = parseFloat(m['QTY'] || 0); 
            const wpCat = getCategoryName(m['WP']);
            let catKey = CATEGORIES.includes(wpCat) ? wpCat : null;

            const isDelay = wppIndex < delayIndex; 
            let isSHInSystem = globalShMaterials.some(sh => sh.tanggalKedatangan === null && sh.targetUids && sh.targetUids.includes(m._uid));
            let problemStrRaw = Object.keys(w).find(k => k.includes('KETERANGAN') || k.includes('PROBLEM') || k.includes('POTENSI'));
            let isPotensiSH = problemStrRaw ? String(w[problemStrRaw]).toUpperCase().includes('SH') : false;
            let isSH = isSHInSystem || isPotensiSH;

            // Akumulasi global seluruh kategori agar snapshot dailyHistory tidak pernah terdistorsi filter kategori aktif
            globalTotalLoad += ppCct;
            if(isDelay) globalDelay += ppCct; else globalOnSched += ppCct;
            if(isSH) globalSH += ppCct;

            if (activeOverviewCat === 'ALL' || activeOverviewCat === catKey) {
                kpiTotalLoad += ppCct; 
                if(isDelay) kpiDelay += ppCct; else kpiOnSched += ppCct;
                if(isSH) kpiSH += ppCct;

                if(wppSums[pwKey] !== undefined) wppSums[pwKey] += ppCct;
                
                if(isSH && isDelay) stackedData.grand.sh_delay[wppIndex] += ppCct;
                else if(isSH && !isDelay) stackedData.grand.sh_onsched[wppIndex] += ppCct;
                else if(isDelay && !isSH) stackedData.grand.delay[wppIndex] += ppCct;
                else stackedData.grand.sched[wppIndex] += ppCct;
            }
            
            if(catKey) { 
                catStats[catKey].load += ppCct; 
                if(isDelay) catStats[catKey].delay += ppCct; else catStats[catKey].onsched += ppCct;
                
                if(isSH) {
                    catStats[catKey].sh += ppCct; catStats[catKey].count_sh++;
                    if(isDelay) catStats[catKey].sh_delay += ppCct; else catStats[catKey].sh_onsched += ppCct;
                    if(qtyDisplay > 0) catStats[catKey].qtyArr_sh.push(qtyDisplay);
                } else if(isDelay) {
                    catStats[catKey].count_delay++;
                    if(qtyDisplay > 0) catStats[catKey].qtyArr_delay.push(qtyDisplay);
                } else {
                    catStats[catKey].count_onsched++;
                    if(qtyDisplay > 0) catStats[catKey].qtyArr_onsched.push(qtyDisplay);
                }
            }
            
            if(catKey && catSums[catKey][pwKey] !== undefined) {
                catSums[catKey][pwKey] += ppCct;
                if(isSH && isDelay) stackedData[catKey.toLowerCase()].sh_delay[wppIndex] += ppCct;
                else if(isSH && !isDelay) stackedData[catKey.toLowerCase()].sh_onsched[wppIndex] += ppCct;
                else if(isDelay && !isSH) stackedData[catKey.toLowerCase()].delay[wppIndex] += ppCct;
                else stackedData[catKey.toLowerCase()].sched[wppIndex] += ppCct;
            }
        });

        CATEGORIES.forEach(c => {
            catStats[c].avg_sh = getAvgQtyOutlierEliminated(catStats[c].qtyArr_sh);
            catStats[c].avg_delay = getAvgQtyOutlierEliminated(catStats[c].qtyArr_delay);
            catStats[c].avg_onsched = getAvgQtyOutlierEliminated(catStats[c].qtyArr_onsched);
        });
    }

    // Hitung Paylater (Global + Per-Kategori + Active Filter) sebelum update dailyHistory
    let kpiPaylater = 0;
    let globalPaylater = 0;
    let catPaylater = { ADD: 0, CAT: 0, REG: 0, SMC: 0, SMV: 0 };

    if (globalWipData.length > 0) {
        globalAssyPaylater.forEach(py => {
            if (py.dorongDate === null) {
                let m = globalMasterData.find(x => x._uid === py.uid);
                let mPeriode = m ? (m.PERIODE || '-') : (py.periode || '-');
                let mWp = m ? (m.WP || '-') : (py.wp || '-');
                let wpCat = getCategoryName(mWp);

                let pwKey = mPeriode + '_' + getWPP(String(mWp).trim());
                let wppIndex = globalUniquePeriodeWPP.indexOf(pwKey);
                if (wppIndex !== -1 && wppIndex < cutoffIndex) return;

                let ppCct = 0;
                if(m) {
                    let w = wipMap.get(py.uid);
                    ppCct = w && w['PP CCT'] ? parseFloat(w['PP CCT']) : parseFloat(m['TOTAL CCT'] || 0);
                }

                globalPaylater += ppCct;
                if (CATEGORIES.includes(wpCat)) catPaylater[wpCat] += ppCct;
                if (activeOverviewCat === 'ALL' || wpCat === activeOverviewCat) {
                    kpiPaylater += ppCct;
                }
            }
        });

        // Persist metrik harian lengkap ke dailyHistory hanya jika nilainya benar-benar berubah (anti ping-pong sync)
        let currentGlobalPct = globalTotalLoad > 0 ? (globalOnSched / globalTotalLoad) * 100 : 0;
        let currentCatPct = {};
        let currentCatMetrics = {};
        CATEGORIES.forEach(c => {
            let t = catStats[c].load;
            let pctVal = t > 0 ? (catStats[c].onsched / t) * 100 : 0;
            currentCatPct[c] = Number(pctVal.toFixed(2));
            currentCatMetrics[c] = {
                pct: Number(pctVal.toFixed(2)),
                totalLoad: Math.round(catStats[c].load),
                onSched: Math.round(catStats[c].onsched),
                delay: Math.round(catStats[c].delay),
                sh: Math.round(catStats[c].sh),
                paylater: Math.round(catPaylater[c] || 0)
            };
        });

        let existingHistoryIdx = dailyHistory.findIndex(h => h.dateKey === todayStr);
        let nextMetrics = {
            pct: Number(currentGlobalPct.toFixed(2)),
            catPct: currentCatPct,
            totalLoad: Math.round(globalTotalLoad),
            onSched: Math.round(globalOnSched),
            delay: Math.round(globalDelay),
            sh: Math.round(globalSH),
            paylater: Math.round(globalPaylater),
            catMetrics: currentCatMetrics
        };

        let historyChanged = false;
        if (existingHistoryIdx !== -1) {
            const target = dailyHistory[existingHistoryIdx];
            const prevComparable = JSON.stringify({
                pct: target.pct,
                catPct: target.catPct,
                totalLoad: target.totalLoad,
                onSched: target.onSched,
                delay: target.delay,
                sh: target.sh,
                paylater: target.paylater,
                catMetrics: target.catMetrics
            });
            const nextComparable = JSON.stringify(nextMetrics);
            if (prevComparable !== nextComparable) {
                Object.assign(target, nextMetrics);
                historyChanged = true;
            }
        } else {
            dailyHistory.push(Object.assign({
                dateKey: todayStr,
                label: new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
                cnd3: tCnd3 + tCnd2,
                open: tOpen,
                closed: tClosed
            }, nextMetrics));
            historyChanged = true;
        }

        if (historyChanged && isFirebaseActive && !isApplyingRealtimeSync) {
            saveDB('daily_history', dailyHistory);
        }

        // TRIGGER HUJAN BEBEK JIKA TREN >= 90% (Dibatasi 1x setiap 15 detik agar tidak menumpuk)
        let activeDisplayPct = kpiTotalLoad > 0 ? (kpiOnSched / kpiTotalLoad) * 100 : 0;
        if (activeDisplayPct >= 90 && (Date.now() - window.lastDuckRainTime > 15000)) {
            window.lastDuckRainTime = Date.now();
            setTimeout(window.triggerDuckRain, 800);
        }
    }

    // Populate Filter Bulan Dropdown
    const trendFilterEl = document.getElementById('trend-month-filter');
    if (trendFilterEl) {
        let months = new Set();
        dailyHistory.forEach(h => {
            if (h.dateKey) {
                let m = h.dateKey.substring(0, 7); // Format: YYYY-MM
                months.add(m);
            }
        });
        
        let isFirstLoad = !trendFilterEl.hasAttribute('data-init');
        let currentVal = trendFilterEl.value;
        let thisMonthStr = getTodayDateStr().substring(0, 7); // Ambil format YYYY-MM hari ini
        
        let optHtml = `<option value="ALL">SEMUA WAKTU</option>`;
        let sortedMonths = Array.from(months).sort().reverse();
        
        sortedMonths.forEach(m => {
            let [yyyy, mm] = m.split('-');
            let mName = new Date(parseInt(yyyy), parseInt(mm)-1, 1).toLocaleDateString('id-ID', {month:'short', year:'numeric'});
            optHtml += `<option value="${m}">${mName}</option>`;
        });
        trendFilterEl.innerHTML = optHtml;
        
        // Logika Default Bulan Saat Ini (Atau bulan terbaru jika bulan ini belum ada datanya)
        if (isFirstLoad) {
            if (months.has(thisMonthStr)) {
                trendFilterEl.value = thisMonthStr;
            } else if (sortedMonths.length > 0) {
                trendFilterEl.value = sortedMonths[0]; 
            }
            trendFilterEl.setAttribute('data-init', 'true');
        } else if (months.has(currentVal) || currentVal === 'ALL') {
            trendFilterEl.value = currentVal; // Pertahankan pilihan user
        }
    }

    let activeMonth = trendFilterEl ? trendFilterEl.value : 'ALL';
    let filteredHistory = dailyHistory;
    if (activeMonth !== 'ALL') {
        filteredHistory = dailyHistory.filter(h => h.dateKey && h.dateKey.startsWith(activeMonth));
    }

    let dailyLabels = filteredHistory.map(h => h.label);
    let pctData = filteredHistory.map(h => {
        if (activeOverviewCat === 'ALL') return h.pct ? Number(h.pct).toFixed(2) : 0;
        if (h.catPct && h.catPct[activeOverviewCat] !== undefined) return Number(h.catPct[activeOverviewCat]).toFixed(2);
        return h.pct ? Number(h.pct).toFixed(2) : 0;
    });

    let n = pctData.length; let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) { let y = parseFloat(pctData[i]); sumX += i; sumY += y; sumXY += i * y; sumX2 += i * i; }
    let slope = n > 1 ? (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX) : 0;
    let intercept = n > 0 ? (sumY - slope * sumX) / n : parseFloat(pctData[0] || 0);
    let trendlineData = []; for (let i = 0; i < n; i++) trendlineData.push((slope * i + intercept).toFixed(2));

    safeSetText('daily-trend-title-cat', activeOverviewCat);

    createOrUpdateChart('chartDailyTrend', 'line', {
        labels: dailyLabels,
        datasets: [
            { type: 'line', label: 'Trendline', data: trendlineData, borderColor: ct.trendRegression, borderDash: [6, 4], borderWidth: 2, fill: false, pointRadius: 0, tension: 0 },
            { type: 'line', label: '% On-Schedule', data: pctData, borderColor: ct.trendLine, 
              backgroundColor: (context) => { const ctx = context.chart.ctx; const gradient = ctx.createLinearGradient(0, 0, 0, 220); gradient.addColorStop(0, ct.trendAreaTop); gradient.addColorStop(1, ct.trendAreaBottom); return gradient; },
              fill: true, tension: 0.38, borderWidth: 2.5, pointBackgroundColor: ct.pointBg, pointBorderColor: ct.pointBorder, pointBorderWidth: 2, pointRadius: 4, pointHoverRadius: 6 }
        ]
    }, { responsive: true, maintainAspectRatio: false, plugins: { datalabels: { display: false }, tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.raw}%` } }, legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { min: 0, max: 100, border: { dash: [4, 4] } } } });

    if (typeof window.applyOverviewSubTabClasses === 'function') window.applyOverviewSubTabClasses();
    if (window.activeOverviewSubTab === 'trend-daily' && typeof window.renderTrendFifoDaily === 'function') {
        window.renderTrendFifoDaily(isApplyingRealtimeSync);
    }

    if(globalWipData.length === 0) return;

    safeSetText('ov-kpi-load', kpiTotalLoad.toLocaleString());
    safeSetText('ov-kpi-sh', kpiSH.toLocaleString());
    safeSetText('ov-kpi-paylater', kpiPaylater.toLocaleString());
    safeSetText('ov-kpi-delay', kpiDelay.toLocaleString());
    safeSetText('ov-kpi-onsched', kpiOnSched.toLocaleString());

    // Menyimpan stat untuk tombol Copy Report Text
    let fifoValue = kpiTotalLoad > 0 ? ((kpiTotalLoad - kpiDelay) / kpiTotalLoad * 100).toFixed(2) : 0;
    window.currentReportStats = {
        totalLoad: kpiTotalLoad,
        onSched: kpiOnSched,
        delay: kpiDelay,
        sh: kpiSH,
        paylater: kpiPaylater,
        fifoPct: fifoValue
    };

    safeSetHTML('overview-charts-container', ''); 
    const chartsContainer = document.getElementById('overview-charts-container');

    let activeLabels = globalUniquePeriodeWPP.slice(cutoffIndex).map(k => { let parts = k.split('_'); return `${parts[0]} - ${parts[1]}`; }); 
    let activeGrandDataArray = globalUniquePeriodeWPP.slice(cutoffIndex).map(k => wppSums[k]);
    
    const renderBigChart = (chartId, titleText, stats, totalArray, shDelayArray, shOnschedArray, delayArray, schedArray) => {
        let t = stats.load; 
        let pctDelay = t > 0 ? Math.round((stats.delay/t)*100) : 0; 
        let pctSched = t > 0 ? Math.round((stats.onsched/t)*100) : 0; 
        let pctSh = t > 0 ? Math.round((stats.sh/t)*100) : 0;
        
        let html = `
        <div class="bento-box flex flex-col w-full mt-2 overflow-hidden">
            <div class="px-4 lg:px-5 py-3 border-b ${ui.chartHeader} flex justify-between items-center rounded-t-xl shrink-0">
                <div>
                    <h2 class="font-batik-display font-bold ${ui.chartTitle} text-sm flex items-center gap-2 tracking-wide"><i data-lucide="bar-chart-2" class="w-4 h-4 ewip-accent-icon"></i> ${titleText}</h2>
                    <p class="text-[10px] ${ui.chartSub} mt-0.5">${ct.legendCaption}</p>
                </div>
                <div class="text-right text-[10px] font-bold ${ui.chartTotalBox} uppercase tracking-widest border px-3 py-1.5 rounded-md shadow-inner">Total Load: <span class="font-mono tabular-nums text-sm ${ui.chartTotalVal} font-black ml-1">${t.toLocaleString()}</span></div>
            </div>
            
            <div class="flex flex-col xl:flex-row flex-1 p-4 lg:p-5 gap-4 lg:gap-6 items-center xl:items-stretch overflow-hidden">
                <div class="flex-[3] relative min-h-[260px] lg:min-h-[310px] w-full min-w-0 cursor-pointer hover:opacity-95 transition" title="Klik pada batang manapun untuk melihat List Assy">
                    <canvas id="chartLine_${chartId}"></canvas>
                </div>
                
                <div class="hidden xl:block w-px ${ui.chartDivider} shrink-0 self-stretch my-2"></div>
                
                <div class="flex-[1.5] w-full xl:w-auto xl:min-w-[355px] flex flex-row items-center justify-center p-3 lg:p-4 ${ui.chartLegendBox} rounded-xl border shadow-inner shrink-0 cursor-pointer transition" onclick="openAdvancedDrilldown('LEGEND', '${chartId}')">
                    <div class="w-[130px] h-[130px] lg:w-[205px] lg:h-[205px] relative shrink-0"><canvas id="chartPie_${chartId}"></canvas></div>
                    
                    <div class="flex flex-col gap-2.5 lg:gap-3 text-[10px] font-bold flex-1 ml-4 lg:ml-5 min-w-[155px]">
                        <div class="flex justify-between items-center ${ui.legendSchedCard} px-3 py-2.5 rounded-lg shadow-sm border transition cursor-pointer" onclick="event.stopPropagation(); openAdvancedDrilldown('PIE_LEGEND', 'ONSCHED', '${chartId === 'GRAND' ? 'ALL' : chartId}')">
                            <div class="flex flex-col flex-1">
                                <span class="font-batik-display ${ui.legendSchedLabel} uppercase tracking-widest text-[9px] font-bold mb-1">On Schedule</span>
                                <div class="flex items-center gap-2 mb-1.5">
                                    <span class="font-mono tabular-nums text-base lg:text-lg ${ui.legendSchedVal} font-black leading-none">${stats.onsched.toLocaleString()}</span>
                                    <span class="font-mono text-[9px] font-black ${ui.legendSchedSh} px-1.5 py-0.5 rounded border leading-none" title="Porsi Potensi SH">SH: ${stats.sh_onsched.toLocaleString()}</span>
                                </div>
                                <div class="flex items-center gap-2 text-[9px] font-bold ${ui.legendMeta} font-mono">
                                    <span>Assy: <strong class="${ui.legendSchedVal}">${stats.count_onsched||0}</strong></span>
                                    <span class="w-1 h-1 rounded-full bg-current opacity-40"></span>
                                    <span>Avg: <strong class="${ui.legendSchedVal}">${stats.avg_onsched||0}</strong></span>
                                </div>
                            </div>
                            <span class="font-mono tabular-nums ${ui.legendSchedPct} px-2 py-1.5 rounded text-xs font-black border shrink-0 ml-2">${pctSched}%</span>
                        </div>
                        
                        <div class="flex justify-between items-center ${ui.legendDelayCard} px-3 py-2.5 rounded-lg shadow-sm border transition cursor-pointer" onclick="event.stopPropagation(); openAdvancedDrilldown('PIE_LEGEND', 'DELAY', '${chartId === 'GRAND' ? 'ALL' : chartId}')">
                            <div class="flex flex-col flex-1">
                                <span class="font-batik-display ${ui.legendDelayLabel} uppercase tracking-widest text-[9px] font-bold mb-1">Delay (Outstanding)</span>
                                <div class="flex items-center gap-2 mb-1.5">
                                    <span class="font-mono tabular-nums text-base lg:text-lg ${ui.legendDelayVal} font-black leading-none">${stats.delay.toLocaleString()}</span>
                                    <span class="font-mono text-[9px] font-black ${ui.legendDelaySh} px-1.5 py-0.5 rounded border leading-none" title="Porsi Delay SH">SH: ${stats.sh_delay.toLocaleString()}</span>
                                </div>
                                <div class="flex items-center gap-2 text-[9px] font-bold ${ui.legendMeta} font-mono">
                                    <span>Assy: <strong class="${ui.legendDelayVal}">${stats.count_delay||0}</strong></span>
                                    <span class="w-1 h-1 rounded-full bg-current opacity-40"></span>
                                    <span>Avg: <strong class="${ui.legendDelayVal}">${stats.avg_delay||0}</strong></span>
                                </div>
                            </div>
                            <span class="font-mono tabular-nums ${ui.legendDelayPct} px-2 py-1.5 rounded text-xs font-black border shrink-0 ml-2">${pctDelay}%</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        `;
        if(chartsContainer) chartsContainer.insertAdjacentHTML('beforeend', html);
        lucide.createIcons();

        const sCfg = ct.series;
        const fillSched = theme.useBatikPatterns ? createBatikPattern(sCfg.sched.motif, sCfg.sched.base, sCfg.sched.stroke, sCfg.sched.accent) : sCfg.sched.fill;
        const fillShOnsched = theme.useBatikPatterns ? createBatikPattern(sCfg.shOnsched.motif, sCfg.shOnsched.base, sCfg.shOnsched.stroke, sCfg.shOnsched.accent) : sCfg.shOnsched.fill;
        const fillDelay = theme.useBatikPatterns ? createBatikPattern(sCfg.delay.motif, sCfg.delay.base, sCfg.delay.stroke, sCfg.delay.accent) : sCfg.delay.fill;
        const fillShDelay = theme.useBatikPatterns ? createBatikPattern(sCfg.shDelay.motif, sCfg.shDelay.base, sCfg.shDelay.stroke, sCfg.shDelay.accent) : sCfg.shDelay.fill;

        createOrUpdateChart(`chartLine_${chartId}`, 'bar', {
            labels: activeLabels, datasets: [
                { type: 'line', label: 'Trendline', data: totalArray, borderColor: ct.barTrend, borderWidth: 2.5, fill: false, tension: 0.38, pointBackgroundColor: ct.pointBg, pointBorderColor: ct.barTrend, pointBorderWidth: 2, pointRadius: 4, pointHoverRadius: 6 },
                { type: 'bar', label: 'Delay SH', data: shDelayArray, backgroundColor: fillShDelay, borderColor: sCfg.shDelay.border, borderWidth: 1, borderRadius: {topLeft:0, topRight:0, bottomLeft:0, bottomRight:0} },
                { type: 'bar', label: 'Delay', data: delayArray, backgroundColor: fillDelay, borderColor: sCfg.delay.border, borderWidth: 1, borderRadius: {topLeft:4, topRight:4, bottomLeft:0, bottomRight:0} },
                { type: 'bar', label: 'Potensi SH', data: shOnschedArray, backgroundColor: fillShOnsched, borderColor: sCfg.shOnsched.border, borderWidth: 1, borderRadius: {topLeft:0, topRight:0, bottomLeft:0, bottomRight:0} },
                { type: 'bar', label: 'On Schedule', data: schedArray, backgroundColor: fillSched, borderColor: sCfg.sched.border, borderWidth: 1, borderRadius: {topLeft:4, topRight:4, bottomLeft:0, bottomRight:0} }
            ]
        }, { 
            responsive: true, maintainAspectRatio: false, 
            plugins: { 
                datalabels: {
                    display: function(context) { return context.dataset.type === 'bar' && context.dataset.data[context.dataIndex] > 0; },
                    color: ct.datalabelText,
                    backgroundColor: ct.datalabelBg,
                    borderRadius: 3,
                    padding: { top: 1, bottom: 1, left: 3, right: 3 },
                    font: { family: 'JetBrains Mono, monospace', weight: 'bold', size: 9 },
                    formatter: Math.round
                },
                legend: { display: false } 
            }, 
            scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, border: { dash: [4, 4] } } },
            onClick: (e, elements, chart) => {
                if (!elements.length) return;
                const dataIndex = elements[0].index;
                const pwKey = globalUniquePeriodeWPP.slice(cutoffIndex)[dataIndex];
                openAdvancedDrilldown('WPP', pwKey, chartId === 'GRAND' ? 'ALL' : chartId);
            }
        });

        let cleanDelay = stats.delay - stats.sh_delay; if(cleanDelay < 0) cleanDelay = 0;
        let cleanSched = stats.onsched - stats.sh_onsched; if(cleanSched < 0) cleanSched = 0;

        createOrUpdateChart(`chartPie_${chartId}`, 'doughnut', {
            labels: ['Delay', 'Delay SH', 'On Schedule', 'Potensi SH'],
            datasets: [{
                data: [cleanDelay, stats.sh_delay, cleanSched, stats.sh_onsched],
                backgroundColor: [fillDelay, fillShDelay, fillSched, fillShOnsched],
                borderWidth: 2.5,
                borderColor: ct.sliceBorder,
                hoverBorderColor: ct.sliceHoverBorder,
                hoverOffset: 6
            }]
        }, { 
            responsive: true, maintainAspectRatio: false, 
            plugins: { 
                legend: { display: false },
                datalabels: {
                    display: function(context) {
                        let sum = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                        return sum > 0 && (context.dataset.data[context.dataIndex] / sum) >= 0.06;
                    },
                    formatter: (value, ctx) => { let sum = ctx.chart.data.datasets[0].data.reduce((a, b) => a + b, 0); return (value*100 / sum).toFixed(0)+"%"; },
                    color: ct.datalabelText,
                    backgroundColor: ct.datalabelBg,
                    borderRadius: 4,
                    padding: { top: 2, bottom: 2, left: 4, right: 4 },
                    font: { family: 'JetBrains Mono, monospace', weight: 'bold', size: 11 }
                },
                tooltip: { enabled: true }
            }, 
            cutout: '58%',
            onClick: (e, elements, chart) => {
                if (!elements.length) return;
                const dataIndex = elements[0].index;
                let statusParam = dataIndex === 0 ? 'DELAY' : (dataIndex === 1 ? 'SH_DELAY' : (dataIndex === 2 ? 'ONSCHED' : 'SH_ONSCHED'));
                openAdvancedDrilldown('PIE_LEGEND', statusParam, chartId === 'GRAND' ? 'ALL' : chartId);
            }
        });
    };

    let grandStats = {load:0, delay:0, onsched:0, sh_delay:0, sh_onsched:0, sh:0, count_delay:0, count_onsched:0, count_sh:0, qtyArr_delay:[], qtyArr_onsched:[], qtyArr_sh:[], avg_delay:0, avg_onsched:0, avg_sh:0};
    if(activeOverviewCat === 'ALL') {
        CATEGORIES.forEach(cat => { 
            grandStats.load += catStats[cat].load; grandStats.delay += catStats[cat].delay; grandStats.onsched += catStats[cat].onsched; grandStats.sh += catStats[cat].sh; 
            grandStats.sh_delay += catStats[cat].sh_delay; grandStats.sh_onsched += catStats[cat].sh_onsched;
            grandStats.count_delay += catStats[cat].count_delay; grandStats.count_onsched += catStats[cat].count_onsched; grandStats.count_sh += catStats[cat].count_sh;
            grandStats.qtyArr_delay = grandStats.qtyArr_delay.concat(catStats[cat].qtyArr_delay);
            grandStats.qtyArr_onsched = grandStats.qtyArr_onsched.concat(catStats[cat].qtyArr_onsched);
            grandStats.qtyArr_sh = grandStats.qtyArr_sh.concat(catStats[cat].qtyArr_sh);
        });
        grandStats.avg_delay = getAvgQtyOutlierEliminated(grandStats.qtyArr_delay);
        grandStats.avg_onsched = getAvgQtyOutlierEliminated(grandStats.qtyArr_onsched);
        grandStats.avg_sh = getAvgQtyOutlierEliminated(grandStats.qtyArr_sh);
    } else {
        grandStats = catStats[activeOverviewCat];
    }

    renderBigChart(
        activeOverviewCat === 'ALL' ? 'GRAND' : activeOverviewCat, 
        activeOverviewCat === 'ALL' ? 'Grand Total Loading Trend (PP CCT)' : `Tren Loading Kategori: ${activeOverviewCat}`, 
        grandStats, 
        activeGrandDataArray, 
        stackedData.grand.sh_delay.slice(cutoffIndex), 
        stackedData.grand.sh_onsched.slice(cutoffIndex), 
        stackedData.grand.delay.slice(cutoffIndex), 
        stackedData.grand.sched.slice(cutoffIndex)
    );

    if (activeOverviewCat === 'ALL') {
        CATEGORIES.forEach(cat => {
            let catNameLow = cat.toLowerCase();
            renderBigChart(
                cat, 
                `Tren Loading Kategori: ${cat}`, 
                catStats[cat], 
                globalUniquePeriodeWPP.slice(cutoffIndex).map(k => catSums[cat][k]), 
                stackedData[catNameLow].sh_delay.slice(cutoffIndex), 
                stackedData[catNameLow].sh_onsched.slice(cutoffIndex), 
                stackedData[catNameLow].delay.slice(cutoffIndex), 
                stackedData[catNameLow].sched.slice(cutoffIndex)
            );
        });
    }
}

// ==========================================
// 6. RESUME MATRIX (REPORT WIP) & EXPORT STUDIO CETAK TINGKAT TINGGI
// ==========================================

window.downloadResumeImage = function() {
    const theTable = document.getElementById('the-matrix-table');
    if(!theTable) return;
    
    const exp = window.getThemeConfig().export;
    setLoaderState('Mengekspor Matriks...', 'Menyusun Resolusi Tinggi & Font', 50, 'Mohon Tunggu');
    document.getElementById('loading-overlay').classList.remove('hidden');

    const printBox = document.createElement('div');
    printBox.style.position = 'absolute'; 
    printBox.style.top = '-9999px'; 
    printBox.style.left = '-9999px'; 
    printBox.style.background = exp.bg; 
    printBox.style.padding = '44px';
    printBox.style.border = `4px solid ${exp.border}`;
    printBox.style.width = 'max-content';
    printBox.style.fontFamily = "'Plus Jakarta Sans', 'Inter', sans-serif";
    
    const dateStr = new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    
    const titleHtml = `
        <div style="text-align: center; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 3px solid ${exp.border};">
            <h1 style="font-family: 'Plus Jakarta Sans', 'Inter', sans-serif; font-size: 56px; font-weight: 900; color: ${exp.title}; margin: 0; padding: 0; letter-spacing: 1.5px;">RESUME MATRIKS LOADING WIP</h1>
            <p style="font-size: 26px; color: ${exp.subtitle}; font-weight: 600; margin: 12px 0 0 0; text-transform: uppercase; letter-spacing: 3px;">Update: ${dateStr}</p>
        </div>
    `;
    
    const clonedTable = theTable.cloneNode(true);
    clonedTable.querySelectorAll('.sticky, .top-0, .z-10').forEach(el => el.classList.remove('sticky', 'top-0', 'z-10'));
    clonedTable.querySelectorAll('th').forEach(th => { th.style.backgroundColor = exp.thBg; th.style.color = exp.thText; });
    
    const style = document.createElement('style');
    style.innerHTML = `
        * { font-family: 'Plus Jakarta Sans', 'Inter', sans-serif !important; }
        .excel-table { width: 100%; border-collapse: collapse; border: 2px solid ${exp.border}; background: ${exp.tableBg}; }
        .excel-table th, .excel-table td { padding: 20px 28px !important; font-size: 24px !important; line-height: 1.6 !important; border: 1px solid ${exp.cellBorder}; }
        .excel-table th { font-size: 26px !important; background-color: ${exp.thBg} !important; font-weight: 800 !important; color: ${exp.thText} !important; text-transform: uppercase; }
        .text-[9px] { font-size: 20px !important; }
        .text-[10px] { font-size: 22px !important; }
        .text-[11px] { font-size: 24px !important; }
        .text-xs { font-size: 24px !important; }
        .text-sm { font-size: 28px !important; }
        .text-xl { font-size: 42px !important; font-weight: 900 !important; }
        .font-extrabold, .font-black, .font-bold { font-weight: 800 !important; }
        .text-right { text-align: right !important; }
        .text-center { text-align: center !important; }
        .text-left { text-align: left !important; }
        .align-middle { vertical-align: middle !important; }
    `;
    
    printBox.innerHTML = titleHtml;
    printBox.appendChild(clonedTable);
    printBox.appendChild(style);
    document.body.appendChild(printBox);

    setTimeout(() => {
        html2canvas(printBox, { scale: 2, backgroundColor: exp.bg, logging: false }).then(canvas => {
            document.body.removeChild(printBox);
            document.getElementById('loading-overlay').classList.add('hidden');
            const link = document.createElement('a'); link.download = `Matrix_WIP_Report_${new Date().toISOString().split('T')[0]}.png`; link.href = canvas.toDataURL('image/png'); link.click();
        }).catch(err => { 
            document.body.removeChild(printBox); 
            document.getElementById('loading-overlay').classList.add('hidden');
            showToast('Gagal Export', 'error'); 
        });
    }, 500);
};

    // ==========================================
// EXPORT EXCEL UNTUK OVERDUE & CLOSED HARI INI
// ==========================================
window.helperExportOverviewList = function(dataArray, filenamePrefix) {
    if(!dataArray || dataArray.length === 0) {
        showToast("Tidak ada data untuk diexport pada filter ini.", "warning"); return;
    }
    setLoaderState('Menyiapkan Export...', 'Menyusun baris data ke Excel', 50, '');
    document.getElementById('loading-overlay').classList.remove('hidden');

    setTimeout(() => {
        try {
            let wipMap = new Map(); globalWipData.forEach(w => wipMap.set(w._uid, w));
            
            let exportData = dataArray.map(m => {
                let obj = {};
                obj['STATUS'] = m._status || 'CND 1';
                if (m._closedDate) obj['CLOSED DATE'] = m._closedDate;
                obj['PERIODE'] = m.PERIODE || '-';
                obj['ASSY NO'] = m.ASSY || '-';
                obj['WP'] = m.WP || '-';
                obj['STWC'] = m.STWC || '-';
                
                let qtyDisplay = parseFloat(m['QTY'] || 0);
                let qtyCctDisplay = parseFloat(m['CCT'] || m['QTY CCT'] || 0);
                let w = wipMap.get(m._uid);
                let cctDisplay = w && w['PP CCT'] ? parseFloat(w['PP CCT']) : parseFloat(m['TOTAL CCT'] || 0);
                
                obj['QTY'] = qtyDisplay;
                obj['QTY CCT'] = qtyCctDisplay;
                obj['TOTAL CCT'] = cctDisplay;

                let impacts = globalShMaterials.filter(sh => sh.targetUids && sh.targetUids.includes(m._uid));
                let pyList = globalAssyPaylater.filter(py => py.uid === m._uid);
                let probs = [];
                if (impacts.length > 0) probs.push('SH');
                if (pyList.length > 0) probs.push('Py');
                obj['PROBLEM'] = probs.length > 0 ? probs.join(' & ') : '-';

                let activeShNames = [];
                let riwayatShNames = [];
                impacts.forEach(sh => {
                    if (sh.tanggalKedatangan === null) activeShNames.push(sh.partName);
                    else riwayatShNames.push(sh.partName);
                });
                
                obj["ACTIVE SH"] = activeShNames.join(', ') || '-';
                obj["RIWAYAT SH"] = riwayatShNames.join(', ') || '-';

                let pyRemarksArr = pyList.map(py => {
                    return py.remarksLog && py.remarksLog.length > 0 ? py.remarksLog.map(l => `[${l.sender}]: ${l.message}`).join(' | ') : (py.remarks || '-');
                });
                obj["REMARKS PAYLATER"] = pyRemarksArr.length > 0 ? pyRemarksArr.join(' || ') : '-';
                
                obj['CUSTOMER'] = m.CUSTOMER || '-';

                return obj;
            });

            let ws = XLSX.utils.json_to_sheet(exportData);
            let wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Data");
            XLSX.writeFile(wb, `${filenamePrefix}_${getTodayDateStr()}.xlsx`);
            
            document.getElementById('loading-overlay').classList.add('hidden');
            showToast("Berhasil di-export!", "success");
        } catch(e) {
            console.error(e);
            document.getElementById('loading-overlay').classList.add('hidden');
            showToast("Gagal mengekspor file Excel.", "error");
        }
    }, 300);
};

window.exportOverdueToExcel = function() {
    window.helperExportOverviewList(window.currentOverdueExportData, 'Warning_Overdue_List');
};

window.exportClosedTodayToExcel = function() {
    window.helperExportOverviewList(window.currentClosedExportData, 'Closed_Hari_Ini_List');
};

function renderReportWIP() {
    let matrixData = {}; 
    let totalFooters = { TOTAL: {ADD:0,CAT:0,REG:0,SMC:0,SMV:0,GRAND:0}, DELAY: {ADD:0,CAT:0,REG:0,SMC:0,SMV:0,GRAND:0}, ONSCHEDULE: {ADD:0,CAT:0,REG:0,SMC:0,SMV:0,GRAND:0} };
    let cutoffIndex = globalUniquePeriodeWPP.indexOf(globalCutoffPWKey); if(cutoffIndex === -1) cutoffIndex = 0;
    let delayIndex = globalUniquePeriodeWPP.indexOf(globalDelayPWKey); if(delayIndex === -1) delayIndex = 0;

    globalWipData.forEach(row => {
        const periode = row['PERIODE'] || '-'; const wpRaw = String(row['WP'] || '-').trim(); const ppCct = parseFloat(row['PP CCT']) || 0; 
        const wppStr = getWPP(wpRaw); const wpCat = getCategoryName(wpRaw); const pwKey = periode + '_' + wppStr;
        const itemIndex = globalUniquePeriodeWPP.indexOf(pwKey);

        if (itemIndex !== -1 && itemIndex < cutoffIndex) return; 

        let isSHActive = globalShMaterials.some(sh => sh.tanggalKedatangan === null && sh.targetUids && sh.targetUids.includes(row._uid));
        let isSHArrived = globalShMaterials.some(sh => sh.tanggalKedatangan !== null && sh.targetUids && sh.targetUids.includes(row._uid));
        
        let problemStrRaw = Object.keys(row).find(k => k.includes('KETERANGAN') || k.includes('PROBLEM') || k.includes('POTENSI'));
        let isPotensiSH = problemStrRaw ? String(row[problemStrRaw]).toUpperCase().includes('SH') : false;
        
        let statusType = 'OK';
        if (isSHActive || isPotensiSH) {
            statusType = 'SH';
        } else if (isSHArrived) {
            statusType = 'RIWAYAT';
        }

        if (!matrixData[periode]) matrixData[periode] = {};
        if (!matrixData[periode][wppStr]) matrixData[periode][wppStr] = { 
            OK: {ADD:0,CAT:0,REG:0,SMC:0,SMV:0,RowTotal:0}, 
            SH: {ADD:0,CAT:0,REG:0,SMC:0,SMV:0,RowTotal:0},
            RIWAYAT: {ADD:0,CAT:0,REG:0,SMC:0,SMV:0,RowTotal:0}
        };
        
        if (CATEGORIES.includes(wpCat)) {
            matrixData[periode][wppStr][statusType][wpCat] += ppCct; matrixData[periode][wppStr][statusType].RowTotal += ppCct;
            totalFooters.TOTAL[wpCat] += ppCct; totalFooters.TOTAL.GRAND += ppCct;
            
            if (itemIndex < delayIndex) { 
                totalFooters.DELAY[wpCat] += ppCct; totalFooters.DELAY.GRAND += ppCct; 
            } else { 
                totalFooters.ONSCHEDULE[wpCat] += ppCct; totalFooters.ONSCHEDULE.GRAND += ppCct; 
            }
        }
    });

    let delayCount = 0; let onSchedCount = 0;
    let sortedPeriods = Object.keys(matrixData).sort();
    sortedPeriods.forEach(periode => {
        let sortedWPPs = Object.keys(matrixData[periode]).sort((a,b) => parseInt(a) - parseInt(b));
        sortedWPPs.forEach(wpp => {
            let pwKey = periode + '_' + wpp; let itemIndex = globalUniquePeriodeWPP.indexOf(pwKey);
            if (itemIndex < delayIndex) delayCount++; else onSchedCount++;
        });
    });

    let currentIndex = 0;
    let pctFinalVal = totalFooters.TOTAL.GRAND > 0 ? Math.round(((totalFooters.TOTAL.GRAND - totalFooters.DELAY.GRAND) / totalFooters.TOTAL.GRAND) * 100) : 0;
    let matrixHtml = '';
    
    sortedPeriods.forEach(periode => {
        let sortedWPPs = Object.keys(matrixData[periode]).sort((a,b) => parseInt(a) - parseInt(b));
        sortedWPPs.forEach(wpp => {
            let dataOK = matrixData[periode][wpp].OK; let dataSH = matrixData[periode][wpp].SH;
            const ui = window.getThemeConfig().ui;
            let remarkHtml = ''; let pctHtml = '';
            let dataRIWAYAT = matrixData[periode][wpp].RIWAYAT;
            if (currentIndex === 0) {
                let totalRowspan = (delayCount + onSchedCount) * 3; 
                pctHtml = `<td rowspan="${totalRowspan}" class="text-center font-black font-mono ${ui.matrixPctCell} align-middle text-xl border-l shadow-sm">${pctFinalVal}%</td>`;
            }
            if (currentIndex === 0 && delayCount > 0) remarkHtml = `<td rowspan="${delayCount * 3}" class="text-center font-black font-mono ${ui.matrixDelayRemark} align-middle text-sm shadow-sm">${totalFooters.DELAY.GRAND.toLocaleString()}</td>`;
            else if (currentIndex === delayCount && onSchedCount > 0) remarkHtml = `<td rowspan="${onSchedCount * 3}" class="text-center font-black font-mono ${ui.matrixSchedRemark} align-middle text-sm shadow-sm">${totalFooters.ONSCHEDULE.GRAND.toLocaleString()}</td>`;

            matrixHtml += `
                <tr class="row-group-start transition-colors cursor-pointer" onclick="openAdvancedDrilldown('WPP', '${periode}_${wpp}', 'GRAND')">
                    <td rowspan="3" class="text-center font-bold align-middle ${ui.matrixPeriodCell} text-sm border-b">${periode}</td>
                    <td rowspan="3" class="text-center font-black align-middle font-mono ${ui.matrixWppCell} text-sm border-b">${wpp}</td>
                    <td class="font-black ${ui.matrixOkLabel} tracking-tight text-[11px] border-l">POTENSI OKE</td>
                    <td class="text-right font-bold font-mono ${ui.matrixOkCell}">${dataOK.ADD > 0 ? dataOK.ADD.toLocaleString() : ''}</td>
                    <td class="text-right font-bold font-mono ${ui.matrixOkCell}">${dataOK.CAT > 0 ? dataOK.CAT.toLocaleString() : ''}</td>
                    <td class="text-right font-bold font-mono ${ui.matrixOkCell}">${dataOK.REG > 0 ? dataOK.REG.toLocaleString() : ''}</td>
                    <td class="text-right font-bold font-mono ${ui.matrixOkCell}">${dataOK.SMC > 0 ? dataOK.SMC.toLocaleString() : ''}</td>
                    <td class="text-right font-bold font-mono ${ui.matrixOkCell}">${dataOK.SMV > 0 ? dataOK.SMV.toLocaleString() : ''}</td>
                    <td class="text-right font-black font-mono ${ui.matrixOkTotal}">${dataOK.RowTotal > 0 ? dataOK.RowTotal.toLocaleString() : ''}</td>
                    ${remarkHtml} ${pctHtml}
                </tr>
                <tr class="transition-colors cursor-pointer" onclick="openAdvancedDrilldown('MID_KPI', 'SH')">
                    <td class="font-black ${ui.matrixShLabel} tracking-tight text-[11px] border-l">POTENSI SH</td>
                    <td class="text-right font-bold font-mono ${ui.matrixShCell}">${dataSH.ADD > 0 ? dataSH.ADD.toLocaleString() : ''}</td>
                    <td class="text-right font-bold font-mono ${ui.matrixShCell}">${dataSH.CAT > 0 ? dataSH.CAT.toLocaleString() : ''}</td>
                    <td class="text-right font-bold font-mono ${ui.matrixShCell}">${dataSH.REG > 0 ? dataSH.REG.toLocaleString() : ''}</td>
                    <td class="text-right font-bold font-mono ${ui.matrixShCell}">${dataSH.SMC > 0 ? dataSH.SMC.toLocaleString() : ''}</td>
                    <td class="text-right font-bold font-mono ${ui.matrixShCell}">${dataSH.SMV > 0 ? dataSH.SMV.toLocaleString() : ''}</td>
                    <td class="text-right font-black font-mono ${ui.matrixShTotal}">${dataSH.RowTotal > 0 ? dataSH.RowTotal.toLocaleString() : ''}</td>
                </tr>
                <tr class="transition-colors cursor-pointer border-b" onclick="openAdvancedDrilldown('MID_KPI', 'RIWAYAT_SH')">
                    <td class="font-black ${ui.matrixRiwLabel} tracking-tight text-[11px] border-l">RIWAYAT SH</td>
                    <td class="text-right font-bold font-mono ${ui.matrixRiwCell}">${dataRIWAYAT.ADD > 0 ? dataRIWAYAT.ADD.toLocaleString() : ''}</td>
                    <td class="text-right font-bold font-mono ${ui.matrixRiwCell}">${dataRIWAYAT.CAT > 0 ? dataRIWAYAT.CAT.toLocaleString() : ''}</td>
                    <td class="text-right font-bold font-mono ${ui.matrixRiwCell}">${dataRIWAYAT.REG > 0 ? dataRIWAYAT.REG.toLocaleString() : ''}</td>
                    <td class="text-right font-bold font-mono ${ui.matrixRiwCell}">${dataRIWAYAT.SMC > 0 ? dataRIWAYAT.SMC.toLocaleString() : ''}</td>
                    <td class="text-right font-bold font-mono ${ui.matrixRiwCell}">${dataRIWAYAT.SMV > 0 ? dataRIWAYAT.SMV.toLocaleString() : ''}</td>
                    <td class="text-right font-black font-mono ${ui.matrixRiwTotal}">${dataRIWAYAT.RowTotal > 0 ? dataRIWAYAT.RowTotal.toLocaleString() : ''}</td>
                </tr>
            `;
            currentIndex++;
        });
    });
    safeSetHTML('matrix-tbody', matrixHtml);

    const uiFooter = window.getThemeConfig().ui;
    let pctFinalAll = totalFooters.TOTAL.GRAND > 0 ? ((totalFooters.TOTAL.GRAND - totalFooters.DELAY.GRAND) / totalFooters.TOTAL.GRAND * 100).toFixed(4) : 0;
    let tfootHtml = `
        <tr class="footer-row">
            <td colspan="3" class="text-right py-1.5 font-batik-display tracking-wider">TOTAL LOADING</td>
            <td class="text-right font-mono">${totalFooters.TOTAL.ADD.toLocaleString()}</td><td class="text-right font-mono">${totalFooters.TOTAL.CAT.toLocaleString()}</td><td class="text-right font-mono">${totalFooters.TOTAL.REG.toLocaleString()}</td><td class="text-right font-mono">${totalFooters.TOTAL.SMC.toLocaleString()}</td><td class="text-right font-mono">${totalFooters.TOTAL.SMV.toLocaleString()}</td>
            <td class="text-right ewip-accent-text font-extrabold font-mono text-sm">${totalFooters.TOTAL.GRAND.toLocaleString()}</td>
            <td class="${uiFooter.matrixEmptyCell} border-none"></td><td class="${uiFooter.matrixEmptyCell} border-none"></td>
        </tr>
        <tr class="sub-footer ${uiFooter.matrixFooterSched} font-bold">
            <td colspan="3" class="text-right py-1">ON SCHEDULE</td>
            <td class="text-right font-mono">${totalFooters.ONSCHEDULE.ADD.toLocaleString()}</td><td class="text-right font-mono">${totalFooters.ONSCHEDULE.CAT.toLocaleString()}</td><td class="text-right font-mono">${totalFooters.ONSCHEDULE.REG.toLocaleString()}</td><td class="text-right font-mono">${totalFooters.ONSCHEDULE.SMC.toLocaleString()}</td><td class="text-right font-mono">${totalFooters.ONSCHEDULE.SMV.toLocaleString()}</td><td class="text-right font-mono">${totalFooters.ONSCHEDULE.GRAND.toLocaleString()}</td>
            <td class="${uiFooter.matrixEmptyCell} border-none"></td><td class="${uiFooter.matrixEmptyCell} border-none"></td>
        </tr>
        <tr class="sub-footer ${uiFooter.matrixFooterDelay} font-bold">
            <td colspan="3" class="text-right py-1">DELAY</td>
            <td class="text-right font-mono">${totalFooters.DELAY.ADD.toLocaleString()}</td><td class="text-right font-mono">${totalFooters.DELAY.CAT.toLocaleString()}</td><td class="text-right font-mono">${totalFooters.DELAY.REG.toLocaleString()}</td><td class="text-right font-mono">${totalFooters.DELAY.SMC.toLocaleString()}</td><td class="text-right font-mono">${totalFooters.DELAY.SMV.toLocaleString()}</td><td class="text-right font-mono">${totalFooters.DELAY.GRAND.toLocaleString()}</td>
            <td class="${uiFooter.matrixEmptyCell} border-none"></td><td class="${uiFooter.matrixEmptyCell} border-none"></td>
        </tr>
        <tr class="sub-footer ${uiFooter.matrixFooterPct} font-bold">
            <td colspan="8" class="text-right tracking-wider py-1.5 font-batik-display">%-TAGE BASED ON PROGRESS</td>
            <td class="text-right font-extrabold font-mono text-sm ${uiFooter.matrixFooterPctVal}">${pctFinalAll}%</td>
            <td class="${uiFooter.matrixEmptyCell} border-none"></td><td class="${uiFooter.matrixEmptyCell} border-none"></td>
        </tr>
    `;
    safeSetHTML('matrix-tfoot', tfootHtml);

    let container = document.getElementById('matrix-scroll-container');
    let oldList = document.getElementById('matrix-material-recap-box');
    if(oldList) oldList.remove();

    if(container) {
        let shItemsHtml = globalShMaterials.map(m => {
            let detailBtn = `<button onclick="window.openShDetailModal(${m.id})" class="ewip-btn-secondary px-3 py-1.5 rounded shadow-sm text-[9px] font-bold transition flex items-center justify-center gap-1.5 whitespace-nowrap mx-auto"><i data-lucide="list" class="w-3.5 h-3.5"></i> Lihat Detail Assy (${m.targetUids ? m.targetUids.length : 0})</button>`;
            
            return `
            <tr class="text-[11px] border-b ${uiFooter.recapRow}">
                <td class="p-2.5 font-black font-mono ${uiFooter.recapText} align-middle">${m.partName}</td>
                <td class="p-2.5 text-center ${uiFooter.recapMuted} font-bold align-middle">${m.type}</td>
                <td class="p-2.5 text-center font-bold font-mono ${uiFooter.recapMuted} align-middle">${m.tanggalSH}</td>
                <td class="p-2.5 text-center align-middle">${m.tanggalKedatangan ? `<span class="${uiFooter.shArrivedBadge} font-black px-2 py-0.5 rounded border">Arrived (${m.tanggalKedatangan})</span>` : `<span class="${uiFooter.shOpenBadge} font-black animate-pulse px-2 py-0.5 rounded border">OPEN / DELAY</span>`}</td>
                <td class="p-2.5 text-center align-middle">${detailBtn}</td>
                <td class="p-2.5 text-right ewip-accent-text font-black font-mono align-middle">${m.targetUids ? m.targetUids.length : 0} Assy<br><span class="text-[9px] ${uiFooter.recapMuted}">CCT: ${(m.totalCct || 0).toLocaleString()}</span></td>
                <td class="p-2.5 text-right text-pink-600 font-black font-mono align-middle">${(m.totalNeedMaterial || 0).toLocaleString()}</td>
            </tr>
        `}).join('');

        if(globalShMaterials.length === 0) {
            shItemsHtml = `<tr><td colspan="7" class="text-center p-4 ${uiFooter.recapMuted} font-medium">Tidak ada riwayat shortage material saat ini.</td></tr>`;
        }

        let recapBox = document.createElement('div');
        recapBox.id = 'matrix-material-recap-box';
        recapBox.className = 'mt-6 bento-box p-5 w-full';
        recapBox.innerHTML = `
            <div class="flex justify-between items-center mb-4" data-html2canvas-ignore>
                <h4 class="font-batik-display text-sm font-black ewip-accent-text uppercase flex items-center gap-2 tracking-wide"><i data-lucide="box" class="w-5 h-5 ewip-accent-icon"></i> Rekap Pelacakan Material Shortage (SH)</h4>
                <div class="flex gap-2">
                    <button onclick="window.exportMaterialRecapToImage()" class="ewip-btn-primary font-extrabold py-1.5 px-3 rounded shadow transition flex items-center gap-1.5 text-[10px]"><i data-lucide="image" class="w-3.5 h-3.5"></i> Export Gambar</button>
                    <button onclick="window.exportMaterialRecapToXLSX()" class="ewip-btn-secondary font-bold py-1.5 px-3 rounded shadow transition flex items-center gap-1.5 text-[10px]"><i data-lucide="download" class="w-3.5 h-3.5"></i> Export Excel</button>
                </div>
            </div>
            <div id="export-recap-container" class="${uiFooter.recapWrap} p-2 rounded-lg border">
                <div class="hidden export-only-title text-center mb-6 border-b-2 pb-4" style="border-color:var(--accent-main);">
                    <h1 class="font-batik-display text-3xl font-black ewip-accent-text tracking-wide m-0">REKAP MATERIAL SHORTAGE (SH)</h1>
                    <p class="${uiFooter.recapMuted} font-bold mt-1 text-sm">Status Update: ${getTodayDateStr()}</p>
                </div>
                <table class="w-full text-left border-collapse border" id="table-material-recap-export">
                    <thead>
                        <tr class="${uiFooter.recapTh} text-[10px] font-black uppercase border-b">
                            <th class="p-3 border">Item ID / Nama Part</th>
                            <th class="p-3 border text-center">Kategori</th>
                            <th class="p-3 border text-center">Tgl Input SH</th>
                            <th class="p-3 border text-center">Status Supply</th>
                            <th class="p-3 border">Detail Area Terdampak</th>
                            <th class="p-3 border text-right">Dampak Beban (CCT)</th>
                            <th class="p-3 border text-right text-pink-600">Need Material</th>
                        </tr>
                    </thead>
                    <tbody>${shItemsHtml}</tbody>
                </table>
            </div>
        `;
        container.appendChild(recapBox);
        lucide.createIcons();
    }
}

// HELPER: Buat Data Flat/Memanjang kebawah (Satu Part + Satu Assy)
function generateFlatAssySheet(sourceArray) {
    let flatList = [];
    sourceArray.forEach(sh => {
        if(sh.targetUids && sh.targetUids.length > 0) {
            sh.targetUids.forEach(uid => {
                let m = globalMasterData.find(x => x._uid === uid);
                if(m) {
                    let cleanA = superCleanAssy(m.ASSY);
                    let usage = (sh.assyUsageMap && sh.assyUsageMap[cleanA]) ? sh.assyUsageMap[cleanA] : 1;
                    let qty = parseFloat(m.QTY || 0);
                    let needMat = qty * usage;
                    let jmlCct = parseFloat(m['CCT'] || m['QTY CCT'] || 0);
                    let qtyCct = qty * jmlCct; 
                    
                    flatList.push({
                        "MATERIAL / PART NAME": sh.partName || sh.itemId || '-',
                        "KATEGORI SH": sh.type || '-',
                        "STATUS SH": sh.tanggalKedatangan ? 'ARRIVED' : 'OPEN',
                        "TGL INPUT SH": sh.tanggalSH || '-',
                        "TGL KEDATANGAN": sh.tanggalKedatangan || '-',
                        "KONFIRMASI MCL": sh.konfirmasiMcl || '-',
                        "LOG INTERAKSI / REMARKS": sh.remarksLog ? sh.remarksLog.map(l => `[${l.sender}]: ${l.message}`).join(' | ') : (sh.remarks || '-'),
                        "PIC INPUT": sh.inputter || 'Sistem',
                        "PIC CLOSED": sh.picClosed || '-',
                        "PERIODE": m.PERIODE || '-',
                        "ASSY NO": m.ASSY || '-',
                        "WP": m.WP || '-',
                        "STWC": m.STWC || '-',
                        "STATUS MASTER": m._status || 'CND 1',
                        "USAGE QTY / PCS": usage,
                        "QTY DB": qty,
                        "NEED MATERIAL": needMat,
                        "JML CCT / PCS": jmlCct,
                        "QTY CCT TOTAL": qtyCct
                    });
                }
            });
        }
    });
    // Urutkan: OPEN paling atas -> Sesuai Nama Part -> STWC Paling Tua
    flatList.sort((a,b) => {
        if(a["STATUS SH"] !== b["STATUS SH"]) return b["STATUS SH"].localeCompare(a["STATUS SH"]);
        if(a["MATERIAL / PART NAME"] !== b["MATERIAL / PART NAME"]) return a["MATERIAL / PART NAME"].localeCompare(b["MATERIAL / PART NAME"]);
        return parseIndoDate(a.STWC) - parseIndoDate(b.STWC);
    });
    
    if(flatList.length === 0) flatList.push({ "INFO": "Tidak ada Assy terdampak yang aktif di Master Database." });
    return XLSX.utils.json_to_sheet(flatList);
}

window.exportMaterialRecapToXLSX = function() {
    if(globalShMaterials.length === 0) { showToast("Tidak ada data SH untuk diexport", "warning"); return; }
    setLoaderState('Menyiapkan Export...', 'Menyusun Data Material Shortage', 50, '');
    document.getElementById('loading-overlay').classList.remove('hidden');

    setTimeout(() => {
        try {
            let wb = XLSX.utils.book_new();
            
            let table = document.getElementById('table-material-recap-export');
            if(table) {
                let wsOverview = XLSX.utils.table_to_book(table);
                XLSX.utils.book_append_sheet(wb, wsOverview, "REKAP_SH_UTAMA");
            }
            
            let wsDetail = generateFlatAssySheet(globalShMaterials);
            XLSX.utils.book_append_sheet(wb, wsDetail, "DETAIL_ASSY_TERDAMPAK");

            XLSX.writeFile(wb, `Rekap_Material_Shortage_${getTodayDateStr()}.xlsx`);
            document.getElementById('loading-overlay').classList.add('hidden');
            showToast("Rekap SH & Detail Assy berhasil di-export!", "success");
        } catch(e) {
            document.getElementById('loading-overlay').classList.add('hidden');
            showToast("Gagal mengekspor file Excel.", "error");
        }
    }, 500);
};

window.exportTabShToExcel = function() {
    let filterType = document.getElementById('filter-sh-type') ? document.getElementById('filter-sh-type').value : 'ALL';
    let filterName = document.getElementById('filter-sh-name') ? document.getElementById('filter-sh-name').value.toLowerCase() : '';
    let filterDate = document.getElementById('filter-sh-date') ? document.getElementById('filter-sh-date').value : '';
    let filterStatus = document.getElementById('filter-sh-status') ? document.getElementById('filter-sh-status').value : 'ALL';
    let filterMcl = document.getElementById('filter-sh-mcl') ? document.getElementById('filter-sh-mcl').value : 'ALL';
    
    let filteredSh = globalShMaterials;
    
    if(filterType !== 'ALL') filteredSh = filteredSh.filter(sh => sh.type === filterType);
    if(filterName) filteredSh = filteredSh.filter(sh => (sh.partName || '').toLowerCase().includes(filterName) || (sh.itemId || '').toLowerCase().includes(filterName));
    if(filterDate) {
        let dParts = filterDate.split('-');
        if(dParts.length === 3) filteredSh = filteredSh.filter(sh => sh.tanggalSH === `${dParts[2]}-${dParts[1]}-${dParts[0]}`);
    }
    if(filterStatus !== 'ALL') {
        filteredSh = filteredSh.filter(sh => {
            if (filterStatus === 'ARRIVED') return sh.tanggalKedatangan !== null;
            if (filterStatus === 'OPEN') return sh.tanggalKedatangan === null;
            return true;
        });
    }
    if(filterMcl !== 'ALL') {
        filteredSh = filteredSh.filter(sh => {
            if (filterMcl === 'KOSONG') return !sh.konfirmasiMcl || sh.konfirmasiMcl.trim() === '';
            return sh.konfirmasiMcl === filterMcl;
        });
    }

    if(filteredSh.length === 0) { showToast("Tidak ada data SH pada filter saat ini.", "warning"); return; }

    setLoaderState('Menyiapkan Export...', 'Mengekspor List SH', 50, '');
    document.getElementById('loading-overlay').classList.remove('hidden');

    setTimeout(() => {
        try {
            let wb = XLSX.utils.book_new();
            
            let overviewData = filteredSh.map(sh => ({
                "PART NAME": sh.partName || '-',
                "ITEM ID": sh.itemId || '-',
                "KATEGORI": sh.type || '-',
                "TGL INPUT": sh.tanggalSH || '-',
                "ESTIMASI KEDATANGAN": sh.estimasiKedatangan ? sh.estimasiKedatangan.split('-').reverse().join('-') : 'Belum Konfirmasi',
                "KONFIRMASI MCL": sh.konfirmasiMcl || '-',
                "STATUS": sh.tanggalKedatangan ? `ARRIVED (${sh.tanggalKedatangan})` : 'OPEN',
                "ASSY TERDAMPAK (DB)": sh.targetUids ? sh.targetUids.length : 0,
                "NEED MATERIAL (TOTAL)": sh.totalNeedMaterial || 0,
                "CCT TERTAHAN": sh.totalCct || 0,
                "LOG INTERAKSI / REMARKS": sh.remarksLog ? sh.remarksLog.map(l => `[${l.sender}]: ${l.message}`).join(' | ') : (sh.remarks || '-'),
                "PIC INPUT": sh.inputter || 'Sistem',
                "PIC CLOSED": sh.picClosed || '-'
            }));
            let wsOverview = XLSX.utils.json_to_sheet(overviewData);
            XLSX.utils.book_append_sheet(wb, wsOverview, "LIST_MATERIAL_SH");

            let wsDetail = generateFlatAssySheet(filteredSh);
            XLSX.utils.book_append_sheet(wb, wsDetail, "DETAIL_ASSY_TERDAMPAK");

            XLSX.writeFile(wb, `Daftar_SH_Filtered_${getTodayDateStr()}.xlsx`);
            document.getElementById('loading-overlay').classList.add('hidden');
            showToast("Data List SH berhasil di-export!", "success");
        } catch(e) {
            document.getElementById('loading-overlay').classList.add('hidden');
            showToast("Gagal mengekspor file Excel.", "error");
        }
    }, 500);
};

window.exportMaterialRecapToImage = function() {
    const container = document.getElementById('export-recap-container');
    if(!container) return;
    
    setLoaderState('Mengekspor Gambar...', 'Menyusun Resolusi', 50, 'Mohon Tunggu');
    document.getElementById('loading-overlay').classList.remove('hidden');

    const title = container.querySelector('.export-only-title');
    if(title) title.classList.remove('hidden');

    const exp = window.getThemeConfig().export;
    setTimeout(() => {
        html2canvas(container, { scale: 2, backgroundColor: exp.bg, logging: false }).then(canvas => {
            if(title) title.classList.add('hidden');
            document.getElementById('loading-overlay').classList.add('hidden');
            const link = document.createElement('a'); link.download = `Rekap_Material_SH_${getTodayDateStr()}.png`; link.href = canvas.toDataURL('image/png'); link.click();
        }).catch(err => { 
            if(title) title.classList.add('hidden');
            document.getElementById('loading-overlay').classList.add('hidden');
            showToast('Gagal Export Gambar', 'error'); 
        });
    }, 500);
}

// ==========================================
// 7. DATABASE BERSIH (MASTER DATA TAMPILAN)
// ==========================================
// DITAMBAHKAN PROBLEM SEBAGAI KOLOM
const targetColumnsDB = ['STATUS', 'CUSTOMER', 'ASSY', 'CCT', 'QTY', 'TOTAL CCT', 'WP', 'PERIODE', 'LINE', 'COLOR WOS', 'PROBLEM', 'STWC'];
const dropdownColumns = ['STATUS', 'CUSTOMER', 'PERIODE', 'WP', 'LINE', 'COLOR WOS', 'PROBLEM'];

document.addEventListener('click', function(e) {
    if (!e.target.closest('.filter-dropdown-container')) {
        document.querySelectorAll('.filter-dropdown-menu').forEach(el => el.classList.add('hidden'));
    }
});

function toggleFilterDropdown(colIdx) {
    const drop = document.getElementById('filter-drop-' + colIdx);
    const isHidden = drop.classList.contains('hidden');
    document.querySelectorAll('.filter-dropdown-menu').forEach(el => el.classList.add('hidden'));
    if(isHidden) drop.classList.remove('hidden');
}

function searchFilter(input, colIdx) {
    let filter = input.value.toLowerCase();
    let labels = document.getElementById('filter-list-' + colIdx).querySelectorAll('label');
    labels.forEach(label => {
        let text = label.innerText.toLowerCase();
        label.style.display = text.includes(filter) ? '' : 'none';
    });
}

function toggleAllCheckboxes(masterCb, colIdx) {
    let isChecked = masterCb.checked;
    document.querySelectorAll(`.filter-checkbox[data-col-idx="${colIdx}"]`).forEach(cb => {
        if(cb.parentElement.style.display !== 'none') cb.checked = isChecked;
    });
    updateCheckboxFilters(colIdx);
}

function updateCheckboxFilters(colIdx) {
    let colName = '';
    let checkedValues = [];
    let allChecked = true;
    document.querySelectorAll(`.filter-checkbox[data-col-idx="${colIdx}"]`).forEach(cb => {
        colName = cb.getAttribute('data-col');
        if(cb.checked) checkedValues.push(cb.value.toLowerCase());
        else allChecked = false;
    });
    let masterCb = document.querySelector(`.select-all-cb[data-col-idx="${colIdx}"]`);
    if(masterCb) masterCb.checked = allChecked;

    if(colName) {
        if(allChecked) delete controlFilters[colName]; 
        else controlFilters[colName] = checkedValues;
        renderControlOutstanding();
    }
}

function getUniqueValues(colName) {
    let values = new Set();
    if (colName === 'STATUS') {
        globalMasterData.forEach(row => { if (row._status) values.add(row._status); });
    } else if (colName === 'PROBLEM') {
        globalMasterData.forEach(row => {
            let impacts = globalShMaterials.filter(sh => sh.targetUids && sh.targetUids.includes(row._uid));
            let pyList = globalAssyPaylater.filter(py => py.uid === row._uid);
            let probs = [];
            if (impacts.length > 0) probs.push('SH');
            if (pyList.length > 0) probs.push('Py');
            values.add(probs.length > 0 ? probs.join(' & ') : '-');
        });
    } else {
        globalMasterData.forEach(row => {
            if (row[colName] !== undefined && row[colName] !== null) values.add(String(row[colName]).trim());
        });
    }
    return Array.from(values).sort();
}

function renderControlPeriodeTabs() {
    let periodes = new Set();
    globalMasterData.forEach(m => {
        let p = String(m['PERIODE'] || '').trim();
        if(p && p !== '-') periodes.add(p);
    });
    let sortedPeriodes = Array.from(periodes).sort();
    
    let html = `<button onclick="setActivePeriodeTab('ALL')" class="px-3 py-1 rounded-full text-[10px] font-bold whitespace-nowrap transition-colors border shadow-sm ${activePeriodeTab === 'ALL' ? 'bg-brand-500 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}">SEMUA PERIODE</button>`;
    
    sortedPeriodes.forEach(p => {
        html += `<button onclick="setActivePeriodeTab('${p}')" class="px-3 py-1 rounded-full text-[10px] font-bold whitespace-nowrap transition-colors border shadow-sm ${activePeriodeTab === p ? 'bg-brand-500 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}">${p}</button>`;
    });
    safeSetHTML('control-periode-tabs', html);
}

function setActivePeriodeTab(p) {
    activePeriodeTab = p;
    renderControlPeriodeTabs();
    renderControlOutstanding();
}

window.setupControlHeaders = function() {
    renderControlPeriodeTabs();
    let displayHeaders = targetColumnsDB.filter(col => {
        return masterHeaders.includes(col) || col === 'STATUS' || col === 'PROBLEM';
    });
    if (displayHeaders.length < 3) displayHeaders = targetColumnsDB; 

    let headerHtml = `<tr>`;
    displayHeaders.forEach((col, colIdx) => {
        headerHtml += `<th class="sticky top-0 z-30 px-2 py-1.5 border-r border-b border-gray-200 bg-gray-50 font-bold text-[9px] tracking-wider uppercase text-left align-top shadow-sm">
                        <div class="flex flex-col gap-1 h-full filter-dropdown-container relative">
                            <span>${col}</span>`;
        
        if (dropdownColumns.includes(col)) {
            let uniqueVals = getUniqueValues(col);
            let optionsHtml = ``;
            uniqueVals.forEach(val => {
                let safeVal = String(val).replace(/"/g, '&quot;');
                optionsHtml += `<label class="flex items-center gap-1.5 px-1.5 py-1 hover:bg-gray-100 cursor-pointer text-gray-700 whitespace-normal break-all">
                                    <input type="checkbox" class="form-checkbox h-2.5 w-2.5 text-brand-600 rounded-sm border-gray-300 filter-checkbox" data-col="${col}" data-col-idx="${colIdx}" value="${safeVal}" checked>
                                    <span class="text-[9px] font-medium truncate flex-1">${val || '(Kosong)'}</span>
                                    <span onclick="event.preventDefault(); filterThisItemOnly('${colIdx}', '${safeVal}', '${col}')" class="text-[8px] text-blue-500 hover:text-blue-700 underline z-10 cursor-pointer shrink-0 ml-1">Filter ini saja</span>
                                </label>`;
            });
            
            headerHtml += `
                <div class="relative w-full mt-auto">
                    <button onclick="toggleFilterDropdown('${colIdx}')" class="w-full text-left text-gray-800 px-1.5 py-0.5 rounded border border-gray-300 focus:outline-none focus:border-brand-500 font-normal text-[9px] bg-white flex justify-between items-center shadow-sm">
                        <span class="truncate text-gray-400">Filter...</span> <i data-lucide="chevron-down" class="w-2.5 h-2.5 shrink-0"></i>
                    </button>
                    <div id="filter-drop-${colIdx}" class="hidden absolute top-full left-0 mt-1 bg-white border border-gray-200 shadow-xl z-50 w-40 max-h-48 overflow-y-auto rounded-md py-1 filter-dropdown-menu font-normal">
                        <div class="px-1.5 py-1 border-b border-gray-100 sticky top-0 bg-white z-10">
                            <input type="text" placeholder="Cari..." class="w-full text-[9px] p-1 border rounded outline-none focus:border-brand-500" oninput="searchFilter(this, '${colIdx}')">
                        </div>
                        <div class="px-1.5 py-1 border-b border-gray-100 flex gap-2">
                            <label class="flex items-center gap-1.5 cursor-pointer text-gray-800 font-bold flex-1">
                                <input type="checkbox" class="form-checkbox h-2.5 w-2.5 select-all-cb" data-col="${col}" data-col-idx="${colIdx}" checked onchange="toggleAllCheckboxes(this, '${colIdx}')">
                                <span class="text-[9px]">Pilih Semua</span>
                            </label>
                            <button onclick="clearColumnFilter('${col}')" class="text-[8px] text-red-500 hover:underline">Hapus Filter</button>
                        </div>
                        <div id="filter-list-${colIdx}">${optionsHtml}</div>
                    </div>
                </div>
            `;
        } else {
            headerHtml += `<input type="text" placeholder="Ketik..." class="w-full text-gray-800 px-1.5 py-0.5 rounded border border-gray-300 focus:outline-none focus:border-brand-500 font-normal text-[9px] bg-white filter-input mt-auto" data-col="${col}"/>`;
        }
        headerHtml += `</div></th>`;
    });
    headerHtml += `</tr>`;
    safeSetHTML('control-thead', headerHtml);

    controlFilters = {};
    document.querySelectorAll('.filter-checkbox').forEach(cb => cb.addEventListener('change', (e) => updateCheckboxFilters(e.target.getAttribute('data-col-idx'))));
    document.querySelectorAll('.filter-input').forEach(input => input.addEventListener('input', (e) => { controlFilters[e.target.getAttribute('data-col')] = e.target.value.toLowerCase(); renderControlOutstanding(); }));
    
    renderControlOutstanding();
}

function setupControlHeaders() { window.setupControlHeaders(); }

let controlCurrentPage = 1;
const controlItemsPerPage = 100;
let controlFilteredDataCache = [];

window.prevControlPage = function() {
    if(controlCurrentPage > 1) { controlCurrentPage--; renderControlTableBody(); }
}
window.nextControlPage = function() {
    let maxPage = Math.ceil(controlFilteredDataCache.length / controlItemsPerPage);
    if(controlCurrentPage < maxPage) { controlCurrentPage++; renderControlTableBody(); }
}

window.exportControlDataXLSX = function() {
    if(!controlFilteredDataCache || controlFilteredDataCache.length === 0) {
        showToast("Tidak ada data yang sedang difilter untuk diexport", "warning");
        return;
    }

    setLoaderState('Menyiapkan Export...', 'Menyusun baris data ke Excel', 50, '');
    document.getElementById('loading-overlay').classList.remove('hidden');

    setTimeout(() => {
        try {
            let displayHeaders = targetColumnsDB.filter(col => masterHeaders.includes(col) || col === 'STATUS' || col === 'PROBLEM');
            if (displayHeaders.length < 3) displayHeaders = targetColumnsDB;

            let exportData = controlFilteredDataCache.map(row => {
                let obj = {};
                let isRocket = globalAssyRocket.some(r => r.assy === superCleanAssy(row.ASSY) && r.wp === superCleanAssy(row.WP) && r.periode === row.PERIODE);

                displayHeaders.forEach(col => {
                    if (col === 'STATUS') {
                        obj[col] = row._status || 'CND 1';
                    } else if (col === 'PROBLEM') {
                        let impacts = globalShMaterials.filter(sh => sh.targetUids && sh.targetUids.includes(row._uid));
                        let pyList = globalAssyPaylater.filter(py => py.uid === row._uid);
                        let probs = [];
                        if (impacts.length > 0) probs.push('SH');
                        if (pyList.length > 0) probs.push('Py');
                        obj[col] = probs.length > 0 ? probs.join(' & ') : '-';
                    } else if (col === 'STWC' && isRocket) {
                        let rocketMatch = globalAssyRocket.find(r => r.assy === superCleanAssy(row.ASSY) && r.wp === superCleanAssy(row.WP) && r.periode === row.PERIODE);
                        obj[col] = rocketMatch.stwc; // Gunakan STWC Rocket
                    } else {
                        obj[col] = row[col] !== undefined ? row[col] : '-';
                    }
                });

                // Tambahan: Sisipkan Kolom ACTIVE SH & RIWAYAT SH di akhir setiap baris Export
                let activeShNames = [];
                let riwayatShNames = [];
                globalShMaterials.forEach(sh => {
                    if (sh.targetUids && sh.targetUids.includes(row._uid)) {
                        if (sh.tanggalKedatangan === null) activeShNames.push(sh.partName);
                        else riwayatShNames.push(sh.partName);
                    }
                });
                
                obj["ACTIVE SH"] = activeShNames.join(', ') || '-';
                obj["RIWAYAT SH"] = riwayatShNames.join(', ') || '-';

                // Tambahan: Kolom Remarks Paylater
                let pyList = globalAssyPaylater.filter(py => py.uid === row._uid);
                let pyRemarksArr = pyList.map(py => {
                    return py.remarksLog && py.remarksLog.length > 0 ? py.remarksLog.map(l => `[${l.sender}]: ${l.message}`).join(' | ') : (py.remarks || '-');
                });
                obj["REMARKS PAYLATER"] = pyRemarksArr.length > 0 ? pyRemarksArr.join(' || ') : '-';

                return obj;
            }); 

            let ws = XLSX.utils.json_to_sheet(exportData);
            let wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Database_Bersih");

            let activeTabName = activePeriodeTab === 'ALL' ? 'Semua_Periode' : activePeriodeTab;
            let filename = `Database_Bersih_Filtered_${activeTabName}_${getTodayDateStr()}.xlsx`;
            XLSX.writeFile(wb, filename);

            document.getElementById('loading-overlay').classList.add('hidden');
            showToast("Database Bersih berhasil di-export!", "success");
        } catch(e) {
            console.error(e);
            document.getElementById('loading-overlay').classList.add('hidden');
            showToast("Gagal mengekspor file Excel.", "error");
        }
    }, 300); // Beri waktu UI untuk render progress bar
};

window.renderControlOutstanding = function() {
    let displayHeaders = targetColumnsDB.filter(col => {
        return masterHeaders.includes(col) || col === 'STATUS' || col === 'PROBLEM';
    });
    if (displayHeaders.length < 3) displayHeaders = targetColumnsDB; 

    let filteredData = globalMasterData.filter(row => {
        if (activePeriodeTab !== 'ALL') {
            let rPer = String(row['PERIODE'] || '').trim();
            if (rPer !== activePeriodeTab) return false;
        }
        return displayHeaders.every(col => {
            let filterVal = controlFilters[col];
            if (filterVal === undefined || filterVal === '') return true; 
            
            let cellValue = '';
            if (col === 'STATUS') {
                cellValue = row._status ? String(row._status).toLowerCase().trim() : '';
            } else if (col === 'PROBLEM') {
                let impacts = globalShMaterials.filter(sh => sh.targetUids && sh.targetUids.includes(row._uid));
                let pyList = globalAssyPaylater.filter(py => py.uid === row._uid);
                let probs = [];
                if (impacts.length > 0) probs.push('sh');
                if (pyList.length > 0) probs.push('py');
                cellValue = probs.length > 0 ? probs.join(' & ') : '-';
            } else {
                cellValue = row[col] !== undefined ? String(row[col]).toLowerCase().trim() : '';
            }
            
            if (dropdownColumns.includes(col)) {
                if (Array.isArray(filterVal)) { 
                    if (filterVal.length === 0) return false; 
                    return filterVal.includes(cellValue); 
                }
                return cellValue === filterVal;
            } else { 
                return cellValue.includes(filterVal); 
            }
        });
    });

    filteredData.sort((a, b) => {
        let tA = parseIndoDate(a['STWC']);
        let tB = parseIndoDate(b['STWC']);
        if (tA === 0) tA = 9999999999999; 
        if (tB === 0) tB = 9999999999999;
        return tA - tB;
    });

    controlFilteredDataCache = filteredData;
    controlCurrentPage = 1;
    renderControlTableBody();
}
function renderControlOutstanding() { window.renderControlOutstanding(); }

window.renderControlTableBody = function() {
    let displayHeaders = targetColumnsDB.filter(col => masterHeaders.includes(col) || col === 'STATUS' || col === 'PROBLEM');
    if (displayHeaders.length < 3) displayHeaders = targetColumnsDB;

    let maxPage = Math.ceil(controlFilteredDataCache.length / controlItemsPerPage) || 1;
    if(controlCurrentPage > maxPage) controlCurrentPage = maxPage;
    
    let startIndex = (controlCurrentPage - 1) * controlItemsPerPage;
    let endIndex = startIndex + controlItemsPerPage;
    let pagedData = controlFilteredDataCache.slice(startIndex, endIndex);

    let htmlString = "";
    pagedData.forEach((row, idx) => {
        let bgClass = ''; let badge = '';
        let isRocket = globalAssyRocket.some(r => r.assy === superCleanAssy(row.ASSY) && r.wp === superCleanAssy(row.WP) && r.periode === row.PERIODE);

        if(row._status === 'CLOSED') { bgClass = 'bg-emerald-50'; badge = `<span class="bg-emerald-100 text-emerald-700 font-bold px-1.5 py-0.5 rounded">CLOSED PP</span>`; }
        else if(row._status === 'CND 3') { bgClass = isRocket ? 'bg-pink-200' : 'bg-red-50'; badge = `<span class="bg-red-100 text-red-700 font-bold px-1.5 py-0.5 rounded animate-pulse shadow-sm">CND 3</span>`; }
        else if(row._status === 'CND 2') { bgClass = isRocket ? 'bg-pink-200' : 'bg-amber-50'; badge = `<span class="bg-amber-100 text-amber-700 font-bold px-1.5 py-0.5 rounded shadow-sm">CND 2</span>`; }
        else { bgClass = isRocket ? 'bg-pink-100' : ''; badge = `<span class="bg-blue-100 text-blue-700 font-bold px-1.5 py-0.5 rounded shadow-sm">CND 1</span>`; }

        htmlString += `<tr class="hover:bg-gray-200 ${bgClass} transition-colors border-b border-gray-100 cursor-context-menu" oncontextmenu="forceCloseAssy(event, '${row._uid}')" title="Klik Kanan baris ini untuk Force Close">`;
        
        displayHeaders.forEach(col => {
            if (col === 'STATUS') {
                htmlString += `<td class="px-2 py-1 border-r border-gray-200 text-center align-middle">${badge}</td>`;
                return;
            }
            let cellData = '';
            let colClass = isDateColumn(col) ? "font-mono font-bold text-center" : "";
            
            if (col === 'PROBLEM') {
                cellData = window.getShBadgeHtml(row._uid, row.ASSY);
                colClass = "text-center align-middle";
            } else if (col === 'STWC' && isRocket) {
                let rocketMatch = globalAssyRocket.find(r => r.assy === superCleanAssy(row.ASSY) && r.wp === superCleanAssy(row.WP) && r.periode === row.PERIODE);
                cellData = `<div class="flex items-center gap-1.5 justify-center"><i data-lucide="rocket" class="w-3.5 h-3.5 text-pink-600"></i><span class="text-pink-700 font-black">${rocketMatch.stwc}</span></div>`;
            } else {
                cellData = row[col] !== undefined ? row[col] : '';
            }
            
            htmlString += `<td class="px-2 py-1 border-r border-gray-100 max-w-[200px] truncate align-middle ${colClass}">${cellData}</td>`;
        });
        htmlString += `</tr>`;
    });

    safeSetHTML('control-tbody', htmlString);
    safeSetText('control-page-info', `Page ${controlCurrentPage} of ${maxPage}`);
    safeSetText('control-counter', `Total ${controlFilteredDataCache.length} Baris`);
    
    const tableContainer = document.getElementById('control-table-container');
    if(tableContainer) tableContainer.scrollTop = 0;
}
function renderControlTableBody() { window.renderControlTableBody(); }

window.forceCloseAssy = function(e, uid) {
    e.preventDefault();
    let target = globalMasterData.find(m => m._uid === uid);
    if(!target) return;
    if(target._status === 'CLOSED') { showToast('Assy ini sudah berstatus CLOSED.', 'info'); return; }
    
    if(confirm(`Yakin ingin mengubah status Assy [ ${target.ASSY || ''} ] secara paksa menjadi CLOSED?`)) {
        target._status = 'CLOSED';
        target._closedDate = getTodayDateStr();
        syncMasterToCloud().then(() => {
            renderControlOutstanding(); 
            if(!document.getElementById('view-overview').classList.contains('hidden')) renderOverviewDashboard();
            showToast('Assy berhasil di-Closed secara paksa.', 'success');
        });
    }
};

// ==========================================
// 8. SH MATERIAL LOGIC & MASS INPUT ENGINE
// ==========================================
window.tempShValidatedData = [];
window.tempShAssyList = [];

window.openShInputModal = function() {
    // Menggunakan pengaman (if) agar tidak error jika elemen dihapus dari HTML
    if(document.getElementById('sh-type-input')) document.getElementById('sh-type-input').value = '';
    if(document.getElementById('sh-item-id-input')) document.getElementById('sh-item-id-input').value = '';
    if(document.getElementById('sh-excel-upload')) document.getElementById('sh-excel-upload').value = '';
    if(document.getElementById('sh-manual-assy')) document.getElementById('sh-manual-assy').value = '';
    if(document.getElementById('sh-estimasi-input')) document.getElementById('sh-estimasi-input').value = '';
    
    let optHtml = '';
    globalUniquePeriodeWPP.forEach(pwKey => {
        let [per, wp] = pwKey.split('_');
        optHtml += `<option value="${pwKey}">${per} - WP ${wp}</option>`;
    });
    
    let optHtmlStart = `<option value="" disabled selected>- Pilih Rentang Awal -</option>` + optHtml;
    let optHtmlEnd = `<option value="" disabled selected>- Pilih Rentang Akhir -</option>` + optHtml + `<option value="Sekarang" class="font-bold text-sky-600">Sekarang (Seterusnya)</option>`;
    
    let elStart = document.getElementById('sh-per-start');
    let elEnd = document.getElementById('sh-per-end');
    if(elStart) { elStart.innerHTML = optHtmlStart; elStart.value = ""; }
    if(elEnd) { elEnd.innerHTML = optHtmlEnd; elEnd.value = ""; }

    safeSetHTML('sh-validation-tbody', '<tr><td colspan="9" class="text-center p-8 text-gray-400 font-medium">Input file Excel "Where Used" lalu klik Validasi List Assy.</td></tr>');
    safeSetText('sh-validation-summary', 'Total Validasi: 0 Assy');
    window.tempShValidatedData = [];
    window.tempShAssyList = [];
    window.tempShAssyUsageMap = {};
    document.getElementById('sh-input-modal').classList.remove('hidden');
};

window.closeShInputModal = function() { document.getElementById('sh-input-modal').classList.add('hidden'); }

window.handleShExcelUpload = async function(event) {
    let file = event.target.files[0];
    if(!file) return;
    
    setLoaderState('Membaca File...', `Menyalin List Assy`, 50, '');
    document.getElementById('loading-overlay').classList.remove('hidden');
    
    try {
        let fileObj = await readExcelFile(file);
        let workbook = XLSX.read(fileObj.data, {type: 'array'});
        let sheetName = workbook.SheetNames[0]; 
        let jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {header: 1, defval: ""});

        let assyIndex = -1;
        let qtyIndex = -1;
        let startRow = -1;
        
        for(let r=0; r<Math.min(20, jsonData.length); r++) {
            let row = jsonData[r];
            if(!row) continue;
            for(let c=0; c<row.length; c++) {
                let cellVal = String(row[c] || '').toUpperCase().replace(/\s+/g, '');
                if(cellVal.includes('ASSYNO') || cellVal === 'ASSY' || cellVal === 'PARTNO') {
                    assyIndex = c;
                }
                if(cellVal === 'QTY' || cellVal === 'USAGE' || cellVal === 'QUANTITY') {
                    qtyIndex = c;
                }
            }
            if(assyIndex !== -1) {
                startRow = r + 1;
                break;
            }
        }
        
        if(assyIndex !== -1) {
            window.tempShAssyList = [];
            window.tempShAssyUsageMap = {};
            for(let i=startRow; i<jsonData.length; i++) {
                if(jsonData[i]) {
                    let val = jsonData[i][assyIndex];
                    if(val !== undefined && val !== null && String(val).trim() !== '') {
                        let rawAssy = String(val).trim().toUpperCase();
                        window.tempShAssyList.push(rawAssy);
                        
                        let usage = 1;
                        if(qtyIndex !== -1 && jsonData[i][qtyIndex] !== undefined) {
                            let parsed = parseFloat(jsonData[i][qtyIndex]);
                            if(!isNaN(parsed) && parsed > 0) usage = parsed;
                        }
                        window.tempShAssyUsageMap[superCleanAssy(rawAssy)] = usage;
                    }
                }
            }
            showToast(`Berhasil ekstrak ${window.tempShAssyList.length} Assy. Memicu Validasi Otomatis...`, 'success');
            setTimeout(() => {
                validateShData();
                document.getElementById('loading-overlay').classList.add('hidden');
            }, 500);
        } else {
            document.getElementById('loading-overlay').classList.add('hidden');
            showToast("Gagal! Tidak menemukan judul kolom 'ASSY NO' di dalam file.", "error");
        }
        event.target.value = ''; 
    } catch(e) { 
        document.getElementById('loading-overlay').classList.add('hidden');
        showToast("Format file tidak dapat dibaca.", "error"); 
    }
};

window.validateShData = function() {
    let combinedList = [...new Set([...window.tempShAssyList])];

    if(combinedList.length === 0) {
        showToast("Daftar Assy kosong. Harap Import file Excel.", "warning"); return;
    }

    let itemId = document.getElementById('sh-item-id-input').value.trim();
    if(itemId) {
        let isDuplicate = globalShMaterials.some(sh => sh.tanggalKedatangan === null && (sh.partName.toUpperCase() === itemId.toUpperCase() || sh.itemId.toUpperCase() === itemId.toUpperCase()));
        if (isDuplicate) {
            showToast(`PERINGATAN: Material [${itemId}] pernah di-SH kan dan masih berstatus OPEN/Aktif!`, "warning");
        }
    }

    let pStart = document.getElementById('sh-per-start').value;
    let pEnd = document.getElementById('sh-per-end').value;
    
    if(!pStart || !pEnd) {
        showToast("Pilih Rentang Periode terlebih dahulu.", "warning"); return;
    }

    let findIdx = (val) => {
        let v = String(val).trim();
        let idx = globalUniquePeriodeWPP.indexOf(v);
        if(idx === -1 && !v.includes('_')) idx = globalUniquePeriodeWPP.findIndex(k => k.startsWith(v));
        return idx;
    };

    let startIndex = findIdx(pStart);
    let validPwKeys = [];

    if (pEnd === 'Sekarang') {
        if (startIndex === -1) { showToast("Rentang Periode-WPP Tidak Valid.", "warning"); return; }
        validPwKeys = globalUniquePeriodeWPP.slice(startIndex);
    } else {
        let endIndex = findIdx(pEnd);
        if (startIndex === -1 || endIndex === -1 || startIndex > endIndex) { 
            showToast("Rentang Periode-WPP Tidak Valid.", "warning"); return; 
        }
        validPwKeys = globalUniquePeriodeWPP.slice(startIndex, endIndex + 1);
    }

    if(!window.tempShAssyUsageMap) window.tempShAssyUsageMap = {};

    let wipMap = new Map(); globalWipData.forEach(w => wipMap.set(w._uid, w));
    window.tempShValidatedData = [];

    let cleanCombinedList = combinedList.map(a => superCleanAssy(a));
    window.tempShCleanAssyList = cleanCombinedList;

    let matchingMaster = globalMasterData.filter(m => {
        if(m._status === 'CLOSED') return false;
        
        let mPwKey = (m.PERIODE || '-') + '_' + getWPP(String(m.WP || '-').trim());
        if(!validPwKeys.includes(mPwKey)) return false;
        
        let assyClean = superCleanAssy(m.ASSY);
        return cleanCombinedList.includes(assyClean);
    });

    matchingMaster.forEach(m => {
        let w = wipMap.get(m._uid);
        let qtyDisplay = parseFloat(m['QTY'] || 0);
        let totalCct = w && w['PP CCT'] ? parseFloat(w['PP CCT']) : parseFloat(m['TOTAL CCT'] || 0);
        
        let cleanA = superCleanAssy(m.ASSY);
        let usage = window.tempShAssyUsageMap[cleanA] || 1;
        let needMat = qtyDisplay * usage;

        window.tempShValidatedData.push({
            uid: m._uid, periode: m.PERIODE, assy: m.ASSY, wp: m.WP, status: m._status,
            dbQty: qtyDisplay, totalCct: totalCct,
            usage: usage, needMaterial: needMat
        });
    });

    renderShValidationTable();
    if(window.tempShValidatedData.length > 0) {
        let activeCount = window.tempShValidatedData.filter(x => x.status !== 'CLOSED').length;
        showToast(`Validasi selesai. ${activeCount} aktif dari ${cleanCombinedList.length} diminta.`, 'success');
    } else {
        showToast(`0 Assy aktif saat ini. Data (${cleanCombinedList.length} Assy) akan masuk mode Standby/Watchlist.`, 'warning');
    }
};

window.renderShValidationTable = function() {
    let html = '';
    if(window.tempShValidatedData.length === 0) {
        html = '<tr><td colspan="9" class="text-center p-8 text-red-400 font-medium">Data kosong. Pastikan Assy yang dimasukkan ada di database.</td></tr>';
    } else {
        window.tempShValidatedData.sort((a,b) => {
            let perA = String(a.periode || '');
            let perB = String(b.periode || '');
            if(perA !== perB) return perA.localeCompare(perB);
            return String(a.wp || '').localeCompare(String(b.wp || ''));
        });

        window.tempShValidatedData.forEach((d, idx) => {
            let isClosed = d.status === 'CLOSED';
            let badge = d.status === 'CND 3' ? '<span class="bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold">CND 3</span>' : 
                        d.status === 'CND 2' ? '<span class="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">CND 2</span>' :
                        isClosed ? '<span class="bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded font-bold">CLOSED</span>' :
                        '<span class="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold">CND 1</span>';
            
            let bgRow = isClosed ? 'bg-gray-100 opacity-60' : 'hover:bg-amber-50';
            let actionBtn = isClosed ? `<span class="text-[8px] text-gray-400 font-bold">Abaikan</span>` : `<button onclick="removeShTempRow('${d.uid}')" class="text-gray-400 hover:text-red-600 bg-white shadow-sm border border-gray-200 px-2 py-1 rounded transition"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>`;

            html += `
            <tr class="border-b border-gray-100 transition ${bgRow}">
                <td class="p-2 text-center">${actionBtn}</td>
                <td class="p-2 font-bold text-gray-800 text-center">${d.periode}</td>
                <td class="p-2 font-bold text-gray-800">${d.assy}</td>
                <td class="p-2 text-center text-gray-500 font-mono">${d.wp}</td>
                <td class="p-2 text-center text-xs">${badge}</td>
                <td class="p-2 text-center text-indigo-600 font-bold">${d.dbQty}</td>
                <td class="p-2 text-center text-pink-600 font-bold">${d.usage}</td>
                <td class="p-2 text-right text-pink-700 font-black">${d.needMaterial.toLocaleString()}</td>
                <td class="p-2 text-left text-red-600 font-bold">${d.totalCct.toLocaleString()}</td>
            </tr>`;
        });
    }
    safeSetHTML('sh-validation-tbody', html);
    
    let activeCount = window.tempShValidatedData.filter(x => x.status !== 'CLOSED').length;
    safeSetText('sh-validation-summary', `Total Validasi Aktif: ${activeCount} Assy Terdampak.`);
    lucide.createIcons();
}

window.removeShTempRow = function(uid) {
    window.tempShValidatedData = window.tempShValidatedData.filter(x => x.uid !== uid);
    renderShValidationTable();
}

window.saveShAsShortage = function() { window.confirmSaveSh(); };

window.confirmSaveSh = async function() {
    let activeData = window.tempShValidatedData.filter(x => x.status !== 'CLOSED');
    if(!window.tempShCleanAssyList || window.tempShCleanAssyList.length === 0) { 
        showToast("Tidak ada data Assy yang dimasukkan.", "warning"); return; 
    }
    let pType = document.getElementById('sh-type-input').value;
    if(!pType) { showToast("Kategori Part WAJIB dipilih!", "error"); return; }
    let itemId = document.getElementById('sh-item-id-input').value.trim();
    if(!itemId) { showToast("Nama Part / Item ID wajib diisi sebagai identitas.", "error"); return; }
    let pStart = document.getElementById('sh-per-start').value;
    let pEnd = document.getElementById('sh-per-end').value;
    let estDate = '';
    let remarks = '';

    let uids = activeData.map(x => x.uid);
    let grandCct = activeData.reduce((sum, curr) => sum + curr.totalCct, 0);
    let grandNeed = activeData.reduce((sum, curr) => sum + curr.needMaterial, 0);

    let newSh = {
        partName: itemId, 
        type: pType, 
        itemId: itemId, 
        startPeriod: pStart, 
        endPeriod: pEnd,
        targetUids: uids, 
        affectedAssys: window.tempShCleanAssyList || [], 
        assyUsageMap: window.tempShAssyUsageMap || {},
        totalNeedMaterial: grandNeed,
        totalCct: grandCct,
        tanggalSH: getTodayDateStr().split('-').reverse().join('-'),
        estimasiKedatangan: estDate || null,
        remarks: remarks || null,
        id: Date.now(), 
        tanggalKedatangan: null,
        inputter: activeUserPin ? AUTH_PROFILES[activeUserPin] : 'Sistem'
    };

    globalShMaterials.push(newSh);
    try {
        setLoaderState('Mengunci Shortage...', 'Menyimpan relasi UID Assy', 0, '');
        document.getElementById('loading-overlay').classList.remove('hidden');
        
        await saveDB('sh_materials', globalShMaterials, (pct) => setLoaderState('Mengunci Shortage...', 'Upload data Shortage ke Cloud', pct, 'Menyimpan...'));
        setLoaderState('Memperbarui UI...', 'Merender Tabel & Dashboard', 99, '');
        await new Promise(r => setTimeout(r, 100));

        renderShMaterials();
        
        if(!document.getElementById('view-overview').classList.contains('hidden')) renderOverviewDashboard();
        if(!document.getElementById('view-report').classList.contains('hidden')) renderReportWIP();
        if(!document.getElementById('view-control').classList.contains('hidden')) renderControlOutstanding();

        closeShInputModal();
        document.getElementById('loading-overlay').classList.add('hidden');
        showToast("Shortage Berhasil Ditetapkan ke Dashboard!", "success");
    } catch(e) { 
        console.error(e);
        document.getElementById('loading-overlay').classList.add('hidden'); 
        showToast("Gagal menyimpan data Shortage.", "error");
    }
};

window.openEditShModal = function(id) {
    let sh = globalShMaterials.find(x => x.id === id);
    if(!sh) return;
    document.getElementById('sh-edit-id').value = sh.id;
    document.getElementById('sh-edit-est').value = sh.estimasiKedatangan || '';
    if (document.getElementById('sh-edit-konfirm')) {
        document.getElementById('sh-edit-konfirm').value = sh.konfirmasiMcl || '';
    }
    document.getElementById('sh-edit-remarks').value = '';
    document.getElementById('sh-edit-modal').classList.remove('hidden');
};

window.closeEditShModal = function() { document.getElementById('sh-edit-modal').classList.add('hidden'); };

window.saveEditSh = function() {
    let id = parseInt(document.getElementById('sh-edit-id').value);
    let shIndex = globalShMaterials.findIndex(x => x.id === id);
    if(shIndex === -1) return;

    let estVal = document.getElementById('sh-edit-est').value || null;
    let konfirmEl = document.getElementById('sh-edit-konfirm');
    let konfirmVal = konfirmEl ? (konfirmEl.value || null) : null;
    let newRemark = document.getElementById('sh-edit-remarks').value.trim();

    // 1. Tutup modal langsung agar layar tetap bebas dipakai untuk apapun
    closeEditShModal();

    // 2. Perbarui data di state lokal dulu (Optimistic UI) agar langsung tampil tanpa loading
    globalShMaterials[shIndex].estimasiKedatangan = estVal;
    if (konfirmEl) {
        globalShMaterials[shIndex].konfirmasiMcl = konfirmVal;
    }
    
    if (newRemark) {
        if (!globalShMaterials[shIndex].remarksLog) globalShMaterials[shIndex].remarksLog = [];
        let now = new Date();
        let timeStr = now.toLocaleDateString('id-ID', {day:'numeric', month:'short'}) + ' ' + now.toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'});
        let senderName = activeUserPin ? AUTH_PROFILES[activeUserPin] : 'Sistem';
        globalShMaterials[shIndex].remarksLog.push({ sender: senderName, message: newRemark, time: timeStr });
    }

    const refreshShViews = () => {
        renderShMaterials();
        if(!document.getElementById('view-overview').classList.contains('hidden')) renderOverviewDashboard();
        if(!document.getElementById('view-report').classList.contains('hidden')) renderReportWIP();
        if(!document.getElementById('view-control').classList.contains('hidden')) renderControlOutstanding();
        if(!document.getElementById('sh-detail-modal').classList.contains('hidden')) {
            openShDetailModal(id);
        }
    };

    refreshShViews();
    showToast("Mengirim Remark ke server di latar belakang...", "warning");

    // 3. Kirim ke Firebase di latar belakang (non-blocking, tanpa loading screen)
    saveDB('sh_materials', globalShMaterials)
        .then(() => {
            refreshShViews();
            showToast("Remark SH tersinkron ke server!", "success");
        })
        .catch((e) => {
            console.error("Background sync SH gagal:", e);
            showToast("Gagal sinkron ke server. Cek koneksi atau refresh halaman.", "error");
        });
};

window.renderShImpactDetails = function(id) {
    let sh = globalShMaterials.find(x => x.id === id);
    let container = document.getElementById('sh-impact-container');
    if(!sh || !container) return;
    
    container.innerHTML = `<div class="text-center p-6 text-xs font-bold text-indigo-500 flex flex-col items-center justify-center gap-3"><i data-lucide="loader-2" class="w-6 h-6 animate-spin"></i> Memuat data...</div>`;
    lucide.createIcons();
    
    setTimeout(() => {
        if(sh.targetUids && sh.targetUids.length > 0) {
            let assyList = [];
            sh.targetUids.forEach(uid => {
                let m = globalMasterData.find(x => x._uid === uid);
                if(m) assyList.push(m);
            });
            assyList.sort((a,b) => parseIndoDate(a.STWC) - parseIndoDate(b.STWC));
            
            let html = `
            <div class="max-h-60 overflow-y-auto border border-gray-200 rounded-lg shadow-sm w-full animate-[fadeIn_0.3s_ease-out]">
                <table class="w-full text-[10px] text-left whitespace-nowrap">
                    <thead class="bg-gray-100 sticky top-0 shadow-sm z-10">
                        <tr>
                            <th class="p-2 border-b border-gray-200">Periode</th>
                            <th class="p-2 border-b border-gray-200">Assy No</th>
                            <th class="p-2 border-b border-gray-200">WP</th>
                            <th class="p-2 border-b border-gray-200 text-center">STWC</th>
                            <th class="p-2 border-b border-gray-200 text-center">USAGE</th>
                            <th class="p-2 border-b border-gray-200 text-right">QTY DB</th>
                            <th class="p-2 border-b border-gray-200 text-right">NEED MATERIAL</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100">`;
            
            assyList.forEach(m => {
                let cleanA = superCleanAssy(m.ASSY);
                let usage = (sh.assyUsageMap && sh.assyUsageMap[cleanA]) ? sh.assyUsageMap[cleanA] : 1;
                let qtyDisplay = parseFloat(m.QTY || 0);
                let needMat = qtyDisplay * usage;
                html += `
                        <tr class="hover:bg-indigo-50 transition-colors">
                            <td class="p-2 font-bold text-gray-700">${m.PERIODE||'-'}</td>
                            <td class="p-2 font-black text-gray-900">${m.ASSY||'-'}</td>
                            <td class="p-2 font-mono text-gray-500">${m.WP||'-'}</td>
                            <td class="p-2 text-center font-bold text-gray-700">${m.STWC||'-'}</td>
                            <td class="p-2 text-center font-bold text-pink-600">${usage}</td>
                            <td class="p-2 text-right font-bold text-indigo-600">${qtyDisplay}</td>
                            <td class="p-2 text-right font-black text-pink-700">${needMat.toLocaleString()}</td>
                        </tr>`;
            });
            html += `</tbody></table></div>`;
            container.outerHTML = html;
        }
    }, 50);
};

window.openShDetailModal = function(id) {
    let sh = globalShMaterials.find(x => x.id === id);
    if(!sh) return;
    
    let isArrived = sh.tanggalKedatangan !== null;
    let statusBadge = isArrived ? `<span class="bg-emerald-100 text-emerald-700 px-2 py-1 rounded font-black border border-emerald-200">ARRIVED (${sh.tanggalKedatangan})</span>` : `<span class="bg-red-100 text-red-600 px-2 py-1 rounded font-black border border-red-200 animate-pulse">OPEN</span>`;
    let estStr = sh.estimasiKedatangan ? sh.estimasiKedatangan.split('-').reverse().join('-') : '<span class="text-[9px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded border border-red-200 animate-pulse uppercase tracking-wider">Belum Konfirmasi MCL</span>';
    let editBtn = `<button onclick="requireAccess(['050205', '110603', '111111'], () => openEditShModal(${sh.id}))" class="text-amber-500 hover:text-amber-700 hover:bg-amber-100 p-1 rounded transition"><i data-lucide="edit" class="w-3.5 h-3.5"></i></button>`;
    
    let impactDetailsHtml = '';
    let assyCount = sh.targetUids ? sh.targetUids.length : 0;
    let requestedCount = sh.affectedAssys ? sh.affectedAssys.length : assyCount;
    
    if (assyCount > 0) {
        impactDetailsHtml = `
        <div id="sh-impact-container" class="border border-indigo-100 rounded-xl p-6 bg-indigo-50/30 text-center flex flex-col items-center justify-center gap-3">
            <div class="bg-indigo-100 p-2.5 rounded-full border border-indigo-200"><i data-lucide="database" class="w-6 h-6 text-indigo-600"></i></div>
            <div>
                <h4 class="text-sm font-black text-gray-800">Terdapat <span class="text-indigo-600">${assyCount} Assy Aktif</span> Terdampak</h4>
                <p class="text-[10px] text-gray-500 font-medium mt-1">Dari total <strong>${requestedCount}</strong> list Assy yang diawasi (Watchlist).</p>
            </div>
            <button onclick="renderShImpactDetails(${sh.id})" class="mt-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg font-bold text-xs transition flex items-center gap-2 shadow-md transform hover:-translate-y-0.5">
                <i data-lucide="eye" class="w-4 h-4"></i> Tampilkan Daftar Assy
            </button>
        </div>`;
    } else {
        impactDetailsHtml = `
        <div class="border border-gray-200 rounded-xl p-6 bg-gray-50 text-center flex flex-col items-center justify-center gap-2">
            <i data-lucide="box-select" class="w-6 h-6 text-gray-400"></i>
            <h4 class="text-xs font-black text-gray-700">0 Assy Aktif Terdampak</h4>
            <p class="text-[10px] text-gray-500 italic px-4">Sistem mengawasi <strong>${requestedCount}</strong> Assy. Jika part tersebut dirilis di periode selanjutnya, statusnya akan otomatis menjadi SH.</p>
        </div>`;
    }
    
    let btnAction = isArrived ? '' : `<button onclick="confirmArrival(${sh.id})" class="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-lg shadow-md font-bold text-xs flex items-center gap-2 transition-all transform hover:-translate-y-0.5"><i data-lucide="check-square" class="w-4 h-4"></i> Konfirmasi Kedatangan</button>`;

    let chatHistoryHtml = '';
    let logs = sh.remarksLog || [];
    if (logs.length === 0 && sh.remarks) {
        logs = [{ sender: 'Catatan Lama', message: sh.remarks, time: sh.tanggalSH }];
    }

    if (logs.length === 0) {
        chatHistoryHtml = '<div class="text-center text-xs text-gray-400 italic py-4">Belum ada diskusi terkait material ini.</div>';
    } else {
        logs.forEach(log => {
            let isMe = activeUserPin && AUTH_PROFILES[activeUserPin] === log.sender;
            let alignClass = isMe ? 'items-end' : 'items-start';
            let bgClass = isMe ? 'bg-sky-100 border-sky-200' : 'bg-white border-gray-200';
            let nameColor = isMe ? 'text-sky-700' : 'text-gray-700';

            chatHistoryHtml += `
            <div class="flex flex-col ${alignClass} mb-3 w-full">
                <span class="text-[9px] font-black ${nameColor} mb-0.5 px-1">${log.sender} <span class="font-normal text-gray-400 ml-1">${log.time || ''}</span></span>
                <div class="${bgClass} border px-3 py-2 rounded-xl text-xs text-gray-800 max-w-[85%] whitespace-pre-wrap shadow-sm">${log.message}</div>
            </div>`;
        });
    }

    let chatInputHtml = '';
    if (activeUserPin) {
        chatInputHtml = `
            <input type="text" id="sh-reply-input" placeholder="Ketik pesan balasan/catatan..." class="flex-1 text-xs border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-sky-500 shadow-inner" onkeydown="if(event.key === 'Enter') sendShReply(${sh.id})">
            <button onclick="sendShReply(${sh.id})" class="bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-sm"><i data-lucide="send" class="w-3 h-3"></i> Kirim</button>
        `;
    } else {
        chatInputHtml = `
            <button onclick="requireAccess(['110603', '050205', '010625', '111111'], () => openShDetailModal(${sh.id}))" class="w-full bg-gray-100 hover:bg-gray-200 text-gray-500 border border-gray-300 border-dashed px-4 py-2.5 rounded-lg text-[10px] uppercase tracking-wider font-bold transition flex items-center justify-center gap-2">
                <i data-lucide="lock" class="w-3.5 h-3.5 text-gray-400"></i> Login (Buka Gembok) untuk Membalas Interaksi
            </button>
        `;
    }

    let html = `
        <div class="flex justify-between items-start mb-6">
            <div>
                <h2 class="text-2xl font-black text-gray-800">${sh.partName}</h2>
                <p class="text-sm font-bold text-gray-500 mt-1">ID: ${sh.itemId} <span class="mx-2">|</span> Kategori: <span class="text-amber-600">${sh.type}</span></p>
            </div>
            ${statusBadge}
        </div>
        
        <div class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <div class="bg-gray-50 p-4 rounded-xl border border-gray-200">
                <span class="text-[10px] uppercase font-bold text-gray-400 block mb-1">Rentang Periode DB</span>
                <strong class="text-sm text-gray-800">${sh.startPeriod} - ${sh.endPeriod}</strong>
            </div>
            <div class="bg-gray-50 p-4 rounded-xl border border-gray-200">
                <span class="text-[10px] uppercase font-bold text-gray-400 block mb-1">Tanggal Ditetapkan</span>
                <strong class="text-sm text-gray-800">${sh.tanggalSH}</strong>
            </div>
            <div class="bg-blue-50 p-4 rounded-xl border border-blue-200">
                <span class="text-[10px] uppercase font-bold text-blue-600 block mb-1">PIC (Inputter)</span>
                <strong class="text-sm text-blue-900 flex items-center gap-1.5"><i data-lucide="user-check" class="w-4 h-4"></i> ${sh.inputter || 'Sistem'}</strong>
            </div>
            <div class="bg-amber-50 p-4 rounded-xl border border-amber-200 relative group md:col-span-2">
                <div class="flex justify-between items-start">
                    <span class="text-[10px] uppercase font-bold text-amber-600 block mb-1">Estimasi Kedatangan</span>
                    ${editBtn}
                </div>
                <strong class="text-sm text-amber-900">${estStr}</strong>
            </div>
            <div class="bg-purple-50 p-4 rounded-xl border border-purple-200">
                <span class="text-[10px] uppercase font-bold text-purple-600 block mb-1">Total CCT Tertahan</span>
                <strong class="text-sm text-purple-900">${(sh.totalCct||0).toLocaleString()}</strong>
            </div>
            <div class="bg-pink-50 p-4 rounded-xl border border-pink-200">
                <span class="text-[10px] uppercase font-bold text-pink-600 block mb-1">Total Need Material</span>
                <strong class="text-sm text-pink-900">${(sh.totalNeedMaterial||0).toLocaleString()}</strong>
            </div>
        </div>
        
        <div class="mb-6">
            <span class="text-[10px] uppercase font-bold text-sky-600 flex items-center gap-1 mb-2"><i data-lucide="messages-square" class="w-3.5 h-3.5"></i> Log Interaksi (Feedback Produksi & MCL)</span>
            <div class="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm flex flex-col">
                <div class="p-4 max-h-56 overflow-y-auto bg-gray-50/50 flex flex-col" id="sh-detail-chat-box">
                    ${chatHistoryHtml}
                </div>
                <div class="p-2 border-t border-gray-200 bg-white flex gap-2 w-full">
                    ${chatInputHtml}
                </div>
            </div>
        </div>
        
        <div class="mb-6">
            <div class="flex justify-between items-center mb-2">
                <span class="text-[10px] uppercase font-bold text-gray-400">Detail Assy Terdampak Shortage</span>
                <div class="flex gap-2">
                    <button onclick="exportShImpactDetails(${sh.id})" class="text-[9px] bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-1 rounded shadow-sm font-bold transition flex items-center gap-1" title="Export Excel Assy Terdampak"><i data-lucide="download" class="w-3 h-3"></i> Export Excel</button>
                    ${isArrived ? '' : `<button onclick="requireAccess(['110603', '050205', '111111'], () => refreshShImpact(${sh.id}))" class="text-[9px] bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-1 rounded shadow-sm font-bold transition flex items-center gap-1" title="Sinkronkan ulang data WIP terdampak dengan File Where Used asal"><i data-lucide="refresh-cw" class="w-3 h-3"></i> Refresh Data</button>`}
                    ${isArrived ? '' : `<button onclick="requireAccess(['110603', '050205', '111111'], () => openAddAssyShModal(${sh.id}))" class="text-[9px] bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-2 py-1 rounded shadow-sm font-bold transition flex items-center gap-1"><i data-lucide="plus" class="w-3 h-3"></i> Edit List</button>`}
                </div>
            </div>
            <div>${impactDetailsHtml}</div>
        </div>
        
        <div class="flex justify-between items-center pt-5 mt-2 border-t border-gray-200 w-full">
            <div>
                <button onclick="triggerDeleteSh(${sh.id})" class="text-gray-400 hover:text-red-600 bg-transparent hover:bg-red-50 px-3 py-2 rounded-lg font-bold text-[10px] transition-colors flex items-center gap-1.5 border border-transparent hover:border-red-200" title="Hapus seluruh data riwayat shortage ini">
                    <i data-lucide="trash-2" class="w-4 h-4"></i> Hapus SH
                </button>
            </div>
            <div class="flex items-center gap-3">
                <button onclick="closeShDetailModal()" class="text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-5 py-2.5 rounded-lg font-bold text-xs transition shadow-sm border border-gray-200">Tutup</button>
                ${btnAction}
            </div>
        </div>
    `;
    document.getElementById('sh-detail-content').innerHTML = html;
    lucide.createIcons();
    document.getElementById('sh-detail-modal').classList.remove('hidden');
    setTimeout(() => { let cb = document.getElementById('sh-detail-chat-box'); if(cb) cb.scrollTop = cb.scrollHeight; }, 50);
}
window.closeShDetailModal = function() { document.getElementById('sh-detail-modal').classList.add('hidden'); }

window.openAddAssyShModal = function(id) {
    let sh = globalShMaterials.find(x => x.id === id);
    if(!sh) return;
    
    let overlay = document.createElement('div');
    overlay.id = 'sh-add-assy-popup';
    overlay.className = 'fixed inset-0 bg-gray-900/60 z-[10006] flex items-center justify-center p-4 backdrop-blur-sm transition-opacity';
    overlay.innerHTML = `
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col scale-100 transition-transform border border-gray-200">
            <div class="px-5 py-4 border-b border-indigo-200 flex justify-between items-center bg-indigo-50 shrink-0">
                <div>
                    <h3 class="font-black text-indigo-900 tracking-tight flex items-center gap-2"><i data-lucide="list-plus" class="w-5 h-5 text-indigo-600"></i> Tambah Assy Terdampak</h3>
                    <p class="text-[10px] text-indigo-600 mt-1 font-bold">Material: <span class="text-indigo-800">${sh.partName}</span></p>
                </div>
                <button onclick="document.getElementById('sh-add-assy-popup').remove()" class="text-indigo-400 hover:text-red-500 bg-white shadow-sm border border-indigo-100 p-1.5 rounded transition"><i data-lucide="x" class="w-4 h-4"></i></button>
            </div>
            <div class="p-5 bg-white flex flex-col gap-4">
                <div class="bg-amber-50 border border-amber-200 p-3 rounded-lg flex gap-3 items-start">
                    <i data-lucide="info" class="w-4 h-4 text-amber-500 shrink-0 mt-0.5"></i>
                    <p class="text-[10px] text-amber-800 font-medium leading-relaxed">Assy yang berstatus CLOSED atau belum ada di database akan otomatis masuk ke mode <strong>Watchlist (Standby)</strong> dan akan aktif di periode selanjutnya.</p>
                </div>
                
                <div>
                    <label class="block text-[10px] font-bold text-gray-600 mb-1.5">1. Tambah Manual (Pisahkan spasi/enter)</label>
                    <textarea id="sh-add-assy-manual" class="w-full text-xs h-24 p-3 border border-gray-300 rounded-lg focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none shadow-inner" placeholder="Paste list Assy di sini..."></textarea>
                </div>
                
                <div class="border border-gray-200 rounded-lg p-3 bg-gray-50 flex items-center justify-between">
                    <div>
                        <label class="block text-[10px] font-bold text-gray-700 mb-0.5">2. Tambah via Excel/CSV</label>
                        <span class="text-[9px] text-gray-500">Otomatis mencari kolom "ASSY NO"</span>
                    </div>
                    <input type="file" id="sh-add-assy-excel" accept=".xlsx, .xls, .csv" class="text-[10px] text-gray-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-[10px] file:font-bold file:bg-indigo-100 file:text-indigo-700 hover:file:bg-indigo-200 transition cursor-pointer w-48">
                </div>
            </div>
            <div class="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
                <button onclick="document.getElementById('sh-add-assy-popup').remove()" class="px-4 py-2 rounded-lg text-xs font-bold text-gray-500 hover:bg-gray-200 transition">Batal</button>
                <button onclick="executeAddAssyToSh(${sh.id})" id="btn-execute-add-assy" class="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg shadow-md text-xs font-bold flex items-center gap-2 transition"><i data-lucide="check-circle" class="w-4 h-4"></i> Simpan List Tambahan</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    lucide.createIcons();

    document.getElementById('sh-add-assy-excel').addEventListener('change', async function(e) {
        let file = e.target.files[0];
        if(!file) return;
        try {
            let fileObj = await readExcelFile(file);
            let workbook = XLSX.read(fileObj.data, {type: 'array'});
            let jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {header: 1, defval: ""});
            
            let assyIndex = -1;
            for(let r=0; r<Math.min(20, jsonData.length); r++) {
                if(!jsonData[r]) continue;
                for(let c=0; c<jsonData[r].length; c++) {
                    let cellVal = String(jsonData[r][c] || '').toUpperCase().replace(/\s+/g, '');
                    if(cellVal.includes('ASSYNO') || cellVal === 'ASSY' || cellVal === 'PARTNO') { assyIndex = c; break; }
                }
                if(assyIndex !== -1) break;
            }
            if(assyIndex !== -1) {
                let extracted = [];
                for(let i=0; i<jsonData.length; i++) {
                    let val = jsonData[i] ? jsonData[i][assyIndex] : null;
                    if(val && String(val).trim() !== '' && !String(val).toUpperCase().includes('ASSY')) extracted.push(String(val).trim());
                }
                let ta = document.getElementById('sh-add-assy-manual');
                ta.value = ta.value + (ta.value ? '\n' : '') + extracted.join('\n');
                showToast(`Berhasil ekstrak ${extracted.length} Assy dari Excel.`, 'success');
            } else {
                showToast("Kolom 'ASSY NO' tidak ditemukan di Excel.", "error");
            }
        } catch(err) { showToast("Gagal membaca Excel.", "error"); }
        e.target.value = '';
    });
};

window.executeAddAssyToSh = async function(id) {
    let shIndex = globalShMaterials.findIndex(x => x.id === id);
    if (shIndex === -1) return;

    let manualInput = document.getElementById('sh-add-assy-manual').value;
    let manualList = manualInput.split(/[\n, ]+/).map(s => s.trim().toUpperCase()).filter(s => s);
    
    if (manualList.length === 0) {
        showToast("Daftar Assy kosong!", "warning"); return;
    }

    let btn = document.getElementById('btn-execute-add-assy');
    btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Memproses...';
    btn.disabled = true;
    lucide.createIcons();

    let cleanNewAssys = manualList.map(a => superCleanAssy(a));
    let currentAffected = globalShMaterials[shIndex].affectedAssys || [];
    let mergedAffected = Array.from(new Set([...currentAffected, ...cleanNewAssys]));
    
    globalShMaterials[shIndex].affectedAssys = mergedAffected;

    try {
        await recalculateValidation(true); 
        document.getElementById('sh-add-assy-popup').remove();
        showToast(`${cleanNewAssys.length} Assy ditambahkan ke Watchlist SH!`, 'success');
        openShDetailModal(id);
    } catch(e) {
        showToast('Gagal memproses penambahan Assy', 'error');
        btn.innerHTML = '<i data-lucide="check-circle" class="w-4 h-4"></i> Simpan List Tambahan';
        btn.disabled = false;
        lucide.createIcons();
    }
};

window.promptCaptchaDelete = function(type, id) {
    if(type === 'SH') window.executeDeleteSh(id);
    else if(type === 'ROCKET') window.executeDeleteRocket(id);
};
window.closeCaptchaModal = function() { document.getElementById('captcha-delete-modal').classList.add('hidden'); };
window.verifyCaptcha = function() {};

window.triggerDeleteSh = function(id) {
    requireAccess(['110603', '111111'], () => { 
        closeShDetailModal();
        window.executeDeleteSh(id); 
    });
};

window.executeDeleteSh = async function(id) {
    if(!confirm("Yakin ingin menghapus / membatalkan data Shortage ini?")) return;

    let originalCount = globalShMaterials.length;
    globalShMaterials = globalShMaterials.filter(sh => String(sh.id) !== String(id) && sh.id !== Number(id));
    
    if(globalShMaterials.length === originalCount) {
        showToast("Data sudah tidak ada di memori.", "warning"); return;
    }

    try {
        setLoaderState('Menghapus...', 'Update Database Cloud', 50, 'Anti Quota-Exceeded');
        document.getElementById('loading-overlay').classList.remove('hidden');
        
        await saveDB('sh_materials', globalShMaterials);
        
        renderShMaterials();
        if(!document.getElementById('view-overview').classList.contains('hidden')) renderOverviewDashboard();
        if(!document.getElementById('view-report').classList.contains('hidden')) renderReportWIP();
        if(!document.getElementById('view-control').classList.contains('hidden')) renderControlOutstanding();

        document.getElementById('loading-overlay').classList.add('hidden');
        showToast("Riwayat Shortage berhasil dihapus.", "success");
    } catch(e) {
        console.error(e);
        document.getElementById('loading-overlay').classList.add('hidden');
        showToast("Gagal menghapus data ke Cloud.", "error");
    }
};

window.updateKonfirmasiMCL = async function(id, val) {
    let item = globalShMaterials.find(x => String(x.id) === String(id));
    if (item) {
        item.konfirmasiMcl = val;
        await saveDB('sh_materials', globalShMaterials);
        showToast("Konfirmasi MCL diperbarui", "success");
    }
};

window.sendShReply = async function(id) {
    let inputEl = document.getElementById('sh-reply-input');
    let msg = inputEl.value.trim();
    if (!msg) return;

    if (!activeUserPin) {
        showToast("Silakan klik Gembok Kunci/Login terlebih dahulu untuk membalas.", "warning");
        return;
    }

    let senderName = AUTH_PROFILES[activeUserPin] || 'Unknown';
    let item = globalShMaterials.find(x => String(x.id) === String(id));
    
    if (item) {
        if (!item.remarksLog) item.remarksLog = [];
        if (item.remarksLog.length === 0 && item.remarks) {
            item.remarksLog.push({ sender: 'PPC/MCL (Lama)', message: item.remarks, time: item.tanggalSH });
            item.remarks = ''; 
        }
        
        let now = new Date();
        let timeStr = now.toLocaleDateString('id-ID', {day:'numeric', month:'short'}) + ' ' + now.toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'});
        
        let newLog = { sender: senderName, message: msg, time: timeStr };
        item.remarksLog.push(newLog);
        
        let chatBox = document.getElementById('sh-detail-chat-box');
        if (chatBox) {
            let emptyMsg = chatBox.querySelector('.text-center.italic');
            if (emptyMsg) emptyMsg.remove();
            
            let tempId = `temp-chat-${now.getTime()}`;
            let bubbleHtml = `
            <div class="flex flex-col items-end mb-3 w-full animate-pulse" id="${tempId}">
                <span class="text-[9px] font-black text-sky-700 mb-0.5 px-1">${newLog.sender} <span class="font-normal text-amber-500 ml-1">Mengirim... <i data-lucide="loader-2" class="w-3 h-3 inline animate-spin"></i></span></span>
                <div class="bg-sky-100 border-sky-200 border px-3 py-2 rounded-xl text-xs text-gray-800 max-w-[85%] whitespace-pre-wrap shadow-sm">${newLog.message}</div>
            </div>`;
            
            chatBox.insertAdjacentHTML('beforeend', bubbleHtml);
            chatBox.scrollTop = chatBox.scrollHeight;
            lucide.createIcons();
        }
        
        inputEl.value = '';
        inputEl.disabled = true;

        try {
            await saveDB('sh_materials', globalShMaterials);
            openShDetailModal(id);
            renderShMaterials();
        } catch(e) {
            showToast('Koneksi terputus! Gagal mengirim pesan.', 'error');
            inputEl.disabled = false;
            item.remarksLog.pop();
            let tempBubble = document.getElementById(`temp-chat-${now.getTime()}`);
            if(tempBubble) tempBubble.remove();
        }
    }
};

window.confirmArrival = async function(id) {
    requireAccess(['050205', '110603', '111111'], async () => {
        let dateStr = prompt("Konfirmasi kedatangan aktual untuk material ini (YYYY-MM-DD):", getTodayDateStr().split('-').reverse().join('-'));
        if(dateStr) {
            let shIndex = globalShMaterials.findIndex(x => x.id === id);
            if(shIndex === -1) return;
            
            globalShMaterials[shIndex].tanggalKedatangan = dateStr;
            globalShMaterials[shIndex].picClosed = activeUserPin ? AUTH_PROFILES[activeUserPin] : 'Sistem';

            await executeSilentCRUD(async () => {
                await saveDB('sh_materials', globalShMaterials);
            }, "Kedatangan Material Berhasil Dikonfirmasi!", null);
            
            closeShDetailModal();
        }
    });
};

window.exportShImpactDetails = function(id) {
    let sh = globalShMaterials.find(x => x.id === id);
    if(!sh) return;
    
    showToast("Menyiapkan Export...", "info");
    setTimeout(() => {
        try {
            let ws = generateFlatAssySheet([sh]);
            let wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "ASSY_TERDAMPAK");
            let cleanName = sh.partName.replace(/[^a-zA-Z0-9]/g, '_');
            XLSX.writeFile(wb, `Detail_SH_${cleanName}_${getTodayDateStr()}.xlsx`);
            showToast("Export List Assy Berhasil!", "success");
        } catch(e) { showToast("Gagal Export", "error"); }
    }, 300);
};

window.refreshShImpact = async function(id) {
    let shIndex = globalShMaterials.findIndex(x => x.id === id);
    if (shIndex === -1) return;
    let sh = globalShMaterials[shIndex];
    
    let findIdx = (val) => {
        let v = String(val).trim();
        let idx = globalUniquePeriodeWPP.indexOf(v);
        if(idx === -1 && !v.includes('_')) idx = globalUniquePeriodeWPP.findIndex(k => k.startsWith(v));
        return idx;
    };
    
    let startIndex = findIdx(sh.startPeriod);
    let validPwKeys = [];
    
    if (sh.endPeriod === 'Sekarang') {
        if(startIndex !== -1) validPwKeys = globalUniquePeriodeWPP.slice(startIndex);
    } else {
        let endIndex = findIdx(sh.endPeriod);
        if(startIndex !== -1 && endIndex !== -1) validPwKeys = globalUniquePeriodeWPP.slice(startIndex, endIndex + 1);
    }

    if(validPwKeys.length > 0) {
        let newActiveUids = globalMasterData.filter(m => {
            if (m._status === 'CLOSED') return false;
            let mPwKey = (m.PERIODE || '-') + '_' + getWPP(String(m.WP || '-').trim());
            return validPwKeys.includes(mPwKey) && sh.affectedAssys.includes(superCleanAssy(m.ASSY));
        }).map(m => m._uid);
        
        let newCct = 0; let newNeed = 0;
        let wipMapTemp = new Map(); globalWipData.forEach(w => wipMapTemp.set(w._uid, w));
        
        newActiveUids.forEach(uid => {
            let m = globalMasterData.find(x => x._uid === uid);
            if(m) {
                let w = wipMapTemp.get(uid);
                newCct += (w && w['PP CCT'] ? parseFloat(w['PP CCT']) : parseFloat(m['TOTAL CCT'] || 0));
                let cleanA = superCleanAssy(m.ASSY);
                let usage = (sh.assyUsageMap && sh.assyUsageMap[cleanA]) ? sh.assyUsageMap[cleanA] : 1;
                let qtyDisplay = parseFloat(m['QTY'] || 0);
                newNeed += (qtyDisplay * usage);
            }
        });
        
        globalShMaterials[shIndex].targetUids = newActiveUids;
        globalShMaterials[shIndex].totalCct = newCct;
        globalShMaterials[shIndex].totalNeedMaterial = newNeed;
        
        await executeSilentCRUD(async () => {
            await saveDB('sh_materials', globalShMaterials);
        }, "Data Assy Terdampak berhasil disinkronisasi paksa!", null);
        
        openShDetailModal(id); // Muat ulang modal
    } else {
        showToast("Rentang periode tidak valid.", "error");
    }
};

window.refreshAllOpenShImpact = async function() {
    if(!confirm("Fitur ini akan menyinkronkan ulang data WIP terdampak untuk SELURUH Shortage berstatus OPEN dengan file Where Used asal mereka. Lanjutkan?")) return;
    let updated = 0;
    
    await executeSilentCRUD(async () => {
        let wipMapTemp = new Map(); globalWipData.forEach(w => wipMapTemp.set(w._uid, w));
        let findIdx = (val) => {
            let v = String(val).trim();
            let idx = globalUniquePeriodeWPP.indexOf(v);
            if(idx === -1 && !v.includes('_')) idx = globalUniquePeriodeWPP.findIndex(k => k.startsWith(v));
            return idx;
        };

        globalShMaterials.forEach(sh => {
            if(sh.tanggalKedatangan === null) {
                let startIndex = findIdx(sh.startPeriod);
                let validPwKeys = [];
                if (sh.endPeriod === 'Sekarang') {
                    if(startIndex !== -1) validPwKeys = globalUniquePeriodeWPP.slice(startIndex);
                } else {
                    let endIndex = findIdx(sh.endPeriod);
                    if(startIndex !== -1 && endIndex !== -1) validPwKeys = globalUniquePeriodeWPP.slice(startIndex, endIndex + 1);
                }
                
                if(validPwKeys.length > 0) {
                    let newActiveUids = globalMasterData.filter(m => {
                        if (m._status === 'CLOSED') return false;
                        let mPwKey = (m.PERIODE || '-') + '_' + getWPP(String(m.WP || '-').trim());
                        return validPwKeys.includes(mPwKey) && sh.affectedAssys.includes(superCleanAssy(m.ASSY));
                    }).map(m => m._uid);
                    
                    let newCct = 0; let newNeed = 0;
                    newActiveUids.forEach(uid => {
                        let m = globalMasterData.find(x => x._uid === uid);
                        if(m) {
                            let w = wipMapTemp.get(uid);
                            newCct += (w && w['PP CCT'] ? parseFloat(w['PP CCT']) : parseFloat(m['TOTAL CCT'] || 0));
                            let cleanA = superCleanAssy(m.ASSY);
                            let usage = (sh.assyUsageMap && sh.assyUsageMap[cleanA]) ? sh.assyUsageMap[cleanA] : 1;
                            newNeed += parseFloat(m['QTY'] || 0) * usage;
                        }
                    });
                    sh.targetUids = newActiveUids; sh.totalCct = newCct; sh.totalNeedMaterial = newNeed;
                    updated++;
                }
            }
        });
        await saveDB('sh_materials', globalShMaterials);
    }, `Sinkronisasi Massal ${updated} SH Berhasil!`, null);
};

window.copyToClipboardText = function(text, customMsg) {
    let textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    document.body.appendChild(textArea);
    textArea.select();
    try { 
        document.execCommand("copy"); 
        showToast(customMsg || `Nama Part disalin: ${text}`, "success"); 
    } catch (err) { 
        showToast("Gagal menyalin teks", "error"); 
    }
    document.body.removeChild(textArea);
};

window.copyReportText = function() {
    if(!window.currentReportStats) {
        showToast("Data belum siap. Tunggu hingga loading selesai.", "warning");
        return;
    }
    
    let today = new Date();
    let options = { day: 'numeric', month: 'long', year: 'numeric' };
    let dateFormatted = today.toLocaleDateString('id-ID', options);
    
    let text = `Report WIP PP Export Tanggal ${dateFormatted}\n\n` +
               `Total Loading = ${window.currentReportStats.totalLoad.toLocaleString('id-ID')}\n` +
               `On Schedule = ${window.currentReportStats.onSched.toLocaleString('id-ID')}\n` +
               `Delay = ${window.currentReportStats.delay.toLocaleString('id-ID')}\n` +
               `Shortage = ${window.currentReportStats.sh.toLocaleString('id-ID')}\n` +
               `Paylater = ${window.currentReportStats.paylater.toLocaleString('id-ID')}\n` +
               `FIFO = ${window.currentReportStats.fifoPct}%`;
               
    window.copyToClipboardText(text, "Format Report berhasil disalin ke Clipboard!");
};

window.renderShMaterials = function() {
    const tbody = document.getElementById('sh-table-body');
    if(!tbody) return;

    let filterType = document.getElementById('filter-sh-type') ? document.getElementById('filter-sh-type').value : 'ALL';
    let filterName = document.getElementById('filter-sh-name') ? document.getElementById('filter-sh-name').value.toLowerCase() : '';
    let filterDate = document.getElementById('filter-sh-date') ? document.getElementById('filter-sh-date').value : '';
    let filterStatus = document.getElementById('filter-sh-status') ? document.getElementById('filter-sh-status').value : 'ALL';
    let filterMcl = document.getElementById('filter-sh-mcl') ? document.getElementById('filter-sh-mcl').value : 'ALL';
    
    let filteredSh = globalShMaterials;
    
    if(filterType !== 'ALL') { filteredSh = filteredSh.filter(sh => sh.type === filterType); }
    if(filterName) { filteredSh = filteredSh.filter(sh => (sh.partName || '').toLowerCase().includes(filterName) || (sh.itemId || '').toLowerCase().includes(filterName)); }
    if(filterDate) {
        let dParts = filterDate.split('-');
        if(dParts.length === 3) {
            let formattedD = `${dParts[2]}-${dParts[1]}-${dParts[0]}`; 
            filteredSh = filteredSh.filter(sh => sh.tanggalSH === formattedD);
        }
    }
    if(filterStatus !== 'ALL') {
        filteredSh = filteredSh.filter(sh => {
            if (filterStatus === 'ARRIVED') return sh.tanggalKedatangan !== null;
            if (filterStatus === 'OPEN') return sh.tanggalKedatangan === null;
            return true;
        });
    }
    if(filterMcl !== 'ALL') {
        filteredSh = filteredSh.filter(sh => {
            if (filterMcl === 'KOSONG') return !sh.konfirmasiMcl || sh.konfirmasiMcl.trim() === '';
            return sh.konfirmasiMcl === filterMcl;
        });
    }

    if(filteredSh.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="text-center p-6 text-gray-400 font-medium">Tidak ada data SH.</td></tr>`; 
        return; 
    }
    
    filteredSh.sort((a,b) => {
        if (a.tanggalKedatangan === null && b.tanggalKedatangan !== null) return -1;
        if (a.tanggalKedatangan !== null && b.tanggalKedatangan === null) return 1;
        return b.id - a.id; 
    });

    let html = '';
    filteredSh.forEach(sh => {
        let isDatang = sh.tanggalKedatangan !== null;
        let bgRow = isDatang ? 'bg-emerald-100 hover:bg-emerald-200 cursor-pointer transition' : 'bg-red-50 hover:bg-red-100 cursor-pointer transition';
        let statBadge = isDatang ? `<span class="bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded font-black text-[9px] border border-emerald-300">ARRIVED</span>` : `<span class="bg-red-200 text-red-800 px-2 py-0.5 rounded font-black text-[9px] border border-red-300 animate-pulse">OPEN</span>`;
        let estStr = sh.estimasiKedatangan ? sh.estimasiKedatangan.split('-').reverse().join('-') : '<span class="bg-red-100 text-red-600 px-1.5 py-0.5 rounded text-[8px] font-bold border border-red-200 animate-pulse">Belum Konfirmasi</span>';
        let assyCount = sh.targetUids ? sh.targetUids.length : 0;
        let cctStr = (sh.totalCct||0).toLocaleString();

        let chatLogHtml = '';
        if (sh.remarksLog && sh.remarksLog.length > 0) {
            let lastChat = sh.remarksLog[sh.remarksLog.length - 1];
            chatLogHtml = `<div class="font-bold text-sky-700 leading-tight">${lastChat.sender}:</div><div class="truncate w-full text-gray-600">${lastChat.message}</div>`;
            if (sh.remarksLog.length > 1) {
                chatLogHtml += `<div class="text-[8px] text-sky-500 mt-0.5 font-bold">+ ${sh.remarksLog.length - 1} balasan lainnya</div>`;
            }
        } else if (sh.remarks) {
            chatLogHtml = `<div class="truncate w-full text-gray-600">${sh.remarks}</div>`; 
        } else {
            chatLogHtml = '<span class="text-gray-400 italic">Belum ada diskusi</span>';
        }

        let badgeColor = sh.konfirmasiMcl ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-gray-100 text-gray-400 border-gray-200';
        let konfirmHtml = `<div class="text-[9px] font-bold border px-2 py-1 rounded shadow-sm whitespace-nowrap text-center ${badgeColor}">${sh.konfirmasiMcl || 'Waiting...'}</div>`;
        let safePartName = (sh.partName || '-').replace(/"/g, '&quot;').replace(/'/g, '\\\'');

        html += `
        <tr class="border-b border-gray-100 transition ${bgRow}" ondblclick="openShDetailModal(${sh.id})" title="Klik 2x (Double-Click) baris ini untuk melihat / membalas detail material">
            <td class="p-3 align-top">
                <div class="flex items-center gap-2">
                    <div class="font-black text-gray-800 text-[11px]">${sh.partName}</div>
                    <button onclick="event.stopPropagation(); copyToClipboardText('${safePartName}')" class="text-gray-400 hover:text-sky-500 bg-white border border-gray-200 shadow-sm p-1 rounded transition" title="Copy Nama Part ke Clipboard">
                        <i data-lucide="copy" class="w-3 h-3"></i>
                    </button>
                </div>
                <div class="text-[9px] text-gray-500 font-bold mt-0.5">ID: ${sh.itemId}</div>
            </td>
            <td class="p-3 text-center font-bold text-gray-600 text-[10px] align-top">${sh.type}</td>
            <td class="p-3 text-center font-mono text-gray-700 text-[10px] align-top">${sh.tanggalSH}</td>
            <td class="p-3 text-center font-bold text-amber-700 text-[10px] align-top">${estStr}</td>
            <td class="p-3 text-center align-top">${statBadge}</td>
            <td class="p-3 text-right align-top">
                <div class="font-black text-indigo-700 text-[10px]">${assyCount} Assy</div>
                <div class="text-[9px] text-gray-500 font-bold mt-0.5 mb-0.5">CCT: ${cctStr}</div>
                <div class="text-[9px] text-pink-600 font-black">Need: ${(sh.totalNeedMaterial||0).toLocaleString()}</div>
            </td>
            <td class="p-3 text-center align-top" title="Status Khusus MCL">${konfirmHtml}</td>
            <td class="p-3 max-w-[200px] text-[9px] align-top leading-tight overflow-hidden">${chatLogHtml}</td>
            <td class="p-3 text-center align-top"><span class="bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-bold text-[9px] shadow-sm whitespace-nowrap"><i data-lucide="user" class="w-3 h-3 inline mr-0.5"></i> ${sh.inputter || 'Sistem'}</span></td>
            <td class="p-3 text-center align-top"><span class="bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded font-bold text-[9px] shadow-sm whitespace-nowrap"><i data-lucide="user-check" class="w-3 h-3 inline mr-0.5"></i> ${sh.picClosed || '-'}</span></td>
        </tr>`;
    });
    tbody.innerHTML = html;
    lucide.createIcons();
}
function renderShMaterials() { window.renderShMaterials(); }

// ==========================================
// ASSY ROCKET LOGIC
// ==========================================
window.tempRocketValidated = [];
window.openRocketModal = function() {
    document.getElementById('rocket-stwc-input').value = '';
    document.getElementById('rocket-manual-input').value = '';
    safeSetHTML('rocket-validation-tbody', '<tr><td colspan="8" class="text-center p-8 text-gray-400 font-medium">Input list Assy + WP (Pemisah Spasi), lalu klik Validasi, atau gunakan Select Assy.</td></tr>');
    safeSetText('rocket-validation-summary', 'Total Validasi: 0 Assy');
    window.tempRocketValidated = [];
    document.getElementById('rocket-input-modal').classList.remove('hidden');
}
window.closeRocketModal = function() { document.getElementById('rocket-input-modal').classList.add('hidden'); }

window.openRocketSelectModal = function() {
    document.getElementById('rs-search-assy').value = '';
    document.getElementById('rs-search-wp').value = '';
    let html = '';
    let validMaster = globalMasterData.filter(m => m._status !== 'CLOSED');
    validMaster.sort((a,b) => parseIndoDate(a.STWC) - parseIndoDate(b.STWC));

    validMaster.forEach(m => {
        let badge = m._status === 'CND 3' ? '<span class="bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold animate-pulse shadow-sm">CND 3</span>' : 
                    m._status === 'CND 2' ? '<span class="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold shadow-sm">CND 2</span>' :
                    '<span class="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold shadow-sm">CND 1</span>';
        
        let isSelected = window.tempRocketValidated.some(x => x.uid === m._uid);
        let btn = isSelected ? 
            `<button disabled class="bg-gray-100 text-gray-400 border border-gray-200 px-3 py-1 rounded text-[9px] font-bold shadow-sm cursor-not-allowed">Selected</button>` : 
            `<button onclick="selectAssyForRocket('${m._uid}', this)" class="bg-white hover:bg-indigo-600 text-indigo-600 hover:text-white border border-indigo-200 px-3 py-1 rounded text-[9px] font-bold transition shadow-sm">Select</button>`;

        html += `
        <tr class="rs-row hover:bg-indigo-50 transition border-b border-gray-100">
            <td class="p-2 text-center align-middle">${badge}</td>
            <td class="p-2 font-bold text-gray-800 align-middle rs-assy">${m.ASSY||'-'}</td>
            <td class="p-2 text-center font-mono text-gray-500 align-middle rs-wp">${m.WP||'-'}</td>
            <td class="p-2 text-center align-middle">${btn}</td>
        </tr>`;
    });
    if(validMaster.length === 0) html = '<tr><td colspan="4" class="text-center p-6 text-gray-400">Tidak ada data aktif.</td></tr>';
    document.getElementById('rocket-select-tbody').innerHTML = html;
    document.getElementById('rocket-select-modal').classList.remove('hidden');
}
window.closeRocketSelectModal = function() { document.getElementById('rocket-select-modal').classList.add('hidden'); }

window.filterRocketSelect = function() {
    let filterAssy = document.getElementById('rs-search-assy').value.toUpperCase();
    let filterWp = document.getElementById('rs-search-wp').value.toUpperCase();
    let rows = document.querySelectorAll('.rs-row');
    rows.forEach(r => {
        let assy = (r.querySelector('.rs-assy').innerText || '').toUpperCase();
        let wp = (r.querySelector('.rs-wp').innerText || '').toUpperCase();
        if(assy.includes(filterAssy) && wp.includes(filterWp)) r.style.display = '';
        else r.style.display = 'none';
    });
}

window.selectAssyForRocket = function(uid, btnEl) {
    let m = globalMasterData.find(x => x._uid === uid);
    if(m && !window.tempRocketValidated.some(x => x.uid === uid)) {
        let qty = parseFloat(m['QTY'] || 0);
        window.tempRocketValidated.push({
            uid: m._uid, periode: m.PERIODE, assy: m.ASSY, wp: m.WP, status: m._status, dbQty: qty, cleanAssy: superCleanAssy(m.ASSY), cleanWp: superCleanAssy(m.WP), prioritas: '', remarks: ''
        });
        if(btnEl) {
            btnEl.disabled = true;
            btnEl.className = "bg-gray-100 text-gray-400 border border-gray-200 px-3 py-1 rounded text-[9px] font-bold shadow-sm cursor-not-allowed";
            btnEl.innerText = "Selected";
        }
        renderRocketValidationTable();
        showToast(`${m.ASSY} - ${m.WP} ditambahkan!`, 'success');
    }
}

window.validateRocketData = function() {
    let manualInput = document.getElementById('rocket-manual-input').value;
    let lines = manualInput.split(/[\n]+/).filter(l => l.trim() !== '');
    if(lines.length === 0) { showToast('List Assy & WP kosong!', 'warning'); return; }

    let pairs = lines.map(l => {
        let parts = l.split(/\s+/).filter(p => p.trim() !== '');
        if(parts.length >= 2) return { a: superCleanAssy(parts[0]), w: superCleanAssy(parts[1]) };
        return null;
    }).filter(p => p !== null);

    pairs.forEach(p => {
        let matches = globalMasterData.filter(m => superCleanAssy(m.ASSY) === p.a && superCleanAssy(m.WP) === p.w);
        matches.forEach(m => {
            let qty = parseFloat(m['QTY'] || 0);
            if(!window.tempRocketValidated.some(x => x.uid === m._uid)) {
                window.tempRocketValidated.push({
                    uid: m._uid, periode: m.PERIODE, assy: m.ASSY, wp: m.WP, status: m._status, dbQty: qty, cleanAssy: p.a, cleanWp: p.w, prioritas: '', remarks: ''
                });
            }
        });
    });
    document.getElementById('rocket-manual-input').value = '';
    renderRocketValidationTable();
}

window.renderRocketValidationTable = function() {
    let html = '';
    if(window.tempRocketValidated.length === 0) {
        html = '<tr><td colspan="8" class="text-center p-8 text-gray-400 font-medium">Data kosong.</td></tr>';
    } else {
        window.tempRocketValidated.forEach((d, i) => {
            let btn = `<button onclick="removeRocketTemp('${d.uid}')" class="text-gray-400 hover:text-red-600 bg-white border px-2 py-1 rounded shadow-sm"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>`;
            let badge = d.status === 'CLOSED' ? '<span class="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold text-[9px]">CLOSED</span>' : '<span class="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold text-[9px]">CND 1</span>';
            
            let selU = d.prioritas === 'Urgent' ? 'selected' : '';
            let selTU = d.prioritas === 'Top Urgent' ? 'selected' : '';
            let selR = d.prioritas === 'Rocket' ? 'selected' : '';

            let selectHtml = `
                <select onchange="updateTempRocketStatus(${i}, this.value)" class="w-full text-[10px] border border-gray-300 rounded px-2 py-1 outline-none focus:border-pink-500 bg-white cursor-pointer font-bold">
                    <option value="">- Pilih Status -</option>
                    <option value="Urgent" class="text-amber-600" ${selU}>Urgent</option>
                    <option value="Top Urgent" class="text-orange-600" ${selTU}>Top Urgent</option>
                    <option value="Rocket" class="text-pink-600" ${selR}>Rocket</option>
                </select>
            `;
            let remarkHtml = `<input type="text" placeholder="Remarks..." value="${d.remarks || ''}" onchange="updateTempRocketRemarks(${i}, this.value)" class="w-full text-[10px] border border-gray-300 rounded px-2 py-1 outline-none focus:border-pink-500 bg-white font-medium">`;
            html += `
            <tr class="border-b border-gray-100 hover:bg-pink-50 transition">
                <td class="p-2 text-center align-middle">${btn}</td>
                <td class="p-2 text-center align-middle">${selectHtml}</td>
                <td class="p-2 font-bold text-gray-800 text-center align-middle">${d.periode}</td>
                <td class="p-2 font-bold text-gray-800 align-middle">${d.assy}</td>
                <td class="p-2 text-center text-gray-500 font-mono align-middle">${d.wp}</td>
                <td class="p-2 text-center text-xs align-middle">${badge}</td>
                <td class="p-2 text-center text-indigo-600 font-bold align-middle">${d.dbQty}</td>
                <td class="p-2 text-center align-middle">${remarkHtml}</td>
            </tr>`;
        });
    }
    safeSetHTML('rocket-validation-tbody', html);
    safeSetText('rocket-validation-summary', `Total Validasi: ${window.tempRocketValidated.length} Assy`);
    lucide.createIcons();
}

window.updateTempRocketStatus = function(index, val) { if(window.tempRocketValidated[index]) window.tempRocketValidated[index].prioritas = val; }
window.updateTempRocketRemarks = function(index, val) { if(window.tempRocketValidated[index]) window.tempRocketValidated[index].remarks = val; }
window.removeRocketTemp = function(uid) { window.tempRocketValidated = window.tempRocketValidated.filter(x => x.uid !== uid); renderRocketValidationTable(); }

window.saveRocketData = async function() {
    if(window.tempRocketValidated.length === 0) { showToast('Tidak ada data valid', 'warning'); return; }
    let stwcInput = document.getElementById('rocket-stwc-input').value;
    if(!stwcInput) { showToast('Target STWC Wajib diisi!', 'error'); return; }
    let missingStatus = window.tempRocketValidated.some(x => !x.prioritas);
    if(missingStatus) { showToast('Semua Assy wajib dipilih Status/Prioritasnya!', 'error'); return; }

    let targetStwcFormatted = stwcInput.split('-').reverse().join('-');
    setLoaderState('Menyimpan...', 'Menyiapkan Data Rocket', 0, '');
    document.getElementById('loading-overlay').classList.remove('hidden');

    window.tempRocketValidated.forEach(r => {
        let existingIndex = globalAssyRocket.findIndex(x => x.assy === r.cleanAssy && x.wp === r.cleanWp && x.periode === r.periode);
        if(existingIndex !== -1) {
            globalAssyRocket[existingIndex].stwc = targetStwcFormatted;
            globalAssyRocket[existingIndex].prioritas = r.prioritas;
            globalAssyRocket[existingIndex].remarks = r.remarks || '';
        } else {
            globalAssyRocket.push({ id: Date.now()+Math.random(), assy: r.cleanAssy, wp: r.cleanWp, stwc: targetStwcFormatted, periode: r.periode, prioritas: r.prioritas, remarks: r.remarks || '', created: getTodayDateStr() });
        }
    });

    await saveDB('assy_rocket', globalAssyRocket, (pct) => setLoaderState('Menyimpan...', 'Upload Rocket ke Cloud', pct, 'Tahap 1 dari 2'));
    await recalculateValidation(true); 
    renderRocketTable();
    closeRocketModal();
    document.getElementById('loading-overlay').classList.add('hidden');
    showToast('Assy Rocket berhasil ditetapkan!', 'success');
}

window.triggerDeleteRocket = function(id) { requireAccess(['110603', '010625', '111111'], () => { promptCaptchaDelete('ROCKET', id); }); };
window.executeDeleteRocket = async function(id) {
    if(!confirm("Yakin ingin mencabut status Rocket dari Assy ini?")) return;
    globalAssyRocket = globalAssyRocket.filter(r => String(r.id) !== String(id));
    setLoaderState('Menghapus...', 'Update Database Cloud', 50, '');
    document.getElementById('loading-overlay').classList.remove('hidden');
    await saveDB('assy_rocket', globalAssyRocket);
    renderRocketTable();
    if(!document.getElementById('view-overview').classList.contains('hidden')) renderOverviewDashboard();
    if(!document.getElementById('view-control').classList.contains('hidden')) renderControlOutstanding();
    document.getElementById('loading-overlay').classList.add('hidden');
    showToast('Status Rocket berhasil dihapus', 'success');
}

window.renderRocketTable = function() {
    let html = '';
    let filterVal = document.getElementById('filter-rocket-status').value;
    let filterWip = document.getElementById('filter-rocket-wip') ? document.getElementById('filter-rocket-wip').value : 'ALL';
    let activeRocket = globalAssyRocket;
    
    if(filterVal !== 'ALL') activeRocket = activeRocket.filter(r => r.prioritas === filterVal);
    if (filterWip !== 'ALL') {
        activeRocket = activeRocket.filter(r => {
            let mMatch = globalMasterData.find(m => superCleanAssy(m.ASSY) === r.assy && superCleanAssy(m.WP) === r.wp && m.PERIODE === r.periode);
            let statusWip = mMatch ? mMatch._status : 'UNKNOWN';
            if (filterWip === 'CLOSED' && statusWip !== 'CLOSED') return false;
            if (filterWip === 'OPEN' && statusWip === 'CLOSED') return false;
            return true;
        });
    }

    if(activeRocket.length === 0) {
        html = '<tr><td colspan="9" class="text-center p-8 text-gray-400 font-medium">Data kosong.</td></tr>';
    } else {
        let sorted = [...activeRocket].sort((a,b) => parseIndoDate(a.stwc) - parseIndoDate(b.stwc));
        sorted.forEach(r => {
            let mMatch = globalMasterData.find(m => superCleanAssy(m.ASSY) === r.assy && superCleanAssy(m.WP) === r.wp && m.PERIODE === r.periode);
            let dbQty = 0; let statusWip = 'UNKNOWN'; let isClosed = false;
            let dispAssy = r.assy; let dispWp = r.wp;
            if(mMatch) { dbQty = mMatch.QTY || 0; statusWip = mMatch._status; isClosed = statusWip === 'CLOSED'; dispAssy = mMatch.ASSY; dispWp = mMatch.WP; }
            
            let bgRow = isClosed ? 'bg-gray-50 opacity-60' : 'hover:bg-pink-50';
            let statBadge = isClosed ? '<span class="text-[9px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">CLOSED</span>' : `<span class="text-[9px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">${statusWip}</span>`;
            let prioritasColor = r.prioritas === 'Rocket' ? 'bg-pink-100 text-pink-700 border-pink-200' :
                                 r.prioritas === 'Top Urgent' ? 'bg-orange-100 text-orange-700 border-orange-200' :
                                 'bg-amber-100 text-amber-700 border-amber-200';
            let prioritasBadge = `<span class="text-[9px] font-bold ${prioritasColor} border px-2 py-0.5 rounded shadow-sm">${r.prioritas || 'Urgent'}</span>`;

            html += `
            <tr class="border-b border-gray-100 transition ${bgRow}">
                <td class="p-2 text-center align-middle"><button onclick="requireAccess(['110603', '010625', '111111'], () => executeDeleteRocket('${r.id}'))" class="text-gray-400 hover:text-red-600 bg-white border px-2 py-1 rounded shadow-sm"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button></td>
                <td class="p-2 text-center align-middle">${prioritasBadge}</td>
                <td class="p-2 text-center text-pink-700 font-black align-middle"><i data-lucide="rocket" class="w-3 h-3 inline mr-1"></i> ${r.stwc}</td>
                <td class="p-2 text-center font-bold text-gray-600 align-middle">${r.periode}</td>
                <td class="p-2 font-black text-gray-800 align-middle">${dispAssy}</td>
                <td class="p-2 text-center font-mono text-gray-600 align-middle">${dispWp}</td>
                <td class="p-2 text-right font-bold text-indigo-700 align-middle">${dbQty}</td>
                <td class="p-2 text-center align-middle">${statBadge}</td>
                <td class="p-2 text-[9px] text-gray-600 align-middle max-w-[150px] truncate" title="${r.remarks || ''}">${r.remarks || '-'}</td>
            </tr>`;
        });
    }
    safeSetHTML('rocket-table-body', html);
    lucide.createIcons();
}

// ==========================================
// PAYLATER LOGIC ENGINE (INPUT, BATCH DORONG, MODALS)
// ==========================================
window.tempPaylaterValidated = [];
window.tempPaylaterDorongValidated = [];
window.paylaterSelectMode = 'INPUT';

window.openPaylaterModal = function() {
    document.getElementById('py-scanout-input').value = getTodayDateStr();
    document.getElementById('py-manual-input').value = '';
    safeSetHTML('py-validation-tbody', '<tr><td colspan="7" class="text-center p-8 text-gray-400 font-medium">Input list Assy + WP, atau Select Assy, lalu klik Validasi.</td></tr>');
    safeSetText('py-validation-summary', 'Total Validasi: 0 Assy');
    window.tempPaylaterValidated = [];
    document.getElementById('paylater-input-modal').classList.remove('hidden');
}
window.closePaylaterModal = function() { document.getElementById('paylater-input-modal').classList.add('hidden'); }

window.validatePaylaterData = function() {
    let manualInput = document.getElementById('py-manual-input').value;
    let lines = manualInput.split(/[\n]+/).filter(l => l.trim() !== '');
    if(lines.length === 0) { showToast('List kosong!', 'warning'); return; }

    let pairs = lines.map(l => {
        let tokens = l.trim().split(/\s+/);
        if(tokens.length === 0) return null;
        
        let dateStr = null; let remarks = ""; let assyWpBlock = "";
        
        // Cek Token 1: Apakah Format Tanggal Regist? (YYYY-MM-DD atau DD-MM-YYYY)
        if (tokens[0].match(/^(\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]\d{4})$/)) {
            let rawD = tokens.shift();
            // Normalisasi wajib ke YYYY-MM-DD untuk input box
            if (rawD.match(/^\d{2}[-/]/)) {
                let dp = rawD.split(/[-/]/);
                dateStr = `${dp[2]}-${dp[1]}-${dp[0]}`;
            } else {
                dateStr = rawD.replace(/\//g, '-');
            }
        }
        
        if (tokens.length === 0) return null;
        assyWpBlock = tokens.shift(); // Sisa utama: AssyWPGabung (Tanpa spasi)
        
        if (tokens.length > 0) remarks = tokens.join(" ");
        if (assyWpBlock.length <= 5) return null; // Mencegah error potong
        
        let w = superCleanAssy(assyWpBlock.slice(-5));
        let a = superCleanAssy(assyWpBlock.slice(0, -5));
        
        return { a: a, w: w, date: dateStr, remarks: remarks };
    }).filter(p => p !== null);

    window.tempPaylaterValidated = [];
    pairs.forEach(p => {
        let matches = globalMasterData.filter(m => superCleanAssy(m.ASSY) === p.a && superCleanAssy(m.WP) === p.w);
        matches.forEach(m => {
            if(m._status !== 'CLOSED') return; 
            let qty = parseFloat(m['QTY'] || 0);
            if(!window.tempPaylaterValidated.some(x => x.uid === m._uid)) {
                window.tempPaylaterValidated.push({
                    uid: m._uid, periode: m.PERIODE, assy: m.ASSY, wp: m.WP, status: m._status, dbQty: qty, 
                    cleanAssy: p.a, cleanWp: p.w, remarks: p.remarks, scanoutDate: p.date
                });
            }
        });
    });

    document.getElementById('py-manual-input').value = '';
    renderPyValidationTable();
    
    if (pairs.length > 0 && window.tempPaylaterValidated.length === 0) {
        showToast('Assy tidak ditemukan atau belum berstatus CLOSED!', 'warning');
    } else if (window.tempPaylaterValidated.length > 0) {
        showToast(`Validasi sukses! ${window.tempPaylaterValidated.length} Assy ditemukan.`, 'success');
    }
};

window.renderPyValidationTable = function() {
    let html = '';
    if(window.tempPaylaterValidated.length === 0) {
        html = '<tr><td colspan="7" class="text-center p-8 text-gray-400 font-medium">Data kosong.</td></tr>';
    } else {
        window.tempPaylaterValidated.forEach((d, i) => {
            let btn = `<button onclick="removePaylaterTemp('${d.uid}')" class="text-gray-400 hover:text-red-600 bg-white border px-2 py-1 rounded shadow-sm"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>`;
            let dateHtml = `<input type="date" value="${d.scanoutDate || ''}" onchange="updateTempPaylaterDate(${i}, this.value)" class="w-full text-xs border border-gray-300 rounded px-2 py-1.5 outline-none focus:border-purple-500 bg-white shadow-inner text-gray-700 font-bold cursor-pointer">`;
            let remarkHtml = `<input type="text" placeholder="Remarks/Alasan..." value="${d.remarks || ''}" onchange="updateTempPaylaterRemarks(${i}, this.value)" class="w-full text-xs border border-gray-300 rounded px-2 py-1.5 outline-none focus:border-purple-500 bg-white font-medium">`;
            html += `
            <tr class="border-b border-gray-100 hover:bg-purple-50 transition">
                <td class="p-2 text-center align-middle">${btn}</td>
                <td class="p-2 font-bold text-gray-800 text-center align-middle">${d.periode}</td>
                <td class="p-2 font-black text-gray-800 align-middle">${d.assy}</td>
                <td class="p-2 text-center text-gray-500 font-mono align-middle">${d.wp}</td>
                <td class="p-2 text-center text-indigo-600 font-bold align-middle">${d.dbQty}</td>
                <td class="p-2 text-center align-middle">${dateHtml}</td>
                <td class="p-2 text-center align-middle">${remarkHtml}</td>
            </tr>`;
        });
    }
    safeSetHTML('py-validation-tbody', html);
    safeSetText('py-validation-summary', `Total Validasi: ${window.tempPaylaterValidated.length} Assy`);
    lucide.createIcons();
}

window.removePaylaterTemp = function(uid) { window.tempPaylaterValidated = window.tempPaylaterValidated.filter(x => x.uid !== uid); renderPyValidationTable(); }
window.updateTempPaylaterRemarks = function(index, val) { if(window.tempPaylaterValidated[index]) window.tempPaylaterValidated[index].remarks = val; }
window.updateTempPaylaterDate = function(index, val) { if(window.tempPaylaterValidated[index]) window.tempPaylaterValidated[index].scanoutDate = val; }

window.savePaylaterData = async function() {
    if(window.tempPaylaterValidated.length === 0) { showToast('Tidak ada data valid', 'warning'); return; }
    let defaultScanout = document.getElementById('py-scanout-input').value;
    
    setLoaderState('Menyimpan...', 'Menyiapkan Data Paylater', 0, '');
    document.getElementById('loading-overlay').classList.remove('hidden');
    window.tempPaylaterValidated.forEach(r => {
        let finalDate = r.scanoutDate || defaultScanout;
        let existing = globalAssyPaylater.find(x => x.uid === r.uid && x.dorongDate === null);
        if(existing) {
            existing.scanoutDate = finalDate; existing.remarks = r.remarks;
        } else {
            globalAssyPaylater.push({
                id: Date.now() + Math.random(), uid: r.uid, assy: r.cleanAssy, wp: r.cleanWp, periode: r.periode,
                scanoutDate: finalDate, dorongDate: null, dorongBy: null, remarks: r.remarks || '', inputter: activeUserPin ? AUTH_PROFILES[activeUserPin] : 'Sistem'
            });
        }
    });
    await saveDB('assy_paylater', globalAssyPaylater, (pct) => setLoaderState('Menyimpan...', 'Upload ke Cloud', pct, 'Tahap 1 dari 1'));
    renderPaylaterTable(); closePaylaterModal();
    if(!document.getElementById('view-overview').classList.contains('hidden')) renderOverviewDashboard();
    if(!document.getElementById('view-control').classList.contains('hidden')) renderControlOutstanding();
    
    document.getElementById('loading-overlay').classList.add('hidden');
    showToast('Assy Paylater berhasil ditetapkan!', 'success');
}

window.renderPaylaterTable = function() {
    let html = '';
    let filterWip = document.getElementById('filter-paylater-wip') ? document.getElementById('filter-paylater-wip').value : 'ALL';
    let filterPer = document.getElementById('filter-py-periode') ? document.getElementById('filter-py-periode').value.toUpperCase() : '';
    let filterAssy = document.getElementById('filter-py-assy') ? document.getElementById('filter-py-assy').value.toUpperCase() : '';
    let filterWp = document.getElementById('filter-py-wp') ? document.getElementById('filter-py-wp').value.toUpperCase() : '';

    let countOpen = globalAssyPaylater.filter(r => r.dorongDate === null).length;
    let countClosed = globalAssyPaylater.filter(r => r.dorongDate !== null).length;
    safeSetText('py-count-open', `Belum Dorong: ${countOpen}`);
    safeSetText('py-count-closed', `Sudah Dorong: ${countClosed}`);

    let activePy = globalAssyPaylater;
    if (filterWip === 'OPEN') activePy = activePy.filter(r => r.dorongDate === null);
    if (filterWip === 'CLOSED') activePy = activePy.filter(r => r.dorongDate !== null);
    if (filterPer) activePy = activePy.filter(r => (r.periode || '').toUpperCase().includes(filterPer));
    if (filterAssy) activePy = activePy.filter(r => (r.assy || '').toUpperCase().includes(filterAssy));
    if (filterWp) activePy = activePy.filter(r => (r.wp || '').toUpperCase().includes(filterWp));

    if(activePy.length === 0) {
        html = '<tr><td colspan="10" class="text-center p-8 text-gray-400 font-medium">Data kosong / Tidak ada yang cocok dengan filter.</td></tr>';
    } else {
        let sorted = [...activePy].sort((a,b) => {
            if (a.dorongDate === null && b.dorongDate !== null) return -1;
            if (a.dorongDate !== null && b.dorongDate === null) return 1;
            return parseIndoDate(b.scanoutDate.split('-').reverse().join('-')) - parseIndoDate(a.scanoutDate.split('-').reverse().join('-'));
        });
        
        sorted.forEach(r => {
            let mMatch = globalMasterData.find(m => m._uid === r.uid);
            let dbQty = 0; let dispAssy = r.assy; let dispWp = r.wp;
            if(mMatch) { dbQty = mMatch.QTY || 0; dispAssy = mMatch.ASSY; dispWp = mMatch.WP; }
            
            let bgRow = r.dorongDate !== null ? 'bg-gray-50 opacity-80' : 'hover:bg-purple-50 transition border-b border-gray-100';
            let statusPy = r.dorongDate !== null ? `<span class="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-bold shadow-sm border border-emerald-200">DORONG</span>` : `<span class="bg-purple-200 text-purple-800 px-2 py-0.5 rounded font-bold shadow-sm border border-purple-300 animate-pulse">BELUM DORONG</span>`;

            let chatLogHtml = '';
            if (r.remarksLog && r.remarksLog.length > 0) {
                let lastChat = r.remarksLog[r.remarksLog.length - 1];
                chatLogHtml = `<div class="font-bold text-purple-700 leading-tight">${lastChat.sender}:</div><div class="truncate w-full text-gray-600">${lastChat.message}</div>`;
                if (r.remarksLog.length > 1) {
                    chatLogHtml += `<div class="text-[8px] text-purple-500 mt-0.5 font-bold">+ ${r.remarksLog.length - 1} balasan lainnya</div>`;
                }
            } else if (r.remarks) {
                chatLogHtml = `<div class="truncate w-full text-gray-600">${r.remarks}</div>`; 
            } else {
                chatLogHtml = '<span class="text-gray-400 italic">Belum ada catatan</span>';
            }

            html += `
            <tr class="${bgRow} cursor-pointer" onclick="openPaylaterDetailModal('${r.id}')" title="Klik baris ini untuk memunculkan aksi / detail">
                <td class="p-2 text-center align-middle">${statusPy}</td>
                <td class="p-2 text-center font-bold text-gray-700 align-middle">${r.scanoutDate}</td>
                <td class="p-2 text-center font-bold ${r.dorongDate ? 'text-emerald-700' : 'text-gray-400'} align-middle">${r.dorongDate || '-'}</td>
                <td class="p-2 text-center font-bold text-gray-600 align-middle">${r.periode}</td>
                <td class="p-2 font-black text-gray-800 align-middle">${dispAssy}</td>
                <td class="p-2 text-center font-mono text-gray-600 align-middle">${dispWp}</td>
                <td class="p-2 text-right font-bold text-indigo-700 align-middle">${dbQty}</td>
                <td class="p-2 text-[9px] align-middle max-w-[200px] overflow-hidden leading-tight">${chatLogHtml}</td>
                <td class="p-2 text-center align-middle"><span class="bg-gray-100 text-gray-600 border border-gray-200 px-2 py-0.5 rounded font-bold text-[8px] whitespace-nowrap"><i data-lucide="user" class="w-3 h-3 inline mr-0.5"></i> ${r.inputter}</span></td>
                <td class="p-2 text-center align-middle"><span class="bg-gray-100 text-gray-600 border border-gray-200 px-2 py-0.5 rounded font-bold text-[8px] whitespace-nowrap"><i data-lucide="user-check" class="w-3 h-3 inline mr-0.5"></i> ${r.dorongBy || '-'}</span></td>
            </tr>`;
        });
    }
    safeSetHTML('paylater-table-body', html);
    lucide.createIcons();
}

window.openBatchDorongModal = function() {
    document.getElementById('py-dorong-date-input').value = getTodayDateStr();
    document.getElementById('py-dorong-manual-input').value = '';
    safeSetHTML('py-dorong-tbody', '<tr><td colspan="5" class="text-center p-8 text-gray-400 font-medium">Input list Assy + WP, atau Select Assy, lalu klik Validasi.</td></tr>');
    window.tempPaylaterDorongValidated = [];
    document.getElementById('paylater-dorong-modal').classList.remove('hidden');
}
window.closeBatchDorongModal = function() { document.getElementById('paylater-dorong-modal').classList.add('hidden'); }

window.validateBatchDorong = function() {
    let manualInput = document.getElementById('py-dorong-manual-input').value;
    let lines = manualInput.split(/[\n]+/).filter(l => l.trim() !== '');
    if(lines.length === 0) { showToast('List kosong!', 'warning'); return; }

    let pairs = lines.map(l => {
        let tokens = l.trim().split(/\s+/);
        if(tokens.length === 0) return null;
        
        let dateStr = null; let remarks = ""; let assyWpBlock = tokens.shift(); 
        
        // Cek Token 2 (Setelah Assy): Apakah Format Tanggal Dorong?
        if (tokens.length > 0 && tokens[0].match(/^(\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]\d{4})$/)) {
            let rawD = tokens.shift();
            // Normalisasi wajib ke YYYY-MM-DD untuk input box
            if (rawD.match(/^\d{2}[-/]/)) {
                let dp = rawD.split(/[-/]/);
                dateStr = `${dp[2]}-${dp[1]}-${dp[0]}`;
            } else {
                dateStr = rawD.replace(/\//g, '-');
            }
        }
        
        if (tokens.length > 0) remarks = tokens.join(" ");
        if (assyWpBlock.length <= 5) return null;
        
        let a = superCleanAssy(assyWpBlock.slice(0, -5));
        let w = superCleanAssy(assyWpBlock.slice(-5));
        
        return { a: a, w: w, date: dateStr, remarks: remarks };
    }).filter(p => p !== null);

    window.tempDorongValidated = [];
    pairs.forEach(p => {
        let activePyMatches = globalAssyPaylater.filter(py => py.assy === p.a && py.wp === p.w && py.dorongDate === null);
        activePyMatches.forEach(py => {
            if(!window.tempDorongValidated.some(x => x.id === py.id)) {
                window.tempDorongValidated.push({...py, _tempDorongDate: p.date, _tempRemarks: p.remarks});
            }
        });
    });

    document.getElementById('py-dorong-manual-input').value = '';
    
    if (pairs.length > 0 && window.tempDorongValidated.length === 0) {
        showToast('Assy Paylater Aktif (Belum Dorong) tidak ditemukan!', 'warning');
    } else if (window.tempDorongValidated.length > 0) {
        showToast(`Validasi sukses! ${window.tempDorongValidated.length} Assy siap didorong.`, 'success');
    }
    
    renderDorongValidationTable();
};

window.renderDorongValidationTable = function() {
    let html = '';
    if(window.tempDorongValidated.length === 0) {
        html = '<tr><td colspan="5" class="text-center p-8 text-gray-400 font-medium">Data kosong/Tidak ada Paylater aktif yang sesuai.</td></tr>';
    } else {
        window.tempDorongValidated.forEach((d, i) => {
            let dateVal = d._tempDorongDate || '';
            let dateHtml = `<input type="date" value="${dateVal}" onchange="updateTempDorongDate(${i}, this.value)" class="w-full text-[10px] border border-gray-300 rounded px-2 py-1 outline-none focus:border-emerald-500 bg-white">`;
            html += `
            <tr class="border-b border-gray-100 hover:bg-emerald-50 transition">
                <td class="p-2 text-center align-middle"><button onclick="removeBatchDorongTemp('${d.id}')" class="text-gray-400 hover:text-red-600 bg-white border px-2 py-1 rounded shadow-sm"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button></td>
                <td class="p-2 font-black text-gray-800 align-middle">${d.assy}</td>
                <td class="p-2 text-center font-mono text-gray-500 align-middle">${d.wp}</td>
                <td class="p-2 text-center text-gray-600 font-bold align-middle">${d.scanoutDate}</td>
                <td class="p-2 text-center align-middle">${dateHtml}</td>
            </tr>`;
        });
    }
    safeSetHTML('py-dorong-tbody', html);
    lucide.createIcons();
};

window.updateTempDorongDate = function(index, val) { 
    if(window.tempDorongValidated[index]) window.tempDorongValidated[index]._tempDorongDate = val; 
};

window.removeBatchDorongTemp = function(id) { 
    window.tempDorongValidated = window.tempDorongValidated.filter(x => String(x.id) !== String(id)); 
    renderDorongValidationTable(); 
};

window.saveBatchDorong = async function() {
    if(window.tempDorongValidated.length === 0) { showToast('Tidak ada data valid', 'warning'); return; }
    let defaultDorongDate = document.getElementById('py-dorong-date-input').value || getTodayDateStr();
    
    setLoaderState('Menyimpan...', 'Update Batch Dorong', 0, ''); 
    document.getElementById('loading-overlay').classList.remove('hidden');
    
    window.tempDorongValidated.forEach(r => {
        let finalDate = r._tempDorongDate || defaultDorongDate;
        let existing = globalAssyPaylater.find(x => x.id === r.id);
        if(existing) { 
            existing.dorongDate = finalDate; 
            existing.dorongBy = activeUserPin ? AUTH_PROFILES[activeUserPin] : 'Sistem'; 
            if(r._tempRemarks) existing.remarks = (existing.remarks || '') + " | " + r._tempRemarks;
        }
    });
    await saveDB('assy_paylater', globalAssyPaylater, (pct) => setLoaderState('Menyimpan...', 'Upload ke Cloud', pct, 'Tahap 1 dari 1'));
    
    await recalculateValidation(true);
    renderPaylaterTable(); 
    closeBatchDorongModal();
    
    if(!document.getElementById('view-overview').classList.contains('hidden')) renderOverviewDashboard();
    if(!document.getElementById('view-control').classList.contains('hidden')) renderControlOutstanding();
    
    document.getElementById('loading-overlay').classList.add('hidden');
    showToast('Batch Dorong berhasil ditetapkan!', 'success');
};

window.openPaylaterDetailModal = function(id) {
    let py = globalAssyPaylater.find(x => String(x.id) === String(id));
    if(!py) return;

    let mMatch = globalMasterData.find(m => m._uid === py.uid);
    let dispAssy = mMatch ? mMatch.ASSY : py.assy;
    let dispWp = mMatch ? mMatch.WP : py.wp;

    let isDorong = py.dorongDate !== null;
    let statusBadge = isDorong ? `<span class="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-lg font-black border border-emerald-200 text-sm">DORONG (${py.dorongDate})</span>` : `<span class="bg-purple-100 text-purple-700 px-3 py-1 rounded-lg font-black border border-purple-200 animate-pulse text-sm">BELUM DORONG</span>`;
    
    let btnActions = '';
    if (isDorong) {
        btnActions = `<button onclick="requireAccess(['110603', '111111'], () => undoDorongSingle('${py.id}'))" class="bg-amber-100 hover:bg-amber-200 text-amber-700 px-4 py-2 rounded-lg font-bold text-xs transition shadow-sm border border-amber-200 flex items-center gap-1.5"><i data-lucide="rotate-ccw" class="w-4 h-4"></i> Batalkan Dorong</button>`;
    } else {
        btnActions = `<button onclick="requireAccess(['110603', '050205', '010625', '111111'], () => executeDorongSingle('${py.id}'))" class="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-lg font-bold text-xs transition shadow-md flex items-center gap-2"><i data-lucide="check-square" class="w-4 h-4"></i> Konfirmasi Dorong</button>`;
    }

    let chatHistoryHtml = '';
    let logs = py.remarksLog || [];
    if (logs.length === 0 && py.remarks) {
        logs = [{ sender: py.inputter || 'Sistem', message: py.remarks, time: py.scanoutDate }];
    }

    if (logs.length === 0) {
        chatHistoryHtml = '<div class="text-center text-xs text-gray-400 italic py-4">Belum ada catatan tambahan.</div>';
    } else {
        logs.forEach(log => {
            let isMe = activeUserPin && AUTH_PROFILES[activeUserPin] === log.sender;
            let alignClass = isMe ? 'items-end' : 'items-start';
            let bgClass = isMe ? 'bg-purple-100 border-purple-200' : 'bg-white border-gray-200';
            let nameColor = isMe ? 'text-purple-700' : 'text-gray-700';

            chatHistoryHtml += `
            <div class="flex flex-col ${alignClass} mb-3 w-full">
                <span class="text-[9px] font-black ${nameColor} mb-0.5 px-1">${log.sender} <span class="font-normal text-gray-400 ml-1">${log.time || ''}</span></span>
                <div class="${bgClass} border px-3 py-2 rounded-xl text-xs text-gray-800 max-w-[85%] whitespace-pre-wrap shadow-sm">${log.message}</div>
            </div>`;
        });
    }

    let chatInputHtml = '';
    if (activeUserPin) {
        chatInputHtml = `
            <input type="text" id="py-reply-input" placeholder="Tambahkan remarks/catatan..." class="flex-1 text-xs border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-purple-500 shadow-inner" onkeydown="if(event.key === 'Enter') sendPaylaterReply('${py.id}')">
            <button onclick="sendPaylaterReply('${py.id}')" class="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-sm"><i data-lucide="send" class="w-3 h-3"></i> Kirim</button>
        `;
    } else {
        chatInputHtml = `<button onclick="requireAccess(['110603', '050205', '010625', '111111'], () => openPaylaterDetailModal('${py.id}'))" class="w-full bg-gray-100 hover:bg-gray-200 text-gray-500 border border-gray-300 border-dashed px-4 py-2.5 rounded-lg text-[10px] uppercase tracking-wider font-bold transition flex items-center justify-center gap-2"><i data-lucide="lock" class="w-3.5 h-3.5 text-gray-400"></i> Login (Gembok) untuk Menambah Remarks</button>`;
    }

    let html = `
        <div class="flex justify-between items-start mb-6">
            <div>
                <h2 class="text-2xl font-black text-gray-800">${dispAssy}</h2>
                <p class="text-sm font-bold text-gray-500 mt-1">Periode: ${py.periode} <span class="mx-2">|</span> WP: <span class="text-indigo-600 font-mono">${dispWp}</span></p>
            </div>
            ${statusBadge}
        </div>

        <div class="grid grid-cols-2 gap-4 mb-6">
            <div class="bg-gray-50 p-4 rounded-xl border border-gray-200">
                <span class="text-[10px] uppercase font-bold text-gray-400 block mb-1">Tanggal Scanout Awal</span>
                <strong class="text-sm text-gray-800">${py.scanoutDate}</strong>
            </div>
            <div class="bg-gray-50 p-4 rounded-xl border border-gray-200">
                <span class="text-[10px] uppercase font-bold text-gray-400 block mb-1">Tanggal Aktual Dorong</span>
                <strong class="text-sm text-gray-800">${py.dorongDate || '-'}</strong>
            </div>
            <div class="bg-blue-50 p-4 rounded-xl border border-blue-200">
                <span class="text-[10px] uppercase font-bold text-blue-600 block mb-1">PIC Input</span>
                <strong class="text-xs text-blue-900 flex items-center gap-1.5"><i data-lucide="user" class="w-3.5 h-3.5"></i> ${py.inputter}</strong>
            </div>
            <div class="bg-emerald-50 p-4 rounded-xl border border-emerald-200">
                <span class="text-[10px] uppercase font-bold text-emerald-600 block mb-1">PIC Dorong</span>
                <strong class="text-xs text-emerald-900 flex items-center gap-1.5"><i data-lucide="user-check" class="w-3.5 h-3.5"></i> ${py.dorongBy || '-'}</strong>
            </div>
        </div>

        <div class="mb-6">
            <span class="text-[10px] uppercase font-bold text-purple-600 flex items-center gap-1 mb-2"><i data-lucide="messages-square" class="w-3.5 h-3.5"></i> Log Interaksi & Remarks Paylater</span>
            <div class="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm flex flex-col">
                <div class="p-4 max-h-56 overflow-y-auto bg-gray-50/50 flex flex-col" id="py-detail-chat-box">
                    ${chatHistoryHtml}
                </div>
                <div class="p-2 border-t border-gray-200 bg-white flex gap-2 w-full" id="py-detail-chat-input-area">
                    ${chatInputHtml}
                </div>
            </div>
        </div>

        <div class="flex justify-between items-center pt-5 mt-2 border-t border-gray-200 w-full">
            <div>
                <button onclick="requireAccess(['110603', '111111'], () => executeDeletePaylater('${py.id}'))" class="text-gray-400 hover:text-red-600 bg-transparent hover:bg-red-50 px-3 py-2 rounded-lg font-bold text-[10px] transition-colors flex items-center gap-1.5 border border-transparent hover:border-red-200" title="Hapus permanen">
                    <i data-lucide="trash-2" class="w-4 h-4"></i> Hapus
                </button>
            </div>
            <div class="flex items-center gap-3">
                <button onclick="closePaylaterDetailModal()" class="text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-5 py-2.5 rounded-lg font-bold text-xs transition shadow-sm border border-gray-200">Tutup</button>
                ${btnActions}
            </div>
        </div>
    `;
    document.getElementById('paylater-detail-content').innerHTML = html;
    lucide.createIcons();
    document.getElementById('paylater-detail-modal').classList.remove('hidden');
    setTimeout(() => { let cb = document.getElementById('py-detail-chat-box'); if(cb) cb.scrollTop = cb.scrollHeight; }, 50);
}
window.closePaylaterDetailModal = function() { document.getElementById('paylater-detail-modal').classList.add('hidden'); }

window.sendPaylaterReply = async function(id) {
    let inputEl = document.getElementById('py-reply-input');
    let msg = inputEl.value.trim();
    if (!msg) return;

    if (!activeUserPin) {
        showToast("Silakan klik Gembok Kunci/Login terlebih dahulu.", "warning"); return;
    }

    let senderName = AUTH_PROFILES[activeUserPin] || 'Unknown';
    let item = globalAssyPaylater.find(x => String(x.id) === String(id));
    
    if (item) {
        if (!item.remarksLog) item.remarksLog = [];
        if (item.remarksLog.length === 0 && item.remarks) {
            item.remarksLog.push({ sender: item.inputter || 'Sistem', message: item.remarks, time: item.scanoutDate });
            item.remarks = ''; 
        }
        
        let now = new Date();
        let timeStr = now.toLocaleDateString('id-ID', {day:'numeric', month:'short'}) + ' ' + now.toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'});
        
        let newLog = { sender: senderName, message: msg, time: timeStr };
        item.remarksLog.push(newLog);
        
        let chatBox = document.getElementById('py-detail-chat-box');
        if (chatBox) {
            let emptyMsg = chatBox.querySelector('.text-center.italic');
            if (emptyMsg) emptyMsg.remove();
            
            let tempId = `temp-chat-py-${now.getTime()}`;
            let bubbleHtml = `
            <div class="flex flex-col items-end mb-3 w-full animate-pulse" id="${tempId}">
                <span class="text-[9px] font-black text-purple-700 mb-0.5 px-1">${newLog.sender} <span class="font-normal text-amber-500 ml-1">Mengirim... <i data-lucide="loader-2" class="w-3 h-3 inline animate-spin"></i></span></span>
                <div class="bg-purple-100 border-purple-200 border px-3 py-2 rounded-xl text-xs text-gray-800 max-w-[85%] whitespace-pre-wrap shadow-sm">${newLog.message}</div>
            </div>`;
            
            chatBox.insertAdjacentHTML('beforeend', bubbleHtml);
            chatBox.scrollTop = chatBox.scrollHeight;
            lucide.createIcons();
        }
        
        inputEl.value = '';
        inputEl.disabled = true;

        try {
            await saveDB('assy_paylater', globalAssyPaylater);
            openPaylaterDetailModal(id);
            renderPaylaterTable();
        } catch(e) {
            showToast('Koneksi terputus! Gagal mengirim pesan.', 'error');
            inputEl.disabled = false;
            item.remarksLog.pop(); 
            let tempBubble = document.getElementById(`temp-chat-py-${now.getTime()}`);
            if(tempBubble) tempBubble.remove();
        }
    }
};

window.executeDorongSingle = async function(id) {
    let item = globalAssyPaylater.find(x => String(x.id) === String(id));
    if(!item) return;
    let dateStr = prompt("Tanggal Aktual Dorong / Serah Terima (YYYY-MM-DD):", getTodayDateStr());
    if(dateStr) {
        item.dorongDate = dateStr; item.dorongBy = activeUserPin ? AUTH_PROFILES[activeUserPin] : 'Sistem';
        await saveDB('assy_paylater', globalAssyPaylater); renderPaylaterTable();
        if(!document.getElementById('view-overview').classList.contains('hidden')) renderOverviewDashboard();
        if(!document.getElementById('view-control').classList.contains('hidden')) renderControlOutstanding();
        closePaylaterDetailModal();
        showToast('Status Paylater berhasil diubah menjadi Dorong!', 'success');
    }
}
window.undoDorongSingle = async function(id) {
    let item = globalAssyPaylater.find(x => String(x.id) === String(id));
    if(!item) return;
    if(confirm("Batalkan status Dorong pada Assy ini?")) {
        item.dorongDate = null; item.dorongBy = null;
        await saveDB('assy_paylater', globalAssyPaylater); renderPaylaterTable();
        if(!document.getElementById('view-overview').classList.contains('hidden')) renderOverviewDashboard();
        if(!document.getElementById('view-control').classList.contains('hidden')) renderControlOutstanding();
        closePaylaterDetailModal();
        showToast('Status Dorong dibatalkan.', 'info');
    }
}
window.executeDeletePaylater = async function(id) {
    if(!confirm("Yakin hapus data riwayat Paylater ini secara permanen?")) return;
    globalAssyPaylater = globalAssyPaylater.filter(x => String(x.id) !== String(id));
    await saveDB('assy_paylater', globalAssyPaylater); renderPaylaterTable();
    if(!document.getElementById('view-overview').classList.contains('hidden')) renderOverviewDashboard();
    if(!document.getElementById('view-control').classList.contains('hidden')) renderControlOutstanding();
    closePaylaterDetailModal();
    showToast('Data Paylater dihapus.', 'success');
}

window.openPaylaterSelectModal = function(mode) {
    window.paylaterSelectMode = mode;
    document.getElementById('py-search-assy').value = '';
    document.getElementById('py-search-wp').value = '';
    
    let html = '';
    if (mode === 'INPUT') {
        let validMaster = globalMasterData.filter(m => m._status === 'CLOSED');
        validMaster.sort((a,b) => parseIndoDate(b._closedDate || b.STWC) - parseIndoDate(a._closedDate || a.STWC));

        validMaster.forEach(m => {
            let isSelected = window.tempPaylaterValidated.some(x => x.uid === m._uid);
            let btn = isSelected ? 
                `<button disabled class="bg-gray-100 text-gray-400 border border-gray-200 px-3 py-1 rounded text-[9px] font-bold shadow-sm cursor-not-allowed">Selected</button>` : 
                `<button onclick="selectAssyForPaylater('${m._uid}', this)" class="bg-white hover:bg-indigo-600 text-indigo-600 hover:text-white border border-indigo-200 px-3 py-1 rounded text-[9px] font-bold transition shadow-sm">Select</button>`;

            html += `
            <tr class="py-rs-row hover:bg-indigo-50 transition border-b border-gray-100">
                <td class="p-2 text-center align-middle"><span class="bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded font-bold shadow-sm text-[9px]">CLOSED</span></td>
                <td class="p-2 font-bold text-gray-800 align-middle py-rs-assy">${m.ASSY||'-'}</td>
                <td class="p-2 text-center font-mono text-gray-500 align-middle py-rs-wp">${m.WP||'-'}</td>
                <td class="p-2 text-center align-middle">${btn}</td>
            </tr>`;
        });
        if(validMaster.length === 0) html = '<tr><td colspan="4" class="text-center p-6 text-gray-400">Tidak ada Assy CLOSED.</td></tr>';
    } else {
        let activePy = globalAssyPaylater.filter(py => py.dorongDate === null);
        activePy.sort((a,b) => parseIndoDate(b.scanoutDate) - parseIndoDate(a.scanoutDate));

        activePy.forEach(py => {
            let isSelected = window.tempPaylaterDorongValidated.some(x => x.id === py.id);
            let btn = isSelected ? 
                `<button disabled class="bg-gray-100 text-gray-400 border border-gray-200 px-3 py-1 rounded text-[9px] font-bold shadow-sm cursor-not-allowed">Selected</button>` : 
                `<button onclick="selectAssyForPaylaterDorong('${py.id}', this)" class="bg-white hover:bg-emerald-600 text-emerald-600 hover:text-white border border-emerald-200 px-3 py-1 rounded text-[9px] font-bold transition shadow-sm">Select</button>`;

            html += `
            <tr class="py-rs-row hover:bg-emerald-50 transition border-b border-gray-100">
                <td class="p-2 text-center align-middle"><span class="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-bold shadow-sm text-[9px] animate-pulse">BELUM DORONG</span></td>
                <td class="p-2 font-bold text-gray-800 align-middle py-rs-assy">${py.assy||'-'}</td>
                <td class="p-2 text-center font-mono text-gray-500 align-middle py-rs-wp">${py.wp||'-'}</td>
                <td class="p-2 text-center align-middle">${btn}</td>
            </tr>`;
        });
        if(activePy.length === 0) html = '<tr><td colspan="4" class="text-center p-6 text-gray-400">Tidak ada Paylater Aktif.</td></tr>';
    }

    document.getElementById('paylater-select-tbody').innerHTML = html;
    document.getElementById('paylater-select-modal').classList.remove('hidden');
}
window.closePaylaterSelectModal = function() { document.getElementById('paylater-select-modal').classList.add('hidden'); }

window.filterPaylaterSelect = function() {
    let filterAssy = document.getElementById('py-search-assy').value.toUpperCase();
    let filterWp = document.getElementById('py-search-wp').value.toUpperCase();
    let rows = document.querySelectorAll('.py-rs-row');
    
    rows.forEach(r => {
        let assy = (r.querySelector('.py-rs-assy').innerText || '').toUpperCase();
        let wp = (r.querySelector('.py-rs-wp').innerText || '').toUpperCase();
        if(assy.includes(filterAssy) && wp.includes(filterWp)) r.style.display = '';
        else r.style.display = 'none';
    });
}

window.selectAssyForPaylater = function(uid, btnEl) {
    let m = globalMasterData.find(x => x._uid === uid);
    if(m && !window.tempPaylaterValidated.some(x => x.uid === uid)) {
        let qty = parseFloat(m['QTY'] || 0);
        window.tempPaylaterValidated.push({
            uid: m._uid, periode: m.PERIODE, assy: m.ASSY, wp: m.WP, status: m._status, dbQty: qty,
            cleanAssy: superCleanAssy(m.ASSY), cleanWp: superCleanAssy(m.WP), remarks: '', scanoutDate: ''
        });
        
        if(btnEl) {
            btnEl.disabled = true;
            btnEl.className = "bg-gray-100 text-gray-400 border border-gray-200 px-3 py-1 rounded text-[9px] font-bold shadow-sm cursor-not-allowed";
            btnEl.innerText = "Selected";
        }
        
        renderPaylaterValidationTable();
        showToast(`${m.ASSY} ditambahkan ke List!`, 'success');
    }
}

window.selectAssyForPaylaterDorong = function(id, btnEl) {
    let py = globalAssyPaylater.find(x => String(x.id) === String(id));
    if(py && !window.tempPaylaterDorongValidated.some(x => x.id === id)) {
        window.tempPaylaterDorongValidated.push({...py, _tempDorongDate: ''});
        
        if(btnEl) {
            btnEl.disabled = true;
            btnEl.className = "bg-gray-100 text-gray-400 border border-gray-200 px-3 py-1 rounded text-[9px] font-bold shadow-sm cursor-not-allowed";
            btnEl.innerText = "Selected";
        }
        
        renderBatchDorongTable();
        showToast(`${py.assy} ditambahkan ke Dorong List!`, 'success');
    }
};

window.exportPaylaterToExcel = function() {
    let filterWip = document.getElementById('filter-paylater-wip') ? document.getElementById('filter-paylater-wip').value : 'ALL';
    let filterPer = document.getElementById('filter-py-periode') ? document.getElementById('filter-py-periode').value.toUpperCase() : '';
    let filterAssy = document.getElementById('filter-py-assy') ? document.getElementById('filter-py-assy').value.toUpperCase() : '';
    let filterWp = document.getElementById('filter-py-wp') ? document.getElementById('filter-py-wp').value.toUpperCase() : '';

    let activePy = globalAssyPaylater;
    if (filterWip === 'OPEN') activePy = activePy.filter(r => r.dorongDate === null);
    if (filterWip === 'CLOSED') activePy = activePy.filter(r => r.dorongDate !== null);
    if (filterPer) activePy = activePy.filter(r => (r.periode || '').toUpperCase().includes(filterPer));
    if (filterAssy) activePy = activePy.filter(r => (r.assy || '').toUpperCase().includes(filterAssy));
    if (filterWp) activePy = activePy.filter(r => (r.wp || '').toUpperCase().includes(filterWp));

    if(activePy.length === 0) { 
        showToast("Tidak ada data Paylater pada filter saat ini.", "warning"); return; 
    }

    setLoaderState('Menyiapkan Export...', 'Menyusun Data Assy Paylater', 50, '');
    document.getElementById('loading-overlay').classList.remove('hidden');

    setTimeout(() => {
        try {
            let wb = XLSX.utils.book_new();
            let sorted = [...activePy].sort((a,b) => {
                if (a.dorongDate === null && b.dorongDate !== null) return -1;
                if (a.dorongDate !== null && b.dorongDate === null) return 1;
                return parseIndoDate(b.scanoutDate.split('-').reverse().join('-')) - parseIndoDate(a.scanoutDate.split('-').reverse().join('-'));
            });

            let exportData = sorted.map(r => {
                let mMatch = globalMasterData.find(m => m._uid === r.uid);
                let dbQty = mMatch ? (mMatch.QTY || 0) : 0;
                let dispAssy = mMatch ? mMatch.ASSY : r.assy;
                let dispWp = mMatch ? mMatch.WP : r.wp;
                let statusPy = r.dorongDate !== null ? `DORONG (${r.dorongDate})` : 'BELUM DORONG (AKTIF)';
                
                let isDorong = r.dorongDate !== null;
                let endDate = isDorong ? new Date(r.dorongDate) : new Date();
                let startDate = new Date(r.scanoutDate);
                let diffTime = Math.abs(endDate - startDate);
                let dayCount = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                if(dayCount === 0) dayCount = 1;

                return {
                    "STATUS PAYLATER": statusPy,
                    "TERTAHAN (HARI)": dayCount,
                    "TGL REGIST / SCANOUT": r.scanoutDate || '-',
                    "TGL DORONG AKTUAL": r.dorongDate || '-',
                    "PERIODE": r.periode || '-',
                    "ASSY NO": dispAssy || '-',
                    "WP": dispWp || '-',
                    "QTY DB": dbQty,
                    "REMARKS / ALASAN": r.remarksLog ? r.remarksLog.map(l => `[${l.sender}]: ${l.message}`).join(' | ') : (r.remarks || '-'),
                    "PIC INPUT": r.inputter || '-',
                    "PIC DORONG": r.dorongBy || '-'
                };
            });

            let ws = XLSX.utils.json_to_sheet(exportData);
            XLSX.utils.book_append_sheet(wb, ws, "LIST_ASSY_PAYLATER");

            XLSX.writeFile(wb, `Daftar_Paylater_Filtered_${getTodayDateStr()}.xlsx`);
            document.getElementById('loading-overlay').classList.add('hidden');
            showToast("Data List Paylater berhasil di-export!", "success");
        } catch(e) {
            document.getElementById('loading-overlay').classList.add('hidden');
            showToast("Gagal mengekspor file Excel.", "error");
        }
    }, 500);
};
// ==========================================
// 10. TREND FIFO DAILY (CHART + HORIZONTAL 7-DAY-UPFRONT TABLE)
// ==========================================
let fifoDailyCachedSeries = [];
let fifoDailyObserversBound = false;

function formatDateKeyLocal(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function parseDateKeyLocal(dateKey) {
    if (!dateKey || typeof dateKey !== 'string') return null;
    const parts = dateKey.split('-');
    if (parts.length !== 3) return null;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
    return new Date(y, m - 1, d);
}

function buildContinuousDailySeries() {
    const todayStr = getTodayDateStr();
    const todayDate = parseDateKeyLocal(todayStr) || new Date();
    todayDate.setHours(0, 0, 0, 0);

    const historyMap = new Map();
    let earliestDate = new Date(todayDate);
    earliestDate.setDate(earliestDate.getDate() - 27); // Minimal 4 minggu (28 hari) agar bisa di-scroll ke minggu sebelumnya

    (dailyHistory || []).forEach(h => {
        if (!h || !h.dateKey) return;
        historyMap.set(h.dateKey, h);
        const dt = parseDateKeyLocal(h.dateKey);
        if (dt && dt < earliestDate) earliestDate = dt;
    });

    const series = [];
    const cursor = new Date(earliestDate);
    const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

    while (cursor <= todayDate) {
        const key = formatDateKeyLocal(cursor);
        const raw = historyMap.get(key);
        const isToday = key === todayStr;

        let pct = 0;
        let totalLoad = 0;
        let onSched = 0;
        let delay = 0;
        let sh = 0;
        let paylater = 0;
        let hasInput = false;

        if (raw) {
            hasInput = true;
            if (activeOverviewCat === 'ALL') {
                pct = Number(raw.pct || 0);
                totalLoad = Math.round(Number(raw.totalLoad || 0));
                onSched = Math.round(Number(raw.onSched || 0));
                delay = Math.round(Number(raw.delay || 0));
                sh = Math.round(Number(raw.sh || 0));
                paylater = Math.round(Number(raw.paylater || 0));
            } else {
                const cm = raw.catMetrics && raw.catMetrics[activeOverviewCat];
                if (cm) {
                    pct = Number(cm.pct || 0);
                    totalLoad = Math.round(Number(cm.totalLoad || 0));
                    onSched = Math.round(Number(cm.onSched || 0));
                    delay = Math.round(Number(cm.delay || 0));
                    sh = Math.round(Number(cm.sh || 0));
                    paylater = Math.round(Number(cm.paylater || 0));
                } else if (raw.catPct && raw.catPct[activeOverviewCat] !== undefined) {
                    pct = Number(raw.catPct[activeOverviewCat] || 0);
                }
            }
        }

        series.push({
            dateKey: key,
            dayName: dayNames[cursor.getDay()],
            dateShort: `${cursor.getDate()} ${monthNames[cursor.getMonth()]}`,
            year: cursor.getFullYear(),
            isToday,
            hasInput,
            pct: Number(pct.toFixed(1)),
            totalLoad,
            onSched,
            delay,
            sh,
            paylater
        });

        cursor.setDate(cursor.getDate() + 1);
    }

    return series;
}

function updateFifoDailyColWidth() {
    const scrollEl = document.getElementById('fifo-daily-table-scroll');
    if (!scrollEl) return 118;
    const stickyW = window.innerWidth < 640 ? 128 : 154;
    const available = Math.max(0, scrollEl.clientWidth - stickyW);
    const colW = available > 0 ? Math.max(94, Math.floor(available / 7)) : 118;
    scrollEl.style.setProperty('--fifo-sticky-w', stickyW + 'px');
    scrollEl.style.setProperty('--fifo-day-col-w', colW + 'px');
    return colW;
}

function updateFifoDailyRangeIndicator() {
    const scrollEl = document.getElementById('fifo-daily-table-scroll');
    const infoEl = document.getElementById('fifo-daily-range-info');
    if (!scrollEl || !infoEl || fifoDailyCachedSeries.length === 0) return;

    const colW = parseFloat(getComputedStyle(scrollEl).getPropertyValue('--fifo-day-col-w')) || 118;
    const stickyW = parseFloat(getComputedStyle(scrollEl).getPropertyValue('--fifo-sticky-w')) || 154;
    const visibleCols = Math.max(1, Math.round((scrollEl.clientWidth - stickyW) / colW));
    const startIdx = Math.max(0, Math.min(fifoDailyCachedSeries.length - 1, Math.round(scrollEl.scrollLeft / colW)));
    const endIdx = Math.max(startIdx, Math.min(fifoDailyCachedSeries.length - 1, startIdx + visibleCols - 1));

    const firstDay = fifoDailyCachedSeries[startIdx];
    const lastDay = fifoDailyCachedSeries[endIdx];
    if (firstDay && lastDay) {
        infoEl.textContent = `Rentang tampil: ${firstDay.dayName}, ${firstDay.dateShort} ${firstDay.year} — ${lastDay.dayName}, ${lastDay.dateShort} ${lastDay.year} (Total ${fifoDailyCachedSeries.length} hari tersedia, scroll ke kiri untuk minggu sebelumnya).`;
    }
}

function bindFifoDailyScrollEvents() {
    if (fifoDailyObserversBound) return;
    const scrollEl = document.getElementById('fifo-daily-table-scroll');
    if (!scrollEl) return;
    fifoDailyObserversBound = true;

    scrollEl.addEventListener('scroll', () => {
        updateFifoDailyRangeIndicator();
    }, { passive: true });

    if (typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => {
            if (window.activeOverviewSubTab === 'trend-daily') {
                updateFifoDailyColWidth();
                updateFifoDailyRangeIndicator();
            }
        });
        ro.observe(scrollEl);
    }
}

window.scrollFifoDailyTable = function(deltaDaysOrToday) {
    const scrollEl = document.getElementById('fifo-daily-table-scroll');
    if (!scrollEl) return;
    const colW = parseFloat(getComputedStyle(scrollEl).getPropertyValue('--fifo-day-col-w')) || 118;
    if (deltaDaysOrToday === 'today') {
        scrollEl.scrollTo({ left: scrollEl.scrollWidth, behavior: 'smooth' });
    } else {
        const delta = Number(deltaDaysOrToday) || 0;
        scrollEl.scrollBy({ left: delta * colW, behavior: 'smooth' });
    }
};

window.renderTrendFifoDaily = function(preserveScroll) {
    const ct = getActiveChartTheme();
    const series = buildContinuousDailySeries();
    fifoDailyCachedSeries = series;

    safeSetText('fifo-daily-title-cat', activeOverviewCat);
    safeSetText('fifo-daily-table-cat', activeOverviewCat);

    // 1. Sync dropdown bulan pada panel Trend FIFO Daily
    const monthFilterEl = document.getElementById('fifo-daily-month-filter');
    if (monthFilterEl) {
        const months = new Set();
        series.forEach(item => {
            if (item.dateKey) months.add(item.dateKey.substring(0, 7));
        });
        const isFirstLoad = !monthFilterEl.hasAttribute('data-init');
        const currentVal = monthFilterEl.value;
        const thisMonthStr = getTodayDateStr().substring(0, 7);
        const sortedMonths = Array.from(months).sort().reverse();

        let optHtml = `<option value="ALL">SEMUA WAKTU</option>`;
        sortedMonths.forEach(m => {
            const [yyyy, mm] = m.split('-');
            const mName = new Date(parseInt(yyyy, 10), parseInt(mm, 10) - 1, 1).toLocaleDateString('id-ID', { month: 'short', year: 'numeric' });
            optHtml += `<option value="${m}">${mName}</option>`;
        });
        monthFilterEl.innerHTML = optHtml;

        if (isFirstLoad) {
            monthFilterEl.value = months.has(thisMonthStr) ? thisMonthStr : (sortedMonths[0] || 'ALL');
            monthFilterEl.setAttribute('data-init', 'true');
        } else if (months.has(currentVal) || currentVal === 'ALL') {
            monthFilterEl.value = currentVal;
        }
    }

    const activeMonth = monthFilterEl ? monthFilterEl.value : 'ALL';
    const chartSeries = activeMonth === 'ALL'
        ? series
        : series.filter(item => item.dateKey.startsWith(activeMonth));

    const chartLabels = chartSeries.map(item => item.dateShort);
    const pctValues = chartSeries.map(item => Number(item.pct || 0));

    // Regresi linier hanya dari hari yang memiliki input agar garis tren akurat
    const nonEmptyPts = chartSeries
        .map((item, idx) => ({ idx, val: item.pct, hasInput: item.hasInput }))
        .filter(p => p.hasInput);
    const regSrc = nonEmptyPts.length > 1 ? nonEmptyPts : chartSeries.map((item, idx) => ({ idx, val: item.pct }));
    const rn = regSrc.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    regSrc.forEach(p => { sumX += p.idx; sumY += p.val; sumXY += p.idx * p.val; sumX2 += p.idx * p.idx; });
    const denom = (rn * sumX2 - sumX * sumX);
    const slope = (rn > 1 && denom !== 0) ? (rn * sumXY - sumX * sumY) / denom : 0;
    const intercept = rn > 0 ? (sumY - slope * sumX) / rn : 0;
    const trendlineData = chartSeries.map((_, i) => Number(Math.max(0, Math.min(100, slope * i + intercept)).toFixed(2)));

    createOrUpdateChart('chartFifoDailyTrend', 'line', {
        labels: chartLabels,
        datasets: [
            {
                type: 'line',
                label: 'Trendline',
                data: trendlineData,
                borderColor: ct.trendRegression,
                borderDash: [6, 4],
                borderWidth: 2,
                fill: false,
                pointRadius: 0,
                tension: 0,
                datalabels: { display: false }
            },
            {
                type: 'line',
                label: '% FIFO (On-Sched)',
                data: pctValues,
                borderColor: ct.trendLine,
                backgroundColor: (context) => {
                    const ctx = context.chart.ctx;
                    const gradient = ctx.createLinearGradient(0, 0, 0, 260);
                    gradient.addColorStop(0, ct.trendAreaTop);
                    gradient.addColorStop(1, ct.trendAreaBottom);
                    return gradient;
                },
                fill: true,
                tension: 0.34,
                borderWidth: 2.5,
                pointBackgroundColor: ct.pointBg,
                pointBorderColor: ct.pointBorder,
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6,
                datalabels: {
                    display: (ctx) => {
                        const v = Number(ctx.dataset.data[ctx.dataIndex] || 0);
                        return v > 0;
                    },
                    align: 'top',
                    anchor: 'end',
                    offset: 3,
                    color: ct.tickColor,
                    font: { family: 'JetBrains Mono, monospace', size: 9, weight: '700' },
                    formatter: (v) => `${Number(v).toFixed(1)}%`
                }
            }
        ]
    }, {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                callbacks: {
                    label: (ctx) => {
                        const row = chartSeries[ctx.dataIndex];
                        if (ctx.datasetIndex === 0) return `Trendline: ${ctx.raw}%`;
                        if (!row) return `% FIFO: ${ctx.raw}%`;
                        return [
                            `% FIFO: ${row.pct.toFixed(1)}%`,
                            `Total Loading: ${row.totalLoad.toLocaleString()}`,
                            `On Sched: ${row.onSched.toLocaleString()}`,
                            `Delay: ${row.delay.toLocaleString()}`,
                            `SH: ${row.sh.toLocaleString()}`,
                            `Paylater: ${row.paylater.toLocaleString()}`
                        ];
                    }
                }
            }
        },
        scales: {
            x: { grid: { display: false } },
            y: { min: 0, max: 100, border: { dash: [4, 4] }, ticks: { callback: (v) => v + '%' } }
        }
    });

    // 2. Render Tabel Horizontal Per-Tanggal
    const thead = document.getElementById('fifo-daily-thead');
    const tbody = document.getElementById('fifo-daily-tbody');
    if (!thead || !tbody) return;

    let headHtml = `<tr><th class="ewip-fifo-sticky-col text-left">Metrik Harian</th>`;
    series.forEach(item => {
        const todayCls = item.isToday ? ' ewip-fifo-today-col' : '';
        const todayTag = item.isToday
            ? `<div class="text-[8px] font-black uppercase tracking-widest ewip-accent-text mt-0.5">Hari Ini</div>`
            : `<div class="text-[8px] opacity-65 font-semibold mt-0.5">${item.dayName}</div>`;
        headHtml += `<th class="ewip-fifo-date-col${todayCls}" title="${item.dateKey}">
            <div class="font-mono font-extrabold text-[11px] leading-tight">${item.dateShort}</div>
            ${todayTag}
        </th>`;
    });
    headHtml += `</tr>`;
    thead.innerHTML = headHtml;

    const metricRows = [
        { key: 'pct', label: '% FIFO (On-Sched)', isPct: true, accentClass: 'ewip-accent-text' },
        { key: 'totalLoad', label: 'Total Loading', accentClass: 'ewip-panel-title' },
        { key: 'onSched', label: 'On Sched', accentClass: 'ewip-kpi-label-closed' },
        { key: 'delay', label: 'Delay', accentClass: 'ewip-kpi-label-cnd3' },
        { key: 'sh', label: 'SH', accentClass: 'ewip-kpi-label-cnd2' },
        { key: 'paylater', label: 'Paylater', accentClass: 'ewip-kpi-label-onsched' }
    ];

    let bodyHtml = '';
    metricRows.forEach(row => {
        bodyHtml += `<tr>`;
        bodyHtml += `<td class="ewip-fifo-sticky-col text-left ${row.accentClass}">${row.label}</td>`;
        series.forEach(item => {
            const val = Number(item[row.key] || 0);
            const isZero = val === 0;
            const displayVal = row.isPct
                ? (isZero ? '0%' : `${val.toFixed(1)}%`)
                : val.toLocaleString();
            const todayCls = item.isToday ? ' ewip-fifo-today-col' : '';
            const valCls = isZero ? 'ewip-fifo-zero' : row.accentClass;
            bodyHtml += `<td class="ewip-fifo-date-col${todayCls} ${valCls}">${displayVal}</td>`;
        });
        bodyHtml += `</tr>`;
    });
    tbody.innerHTML = bodyHtml;

    bindFifoDailyScrollEvents();

    requestAnimationFrame(() => {
        const scrollEl = document.getElementById('fifo-daily-table-scroll');
        if (!scrollEl) return;
        updateFifoDailyColWidth();
        if (!preserveScroll) {
            scrollEl.scrollLeft = scrollEl.scrollWidth;
        }
        updateFifoDailyRangeIndicator();
    });

    if (window.lucide) window.lucide.createIcons();
};

window.exportFifoDailyToExcel = function() {
    const series = fifoDailyCachedSeries.length > 0 ? fifoDailyCachedSeries : buildContinuousDailySeries();
    if (series.length === 0) {
        showToast('Belum ada data Trend FIFO Daily untuk di-export.', 'warning');
        return;
    }
    try {
        const rows = [
            { label: '% FIFO (On-Sched)', key: 'pct', isPct: true },
            { label: 'Total Loading', key: 'totalLoad' },
            { label: 'On Sched', key: 'onSched' },
            { label: 'Delay', key: 'delay' },
            { label: 'SH', key: 'sh' },
            { label: 'Paylater', key: 'paylater' }
        ];

        const aoa = [];
        aoa.push(['Metrik', ...series.map(d => `${d.dateKey} (${d.dayName})`)]);
        rows.forEach(r => {
            aoa.push([
                r.label,
                ...series.map(d => {
                    const v = Number(d[r.key] || 0);
                    return r.isPct ? (v === 0 ? '0%' : `${v.toFixed(1)}%`) : v;
                })
            ]);
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        XLSX.utils.book_append_sheet(wb, ws, 'TREND_FIFO_DAILY');
        XLSX.writeFile(wb, `Trend_FIFO_Daily_${activeOverviewCat}_${getTodayDateStr()}.xlsx`);
        showToast('Data Trend FIFO Daily berhasil di-export ke Excel!', 'success');
    } catch(e) {
        console.error(e);
        showToast('Gagal mengekspor data Trend FIFO Daily.', 'error');
    }
};
