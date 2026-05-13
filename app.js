// --- CONFIG & GLOBAL VARIABLES ---
const SUPABASE_URL = 'https://besicmdkrakjxevmrzly.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJlc2ljbWRrcmFranhldm1yemx5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MTI2MzMsImV4cCI6MjA5NDE4ODYzM30.j61NxM-HY-FxXXfD1Hj2WWEZpLxofdVBSIsE0hHDjxM';

let CONFIG = {
    adminPassword: '123'
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
    if (day === 0) {
        document.getElementById('offlineOverlay').classList.remove('hidden');
    }
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
        alert("Login Admin Berhasil!");
    } else {
        alert("Password Salah!");
    }
};

// --- TAB SYSTEM ---
window.switchTab = async function(tab) {
    const titles = {
        checkin: ["Biometric Auth", "Silakan pilih nama dan scan wajah"],
        register: ["Registrasi Staf", "Lengkapi data dan pindai wajah staf baru"],
        history: ["Riwayat Absensi", "Daftar kehadiran seluruh staf"],
        settings: ["Pengaturan", "Kelola jam kerja dan sistem"]
    };

    const tabCheckIn = document.getElementById('tabCheckIn');
    const tabEmployees = document.getElementById('tabEmployees');
    const tabHistory = document.getElementById('tabHistory');
    const tabSettings = document.getElementById('tabSettings');

    [tabCheckIn, tabEmployees, tabHistory, tabSettings].forEach(t => t.classList.remove('active'));
    ['checkInGrid', 'registerSection', 'historySection', 'settingsSection'].forEach(s => document.getElementById(s).classList.add('hidden'));

    stopAllCameras();

    if (tab === 'register') {
        tabEmployees.classList.add('active');
        document.getElementById('registerSection').classList.remove('hidden');
    } else if (tab === 'history') {
        tabHistory.classList.add('active');
        document.getElementById('historySection').classList.remove('hidden');
        loadHistory();
    } else if (tab === 'settings') {
        tabSettings.classList.add('active');
        document.getElementById('settingsSection').classList.remove('hidden');
    } else {
        tabCheckIn.classList.add('active');
        document.getElementById('checkInGrid').classList.remove('hidden');
    }

    document.getElementById('mainTitle').textContent = titles[tab][0];
    document.getElementById('mainSubtitle').textContent = titles[tab][1];
};

function stopAllCameras() {
    if (videoFeed && videoFeed.srcObject) videoFeed.srcObject.getTracks().forEach(t => t.stop());
    if (videoRegister && videoRegister.srcObject) videoRegister.srcObject.getTracks().forEach(t => t.stop());
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

// --- REGISTRATION ---
window.handleFullRegistration = async function() {
    const id = document.getElementById('regId').value;
    const name = document.getElementById('regName').value;
    const pos = document.getElementById('regPosition').value;
    const birth = document.getElementById('regBirth').value;
    
    if (!id || !name || !pos || !birth) return alert("Lengkapi data!");

    try {
        const api = window.faceapi || faceapi;
        const detections = await api.detectSingleFace(videoRegister, new api.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptor();

        if (!detections) return alert("Wajah tidak terdeteksi!");

        const duplicate = allEmployees.find(emp => {
            if (!emp.face_embedding) return false;
            return api.euclideanDistance(detections.descriptor, new Float32Array(emp.face_embedding)) < 0.55;
        });
        if (duplicate) return alert(`Wajah ini sudah terdaftar atas nama: ${duplicate.full_name}`);

        const { error } = await supabaseClient.from('employees').insert([{
            employee_id: id, full_name: name, position: pos, birth_date: birth, face_embedding: Array.from(detections.descriptor)
        }]);
        
        if (error) throw error;
        alert("Pendaftaran Sukses!");
        loadEmployees();
        switchTab('checkin');
    } catch (e) { alert("Gagal: " + e.message); }
};

// --- ATTENDANCE ---
window.handleAttendance = async function(type) {
    const empId = attendanceEmployeeSelect.value;
    if (!empId) return alert("Pilih nama Anda terlebih dahulu!");

    const actionsDiv = document.getElementById('attendanceActions');
    const buttons = actionsDiv.querySelectorAll('button');
    buttons.forEach(b => b.disabled = true);
    const originalText = type === 'in' ? 'Scan Masuk' : 'Scan Pulang';
    const targetBtn = Array.from(buttons).find(b => b.innerText.includes(originalText));
    if (targetBtn) targetBtn.innerHTML = '<i class="ri-loader-4-line loading"></i> Memproses...';

    const reEnable = () => {
        buttons.forEach(b => b.disabled = false);
        if (targetBtn) targetBtn.innerHTML = originalText;
    };

    try {
        const today = new Date();
        today.setHours(0,0,0,0);
        const { data: existing } = await supabaseClient.from('attendance_logs').select('check_in_time').eq('employee_id', empId).eq('type', type).gte('check_in_time', today.toISOString());
        if (existing && existing.length > 0) {
            alert(`SISTEM: Anda sudah ${type === 'in' ? 'Masuk' : 'Pulang'} tadi.`);
            reEnable();
            return;
        }
    } catch (e) { console.error(e); }

    const employee = allEmployees.find(e => e.id === empId);

    try {
        const api = window.faceapi || faceapi;
        const detections = await api.detectSingleFace(videoFeed, new api.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptor();

        if (!detections || api.euclideanDistance(detections.descriptor, new Float32Array(employee.face_embedding)) > 0.6) {
            alert("Wajah tidak cocok atau tidak terdeteksi!");
            reEnable();
            return;
        }

        const now = new Date();
        const sched = getSchedule(now.getDay());
        
        if (type === 'out' && sched && now < parseTime(sched.out)) {
            window.pendingAttendanceData = { empId, employee, type, now };
            document.getElementById('earlyOutModal').classList.remove('hidden');
            reEnable();
            return;
        }

        await saveAttendance(empId, employee, type, now);
    } catch (e) { 
        alert("Error: " + e.message); 
        reEnable();
    }
};

window.confirmEarlyOut = async function() {
    const reason = document.getElementById('earlyReason').value;
    const pass = document.getElementById('adminApprovePass').value;
    if (!reason || pass !== CONFIG.adminPassword) return alert("Data tidak valid!");

    const { empId, employee, type, now } = window.pendingAttendanceData;
    await saveAttendance(empId, employee, type, now, reason);
    closeEarlyModal();
};

window.closeEarlyModal = () => document.getElementById('earlyOutModal').classList.add('hidden');

async function saveAttendance(empId, employee, type, now, reason = "") {
    const sched = getSchedule(now.getDay());
    let status = "On-Time";
    if (type === 'in' && sched && now > parseTime(sched.in)) status = "Late";
    if (type === 'out' && reason) status = "Early Out (Approved)";

    const { error } = await supabaseClient.from('attendance_logs').insert([{
        employee_id: empId, check_in_time: now.toISOString(), status, type, notes: reason
    }]);

    if (error) throw error;
    alert(`Wajah terdeteksi: ${employee.full_name}\nBerhasil ${type === 'in' ? 'Masuk' : 'Pulang'}`);
    
    document.getElementById('resultBox').classList.remove('hidden');
    document.getElementById('resultName').textContent = employee.full_name;
    document.getElementById('resultTime').textContent = now.toLocaleTimeString();
    document.getElementById('resultBadge').textContent = status;
}

// --- UTILS ---
async function loadEmployees() {
    const { data } = await supabaseClient.from('employees').select('id, full_name, face_embedding');
    allEmployees = data || [];
    attendanceEmployeeSelect.innerHTML = '<option value="">-- Pilih Nama --</option>';
    allEmployees.forEach(e => attendanceEmployeeSelect.innerHTML += `<option value="${e.id}">${e.full_name}</option>`);
}

async function loadHistory() {
    const body = document.getElementById('historyTableBody');
    if (!body) return;
    body.innerHTML = '<tr><td colspan="5" style="text-align:center;">Memuat data...</td></tr>';
    try {
        const { data, error } = await supabaseClient.from('attendance_logs').select('check_in_time, status, type, notes, employees (full_name)').order('check_in_time', { ascending: false }).limit(50);
        if (error || !data || data.length === 0) {
            body.innerHTML = '<tr><td colspan="5" style="text-align:center;">Belum ada riwayat absensi.</td></tr>';
            return;
        }
        body.innerHTML = '';
        data.forEach(log => {
            const time = new Date(log.check_in_time).toLocaleString('id-ID');
            const name = log.employees ? log.employees.full_name : "Tidak Dikenal";
            const typeText = log.type === 'in' ? '<span style="color:#10b981;">Masuk</span>' : '<span style="color:#ef4444;">Pulang</span>';
            body.innerHTML += `<tr><td><strong>${name}</strong></td><td>${time}</td><td>${typeText}</td><td><span class="badge">${log.status}</span></td><td>${log.notes || '-'}</td></tr>`;
        });
    } catch (e) { body.innerHTML = '<tr><td colspan="5" style="text-align:center;">Gagal sinkronisasi data.</td></tr>'; }
}

function parseTime(timeStr) {
    const now = new Date();
    const [h, m, s] = timeStr.split(':');
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
    CONFIG.adminPassword = newPass;
    alert("Pengaturan Berhasil Disimpan!");
};
