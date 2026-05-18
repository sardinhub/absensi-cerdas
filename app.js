// --- CONFIG & GLOBAL VARIABLES ---
const FACE_MATCH_THRESHOLD = 0.6; // Threshold cocok wajah (semakin besar = semakin longgar)
const MAX_PENALTY_FALLBACK = 50000; // Fallback maks denda jika config belum terbaca
const SUPABASE_URL = 'https://besicmdkrakjxevmrzly.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJlc2ljbWRrcmFranhldm1yemx5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MTI2MzMsImV4cCI6MjA5NDE4ODYzM30.j61NxM-HY-FxXXfD1Hj2WWEZpLxofdVBSIsE0hHDjxM';

let CONFIG = { 
    adminPassword: '123', 
    latePenaltyPerMinute: 1000, 
    earlyBirdReward: 15000, 
    earlyBirdBuffer: 10, 
    maxDailyPenalty: 50000, 
    enableGeofencing: false, 
    officeLatitude: -6.200000, 
    officeLongitude: 106.816666, 
    allowedRadiusMeters: 100,
    // Jam Kerja Fleksibel (Default)
    workStartTimeWeekday: '07:45:00',
    workEndTimeWeekday: '17:00:00',
    workStartTimeSaturday: '07:45:00',
    workEndTimeSaturday: '14:00:00',
    // Jam Piket Fleksibel (Default)
    piketStartTime: '17:00:00',
    piketEndTime: '21:00:00'
};
let supabaseClient;
let isAdmin = false;
let allEmployees = [];
let videoFeed, videoRegister, videoFeedPiket, attendanceEmployeeSelect, piketEmployeeSelect;

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    videoFeed = document.getElementById('videoFeed');
    videoRegister = document.getElementById('videoRegister');
    videoFeedPiket = document.getElementById('videoFeedPiket');
    attendanceEmployeeSelect = document.getElementById('attendanceEmployeeSelect');
    piketEmployeeSelect = document.getElementById('piketEmployeeSelect');
    try {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        loadSettings();
    } catch (e) { console.error(e); }
    setInterval(updateTime, 1000);
    updateTime();
    loadEmployees();
    checkSystemStatus();

    // Mobile Menu Toggle
    const menuBtn = document.getElementById('menuToggle');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebarOverlay');

    function toggleMenu() {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('active');
    }

    if (menuBtn && sidebar && overlay) {
        menuBtn.addEventListener('click', toggleMenu);
        overlay.addEventListener('click', toggleMenu);
        
        // Auto close sidebar when clicking a nav link on mobile
        const navLinks = sidebar.querySelectorAll('.nav-links a');
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                if (window.innerWidth <= 768) toggleMenu();
            });
    }

    // Auto-refresh untuk Riwayat dan Laporan setiap 2 detik tanpa kedip (flicker)
    setInterval(() => {
        if (document.getElementById('tabHistory')?.classList.contains('active')) {
            loadHistory(true);
        }
        if (document.getElementById('tabReport')?.classList.contains('active')) {
            loadReport(true);
        }
    }, 2000);
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
    if (dayIndex === 0) return null; // Minggu libur
    if (dayIndex === 6) return { in: CONFIG.workStartTimeSaturday, out: CONFIG.workEndTimeSaturday }; // Sabtu
    return { in: CONFIG.workStartTimeWeekday, out: CONFIG.workEndTimeWeekday }; // Senin-Jumat
}

// --- ADMIN & TAB SYSTEM ---
window.toggleAdminLogin = () => {
    if (isAdmin) {
        isAdmin = false; 
        document.body.classList.remove('is-admin'); 
        document.getElementById('adminBtn').innerHTML = '<i class="ri-admin-line"></i> Login Admin'; 
        switchTab('checkin');
        checkSystemStatus(); // Tampilkan kembali overlay offline jika di luar jam kantor (Minggu)
    } else {
        document.getElementById('loginModal').classList.toggle('hidden');
    }
};

window.processAdminLogin = () => {
    const pass = document.getElementById('loginPass').value;
    if (pass === CONFIG.adminPassword) {
        isAdmin = true; 
        document.body.classList.add('is-admin');
        document.getElementById('adminBtn').innerHTML = '<i class="ri-logout-box-line"></i> Logout Admin';
        document.getElementById('loginModal').classList.add('hidden');
        document.getElementById('offlineOverlay')?.classList.add('hidden'); // Sembunyikan overlay offline jika login admin sukses
    } else alert("Password Salah!");
};

// --- OFFLINE ADMIN BYPASS ---
window.showOfflineBypassForm = () => {
    document.getElementById('offlineMainContent').classList.add('hidden');
    document.getElementById('offlineBypassForm').classList.remove('hidden');
    document.getElementById('offlineAdminPass').value = '';
    document.getElementById('offlineErrorMsg').classList.add('hidden');
    document.getElementById('offlineAdminPass').focus();
};

window.hideOfflineBypassForm = () => {
    document.getElementById('offlineBypassForm').classList.add('hidden');
    document.getElementById('offlineMainContent').classList.remove('hidden');
};

window.submitOfflineBypass = () => {
    const pass = document.getElementById('offlineAdminPass').value;
    if (pass === CONFIG.adminPassword) {
        isAdmin = true;
        document.body.classList.add('is-admin');
        document.getElementById('adminBtn').innerHTML = '<i class="ri-logout-box-line"></i> Logout Admin';
        document.getElementById('offlineOverlay').classList.add('hidden');
        
        // Kembalikan form offline bypass ke kondisi awal
        hideOfflineBypassForm();
        
        // Arahkan admin ke halaman manajemen staf agar bisa langsung mengelola aplikasi
        switchTab('register');
    } else {
        const errMsg = document.getElementById('offlineErrorMsg');
        errMsg.classList.remove('hidden');
        
        // Efek getar untuk input salah (micro-animation premium)
        const form = document.getElementById('offlineBypassForm');
        form.style.animation = 'none';
        form.offsetHeight; // trigger reflow
        form.style.animation = 'shake 0.4s ease';
    }
};

window.switchTab = async function(tab) {
    const titles = { 
        checkin: ["Biometric Auth", "Pilih nama dan scan wajah"], 
        piket: ["Biometric Piket", "Absensi masuk dan pulang piket"],
        register: ["Manajemen Staf", "Kelola data dan wajah staf"], 
        history: ["Riwayat Aktivitas", "Raw logs aktivitas staf"], 
        report: ["Laporan Kehadiran", "Rekapitulasi performa staf"], 
        settings: ["Pengaturan", "Kelola sistem"] 
    };
    [document.getElementById('tabCheckIn'), document.getElementById('tabPiket'), document.getElementById('tabEmployees'), document.getElementById('tabHistory'), document.getElementById('tabReport'), document.getElementById('tabSettings')].forEach(t => t?.classList.remove('active'));
    [document.getElementById('checkInGrid'), document.getElementById('piketGrid'), document.getElementById('registerSection'), document.getElementById('historySection'), document.getElementById('reportSection'), document.getElementById('settingsSection')].forEach(s => s?.classList.add('hidden'));
    stopAllCameras();
    const activeTab = document.getElementById(
        tab === 'checkin' ? 'tabCheckIn' : 
        tab === 'piket' ? 'tabPiket' : 
        tab === 'register' ? 'tabEmployees' : 
        tab === 'history' ? 'tabHistory' : 
        tab === 'report' ? 'tabReport' : 'tabSettings'
    );
    const activeSec = document.getElementById(
        tab === 'checkin' ? 'checkInGrid' : 
        tab === 'piket' ? 'piketGrid' : 
        tab === 'register' ? 'registerSection' : 
        tab === 'history' ? 'historySection' : 
        tab === 'report' ? 'reportSection' : 'settingsSection'
    );
    activeTab?.classList.add('active'); activeSec?.classList.remove('hidden');
    document.getElementById('mainTitle').textContent = titles[tab][0];
    document.getElementById('mainSubtitle').textContent = titles[tab][1];
    if (tab === 'piket') checkPiketStatus();
    if (tab === 'register') loadStaffTable();
    if (tab === 'history') loadHistory(false);
    if (tab === 'report') loadReport(false);
};

function stopAllCameras() {
    if (videoFeed?.srcObject) videoFeed.srcObject.getTracks().forEach(t => t.stop());
    if (videoRegister?.srcObject) videoRegister.srcObject.getTracks().forEach(t => t.stop());
    if (videoFeedPiket?.srcObject) videoFeedPiket.srcObject.getTracks().forEach(t => t.stop());
}

window.initCamera = async function(mode) {
    const video = mode === 'register' ? videoRegister : (mode === 'piket' ? videoFeedPiket : videoFeed);
    const btn = event.currentTarget;
    btn.disabled = true; btn.innerHTML = 'Memulai...';
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        video.srcObject = stream; await video.play();
        const api = window.faceapi || faceapi, MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';
        if (!api.nets.tinyFaceDetector.params) await Promise.all([api.nets.tinyFaceDetector.loadFromUri(MODEL_URL), api.nets.faceLandmark68Net.loadFromUri(MODEL_URL), api.nets.faceRecognitionNet.loadFromUri(MODEL_URL)]);
        if (mode === 'register') { 
            document.getElementById('regCameraBtn').classList.add('hidden'); 
            document.getElementById('regSaveBtn').classList.remove('hidden'); 
        } else if (mode === 'piket') {
            document.getElementById('cameraInitActionPiket').classList.add('hidden'); 
            document.getElementById('piketActions').classList.remove('hidden');
            checkPiketStatus(); // Cek status piket segera setelah kamera menyala
        } else { 
            document.getElementById('cameraInitAction').classList.add('hidden'); 
            document.getElementById('attendanceActions').classList.remove('hidden');
            checkAttendanceStatus(); // Cek status segera setelah kamera menyala
        }
    } catch (e) { alert("Gagal aktifkan kamera: " + e.message); }
    btn.disabled = false; 
    btn.innerHTML = mode === 'piket' ? 'Nyalakan Kamera Piket' : 'Nyalakan Kamera';
};

// --- CRUD STAFF ---
async function loadStaffTable() {
    const { data } = await supabaseClient.from('employees').select('id, employee_id, full_name, position, profile_picture');
    const body = document.getElementById('staffTableBody'); body.innerHTML = '';
    data?.forEach(emp => {
        const photo = emp.profile_picture ? `<img src="${emp.profile_picture}" style="width:42px; height:42px; border-radius:50%; object-fit:cover; border:2px solid var(--border-color);">` : '<div style="width:42px; height:42px; border-radius:50%; background:var(--primary-light); display:flex; align-items:center; justify-content:center; color:var(--primary); font-size:1.1rem;"><i class="ri-user-line"></i></div>';
        body.innerHTML += `<tr>
            <td style="width:55px; padding:10px;">${photo}</td>
            <td style="font-weight:500; color:var(--text-muted);">${emp.employee_id}</td><td><strong style="color:var(--text-main);">${emp.full_name}</strong></td><td style="color:var(--text-muted);">${emp.position}</td>
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
async function loadHistory(isAutoRefresh = false) {
    const bIn = document.getElementById('historyInTableBody'), bOut = document.getElementById('historyOutTableBody');
    if (!bIn || !bOut) return;
    if (!isAutoRefresh) {
        bIn.innerHTML = '<tr><td colspan="4">Memuat...</td></tr>'; bOut.innerHTML = '<tr><td colspan="4">Memuat...</td></tr>';
    }
    const { data } = await supabaseClient.from('attendance_logs').select('*, employees(full_name)').order('check_in_time', { ascending: false }).limit(100);
    
    let tempIn = '';
    let tempOut = '';
    window.activeLogs = window.activeLogs || {};
    data?.forEach(log => {
        const time = new Date(log.check_in_time).toLocaleString('id-ID');
        const name = log.employees?.full_name || 'N/A';
        const action = `<button class="btn-icon btn-delete" onclick="deleteLog('${log.id}')"><i class="ri-delete-bin-line"></i></button>`;
        
        window.activeLogs[log.id] = log;
        
        if (log.type === 'in' || log.type === 'piket_in' || (log.type === 'manual' && log.status !== 'Tugas Luar')) {
            const isPiket = log.type === 'piket_in';
            let badgeStyle = '';
            if (isPiket) {
                badgeStyle = 'style="background: rgba(217, 119, 6, 0.1); color: var(--warning); border: 1px solid rgba(217, 119, 6, 0.15); cursor: pointer;"';
            } else if (log.status === 'Sakit') {
                badgeStyle = 'style="background: rgba(220, 38, 38, 0.1); color: var(--danger); border: 1px solid rgba(220, 38, 38, 0.15); cursor: pointer;"';
            } else if (log.status === 'Ijin') {
                badgeStyle = 'style="background: rgba(217, 119, 6, 0.1); color: var(--warning); border: 1px solid rgba(217, 119, 6, 0.15); cursor: pointer;"';
            } else if (log.status === 'Late' || log.status === 'Terlambat') {
                badgeStyle = 'style="background: rgba(220, 38, 38, 0.1); color: var(--danger); border: 1px solid rgba(220, 38, 38, 0.15); cursor: pointer;"';
            } else if (log.status === 'Early Bird') {
                badgeStyle = 'style="background: rgba(5, 150, 105, 0.1); color: var(--success); border: 1px solid rgba(5, 150, 105, 0.15); cursor: pointer;"';
            } else {
                badgeStyle = 'style="background: rgba(79, 70, 229, 0.1); color: var(--primary); border: 1px solid rgba(79, 70, 229, 0.15); cursor: pointer;"';
            }
            tempIn += `<tr><td><strong>${name}</strong></td><td>${time}</td><td><span class="badge clickable-badge" ${badgeStyle} onclick="showHistoryDetail('${log.id}')" title="Klik untuk detail"><i class="ri-information-line"></i> ${log.status}</span></td><td>${action}</td></tr>`;
        } 
        if (log.type === 'out' || log.type === 'piket_out' || (log.type === 'manual' && log.status === 'Tugas Luar')) {
            let noteText = '-';
            if (log.type === 'piket_out') {
                noteText = '<span style="color: var(--warning); font-weight:600;"><i class="ri-shield-flash-line"></i> Piket Selesai</span>';
            } else if (log.type === 'manual' && log.status === 'Tugas Luar') {
                const infoBadgeStyle = 'style="background: rgba(2, 132, 199, 0.1); color: var(--info); border: 1px solid rgba(2, 132, 199, 0.15); cursor: pointer;"';
                noteText = `<span class="badge clickable-badge" ${infoBadgeStyle} onclick="showHistoryDetail('${log.id}')" title="Klik untuk detail"><i class="ri-information-line"></i> Tugas Luar</span>`;
            } else {
                noteText = log.notes || '-';
            }
            tempOut += `<tr><td><strong>${name}</strong></td><td>${time}</td><td>${noteText}</td><td>${action}</td></tr>`;
        }
    });
    bIn.innerHTML = tempIn;
    bOut.innerHTML = tempOut;
}
window.deleteLog = async (id) => { if (confirm("Hapus log ini?")) { await supabaseClient.from('attendance_logs').delete().eq('id', id); loadHistory(false); } };

window.openManualAttendance = () => {
    const select = document.getElementById('manualEmpId');
    select.innerHTML = allEmployees.map(e => `<option value="${e.id}">${e.full_name}</option>`).join('');
    document.getElementById('manualAttendanceModal').classList.remove('hidden');
};
window.saveManualAttendance = async () => {
    const id = document.getElementById('manualEmpId').value, st = document.getElementById('manualStatus').value, nt = document.getElementById('manualNote').value;
    const { error } = await supabaseClient.from('attendance_logs').insert([{ employee_id: id, check_in_time: new Date().toISOString(), status: st, type: 'manual', notes: nt, reward_amount: 0, penalty_amount: 0 }]);
    if (!error) { alert("Sukses!"); closeModals(); loadHistory(false); }
};



// --- ATTENDANCE ---
window.checkAttendanceStatus = async function() {
    const empId = attendanceEmployeeSelect.value;
    const btnIn = document.getElementById('btnAbsenMasuk');
    const btnOut = document.getElementById('btnAbsenPulang');
    if (!btnIn || !btnOut) return;
    
    // Default: Reset dan disabled
    btnIn.disabled = true; btnOut.disabled = true;
    
    if (!empId) return; // Jika belum pilih nama, biarkan disabled
    
    // Beri efek loading sementara ngecek
    const oldInTxt = btnIn.innerHTML; const oldOutTxt = btnOut.innerHTML;
    btnIn.innerHTML = '<span class="btn-spinner" style="width:16px;height:16px;"></span>';
    btnOut.innerHTML = '<span class="btn-spinner" style="width:16px;height:16px;"></span>';

    // Cek status hari ini
    const today = new Date(); today.setHours(0,0,0,0);
    const { data: logs } = await supabaseClient.from('attendance_logs').select('type').eq('employee_id', empId).gte('check_in_time', today.toISOString());
    
    btnIn.innerHTML = oldInTxt; btnOut.innerHTML = oldOutTxt;

    const hasIn = logs?.some(l => l.type === 'in' || l.type === 'manual');
    const hasOut = logs?.some(l => l.type === 'out');

    if (!hasIn) {
        // Belum absen masuk
        btnIn.disabled = false;
        btnOut.disabled = true;
    } else if (hasIn && !hasOut) {
        // Sudah masuk, belum pulang
        btnIn.disabled = true;
        btnOut.disabled = false;
    } else if (hasIn && hasOut) {
        // Sudah pulang
        btnIn.disabled = true;
        btnOut.disabled = true;
    }
};

window.handleAttendance = async function(type) {
    const empId = attendanceEmployeeSelect.value; if (!empId) return alert("Pilih nama!");
    const btnIn = document.getElementById('btnAbsenMasuk');
    const btnOut = document.getElementById('btnAbsenPulang');
    const clickedBtn = type === 'in' ? btnIn : btnOut;

    // Simpan teks asli tombol
    const originalInHTML = btnIn.innerHTML;
    const originalOutHTML = btnOut.innerHTML;

    // Set loading state
    function setLoading() {
        btnIn.disabled = true; btnOut.disabled = true;
        btnIn.classList.add('btn-loading'); btnOut.classList.add('btn-loading');
        clickedBtn.innerHTML = '<span class="btn-spinner"></span> Memproses...';
    }

    // Reset tombol ke state semula
    function resetButtons() {
        btnIn.disabled = false; btnOut.disabled = false;
        btnIn.classList.remove('btn-loading'); btnOut.classList.remove('btn-loading');
        btnIn.innerHTML = originalInHTML;
        btnOut.innerHTML = originalOutHTML;
    }

    setLoading();

    // Verifikasi Geofencing Lokasi (Jika aktif & scan masuk)
    if (type === 'in' && CONFIG.enableGeofencing) {
        clickedBtn.innerHTML = '<span class="btn-spinner"></span> Cek Lokasi...';
        try {
            const position = await new Promise((resolve, reject) => {
                if (!navigator.geolocation) return reject(new Error("Browser tidak mendukung GPS"));
                navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 });
            });
            
            const dist = calculateDistance(position.coords.latitude, position.coords.longitude, CONFIG.officeLatitude, CONFIG.officeLongitude);
            console.log(`[Geofence] Jarak staf: ${Math.round(dist)}m | Maks: ${CONFIG.allowedRadiusMeters}m`);
            
            if (dist > CONFIG.allowedRadiusMeters) {
                resetButtons();
                alert(`Anda tidak dalam area kantor, segera masuk ke area kantor untuk bisa melanjutkan Absensi Anda.`);
                return;
            }
        } catch (err) {
            resetButtons();
            alert("Gagal memverifikasi lokasi: " + err.message + "\nPastikan GPS/Lokasi aktif dan izin diberikan ke browser ini.");
            return;
        }
        clickedBtn.innerHTML = '<span class="btn-spinner"></span> Memproses...';
    }
    try {
        const today = new Date(); today.setHours(0,0,0,0);
        const { data: ex } = await supabaseClient.from('attendance_logs').select('id').eq('employee_id', empId).eq('type', type).gte('check_in_time', today.toISOString());
        if (ex?.length > 0) { alert("Sudah absen tadi."); return resetButtons(); }
        const emp = allEmployees.find(e => e.id === empId), api = window.faceapi || faceapi;
        if (!emp.face_embedding) { alert("Staf ini belum memiliki data wajah! Silakan registrasi ulang."); return resetButtons(); }
        const det = await api.detectSingleFace(videoFeed, new api.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptor();
        if (!det) { alert("Wajah tidak terdeteksi di kamera! Pastikan posisi wajah terlihat jelas."); return resetButtons(); }
        // Parse face embedding — handle JSON string dari Supabase
        const storedEmbedding = parseFaceEmbedding(emp.face_embedding);
        const distance = api.euclideanDistance(det.descriptor, storedEmbedding);
        console.log(`[FaceMatch] ${emp.full_name} — Jarak: ${distance.toFixed(4)} | Threshold: ${FACE_MATCH_THRESHOLD}`);
        if (distance > FACE_MATCH_THRESHOLD) { alert(`Wajah tidak cocok! (Jarak: ${distance.toFixed(2)}, Batas: ${FACE_MATCH_THRESHOLD})\nPastikan pencahayaan cukup dan posisi wajah lurus ke kamera.`); return resetButtons(); }
        const now = new Date(), sched = getSchedule(now.getDay());
        if (type === 'out' && sched && now < parseTime(sched.out)) {
            window.pendingAttendanceData = { empId, employee: emp, type, now };
            document.getElementById('earlyOutModal').classList.remove('hidden'); resetButtons(); return;
        }
        await saveAttendance(empId, emp, type, now);
        resetButtons();
    } catch (e) { alert(e.message); resetButtons(); }
};

async function saveAttendance(empId, employee, type, now, reason = "") {
    const sched = getSchedule(now.getDay()); let status = "On-Time", reward = 0, penalty = 0, lateMins = 0;
    
    // Cek apakah staff piket
    const isPiketStaff = (employee.position && employee.position.toLowerCase().includes('piket')) || 
                         (employee.department && employee.department.toLowerCase().includes('piket'));

    if (type === 'in' && sched) {
        const originalWorkStart = parseTime(sched.in);
        let workStartForLate = originalWorkStart;
        if (isPiketStaff) {
            workStartForLate = new Date(originalWorkStart.getTime() + (30 * 60000));
            console.log(`[Piket Tolerance] Staf Piket ${employee.full_name} mendapat toleransi 30 menit. Batas terlambat: ${workStartForLate.toLocaleTimeString()}`);
        }

        if (now <= new Date(originalWorkStart.getTime() - (CONFIG.earlyBirdBuffer * 60000))) { 
            status = "Early Bird"; 
            reward = CONFIG.earlyBirdReward; 
        } else if (now > workStartForLate) {
            status = "Late";
            lateMins = Math.floor((now - workStartForLate) / 60000);
            const rawPenalty = lateMins * CONFIG.latePenaltyPerMinute;
            const maxCap = CONFIG.maxDailyPenalty || MAX_PENALTY_FALLBACK;
            penalty = Math.min(rawPenalty, maxCap);
            console.log(`[Denda] ${lateMins} menit × Rp${CONFIG.latePenaltyPerMinute} = Rp${rawPenalty} → Cap Rp${maxCap} → Final: Rp${penalty}`);
        }
    }
    
    await supabaseClient.from('attendance_logs').insert([{ 
        employee_id: empId, 
        check_in_time: now.toISOString(), 
        status, 
        type, 
        notes: reason, 
        reward_amount: reward, 
        penalty_amount: penalty, 
        late_duration_minutes: lateMins 
    }]);
    
    document.getElementById('resultBox').classList.remove('hidden');
    document.getElementById('resultName').textContent = employee.full_name;
    document.getElementById('resultTime').textContent = now.toLocaleTimeString();
    document.getElementById('resultBadge').textContent = status;
    
    showAttendancePopup({ name: employee.full_name, time: now, type, status, lateMins, penalty, reward, isPiketStaff });
    
    // Update status tombol
    checkAttendanceStatus();
}

function showAttendancePopup({ name, time, type, status, lateMins, penalty, reward, isPiketStaff }) {
    const timeStr = time.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    const isLate = status === 'Late';
    const isEarlyBird = status === 'Early Bird';
    const isIn = type === 'in';

    let icon, iconBg, title, detail;

    if (isIn) {
        icon = isLate ? 'ri-error-warning-line' : 'ri-checkbox-circle-line';
        iconBg = isLate ? 'var(--danger-light)' : 'var(--success-light)';
        const iconColor = isLate ? 'var(--danger)' : 'var(--success)';
        title = 'Kehadiran Berhasil!';
        detail = `<p style="color: var(--text-secondary); font-size: 0.95rem; margin: 6px 0 0;">Atas Nama <strong style="color: var(--text-main);">${name}</strong></p>
                  <p style="color: var(--text-muted); font-size: 0.85rem; margin: 4px 0 16px;">Pukul <strong>${timeStr}</strong></p>`;

        if (isLate) {
            detail += `<div style="background: var(--danger-light); border: 1px solid rgba(220,38,38,0.15); border-radius: 10px; padding: 14px; text-align: left; margin-bottom: 10px;">
                <p style="color: var(--danger); font-weight: 600; font-size: 0.85rem; margin-bottom: 0;"><i class="ri-time-line"></i> Anda terlambat ${lateMins} menit</p>
            </div>`;
        } else {
            detail += `<div style="background: var(--success-light); border: 1px solid rgba(5,150,105,0.15); border-radius: 10px; padding: 14px; text-align: left; margin-bottom: 10px;">
                <p style="color: var(--success); font-weight: 600; font-size: 0.85rem; margin-bottom: 0;"><i class="ri-checkbox-circle-line"></i> Anda datang tepat waktu${isEarlyBird ? ' 🎉' : ''}</p>
            </div>`;
        }

        if (isPiketStaff) {
            detail += `<div style="background: var(--primary-light); border: 1px solid rgba(79, 70, 229, 0.15); border-radius: 10px; padding: 12px; text-align: left; margin-top: 10px; display: flex; align-items: center; gap: 8px;">
                <i class="ri-time-line" style="color: var(--primary); font-size: 1.1rem;"></i>
                <p style="color: var(--primary); font-weight: 600; font-size: 0.8rem; margin: 0; line-height: 1.4;">💡 Mendapat Toleransi Masuk 30 Menit (Staf Piket)</p>
            </div>`;
        }

        // Set icon color
        detail = `<div style="width: 64px; height: 64px; border-radius: 16px; background: ${iconBg}; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;">
            <i class="${icon}" style="font-size: 1.8rem; color: ${iconColor};"></i>
        </div>
        <h3 style="font-size: 1.2rem; font-weight: 700; color: var(--text-main); margin: 0;">${title}</h3>
        ${detail}`;
    } else {
        // Type out (pulang)
        detail = `<div style="width: 64px; height: 64px; border-radius: 16px; background: var(--primary-light); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;">
            <i class="ri-logout-box-line" style="font-size: 1.8rem; color: var(--primary);"></i>
        </div>
        <h3 style="font-size: 1.2rem; font-weight: 700; color: var(--text-main); margin: 0;">Scan Pulang Berhasil!</h3>
        <p style="color: var(--text-secondary); font-size: 0.95rem; margin: 6px 0 0;">Atas Nama <strong style="color: var(--text-main);">${name}</strong></p>
        <p style="color: var(--text-muted); font-size: 0.85rem; margin: 4px 0 16px;">Pukul <strong>${timeStr}</strong></p>
        <div style="background: var(--primary-light); border: 1px solid rgba(79,70,229,0.15); border-radius: 10px; padding: 14px;">
            <p style="color: var(--primary); font-weight: 600; font-size: 0.85rem;"><i class="ri-hand-heart-line"></i> Terima kasih, hati-hati di jalan!</p>
        </div>`;
    }

    const popup = document.getElementById('attendancePopup');
    document.getElementById('attendancePopupContent').innerHTML = detail;
    popup.classList.remove('hidden');
}

// --- PIKET ATTENDANCE SYSTEM ---
window.checkPiketStatus = async function() {
    const empId = piketEmployeeSelect.value;
    const btnIn = document.getElementById('btnPiketMasuk');
    const btnOut = document.getElementById('btnPiketPulang');
    if (!btnIn || !btnOut) return;
    
    // Default: Reset dan disabled
    btnIn.disabled = true; btnOut.disabled = true;
    btnIn.removeAttribute('title'); btnOut.removeAttribute('title');
    
    if (!empId) return; // Jika belum pilih nama, biarkan disabled
    
    // Beri efek loading sementara ngecek
    const oldInTxt = btnIn.innerHTML; const oldOutTxt = btnOut.innerHTML;
    btnIn.innerHTML = '<span class="btn-spinner" style="width:16px;height:16px;"></span>';
    btnOut.innerHTML = '<span class="btn-spinner" style="width:16px;height:16px;"></span>';

    // Cek status hari ini (apakah sudah ada log piket)
    const today = new Date(); today.setHours(0,0,0,0);
    const { data: logs } = await supabaseClient.from('attendance_logs').select('type').eq('employee_id', empId).gte('check_in_time', today.toISOString());
    
    btnIn.innerHTML = oldInTxt; btnOut.innerHTML = oldOutTxt;

    const hasIn = logs?.some(l => l.type === 'piket_in');
    const hasOut = logs?.some(l => l.type === 'piket_out');

    const now = new Date();
    const piketStart = parseTime(CONFIG.piketStartTime);
    const earliestPiketIn = new Date(piketStart.getTime() - (30 * 60000));
    const piketEnd = parseTime(CONFIG.piketEndTime);

    if (!hasIn) {
        if (now < earliestPiketIn) {
            btnIn.disabled = true;
            const timeStr = earliestPiketIn.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
            btnIn.title = `Absen masuk piket baru bisa dilakukan mulai pukul ${timeStr}`;
        } else {
            btnIn.disabled = false;
        }
        btnOut.disabled = true;
    } else if (hasIn && !hasOut) {
        btnIn.disabled = true;
        if (now < piketEnd) {
            btnOut.disabled = true;
            const timeStr = piketEnd.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
            btnOut.title = `Absen pulang piket baru bisa dilakukan mulai pukul ${timeStr}`;
        } else {
            btnOut.disabled = false;
        }
    } else if (hasIn && hasOut) {
        btnIn.disabled = true;
        btnOut.disabled = true;
    }
};

window.handlePiketAttendance = async function(type) {
    const empId = piketEmployeeSelect.value; if (!empId) return alert("Pilih nama!");
    
    // Verifikasi Pembatasan Waktu Piket
    const now = new Date();
    if (type === 'in') {
        const piketStart = parseTime(CONFIG.piketStartTime);
        const earliestPiketIn = new Date(piketStart.getTime() - (30 * 60000));
        
        if (now < earliestPiketIn) {
            const timeFormatted = earliestPiketIn.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
            alert(`Absen masuk piket baru bisa dilakukan paling cepat 30 menit sebelum jam piket dimulai (Mulai Pukul ${timeFormatted}).`);
            return;
        }
    } else if (type === 'out') {
        const piketEnd = parseTime(CONFIG.piketEndTime);
        if (now < piketEnd) {
            const timeFormatted = piketEnd.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
            alert(`Absen pulang piket hanya bisa dilakukan sesuai jam piket selesai yang ditetapkan (Mulai Pukul ${timeFormatted}).`);
            return;
        }
    }

    const btnIn = document.getElementById('btnPiketMasuk');
    const btnOut = document.getElementById('btnPiketPulang');
    const clickedBtn = type === 'in' ? btnIn : btnOut;

    // Simpan teks asli tombol
    const originalInHTML = btnIn.innerHTML;
    const originalOutHTML = btnOut.innerHTML;

    // Set loading state
    function setLoading() {
        btnIn.disabled = true; btnOut.disabled = true;
        btnIn.classList.add('btn-loading'); btnOut.classList.add('btn-loading');
        clickedBtn.innerHTML = '<span class="btn-spinner"></span> Memproses...';
    }

    // Reset tombol ke state semula
    function resetButtons() {
        btnIn.disabled = false; btnOut.disabled = false;
        btnIn.classList.remove('btn-loading'); btnOut.classList.remove('btn-loading');
        btnIn.innerHTML = originalInHTML;
        btnOut.innerHTML = originalOutHTML;
    }

    setLoading();

    // Verifikasi Geofencing Lokasi (Jika aktif & scan masuk piket)
    if (type === 'in' && CONFIG.enableGeofencing) {
        clickedBtn.innerHTML = '<span class="btn-spinner"></span> Cek Lokasi...';
        try {
            const position = await new Promise((resolve, reject) => {
                if (!navigator.geolocation) return reject(new Error("Browser tidak mendukung GPS"));
                navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 });
            });
            
            const dist = calculateDistance(position.coords.latitude, position.coords.longitude, CONFIG.officeLatitude, CONFIG.officeLongitude);
            console.log(`[Geofence Piket] Jarak staf: ${Math.round(dist)}m | Maks: ${CONFIG.allowedRadiusMeters}m`);
            
            if (dist > CONFIG.allowedRadiusMeters) {
                resetButtons();
                alert(`Anda tidak dalam area kantor, segera masuk ke area kantor untuk bisa melakukan Absensi Piket.`);
                return;
            }
        } catch (err) {
            resetButtons();
            alert("Gagal memverifikasi lokasi: " + err.message + "\nPastikan GPS/Lokasi aktif dan izin diberikan ke browser ini.");
            return;
        }
        clickedBtn.innerHTML = '<span class="btn-spinner"></span> Memproses...';
    }
    
    try {
        const today = new Date(); today.setHours(0,0,0,0);
        const typeStr = type === 'in' ? 'piket_in' : 'piket_out';
        const { data: ex } = await supabaseClient.from('attendance_logs').select('id').eq('employee_id', empId).eq('type', typeStr).gte('check_in_time', today.toISOString());
        if (ex?.length > 0) { alert("Sudah absen piket tadi."); return resetButtons(); }
        
        const emp = allEmployees.find(e => e.id === empId), api = window.faceapi || faceapi;
        if (!emp.face_embedding) { alert("Staf ini belum memiliki data wajah! Silakan hubungi admin."); return resetButtons(); }
        
        const det = await api.detectSingleFace(videoFeedPiket, new api.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptor();
        if (!det) { alert("Wajah tidak terdeteksi di kamera! Pastikan posisi wajah terlihat jelas."); return resetButtons(); }
        
        const storedEmbedding = parseFaceEmbedding(emp.face_embedding);
        const distance = api.euclideanDistance(det.descriptor, storedEmbedding);
        console.log(`[FaceMatch Piket] ${emp.full_name} — Jarak: ${distance.toFixed(4)} | Threshold: ${FACE_MATCH_THRESHOLD}`);
        if (distance > FACE_MATCH_THRESHOLD) { alert(`Wajah tidak cocok! (Jarak: ${distance.toFixed(2)}, Batas: ${FACE_MATCH_THRESHOLD})\nPastikan pencahayaan cukup.`); return resetButtons(); }
        
        const now = new Date();
        await savePiketAttendance(empId, emp, typeStr, now);
        resetButtons();
    } catch (e) { alert(e.message); resetButtons(); }
};

async function savePiketAttendance(empId, employee, type, now) {
    let status = "Piket Tepat Waktu", reward = 0, penalty = 0, lateMins = 0;
    if (type === 'piket_in') {
        const piketStart = parseTime(CONFIG.piketStartTime);
        if (now > piketStart) {
            status = "Piket Terlambat";
            lateMins = Math.floor((now - piketStart) / 60000);
        }
    } else {
        status = "Piket Selesai";
    }
    
    await supabaseClient.from('attendance_logs').insert([{ employee_id: empId, check_in_time: now.toISOString(), status, type, notes: "Absensi Piket", reward_amount: reward, penalty_amount: penalty, late_duration_minutes: lateMins }]);
    
    document.getElementById('resultBoxPiket').classList.remove('hidden');
    document.getElementById('resultNamePiket').textContent = employee.full_name;
    document.getElementById('resultTimePiket').textContent = now.toLocaleTimeString();
    document.getElementById('resultBadgePiket').textContent = status;
    
    showPiketAttendancePopup({ name: employee.full_name, time: now, type, status, lateMins });
    
    // Update status tombol
    checkPiketStatus();
}

function showPiketAttendancePopup({ name, time, type, status, lateMins }) {
    const timeStr = time.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    const isLate = status === 'Piket Terlambat';
    const isIn = type === 'piket_in';

    let icon, iconBg, title, detail;

    if (isIn) {
        icon = isLate ? 'ri-error-warning-line' : 'ri-checkbox-circle-line';
        iconBg = isLate ? 'var(--danger-light)' : 'var(--success-light)';
        const iconColor = isLate ? 'var(--danger)' : 'var(--success)';
        title = 'Piket Masuk Sukses!';
        detail = `<p style="color: var(--text-secondary); font-size: 0.95rem; margin: 6px 0 0;">Atas Nama <strong style="color: var(--text-main);">${name}</strong></p>
                  <p style="color: var(--text-muted); font-size: 0.85rem; margin: 4px 0 16px;">Pukul <strong>${timeStr}</strong></p>`;

        if (isLate) {
            detail += `<div style="background: var(--danger-light); border: 1px solid rgba(220,38,38,0.15); border-radius: 10px; padding: 14px; text-align: left;">
                <p style="color: var(--danger); font-weight: 600; font-size: 0.85rem; margin-bottom: 0;"><i class="ri-time-line"></i> Anda terlambat piket ${lateMins} menit</p>
            </div>`;
        } else {
            detail += `<div style="background: var(--success-light); border: 1px solid rgba(5,150,105,0.15); border-radius: 10px; padding: 14px; text-align: left;">
                <p style="color: var(--success); font-weight: 600; font-size: 0.85rem; margin-bottom: 0;"><i class="ri-checkbox-circle-line"></i> Anda masuk piket tepat waktu</p>
            </div>`;
        }

        // Set icon color
        detail = `<div style="width: 64px; height: 64px; border-radius: 16px; background: ${iconBg}; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;">
            <i class="${icon}" style="font-size: 1.8rem; color: ${iconColor};"></i>
        </div>
        <h3 style="font-size: 1.2rem; font-weight: 700; color: var(--text-main); margin: 0;">${title}</h3>
        ${detail}`;
    } else {
        // Type out (pulang)
        detail = `<div style="width: 64px; height: 64px; border-radius: 16px; background: var(--warning-light); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;">
            <i class="ri-logout-box-line" style="font-size: 1.8rem; color: var(--warning);"></i>
        </div>
        <h3 style="font-size: 1.2rem; font-weight: 700; color: var(--text-main); margin: 0;">Piket Pulang Sukses!</h3>
        <p style="color: var(--text-secondary); font-size: 0.95rem; margin: 6px 0 0;">Atas Nama <strong style="color: var(--text-main);">${name}</strong></p>
        <p style="color: var(--text-muted); font-size: 0.85rem; margin: 4px 0 16px;">Pukul <strong>${timeStr}</strong></p>
        <div style="background: var(--warning-light); border: 1px solid rgba(217,119,6,0.15); border-radius: 10px; padding: 14px; text-align: left;">
            <p style="color: var(--warning); font-weight: 600; font-size: 0.85rem; margin-bottom: 0;"><i class="ri-shield-flash-line"></i> Terima kasih atas dedikasi piket Anda malam ini!</p>
        </div>`;
    }

    const popup = document.getElementById('attendancePopup');
    document.getElementById('attendancePopupContent').innerHTML = detail;
    popup.classList.remove('hidden');
}

// --- REPORT ---
async function loadReport(isAutoRefresh = false) {
    const emp = document.getElementById('reportEmployeeFilter')?.value || 'all', per = document.getElementById('reportPeriodFilter')?.value || 'daily', body = document.getElementById('reportTableBody');
    if (!body) return;
    if (!isAutoRefresh) {
        body.innerHTML = '<tr><td colspan="8">Memuat...</td></tr>';
    }
    let q = supabaseClient.from('attendance_logs').select('*, employees(full_name)');
    if (emp !== 'all') q = q.eq('employee_id', emp);
    const startOfToday = new Date(); startOfToday.setHours(0,0,0,0);
    if (per === 'daily') q = q.gte('check_in_time', startOfToday.toISOString());
    else if (per === 'weekly') { const first = startOfToday.getDate() - startOfToday.getDay(); const startOfWeek = new Date(new Date().setDate(first)); startOfWeek.setHours(0,0,0,0); q = q.gte('check_in_time', startOfWeek.toISOString()); }
    else if (per === 'monthly') { const startOfMonth = new Date(startOfToday.getFullYear(), startOfToday.getMonth(), 1); q = q.gte('check_in_time', startOfMonth.toISOString()); }
    const { data, error } = await q.order('check_in_time', { ascending: true });
    if (error) return body.innerHTML = `<tr><td colspan="8">Error: ${error.message}</td></tr>`;
    const grouped = {};
    window.activeLogs = window.activeLogs || {};
    data?.forEach(log => {
        const isPiketLog = log.type === 'piket_in' || log.type === 'piket_out';
        const date = new Date(log.check_in_time).toLocaleDateString('en-CA');
        const key = isPiketLog ? `${date}_${log.employee_id}_piket` : `${date}_${log.employee_id}`;
        
        if (!grouped[key]) {
            grouped[key] = { 
                name: log.employees?.full_name || 'N/A', 
                date: new Date(log.check_in_time).toLocaleDateString('id-ID'), 
                in: '-', 
                out: '-', 
                late: 0, 
                status: log.status, 
                reward: 0, 
                penalty: 0, 
                isComplete: false,
                isPiket: isPiketLog,
                logId: log.id
            };
            window.activeLogs[log.id] = log;
        }
        const time = new Date(log.check_in_time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        if (log.type === 'in') { 
            grouped[key].in = time; 
            grouped[key].late = log.late_duration_minutes || 0; 
            grouped[key].status = log.status; 
            grouped[key].reward = log.reward_amount || 0; 
            grouped[key].penalty = log.penalty_amount || 0; 
            grouped[key].logId = log.id;
            window.activeLogs[log.id] = log;
        }
        else if (log.type === 'out') { grouped[key].out = time; grouped[key].isComplete = true; }
        else if (log.type === 'manual') { 
            grouped[key].status = log.status; 
            grouped[key].in = log.status; 
            grouped[key].isComplete = true; 
            grouped[key].logId = log.id;
            window.activeLogs[log.id] = log;
        }
        else if (log.type === 'piket_in') { 
            grouped[key].in = time; 
            grouped[key].late = log.late_duration_minutes || 0; 
            grouped[key].status = log.status; 
            grouped[key].logId = log.id;
            window.activeLogs[log.id] = log;
        }
        else if (log.type === 'piket_out') { grouped[key].out = time; grouped[key].isComplete = true; }
    });
    const rows = Object.values(grouped).filter(r => r.isComplete).reverse();
    body.innerHTML = rows.length === 0 ? '<tr><td colspan="8" style="text-align:center; color:var(--text-light); padding:30px;">Laporan muncul setelah Scan Pulang.</td></tr>' : '';
    rows.forEach(r => {
        let badgeStyle = r.isPiket ? 'style="background: rgba(217, 119, 6, 0.1); color: var(--warning); border: 1px solid rgba(217, 119, 6, 0.15); cursor: pointer;"' : '';
        if (!r.isPiket) {
            if (r.status === 'Sakit') {
                badgeStyle = 'style="background: rgba(220, 38, 38, 0.1); color: var(--danger); border: 1px solid rgba(220, 38, 38, 0.15); cursor: pointer;"';
            } else if (r.status === 'Ijin') {
                badgeStyle = 'style="background: rgba(217, 119, 6, 0.1); color: var(--warning); border: 1px solid rgba(217, 119, 6, 0.15); cursor: pointer;"';
            } else if (r.status === 'Tugas Luar') {
                badgeStyle = 'style="background: rgba(2, 132, 199, 0.1); color: var(--info); border: 1px solid rgba(2, 132, 199, 0.15); cursor: pointer;"';
            } else if (r.status === 'Late' || r.status === 'Terlambat') {
                badgeStyle = 'style="background: rgba(220, 38, 38, 0.1); color: var(--danger); border: 1px solid rgba(220, 38, 38, 0.15); cursor: pointer;"';
            } else if (r.status === 'Early Bird') {
                badgeStyle = 'style="background: rgba(5, 150, 105, 0.1); color: var(--success); border: 1px solid rgba(5, 150, 105, 0.15); cursor: pointer;"';
            } else {
                badgeStyle = 'style="background: rgba(79, 70, 229, 0.1); color: var(--primary); border: 1px solid rgba(79, 70, 229, 0.15); cursor: pointer;"';
            }
        } else {
            // Piket statuses
            if (r.status === 'Piket Terlambat') {
                badgeStyle = 'style="background: rgba(220, 38, 38, 0.1); color: var(--danger); border: 1px solid rgba(220, 38, 38, 0.15); cursor: pointer;"';
            } else {
                badgeStyle = 'style="background: rgba(217, 119, 6, 0.1); color: var(--warning); border: 1px solid rgba(217, 119, 6, 0.15); cursor: pointer;"';
            }
        }
        const nameText = r.isPiket ? `${r.name} <span class="badge" style="background: rgba(217,119,6,0.1); color: var(--warning); font-size:0.65rem; padding: 2px 6px; margin-left: 6px;">Piket</span>` : r.name;
        body.innerHTML += `<tr><td><strong style="color:var(--text-main);">${nameText}</strong></td><td>${r.date}</td><td>${r.in}</td><td>${r.out}</td><td>${r.late > 0 ? `${r.late} Menit` : '-'}</td><td><span class="badge clickable-badge" ${badgeStyle} onclick="showHistoryDetail('${r.logId}')" title="Klik untuk detail"><i class="ri-information-line"></i> ${r.status}</span></td><td style="color:var(--success); font-weight:600;">Rp ${r.reward.toLocaleString()}</td><td style="color:var(--danger); font-weight:600;">Rp ${r.penalty.toLocaleString()}</td></tr>`;
    });
    updateReportStats(rows.length, rows.filter(r => r.status==='On-Time'||r.status==='Early Bird'||r.status==='Piket Tepat Waktu').length, rows.filter(r => r.status==='Late'||r.status==='Piket Terlambat').length, rows.reduce((s, r)=> s+r.reward, 0), rows.reduce((s, r)=> s+r.penalty, 0));
}

function updateReportStats(total, onTime, late, reward, penalty) {
    const summary = document.getElementById('reportSummary'); if (!summary) return;
    summary.innerHTML = `<div class="stat-grid">
        <div class="stat-card"><i class="ri-history-line"></i><h4>Total Log</h4><p>${total}</p></div>
        <div class="stat-card"><i class="ri-checkbox-circle-line" style="color:var(--success);"></i><h4>Tepat Waktu</h4><p style="color:var(--success);">${onTime}</p></div>
        <div class="stat-card"><i class="ri-error-warning-line" style="color:var(--danger);"></i><h4>Terlambat</h4><p style="color:var(--danger);">${late}</p></div>
        <div class="stat-card"><i class="ri-copper-coin-line" style="color:var(--warning);"></i><h4>Total Reward</h4><p style="color:var(--success);">Rp ${reward.toLocaleString()}</p></div>
        <div class="stat-card"><i class="ri-money-dollar-circle-line" style="color:var(--danger);"></i><h4>Total Denda</h4><p style="color:var(--danger);">Rp ${penalty.toLocaleString()}</p></div>
    </div>`;
}

// --- UTILS ---
async function loadEmployees() {
    const { data } = await supabaseClient.from('employees').select('id, full_name, position, department, face_embedding');
    allEmployees = data || []; 
    attendanceEmployeeSelect.innerHTML = '<option value="">-- Pilih Nama --</option>';
    if (piketEmployeeSelect) piketEmployeeSelect.innerHTML = '<option value="">-- Pilih Nama --</option>';
    document.getElementById('reportEmployeeFilter').innerHTML = '<option value="all">Semua Staf</option>';
    allEmployees.forEach(e => { 
        attendanceEmployeeSelect.innerHTML += `<option value="${e.id}">${e.full_name}</option>`; 
        if (piketEmployeeSelect) piketEmployeeSelect.innerHTML += `<option value="${e.id}">${e.full_name}</option>`;
        document.getElementById('reportEmployeeFilter').innerHTML += `<option value="${e.id}">${e.full_name}</option>`; 
    });
}
function parseTime(t) { const n = new Date(), [h, m, s] = t.split(':'); return new Date(n.getFullYear(), n.getMonth(), n.getDate(), h, m, s || 0); }

// Hitung jarak (meter) menggunakan Rumus Haversine
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Radius bumi dalam meter
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLon = (lon2 - lon1) * rad;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Parse face embedding dari Supabase — bisa berupa JSON string, array biasa, atau sudah Float32Array
function parseFaceEmbedding(embedding) {
    if (embedding instanceof Float32Array) return embedding;
    if (typeof embedding === 'string') {
        try { return new Float32Array(JSON.parse(embedding)); } catch (e) { console.error('Gagal parse face embedding string:', e); return new Float32Array(128); }
    }
    if (Array.isArray(embedding)) return new Float32Array(embedding);
    console.error('Format face embedding tidak dikenali:', typeof embedding);
    return new Float32Array(128);
}
async function loadSettings() {
    const { data } = await supabaseClient.from('settings_config').select('*').limit(1).single();
    if (data) { 
        CONFIG.configId = data.id; // Simpan UUID asli
        CONFIG.adminPassword = data.admin_password; CONFIG.latePenaltyPerMinute = data.late_penalty_per_minute; CONFIG.earlyBirdReward = data.early_bird_reward; CONFIG.earlyBirdBuffer = data.early_bird_limit_minutes;
        CONFIG.maxDailyPenalty = data.max_daily_penalty || 50000;
        CONFIG.enableGeofencing = data.enable_geofencing || false;
        CONFIG.officeLatitude = parseFloat(data.office_latitude) || -6.200000;
        CONFIG.officeLongitude = parseFloat(data.office_longitude) || 106.816666;
        CONFIG.allowedRadiusMeters = parseInt(data.allowed_radius_meters) || 100;

        // Jam Kerja Fleksibel dengan fallback jika kolom belum dibuat di DB
        CONFIG.workStartTimeWeekday = data.work_start_time || '07:45:00';
        CONFIG.workEndTimeWeekday = data.work_end_time || '17:00:00';
        CONFIG.workStartTimeSaturday = data.saturday_start_time || '07:45:00';
        CONFIG.workEndTimeSaturday = data.saturday_end_time || '14:00:00';

        // Jam Piket Fleksibel dengan fallback jika kolom belum dibuat di DB
        CONFIG.piketStartTime = data.piket_start_time || '17:00:00';
        CONFIG.piketEndTime = data.piket_end_time || '21:00:00';

        if (document.getElementById('setAdminPass')) {
            document.getElementById('setAdminPass').value = data.admin_password;
            document.getElementById('setReward').value = data.early_bird_reward;
            document.getElementById('setPenalty').value = data.late_penalty_per_minute;
            document.getElementById('setEarlyLimit').value = data.early_bird_limit_minutes;
            document.getElementById('setMaxPenalty').value = CONFIG.maxDailyPenalty;
            document.getElementById('setEnableGeofencing').checked = CONFIG.enableGeofencing;
            document.getElementById('setOfficeLat').value = CONFIG.officeLatitude;
            document.getElementById('setOfficeLng').value = CONFIG.officeLongitude;
            document.getElementById('setRadius').value = CONFIG.allowedRadiusMeters;
            
            // Jam kerja fleksibel UI binding (ubah format TIME HH:MM:SS ke HH:MM)
            document.getElementById('setWorkStartWeekday').value = (CONFIG.workStartTimeWeekday || '').substring(0, 5);
            document.getElementById('setWorkEndWeekday').value = (CONFIG.workEndTimeWeekday || '').substring(0, 5);
            document.getElementById('setWorkStartSaturday').value = (CONFIG.workStartTimeSaturday || '').substring(0, 5);
            document.getElementById('setWorkEndSaturday').value = (CONFIG.workEndTimeSaturday || '').substring(0, 5);

            // Jam piket fleksibel UI binding
            if (document.getElementById('setPiketStart')) {
                document.getElementById('setPiketStart').value = (CONFIG.piketStartTime || '').substring(0, 5);
                document.getElementById('setPiketEnd').value = (CONFIG.piketEndTime || '').substring(0, 5);
            }
        }
    }
}
window.saveSettings = async function() {
    const p = document.getElementById('setAdminPass').value, r = parseInt(document.getElementById('setReward').value), d = parseInt(document.getElementById('setPenalty').value), l = parseInt(document.getElementById('setEarlyLimit').value), m = parseInt(document.getElementById('setMaxPenalty').value);
    const geo = document.getElementById('setEnableGeofencing').checked;
    const lat = parseFloat(document.getElementById('setOfficeLat').value);
    const lng = parseFloat(document.getElementById('setOfficeLng').value);
    const rad = parseInt(document.getElementById('setRadius').value);
    
    // Format input waktu dari HH:MM ke HH:MM:SS untuk kompatibilitas DB TIME
    const formatTimeInput = (t) => {
        if (!t) return null;
        if (t.split(':').length === 2) return t + ':00';
        return t;
    };
    
    const wInWeekday = formatTimeInput(document.getElementById('setWorkStartWeekday').value);
    const wOutWeekday = formatTimeInput(document.getElementById('setWorkEndWeekday').value);
    const wInSaturday = formatTimeInput(document.getElementById('setWorkStartSaturday').value);
    const wOutSaturday = formatTimeInput(document.getElementById('setWorkEndSaturday').value);
    
    const pStart = formatTimeInput(document.getElementById('setPiketStart').value);
    const pEnd = formatTimeInput(document.getElementById('setPiketEnd').value);
    
    const s = { 
        admin_password: p, 
        late_penalty_per_minute: d, 
        early_bird_reward: r, 
        early_bird_limit_minutes: l, 
        max_daily_penalty: m, 
        enable_geofencing: geo, 
        office_latitude: lat, 
        office_longitude: lng, 
        allowed_radius_meters: rad,
        work_start_time: wInWeekday,
        work_end_time: wOutWeekday,
        saturday_start_time: wInSaturday,
        saturday_end_time: wOutSaturday,
        piket_start_time: pStart,
        piket_end_time: pEnd
    };
    
    let error;
    if (CONFIG.configId) {
        const res = await supabaseClient.from('settings_config').update(s).eq('id', CONFIG.configId);
        error = res.error;
    } else {
        const res = await supabaseClient.from('settings_config').insert([s]);
        error = res.error;
    }
    
    if (error) {
        alert("Gagal menyimpan! Error: " + error.message + "\n\nPastikan Anda sudah menjalankan SQL Migrasi di Supabase untuk menambah kolom baru.");
        console.error("Save Settings Error:", error);
    } else {
        alert("Pengaturan Berhasil Tersimpan!"); 
        loadSettings();
    }
};
window.closeModals = () => document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));

window.handleFullRegistration = async function() {
    const id = document.getElementById('regId').value, name = document.getElementById('regName').value, pos = document.getElementById('regPosition').value, birth = document.getElementById('regBirth').value;
    if (!id || !name || !pos || !birth) return alert("Lengkapi data!");
    
    // Check if ID already exists
    if (allEmployees.find(e => e.employee_id === id)) {
        return alert(`Gagal: ID/NIK "${id}" sudah terdaftar atas nama lain! Silakan gunakan ID yang berbeda.`);
    }

    try {
        const api = window.faceapi || faceapi;
        const det = await api.detectSingleFace(videoRegister, new api.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptor();
        if (!det) return alert("Wajah tidak terdeteksi! Pastikan cahaya cukup.");
        
        if (allEmployees.find(e => e.face_embedding && api.euclideanDistance(det.descriptor, parseFaceEmbedding(e.face_embedding)) < 0.45)) return alert("Wajah sudah terdaftar!");

        // CAPTURE PHOTO
        const canvas = document.createElement('canvas');
        canvas.width = videoRegister.videoWidth;
        canvas.height = videoRegister.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(videoRegister, 0, 0, canvas.width, canvas.height);
        const photoBase64 = canvas.toDataURL('image/png');

        const { error } = await supabaseClient.from('employees').insert([{ 
            employee_id: id, 
            full_name: name, 
            position: pos, 
            birth_date: birth, 
            face_embedding: Array.from(det.descriptor),
            profile_picture: photoBase64 
        }]);

        if (error) throw error;

        alert("Registrasi Sukses! Lanjut ke staf berikutnya.");
        document.getElementById('regId').value = '';
        document.getElementById('regName').value = '';
        document.getElementById('regPosition').value = '';
        document.getElementById('regBirth').value = '';
        
        loadEmployees(); 
        loadStaffTable();
    } catch (e) { 
        alert("Gagal menyimpan: " + e.message); 
        console.error(e);
    }
};

window.confirmEarlyOut = async function() {
    const r = document.getElementById('earlyReason').value, p = document.getElementById('adminApprovePass').value;
    if (!r || p !== CONFIG.adminPassword) return alert("Gagal!");
    const { empId, employee, type, now } = window.pendingAttendanceData;
    await saveAttendance(empId, employee, type, now, r); closeModals();
};

window.showHistoryDetail = function(logId) {
    if (!window.activeLogs) window.activeLogs = {};
    const log = window.activeLogs[logId];
    if (!log) {
        alert("Detail logs tidak ditemukan.");
        return;
    }

    const name = log.employees?.full_name || 'Staf';
    const date = new Date(log.check_in_time);
    const dateStr = date.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const timeStr = date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    let title = "Detail Kehadiran";
    let icon = "ri-information-line";
    let iconBg = "var(--primary-light)";
    let iconColor = "var(--primary)";
    let detailsHtml = "";

    const isManual = log.type === 'manual';
    const isPiket = log.type?.startsWith('piket');

    // Cek toleransi piket lewat pencarian di allEmployees
    const employee = allEmployees.find(e => e.id === log.employee_id);
    const isPiketStaff = employee && (
        (employee.position && employee.position.toLowerCase().includes('piket')) || 
        (employee.department && employee.department.toLowerCase().includes('piket'))
    );

    if (isManual) {
        title = "Detail Kehadiran Manual";
        iconBg = "rgba(79, 70, 229, 0.1)";
        iconColor = "var(--primary)";
        icon = "ri-edit-box-line";
        
        let statusBadgeColor = "var(--primary)";
        let statusBadgeBg = "var(--primary-light)";
        if (log.status === "Sakit") {
            statusBadgeColor = "var(--danger)";
            statusBadgeBg = "var(--danger-light)";
            icon = "ri-heart-pulse-line";
            iconBg = "var(--danger-light)";
            iconColor = "var(--danger)";
        } else if (log.status === "Ijin") {
            statusBadgeColor = "var(--warning)";
            statusBadgeBg = "var(--warning-light)";
            icon = "ri-chat-history-line";
            iconBg = "var(--warning-light)";
            iconColor = "var(--warning)";
        } else if (log.status === "Tugas Luar") {
            statusBadgeColor = "var(--info)";
            statusBadgeBg = "var(--info-light)";
            icon = "ri-road-map-line";
            iconBg = "var(--info-light)";
            iconColor = "var(--info)";
        }

        detailsHtml = `
            <div style="width: 64px; height: 64px; border-radius: 16px; background: ${iconBg}; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;">
                <i class="${icon}" style="font-size: 1.8rem; color: ${iconColor};"></i>
            </div>
            <h3 style="font-size: 1.25rem; font-weight: 700; color: var(--text-main); margin: 0;">${title}</h3>
            <p style="color: var(--text-secondary); font-size: 0.95rem; margin: 8px 0 0;">Staf: <strong style="color: var(--text-main);">${name}</strong></p>
            <p style="color: var(--text-muted); font-size: 0.85rem; margin: 4px 0 16px;">Tanggal: <strong>${dateStr}</strong></p>
            
            <div style="background: var(--bg-input); border: 1px solid var(--border-color); border-radius: 12px; padding: 16px; text-align: left; margin-top: 10px;">
                <div class="logic-row" style="border-bottom: 1px solid var(--border-light); padding-bottom: 8px; margin-bottom: 8px;">
                    <span style="font-weight: 600; color: var(--text-muted);">Status Kehadiran</span>
                    <span class="badge" style="background: ${statusBadgeBg}; color: ${statusBadgeColor}; font-weight: 700; border: 1px solid rgba(0,0,0,0.05);">${log.status}</span>
                </div>
                <div class="logic-row" style="border-bottom: 1px solid var(--border-light); padding-bottom: 8px; margin-bottom: 8px;">
                    <span style="font-weight: 600; color: var(--text-muted);">Metode Input</span>
                    <span style="color: var(--text-secondary); font-weight: 500;"><i class="ri-user-settings-line"></i> Manual oleh Admin</span>
                </div>
                <div style="margin-top: 10px;">
                    <span style="font-weight: 600; color: var(--text-muted); display: block; font-size: 0.8rem; margin-bottom: 6px;">Alasan / Catatan</span>
                    <div style="background: #ffffff; border-left: 4px solid ${statusBadgeColor}; padding: 10px 12px; border-radius: 4px; font-style: italic; color: var(--text-secondary); font-size: 0.9rem; line-height: 1.4; word-break: break-word;">
                        "${log.notes || 'Tidak ada alasan/catatan yang dicantumkan.'}"
                    </div>
                </div>
            </div>
        `;
    } else {
        // Biometric / Real Attendance
        title = isPiket ? "Detail Kehadiran Piket" : "Detail Kehadiran Biometrik";
        
        let statusBadgeColor = "var(--success)";
        let statusBadgeBg = "var(--success-light)";
        icon = "ri-checkbox-circle-line";
        iconBg = "var(--success-light)";
        iconColor = "var(--success)";

        if (log.status === "Late" || log.status === "Terlambat" || log.status === "Piket Terlambat") {
            statusBadgeColor = "var(--danger)";
            statusBadgeBg = "var(--danger-light)";
            icon = "ri-error-warning-line";
            iconBg = "var(--danger-light)";
            iconColor = "var(--danger)";
        } else if (log.status === "Early Bird") {
            statusBadgeColor = "var(--success)";
            statusBadgeBg = "var(--success-light)";
            icon = "ri-copper-coin-line";
            iconBg = "var(--success-light)";
            iconColor = "var(--success)";
        } else if (log.status === "On-Time" || log.status === "Piket Tepat Waktu") {
            statusBadgeColor = "var(--primary)";
            statusBadgeBg = "var(--primary-light)";
            icon = "ri-checkbox-circle-line";
            iconBg = "var(--primary-light)";
            iconColor = "var(--primary)";
        }

        let financialDetailHtml = "";
        if (log.reward_amount > 0) {
            financialDetailHtml = `
                <div class="logic-row" style="border-bottom: 1px solid var(--border-light); padding-bottom: 8px; margin-bottom: 8px;">
                    <span style="font-weight: 600; color: var(--text-muted);">Insentif (Reward)</span>
                    <span style="color: var(--success); font-weight: 700;">+Rp ${log.reward_amount.toLocaleString()}</span>
                </div>
            `;
        } else if (log.penalty_amount > 0) {
            financialDetailHtml = `
                <div class="logic-row" style="border-bottom: 1px solid var(--border-light); padding-bottom: 8px; margin-bottom: 8px;">
                    <span style="font-weight: 600; color: var(--text-muted);">Denda Terlambat</span>
                    <span style="color: var(--danger); font-weight: 700;">-Rp ${log.penalty_amount.toLocaleString()}</span>
                </div>
            `;
        }

        let lateDetailHtml = "";
        if (log.late_duration_minutes > 0) {
            lateDetailHtml = `
                <div class="logic-row" style="border-bottom: 1px solid var(--border-light); padding-bottom: 8px; margin-bottom: 8px;">
                    <span style="font-weight: 600; color: var(--text-muted);">Durasi Terlambat</span>
                    <span style="color: var(--danger); font-weight: 600;">${log.late_duration_minutes} Menit</span>
                </div>
            `;
        }

        let reasonHtml = "";
        if (log.notes && log.notes !== "Absensi Piket") {
            reasonHtml = `
                <div style="margin-top: 10px;">
                    <span style="font-weight: 600; color: var(--text-muted); display: block; font-size: 0.8rem; margin-bottom: 6px;">Catatan (Persetujuan Admin)</span>
                    <div style="background: #ffffff; border-left: 4px solid var(--primary); padding: 10px 12px; border-radius: 4px; font-style: italic; color: var(--text-secondary); font-size: 0.9rem; line-height: 1.4; word-break: break-word;">
                        "${log.notes}"
                    </div>
                </div>
            `;
        }

        let piketToleranceHtml = "";
        if (isPiketStaff && log.type === 'in') {
            piketToleranceHtml = `
                <div class="logic-row" style="border-bottom: 1px solid var(--border-light); padding-bottom: 8px; margin-bottom: 8px; background: rgba(79, 70, 229, 0.05); padding: 6px 10px; border-radius: 6px; margin-top: 4px;">
                    <span style="font-weight: 600; color: var(--primary);"><i class="ri-time-line"></i> Toleransi Piket</span>
                    <span style="color: var(--primary); font-weight: 700;">+30 Menit Aktif</span>
                </div>
            `;
        }

        detailsHtml = `
            <div style="width: 64px; height: 64px; border-radius: 16px; background: ${iconBg}; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;">
                <i class="${icon}" style="font-size: 1.8rem; color: ${iconColor};"></i>
            </div>
            <h3 style="font-size: 1.25rem; font-weight: 700; color: var(--text-main); margin: 0;">${title}</h3>
            <p style="color: var(--text-secondary); font-size: 0.95rem; margin: 8px 0 0;">Staf: <strong style="color: var(--text-main);">${name}</strong></p>
            <p style="color: var(--text-muted); font-size: 0.85rem; margin: 4px 0 16px;">Tanggal: <strong>${dateStr}</strong></p>
            
            <div style="background: var(--bg-input); border: 1px solid var(--border-color); border-radius: 12px; padding: 16px; text-align: left; margin-top: 10px;">
                <div class="logic-row" style="border-bottom: 1px solid var(--border-light); padding-bottom: 8px; margin-bottom: 8px;">
                    <span style="font-weight: 600; color: var(--text-muted);">Waktu Scan</span>
                    <span style="color: var(--text-main); font-weight: 600;"><i class="ri-time-line"></i> Pukul ${timeStr}</span>
                </div>
                ${piketToleranceHtml}
                <div class="logic-row" style="border-bottom: 1px solid var(--border-light); padding-bottom: 8px; margin-bottom: 8px;">
                    <span style="font-weight: 600; color: var(--text-muted);">Status</span>
                    <span class="badge" style="background: ${statusBadgeBg}; color: ${statusBadgeColor}; font-weight: 700; border: 1px solid rgba(0,0,0,0.05);">${log.status}</span>
                </div>
                <div class="logic-row" style="border-bottom: 1px solid var(--border-light); padding-bottom: 8px; margin-bottom: 8px;">
                    <span style="font-weight: 600; color: var(--text-muted);">Metode Verifikasi</span>
                    <span style="color: var(--primary); font-weight: 600;"><i class="ri-scan-2-line"></i> Biometrik Wajah</span>
                </div>
                ${lateDetailHtml}
                ${financialDetailHtml}
                ${reasonHtml}
            </div>
        `;
    }

    document.getElementById('attendanceDetailContent').innerHTML = detailsHtml;
    document.getElementById('attendanceDetailModal').classList.remove('hidden');
};
