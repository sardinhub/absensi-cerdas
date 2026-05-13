// Elements
const timeDisplay = document.getElementById('currentTime');
const videoFeed = document.getElementById('videoFeed');
const scanStatus = document.getElementById('scanStatus');
const btnScan = document.getElementById('btnScan');
const scanOverlay = document.querySelector('.scan-overlay');
const resultBox = document.getElementById('resultBox');
const waitingState = document.getElementById('waitingState');

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
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        videoFeed.srcObject = stream;
        
        scanStatus.innerHTML = `
            <div class="status-icon loading" style="color: var(--primary)"><i class="ri-loader-4-line"></i></div>
            <div class="status-text">
                <h3>Loading Face Models...</h3>
                <p>Mengunduh file AI (Bisa butuh beberapa detik)</p>
            </div>
        `;

        // Load models dari CDN (jsdelivr raw github)
        const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL)
        ]);
        
        scanStatus.innerHTML = `
            <div class="status-icon" style="color: var(--success)"><i class="ri-checkbox-circle-line"></i></div>
            <div class="status-text">
                <h3>Camera Ready</h3>
                <p>Silakan posisikan wajah Anda di dalam kotak</p>
            </div>
        `;
        scanOverlay.classList.add('scanning');
        
    } catch (error) {
        console.error("Error accessing camera / loading models:", error);
        scanStatus.innerHTML = `
            <div class="status-icon" style="color: var(--danger)"><i class="ri-error-warning-line"></i></div>
            <div class="status-text">
                <h3>Camera Error</h3>
                <p>Akses kamera diblokir atau gagal dimuat</p>
            </div>
        `;
        throw error; // Lempar error agar tombol bisa di-reset
    }
}

// Set status awal saat halaman dimuat
scanStatus.innerHTML = `
    <div class="status-icon" style="color: var(--text-muted)"><i class="ri-vidicon-line"></i></div>
    <div class="status-text">
        <h3>Kamera Nonaktif</h3>
        <p>Klik tombol di bawah untuk menyalakan kamera</p>
    </div>
`;

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
btnScan.innerHTML = '<i class="ri-vidicon-line"></i> Nyalakan Kamera';

btnScan.addEventListener('click', async () => {
    if (!isCameraOn) {
        // Logika 1: Nyalakan kamera terlebih dahulu
        btnScan.innerHTML = '<i class="ri-loader-4-line status-icon loading"></i> Mempersiapkan Kamera...';
        btnScan.disabled = true;
        try {
            await startCamera();
            isCameraOn = true;
            btnScan.innerHTML = '<i class="ri-focus-3-line"></i> Pindai Wajah (Scan)';
        } catch (e) {
            btnScan.innerHTML = '<i class="ri-vidicon-line"></i> Coba Lagi';
        }
        btnScan.disabled = false;
        return;
    }

    // Logika 2: Jika kamera sudah menyala, lakukan scan wajah
    const originalText = btnScan.innerHTML;
    btnScan.innerHTML = '<i class="ri-loader-4-line status-icon loading"></i> Mendeteksi Wajah...';
    btnScan.disabled = true;
    scanOverlay.style.borderColor = 'var(--success)';

    try {
        // Proses deteksi dari video feed
        const detections = await faceapi.detectSingleFace(videoFeed, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks();
        
        if (!detections) {
            // Wajah tidak ditemukan
            alert("Wajah tidak terdeteksi! Pastikan wajah Anda terlihat jelas di kamera tanpa masker.");
            btnScan.innerHTML = originalText;
            btnScan.disabled = false;
            scanOverlay.style.borderColor = 'var(--danger)';
            setTimeout(() => scanOverlay.style.borderColor = 'var(--primary)', 2000);
            return;
        }

        // --- JIKA WAJAH TERDETEKSI, LANJUT ABSENSI ---
        const now = new Date(); // Menggunakan Waktu Asli Sekarang

        const timeStr = now.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit' });
        
        // Jalankan Kalkulasi Waktu (Berdasarkan jam sekarang)
        const logicResult = calculateAttendanceLogic(now);
        
        // Simpan ke Supabase
        if (SUPABASE_URL !== 'https://YOUR_PROJECT_ID.supabase.co') {
            try {
                // 1. Ambil data karyawan pertama sebagai dummy (karena kita belum mengimplementasikan Face Recognition utuh per-user)
                const { data: empData, error: empErr } = await supabase.from('employees').select('id, full_name, department').limit(1).single();
                
                if (empErr) throw empErr;
                
                if (empData) {
                    // 2. Insert log absensi
                    const { error: insErr } = await supabase.from('attendance_logs').insert([{
                        employee_id: empData.id,
                        check_in_time: now.toISOString(),
                        status: logicResult.status,
                        reward_amount: logicResult.reward,
                        penalty_amount: logicResult.penalty,
                        late_duration_minutes: logicResult.diffMinutes
                    }]);
                    
                    if (insErr) throw insErr;
                    console.log("Berhasil absen via deteksi wajah!");
                    
                    // Update UI dengan nama dari database
                    document.getElementById('resultName').textContent = empData.full_name;
                    document.getElementById('resultDept').textContent = empData.department;
                    
                    // Refresh Leaderboard
                    fetchLeaderboard();
                }
            } catch (err) {
                console.error("Gagal simpan ke Supabase:", err.message);
                alert("Gagal simpan ke database. Pastikan tabel & data karyawan sudah ada.");
            }
        }
        
        // Update UI Result Box
        displayResult(logicResult, timeStr);
        
    } catch (e) {
        console.error(e);
        alert("Terjadi kesalahan saat memproses deteksi wajah.");
    }

    // Reset button
    btnScan.innerHTML = originalText;
    btnScan.disabled = false;
    scanOverlay.style.borderColor = 'var(--primary)';
});

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

// Inisialisasi Supabase Client secara otomatis
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
console.log("Supabase Client disiapkan:", supabase);

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

// Panggil fungsi saat aplikasi dimuat pertama kali
fetchLeaderboard();
