// --- CONFIG & GLOBAL VARIABLES ---
const SUPABASE_URL = 'https://besicmdkrakjxevmrzly.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJlc2ljbWRrcmFranhldm1yemx5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MTI2MzMsImV4cCI6MjA5NDE4ODYzM30.j61NxM-HY-FxXXfD1Hj2WWEZpLxofdVBSIsE0hHDjxM';

const CONFIG = {
    workStartTime: '08:00:00',
    earlyBirdTime: '07:50:00',
    earlyBirdReward: 15000,
    latePenaltyPerMinute: 1000
};

let supabaseClient;
let isCameraOn = false;
let allEmployees = [];

// DOM Elements
let timeDisplay, videoFeed, scanStatus, btnScan, scanOverlay, resultBox, waitingState;
let videoRegister, registerSection, checkInGrid, attendanceEmployeeSelect;

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    timeDisplay = document.getElementById('currentTime');
    videoFeed = document.getElementById('videoFeed');
    scanStatus = document.getElementById('scanStatus');
    scanOverlay = document.querySelector('.scan-overlay');
    resultBox = document.getElementById('resultBox');
    waitingState = document.getElementById('waitingState');
    videoRegister = document.getElementById('videoRegister');
    registerSection = document.getElementById('registerSection');
    checkInGrid = document.getElementById('checkInGrid');
    attendanceEmployeeSelect = document.getElementById('attendanceEmployeeSelect');

    try {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log("Supabase initialized");
    } catch (e) { console.error(e); }

    setInterval(updateTime, 1000);
    updateTime();
    initOtherEvents();
    loadEmployees();
});

function updateTime() {
    if (!timeDisplay) return;
    const now = new Date();
    timeDisplay.textContent = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// --- TAB SWITCHING ---
window.switchTab = async function(tab) {
    const tabCheckIn = document.getElementById('tabCheckIn');
    const tabEmployees = document.getElementById('tabEmployees');
    const mainTitle = document.getElementById('mainTitle');
    const mainSubtitle = document.getElementById('mainSubtitle');

    if (tab === 'register') {
        tabCheckIn.classList.remove('active');
        tabEmployees.classList.add('active');
        checkInGrid.classList.add('hidden');
        registerSection.classList.remove('hidden');
        mainTitle.textContent = "Registrasi Staf";
        mainSubtitle.textContent = "Lengkapi data dan pindai wajah staf baru";
        await startCamera(videoRegister);
    } else {
        tabCheckIn.classList.add('active');
        tabEmployees.classList.remove('active');
        checkInGrid.classList.remove('hidden');
        registerSection.classList.add('hidden');
        mainTitle.textContent = "Biometric Auth";
        mainSubtitle.textContent = "Pilih nama dan scan wajah Anda";
        await startCamera(videoFeed);
    }
};

async function startCamera(videoElement) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return alert("Kamera tidak didukung");
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        videoElement.srcObject = stream;
        await videoElement.play();
        
        // Load AI Models if not loaded
        const api = window.faceapi || faceapi;
        const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';
        if (!api.nets.tinyFaceDetector.params) {
            await Promise.all([
                api.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                api.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
                api.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
            ]);
        }
    } catch (e) { console.error(e); }
}

// --- REGISTRATION LOGIC ---
window.handleFullRegistration = async function() {
    const name = document.getElementById('regName').value;
    const position = document.getElementById('regPosition').value;
    const birth = document.getElementById('regBirth').value;
    
    if (!name || !position || !birth) return alert("Mohon lengkapi semua data!");

    const btn = document.getElementById('btnCaptureFace');
    btn.disabled = true;
    btn.innerHTML = '<i class="ri-loader-4-line loading"></i> Memproses...';

    try {
        const api = window.faceapi || faceapi;
        const detections = await api.detectSingleFace(videoRegister, new api.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptor();

        if (!detections) {
            alert("Wajah tidak terdeteksi!");
        } else {
            const descriptor = Array.from(detections.descriptor);
            const { error } = await supabaseClient.from('employees').insert([{
                full_name: name,
                position: position,
                birth_date: birth,
                face_embedding: descriptor
            }]);
            
            if (error) throw error;
            alert("SUKSES! Staf " + name + " telah terdaftar.");
            loadEmployees();
            switchTab('checkin');
        }
    } catch (e) { alert("Gagal: " + e.message); }
    btn.disabled = false;
    btn.innerHTML = '<i class="ri-user-add-line"></i> Simpan Data & Wajah';
};

// --- ATTENDANCE LOGIC (MASUK / PULANG) ---
window.handleAttendance = async function(type) {
    const empId = attendanceEmployeeSelect.value;
    if (!empId) return alert("Pilih nama Anda terlebih dahulu!");

    const employee = allEmployees.find(e => e.id === empId);
    if (!employee || !employee.face_embedding) return alert("Data wajah Anda belum terdaftar. Silakan hubungi Admin.");

    const statusText = type === 'in' ? "Masuk" : "Pulang";
    scanStatus.innerHTML = `<div class="status-text"><h3>Memproses ${statusText}...</h3><p>Jangan gerakkan wajah Anda</p></div>`;

    try {
        const api = window.faceapi || faceapi;
        const detections = await api.detectSingleFace(videoFeed, new api.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptor();

        if (!detections) {
            alert("Wajah tidak terdeteksi!");
            return;
        }

        // VERIFIKASI WAJAH (Euclidean Distance)
        const storedDescriptor = new Float32Array(employee.face_embedding);
        const distance = api.euclideanDistance(detections.descriptor, storedDescriptor);
        
        console.log("Distance:", distance);

        if (distance > 0.6) {
            alert("Wajah TIDAK COCOK! Pastikan itu adalah Anda.");
            return;
        }

        // Jika cocok, catat absensi
        const now = new Date();
        const logic = calculateAttendanceLogic(now, type);
        
        const { error } = await supabaseClient.from('attendance_logs').insert([{
            employee_id: empId,
            check_in_time: now.toISOString(),
            status: logic.status,
            type: type, // Pastikan kolom ini ada di database
            reward_amount: logic.reward,
            penalty_amount: logic.penalty,
            late_duration_minutes: logic.diffMinutes
        }]);

        if (error) throw error;

        document.getElementById('resultName').textContent = employee.full_name;
        document.getElementById('resultDept').textContent = employee.position || "-";
        document.getElementById('resultTime').textContent = now.toLocaleTimeString();
        document.getElementById('resultBadge').textContent = logic.status;
        document.getElementById('resultBadge').className = 'badge ' + (logic.status === 'Late' ? 'badge-danger' : 'badge-success');
        document.getElementById('resultMoney').textContent = type === 'in' ? (logic.reward > 0 ? "+ " + logic.reward : logic.penalty > 0 ? "- " + logic.penalty : "Normal") : "Berhasil Pulang";
        
        waitingState.classList.add('hidden');
        resultBox.classList.remove('hidden');
        fetchLeaderboard();

    } catch (e) { alert("Error: " + e.message); }
};

function calculateAttendanceLogic(now, type) {
    if (type === 'out') return { status: 'Pulang', reward: 0, penalty: 0, diffMinutes: 0 };

    const workStart = parseTime(CONFIG.workStartTime);
    const earlyBird = parseTime(CONFIG.earlyBirdTime);
    let status = 'On-Time', reward = 0, penalty = 0, diffMinutes = 0;

    if (now <= earlyBird) {
        status = 'Early Bird';
        reward = CONFIG.earlyBirdReward;
    } else if (now > workStart) {
        status = 'Late';
        diffMinutes = Math.floor((now - workStart) / 60000);
        penalty = diffMinutes * CONFIG.latePenaltyPerMinute;
    }
    return { status, reward, penalty, diffMinutes };
}

function parseTime(timeStr) {
    const now = new Date();
    const [h, m, s] = timeStr.split(':');
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, s || 0);
}

async function loadEmployees() {
    try {
        const { data } = await supabaseClient.from('employees').select('id, full_name, position, face_embedding');
        allEmployees = data || [];
        attendanceEmployeeSelect.innerHTML = '<option value="">-- Pilih Nama Anda --</option>';
        allEmployees.forEach(emp => {
            attendanceEmployeeSelect.innerHTML += `<option value="${emp.id}">${emp.full_name}</option>`;
        });
    } catch (e) {}
}

async function fetchLeaderboard() {
    try {
        const { data } = await supabaseClient.from('attendance_logs').select('check_in_time, status, type, employees(full_name)').order('check_in_time', { ascending: false }).limit(10);
        const list = document.querySelector('.leaderboard-list');
        list.innerHTML = '';
        data.forEach(log => {
            const time = new Date(log.check_in_time).toLocaleTimeString();
            const name = log.employees ? log.employees.full_name : "User";
            const typeText = log.type === 'in' ? "Masuk" : "Pulang";
            list.innerHTML += `<li><div class="user-meta"><span>${name} (${typeText})</span></div><span class="badge">${time}</span></li>`;
        });
    } catch (e) {}
}

function initOtherEvents() {
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.querySelector('.sidebar');
    if (menuToggle && sidebar) {
        menuToggle.addEventListener('click', () => sidebar.classList.toggle('open'));
        document.querySelector('.main-content').addEventListener('click', () => sidebar.classList.remove('open'));
    }
}
