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
let globalAttendanceData = [];

// DOM Elements
let timeDisplay, videoFeed, scanStatus, btnScan, scanOverlay, resultBox, waitingState;
let videoRegister, registerSection, checkInGrid, employeeSelect;

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    // Mapping Elements
    timeDisplay = document.getElementById('currentTime');
    videoFeed = document.getElementById('videoFeed');
    scanStatus = document.getElementById('scanStatus');
    btnScan = document.getElementById('btnScan');
    scanOverlay = document.querySelector('.scan-overlay');
    resultBox = document.getElementById('resultBox');
    waitingState = document.getElementById('waitingState');
    
    // New Registration Elements
    videoRegister = document.getElementById('videoRegister');
    registerSection = document.getElementById('registerSection');
    checkInGrid = document.querySelector('.grid-layout');
    employeeSelect = document.getElementById('employeeSelect');

    // Init Supabase
    try {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log("Supabase initialized");
    } catch (e) {
        console.error("Supabase init error", e);
    }

    // Start Clock
    setInterval(updateTime, 1000);
    updateTime();

    // Bind other events
    initOtherEvents();

    // Load initial leaderboard
    if (supabaseClient) fetchLeaderboard();
});

// --- CORE FUNCTIONS ---

function updateTime() {
    if (!timeDisplay) return;
    const now = new Date();
    timeDisplay.textContent = now.toLocaleTimeString('en-US', { 
        hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' 
    });
}

window.handleMainAction = async function() {
    console.log("Action triggered");
    if (!btnScan) btnScan = document.getElementById('btnScan');
    
    if (!isCameraOn) {
        // STEP 1: Turn on Camera
        btnScan.innerHTML = '<i class="ri-loader-4-line status-icon loading"></i> Menyiapkan...';
        btnScan.disabled = true;
        try {
            await startCamera();
            isCameraOn = true;
            btnScan.innerHTML = '<i class="ri-focus-3-line"></i> Pindai Wajah (Scan)';
        } catch (e) {
            btnScan.innerHTML = '<i class="ri-vidicon-line"></i> Coba Lagi';
            alert("Gagal memulai kamera: " + e.message);
        }
        btnScan.disabled = false;
        return;
    }

    // STEP 2: Perform Face Scan
    const originalText = btnScan.innerHTML;
    btnScan.innerHTML = '<i class="ri-loader-4-line status-icon loading"></i> Mendeteksi...';
    btnScan.disabled = true;

    try {
        const api = window.faceapi || faceapi;
        if (!api) throw new Error("FaceAPI library belum termuat.");

        const detections = await api.detectSingleFace(videoFeed, new api.TinyFaceDetectorOptions()).withFaceLandmarks();
        
        if (!detections) {
            alert("Wajah tidak ditemukan. Pastikan wajah terlihat jelas di kamera.");
            btnScan.innerHTML = originalText;
            btnScan.disabled = false;
            return;
        }

        // SUCCESS! Process Attendance
        await processAttendance();

    } catch (e) {
        alert("Error Deteksi: " + e.message);
    }

    btnScan.innerHTML = originalText;
    btnScan.disabled = false;
};

async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Browser tidak mendukung kamera");
    }

    const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user' }, 
        audio: false 
    });
    videoFeed.srcObject = stream;
    
    try { await videoFeed.play(); } catch(e) {}

    // Load AI Models
    scanStatus.innerHTML = '<div class="status-text"><h3>Loading AI...</h3><p>Mengunduh model deteksi wajah</p></div>';
    
    const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';
    const api = window.faceapi || faceapi;
    
    await Promise.all([
        api.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        api.nets.faceLandmark68Net.loadFromUri(MODEL_URL)
    ]);

    scanStatus.innerHTML = '<div class="status-text"><h3>Kamera Siap</h3><p>Posisikan wajah Anda di kotak</p></div>';
    if (scanOverlay) scanOverlay.classList.add('scanning');
}

async function processAttendance() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit' });
    
    const result = calculateAttendanceLogic(now);
    
    // Save to Supabase
    if (supabaseClient) {
        try {
            const { data: empData } = await supabaseClient.from('employees').select('id, full_name, department').limit(1).single();
            if (empData) {
                await supabaseClient.from('attendance_logs').insert([{
                    employee_id: empData.id,
                    check_in_time: now.toISOString(),
                    status: result.status,
                    reward_amount: result.reward,
                    penalty_amount: result.penalty,
                    late_duration_minutes: result.diffMinutes
                }]);
                document.getElementById('resultName').textContent = empData.full_name;
                document.getElementById('resultDept').textContent = empData.department;
                fetchLeaderboard();
            }
        } catch (e) { console.error("Database save error", e); }
    }

    displayResult(result, timeStr);
}

function calculateAttendanceLogic(checkInDate) {
    const workStart = parseTime(CONFIG.workStartTime);
    const earlyBird = parseTime(CONFIG.earlyBirdTime);
    let status = 'On-Time', reward = 0, penalty = 0, diffMinutes = 0;

    if (checkInDate <= earlyBird) {
        status = 'Early Bird';
        reward = CONFIG.earlyBirdReward;
    } else if (checkInDate > workStart) {
        status = 'Late';
        diffMinutes = Math.floor((checkInDate - workStart) / 60000);
        penalty = diffMinutes * CONFIG.latePenaltyPerMinute;
    }
    return { status, reward, penalty, diffMinutes };
}

function parseTime(timeStr) {
    const now = new Date();
    const [h, m, s] = timeStr.split(':');
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, s || 0);
}

function displayResult(res, timeStr) {
    if (waitingState) waitingState.classList.add('hidden');
    if (resultBox) resultBox.classList.remove('hidden');
    document.getElementById('resultTime').textContent = timeStr;
    
    const badge = document.getElementById('resultBadge');
    const money = document.getElementById('resultMoney');
    badge.textContent = res.status;
    
    if (res.status === 'Early Bird') {
        badge.className = 'badge badge-success';
        money.textContent = `+ Rp ${res.reward.toLocaleString()} (Reward)`;
    } else if (res.status === 'Late') {
        badge.className = 'badge badge-danger';
        money.textContent = `- Rp ${res.penalty.toLocaleString()} (${res.diffMinutes} min)`;
    } else {
        badge.className = 'badge';
        badge.style.background = 'rgba(59, 130, 246, 0.2)';
        money.textContent = 'Rp 0 (Normal)';
    }
}

async function fetchLeaderboard() {
    try {
        const { data } = await supabaseClient.from('attendance_logs').select('check_in_time, status, employees(full_name)').order('check_in_time', { ascending: false }).limit(10);
        if (!data) return;
        
        globalAttendanceData = data;
        const list = document.querySelector('.leaderboard-list');
        list.innerHTML = '';
        
        data.forEach(log => {
            const time = new Date(log.check_in_time).toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit' });
            const name = log.employees ? log.employees.full_name : "User";
            list.innerHTML += `<li><div class="user-meta"><span>${name}</span></div><span class="badge">${time}</span></li>`;
        });
    } catch (e) {}
}

function initOtherEvents() {
    document.getElementById('btnFingerprint')?.addEventListener('click', () => alert('WebAuthn segera hadir.'));
    document.getElementById('btnExportPdf')?.addEventListener('click', () => alert('PDF Exporting...'));
    
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.querySelector('.sidebar');
    if (menuToggle && sidebar) {
        menuToggle.addEventListener('click', () => sidebar.classList.toggle('open'));
        document.querySelector('.main-content').addEventListener('click', () => sidebar.classList.remove('open'));
    }
}

// --- TAB SWITCHING & REGISTRATION ---
window.switchTab = async function(tab) {
    const tabCheckIn = document.getElementById('tabCheckIn');
    const tabEmployees = document.getElementById('tabEmployees');
    
    if (tab === 'register') {
        tabCheckIn.classList.remove('active');
        tabEmployees.classList.add('active');
        checkInGrid.classList.add('hidden');
        registerSection.classList.remove('hidden');
        
        await startRegistrationCamera();
        loadEmployeesToSelect();
    } else {
        tabCheckIn.classList.add('active');
        tabEmployees.classList.remove('active');
        checkInGrid.classList.remove('hidden');
        registerSection.classList.add('hidden');
        
        if (videoRegister.srcObject) {
            videoRegister.srcObject.getTracks().forEach(t => t.stop());
        }
    }
};

async function startRegistrationCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        videoRegister.srcObject = stream;
        
        const api = window.faceapi || faceapi;
        const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';
        await Promise.all([
            api.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
            api.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            api.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);
    } catch (e) {
        alert("Gagal kamera registrasi: " + e.message);
    }
}

async function loadEmployeesToSelect() {
    const { data } = await supabaseClient.from('employees').select('id, full_name, employee_id');
    employeeSelect.innerHTML = '<option value="">-- Pilih Nama Staf --</option>';
    if(data) {
        data.forEach(emp => {
            employeeSelect.innerHTML += `<option value="${emp.id}">${emp.full_name} (${emp.employee_id || '-'})</option>`;
        });
    }
}

window.handleRegisterFace = async function() {
    const empId = employeeSelect.value;
    if (!empId) return alert("Pilih staf terlebih dahulu!");
    
    const btn = document.getElementById('btnCaptureFace');
    btn.disabled = true;
    btn.innerHTML = '<i class="ri-loader-4-line loading"></i> Memproses...';

    try {
        const api = window.faceapi || faceapi;
        const detections = await api.detectSingleFace(videoRegister, new api.TinyFaceDetectorOptions())
                                    .withFaceLandmarks()
                                    .withFaceDescriptor();

        if (!detections) {
            alert("Wajah tidak terdeteksi!");
        } else {
            const descriptor = Array.from(detections.descriptor);
            const { error } = await supabaseClient
                .from('employees')
                .update({ face_embedding: descriptor })
                .eq('id', empId);
            
            if (error) throw error;
            alert("BERHASIL! Wajah staf telah didaftarkan.");
        }
    } catch (e) {
        alert("Gagal: " + e.message);
    }
    
    btn.disabled = false;
    btn.innerHTML = '<i class="ri-camera-lens-line"></i> Daftarkan Wajah';
};
