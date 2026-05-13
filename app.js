// --- CONFIG & GLOBAL VARIABLES ---
const SUPABASE_URL = 'https://besicmdkrakjxevmrzly.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJlc2ljbWRrcmFranhldm1yemx5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MTI2MzMsImV4cCI6MjA5NDE4ODYzM30.j61NxM-HY-FxXXfD1Hj2WWEZpLxofdVBSIsE0hHDjxM';

let CONFIG = { adminPassword: '123', latePenaltyPerMinute: 1000, earlyBirdReward: 15000, earlyBirdBuffer: 10 };
let supabaseClient;
let isAdmin = false;
let allEmployees = [];
let videoFeed, videoRegister, attendanceEmployeeSelect;

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    videoFeed = document.getElementById('videoFeed');
    videoRegister = document.getElementById('videoRegister');
    attendanceEmployeeSelect = document.getElementById('attendanceEmployeeSelect');
    try {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        loadSettings();
    } catch (e) { console.error(e); }
    setInterval(updateTime, 1000);
    updateTime();
    loadEmployees();
    checkSystemStatus();
});

function updateTime() {
    const timeEl = document.getElementById('currentTime'), dateEl = document.getElementById('currentDate');
    if (!timeEl || !dateEl) return;
    const now = new Date(), days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'], months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    dateEl.textContent = `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
    timeEl.textContent = now.toLocaleTimeString('id-ID', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function checkSystemStatus() { if (new Date().getDay() === 0) document.getElementById('offlineOverlay')?.classList.remove('hidden'); }

function getSchedule(dayIndex) {
    if (dayIndex === 0) return null;
    if (dayIndex === 6) return { in: '08:00:00', out: '14:00:00' };
    return { in: '07:45:00', out: '17:00:00' };
}

// --- ADMIN & TAB SYSTEM ---
window.toggleAdminLogin = () => isAdmin ? (isAdmin = false, document.body.classList.remove('is-admin'), document.getElementById('adminBtn').innerHTML = '<i class="ri-admin-line"></i> Login Admin', switchTab('checkin')) : document.getElementById('loginModal').classList.toggle('hidden');
window.processAdminLogin = () => {
    const pass = document.getElementById('loginPass').value;
    if (pass === CONFIG.adminPassword) {
        isAdmin = true; document.body.classList.add('is-admin');
        document.getElementById('adminBtn').innerHTML = '<i class="ri-logout-box-line"></i> Logout Admin';
        document.getElementById('loginModal').classList.add('hidden');
    } else alert("Password Salah!");
};

window.switchTab = async function(tab) {
    const titles = { checkin: ["Biometric Auth", "Pilih nama dan scan wajah"], register: ["Manajemen Staf", "Kelola data dan wajah staf"], history: ["Riwayat Aktivitas", "Raw logs aktivitas staf"], report: ["Laporan Kehadiran", "Rekapitulasi performa staf"], settings: ["Pengaturan", "Kelola sistem"] };
    [document.getElementById('tabCheckIn'), document.getElementById('tabEmployees'), document.getElementById('tabHistory'), document.getElementById('tabReport'), document.getElementById('tabSettings')].forEach(t => t?.classList.remove('active'));
    [document.getElementById('checkInGrid'), document.getElementById('registerSection'), document.getElementById('historySection'), document.getElementById('reportSection'), document.getElementById('settingsSection')].forEach(s => s?.classList.add('hidden'));
    stopAllCameras();
    const activeTab = document.getElementById(tab === 'checkin' ? 'tabCheckIn' : tab === 'register' ? 'tabEmployees' : tab === 'history' ? 'tabHistory' : tab === 'report' ? 'tabReport' : 'tabSettings');
    const activeSec = document.getElementById(tab === 'checkin' ? 'checkInGrid' : tab === 'register' ? 'registerSection' : tab === 'history' ? 'historySection' : tab === 'report' ? 'reportSection' : 'settingsSection');
    activeTab?.classList.add('active'); activeSec?.classList.remove('hidden');
    document.getElementById('mainTitle').textContent = titles[tab][0];
    document.getElementById('mainSubtitle').textContent = titles[tab][1];
    if (tab === 'register') loadStaffTable();
    if (tab === 'history') loadHistory();
    if (tab === 'report') loadReport();
};

function stopAllCameras() {
    if (videoFeed?.srcObject) videoFeed.srcObject.getTracks().forEach(t => t.stop());
    if (videoRegister?.srcObject) videoRegister.srcObject.getTracks().forEach(t => t.stop());
}

window.initCamera = async function(mode) {
    const video = mode === 'register' ? videoRegister : videoFeed, btn = event.currentTarget;
    btn.disabled = true; btn.innerHTML = 'Memulai...';
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        video.srcObject = stream; await video.play();
        const api = window.faceapi || faceapi, MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';
        if (!api.nets.tinyFaceDetector.params) await Promise.all([api.nets.tinyFaceDetector.loadFromUri(MODEL_URL), api.nets.faceLandmark68Net.loadFromUri(MODEL_URL), api.nets.faceRecognitionNet.loadFromUri(MODEL_URL)]);
        if (mode === 'register') { document.getElementById('regCameraBtn').classList.add('hidden'); document.getElementById('regSaveBtn').classList.remove('hidden'); }
        else { document.getElementById('cameraInitAction').classList.add('hidden'); document.getElementById('attendanceActions').classList.remove('hidden'); }
    } catch (e) { alert("Gagal aktifkan kamera: " + e.message); }
    btn.disabled = false; btn.innerHTML = 'Nyalakan Kamera';
};

// --- CRUD STAFF ---
async function loadStaffTable() {
    const { data } = await supabaseClient.from('employees').select('id, employee_id, full_name, position');
    const body = document.getElementById('staffTableBody'); body.innerHTML = '';
    data?.forEach(emp => {
        body.innerHTML += `<tr><td>${emp.employee_id}</td><td>${emp.full_name}</td><td>${emp.position}</td>
            <td><button class="btn-icon btn-edit" onclick="openEditStaff('${emp.id}','${emp.full_name}','${emp.position}')"><i class="ri-edit-line"></i></button>
            <button class="btn-icon btn-delete" onclick="deleteStaff('${emp.id}')"><i class="ri-delete-bin-line"></i></button></td></tr>`;
    });
}
window.openEditStaff = (id, name, pos) => {
    document.getElementById('editStaffId').value = id; document.getElementById('editStaffName').value = name;
    document.getElementById('editStaffPos').value = pos; document.getElementById('editStaffModal').classList.remove('hidden');
};
window.updateStaff = async () => {
    const id = document.getElementById('editStaffId').value, name = document.getElementById('editStaffName').value, pos = document.getElementById('editStaffPos').value;
    const { error } = await supabaseClient.from('employees').update({ full_name: name, position: pos }).eq('id', id);
    if (!error) { alert("Data Staf Diperbarui!"); closeModals(); loadStaffTable(); loadEmployees(); }
};
window.deleteStaff = async (id) => { if (confirm("Hapus staf ini selamanya?")) { await supabaseClient.from('employees').delete().eq('id', id); loadStaffTable(); loadEmployees(); } };

// --- CRUD HISTORY ---
async function loadHistory() {
    const bIn = document.getElementById('historyInTableBody'), bOut = document.getElementById('historyOutTableBody');
    if (!bIn || !bOut) return;
    bIn.innerHTML = '<tr><td colspan="4">Memuat...</td></tr>'; bOut.innerHTML = '<tr><td colspan="4">Memuat...</td></tr>';
    const { data } = await supabaseClient.from('attendance_logs').select('*, employees(full_name)').order('check_in_time', { ascending: false }).limit(100);
    bIn.innerHTML = ''; bOut.innerHTML = '';
    data?.forEach(log => {
        const time = new Date(log.check_in_time).toLocaleString('id-ID');
        const name = log.employees?.full_name || 'N/A';
        const action = `<button class="btn-icon btn-delete" onclick="deleteLog('${log.id}')"><i class="ri-delete-bin-line"></i></button>`;
        if (log.type === 'in' || (log.type === 'manual' && log.status !== 'Tugas Luar')) {
            bIn.innerHTML += `<tr><td><strong>${name}</strong></td><td>${time}</td><td><span class="badge">${log.status}</span></td><td>${action}</td></tr>`;
        } 
        if (log.type === 'out' || (log.type === 'manual' && log.status === 'Tugas Luar')) {
            bOut.innerHTML += `<tr><td><strong>${name}</strong></td><td>${time}</td><td>${log.notes || '-'}</td><td>${action}</td></tr>`;
        }
    });
}
window.deleteLog = async (id) => { if (confirm("Hapus log ini?")) { await supabaseClient.from('attendance_logs').delete().eq('id', id); loadHistory(); } };

window.openManualAttendance = () => {
    const select = document.getElementById('manualEmpId');
    select.innerHTML = allEmployees.map(e => `<option value="${e.id}">${e.full_name}</option>`).join('');
    document.getElementById('manualAttendanceModal').classList.remove('hidden');
};
window.saveManualAttendance = async () => {
    const id = document.getElementById('manualEmpId').value, st = document.getElementById('manualStatus').value, nt = document.getElementById('manualNote').value;
    const { error } = await supabaseClient.from('attendance_logs').insert([{ employee_id: id, check_in_time: new Date().toISOString(), status: st, type: 'manual', notes: nt, reward_amount: 0, penalty_amount: 0 }]);
    if (!error) { alert("Sukses!"); closeModals(); loadHistory(); }
};

// --- ATTENDANCE ---
window.handleAttendance = async function(type) {
    const empId = attendanceEmployeeSelect.value; if (!empId) return alert("Pilih nama!");
    const btnSec = document.getElementById('attendanceActions'), btns = btnSec.querySelectorAll('button');
    btns.forEach(b => b.disabled = true);
    try {
        const today = new Date(); today.setHours(0,0,0,0);
        const { data: ex } = await supabaseClient.from('attendance_logs').select('id').eq('employee_id', empId).eq('type', type).gte('check_in_time', today.toISOString());
        if (ex?.length > 0) { alert("Sudah absen tadi."); return btns.forEach(b => b.disabled = false); }
        const emp = allEmployees.find(e => e.id === empId), api = window.faceapi || faceapi;
        const det = await api.detectSingleFace(videoFeed, new api.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptor();
        if (!det || api.euclideanDistance(det.descriptor, new Float32Array(emp.face_embedding)) > 0.6) { alert("Wajah tidak cocok!"); return btns.forEach(b => b.disabled = false); }
        const now = new Date(), sched = getSchedule(now.getDay());
        if (type === 'out' && sched && now < parseTime(sched.out)) {
            window.pendingAttendanceData = { empId, employee: emp, type, now };
            document.getElementById('earlyOutModal').classList.remove('hidden'); btns.forEach(b => b.disabled = false); return;
        }
        await saveAttendance(empId, emp, type, now);
    } catch (e) { alert(e.message); btns.forEach(b => b.disabled = false); }
};

async function saveAttendance(empId, employee, type, now, reason = "") {
    const sched = getSchedule(now.getDay()); let status = "On-Time", reward = 0, penalty = 0, lateMins = 0;
    if (type === 'in' && sched) {
        const workStart = parseTime(sched.in);
        if (now <= new Date(workStart.getTime() - (CONFIG.earlyBirdBuffer * 60000))) { status = "Early Bird"; reward = CONFIG.earlyBirdReward; }
        else if (now > workStart) { status = "Late"; lateMins = Math.floor((now - workStart) / 60000); penalty = lateMins * CONFIG.latePenaltyPerMinute; }
    }
    await supabaseClient.from('attendance_logs').insert([{ employee_id: empId, check_in_time: now.toISOString(), status, type, notes: reason, reward_amount: reward, penalty_amount: penalty, late_duration_minutes: lateMins }]);
    alert("Berhasil!"); document.getElementById('resultBox').classList.remove('hidden');
    document.getElementById('resultName').textContent = employee.full_name;
    document.getElementById('resultTime').textContent = now.toLocaleTimeString();
    document.getElementById('resultBadge').textContent = status;
}

// --- REPORT ---
async function loadReport() {
    const emp = document.getElementById('reportEmployeeFilter')?.value || 'all', per = document.getElementById('reportPeriodFilter')?.value || 'daily', body = document.getElementById('reportTableBody');
    if (!body) return;
    body.innerHTML = '<tr><td colspan="8">Memuat...</td></tr>';
    let q = supabaseClient.from('attendance_logs').select('*, employees(full_name)');
    if (emp !== 'all') q = q.eq('employee_id', emp);
    const startOfToday = new Date(); startOfToday.setHours(0,0,0,0);
    if (per === 'daily') q = q.gte('check_in_time', startOfToday.toISOString());
    else if (per === 'weekly') { const first = startOfToday.getDate() - startOfToday.getDay(); const startOfWeek = new Date(new Date().setDate(first)); startOfWeek.setHours(0,0,0,0); q = q.gte('check_in_time', startOfWeek.toISOString()); }
    else if (per === 'monthly') { const startOfMonth = new Date(startOfToday.getFullYear(), startOfToday.getMonth(), 1); q = q.gte('check_in_time', startOfMonth.toISOString()); }
    const { data, error } = await q.order('check_in_time', { ascending: true });
    if (error) return body.innerHTML = `<tr><td colspan="8">Error: ${error.message}</td></tr>`;
    const grouped = {};
    data?.forEach(log => {
        const date = new Date(log.check_in_time).toLocaleDateString('en-CA'), key = `${date}_${log.employee_id}`;
        if (!grouped[key]) grouped[key] = { name: log.employees?.full_name || 'N/A', date: new Date(log.check_in_time).toLocaleDateString('id-ID'), in: '-', out: '-', late: 0, status: log.status, reward: 0, penalty: 0, isComplete: false };
        const time = new Date(log.check_in_time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        if (log.type === 'in') { grouped[key].in = time; grouped[key].late = log.late_duration_minutes || 0; grouped[key].status = log.status; grouped[key].reward = log.reward_amount || 0; grouped[key].penalty = log.penalty_amount || 0; }
        else if (log.type === 'out') { grouped[key].out = time; grouped[key].isComplete = true; }
        else if (log.type === 'manual') { grouped[key].status = log.status; grouped[key].in = log.status; grouped[key].isComplete = true; }
    });
    const rows = Object.values(grouped).filter(r => r.isComplete).reverse();
    body.innerHTML = rows.length === 0 ? '<tr><td colspan="8">Laporan muncul setelah Scan Pulang.</td></tr>' : '';
    rows.forEach(r => {
        body.innerHTML += `<tr><td><strong>${r.name}</strong></td><td>${r.date}</td><td>${r.in}</td><td>${r.out}</td><td>${r.late > 0 ? `${r.late} Menit` : '-'}</td><td><span class="badge">${r.status}</span></td><td style="color:#10b981;">Rp ${r.reward.toLocaleString()}</td><td style="color:#ef4444;">Rp ${r.penalty.toLocaleString()}</td></tr>`;
    });
    updateReportStats(rows.length, rows.filter(r => r.status==='On-Time'||r.status==='Early Bird').length, rows.filter(r => r.status==='Late').length, rows.reduce((s, r)=> s+r.reward, 0), rows.reduce((s, r)=> s+r.penalty, 0));
}

function updateReportStats(total, onTime, late, reward, penalty) {
    const summary = document.getElementById('reportSummary'); if (!summary) return;
    summary.innerHTML = `<div class="stat-grid">
        <div class="stat-card"><i class="ri-history-line"></i><h4>Total Log</h4><p>${total}</p></div>
        <div class="stat-card"><i class="ri-checkbox-circle-line" style="color:#10b981;"></i><h4>Tepat Waktu</h4><p style="color:#10b981;">${onTime}</p></div>
        <div class="stat-card"><i class="ri-error-warning-line" style="color:#ef4444;"></i><h4>Terlambat</h4><p style="color:#ef4444;">${late}</p></div>
        <div class="stat-card"><i class="ri-copper-coin-line" style="color:#f59e0b;"></i><h4>Total Reward</h4><p style="color:#10b981;">Rp ${reward.toLocaleString()}</p></div>
        <div class="stat-card"><i class="ri-money-dollar-circle-line" style="color:#ef4444;"></i><h4>Total Denda</h4><p style="color:#ef4444;">Rp ${penalty.toLocaleString()}</p></div>
    </div>`;
}

// --- UTILS ---
async function loadEmployees() {
    const { data } = await supabaseClient.from('employees').select('id, full_name, face_embedding');
    allEmployees = data || []; attendanceEmployeeSelect.innerHTML = '<option value="">-- Pilih Nama --</option>';
    document.getElementById('reportEmployeeFilter').innerHTML = '<option value="all">Semua Staf</option>';
    allEmployees.forEach(e => { attendanceEmployeeSelect.innerHTML += `<option value="${e.id}">${e.full_name}</option>`; document.getElementById('reportEmployeeFilter').innerHTML += `<option value="${e.id}">${e.full_name}</option>`; });
}
function parseTime(t) { const n = new Date(), [h, m, s] = t.split(':'); return new Date(n.getFullYear(), n.getMonth(), n.getDate(), h, m, s || 0); }
async function loadSettings() {
    const { data } = await supabaseClient.from('settings_config').select('*').limit(1).single();
    if (data) { 
        CONFIG.adminPassword = data.admin_password; CONFIG.latePenaltyPerMinute = data.late_penalty_per_minute; CONFIG.earlyBirdReward = data.early_bird_reward; CONFIG.earlyBirdBuffer = data.early_bird_limit_minutes;
        if (document.getElementById('setAdminPass')) { document.getElementById('setAdminPass').value = data.admin_password; document.getElementById('setReward').value = data.early_bird_reward; document.getElementById('setPenalty').value = data.late_penalty_per_minute; document.getElementById('setEarlyLimit').value = data.early_bird_limit_minutes; }
    }
}
window.saveSettings = async function() {
    const p = document.getElementById('setAdminPass').value, r = parseInt(document.getElementById('setReward').value), d = parseInt(document.getElementById('setPenalty').value), l = parseInt(document.getElementById('setEarlyLimit').value);
    const s = { admin_password: p, late_penalty_per_minute: d, early_bird_reward: r, early_bird_limit_minutes: l };
    const { error } = await supabaseClient.from('settings_config').update(s).eq('id', 1); if (error) await supabaseClient.from('settings_config').insert({ id: 1, ...s });
    alert("Tersimpan!"); loadSettings();
};
window.closeModals = () => document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
window.handleFullRegistration = async function() {
    const id = document.getElementById('regId').value, name = document.getElementById('regName').value, pos = document.getElementById('regPosition').value, birth = document.getElementById('regBirth').value;
    if (!id || !name || !pos || !birth) return alert("Lengkapi!");
    try {
        const api = window.faceapi || faceapi, det = await api.detectSingleFace(videoRegister, new api.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptor();
        if (!det) return alert("Wajah tidak terdeteksi!");
        if (allEmployees.find(e => e.face_embedding && api.euclideanDistance(det.descriptor, new Float32Array(e.face_embedding)) < 0.55)) return alert("Wajah sudah terdaftar!");
        await supabaseClient.from('employees').insert([{ employee_id: id, full_name: name, position: pos, birth_date: birth, face_embedding: Array.from(det.descriptor) }]);
        alert("Sukses!"); loadEmployees(); switchTab('checkin');
    } catch (e) { alert(e.message); }
};
window.confirmEarlyOut = async function() {
    const r = document.getElementById('earlyReason').value, p = document.getElementById('adminApprovePass').value;
    if (!r || p !== CONFIG.adminPassword) return alert("Gagal!");
    const { empId, employee, type, now } = window.pendingAttendanceData;
    await saveAttendance(empId, employee, type, now, r); closeModals();
};
