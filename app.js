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

    const per = document.getElementById('historyPeriodFilter')?.value || 'monthly';
    const empFilter = document.getElementById('historyEmployeeFilter')?.value || 'all';

    let q = supabaseClient.from('attendance_logs').select('*, employees(full_name)');

    if (empFilter !== 'all') q = q.eq('employee_id', empFilter);

    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    if (per === 'daily') {
        q = q.gte('check_in_time', startOfToday.toISOString());
    } else if (per === 'weekly') {
        const sevenDaysAgo = new Date(startOfToday);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6); // hari ini + 6 hari ke belakang = 7 hari
        q = q.gte('check_in_time', sevenDaysAgo.toISOString());
    } else if (per === 'monthly') {
        const startOfMonth = new Date(startOfToday.getFullYear(), startOfToday.getMonth(), 1);
        q = q.gte('check_in_time', startOfMonth.toISOString());
    } else if (per === 'custom') {
        const startVal = document.getElementById('historyDateStart')?.value;
        const endVal = document.getElementById('historyDateEnd')?.value;
        if (startVal && endVal) {
            const startOfRange = new Date(startVal + 'T00:00:00');
            const endOfRange = new Date(endVal + 'T23:59:59');
            if (startOfRange > endOfRange) {
                bIn.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--danger);padding:20px;"><i class="ri-error-warning-line"></i> Tanggal awal tidak boleh melebihi tanggal akhir.</td></tr>';
                bOut.innerHTML = '';
                return;
            }
            q = q.gte('check_in_time', startOfRange.toISOString()).lte('check_in_time', endOfRange.toISOString());
        } else if (startVal) {
            q = q.gte('check_in_time', new Date(startVal + 'T00:00:00').toISOString());
        } else {
            q = q.gte('check_in_time', startOfToday.toISOString());
        }
    }

    const { data } = await q.order('check_in_time', { ascending: false });

    let tempIn = '';
    let tempOut = '';
    window.activeLogs = window.activeLogs || {};
    data?.forEach(log => {
        const time = new Date(log.check_in_time).toLocaleString('id-ID');
        const name = log.employees?.full_name || 'N/A';
        const action = `<button class="btn-icon btn-edit" onclick="openEditLog('${log.id}')" style="margin-right: 6px;"><i class="ri-edit-line"></i></button><button class="btn-icon btn-delete" onclick="deleteLog('${log.id}')"><i class="ri-delete-bin-line"></i></button>`;
        
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
            } else if (log.notes && log.notes.startsWith('[Admin Override]')) {
                noteText = `<span class="badge" style="background: rgba(217,119,6,0.1); color: var(--warning); border: 1px solid rgba(217,119,6,0.2);" title="${log.notes.replace('[Admin Override] ', '')}"><i class="ri-shield-user-line"></i> Admin Override</span>`;
            } else {
                noteText = log.notes || '-';
            }
            tempOut += `<tr><td><strong>${name}</strong></td><td>${time}</td><td>${noteText}</td><td>${action}</td></tr>`;
        }
    });
    bIn.innerHTML = tempIn || '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px;">Tidak ada data</td></tr>';
    bOut.innerHTML = tempOut || '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px;">Tidak ada data</td></tr>';
}

window.onHistoryPeriodChange = function() {
    const per = document.getElementById('historyPeriodFilter')?.value;
    const dateRow = document.getElementById('historyDatePickerRow');
    const dateStart = document.getElementById('historyDateStart');
    const dateEnd = document.getElementById('historyDateEnd');
    if (per === 'custom') {
        if (!dateStart.value || !dateEnd.value) {
            const today = new Date();
            const todayStr = today.toISOString().split('T')[0];
            const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            dateStart.value = startOfMonth.toISOString().split('T')[0];
            dateEnd.value = todayStr;
        }
        dateRow.style.display = 'flex';
        dateStart.focus();
    } else {
        dateRow.style.display = 'none';
    }
    loadHistory();
};

window.resetHistoryDateFilter = function() {
    document.getElementById('historyPeriodFilter').value = 'monthly';
    document.getElementById('historyDateStart').value = '';
    document.getElementById('historyDateEnd').value = '';
    document.getElementById('historyDatePickerRow').style.display = 'none';
    loadHistory();
};
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

// --- ADMIN OVERRIDE: BANTU ABSEN PULANG ---
window.openAdminCheckout = async function() {
    if (!isAdmin) return alert("Akses ditolak! Fitur ini hanya untuk admin.");
    // Reset form
    document.getElementById('adminCheckoutNotes').value = '';
    document.getElementById('adminCheckoutPass').value = '';
    // Default jam pulang: jam kerja selesai hari ini (tapi tidak lebih dari sekarang)
    const now = new Date();
    const sched = getSchedule(now.getDay());
    let defaultTime = sched ? parseTime(sched.out) : now;
    if (defaultTime > now) defaultTime = now;
    const pad = n => String(n).padStart(2, '0');
    document.getElementById('adminCheckoutTime').value =
        `${defaultTime.getFullYear()}-${pad(defaultTime.getMonth()+1)}-${pad(defaultTime.getDate())}T${pad(defaultTime.getHours())}:${pad(defaultTime.getMinutes())}`;
    document.getElementById('adminCheckoutModal').classList.remove('hidden');
    await loadAdminCheckoutPending();
};

async function loadAdminCheckoutPending() {
    const itemsEl = document.getElementById('adminCheckoutPendingItems');
    const empSelect = document.getElementById('adminCheckoutEmpId');
    itemsEl.innerHTML = '<div style="text-align:center;padding:10px;color:var(--text-light);font-size:0.85rem;"><span class="btn-spinner" style="width:14px;height:14px;display:inline-block;"></span> Memuat data...</div>';
    empSelect.innerHTML = '';
    try {
        const lookupDate = new Date(); 
        lookupDate.setDate(lookupDate.getDate() - 3); // Cari hingga 3 hari ke belakang
        // Ambil semua log 3 hari terakhir, urutkan berdasarkan waktu (ascending)
        const { data: recentLogs } = await supabaseClient
            .from('attendance_logs')
            .select('employee_id, type, check_in_time, employees(full_name)')
            .gte('check_in_time', lookupDate.toISOString())
            .in('type', ['in', 'out', 'piket_in', 'piket_out'])
            .order('check_in_time', { ascending: true });

        // Evaluasi state per employee secara kronologis
        const empMap = {};
        recentLogs?.forEach(log => {
            const eid = log.employee_id;
            if (!empMap[eid]) {
                const empData = allEmployees.find(e => e.id === eid);
                const empName = empData?.full_name || log.employees?.full_name || 'N/A';
                empMap[eid] = { id: eid, name: empName, pendingOut: false, pendingPiketOut: false, inTime: null, piketInTime: null };
            }
            if (log.type === 'in') {
                empMap[eid].pendingOut = true;
                empMap[eid].inTime = log.check_in_time;
            } else if (log.type === 'out') {
                empMap[eid].pendingOut = false;
            } else if (log.type === 'piket_in') {
                empMap[eid].pendingPiketOut = true;
                empMap[eid].piketInTime = log.check_in_time;
            } else if (log.type === 'piket_out') {
                empMap[eid].pendingPiketOut = false;
            }
        });

        // Ambil staf yang masih menggantung (belum pulang)
        // Jika staf punya pending regular & piket sekaligus, masukkan sebagai 2 entri yang berbeda
        const allPending = [];
        Object.values(empMap).forEach(e => {
            if (e.pendingOut) {
                allPending.push({ id: e.id, name: e.name, pendingType: 'out', checkInTime: e.inTime });
            }
            if (e.pendingPiketOut) {
                allPending.push({ id: e.id, name: e.name, pendingType: 'piket_out', checkInTime: e.piketInTime });
            }
        });
        if (allPending.length === 0) {
            itemsEl.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;gap:8px;padding:12px;"><i class="ri-checkbox-circle-line" style="color:var(--success);font-size:1.2rem;"></i><span style="color:var(--success);font-weight:600;font-size:0.85rem;">Semua staf sudah absen pulang ✅</span></div>`;
            empSelect.innerHTML = '<option value="">-- Tidak ada staf yang perlu dibantu --</option>';
            return;
        }
        // Render daftar staf belum pulang
        let html = '';
        allPending.forEach(e => {
            const masukTime = e.checkInTime;
            const d = new Date(masukTime);
            // Tampilkan tanggal juga jika kemarin
            const isToday = (d.toDateString() === new Date().toDateString());
            const masukStr = isToday ? d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : 
                                      `${d.getDate()}/${d.getMonth()+1} ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
            const piketTag  = e.pendingType === 'piket_out' ? '<span style="background:rgba(217,119,6,0.12);color:var(--warning);border-radius:4px;padding:1px 7px;font-size:0.7rem;font-weight:700;margin-left:5px;">PIKET</span>' : '';
            html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 4px;border-bottom:1px solid var(--border-light);"><span style="font-weight:600;font-size:0.85rem;color:var(--text-main);">${e.name}${piketTag}</span><span style="font-size:0.78rem;color:var(--text-muted);"><i class="ri-login-box-line"></i> Masuk ${masukStr}</span></div>`;
            empSelect.innerHTML += `<option value="${e.id}" data-type="${e.pendingType}">${e.name}${e.pendingType === 'piket_out' ? ' (Piket)' : ''}</option>`;
        });
        itemsEl.innerHTML = html;
        onAdminCheckoutEmpChange();
    } catch (err) {
        itemsEl.innerHTML = `<div style="color:var(--danger);font-size:0.85rem;padding:8px;"><i class="ri-error-warning-line"></i> Gagal memuat data: ${err.message}</div>`;
    }
}

window.onAdminCheckoutEmpChange = function() {
    const sel = document.getElementById('adminCheckoutEmpId');
    const typeSelect = document.getElementById('adminCheckoutType');
    const selectedOpt = sel.options[sel.selectedIndex];
    if (selectedOpt && selectedOpt.dataset.type) typeSelect.value = selectedOpt.dataset.type;
};

window.saveAdminCheckout = async function() {
    const empId    = document.getElementById('adminCheckoutEmpId').value;
    const type     = document.getElementById('adminCheckoutType').value;
    const timeVal  = document.getElementById('adminCheckoutTime').value;
    const notes    = document.getElementById('adminCheckoutNotes').value.trim();
    const pass     = document.getElementById('adminCheckoutPass').value;
    if (!empId)   return alert("Pilih staf terlebih dahulu!");
    if (!timeVal) return alert("Isi jam pulang!");
    if (!notes)   return alert("Isi catatan / alasan override!");
    if (pass !== CONFIG.adminPassword) return alert("Password admin salah!");
    const checkoutTime = new Date(timeVal);
    if (isNaN(checkoutTime.getTime())) return alert("Format waktu tidak valid!");
    if (checkoutTime > new Date()) return alert("Jam pulang tidak boleh lebih dari waktu sekarang!");
    // Validasi: jam pulang harus setelah jam masuk
    try {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const inType = type === 'piket_out' ? 'piket_in' : 'in';
        const { data: inLog } = await supabaseClient.from('attendance_logs')
            .select('check_in_time').eq('employee_id', empId).eq('type', inType)
            .gte('check_in_time', today.toISOString()).order('check_in_time', { ascending: false }).limit(1);
        if (inLog && inLog.length > 0) {
            const checkInTime = new Date(inLog[0].check_in_time);
            if (checkoutTime <= checkInTime)
                return alert(`Jam pulang (${checkoutTime.toLocaleTimeString('id-ID', {hour:'2-digit',minute:'2-digit'})}) tidak boleh lebih awal atau sama dengan jam masuk (${checkInTime.toLocaleTimeString('id-ID', {hour:'2-digit',minute:'2-digit'})})!`);
        }
    } catch (e) { console.error("Gagal validasi jam masuk:", e); }
    // Simpan
    const saveBtn = document.getElementById('adminCheckoutSaveBtn');
    const origHTML = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="btn-spinner"></span> Menyimpan...';
    try {
        const statusSave = type === 'piket_out' ? 'Piket Selesai' : 'Pulang';
        const { error } = await supabaseClient.from('attendance_logs').insert([{
            employee_id: empId,
            check_in_time: checkoutTime.toISOString(),
            type,
            status: statusSave,
            notes: `[Admin Override] ${notes}`,
            reward_amount: 0,
            penalty_amount: 0,
            late_duration_minutes: 0
        }]);
        if (error) throw error;
        const emp = allEmployees.find(e => e.id === empId);
        alert(`✅ Berhasil! Absen pulang ${emp?.full_name || 'staf'} telah disimpan.`);
        closeModals();
        loadHistory(false);
        loadReport(false);
    } catch (e) {
        alert("Gagal menyimpan: " + e.message);
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = origHTML;
    }
};

window.openEditLog = async function(logId) {
    if (!window.activeLogs) window.activeLogs = {};
    let log = window.activeLogs[logId];
    
    if (!log) {
        try {
            const { data, error } = await supabaseClient
                .from('attendance_logs')
                .select('*, employees(full_name)')
                .eq('id', logId)
                .single();
            if (error || !data) throw new Error("Log tidak ditemukan");
            log = data;
            window.activeLogs[logId] = log;
        } catch (e) {
            alert("Gagal mengambil data log: " + e.message);
            return;
        }
    }

    document.getElementById('editLogId').value = log.id;
    document.getElementById('editLogType').value = log.type;
    document.getElementById('editLogEmpName').value = log.employees?.full_name || 'Staf';
    
    const typeNames = {
        'in': 'Masuk Kantor (Biometrik)',
        'out': 'Pulang Kantor (Biometrik)',
        'piket_in': 'Masuk Piket (Biometrik)',
        'piket_out': 'Pulang Piket (Biometrik)',
        'manual': 'Manual (Izin/Sakit/Tugas Luar)'
    };
    document.getElementById('editLogTypeText').value = typeNames[log.type] || log.type;
    
    const logDate = new Date(log.check_in_time);
    const year = logDate.getFullYear();
    const month = String(logDate.getMonth() + 1).padStart(2, '0');
    const day = String(logDate.getDate()).padStart(2, '0');
    const hours = String(logDate.getHours()).padStart(2, '0');
    const minutes = String(logDate.getMinutes()).padStart(2, '0');
    document.getElementById('editLogTime').value = `${year}-${month}-${day}T${hours}:${minutes}`;
    
    document.getElementById('editLogNotes').value = log.notes || '';
    
    const statusGroup = document.getElementById('editLogStatusGroup');
    const statusSelect = document.getElementById('editLogStatus');
    const autoCalcAlert = document.getElementById('editLogAutoCalcAlert');
    
    if (log.type === 'manual') {
        statusGroup.classList.remove('hidden');
        statusSelect.value = log.status || 'Sakit';
        autoCalcAlert.classList.add('hidden');
    } else {
        statusGroup.classList.add('hidden');
        autoCalcAlert.classList.remove('hidden');
    }
    
    document.getElementById('editLogModal').classList.remove('hidden');
};

window.saveEditLog = async function() {
    const logId = document.getElementById('editLogId').value;
    const logType = document.getElementById('editLogType').value;
    const timeVal = document.getElementById('editLogTime').value;
    const notesVal = document.getElementById('editLogNotes').value;
    
    if (!timeVal) return alert("Pilih tanggal dan waktu!");
    
    const newTime = new Date(timeVal);
    if (isNaN(newTime.getTime())) return alert("Format tanggal/waktu tidak valid!");

    const originalLogs = window.activeLogs || {};
    const log = originalLogs[logId];
    if (!log) return alert("Data log asli tidak ditemukan di sistem.");

    const employeeId = log.employee_id;
    let status = log.status;
    let reward = log.reward_amount || 0;
    let penalty = log.penalty_amount || 0;
    let lateMins = log.late_duration_minutes || 0;

    if (logType === 'in') {
        const sched = getSchedule(newTime.getDay());
        if (sched) {
            let isPiketStaff = false;
            try {
                const lookupTime = new Date(newTime.getTime() - (18 * 60 * 60 * 1000));
                const { data: recentPiketOut } = await supabaseClient
                    .from('attendance_logs')
                    .select('id')
                    .eq('employee_id', employeeId)
                    .eq('type', 'piket_out')
                    .gte('check_in_time', lookupTime.toISOString())
                    .lte('check_in_time', newTime.toISOString())
                    .limit(1);
                if (recentPiketOut && recentPiketOut.length > 0) {
                    isPiketStaff = true;
                }
            } catch (e) {
                console.error("Gagal mengecek log piket_out untuk edit:", e);
            }

            const originalWorkStart = parseTime(sched.in, newTime);
            let workStartForLate = originalWorkStart;
            if (isPiketStaff) {
                workStartForLate = new Date(originalWorkStart.getTime() + (30 * 60000));
            }

            status = "On-Time";
            reward = 0;
            penalty = 0;
            lateMins = 0;

            if (newTime <= new Date(originalWorkStart.getTime() - (CONFIG.earlyBirdBuffer * 60000))) {
                status = "Early Bird";
                reward = CONFIG.earlyBirdReward;
            } else if (newTime > workStartForLate) {
                status = "Late";
                lateMins = Math.floor((newTime - workStartForLate) / 60000);
                const rawPenalty = lateMins * CONFIG.latePenaltyPerMinute;
                const maxCap = CONFIG.maxDailyPenalty || MAX_PENALTY_FALLBACK;
                penalty = Math.min(rawPenalty, maxCap);
            }
        }
    } else if (logType === 'piket_in') {
        const piketStart = parseTime(CONFIG.piketStartTime, newTime);
        status = "Piket Tepat Waktu";
        lateMins = 0;
        reward = 0;
        penalty = 0;
        if (newTime > piketStart) {
            status = "Piket Terlambat";
            lateMins = Math.floor((newTime - piketStart) / 60000);
        }
    } else if (logType === 'piket_out') {
        status = "Piket Selesai";
        try {
            const { data: latestIn } = await supabaseClient
                .from('attendance_logs')
                .select('check_in_time')
                .eq('employee_id', employeeId)
                .eq('type', 'piket_in')
                .lt('check_in_time', log.check_in_time)
                .order('check_in_time', { ascending: false })
                .limit(1);

            let piketEndDate = parseTime(CONFIG.piketEndTime, newTime);
            if (latestIn && latestIn.length > 0) {
                const piketInDate = new Date(latestIn[0].check_in_time);
                const [startH, startM] = CONFIG.piketStartTime.split(':').map(Number);
                const [endH, endM] = CONFIG.piketEndTime.split(':').map(Number);
                
                piketEndDate = new Date(piketInDate);
                piketEndDate.setHours(endH, endM, 0, 0);
                if (endH < startH || (endH === startH && endM < startM)) {
                    piketEndDate.setDate(piketEndDate.getDate() + 1);
                }
            }
            if (newTime < piketEndDate) {
                status = "Piket Pulang Cepat";
            }
        } catch (e) {
            console.error("Gagal kalkulasi piket pulang cepat:", e);
        }
    } else if (logType === 'manual') {
        status = document.getElementById('editLogStatus').value;
    }

    try {
        const { error } = await supabaseClient
            .from('attendance_logs')
            .update({
                check_in_time: newTime.toISOString(),
                status,
                notes: notesVal,
                reward_amount: reward,
                penalty_amount: penalty,
                late_duration_minutes: lateMins
            })
            .eq('id', logId);

        if (error) throw error;

        alert("Data Kehadiran Berhasil Diperbarui!");
        closeModals();
        
        loadHistory(false);
        loadReport(false);
    } catch (e) {
        alert("Gagal memperbarui log: " + e.message);
        console.error(e);
    }
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
    
    // Cek apakah staff telah melakukan absen pulang piket (piket_out) dalam 18 jam terakhir
    let isPiketStaff = false;
    if (type === 'in') {
        try {
            const lookupTime = new Date(now.getTime() - (18 * 60 * 60 * 1000));
            const { data: recentPiketOut } = await supabaseClient
                .from('attendance_logs')
                .select('id')
                .eq('employee_id', empId)
                .eq('type', 'piket_out')
                .gte('check_in_time', lookupTime.toISOString())
                .limit(1);
            if (recentPiketOut && recentPiketOut.length > 0) {
                isPiketStaff = true;
                console.log(`[Piket Grace] Staf ${employee.full_name} memiliki log piket_out dalam 18 jam terakhir. Diberikan toleransi masuk.`);
            }
        } catch (e) {
            console.error("Gagal mengecek log piket_out:", e);
        }
    }

    if (type === 'in' && sched) {
        const originalWorkStart = parseTime(sched.in);
        let workStartForLate = originalWorkStart;
        if (isPiketStaff) {
            workStartForLate = new Date(originalWorkStart.getTime() + (30 * 60000));
            console.log(`[Piket Tolerance] Staf Piket ${employee.full_name} mendapat toleransi 30 menit karena piket pulang. Batas terlambat: ${workStartForLate.toLocaleTimeString()}`);
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

// --- AUDIO NOTIFICATION ---
function playAudio(type) {
    const audioMap = {
        'in': 'audio/masuk.mp3',
        'out': 'audio/pulang.mp3',
        'piket_in': 'audio/piket_masuk.mp3',
        'piket_out': 'audio/piket_pulang.mp3'
    };
    
    if (audioMap[type]) {
        const audio = new Audio(audioMap[type]);
        // Putar audio (browser biasanya mengizinkan ini karena dipicu oleh klik tombol 'Scan')
        audio.play().catch(e => console.log('Audio error/diblokir browser:', e));
    }
}

function showAttendancePopup({ name, time, type, status, lateMins, penalty, reward, isPiketStaff }) {
    // Putar suara notifikasi
    playAudio(type);
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
                <p style="color: var(--primary); font-weight: 600; font-size: 0.8rem; margin: 0; line-height: 1.4;">💡 Toleransi Masuk 30 Menit Aktif (Staf Pasca Piket)</p>
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

    // Ambil log piket terakhir dalam 24 jam untuk karyawan ini agar bebas dari masalah pergantian hari (midnight)
    const { data: latestPiketLogs } = await supabaseClient
        .from('attendance_logs')
        .select('type, check_in_time')
        .eq('employee_id', empId)
        .in('type', ['piket_in', 'piket_out'])
        .order('check_in_time', { ascending: false })
        .limit(1);

    btnIn.innerHTML = oldInTxt; btnOut.innerHTML = oldOutTxt;

    const latestLog = latestPiketLogs && latestPiketLogs[0];
    // Staf dianggap sedang piket jika log terakhir adalah piket_in dan usianya kurang dari 24 jam
    const hasIn = latestLog && latestLog.type === 'piket_in' && (new Date() - new Date(latestLog.check_in_time)) < 24 * 60 * 60 * 1000;
    const hasOut = !hasIn && latestLog && latestLog.type === 'piket_out' && (new Date() - new Date(latestLog.check_in_time)) < 24 * 60 * 60 * 1000;

    const now = new Date();
    const piketStart = parseTime(CONFIG.piketStartTime);
    const earliestPiketIn = new Date(piketStart.getTime() - (30 * 60000));

    if (!hasIn) {
        // Jika sudah absen pulang hari ini (dalam 24 jam terakhir), tidak bisa masuk lagi
        if (hasOut) {
            btnIn.disabled = true;
            btnOut.disabled = true;
            btnIn.title = "Anda sudah menyelesaikan piket hari ini.";
        } else {
            if (now < earliestPiketIn) {
                btnIn.disabled = true;
                const timeStr = earliestPiketIn.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                btnIn.title = `Absen masuk piket baru bisa dilakukan mulai pukul ${timeStr}`;
            } else {
                btnIn.disabled = false;
            }
            btnOut.disabled = true;
        }
    } else {
        // Sedang piket (hasIn = true)
        btnIn.disabled = true;
        
        // Hitung waktu piket selesai secara presisi berdasarkan tanggal log masuk piket
        const piketInDate = new Date(latestLog.check_in_time);
        const [startH, startM] = CONFIG.piketStartTime.split(':').map(Number);
        const [endH, endM] = CONFIG.piketEndTime.split(':').map(Number);
        
        let piketEndDate = new Date(piketInDate);
        piketEndDate.setHours(endH, endM, 0, 0);
        
        // Jika shift melewati tengah malam
        if (endH < startH || (endH === startH && endM < startM)) {
            piketEndDate.setDate(piketEndDate.getDate() + 1);
        }

        if (now < piketEndDate) {
            btnOut.disabled = false; // Aktifkan tombol agar bisa dipencet (bila ingin pulang lebih cepat dengan izin admin)
            const timeStr = piketEndDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
            btnOut.title = `Shift piket selesai pukul ${timeStr}. Pulang lebih cepat memerlukan persetujuan admin.`;
        } else {
            btnOut.disabled = false;
        }
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
        // Ambil log masuk piket terakhir untuk mendapatkan waktu mulai piket
        const { data: latestIn } = await supabaseClient
            .from('attendance_logs')
            .select('check_in_time')
            .eq('employee_id', empId)
            .eq('type', 'piket_in')
            .order('check_in_time', { ascending: false })
            .limit(1);

        let piketEndDate = parseTime(CONFIG.piketEndTime);
        if (latestIn && latestIn.length > 0) {
            const piketInDate = new Date(latestIn[0].check_in_time);
            const [startH, startM] = CONFIG.piketStartTime.split(':').map(Number);
            const [endH, endM] = CONFIG.piketEndTime.split(':').map(Number);
            
            piketEndDate = new Date(piketInDate);
            piketEndDate.setHours(endH, endM, 0, 0);
            
            if (endH < startH || (endH === startH && endM < startM)) {
                piketEndDate.setDate(piketEndDate.getDate() + 1);
            }
        }

        if (now < piketEndDate) {
            const emp = allEmployees.find(e => e.id === empId);
            window.pendingAttendanceData = { empId, employee: emp, type: 'piket_out', now };
            document.getElementById('earlyOutModal').classList.remove('hidden');
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
        const typeStr = type === 'in' ? 'piket_in' : 'piket_out';
        
        // Cek log piket terakhir dalam 24 jam terakhir secara dinamis (bebas dari masalah pergantian hari/midnight)
        const { data: latestPiketLogs } = await supabaseClient
            .from('attendance_logs')
            .select('type, check_in_time')
            .eq('employee_id', empId)
            .in('type', ['piket_in', 'piket_out'])
            .order('check_in_time', { ascending: false })
            .limit(1);

        const latestLog = latestPiketLogs && latestPiketLogs[0];
        
        if (type === 'in') {
            const hasIn = latestLog && latestLog.type === 'piket_in' && (new Date() - new Date(latestLog.check_in_time)) < 24 * 60 * 60 * 1000;
            if (hasIn) { alert("Anda sudah absen masuk piket tadi."); return resetButtons(); }
        } else {
            const hasOut = latestLog && latestLog.type === 'piket_out' && (new Date() - new Date(latestLog.check_in_time)) < 24 * 60 * 60 * 1000;
            if (hasOut) { alert("Anda sudah absen pulang piket tadi."); return resetButtons(); }
        }
        
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

async function savePiketAttendance(empId, employee, type, now, reason = "Absensi Piket") {
    let status = "Piket Tepat Waktu", reward = 0, penalty = 0, lateMins = 0;
    if (type === 'piket_in') {
        const piketStart = parseTime(CONFIG.piketStartTime);
        if (now > piketStart) {
            status = "Piket Terlambat";
            lateMins = Math.floor((now - piketStart) / 60000);
        }
    } else {
        status = reason !== "Absensi Piket" ? "Piket Pulang Cepat" : "Piket Selesai";
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
    
    document.getElementById('resultBoxPiket').classList.remove('hidden');
    document.getElementById('resultNamePiket').textContent = employee.full_name;
    document.getElementById('resultTimePiket').textContent = now.toLocaleTimeString();
    document.getElementById('resultBadgePiket').textContent = status;
    
    showPiketAttendancePopup({ name: employee.full_name, time: now, type, status, lateMins });
    
    // Update status tombol
    checkPiketStatus();
}

function showPiketAttendancePopup({ name, time, type, status, lateMins }) {
    // Putar suara notifikasi
    playAudio(type);
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
// Tampilkan/sembunyikan date range picker berdasarkan pilihan period filter
window.onPeriodFilterChange = function() {
    const per = document.getElementById('reportPeriodFilter')?.value;
    const dateRow = document.getElementById('reportDatePickerRow');
    const dateStart = document.getElementById('reportDateStart');
    const dateEnd = document.getElementById('reportDateEnd');
    if (per === 'custom') {
        // Set default: awal bulan ini s/d hari ini
        if (!dateStart.value || !dateEnd.value) {
            const today = new Date();
            const todayStr = today.toISOString().split('T')[0];
            const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            const startStr = startOfMonth.toISOString().split('T')[0];
            dateStart.value = startStr;
            dateEnd.value = todayStr;
        }
        dateRow.style.display = 'flex';
        dateStart.focus();
    } else {
        dateRow.style.display = 'none';
    }
    loadReport();
};

window.resetDateFilter = function() {
    document.getElementById('reportPeriodFilter').value = 'daily';
    document.getElementById('reportDateStart').value = '';
    document.getElementById('reportDateEnd').value = '';
    document.getElementById('reportDatePickerRow').style.display = 'none';
    loadReport();
};

async function loadReport(isAutoRefresh = false) {
    const emp = document.getElementById('reportEmployeeFilter')?.value || 'all';
    const per = document.getElementById('reportPeriodFilter')?.value || 'daily';
    const typeFilter = document.getElementById('reportTypeFilter')?.value || 'all';
    const body = document.getElementById('reportTableBody');
    if (!body) return;
    if (!isAutoRefresh) {
        body.innerHTML = '<tr><td colspan="8">Memuat...</td></tr>';
    }
    let q = supabaseClient.from('attendance_logs').select('*, employees(full_name)');
    if (emp !== 'all') q = q.eq('employee_id', emp);
    
    // Filter by type
    if (typeFilter === 'kantor') {
        q = q.in('type', ['in', 'out', 'manual']);
    } else if (typeFilter === 'piket') {
        q = q.in('type', ['piket_in', 'piket_out']);
    }
    
    const startOfToday = new Date(); startOfToday.setHours(0,0,0,0);
    if (per === 'daily') q = q.gte('check_in_time', startOfToday.toISOString());
    else if (per === 'weekly') { const sevenDaysAgo = new Date(startOfToday); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6); q = q.gte('check_in_time', sevenDaysAgo.toISOString()); }
    else if (per === 'monthly') { const startOfMonth = new Date(startOfToday.getFullYear(), startOfToday.getMonth(), 1); q = q.gte('check_in_time', startOfMonth.toISOString()); }
    else if (per === 'custom') {
        const startVal = document.getElementById('reportDateStart')?.value;
        const endVal = document.getElementById('reportDateEnd')?.value;
        if (startVal && endVal) {
            const startOfRange = new Date(startVal + 'T00:00:00');
            const endOfRange = new Date(endVal + 'T23:59:59');
            // Validasi: pastikan tanggal awal tidak lebih dari tanggal akhir
            if (startOfRange > endOfRange) {
                document.getElementById('reportTableBody').innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--danger); padding:20px;"><i class="ri-error-warning-line"></i> Tanggal awal tidak boleh lebih dari tanggal akhir.</td></tr>';
                return;
            }
            q = q.gte('check_in_time', startOfRange.toISOString()).lte('check_in_time', endOfRange.toISOString());
        } else if (startVal) {
            // Jika hanya tanggal awal yang diisi, tampilkan dari tanggal itu sampai hari ini
            const startOfRange = new Date(startVal + 'T00:00:00');
            const endOfRange = new Date(startOfToday.getTime() + 86399999);
            q = q.gte('check_in_time', startOfRange.toISOString()).lte('check_in_time', endOfRange.toISOString());
        } else {
            // Fallback: hari ini
            q = q.gte('check_in_time', startOfToday.toISOString());
        }
    }
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
    let trs = '', totalHadir = 0, totalTelat = 0, totalPiket = 0;
    
    rows.forEach(r => {
        if (r.isPiket) totalPiket++;
        else totalHadir++;

        if (r.late > 0) totalTelat++;

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
        trs += `<tr><td><strong style="color:var(--text-main);">${nameText}</strong></td><td>${r.date}</td><td>${r.in}</td><td>${r.out}</td><td>${r.late > 0 ? `${r.late} Menit` : '-'}</td><td><span class="badge clickable-badge" ${badgeStyle} onclick="showHistoryDetail('${r.logId}')" title="Klik untuk detail"><i class="ri-information-line"></i> ${r.status}</span></td><td style="color:var(--success); font-weight:600;">Rp ${r.reward.toLocaleString()}</td><td style="color:var(--danger); font-weight:600;">Rp ${r.penalty.toLocaleString()}</td></tr>`;
    });

    if (!trs) trs = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 20px;">Tidak ada data laporan</td></tr>';
    body.innerHTML = trs;

    const summary = document.getElementById('reportSummary');
    if (summary) {
        summary.innerHTML = `<div style="display: flex; gap: 20px; margin-bottom: 20px; background: white; padding: 15px 20px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); border: 1px solid var(--border-light); flex-wrap: wrap;">
            <div style="flex: 1; min-width: 120px; text-align: center; border-right: 1px solid var(--border-light);">
                <div style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Total Hadir (Kantor)</div>
                <div style="font-size: 1.5rem; font-weight: 800; color: var(--success); margin-top: 5px;">${totalHadir}</div>
            </div>
            <div style="flex: 1; min-width: 120px; text-align: center; border-right: 1px solid var(--border-light);">
                <div style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Total Piket</div>
                <div style="font-size: 1.5rem; font-weight: 800; color: var(--warning); margin-top: 5px;">${totalPiket}</div>
            </div>
            <div style="flex: 1; min-width: 120px; text-align: center;">
                <div style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Total Telat</div>
                <div style="font-size: 1.5rem; font-weight: 800; color: var(--danger); margin-top: 5px;">${totalTelat}</div>
            </div>
        </div>`;
    }
}

// --- CETAK PDF ---
window.exportPDF = async function() {
    // Pastikan jsPDF tersedia (bundled dengan html2pdf)
    const jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) || (window.jsPDF);
    if (!jsPDFCtor) {
        return alert("Library PDF belum siap. Silakan refresh halaman.");
    }

    const btn = event.currentTarget;
    const origHtml = btn.innerHTML;
    btn.innerHTML = '<span class="btn-spinner"></span> Menyusun PDF...';
    btn.disabled = true;

    try {
        // ── Ambil data dari tabel laporan yang sedang tampil ──
        const tbody = document.getElementById('reportTableBody');
        const rows = Array.from(tbody.querySelectorAll('tr'));

        // Ambil teks bersih setiap sel (hapus badge HTML)
        const tableData = rows.map(tr =>
            Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim().replace(/\s+/g, ' '))
        ).filter(r => r.length > 0 && r[0] !== '' && !r[0].includes('Tidak ada data') && !r[0].includes('Laporan muncul'));

        // ── Info filter ──
        const per      = document.getElementById('reportPeriodFilter').options[document.getElementById('reportPeriodFilter').selectedIndex].text;
        const tipeEl   = document.getElementById('reportTypeFilter');
        const tipe     = tipeEl ? tipeEl.options[tipeEl.selectedIndex].text : 'Semua';
        const empEl    = document.getElementById('reportEmployeeFilter');
        const empText  = empEl ? empEl.options[empEl.selectedIndex].text : 'Semua Staf';
        const printDate = new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' });

        // ── Hitung statistik dari tableData ──
        let totalHadir = 0, totalPiket = 0, totalTelat = 0, totalReward = 0, totalDenda = 0;
        const statusCount = {};
        tableData.forEach(row => {
            const nameSt  = row[0] || '';
            const status  = row[5] || '';
            const rewardS = (row[6] || '').replace(/[^0-9]/g, '');
            const dendaS  = (row[7] || '').replace(/[^0-9]/g, '');
            if (nameSt.toUpperCase().includes('PIKET')) totalPiket++;
            else totalHadir++;
            if (status.toLowerCase().includes('terlambat') || status.toLowerCase() === 'late') totalTelat++;
            totalReward += parseInt(rewardS) || 0;
            totalDenda  += parseInt(dendaS)  || 0;
            statusCount[status] = (statusCount[status] || 0) + 1;
        });

        // ── Setup jsPDF A4 Portrait ──
        const doc = new jsPDFCtor({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const PW = doc.internal.pageSize.getWidth();   // 297mm
        const PH = doc.internal.pageSize.getHeight();  // 210mm
        const ML = 12, MR = 12, MT = 12, MB = 15;
        const contentW = PW - ML - MR;

        // ── Warna tema ──
        const C_PRIMARY  = [79, 70, 229];
        const C_SUCCESS  = [5, 150, 105];
        const C_WARNING  = [217, 119, 6];
        const C_DANGER   = [220, 38, 38];
        const C_MUTED    = [107, 114, 128];
        const C_LIGHT    = [243, 244, 246];
        const C_BORDER   = [229, 231, 235];
        const C_WHITE    = [255, 255, 255];
        const C_DARK     = [31, 41, 55];

        // ── Helper: gambar header halaman ──
        const drawPageHeader = (pageNum) => {
            // Strip ungu di atas
            doc.setFillColor(...C_PRIMARY);
            doc.rect(0, 0, PW, 22, 'F');

            doc.setTextColor(...C_WHITE);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(13);
            doc.text('LAPORAN & REKAP ABSENSI KARYAWAN', PW / 2, 9, { align: 'center' });

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.text(`Periode: ${per}  |  Tipe: ${tipe}  |  Staf: ${empText}  |  Dicetak: ${printDate}`, PW / 2, 15.5, { align: 'center' });

            // Nomor halaman
            doc.setFontSize(7);
            doc.text(`Hal. ${pageNum}`, PW - MR, 15.5, { align: 'right' });
        };

        // ── Helper: gambar footer ──
        const drawPageFooter = () => {
            doc.setDrawColor(...C_BORDER);
            doc.setLineWidth(0.3);
            doc.line(ML, PH - MB + 4, PW - MR, PH - MB + 4);
            doc.setTextColor(...C_MUTED);
            doc.setFontSize(7);
            doc.setFont('helvetica', 'italic');
            doc.text('Dokumen ini dicetak secara otomatis oleh Sistem Absensi Cerdas', ML, PH - MB + 9);
            doc.text(`© ${new Date().getFullYear()} Absensi Cerdas`, PW - MR, PH - MB + 9, { align: 'right' });
        };

        // ── Kolom tabel ──
        const headers = ['NAMA STAF', 'TANGGAL', 'MASUK', 'PULANG', 'TELAT', 'STATUS', 'REWARD', 'DENDA'];
        const colW    = [62, 22, 18, 18, 16, 36, 26, 26]; // total ~224, contentW ~273 → adjust
        // Scale to fit
        const totalColW = colW.reduce((a, b) => a + b, 0);
        const scale = contentW / totalColW;
        const cW = colW.map(w => w * scale);

        const ROW_H     = 7.5;
        const HEADER_H  = 8.5;
        const PAGE_HEADER_H = 24;
        const PAGE_FOOTER_H = MB + 2;
        const usableH   = PH - PAGE_HEADER_H - PAGE_FOOTER_H;

        // ── Fungsi gambar header tabel ──
        const drawTableHeader = (y) => {
            doc.setFillColor(...C_PRIMARY);
            doc.rect(ML, y, contentW, HEADER_H, 'F');
            doc.setTextColor(...C_WHITE);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            let x = ML;
            headers.forEach((h, i) => {
                doc.text(h, x + 2, y + HEADER_H - 2.5);
                x += cW[i];
            });
            return y + HEADER_H;
        };

        // ── HALAMAN 1: Tabel ──
        let pageNum = 1;
        // doc.addPage() tidak diperlukan karena instance baru sudah memiliki 1 halaman secara default
        drawPageHeader(pageNum);
        drawPageFooter();

        let curY = PAGE_HEADER_H + 2;
        curY = drawTableHeader(curY);

        let rowIdx = 0;
        let isEven = false;

        while (rowIdx < tableData.length) {
            // Cek apakah muat di halaman ini
            if (curY + ROW_H > PH - PAGE_FOOTER_H) {
                // Halaman baru
                doc.addPage();
                pageNum++;
                drawPageHeader(pageNum);
                drawPageFooter();
                curY = PAGE_HEADER_H + 2;
                curY = drawTableHeader(curY);
                isEven = false;
            }

            const row = tableData[rowIdx];
            const isPiketRow = (row[0] || '').toLowerCase().includes('piket');

            // Background baris
            if (isEven) {
                doc.setFillColor(249, 250, 251);
                doc.rect(ML, curY, contentW, ROW_H, 'F');
            }

            // Border bawah baris
            doc.setDrawColor(...C_BORDER);
            doc.setLineWidth(0.2);
            doc.line(ML, curY + ROW_H, ML + contentW, curY + ROW_H);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);

            let x = ML;
            row.forEach((cell, ci) => {
                const cellText = doc.splitTextToSize(cell, cW[ci] - 3);
                const cellStr  = Array.isArray(cellText) ? cellText[0] : cellText;

                // Warna teks kolom status
                if (ci === 5) {
                    const sl = cell.toLowerCase();
                    if (sl.includes('terlambat') || sl === 'late') doc.setTextColor(...C_DANGER);
                    else if (sl.includes('early bird'))            doc.setTextColor(...C_SUCCESS);
                    else if (sl.includes('piket'))                 doc.setTextColor(...C_WARNING);
                    else                                           doc.setTextColor(...C_PRIMARY);
                    doc.setFont('helvetica', 'bold');
                } else if (ci === 6) {
                    doc.setTextColor(...C_SUCCESS);
                    doc.setFont('helvetica', 'bold');
                } else if (ci === 7) {
                    doc.setTextColor(parseInt((row[7] || '0').replace(/[^0-9]/g, '')) > 0 ? C_DANGER[0] : C_MUTED[0],
                                     parseInt((row[7] || '0').replace(/[^0-9]/g, '')) > 0 ? C_DANGER[1] : C_MUTED[1],
                                     parseInt((row[7] || '0').replace(/[^0-9]/g, '')) > 0 ? C_DANGER[2] : C_MUTED[2]);
                    doc.setFont('helvetica', 'bold');
                } else if (ci === 0) {
                    doc.setTextColor(...C_DARK);
                    doc.setFont('helvetica', 'bold');
                } else {
                    doc.setTextColor(...C_DARK);
                    doc.setFont('helvetica', 'normal');
                }

                doc.text(cellStr, x + 2, curY + ROW_H - 2.3);
                x += cW[ci];
            });

            // Garis vertikal antar kolom
            doc.setDrawColor(...C_BORDER);
            doc.setLineWidth(0.1);
            let xv = ML;
            cW.forEach(w => { xv += w; doc.line(xv, curY, xv, curY + ROW_H); });

            curY += ROW_H;
            isEven = !isEven;
            rowIdx++;
        }

        // Border luar tabel
        doc.setDrawColor(...C_BORDER);
        doc.setLineWidth(0.4);

        // ── HALAMAN TERAKHIR: DASHBOARD RINGKASAN ──
        doc.addPage();
        pageNum++;
        drawPageHeader(pageNum);
        drawPageFooter();

        let dy = PAGE_HEADER_H + 6;

        // Judul dashboard
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(...C_PRIMARY);
        doc.text('RINGKASAN EKSEKUTIF', PW / 2, dy, { align: 'center' });
        dy += 8;

        // ── 4 Kartu statistik ──
        const cards = [
            { label: 'Total Hadir\n(Kantor)',    value: totalHadir,                        color: C_SUCCESS },
            { label: 'Total Piket',              value: totalPiket,                        color: C_WARNING },
            { label: 'Total Terlambat',          value: totalTelat,                        color: C_DANGER  },
            { label: 'Total Reward',             value: `Rp ${totalReward.toLocaleString('id-ID')}`, color: C_SUCCESS, small: true },
            { label: 'Total Denda',              value: `Rp ${totalDenda.toLocaleString('id-ID')}`,  color: C_DANGER,  small: true },
            { label: 'Total Record',             value: tableData.length,                  color: C_PRIMARY },
        ];

        const cardW = (contentW - 10) / 3;
        const cardH = 22;
        const cardRows = [[0,1,2],[3,4,5]];

        cardRows.forEach((row, ri) => {
            row.forEach((ci, cii) => {
                const card = cards[ci];
                const cx = ML + cii * (cardW + 5);
                const cy = dy + ri * (cardH + 6);

                // Shadow effect
                doc.setFillColor(220, 220, 230);
                doc.roundedRect(cx + 0.8, cy + 0.8, cardW, cardH, 3, 3, 'F');

                // Kartu putih
                doc.setFillColor(...C_WHITE);
                doc.roundedRect(cx, cy, cardW, cardH, 3, 3, 'F');

                // Aksen warna kiri
                doc.setFillColor(...card.color);
                doc.roundedRect(cx, cy, 3.5, cardH, 1.5, 1.5, 'F');

                // Label
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(7);
                doc.setTextColor(...C_MUTED);
                doc.text(card.label, cx + 7, cy + 7);

                // Value
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(card.small ? 11 : 16);
                doc.setTextColor(...card.color);
                doc.text(String(card.value), cx + 7, cy + 17);
            });
        });

        dy += cardRows.length * (cardH + 6) + 8;

        // ── BAR CHART: Distribusi Status ──
        const chartTitle = 'Distribusi Status Kehadiran';
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(...C_DARK);
        doc.text(chartTitle, ML, dy);
        dy += 5;

        const statusEntries = Object.entries(statusCount).sort((a, b) => b[1] - a[1]);
        const maxVal = Math.max(...statusEntries.map(e => e[1]), 1);
        const BAR_AREA_W = contentW * 0.55;
        const BAR_AREA_H = Math.min(statusEntries.length * 11 + 5, 65);
        const BAR_H = 7;
        const BAR_GAP = 4;

        const statusColors = {
            'early bird'    : C_SUCCESS,
            'on-time'       : C_PRIMARY,
            'on time'       : C_PRIMARY,
            'late'          : C_DANGER,
            'terlambat'     : C_DANGER,
            'piket tepat waktu' : C_WARNING,
            'piket terlambat'   : [239, 68, 68],
            'piket selesai'     : C_WARNING,
        };

        let barY = dy;
        statusEntries.forEach(([status, count]) => {
            const colorKey = status.toLowerCase();
            const barColor = statusColors[colorKey] || C_PRIMARY;
            const barLen = (count / maxVal) * (BAR_AREA_W - 55);

            // Mapping label status
            let displayStatus = status;
            if (colorKey === 'early bird') displayStatus = 'Datang di awal waktu';
            else if (colorKey === 'on-time' || colorKey === 'on time') displayStatus = 'Datang tepat waktu';
            else if (colorKey === 'late') displayStatus = 'Terlambat';

            // Label status
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(...C_DARK);
            const labelText = doc.splitTextToSize(displayStatus, 50);
            doc.text(labelText[0], ML, barY + BAR_H - 1.5);

            // Background bar
            doc.setFillColor(...C_LIGHT);
            doc.roundedRect(ML + 55, barY, BAR_AREA_W - 55, BAR_H, 1, 1, 'F');

            // Bar isi
            doc.setFillColor(...barColor);
            if (barLen > 0) doc.roundedRect(ML + 55, barY, barLen, BAR_H, 1, 1, 'F');

            // Angka di ujung bar
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(...barColor);
            doc.text(String(count), ML + 55 + barLen + 2, barY + BAR_H - 1.5);

            barY += BAR_H + BAR_GAP;
        });

        // ── PIE / DONUT indikator kehadiran (kanan chart) ──
        const pieX = ML + BAR_AREA_W + 50; // Digeser ke kanan agar tidak menutupi bar chart
        const pieY = dy + 18;
        const pieR = 22;

        const hadirPct  = tableData.length > 0 ? Math.round((totalHadir / tableData.length) * 100) : 0;
        const piketPct  = tableData.length > 0 ? Math.round((totalPiket / tableData.length) * 100) : 0;
        const telatPct  = tableData.length > 0 ? Math.round((totalTelat / tableData.length) * 100) : 0;

        // Lingkaran latar
        doc.setFillColor(...C_LIGHT);
        doc.circle(pieX, pieY, pieR, 'F');

        // Arc hadir (approx dengan rect warna sebagai legend visual sederhana)
        // Karena jsPDF tidak punya arc pie, kita gunakan gauge circle + legend
        doc.setDrawColor(...C_SUCCESS);
        doc.setLineWidth(4);
        doc.circle(pieX, pieY, pieR - 4, 'S');

        // Teks tengah
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(...C_SUCCESS);
        doc.text(`${hadirPct}%`, pieX, pieY - 1, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(...C_MUTED);
        doc.text('Hadir', pieX, pieY + 5, { align: 'center' });

        // Legend di bawah lingkaran
        const legends = [
            { label: `Hadir Kantor: ${totalHadir}`,  color: C_SUCCESS },
            { label: `Piket: ${totalPiket}`,           color: C_WARNING },
            { label: `Terlambat: ${totalTelat}`,       color: C_DANGER  },
        ];
        let legY = pieY + pieR + 6;
        legends.forEach(leg => {
            doc.setFillColor(...leg.color);
            doc.rect(pieX - 18, legY - 3, 5, 3.5, 'F');
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(...C_DARK);
            doc.text(leg.label, pieX - 11, legY);
            legY += 6;
        });

        // ── Catatan di bawah dashboard ──
        const noteY = PH - MB - 6;
        doc.setDrawColor(...C_BORDER);
        doc.setLineWidth(0.3);
        doc.line(ML, noteY - 4, PW - MR, noteY - 4);
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7);
        doc.setTextColor(...C_MUTED);
        doc.text('* Laporan ini hanya menampilkan data yang sudah lengkap (absen masuk dan pulang). Data tanpa absen pulang tidak dihitung dalam rekap.', ML, noteY);

        // ── Simpan ──
        const filename = `Laporan_Absensi_${new Date().toISOString().split('T')[0]}.pdf`;
        doc.save(filename);

    } catch(err) {
        console.error(err);
        alert('Gagal membuat PDF: ' + err.message);
    } finally {
        btn.innerHTML = origHtml;
        btn.disabled = false;
    }
}

// --- UTILS ---
async function loadEmployees() {
    const { data } = await supabaseClient.from('employees').select('id, full_name, position, department, face_embedding');
    allEmployees = data || []; 
    attendanceEmployeeSelect.innerHTML = '<option value="">-- Pilih Nama --</option>';
    if (piketEmployeeSelect) piketEmployeeSelect.innerHTML = '<option value="">-- Pilih Nama --</option>';
    document.getElementById('reportEmployeeFilter').innerHTML = '<option value="all">Semua Staf</option>';
    const historyEmpFilter = document.getElementById('historyEmployeeFilter');
    if (historyEmpFilter) historyEmpFilter.innerHTML = '<option value="all">Semua Staf</option>';
    allEmployees.forEach(e => { 
        attendanceEmployeeSelect.innerHTML += `<option value="${e.id}">${e.full_name}</option>`; 
        if (piketEmployeeSelect) piketEmployeeSelect.innerHTML += `<option value="${e.id}">${e.full_name}</option>`;
        document.getElementById('reportEmployeeFilter').innerHTML += `<option value="${e.id}">${e.full_name}</option>`; 
        if (historyEmpFilter) historyEmpFilter.innerHTML += `<option value="${e.id}">${e.full_name}</option>`;
    });
}
function parseTime(t, baseDate = new Date()) { const n = baseDate, [h, m, s] = t.split(':'); return new Date(n.getFullYear(), n.getMonth(), n.getDate(), h, m, s || 0); }

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
    if (type === 'piket_out') {
        await savePiketAttendance(empId, employee, type, now, r);
    } else {
        await saveAttendance(empId, employee, type, now, r);
    }
    closeModals();
};

window.showHistoryDetail = async function(logId) {
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

    // Cek apakah staf mendapat toleransi piket pada log masuk ini (jika ada piket_out dalam 18 jam sebelumnya)
    let isPiketStaff = false;
    if (log.type === 'in') {
        try {
            const checkInTime = new Date(log.check_in_time);
            const lookupTime = new Date(checkInTime.getTime() - (18 * 60 * 60 * 1000));
            const { data: recentPiketOut } = await supabaseClient
                .from('attendance_logs')
                .select('id')
                .eq('employee_id', log.employee_id)
                .eq('type', 'piket_out')
                .gte('check_in_time', lookupTime.toISOString())
                .lte('check_in_time', log.check_in_time)
                .limit(1);
            if (recentPiketOut && recentPiketOut.length > 0) {
                isPiketStaff = true;
            }
        } catch (e) {
            console.error("Gagal memeriksa log piket pulang historis:", e);
        }
    }

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
