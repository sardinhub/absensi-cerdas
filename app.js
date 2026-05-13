// --- CONFIG & GLOBAL VARIABLES ---
const SUPABASE_URL = 'https://besicmdkrakjxevmrzly.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJlc2ljbWRrcmFranhldm1yemx5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MTI2MzMsImV4cCI6MjA5NDE4ODYzM30.j61NxM-HY-FxXXfD1Hj2WWEZpLxofdVBSIsE0hHDjxM';

let CONFIG = {
    adminPassword: '123',
    latePenaltyPerMinute: 1000,
    earlyBirdReward: 15000,
    earlyBirdBuffer: 10 // mins
};

let supabaseClient;
let isAdmin = false;
let allEmployees = [];

// DOM Elements
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

function getSchedule(dayIndex) {
    if (dayIndex === 0) return null;
    if (dayIndex === 6) return { in: '08:00:00', out: '14:00:00' };
    return { in: '07:45:00', out: '17:00:00' };
}

function updateTime() {
    const timeEl = document.getElementById('currentTime');
    const dateEl = document.getElementById('currentDate');
    if (!timeEl || !dateEl) return;
    
    const now = new Date();
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

    dateEl.textContent = `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
    timeEl.textContent = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function checkSystemStatus() {
    const day = new Date().getDay();
    if (day === 0) document.getElementById('offlineOverlay').classList.remove('hidden');
}

// --- ADMIN SYSTEM ---
window.toggleAdminLogin = function() {
    if (isAdmin) {
        isAdmin = false;
        document.body.classList.remove('is-admin');
        document.getElementById('adminBtn').innerHTML = '<i class="ri-admin-line"></i> Login Admin';
        switchTab('checkin');
    } else {
        document.getElementById('loginModal').classList.toggle('hidden');
    }
};

window.processAdminLogin = function() {
    const pass = document.getElementById('loginPass').value;
    if (pass === CONFIG.adminPassword) {
        isAdmin = true;
        document.body.classList.add('is-admin');
        document.getElementById('adminBtn').innerHTML = '<i class="ri-logout-box-line"></i> Logout Admin';
        document.getElementById('loginModal').classList.add('hidden');
    } else { alert("Password Salah!"); }
};

// --- TAB SYSTEM ---
window.switchTab = async function(tab) {
    const titles = {
        checkin: ["Biometric Auth", "Pilih nama dan scan wajah"],
        register: ["Registrasi Staf", "Daftarkan data dan wajah staf baru"],
        history: ["Riwayat Absensi", "Log kehadiran 50 data terakhir"],
        report: ["Laporan Kehadiran", "Rekap harian, mingguan, bulanan"],
        settings: ["Pengaturan", "Kelola sistem dan password"]
    };

    [document.getElementById('tabCheckIn'), document.getElementById('tabEmployees'), document.getElementById('tabHistory'), document.getElementById('tabReport'), document.getElementById('tabSettings')].forEach(t => t?.classList.remove('active'));
    [document.getElementById('checkInGrid'), document.getElementById('registerSection'), document.getElementById('historySection'), document.getElementById('reportSection'), document.getElementById('settingsSection')].forEach(s => s?.classList.add('hidden'));

    stopAllCameras();

    if (tab === 'register') {
        document.getElementById('tabEmployees').classList.add('active');
        document.getElementById('registerSection').classList.remove('hidden');
    } else if (tab === 'history') {
        document.getElementById('tabHistory').classList.add('active');
        document.getElementById('historySection').classList.remove('hidden');
        loadHistory();
    } else if (tab === 'report') {
        document.getElementById('tabReport').classList.add('active');
        document.getElementById('reportSection').classList.remove('hidden');
        loadReport();
    } else if (tab === 'settings') {
        document.getElementById('tabSettings').classList.add('active');
        document.getElementById('settingsSection').classList.remove('hidden');
    } else {
        document.getElementById('tabCheckIn').classList.add('active');
        document.getElementById('checkInGrid').classList.remove('hidden');
    }

    document.getElementById('mainTitle').textContent = titles[tab][0];
    document.getElementById('mainSubtitle').textContent = titles[tab][1];
};

function stopAllCameras() {
    if (videoFeed?.srcObject) videoFeed.srcObject.getTracks().forEach(t => t.stop());
    if (videoRegister?.srcObject) videoRegister.srcObject.getTracks().forEach(t => t.stop());
}

window.initCamera = async function(mode) {
    const video = mode === 'register' ? videoRegister : videoFeed;
    const btn = event.currentTarget;
    btn.disabled = true;
    btn.innerHTML = 'Memulai...';
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        video.srcObject = stream;
        await video.play();
        const api = window.faceapi || faceapi;
        const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';
        if (!api.nets.tinyFaceDetector.params) {
            await Promise.all([
                api.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                api.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
                api.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
            ]);
        }
        if (mode === 'register') {
            document.getElementById('regCameraBtn').classList.add('hidden');
            document.getElementById('regSaveBtn').classList.remove('hidden');
        } else {
            document.getElementById('cameraInitAction').classList.add('hidden');
            document.getElementById('attendanceActions').classList.remove('hidden');
        }
    } catch (e) { alert("Gagal aktifkan kamera: " + e.message); }
    btn.disabled = false;
    btn.innerHTML = 'Nyalakan Kamera';
};

// --- ATTENDANCE LOGIC ---
window.handleAttendance = async function(type) {
    const empId = attendanceEmployeeSelect.value;
    if (!empId) return alert("Pilih nama Anda!");

    const actionsDiv = document.getElementById('attendanceActions');
    const buttons = actionsDiv.querySelectorAll('button');
    buttons.forEach(b => b.disabled = true);
    const originalText = type === 'in' ? 'Scan Masuk' : 'Scan Pulang';
    const targetBtn = Array.from(buttons).find(b => b.innerText.includes(originalText));
    if (targetBtn) targetBtn.innerHTML = 'Memproses...';

    const reEnable = () => {
        buttons.forEach(b => b.disabled = false);
        if (targetBtn) targetBtn.innerHTML = originalText;
    };

    try {
        const today = new Date(); today.setHours(0,0,0,0);
        const { data: existing } = await supabaseClient.from('attendance_logs').select('check_in_time').eq('employee_id', empId).eq('type', type).gte('check_in_time', today.toISOString());
        if (existing?.length > 0) { alert(`Anda sudah ${type === 'in' ? 'Masuk' : 'Pulang'} tadi.`); return reEnable(); }

        const employee = allEmployees.find(e => e.id === empId);
        const api = window.faceapi || faceapi;
        const detections = await api.detectSingleFace(videoFeed, new api.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptor();

        if (!detections || api.euclideanDistance(detections.descriptor, new Float32Array(employee.face_embedding)) > 0.6) {
            alert("Wajah tidak cocok!"); return reEnable();
        }

        const now = new Date();
        const sched = getSchedule(now.getDay());
        if (type === 'out' && sched && now < parseTime(sched.out)) {
            window.pendingAttendanceData = { empId, employee, type, now };
            document.getElementById('earlyOutModal').classList.remove('hidden');
            return reEnable();
        }
        await saveAttendance(empId, employee, type, now);
    } catch (e) { alert("Error: " + e.message); reEnable(); }
};

async function saveAttendance(empId, employee, type, now, reason = "") {
    const sched = getSchedule(now.getDay());
    let status = "On-Time";
    let reward = 0;
    let penalty = 0;
    let lateMins = 0;

    if (type === 'in' && sched) {
        const workStart = parseTime(sched.in);
        const earlyLimit = new Date(workStart.getTime() - (CONFIG.earlyBirdBuffer * 60000));
        
        if (now <= earlyLimit) { status = "Early Bird"; reward = CONFIG.earlyBirdReward; }
        else if (now > workStart) {
            status = "Late";
            lateMins = Math.floor((now - workStart) / 60000);
            penalty = lateMins * CONFIG.latePenaltyPerMinute;
        }
    }
    if (type === 'out' && reason) status = "Early Out (Approved)";

    const { error } = await supabaseClient.from('attendance_logs').insert([{
        employee_id: empId, check_in_time: now.toISOString(), status, type, notes: reason,
        reward_amount: reward, penalty_amount: penalty, late_duration_minutes: lateMins
    }]);

    if (error) throw error;
    alert(`Wajah terdeteksi: ${employee.full_name}\nBerhasil ${type === 'in' ? 'Masuk' : 'Pulang'}`);
    document.getElementById('resultBox').classList.remove('hidden');
    document.getElementById('resultName').textContent = employee.full_name;
    document.getElementById('resultTime').textContent = now.toLocaleTimeString();
    document.getElementById('resultBadge').textContent = status;
}

// --- REPORT LOGIC ---
window.loadReport = async function() {
    const empFilter = document.getElementById('reportEmployeeFilter').value;
    const periodFilter = document.getElementById('reportPeriodFilter').value;
    const body = document.getElementById('reportTableBody');
    body.innerHTML = '<tr><td colspan="5" style="text-align:center;">Memuat laporan...</td></tr>';

    let query = supabaseClient.from('attendance_logs').select('*, employees(full_name)');
    if (empFilter !== 'all') query = query.eq('employee_id', empFilter);

    const now = new Date();
    if (periodFilter === 'daily') {
        const start = new Date(); start.setHours(0,0,0,0);
        query = query.gte('check_in_time', start.toISOString());
    } else if (periodFilter === 'weekly') {
        const start = new Date(now.setDate(now.getDate() - now.getDay()));
        query = query.gte('check_in_time', start.toISOString());
    } else if (periodFilter === 'monthly') {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        query = query.gte('check_in_time', start.toISOString());
    }

    const { data, error } = await query.order('check_in_time', { ascending: false });
    if (error || !data) return body.innerHTML = '<tr><td colspan="5">Gagal memuat data.</td></tr>';

    let total = data.length, onTime = 0, late = 0, tReward = 0, tPenalty = 0;
    body.innerHTML = '';
    data.forEach(log => {
        if (log.status === 'On-Time' || log.status === 'Early Bird') onTime++;
        if (log.status === 'Late') late++;
        tReward += (log.reward_amount || 0);
        tPenalty += (log.penalty_amount || 0);

        body.innerHTML += `<tr>
            <td>${log.employees.full_name}</td>
            <td>${new Date(log.check_in_time).toLocaleDateString()}</td>
            <td><span class="badge">${log.status}</span></td>
            <td style="color:#10b981;">Rp ${log.reward_amount?.toLocaleString() || 0}</td>
            <td style="color:#ef4444;">Rp ${log.penalty_amount?.toLocaleString() || 0}</td>
        </tr>`;
    });

    document.getElementById('statTotal').textContent = total;
    document.getElementById('statOnTime').textContent = onTime;
    document.getElementById('statLate').textContent = late;
    document.getElementById('statReward').textContent = "Rp " + tReward.toLocaleString();
    document.getElementById('statPenalty').textContent = "Rp " + tPenalty.toLocaleString();
};

// --- UTILS ---
async function loadEmployees() {
    const { data } = await supabaseClient.from('employees').select('id, full_name, face_embedding');
    allEmployees = data || [];
    attendanceEmployeeSelect.innerHTML = '<option value="">-- Pilih Nama --</option>';
    document.getElementById('reportEmployeeFilter').innerHTML = '<option value="all">Semua Staf</option>';
    allEmployees.forEach(e => {
        attendanceEmployeeSelect.innerHTML += `<option value="${e.id}">${e.full_name}</option>`;
        document.getElementById('reportEmployeeFilter').innerHTML += `<option value="${e.id}">${e.full_name}</option>`;
    });
}

async function loadHistory() {
    const body = document.getElementById('historyTableBody');
    body.innerHTML = '<tr><td colspan="5" style="text-align:center;">Memuat data...</td></tr>';
    const { data } = await supabaseClient.from('attendance_logs').select('*, employees(full_name)').order('check_in_time', { ascending: false }).limit(50);
    body.innerHTML = '';
    data?.forEach(log => {
        body.innerHTML += `<tr>
            <td><strong>${log.employees.full_name}</strong></td>
            <td>${new Date(log.check_in_time).toLocaleString()}</td>
            <td>${log.type === 'in' ? 'Masuk' : 'Pulang'}</td>
            <td><span class="badge">${log.status}</span></td>
            <td>${log.notes || '-'}</td>
        </tr>`;
    });
}

function parseTime(timeStr) {
    const now = new Date(); const [h, m, s] = timeStr.split(':');
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, s || 0);
}

async function loadSettings() {
    const { data } = await supabaseClient.from('settings_config').select('admin_password').limit(1).single();
    if (data) CONFIG.adminPassword = data.admin_password;
}

window.saveSettings = async function() {
    const newPass = document.getElementById('setAdminPass').value;
    if (!newPass) return alert("Masukkan password!");
    const { error } = await supabaseClient.from('settings_config').update({ admin_password: newPass }).eq('id', 1);
    if (error) await supabaseClient.from('settings_config').insert({ admin_password: newPass });
    CONFIG.adminPassword = newPass; alert("Tersimpan!");
};

window.handleFullRegistration = async function() {
    const id = document.getElementById('regId').value, name = document.getElementById('regName').value, pos = document.getElementById('regPosition').value, birth = document.getElementById('regBirth').value;
    if (!id || !name || !pos || !birth) return alert("Lengkapi data!");
    try {
        const api = window.faceapi || faceapi, detections = await api.detectSingleFace(videoRegister, new api.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptor();
        if (!detections) return alert("Wajah tidak terdeteksi!");
        if (allEmployees.find(emp => emp.face_embedding && api.euclideanDistance(detections.descriptor, new Float32Array(emp.face_embedding)) < 0.55)) return alert("Wajah sudah terdaftar!");
        const { error } = await supabaseClient.from('employees').insert([{ employee_id: id, full_name: name, position: pos, birth_date: birth, face_embedding: Array.from(detections.descriptor) }]);
        if (error) throw error;
        alert("Sukses!"); loadEmployees(); switchTab('checkin');
    } catch (e) { alert("Gagal: " + e.message); }
};

window.closeEarlyModal = () => document.getElementById('earlyOutModal').classList.add('hidden');
window.confirmEarlyOut = async function() {
    const reason = document.getElementById('earlyReason').value, pass = document.getElementById('adminApprovePass').value;
    if (!reason || pass !== CONFIG.adminPassword) return alert("Data tidak valid!");
    const { empId, employee, type, now } = window.pendingAttendanceData;
    await saveAttendance(empId, employee, type, now, reason); closeEarlyModal();
};
