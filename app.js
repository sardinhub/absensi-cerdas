// Elements
let timeDisplay, videoFeed, scanStatus, btnScan, scanOverlay, resultBox, waitingState;

// Early Alert untuk tes apakah JS jalan
console.log("App.js Loaded");

document.addEventListener('DOMContentLoaded', () => {
    timeDisplay = document.getElementById('currentTime');
    videoFeed = document.getElementById('videoFeed');
    scanStatus = document.getElementById('scanStatus');
    btnScan = document.getElementById('btnScan');
    scanOverlay = document.querySelector('.scan-overlay');
    resultBox = document.getElementById('resultBox');
    waitingState = document.getElementById('waitingState');
    
    // Inisialisasi UI awal
    if (btnScan) btnScan.innerHTML = '<i class="ri-vidicon-line"></i> Nyalakan Kamera';
    if (scanStatus) {
        scanStatus.innerHTML = `
            <div class="status-icon" style="color: var(--text-muted)"><i class="ri-vidicon-line"></i></div>
            <div class="status-text">
                <h3>Kamera Nonaktif</h3>
                <p>Klik tombol di bawah untuk menyalakan kamera</p>
            </div>
        `;
    }
    
    // Bind Events
    initEvents();
    
    // Start Clock
    setInterval(updateTime, 1000);
    updateTime();
    
    // Load Leaderboard
    if (supabase) fetchLeaderboard();
});

// Config dari Database (Simulasi settings_config MVP)
const CONFIG = {
    workStartTime: '08:00:00',
    earlyBirdTime: '07:50:00',
    earlyBirdReward: 15000,
    latePenaltyPerMinute: 1000
};

// Update Jam Real-time
function updateTime() {
    const now = new Date();
    timeDisplay.textContent = now.toLocaleTimeString('en-US', { 
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
    });
}
setInterval(updateTime, 1000);
updateTime();

// --- 1. BIOMETRIC AUTHENTICATION (Camera Init & Load Models) ---
async function startCamera() {
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error("Browser Anda tidak mendukung akses kamera (MediaDevices missing)");
        }

        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'user' }, 
            audio: false 
        });
        videoFeed.srcObject = stream;
        
        try {
            await videoFeed.play();
        } catch(e) { console.log("Play error", e); }
        
        scanStatus.innerHTML = `
            <div class="status-icon loading" style="color: var(--primary)"><i class="ri-loader-4-line"></i></div>
            <div class="status-text">
                <h3>Loading AI Models...</h3>
                <p>Sabar, sedang mengunduh data pintar</p>
            </div>
        `;

        const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';
        // Pastikan faceapi tersedia
        const api = window.faceapi || faceapi;
        if (!api) throw new Error("Library Face-API gagal dimuat dari internet.");

        await Promise.all([
            api.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
            api.nets.faceLandmark68Net.loadFromUri(MODEL_URL)
        ]);
        
        scanStatus.innerHTML = `
            <div class="status-icon" style="color: var(--success)"><i class="ri-checkbox-circle-line"></i></div>
            <div class="status-text">
                <h3>Kamera Siap</h3>
                <p>Posisikan wajah Anda dengan jelas</p>
            </div>
        `;
        scanOverlay.classList.add('scanning');
    } catch (error) {
        alert("Kamera Error: " + error.message);
        scanStatus.innerHTML = `<div class="status-text"><h3>Error</h3><p>${error.message}</p></div>`;
        throw error;
    }
}

// --- 2. LOGIC ENGINE (Smart Timing & Reward-Penalty) ---

// Fungsi helper untuk mengubah string HH:mm:ss ke Date object di hari ini
function parseTime(timeStr) {
    const now = new Date();
    const [hours, minutes, seconds] = timeStr.split(':');
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, seconds || 0);
}

function calculateAttendanceLogic(checkInDate) {
    const workStart = parseTime(CONFIG.workStartTime);
    const earlyBird = parseTime(CONFIG.earlyBirdTime);

    let status = '';
    let reward = 0;
    let penalty = 0;
    let diffMinutes = 0;

    // Hitung selisih waktu
    if (checkInDate <= earlyBird) {
        status = 'Early Bird';
        reward = CONFIG.earlyBirdReward;
    } else if (checkInDate > earlyBird && checkInDate <= workStart) {
        status = 'On-Time';
    } else {
        status = 'Late';
        // Hitung menit keterlambatan
        const diffMs = checkInDate - workStart;
        diffMinutes = Math.floor(diffMs / 60000);
        penalty = diffMinutes * CONFIG.latePenaltyPerMinute;
    }

    return { status, reward, penalty, diffMinutes };
}

// Format Rupiah
function formatCurrency(amount) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(amount);
}

// Tampilkan hasil di UI
function displayResult(logicResult, timeStr) {
    waitingState.classList.add('hidden');
    resultBox.classList.remove('hidden');

    document.getElementById('resultTime').textContent = timeStr;
    
    const badge = document.getElementById('resultBadge');
    const money = document.getElementById('resultMoney');

    badge.textContent = logicResult.status;
    badge.className = 'badge'; // reset class
    
    if (logicResult.status === 'Early Bird') {
        badge.classList.add('badge-success');
        money.textContent = `+ ${formatCurrency(logicResult.reward)} (Reward)`;
        money.className = 'text-success';
    } else if (logicResult.status === 'On-Time') {
        badge.style.background = 'rgba(59, 130, 246, 0.2)';
        badge.style.color = '#3b82f6';
        money.textContent = 'Rp 0 (Normal)';
        money.style.color = '#f8fafc';
    } else if (logicResult.status === 'Late') {
        badge.classList.add('badge-danger');
        money.textContent = `- ${formatCurrency(logicResult.penalty)} (${logicResult.diffMinutes} mins)`;
        money.className = 'text-danger';
    }
}

// --- Deteksi Wajah Asli saat Tombol Ditekan ---
let isCameraOn = false;

window.handleMainAction = async function() {
    console.log("handleMainAction terpanggil!");
    
    // Inisialisasi element jika belum (untuk jaga-jaga)
    if (!btnScan) btnScan = document.getElementById('btnScan');
    if (!scanStatus) scanStatus = document.getElementById('scanStatus');
    if (!videoFeed) videoFeed = document.getElementById('videoFeed');

    if (!isCameraOn) {
        btnScan.innerHTML = '<i class="ri-loader-4-line status-icon loading"></i> Menyiapkan...';
        btnScan.disabled = true;
        try {
            await startCamera();
            isCameraOn = true;
            btnScan.innerHTML = '<i class="ri-focus-3-line"></i> Pindai Wajah (Scan)';
        } catch (e) {
            btnScan.innerHTML = '<i class="ri-vidicon-line"></i> Coba Lagi';
            alert("Gagal Start: " + e.message);
        }
        btnScan.disabled = false;
        return;
    }

    const originalText = btnScan.innerHTML;
    btnScan.innerHTML = '<i class="ri-loader-4-line status-icon loading"></i> Mencari Wajah...';
    btnScan.disabled = true;
    if (scanOverlay) scanOverlay.style.borderColor = 'var(--success)';

    try {
        const api = window.faceapi || faceapi;
        if (!api) throw new Error("FaceAPI library belum siap.");
        
        const detections = await api.detectSingleFace(videoFeed, new api.TinyFaceDetectorOptions()).withFaceLandmarks();
        
        if (!detections) {
            alert("Wajah tidak terdeteksi! Pastikan pencahayaan cukup.");
            btnScan.innerHTML = originalText;
            btnScan.disabled = false;
            return;
        }

        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit' });
        const logicResult = calculateAttendanceLogic(now);
        
        if (supabase) {
            try {
                const { data: empData, error: empErr } = await supabase.from('employees').select('id, full_name, department').limit(1).single();
                if (empData) {
                    await supabase.from('attendance_logs').insert([{
                        employee_id: empData.id,
                        check_in_time: now.toISOString(),
                        status: logicResult.status,
                        reward_amount: logicResult.reward,
                        penalty_amount: logicResult.penalty,
                        late_duration_minutes: logicResult.diffMinutes
                    }]);
                    document.getElementById('resultName').textContent = empData.full_name;
                    document.getElementById('resultDept').textContent = empData.department;
                    fetchLeaderboard();
                }
            } catch (err) { console.error(err); }
        }
        displayResult(logicResult, timeStr);
    } catch (e) {
        alert("Deteksi Error: " + e.message);
    }

    btnScan.innerHTML = originalText;
    btnScan.disabled = false;
    if (scanOverlay) scanOverlay.style.borderColor = 'var(--primary)';
};

function initEvents() {
    // Event listener untuk tombol lain tetap ada
    document.getElementById('btnFingerprint')?.addEventListener('click', () => {
        alert('Fitur sidik jari segera hadir.');
    });

    document.getElementById('btnExportPdf')?.addEventListener('click', handleExportPdf);

    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.querySelector('.sidebar');
    if (menuToggle && sidebar) {
        menuToggle.addEventListener('click', () => sidebar.classList.toggle('open'));
        document.querySelector('.main-content').addEventListener('click', () => sidebar.classList.remove('open'));
    }
}

function handleExportPdf() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.text("Laporan Absensi", 14, 22);
    // ... logic disederhanakan untuk stabilitas
    doc.save("Laporan.pdf");
}

// PWA / WebAuthn API untuk Fingerprint (Mock MVP)
document.getElementById('btnFingerprint').addEventListener('click', async () => {
    try {
        // Memanggil WebAuthn API (jika disupport browser/device)
        if (window.PublicKeyCredential) {
            alert('Memanggil sensor biometrik perangkat (Windows Hello / Touch ID / Face ID)...');
            // Implementasi navigator.credentials.get() akan di sini
        } else {
            alert('WebAuthn tidak didukung di perangkat ini.');
        }
    } catch (e) {
        console.error(e);
    }
});

// --- 3. EXPORT REPORT TO PDF ---
document.getElementById('btnExportPdf')?.addEventListener('click', () => {
    // Pastikan jsPDF sudah diload dari CDN
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Header Laporan
    doc.setFontSize(18);
    doc.text("Laporan Disiplin & Rekap Payroll Karyawan", 14, 22);
    
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text("Tanggal Cetak: " + new Date().toLocaleDateString('id-ID'), 14, 30);
    
    // Data Mock untuk PDF (Nantinya ini akan ditarik dari tabel Supabase: attendance_logs)
    let tableData = [
        ["Belum ada data", "-", "-", "-", "-"]
    ];
    
    if (globalAttendanceData && globalAttendanceData.length > 0) {
        tableData = globalAttendanceData.map(log => {
            const timeDate = new Date(log.check_in_time);
            const timeStr = timeDate.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit' });
            return [
                log.employees ? log.employees.full_name : "Unknown",
                timeStr,
                log.status,
                formatCurrency(log.reward_amount),
                formatCurrency(log.penalty_amount)
            ];
        });
    }
    
    // Gunakan plugin jspdf-autotable
    doc.autoTable({
        startY: 35,
        head: [['Nama Karyawan', 'Waktu Hadir', 'Status', 'Total Reward', 'Total Denda']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [59, 130, 246] }, // Warna biru primer
        styles: { font: 'helvetica', fontSize: 10 },
    });
    
    // Simpan PDF ke perangkat pengguna
    doc.save("Laporan_Absensi_Payroll.pdf");
});

// --- 4. SUPABASE INITIALIZATION (Persiapan Integrasi) ---
/*
  Langkah selanjutnya:
  1. Buat project di https://supabase.com
  2. Masukkan URL dan anon_key di bawah ini.
*/
const SUPABASE_URL = 'https://besicmdkrakjxevmrzly.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJlc2ljbWRrcmFranhldm1yemx5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MTI2MzMsImV4cCI6MjA5NDE4ODYzM30.j61NxM-HY-FxXXfD1Hj2WWEZpLxofdVBSIsE0hHDjxM';

// Inisialisasi Supabase Client secara otomatis dengan Try-Catch
let supabase;
try {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("Supabase Client disiapkan:", supabase);
} catch (e) {
    console.error("Gagal inisialisasi Supabase:", e);
}

// --- 5. FETCH DATA REAL DARI SUPABASE ---
let globalAttendanceData = [];

async function fetchLeaderboard() {
    try {
        const { data, error } = await supabase
            .from('attendance_logs')
            .select(`
                check_in_time, 
                status, 
                reward_amount, 
                penalty_amount,
                employees ( full_name )
            `)
            .order('check_in_time', { ascending: false })
            .limit(10);

        if (error) throw error;
        
        globalAttendanceData = data;
        const list = document.querySelector('.leaderboard-list');
        list.innerHTML = ''; // Kosongkan daftar mock sebelumnya
        
        if(data.length === 0) {
            list.innerHTML = '<li style="justify-content:center; color:var(--text-muted)">Belum ada data hari ini.</li>';
            return;
        }

        data.forEach(log => {
            const timeDate = new Date(log.check_in_time);
            const timeStr = timeDate.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit' });
            
            // Tentukan warna badge berdasarkan status
            let badgeClass = 'badge-success'; // Default Early Bird
            if (log.status === 'Late') badgeClass = 'badge-danger';
            else if (log.status === 'On-Time') badgeClass = ''; // Gunakan style default di CSS
            
            const employeeName = log.employees ? log.employees.full_name : "Unknown";
            
            list.innerHTML += `
                <li>
                    <div class="user-meta">
                        <!-- Menggunakan UI Avatars untuk gambar profil dinamis -->
                        <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(employeeName)}&background=random" alt="Avatar">
                        <span>${employeeName}</span>
                    </div>
                    <span class="badge ${badgeClass}" ${log.status === 'On-Time' ? 'style="background: rgba(59,130,246,0.2); color:#3b82f6;"' : ''}>
                        ${timeStr}
                    </span>
                </li>
            `;
        });
        
    } catch (err) {
        console.error("Gagal load leaderboard:", err.message);
    }
}

// Panggil fungsi saat aplikasi dimuat pertama kali diserahkan ke DOMContentLoaded
