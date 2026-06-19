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

    // Set default bulan di performaMonthSelect dan holidayMonthSelect ke bulan saat ini
    const now = new Date();
    const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    
    const msEl = document.getElementById('performaMonthSelect');
    if (msEl && !msEl.value) {
        msEl.value = currentYearMonth;
    }
    
    const hmEl = document.getElementById('holidayMonthSelect');
    if (hmEl && !hmEl.value) {
        hmEl.value = currentYearMonth;
    }

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

async function checkSystemStatus() {
    const now = new Date();
    const isHoliday = await checkIfHoliday(now);
    const overlay = document.getElementById('offlineOverlay');
    if (isHoliday) {
        overlay?.classList.remove('hidden');
        const descEl = document.querySelector('#offlineMainContent p');
        if (descEl) {
            const dayIndex = getWITADay(now);
            if (dayIndex === 0) {
                descEl.textContent = 'Hari ini adalah hari Minggu. Sistem offline.';
            } else {
                descEl.textContent = 'Hari ini adalah Hari Libur Nasional / Libur Terjadwal. Sistem offline.';
            }
        }
    } else {
        overlay?.classList.add('hidden');
    }
}

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
        leave_staff: ["Pengajuan Cuti", "Ajukan cuti dan pantau status persetujuan"],
        register: ["Manajemen Staf", "Kelola data dan wajah staf"], 
        history: ["Riwayat Aktivitas", "Raw logs aktivitas staf"], 
        report: ["Laporan Kehadiran", "Rekapitulasi performa staf"], 
        settings: ["Pengaturan", "Kelola sistem"],
        performa: ["Performa Staf", "Dashboard kehadiran bulanan per staf"],
        leave_admin: ["Manajemen Cuti", "Persetujuan dan rekapitulasi cuti"]
    };
    [document.getElementById('tabCheckIn'), document.getElementById('tabPiket'), document.getElementById('tabLeaveStaff'), document.getElementById('tabEmployees'), document.getElementById('tabHistory'), document.getElementById('tabReport'), document.getElementById('tabSettings'), document.getElementById('tabPerforma'), document.getElementById('tabLeaveAdmin')].forEach(t => t?.classList.remove('active'));
    [document.getElementById('checkInGrid'), document.getElementById('piketGrid'), document.getElementById('leaveStaffSection'), document.getElementById('registerSection'), document.getElementById('historySection'), document.getElementById('reportSection'), document.getElementById('settingsSection'), document.getElementById('performaSection'), document.getElementById('leaveAdminSection')].forEach(s => s?.classList.add('hidden'));
    stopAllCameras();
    const tabIdMap = { checkin:'tabCheckIn', piket:'tabPiket', leave_staff:'tabLeaveStaff', register:'tabEmployees', history:'tabHistory', report:'tabReport', settings:'tabSettings', performa:'tabPerforma', leave_admin:'tabLeaveAdmin' };
    const secIdMap = { checkin:'checkInGrid', piket:'piketGrid', leave_staff:'leaveStaffSection', register:'registerSection', history:'historySection', report:'reportSection', settings:'settingsSection', performa:'performaSection', leave_admin:'leaveAdminSection' };
    const activeTab = document.getElementById(tabIdMap[tab] || 'tabSettings');
    const activeSec = document.getElementById(secIdMap[tab] || 'settingsSection');
    activeTab?.classList.add('active'); activeSec?.classList.remove('hidden');
    document.getElementById('mainTitle').textContent = titles[tab]?.[0] || '';
    document.getElementById('mainSubtitle').textContent = titles[tab]?.[1] || '';
    if (tab === 'piket') checkPiketStatus();
    if (tab === 'register') loadStaffTable();
    if (tab === 'history') loadHistory(false);
    if (tab === 'report') loadReport(false);
    if (tab === 'performa') loadPerforma();
    if (tab === 'leave_staff') populateLeaveStaffSelect();
    if (tab === 'leave_admin') loadAdminLeaveRequests();
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

// --- FILE ATTACHMENT UTILS ---
function getBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

window.toggleManualSubFields = function() {
    const status = document.getElementById('manualStatus').value;
    const attachmentGroup = document.getElementById('manualSakitAttachmentGroup');
    const ijinGroup = document.getElementById('manualIjinTypeGroup');
    const timeGroup = document.getElementById('manualTimeGroup');
    
    if (attachmentGroup) {
        if (status === 'Sakit') attachmentGroup.classList.remove('hidden');
        else attachmentGroup.classList.add('hidden');
    }
    if (ijinGroup) {
        if (status === 'Ijin') ijinGroup.classList.remove('hidden');
        else ijinGroup.classList.add('hidden');
    }
    if (timeGroup) {
        if (status === 'Hadir') timeGroup.classList.remove('hidden');
        else timeGroup.classList.add('hidden');
    }
};

window.openManualAttendance = () => {
    const select = document.getElementById('manualEmpId');
    select.innerHTML = allEmployees.map(e => `<option value="${e.id}">${e.full_name}</option>`).join('');
    
    // Reset form
    document.getElementById('manualStatus').value = 'Sakit';
    document.getElementById('manualNote').value = '';
    const fileInput = document.getElementById('manualSakitAttachment');
    if (fileInput) fileInput.value = '';
    
    const timeInput = document.getElementById('manualCheckInTime');
    if (timeInput) {
        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        timeInput.value = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    }
    
    toggleManualSubFields();
    document.getElementById('manualAttendanceModal').classList.remove('hidden');
};

window.saveManualAttendance = async () => {
    const id = document.getElementById('manualEmpId').value;
    const st = document.getElementById('manualStatus').value;
    const notesVal = document.getElementById('manualNote').value;
    
    let finalStatus = st;
    let finalType = 'manual';
    let penalty = 0;
    let reward = 0;
    let lateMins = 0;
    let checkInTimeIso = new Date().toISOString();
    let attachmentBase64 = '';
    let attachmentName = '';
    
    if (st === 'Hadir') {
        finalType = 'in'; // Agar tercatat sebagai check-in biasa (bisa absen pulang nanti)
        const timeInputVal = document.getElementById('manualCheckInTime')?.value;
        const checkInDate = timeInputVal ? new Date(timeInputVal) : new Date();
        checkInTimeIso = checkInDate.toISOString();
        
        finalStatus = "On-Time";
        const sched = getSchedule(getWITADay(checkInDate));
        if (sched) {
            const workStart = new Date(checkInDate);
            const [h, m] = sched.in.split(':').map(Number);
            workStart.setHours(h, m, 0, 0);

            if (checkInDate <= new Date(workStart.getTime() - (CONFIG.earlyBirdBuffer * 60000))) { 
                finalStatus = "Early Bird"; 
                reward = CONFIG.earlyBirdReward; 
            } else if (checkInDate > workStart) {
                finalStatus = "Late";
                lateMins = Math.floor((checkInDate - workStart) / 60000);
                const rawPenalty = lateMins * CONFIG.latePenaltyPerMinute;
                const maxCap = CONFIG.maxDailyPenalty || 50000;
                penalty = Math.min(rawPenalty, maxCap);
            }
        }
    } else if (st === 'Sakit') {
        const fileInput = document.getElementById('manualSakitAttachment');
        if (fileInput && fileInput.files && fileInput.files[0]) {
            const file = fileInput.files[0];
            attachmentName = file.name;
            try {
                attachmentBase64 = await getBase64(file);
            } catch (e) {
                console.error("Gagal membaca file lampiran:", e);
                return alert("Gagal memproses file lampiran!");
            }
        }
    } else if (st === 'Ijin') {
        const ijinType = document.getElementById('manualIjinType').value;
        finalStatus = `Ijin (${ijinType})`;
        if (ijinType === 'Permintaan Sendiri') {
            penalty = 50000;
        }
    }
    
    let finalNotes = notesVal;
    if (st === 'Hadir') {
        finalNotes = finalNotes ? `[Admin Bantu Absen] ${finalNotes}` : `[Admin Bantu Absen] Device Error`;
    }
    if (attachmentBase64) {
        finalNotes += `\n[attachment:${attachmentName}||${attachmentBase64}]`;
    }
    
    const { error } = await supabaseClient.from('attendance_logs').insert([{ 
        employee_id: id, 
        check_in_time: checkInTimeIso, 
        status: finalStatus, 
        type: finalType, 
        notes: finalNotes, 
        reward_amount: reward, 
        penalty_amount: penalty,
        late_duration_minutes: lateMins
    }]);
    
    if (!error) { 
        alert("Data Absensi Manual Berhasil Disimpan!"); 
        closeModals(); 
        loadHistory(false); 
    } else {
        alert("Gagal menyimpan data manual: " + error.message);
    }
};

// --- ADMIN OVERRIDE: BANTU ABSEN PULANG ---
window.openAdminCheckout = async function() {
    if (!isAdmin) return alert("Akses ditolak! Fitur ini hanya untuk admin.");
    // Reset form
    document.getElementById('adminCheckoutNotes').value = '';
    document.getElementById('adminCheckoutPass').value = '';
    // Default jam pulang: jam kerja selesai hari ini (tapi tidak lebih dari sekarang)
    const now = new Date();
    const sched = getSchedule(getWITADay(now));
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
        const checkoutDay = new Date(checkoutTime);
        checkoutDay.setHours(0, 0, 0, 0);
        const startOfDay = new Date(checkoutDay);
        const endOfDay = new Date(checkoutDay);
        endOfDay.setHours(23, 59, 59, 999);
        
        const inType = type === 'piket_out' ? 'piket_in' : 'in';
        const { data: inLog } = await supabaseClient.from('attendance_logs')
            .select('check_in_time').eq('employee_id', empId).eq('type', inType)
            .gte('check_in_time', startOfDay.toISOString())
            .lte('check_in_time', endOfDay.toISOString())
            .order('check_in_time', { ascending: false }).limit(1);
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
    
    // Reset file input
    const fileInput = document.getElementById('editLogSakitAttachment');
    if (fileInput) fileInput.value = '';
    
    if (log.type === 'manual') {
        statusGroup.classList.remove('hidden');
        
        let baseStatus = log.status || 'Sakit';
        let ijinSubtype = 'Permintaan Sendiri';
        
        if (baseStatus.startsWith('Ijin')) {
            if (baseStatus.includes('Tugas Kantor')) {
                ijinSubtype = 'Tugas Kantor';
            }
            baseStatus = 'Ijin';
        }
        
        statusSelect.value = baseStatus;
        document.getElementById('editLogIjinType').value = ijinSubtype;
        
        // Cek pratinjau lampiran aktif
        const currentAttachmentDiv = document.getElementById('editLogCurrentAttachment');
        if (currentAttachmentDiv) {
            const attachmentMatch = log.notes ? log.notes.match(/\[attachment:([^||]+)\|\|([^\]]+)\]/) : null;
            if (attachmentMatch) {
                currentAttachmentDiv.innerHTML = `📄 Lampiran aktif: <strong>${attachmentMatch[1]}</strong><br><small style="color:var(--text-light);">Biarkan kosong jika tidak ingin mengubah dokumen lampiran.</small>`;
            } else {
                currentAttachmentDiv.innerHTML = '';
            }
        }
        
        autoCalcAlert.classList.add('hidden');
    } else {
        statusGroup.classList.add('hidden');
        autoCalcAlert.classList.remove('hidden');
    }
    
    toggleEditLogSubFields();
    document.getElementById('editLogModal').classList.remove('hidden');
};

window.toggleEditLogSubFields = function() {
    const status = document.getElementById('editLogStatus').value;
    const attachmentGroup = document.getElementById('editLogSakitAttachmentGroup');
    const ijinGroup = document.getElementById('editLogIjinTypeGroup');
    
    if (attachmentGroup) {
        if (status === 'Sakit') attachmentGroup.classList.remove('hidden');
        else attachmentGroup.classList.add('hidden');
    }
    if (ijinGroup) {
        if (status === 'Ijin') ijinGroup.classList.remove('hidden');
        else ijinGroup.classList.add('hidden');
    }
};

window.saveEditLog = async function() {
    const logId = document.getElementById('editLogId').value;
    const logType = document.getElementById('editLogType').value;
    const timeVal = document.getElementById('editLogTime').value;
    const notesVal = document.getElementById('editLogNotes').value;
    let finalNotes = notesVal;
    
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
        const sched = getSchedule(getWITADay(newTime));
        if (sched) {
            const workStart = parseTime(sched.in, newTime);

            status = "On-Time";
            reward = 0;
            penalty = 0;
            lateMins = 0;

            if (newTime <= new Date(workStart.getTime() - (CONFIG.earlyBirdBuffer * 60000))) {
                status = "Early Bird";
                reward = CONFIG.earlyBirdReward;
            } else if (newTime > workStart) {
                status = "Late";
                lateMins = Math.floor((newTime - workStart) / 60000);
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
        const selectedStatus = document.getElementById('editLogStatus').value;
        
        if (selectedStatus === 'Sakit') {
            status = 'Sakit';
            penalty = 0;
            
            // Periksa file baru yang diunggah
            const fileInput = document.getElementById('editLogSakitAttachment');
            if (fileInput && fileInput.files && fileInput.files[0]) {
                const file = fileInput.files[0];
                try {
                    const attachmentBase64 = await getBase64(file);
                    let cleanNotes = notesVal.replace(/\[attachment:[^\]]+\]/g, '').trim();
                    finalNotes = cleanNotes + `\n[attachment:${file.name}||${attachmentBase64}]`;
                } catch (e) {
                    console.error("Gagal memproses lampiran baru:", e);
                    return alert("Gagal memproses file lampiran!");
                }
            } else {
                // Pertahankan lampiran lama jika tidak ada file baru yang diunggah
                const originalAttachmentMatch = log.notes ? log.notes.match(/\[attachment:[^\]]+\]/) : null;
                if (originalAttachmentMatch) {
                    let cleanNotes = notesVal.replace(/\[attachment:[^\]]+\]/g, '').trim();
                    finalNotes = cleanNotes + `\n${originalAttachmentMatch[0]}`;
                }
            }
        } else if (selectedStatus === 'Ijin') {
            const ijinType = document.getElementById('editLogIjinType').value;
            status = `Ijin (${ijinType})`;
            penalty = (ijinType === 'Permintaan Sendiri') ? 50000 : 0;
            // Hapus lampiran karena statusnya bukan Sakit
            finalNotes = notesVal.replace(/\[attachment:[^\]]+\]/g, '').trim();
        } else {
            status = selectedStatus;
            penalty = 0;
            // Hapus lampiran karena statusnya bukan Sakit
            finalNotes = notesVal.replace(/\[attachment:[^\]]+\]/g, '').trim();
        }
    }

    try {
        const { error } = await supabaseClient
            .from('attendance_logs')
            .update({
                check_in_time: newTime.toISOString(),
                status,
                notes: finalNotes,
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
                playAudio('luar_area');
                setTimeout(() => alert(`Anda tidak dalam area kantor, segera masuk ke area kantor untuk bisa melanjutkan Absensi Anda.`), 100);
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
        const now = new Date(), sched = getSchedule(getWITADay(now));
        if (type === 'out' && sched && now < parseTime(sched.out)) {
            window.pendingAttendanceData = { empId, employee: emp, type, now };
            document.getElementById('earlyOutModal').classList.remove('hidden'); resetButtons(); return;
        }
        await saveAttendance(empId, emp, type, now);
        resetButtons();
    } catch (e) { alert(e.message); resetButtons(); }
};

async function saveAttendance(empId, employee, type, now, reason = "") {
    const sched = getSchedule(getWITADay(now)); let status = "On-Time", reward = 0, penalty = 0, lateMins = 0;

    if (type === 'in' && sched) {
        const workStart = parseTime(sched.in);

        if (now <= new Date(workStart.getTime() - (CONFIG.earlyBirdBuffer * 60000))) { 
            status = "Early Bird"; 
            reward = CONFIG.earlyBirdReward; 
        } else if (now > workStart) {
            status = "Late";
            lateMins = Math.floor((now - workStart) / 60000);
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
    
    showAttendancePopup({ name: employee.full_name, time: now, type, status, lateMins, penalty, reward });
    
    // Update status tombol
    checkAttendanceStatus();
}

// --- AUDIO NOTIFICATION ---
function playAudio(type) {
    const audioMap = {
        'in': 'audio/masuk.mp3',
        'out': 'audio/pulang.mp3',
        'piket_in': 'audio/piket_masuk.mp3',
        'piket_out': 'audio/piket_pulang.mp3',
        'luar_area': 'audio/luar_area.mp3'
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
                playAudio('luar_area');
                setTimeout(() => alert(`Anda tidak dalam area kantor, segera masuk ke area kantor untuk bisa melakukan Absensi Piket.`), 100);
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
    // Bersihkan log absen salah di hari libur dan jalankan auto-absen (hanya saat akses manual, bukan auto-refresh)
    if (!isAutoRefresh) {
        await cleanupAbsentLogsOnHolidays();
        await checkAndInsertAbsentStaff();
    }
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
        q = q.in('type', ['in', 'out', 'manual', 'absent']);
    } else if (typeFilter === 'piket') {
        q = q.in('type', ['piket_in', 'piket_out']);
    } else {
        // 'all': sertakan semua termasuk absent
        q = q.in('type', ['in', 'out', 'manual', 'absent', 'piket_in', 'piket_out']);
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
                dateStr: date,
                in: '-', 
                out: '-', 
                late: 0, 
                status: log.status, 
                reward: 0, 
                penalty: 0, 
                isComplete: false,
                isPiket: isPiketLog,
                isMissing: false,
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
        else if (log.type === 'absent') {
            grouped[key].status = 'Tidak Masuk Kantor';
            grouped[key].in = '—';
            grouped[key].out = '—';
            grouped[key].isComplete = true;
            grouped[key].isAbsent = true;
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
    // --- Deteksi hari kerja tanpa absensi (tidak ada record sama sekali) ---
    if (typeFilter !== 'piket') {
        // Tentukan rentang tanggal dari filter
        let rangeStart, rangeEnd;
        const todayMidnight = new Date(); todayMidnight.setHours(23, 59, 59, 999);
        if (per === 'daily') {
            rangeStart = new Date(); rangeStart.setHours(0,0,0,0);
            rangeEnd = todayMidnight;
        } else if (per === 'weekly') {
            rangeEnd = todayMidnight;
            rangeStart = new Date(); rangeStart.setDate(rangeStart.getDate() - 6); rangeStart.setHours(0,0,0,0);
        } else if (per === 'monthly') {
            rangeStart = new Date(startOfToday.getFullYear(), startOfToday.getMonth(), 1);
            rangeEnd = todayMidnight;
        } else if (per === 'custom') {
            const sv = document.getElementById('reportDateStart')?.value;
            const ev = document.getElementById('reportDateEnd')?.value;
            if (sv && ev) {
                rangeStart = new Date(sv + 'T00:00:00');
                rangeEnd = new Date(ev + 'T23:59:59');
                if (rangeEnd > todayMidnight) rangeEnd = todayMidnight;
            }
        }
        if (rangeStart && rangeEnd) {
            // Kumpulkan hari kerja dalam rentang tersebut
            const workingDaysInRange = [];
            let wd = new Date(rangeStart); wd.setHours(12,0,0,0);
            while (wd <= rangeEnd) {
                const isHoliday = await checkIfHoliday(new Date(wd));
                if (!isHoliday) workingDaysInRange.push(wd.toLocaleDateString('en-CA'));
                wd.setDate(wd.getDate() + 1);
            }
            // Karyawan yang dicek
            const empsToCheck = emp === 'all' ? allEmployees : allEmployees.filter(e => e.id === emp);
            empsToCheck.forEach(employee => {
                workingDaysInRange.forEach(dateStr => {
                    const kantorKey = `${dateStr}_${employee.id}`;
                    if (!grouped[kantorKey]) {
                        // Tidak ada record kantor sama sekali pada hari kerja ini
                        const displayDate = new Date(dateStr + 'T12:00:00').toLocaleDateString('id-ID');
                        grouped[`${dateStr}_${employee.id}_missing`] = {
                            name: employee.full_name,
                            date: displayDate,
                            dateStr: dateStr,
                            in: '—', out: '—', late: 0,
                            status: 'Tidak Masuk Kantor',
                            reward: 0, penalty: 0,
                            isComplete: true, isPiket: false,
                            isAbsent: true, isMissing: true,
                            logId: null
                        };
                    }
                });
            });
        }
    }
    // Urutkan semua baris berdasarkan tanggal (terbaru di atas)
    const rows = Object.values(grouped)
        .filter(r => r.isComplete)
        .sort((a, b) => (b.dateStr || '').localeCompare(a.dateStr || ''));
    let trs = '', totalHadir = 0, totalTelat = 0, totalPiket = 0, totalAbsen = 0;
    
    rows.forEach(r => {
        if (r.isPiket) totalPiket++;
        else if (r.isAbsent) totalAbsen++;
        else totalHadir++;

        if (r.late > 0) totalTelat++;

        let badgeStyle = r.isPiket ? 'style="background: rgba(217, 119, 6, 0.1); color: var(--warning); border: 1px solid rgba(217, 119, 6, 0.15); cursor: pointer;"' : '';
        if (!r.isPiket) {
            if (r.isAbsent || r.status === 'Tidak Masuk Kantor') {
                badgeStyle = 'style="background: rgba(127,17,224,0.1); color: #7f11e0; border: 1px solid rgba(127,17,224,0.2); cursor: pointer;"';
            } else if (r.status === 'Sakit') {
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
        // Badge status: bisa diklik jika ada logId, tidak jika missing (tidak ada record)
        const badgeContent = r.isMissing
            ? `<span class="badge" ${badgeStyle} title="Tidak ada absensi pada hari kerja ini"><i class="ri-user-unfollow-line"></i> ${r.status}</span>`
            : `<span class="badge clickable-badge" ${badgeStyle} onclick="showHistoryDetail('${r.logId}')" title="Klik untuk detail"><i class="ri-information-line"></i> ${r.status}</span>`;
        trs += `<tr style="${r.isMissing ? 'background:rgba(127,29,29,0.03);' : ''}"><td><strong style="color:var(--text-main);">${nameText}</strong></td><td>${r.date}</td><td style="color:${r.isMissing ? '#7f1d1d' : 'inherit'}">${r.in}</td><td style="color:${r.isMissing ? '#7f1d1d' : 'inherit'}">${r.out}</td><td>${r.late > 0 ? `${r.late} Menit` : '-'}</td><td>${badgeContent}</td><td style="color:var(--success); font-weight:600;">Rp ${r.reward.toLocaleString()}</td><td style="color:var(--danger); font-weight:600;">Rp ${r.penalty.toLocaleString()}</td></tr>`;
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
            <div style="flex: 1; min-width: 120px; text-align: center; border-right: 1px solid var(--border-light);">
                <div style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Total Telat</div>
                <div style="font-size: 1.5rem; font-weight: 800; color: var(--danger); margin-top: 5px;">${totalTelat}</div>
            </div>
            <div style="flex: 1; min-width: 120px; text-align: center;">
                <div style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Tidak Masuk</div>
                <div style="font-size: 1.5rem; font-weight: 800; color: #7f11e0; margin-top: 5px;">${totalAbsen}</div>
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
// --- TIMEZONE HELPERS (WITA / +08:00) ---
function getWITADay(dateObj = new Date()) {
    return new Date(dateObj.getTime() + (8 * 3600000)).getUTCDay();
}

function parseTime(t, baseDate = new Date()) { 
    const witaTime = new Date(baseDate.getTime() + (8 * 3600000));
    const year = witaTime.getUTCFullYear();
    const month = witaTime.getUTCMonth();
    const date = witaTime.getUTCDate();
    const [h, m, s] = t.split(':'); 
    return new Date(Date.UTC(year, month, date, parseInt(h) - 8, parseInt(m), parseInt(s || 0))); 
}

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

        // Toggle Piket
        CONFIG.piketEnabled = data.piket_enabled !== false; // default true jika null

        // Toggle Cuti
        CONFIG.leaveEnabled = data.leave_enabled !== false; // default true jika null

        // Load custom holidays kustom
        CONFIG.customHolidays = {};
        if (data.custom_holidays) {
            try {
                CONFIG.customHolidays = JSON.parse(data.custom_holidays);
            } catch(e) {
                console.error("Gagal parse custom_holidays dari DB:", e);
            }
        } else {
            try {
                CONFIG.customHolidays = JSON.parse(localStorage.getItem('custom_holidays')) || {};
            } catch(e) {}
        }

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

            // Toggle piket UI binding
            const setPiketEnabled = document.getElementById('setPiketEnabled');
            if (setPiketEnabled) setPiketEnabled.checked = CONFIG.piketEnabled;

            // Toggle cuti UI binding
            const setLeaveEnabled = document.getElementById('setLeaveEnabled');
            if (setLeaveEnabled) setLeaveEnabled.checked = CONFIG.leaveEnabled;
        }
        applyPiketFeatureToggle();
        applyLeaveFeatureToggle();
        if (document.getElementById('holidayCalendarGrid')) {
            renderHolidayCalendar();
        }
    }
}

function applyPiketFeatureToggle() {
    const isEnabled = CONFIG.piketEnabled !== false;
    const piketTab = document.getElementById('tabPiket');
    const overlay = document.getElementById('piketDisabledOverlay');
    if (piketTab) {
        piketTab.style.opacity = isEnabled ? '' : '0.4';
        piketTab.style.pointerEvents = isEnabled ? '' : 'none';
        piketTab.title = isEnabled ? '' : 'Fitur Piket dinonaktifkan oleh Admin';
    }
    if (overlay) {
        isEnabled ? overlay.classList.add('hidden') : overlay.classList.remove('hidden');
    }
}

window.togglePiketEnabled = function(checked) {
    CONFIG.piketEnabled = checked;
    applyPiketFeatureToggle();
};

function applyLeaveFeatureToggle() {
    const isEnabled = CONFIG.leaveEnabled !== false;
    const leaveStaffTab = document.getElementById('tabLeaveStaff');
    const leaveAdminTab = document.getElementById('tabLeaveAdmin');
    const overlay = document.getElementById('leaveDisabledOverlay');
    if (leaveStaffTab) {
        leaveStaffTab.style.opacity = isEnabled ? '' : '0.4';
        leaveStaffTab.style.pointerEvents = isEnabled ? '' : 'none';
        leaveStaffTab.title = isEnabled ? '' : 'Fitur Cuti dinonaktifkan oleh Admin';
    }
    if (leaveAdminTab) {
        leaveAdminTab.style.opacity = isEnabled ? '' : '0.4';
        leaveAdminTab.style.pointerEvents = isEnabled ? '' : 'none';
        leaveAdminTab.title = isEnabled ? '' : 'Fitur Cuti dinonaktifkan oleh Admin';
    }
    if (overlay) {
        isEnabled ? overlay.classList.add('hidden') : overlay.classList.remove('hidden');
    }
}

window.toggleLeaveEnabled = function(checked) {
    CONFIG.leaveEnabled = checked;
    applyLeaveFeatureToggle();
};
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
        piket_end_time: pEnd,
        piket_enabled: document.getElementById('setPiketEnabled')?.checked ?? true,
        leave_enabled: document.getElementById('setLeaveEnabled')?.checked ?? true,
        custom_holidays: JSON.stringify(CONFIG.customHolidays || {})
    };
    
    // Simpan salinan lokal ke localStorage agar selalu ada cadangan
    localStorage.setItem('custom_holidays', JSON.stringify(CONFIG.customHolidays || {}));
    
    let error;
    if (CONFIG.configId) {
        let res = await supabaseClient.from('settings_config').update(s).eq('id', CONFIG.configId);
        if (res.error && res.error.message.includes('custom_holidays')) {
            // Kolom custom_holidays tidak ada di DB, hapus field dan coba simpan kembali secara lokal
            const { custom_holidays, ...sWithoutHoliday } = s;
            res = await supabaseClient.from('settings_config').update(sWithoutHoliday).eq('id', CONFIG.configId);
            if (!res.error) {
                alert("Pengaturan disimpan secara lokal di browser Anda.\n\nAgar tersinkronisasi secara online di Vercel, harap jalankan query SQL berikut di dashboard Supabase Anda (SQL Editor):\n\nALTER TABLE settings_config ADD COLUMN IF NOT EXISTS custom_holidays TEXT DEFAULT '{}';");
            }
        }
        error = res.error;
    } else {
        let res = await supabaseClient.from('settings_config').insert([s]);
        if (res.error && res.error.message.includes('custom_holidays')) {
            const { custom_holidays, ...sWithoutHoliday } = s;
            res = await supabaseClient.from('settings_config').insert([sWithoutHoliday]);
            if (!res.error) {
                alert("Pengaturan disimpan secara lokal di browser Anda.\n\nAgar tersinkronisasi secara online di Vercel, harap jalankan query SQL berikut di dashboard Supabase Anda (SQL Editor):\n\nALTER TABLE settings_config ADD COLUMN IF NOT EXISTS custom_holidays TEXT DEFAULT '{}';");
            }
        }
        error = res.error;
    }
    
    if (error) {
        alert("Gagal menyimpan! Error: " + error.message);
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

        let displayNotes = log.notes || "";
        let attachmentHtml = "";
        
        if (displayNotes && displayNotes !== "Absensi Piket") {
            const attachmentMatch = displayNotes.match(/\[attachment:([^||]+)\|\|([^\]]+)\]/);
            if (attachmentMatch) {
                const filename = attachmentMatch[1];
                const base64Data = attachmentMatch[2];
                displayNotes = displayNotes.replace(/\[attachment:[^\]]+\]/g, '').trim();
                
                const isImage = base64Data.startsWith('data:image/');
                
                let previewHtml = "";
                if (isImage) {
                    previewHtml = `<img src="${base64Data}" style="max-width: 100%; max-height: 180px; border-radius: 8px; border: 1px solid var(--border-color); display: block; margin: 8px auto 0; box-shadow: var(--shadow-sm); cursor: pointer;" onclick="window.open('${base64Data}')" title="Klik untuk memperbesar">`;
                } else {
                    previewHtml = `
                        <div style="text-align: center; margin-top: 8px;">
                            <a href="${base64Data}" download="${filename}" class="btn btn-secondary" style="font-size:0.75rem; padding: 6px 12px; display: inline-flex; border-radius: 6px; height: auto;">
                                <i class="ri-file-pdf-line"></i> Unduh Lampiran Surat Sakit
                            </a>
                        </div>
                    `;
                }
                
                attachmentHtml = `
                    <div style="margin-top: 12px; border-top: 1px dashed var(--border-color); padding-top: 12px;">
                        <span style="font-weight: 600; color: var(--text-muted); display: block; font-size: 0.8rem; margin-bottom: 4px;"><i class="ri-attachment-line"></i> Dokumen Lampiran</span>
                        <div style="font-size: 0.8rem; color: var(--text-secondary); word-break: break-all;">File: <strong>${filename}</strong></div>
                        ${previewHtml}
                    </div>
                `;
            }
        }

        let reasonHtml = "";
        if (displayNotes && displayNotes !== "Absensi Piket") {
            reasonHtml = `
                <div style="margin-top: 10px;">
                    <span style="font-weight: 600; color: var(--text-muted); display: block; font-size: 0.8rem; margin-bottom: 6px;">Catatan (Persetujuan Admin)</span>
                    <div style="background: #ffffff; border-left: 4px solid var(--primary); padding: 10px 12px; border-radius: 4px; font-style: italic; color: var(--text-secondary); font-size: 0.9rem; line-height: 1.4; word-break: break-word;">
                        "${displayNotes}"
                    </div>
                </div>
            `;
        }
        reasonHtml += attachmentHtml;

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

// ============================================================
// --- LIBUR NASIONAL & AUTO ABSEN ---
// ============================================================

async function checkIfNationalHoliday(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const cacheKey = `holidays_${year}_${month}`;
    let holidays = null;
    try { holidays = JSON.parse(localStorage.getItem(cacheKey)); } catch(e) {}
    if (!holidays) {
        try {
            const res = await fetch(`https://api-harilibur.vercel.app/api?month=${month}&year=${year}`);
            if (res.ok) {
                holidays = await res.json();
                localStorage.setItem(cacheKey, JSON.stringify(holidays));
            } else { return false; }
        } catch(e) { return false; }
    }
    const dateStr = date.toLocaleDateString('en-CA'); // YYYY-MM-DD
    return Array.isArray(holidays) && holidays.some(h => h.holiday_date === dateStr && h.is_national_holiday);
}

async function checkAndInsertAbsentStaff() {
    const now = new Date();
    
    // Cek apakah hari ini hari libur (Minggu, Libur Nasional, atau Kustom Override)
    const isHoliday = await checkIfHoliday(now);
    if (isHoliday) return;
    
    const dayIndex = getWITADay(now);
    const schedule = getSchedule(dayIndex);
    if (!schedule) return;

    const workStart = parseTime(schedule.in);
    const cutoffTime = new Date(workStart.getTime() + 60 * 60000); // +1 jam toleransi
    if (now < cutoffTime) return; // Belum lewat batas, jangan insert dulu

    const todayStr = now.toLocaleDateString('en-CA');
    const startOfDay = new Date(todayStr + 'T00:00:00');
    const endOfDay   = new Date(todayStr + 'T23:59:59');

    const { data: todayLogs } = await supabaseClient
        .from('attendance_logs')
        .select('employee_id, type')
        .in('type', ['in', 'absent', 'manual'])
        .gte('check_in_time', startOfDay.toISOString())
        .lte('check_in_time', endOfDay.toISOString());

    const presentIds = new Set((todayLogs || []).map(l => l.employee_id));
    const absentStaff = allEmployees.filter(e => !presentIds.has(e.id));

    for (const emp of absentStaff) {
        await supabaseClient.from('attendance_logs').insert([{
            employee_id: emp.id,
            check_in_time: cutoffTime.toISOString(),
            type: 'absent',
            status: 'Tidak Masuk Kantor',
            reward_amount: 0,
            penalty_amount: 0,
            late_duration_minutes: 0,
            notes: 'Auto-generated: Tidak hadir melewati batas toleransi'
        }]);
    }
    console.log(`[Auto Absen] ${absentStaff.length} staf ditandai Tidak Masuk Kantor.`);
}

// ============================================================
// --- PERFORMA KEHADIRAN BULANAN ---
// ============================================================

async function getEffectiveWorkDays(year, month) {
    // month: 0-indexed (0=Jan, 11=Dec)
    const days = [];
    const date = new Date(year, month, 1);
    while (date.getMonth() === month) {
        const isHoliday = await checkIfHoliday(new Date(date));
        if (!isHoliday) days.push(new Date(date));
        date.setDate(date.getDate() + 1);
    }
    return days;
}

window.loadPerforma = async function() {
    const container = document.getElementById('performaCards');
    const infoEl = document.getElementById('performaInfo');
    if (!container) return;
    container.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-muted);"><span class="btn-spinner" style="display:inline-block; width:24px; height:24px; border-width:3px;"></span><p style="margin-top:12px;">Menghitung performa...</p></div>';

    const monthSelect = document.getElementById('performaMonthSelect');
    const selVal = monthSelect?.value || `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`;
    const [year, month] = selVal.split('-').map(Number);

    // Hitung hari kerja efektif bulan ini
    const workDays = await getEffectiveWorkDays(year, month - 1);
    const totalWorkDays = workDays.length;
    if (infoEl) infoEl.textContent = `Hari kerja efektif ${new Date(year, month-1).toLocaleString('id-ID',{month:'long',year:'numeric'})}: ${totalWorkDays} hari`;

    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth   = new Date(year, month, 0, 23, 59, 59);

    // Hanya tampilkan hari kerja yang sudah lewat (tidak tampilkan hari depan)
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const relevantWorkDayStrs = workDays
        .filter(d => d <= today)
        .map(d => d.toLocaleDateString('en-CA'));

    // Query semua log kehadiran (in + manual yang dihitung sebagai hadir)
    const { data: logs } = await supabaseClient
        .from('attendance_logs')
        .select('employee_id, type, status, check_in_time')
        .in('type', ['in', 'manual'])
        .gte('check_in_time', startOfMonth.toISOString())
        .lte('check_in_time', endOfMonth.toISOString());

    // Query semua log dengan keterangan eksplisit (Sakit/Ijin/Tugas Luar/absent)
    const { data: explicitLogs } = await supabaseClient
        .from('attendance_logs')
        .select('employee_id, type, status, check_in_time, notes')
        .in('type', ['absent', 'manual'])
        .gte('check_in_time', startOfMonth.toISOString())
        .lte('check_in_time', endOfMonth.toISOString())
        .order('check_in_time', { ascending: true });

    // Hitung kehadiran unik per staf per hari (hari yang dihitung hadir)
    const attendanceMap = {}; // empId -> Set of dateStr
    (logs || []).forEach(log => {
        if (log.type === 'manual') {
            const st = log.status || '';
            // Status ini TIDAK dihitung hadir
            if (st === 'Sakit' || st === 'Ijin' || st === 'Tugas Luar' || st.includes('Permintaan Sendiri')) return;
        }
        const dateStr = new Date(log.check_in_time).toLocaleDateString('en-CA');
        if (!attendanceMap[log.employee_id]) attendanceMap[log.employee_id] = new Set();
        attendanceMap[log.employee_id].add(dateStr);
    });

    // Bangun peta keterangan eksplisit: empId -> { dateStr -> { keterangan, notes } }
    const explicitReasonMap = {}; // empId -> { dateStr: {keterangan, notes} }
    (explicitLogs || []).forEach(log => {
        let keterangan = '';
        if (log.type === 'absent') {
            keterangan = 'Tidak Masuk Kantor';
        } else if (log.type === 'manual') {
            const st = log.status || '';
            if (st === 'Sakit') keterangan = 'Sakit';
            else if (st === 'Ijin') keterangan = 'Ijin';
            else if (st === 'Tugas Luar') keterangan = 'Tugas Luar';
            else if (st.includes('Permintaan Sendiri')) keterangan = 'Ijin Permintaan Sendiri';
        }
        if (!keterangan) return;

        const dateStr = new Date(log.check_in_time).toLocaleDateString('en-CA');
        if (!explicitReasonMap[log.employee_id]) explicitReasonMap[log.employee_id] = {};
        if (!explicitReasonMap[log.employee_id][dateStr]) {
            explicitReasonMap[log.employee_id][dateStr] = { keterangan, notes: log.notes || '' };
        }
    });

    if (allEmployees.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:var(--text-muted);">Data staf belum tersedia.</p>';
        return;
    }

    const getBadge = (pct) => {
        if (pct >= 80) return { icon: '🏆', label: 'Kehadiran Sangat Baik', color: '#059669', bg: 'rgba(5,150,105,0.08)', border: 'rgba(5,150,105,0.2)' };
        if (pct >= 60) return { icon: '⚠️', label: 'Kehadiran Cukup', color: '#d97706', bg: 'rgba(217,119,6,0.08)', border: 'rgba(217,119,6,0.2)' };
        if (pct >= 40) return { icon: '🔴', label: 'Kehadiran Kurang', color: '#dc2626', bg: 'rgba(220,38,38,0.08)', border: 'rgba(220,38,38,0.2)' };
        return { icon: '❌', label: 'Kehadiran Sangat Kurang', color: '#7f1d1d', bg: 'rgba(127,29,29,0.08)', border: 'rgba(127,29,29,0.2)' };
    };

    const formatTanggal = (dateStr) => {
        const d = new Date(dateStr + 'T12:00:00');
        return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    };

    const getKetStyle = (ket) => {
        if (ket === 'Sakit')
            return { color: '#dc2626', bg: 'rgba(220,38,38,0.1)', border: 'rgba(220,38,38,0.25)', icon: 'ri-heart-pulse-line' };
        if (ket === 'Ijin' || ket === 'Ijin Permintaan Sendiri')
            return { color: '#d97706', bg: 'rgba(217,119,6,0.1)', border: 'rgba(217,119,6,0.25)', icon: 'ri-chat-history-line' };
        if (ket === 'Tugas Luar')
            return { color: '#0891b2', bg: 'rgba(8,145,178,0.1)', border: 'rgba(8,145,178,0.25)', icon: 'ri-road-map-line' };
        return { color: '#7f1d1d', bg: 'rgba(127,29,29,0.08)', border: 'rgba(127,29,29,0.25)', icon: 'ri-user-unfollow-line' };
    };

    let html = '';
    const sortedEmps = [...allEmployees].sort((a, b) => {
        const hadirCountA = attendanceMap[a.id]?.size || 0;
        const hadirCountB = attendanceMap[b.id]?.size || 0;
        const pctA = totalWorkDays > 0 ? hadirCountA / totalWorkDays * 100 : 0;
        const pctB = totalWorkDays > 0 ? hadirCountB / totalWorkDays * 100 : 0;
        return pctB - pctA;
    });

    sortedEmps.forEach((emp, idx) => {
        const hadirCount = attendanceMap[emp.id]?.size || 0;
        const pct = totalWorkDays > 0 ? Math.round((hadirCount / totalWorkDays) * 100) : 0;
        const badge = getBadge(pct);
        const initials = emp.full_name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
        const rank = idx + 1;

        // -----------------------------------------------------------
        // Deteksi hari tidak masuk:
        // Hari kerja yang sudah lewat tapi TIDAK ada record kehadiran
        // -----------------------------------------------------------
        const hadirDays = attendanceMap[emp.id] || new Set();
        const empExplicitMap = explicitReasonMap[emp.id] || {};

        const absentEntries = relevantWorkDayStrs
            .filter(dateStr => !hadirDays.has(dateStr))
            .map(dateStr => {
                // Ada keterangan eksplisit (Sakit/Ijin/Tugas Luar/absent)
                if (empExplicitMap[dateStr]) {
                    return { dateStr, ...empExplicitMap[dateStr] };
                }
                // Tidak ada record sama sekali = Tidak Masuk Kantor
                return { dateStr, keterangan: 'Tidak Masuk Kantor', notes: '' };
            });

        let absentSectionHtml = '';
        if (absentEntries.length > 0) {
            const rows = absentEntries.map((entry, ei) => {
                const ks = getKetStyle(entry.keterangan);
                const isAutoNotes = !entry.notes || entry.notes.startsWith('Auto-generated:');
                const notesText = !isAutoNotes
                    ? `<div style="color:var(--text-muted); font-size:0.72rem; font-style:italic; margin-top:3px;">"${entry.notes}"</div>`
                    : '';
                const borderStyle = ei < absentEntries.length - 1
                    ? 'border-bottom:1px solid var(--border-light);'
                    : '';
                return `
                <div style="display:flex; align-items:flex-start; gap:10px; padding:8px 0; ${borderStyle}">
                    <div style="width:30px; height:30px; border-radius:8px; background:${ks.bg}; border:1px solid ${ks.border}; display:flex; align-items:center; justify-content:center; flex-shrink:0; margin-top:1px;">
                        <i class="${ks.icon}" style="font-size:0.9rem; color:${ks.color};"></i>
                    </div>
                    <div style="flex:1; min-width:0;">
                        <div style="font-size:0.8rem; font-weight:600; color:var(--text-main);">${formatTanggal(entry.dateStr)}</div>
                        <span style="display:inline-block; font-size:0.72rem; font-weight:700; color:${ks.color}; background:${ks.bg}; border:1px solid ${ks.border}; border-radius:99px; padding:1px 9px; margin-top:3px;">${entry.keterangan}</span>
                        ${notesText}
                    </div>
                </div>`;
            }).join('');

            absentSectionHtml = `
            <div style="border-top:1px solid var(--border-light); padding-top:12px;">
                <div style="display:flex; align-items:center; gap:7px; margin-bottom:10px;">
                    <i class="ri-calendar-close-line" style="font-size:0.95rem; color:#dc2626;"></i>
                    <span style="font-size:0.8rem; font-weight:700; color:#dc2626;">Catatan Hari Tidak Masuk</span>
                    <span style="margin-left:auto; font-size:0.72rem; font-weight:700; color:white; background:#dc2626; border-radius:99px; padding:2px 9px;">${absentEntries.length} hari</span>
                </div>
                <div>${rows}</div>
            </div>`;
        } else {
            absentSectionHtml = `
            <div style="border-top:1px solid var(--border-light); padding-top:10px;">
                <div style="display:flex; align-items:center; gap:7px;">
                    <i class="ri-checkbox-circle-line" style="font-size:1rem; color:#059669;"></i>
                    <span style="font-size:0.78rem; color:#059669; font-weight:600;">Tidak ada catatan ketidakhadiran</span>
                </div>
            </div>`;
        }

        html += `
        <div style="background: white; border: 1px solid var(--border-light); border-radius: 16px; padding: 20px; display: flex; flex-direction: column; gap: 14px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); transition: transform 0.2s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
            <div style="display: flex; align-items: center; gap: 14px;">
                <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); min-width:22px;">#${rank}</div>
                <div style="width: 44px; height: 44px; border-radius: 50%; background: var(--primary-light); color: var(--primary); font-weight: 700; font-size: 1rem; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">${initials}</div>
                <div style="flex: 1; min-width: 0;">
                    <div style="font-weight: 700; color: var(--text-main); font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${emp.full_name}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">${emp.department || emp.position || 'Staf'}</div>
                </div>
                <div style="font-size: 1.4rem; flex-shrink: 0;">${badge.icon}</div>
            </div>
            <div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 7px;">
                    <span style="font-size: 0.78rem; color: var(--text-muted);">${hadirCount} / ${totalWorkDays} hari hadir</span>
                    <span style="font-weight: 800; font-size: 1.05rem; color: ${badge.color};">${pct}%</span>
                </div>
                <div style="height: 8px; background: var(--bg-input); border-radius: 99px; overflow: hidden;">
                    <div style="height: 100%; width: ${pct}%; background: ${badge.color}; border-radius: 99px; transition: width 0.8s ease;"></div>
                </div>
            </div>
            <div style="background: ${badge.bg}; border: 1px solid ${badge.border}; border-radius: 8px; padding: 8px 12px; text-align: center;">
                <span style="font-size: 0.8rem; font-weight: 600; color: ${badge.color};">${badge.label}</span>
            </div>
            ${absentSectionHtml}
        </div>`;
    });

    container.innerHTML = html || '<p style="text-align:center; color:var(--text-muted);">Tidak ada data staf.</p>';
};

// ============================================================
// --- CLEANUP ABSENT LOGS ON HOLIDAYS ---
// ============================================================

async function cleanupAbsentLogsOnHolidays() {
    try {
        // Ambil semua log bertipe 'absent' dalam 30 hari terakhir
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const { data: absentLogs } = await supabaseClient
            .from('attendance_logs')
            .select('id, check_in_time')
            .eq('type', 'absent')
            .gte('check_in_time', thirtyDaysAgo.toISOString());
            
        if (!absentLogs || absentLogs.length === 0) return;
        
        const idsToDelete = [];
        for (const log of absentLogs) {
            const date = new Date(log.check_in_time);
            const isHoliday = await checkIfHoliday(date);
            if (isHoliday) {
                idsToDelete.push(log.id);
            }
        }
        
        if (idsToDelete.length > 0) {
            console.log(`[Cleanup] Menghapus ${idsToDelete.length} log 'Tidak Masuk Kantor' pada hari libur.`);
            await supabaseClient
                .from('attendance_logs')
                .delete()
                .in('id', idsToDelete);
        }
    } catch (e) {
        console.error("Gagal melakukan cleanup log absensi hari libur:", e);
    }
}

// ============================================================
// --- UNIFIED HOLIDAY SYSTEM ---
// ============================================================

async function checkIfHoliday(date) {
    const dateStr = date.toLocaleDateString('en-CA'); // YYYY-MM-DD
    
    // 1. Cek kustom override dari admin
    if (CONFIG.customHolidays && CONFIG.customHolidays[dateStr] !== undefined) {
        return CONFIG.customHolidays[dateStr] === true;
    }
    
    // 2. Default: Hari Minggu libur
    const dayIndex = date.getDay();
    if (dayIndex === 0) return true;
    
    // 3. Default: Hari Libur Nasional dari API
    const isNatHoliday = await checkIfNationalHoliday(date);
    return isNatHoliday;
}

function getNationalHolidayName(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const cacheKey = `holidays_${year}_${month}`;
    let holidays = null;
    try { holidays = JSON.parse(localStorage.getItem(cacheKey)); } catch(e) {}
    if (Array.isArray(holidays)) {
        const dateStr = date.toLocaleDateString('en-CA');
        const h = holidays.find(x => x.holiday_date === dateStr && x.is_national_holiday);
        return h ? h.holiday_name : '';
    }
    return '';
}

// ============================================================
// --- HOLIDAY CALENDAR UI RENDERING ---
// ============================================================

window.renderHolidayCalendar = async function() {
    const gridContainer = document.getElementById('holidayCalendarGrid');
    if (!gridContainer) return;
    
    const monthSelect = document.getElementById('holidayMonthSelect');
    const selVal = monthSelect?.value || `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`;
    const [year, month] = selVal.split('-').map(Number);
    
    // Clear and render headers
    gridContainer.innerHTML = `
        <div style="font-size: 0.75rem; font-weight: 700; color: #ef4444; padding: 6px 0;">Min</div>
        <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); padding: 6px 0;">Sen</div>
        <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); padding: 6px 0;">Sel</div>
        <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); padding: 6px 0;">Rab</div>
        <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); padding: 6px 0;">Kam</div>
        <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); padding: 6px 0;">Jum</div>
        <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); padding: 6px 0;">Sab</div>
    `;
    
    const firstDay = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    
    // Render blank cells before first day
    for (let i = 0; i < firstDay; i++) {
        gridContainer.innerHTML += '<div></div>';
    }
    
    // Pre-load national holidays for the month to make sure cache exists and renders smoothly
    await checkIfNationalHoliday(new Date(year, month - 1, 1));
    
    // Render day cells
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month - 1, day);
        const dateStr = date.toLocaleDateString('en-CA');
        
        const isHoliday = await checkIfHoliday(date);
        const isSunday = date.getDay() === 0;
        const isNatHoliday = await checkIfNationalHoliday(date);
        const holidayName = getNationalHolidayName(date);
        
        let bg, borderColor, textColor, subTextHtml, titleText;
        
        if (isHoliday) {
            bg = 'rgba(239, 68, 68, 0.08)';
            borderColor = 'rgba(239, 68, 68, 0.25)';
            textColor = '#ef4444';
            
            if (CONFIG.customHolidays && CONFIG.customHolidays[dateStr] === true) {
                subTextHtml = '<span style="font-size: 0.55rem; color: #f87171; font-weight: 700; margin-top: 2px;">Libur (K)</span>';
                titleText = 'Libur Kustom (Admin)';
            } else if (isNatHoliday) {
                subTextHtml = '<span style="font-size: 0.55rem; color: #f87171; font-weight: 500; margin-top: 2px; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 90%;">Libur Nas.</span>';
                titleText = `Libur Nasional: ${holidayName}`;
            } else {
                subTextHtml = '<span style="font-size: 0.55rem; color: #f87171; font-weight: 500; margin-top: 2px;">Minggu</span>';
                titleText = 'Minggu (Libur Rutin)';
            }
        } else {
            bg = 'rgba(5, 150, 105, 0.06)';
            borderColor = 'rgba(5, 150, 105, 0.2)';
            textColor = '#059669';
            
            if (CONFIG.customHolidays && CONFIG.customHolidays[dateStr] === false) {
                subTextHtml = '<span style="font-size: 0.55rem; color: #34d399; font-weight: 700; margin-top: 2px;">Kerja (K)</span>';
                titleText = 'Kerja Kustom (Admin)';
            } else {
                subTextHtml = '<span style="font-size: 0.55rem; color: #34d399; font-weight: 500; margin-top: 2px;">Kerja</span>';
                titleText = 'Hari Kerja Aktif';
            }
        }
        
        gridContainer.innerHTML += `
            <div onclick="toggleHolidayOverride('${dateStr}')" 
                 class="holiday-cell" 
                 style="aspect-ratio: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; border-radius: 8px; cursor: pointer; border: 1px solid ${borderColor}; background: ${bg}; position: relative; padding: 4px;" 
                 title="${titleText}">
                <span style="font-size: 0.95rem; font-weight: 700; color: ${textColor};">${day}</span>
                ${subTextHtml}
            </div>
        `;
    }
};

window.toggleHolidayOverride = async function(dateStr) {
    if (!CONFIG.customHolidays) CONFIG.customHolidays = {};
    
    const date = new Date(dateStr);
    const dayIndex = date.getDay();
    const isNatHoliday = await checkIfNationalHoliday(date);
    const defaultHoliday = (dayIndex === 0 || isNatHoliday);
    
    // Status saat ini (termasuk override kustom)
    const currentStatus = (CONFIG.customHolidays[dateStr] !== undefined) 
        ? CONFIG.customHolidays[dateStr] 
        : defaultHoliday;
        
    const newStatus = !currentStatus;
    
    if (newStatus === defaultHoliday) {
        delete CONFIG.customHolidays[dateStr];
    } else {
        CONFIG.customHolidays[dateStr] = newStatus;
    }
    
    // Simpan ke localStorage terlebih dahulu sebagai salinan cadangan instan
    localStorage.setItem('custom_holidays', JSON.stringify(CONFIG.customHolidays));
    
    // Bersihkan data absensi "Tidak Masuk Kantor" jika hari diubah menjadi Libur
    if (newStatus === true) {
        await cleanupAbsentLogsOnHolidays();
    }
    
    // Re-render kalender secara instan di UI
    await renderHolidayCalendar();
    
    // Jika tanggal yang di-toggle adalah hari ini, update status sistem offline overlay seketika
    const todayStr = new Date().toLocaleDateString('en-CA');
    if (dateStr === todayStr) {
        await checkSystemStatus();
    }
};

window.resetMonthHolidays = async function() {
    const monthSelect = document.getElementById('holidayMonthSelect');
    if (!monthSelect || !monthSelect.value) return;
    const [yearStr, monthStr] = monthSelect.value.split('-');
    
    if (confirm(`Reset semua kustomisasi libur untuk bulan ${monthStr}/${yearStr}?`)) {
        if (!CONFIG.customHolidays) CONFIG.customHolidays = {};
        
        const prefix = `${yearStr}-${monthStr}`;
        Object.keys(CONFIG.customHolidays).forEach(key => {
            if (key.startsWith(prefix)) {
                delete CONFIG.customHolidays[key];
            }
        });
        
        localStorage.setItem('custom_holidays', JSON.stringify(CONFIG.customHolidays));
        
        // Jalankan pembersihan pasca reset kustomisasi libur
        await cleanupAbsentLogsOnHolidays();
        
        await renderHolidayCalendar();
        await checkSystemStatus();
    }
};

// --- LEAVE MANAGEMENT (HAK CUTI) ---

window.populateLeaveStaffSelect = function() {
    const sel = document.getElementById('leaveEmployeeSelect');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Pilih Nama --</option>' + allEmployees.map(e => `<option value="${e.id}">${e.full_name}</option>`).join('');
};

async function getWorkingDays(startDateStr, endDateStr) {
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    let count = 0;
    
    // Asumsi: jika ada custom holiday, kita akan abaikan. Namun fungsi checkIfHoliday membutuhkan instance Date.
    // Untuk performa, kita akan iterasi setiap hari.
    let current = new Date(start);
    current.setHours(0,0,0,0);
    const endMidnight = new Date(end);
    endMidnight.setHours(0,0,0,0);
    
    while (current <= endMidnight) {
        if (current.getDay() !== 0) { // Bukan hari Minggu
            const isHoliday = await checkIfHoliday(current);
            if (!isHoliday) {
                count++;
            }
        }
        current.setDate(current.getDate() + 1);
    }
    return count;
}

window.calculateLeaveDays = async function() {
    const startVal = document.getElementById('leaveStartDate').value;
    const endVal = document.getElementById('leaveEndDate').value;
    const calcEl = document.getElementById('leaveDaysCalc');
    
    if (startVal && endVal) {
        const start = new Date(startVal);
        const end = new Date(endVal);
        if (start > end) {
            calcEl.innerHTML = '<span style="color: var(--danger);">Tanggal akhir tidak boleh lebih awal.</span>';
            return;
        }
        const count = await getWorkingDays(startVal, endVal);
        calcEl.innerHTML = `Total Hari Kerja: <strong>${count} hari</strong>`;
    } else {
        calcEl.innerHTML = 'Total Hari Kerja: <strong>0 hari</strong>';
    }
};

window.loadLeaveStaffHistory = async function() {
    const empId = document.getElementById('leaveEmployeeSelect').value;
    const tbody = document.getElementById('leaveStaffHistoryTable');
    const quotaDisplay = document.getElementById('leaveQuotaDisplay');
    const quotaInfo = document.getElementById('leaveQuotaInfo');
    
    if (!empId) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 16px;">Pilih nama staf terlebih dahulu</td></tr>';
        quotaInfo.classList.add('hidden');
        return;
    }
    
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 16px;"><span class="btn-spinner" style="width:14px;height:14px;display:inline-block;"></span> Memuat...</td></tr>';
    quotaInfo.classList.remove('hidden');
    quotaDisplay.innerHTML = '<span class="btn-spinner" style="width:18px;height:18px;display:inline-block;border-color:var(--primary) transparent var(--primary) transparent;"></span>';
    
    try {
        const emp = allEmployees.find(e => e.id === empId);
        if (!emp) throw new Error("Staf tidak ditemukan.");
        
        // 1. Hitung sisa kuota (Berdasarkan created_at)
        const joinDate = new Date(emp.created_at || new Date());
        const now = new Date();
        
        // Tentukan periode tahun berjalan
        let periodStart = new Date(now.getFullYear(), joinDate.getMonth(), joinDate.getDate());
        if (now < periodStart) {
            // Jika hari ini belum melewati anniversary tahun ini, mundur ke tahun lalu
            periodStart.setFullYear(periodStart.getFullYear() - 1);
        }
        let periodEnd = new Date(periodStart);
        periodEnd.setFullYear(periodStart.getFullYear() + 1);
        periodEnd.setDate(periodEnd.getDate() - 1); // 1 hari sebelum anniversary berikutnya
        periodEnd.setHours(23, 59, 59, 999);
        
        // Cek riwayat cuti yang sudah di-approve dan jatuh pada periode ini
        const { data: approvedLeaves, error: errCuti } = await supabaseClient
            .from('leave_requests')
            .select('total_days')
            .eq('employee_id', empId)
            .eq('status', 'approved')
            .gte('start_date', periodStart.toISOString().split('T')[0])
            .lte('start_date', periodEnd.toISOString().split('T')[0]);
            
        if (errCuti) throw errCuti;
        
        let usedQuota = 0;
        approvedLeaves?.forEach(req => {
            usedQuota += req.total_days;
        });
        
        const remainingQuota = Math.max(0, 12 - usedQuota);
        quotaDisplay.innerHTML = `${remainingQuota} <span style="font-size: 0.9rem; font-weight: 500; color: var(--text-muted);">/ 12 Hari</span>`;
        
        // 2. Load riwayat
        const { data: history, error: errHist } = await supabaseClient
            .from('leave_requests')
            .select('*')
            .eq('employee_id', empId)
            .order('created_at', { ascending: false });
            
        if (errHist) throw errHist;
        
        if (history && history.length > 0) {
            let html = '';
            history.forEach(req => {
                let badge = '';
                if (req.status === 'approved') badge = '<span class="badge" style="background: rgba(5, 150, 105, 0.1); color: var(--success);"><i class="ri-check-line"></i> Disetujui</span>';
                else if (req.status === 'rejected') badge = '<span class="badge" style="background: rgba(220, 38, 38, 0.1); color: var(--danger);"><i class="ri-close-line"></i> Ditolak</span>';
                else badge = '<span class="badge" style="background: rgba(217, 119, 6, 0.1); color: var(--warning);"><i class="ri-time-line"></i> Menunggu</span>';
                
                const formatD = (dStr) => {
                    const d = new Date(dStr);
                    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
                };
                
                const dateStr = req.start_date === req.end_date ? formatD(req.start_date) : `${formatD(req.start_date)} - ${formatD(req.end_date)}`;
                
                html += `<tr>
                    <td><strong>${dateStr}</strong></td>
                    <td style="max-width: 150px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${req.reason || '-'}">${req.reason || '-'}</td>
                    <td>${req.total_days} Hari</td>
                    <td>${badge}</td>
                </tr>`;
            });
            tbody.innerHTML = html;
        } else {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 16px;">Belum ada riwayat pengajuan cuti.</td></tr>';
        }
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--danger); padding: 16px;">Gagal memuat data: ${err.message}</td></tr>`;
        quotaDisplay.innerHTML = '-';
    }
};

window.submitLeaveRequest = async function() {
    const empId = document.getElementById('leaveEmployeeSelect').value;
    const startVal = document.getElementById('leaveStartDate').value;
    const endVal = document.getElementById('leaveEndDate').value;
    const reason = document.getElementById('leaveReason').value;
    
    if (!empId) return alert("Pilih nama Anda terlebih dahulu!");
    if (!startVal || !endVal) return alert("Lengkapi tanggal mulai dan sampai!");
    if (new Date(startVal) > new Date(endVal)) return alert("Tanggal mulai tidak boleh melebihi tanggal akhir!");
    
    const count = await getWorkingDays(startVal, endVal);
    if (count <= 0) return alert("Rentang tanggal yang dipilih tidak memiliki hari kerja (Senin-Sabtu) aktif.");
    
    const btn = document.querySelector('#leaveStaffSection button.btn-primary');
    const origHtml = btn ? btn.innerHTML : 'Ajukan Cuti';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="btn-spinner"></span> Mengajukan...';
    }
    
    try {
        const { error } = await supabaseClient.from('leave_requests').insert([{
            employee_id: empId,
            start_date: startVal,
            end_date: endVal,
            total_days: count,
            reason: reason,
            status: 'pending'
        }]);
        
        if (error) throw error;
        
        alert("✅ Pengajuan cuti berhasil dikirim! Menunggu persetujuan admin/pimpinan.");
        
        // Reset form
        document.getElementById('leaveStartDate').value = '';
        document.getElementById('leaveEndDate').value = '';
        document.getElementById('leaveReason').value = '';
        document.getElementById('leaveDaysCalc').innerHTML = 'Total Hari Kerja: <strong>0 hari</strong>';
        
        // Refresh riwayat
        loadLeaveStaffHistory();
    } catch (err) {
        alert("Gagal mengajukan cuti: " + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = origHtml;
        }
    }
};

window.loadAdminLeaveRequests = async function() {
    const tbody = document.getElementById('leaveAdminTable');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px;"><span class="btn-spinner" style="width:14px;height:14px;display:inline-block;"></span> Memuat...</td></tr>';
    
    try {
        const { data: requests, error } = await supabaseClient
            .from('leave_requests')
            .select('*, employees(id, full_name, created_at)')
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        
        if (requests && requests.length > 0) {
            let html = '';
            
            // Untuk menghitung sisa kuota, kita perlu re-evaluasi tiap staf
            const now = new Date();
            const quotaCache = {};
            
            for (const req of requests) {
                const empId = req.employee_id;
                const empName = req.employees?.full_name || 'N/A';
                const joinDate = new Date(req.employees?.created_at || now);
                
                let remainingQuota = 12;
                
                if (quotaCache[empId] !== undefined) {
                    remainingQuota = quotaCache[empId];
                } else {
                    let periodStart = new Date(now.getFullYear(), joinDate.getMonth(), joinDate.getDate());
                    if (now < periodStart) {
                        periodStart.setFullYear(periodStart.getFullYear() - 1);
                    }
                    let periodEnd = new Date(periodStart);
                    periodEnd.setFullYear(periodStart.getFullYear() + 1);
                    periodEnd.setDate(periodEnd.getDate() - 1);
                    periodEnd.setHours(23, 59, 59, 999);
                    
                    const { data: approvedLeaves } = await supabaseClient
                        .from('leave_requests')
                        .select('total_days')
                        .eq('employee_id', empId)
                        .eq('status', 'approved')
                        .gte('start_date', periodStart.toISOString().split('T')[0])
                        .lte('start_date', periodEnd.toISOString().split('T')[0]);
                        
                    let used = 0;
                    approvedLeaves?.forEach(al => used += al.total_days);
                    remainingQuota = Math.max(0, 12 - used);
                    quotaCache[empId] = remainingQuota;
                }
                
                const formatD = (dStr) => {
                    const d = new Date(dStr);
                    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
                };
                const dateStr = req.start_date === req.end_date ? formatD(req.start_date) : `${formatD(req.start_date)} - ${formatD(req.end_date)}`;
                
                let statusBadge = '';
                let actions = '';
                
                if (req.status === 'pending') {
                    statusBadge = '<span class="badge" style="background: rgba(217, 119, 6, 0.1); color: var(--warning);"><i class="ri-time-line"></i> Menunggu</span>';
                    actions = `
                        <div style="display: flex; gap: 6px; justify-content: center;">
                            <button class="btn-icon" style="background: var(--success); color: white;" onclick="handleApproveLeave('${req.id}', '${empId}', '${req.start_date}', '${req.end_date}', ${req.total_days}, ${remainingQuota})" title="Setujui"><i class="ri-check-line"></i></button>
                            <button class="btn-icon" style="background: var(--danger); color: white;" onclick="handleRejectLeave('${req.id}')" title="Tolak"><i class="ri-close-line"></i></button>
                            <button class="btn-icon btn-edit" onclick="openEditLeaveModal('${req.id}', '${req.start_date}', '${req.end_date}', \`${req.reason || ''}\`)" title="Edit"><i class="ri-pencil-line"></i></button>
                            <button class="btn-icon btn-delete" onclick="handleDeleteLeave('${req.id}', '${req.status}')" title="Hapus"><i class="ri-delete-bin-line"></i></button>
                        </div>
                    `;
                } else if (req.status === 'approved') {
                    statusBadge = '<span class="badge" style="background: rgba(5, 150, 105, 0.1); color: var(--success);"><i class="ri-check-double-line"></i> Disetujui</span>';
                    actions = `
                        <div style="display: flex; gap: 6px; justify-content: center;">
                            <button class="btn-icon btn-edit" onclick="openEditLeaveModal('${req.id}', '${req.start_date}', '${req.end_date}', \`${req.reason || ''}\`)" title="Edit"><i class="ri-pencil-line"></i></button>
                            <button class="btn-icon btn-delete" onclick="handleDeleteLeave('${req.id}', '${req.status}')" title="Hapus"><i class="ri-delete-bin-line"></i></button>
                        </div>
                    `;
                } else {
                    statusBadge = '<span class="badge" style="background: rgba(220, 38, 38, 0.1); color: var(--danger);"><i class="ri-close-circle-line"></i> Ditolak</span>';
                    actions = `
                        <div style="display: flex; gap: 6px; justify-content: center;">
                            <button class="btn-icon btn-edit" onclick="openEditLeaveModal('${req.id}', '${req.start_date}', '${req.end_date}', \`${req.reason || ''}\`)" title="Edit"><i class="ri-pencil-line"></i></button>
                            <button class="btn-icon btn-delete" onclick="handleDeleteLeave('${req.id}', '${req.status}')" title="Hapus"><i class="ri-delete-bin-line"></i></button>
                        </div>
                    `;
                }
                
                html += `<tr>
                    <td><strong>${empName}</strong></td>
                    <td>${dateStr}</td>
                    <td>${req.reason || '-'}</td>
                    <td>${req.total_days} Hari</td>
                    <td><span style="font-weight:700; color: ${remainingQuota > 0 ? 'var(--success)' : 'var(--danger)'};">${remainingQuota}</span></td>
                    <td>${statusBadge}</td>
                    <td>${actions}</td>
                </tr>`;
            }
            tbody.innerHTML = html;
        } else {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 20px;">Belum ada data pengajuan cuti.</td></tr>';
        }
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--danger); padding: 20px;">Gagal memuat data: ${err.message}</td></tr>`;
    }
};

window.handleRejectLeave = async function(reqId) {
    if (!confirm("Apakah Anda yakin ingin menolak pengajuan cuti ini?")) return;
    
    try {
        const { error } = await supabaseClient.from('leave_requests').update({ status: 'rejected' }).eq('id', reqId);
        if (error) throw error;
        alert("Pengajuan cuti ditolak.");
        loadAdminLeaveRequests();
    } catch (err) {
        alert("Gagal menolak cuti: " + err.message);
    }
};

window.handleApproveLeave = async function(reqId, empId, startDateStr, endDateStr, totalDays, currentQuota) {
    if (!confirm("Apakah Anda yakin ingin menyetujui pengajuan cuti ini?\nSistem akan otomatis merekam log kehadiran staf untuk tanggal-tanggal yang diajukan.")) return;
    
    try {
        // 1. Hitung hari-hari spesifik (Senin-Sabtu non-libur)
        const start = new Date(startDateStr);
        const end = new Date(endDateStr);
        let current = new Date(start);
        current.setHours(0,0,0,0);
        const endMidnight = new Date(end);
        endMidnight.setHours(0,0,0,0);
        
        let quota = currentQuota;
        const logsToInsert = [];
        
        while (current <= endMidnight) {
            if (current.getDay() !== 0) { // Bukan Minggu
                const isHoliday = await checkIfHoliday(current);
                if (!isHoliday) {
                    // Tentukan denda jika kuota habis
                    let penalty = 0;
                    if (quota > 0) {
                        quota--; // Gunakan kuota
                    } else {
                        penalty = CONFIG.maxDailyPenalty || 50000;
                    }
                    
                    // Format ISO 8601 (Gunakan jam 08:00:00 lokal)
                    const logDate = new Date(current);
                    logDate.setHours(8, 0, 0, 0);
                    
                    logsToInsert.push({
                        employee_id: empId,
                        check_in_time: logDate.toISOString(),
                        type: 'manual',
                        status: 'Ijin (Hak Cuti)',
                        notes: 'Pengajuan Cuti Disetujui Pimpinan/Admin',
                        reward_amount: 0,
                        penalty_amount: penalty,
                        late_duration_minutes: 0
                    });
                }
            }
            current.setDate(current.getDate() + 1);
        }
        
        // 2. Insert ke attendance_logs
        if (logsToInsert.length > 0) {
            const { error: errInsert } = await supabaseClient.from('attendance_logs').insert(logsToInsert);
            if (errInsert) throw errInsert;
        }
        
        // 3. Update status leave_requests
        const { error: errUpdate } = await supabaseClient.from('leave_requests').update({ status: 'approved' }).eq('id', reqId);
        if (errUpdate) throw errUpdate;
        
        alert("✅ Pengajuan cuti disetujui! Log kehadiran telah ditambahkan otomatis.");
        loadAdminLeaveRequests();
        
    } catch (err) {
        alert("Gagal menyetujui cuti: " + err.message);
    }
};

window.handleDeleteLeave = async function(reqId, status) {
    if (status === 'approved') {
        if (!confirm("PERINGATAN: Cuti ini sudah disetujui.\nMenghapus data ini TIDAK akan menghapus log kehadiran yang sudah terbuat otomatis.\nAnda harus menghapus log tersebut secara manual di menu Riwayat.\nYakin ingin menghapus pengajuan ini?")) return;
    } else {
        if (!confirm("Apakah Anda yakin ingin menghapus pengajuan cuti ini?")) return;
    }
    
    try {
        const { error } = await supabaseClient.from('leave_requests').delete().eq('id', reqId);
        if (error) throw error;
        alert("Data pengajuan cuti berhasil dihapus.");
        loadAdminLeaveRequests();
    } catch (err) {
        alert("Gagal menghapus cuti: " + err.message);
    }
};

window.openEditLeaveModal = function(reqId, startDate, endDate, reason) {
    document.getElementById('editLeaveId').value = reqId;
    document.getElementById('editLeaveStart').value = startDate;
    document.getElementById('editLeaveEnd').value = endDate;
    document.getElementById('editLeaveReason').value = reason;
    
    document.getElementById('editLeaveModal').classList.remove('hidden');
};

window.saveEditLeave = async function() {
    const reqId = document.getElementById('editLeaveId').value;
    const startVal = document.getElementById('editLeaveStart').value;
    const endVal = document.getElementById('editLeaveEnd').value;
    const reason = document.getElementById('editLeaveReason').value;
    
    if (!startVal || !endVal) return alert("Lengkapi tanggal mulai dan sampai!");
    if (new Date(startVal) > new Date(endVal)) return alert("Tanggal mulai tidak boleh melebihi tanggal akhir!");
    
    const count = await getWorkingDays(startVal, endVal);
    if (count <= 0) return alert("Rentang tanggal tidak memiliki hari kerja aktif.");
    
    try {
        const { error } = await supabaseClient.from('leave_requests').update({
            start_date: startVal,
            end_date: endVal,
            total_days: count,
            reason: reason
        }).eq('id', reqId);
        
        if (error) throw error;
        alert("✅ Perubahan berhasil disimpan.");
        closeModals();
        loadAdminLeaveRequests();
        loadLeaveStaffHistory();
    } catch (err) {
        alert("Gagal menyimpan perubahan: " + err.message);
    }
};
