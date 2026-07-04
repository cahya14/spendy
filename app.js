const API_URL = "https://script.google.com/macros/s/AKfycbwRhTUGRPyCDCe8fSk4j-LiK68uuK6Tgoyzz6msU_V_ZjTs55SV222GNwIzDGPSWjZMnA/exec";
const today = new Date().toISOString().split('T')[0];
window.expenseList = [];
let activeTab = 'transactions';
let catChartInstance = null;
let trendChartInstance = null;
let sourceChartInstance = null;
let activeChartIndex = 0; // 0: Kategori, 1: Tanggal, 2: Sumber Dana

// ==================== SUPABASE CLIENT CONFIG ====================
const SUPABASE_URL = 'https://tvchnxhzmdqdabuaeyqy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2Y2hueGh6bWRxZGFidWFleXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwMjUwODIsImV4cCI6MjA5ODYwMTA4Mn0.cZ3lsWfkQAAH-OlwgN0HRVRmzA_3WrMoPtLR3CZ6G2U';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let selectedMonth = ''; // Format: YYYY-MM

// ==================== NEW HELPERS: REPORT CHART PROGRESS BAR & DATES ====================
function getCategoryBarColor(category) {
    const clean = String(category).toLowerCase();
    if (clean.includes('food') || clean.includes('makan') || clean.includes('minum')) return 'bg-orange-500';
    if (clean.includes('transport') || clean.includes('perjalanan') || clean.includes('bensin')) return 'bg-blue-500';
    if (clean.includes('phone') || clean.includes('pulsa') || clean.includes('internet') || clean.includes('kuota')) return 'bg-pink-500';
    if (clean.includes('salary') || clean.includes('gaji') || clean.includes('income') || clean.includes('pendapatan')) return 'bg-yellow-500';
    if (clean.includes('gift') || clean.includes('hadiah')) return 'bg-amber-500';
    if (clean.includes('netflix') || clean.includes('hiburan') || clean.includes('game') || clean.includes('nonton') || clean.includes('movie')) return 'bg-emerald-500';
    if (clean.includes('belanja') || clean.includes('shop') || clean.includes('outfit')) return 'bg-purple-500';
    if (clean.includes('listrik') || clean.includes('tagihan') || clean.includes('bill')) return 'bg-yellow-500';
    return 'bg-slate-400';
}

function getShortGroupDate(dateStr) {
    let date;
    if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        date = new Date(parts[2], parts[1] - 1, parts[0]);
    } else {
        const parts = dateStr.split('-');
        date = new Date(parts[0], parts[1] - 1, parts[2]);
    }
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${date.getDate()} ${months[date.getMonth()]}`;
}

function generateLast24Months() {
    const list = [];
    const now = new Date();
    const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    for (let i = 23; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const year = d.getFullYear();
        const monthNum = d.getMonth();
        const value = `${year}-${String(monthNum + 1).padStart(2, '0')}`;

        let label = `${monthsShort[monthNum]} ${year}`;
        if (i === 0) {
            label = "This Month";
        } else if (i === 1) {
            label = "Last Month";
        }

        list.push({ value, label });
    }
    return list;
}

function populateMonthTabs() {
    const container = document.getElementById('reportMonthTabs');
    if (!container) return;

    const months = generateLast24Months();
    container.innerHTML = '';

    months.forEach(m => {
        const isActive = (m.value === selectedMonth);
        const activeClasses = isActive
            ? 'border-b-2 border-teal-600 text-teal-600 font-extrabold pb-1.5'
            : 'text-slate-400 hover:text-slate-600 pb-1.5';

        container.innerHTML += `
        <span onclick="changeMonthYear('${m.value}')" class="cursor-pointer whitespace-nowrap shrink-0 transition ${activeClasses}" id="tab-month-${m.value}">
            ${m.label}
        </span>
        `;
    });

    setTimeout(() => {
        const activeTabEl = document.getElementById(`tab-month-${selectedMonth}`);
        if (activeTabEl) {
            container.scrollLeft = activeTabEl.offsetLeft - container.offsetWidth / 2 + activeTabEl.offsetWidth / 2;
        }
    }, 100);
}

let isProgrammaticScroll = false;

function updateCarouselDots(index) {
    console.log("updateCarouselDots called with index:", index);
    if (isNaN(index) || index < 0 || index > 2) return;

    for (let i = 0; i < 3; i++) {
        const dot = document.getElementById(`chart-dot-${i}`);
        if (dot) {
            if (i === index) {
                dot.className = "w-1.5 h-1.5 rounded-full bg-teal-600 transition";
            } else {
                dot.className = "w-1.5 h-1.5 rounded-full bg-slate-300 transition";
            }
        }
    }

    const elTitle = document.getElementById('reportChartTitle');
    if (elTitle) {
        if (index === 0) elTitle.innerText = "Persentase Kategori";
        else if (index === 1) elTitle.innerText = "Pengeluaran Harian";
        else if (index === 2) elTitle.innerText = "Alokasi Sumber Dana";
    }
}

function switchReportChart(index) {
    console.log("switchReportChart invoked for index:", index);
    const container = document.getElementById('chartCarouselContainer');
    if (container) {
        const width = container.offsetWidth;
        if (width > 0) {
            isProgrammaticScroll = true;
            container.scrollTo({
                left: index * width,
                behavior: 'smooth'
            });
            updateCarouselDots(index);

            // Release the lock after animation finishes
            setTimeout(() => {
                isProgrammaticScroll = false;
            }, 600);
        }
    }
}

function enableMouseDragScroll(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    let isDown = false;
    let startX;
    let scrollLeft;

    container.addEventListener('mousedown', (e) => {
        e.preventDefault();
        isDown = true;
        startX = e.pageX - container.offsetLeft;
        scrollLeft = container.scrollLeft;
        container.style.scrollBehavior = 'auto';
    });

    container.addEventListener('mouseleave', () => {
        if (!isDown) return;
        isDown = false;
        container.style.scrollBehavior = 'smooth';
        const width = container.offsetWidth;
        if (width > 0) {
            const index = Math.round(container.scrollLeft / width);
            isProgrammaticScroll = true;
            container.scrollTo({ left: index * width, behavior: 'smooth' });
            updateCarouselDots(index);
            setTimeout(() => { isProgrammaticScroll = false; }, 600);
        }
    });

    container.addEventListener('mouseup', () => {
        if (!isDown) return;
        isDown = false;
        container.style.scrollBehavior = 'smooth';
        const width = container.offsetWidth;
        if (width > 0) {
            const index = Math.round(container.scrollLeft / width);
            isProgrammaticScroll = true;
            container.scrollTo({ left: index * width, behavior: 'smooth' });
            updateCarouselDots(index);
            setTimeout(() => { isProgrammaticScroll = false; }, 600);
        }
    });

    container.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - container.offsetLeft;
        const walk = (x - startX) * 1.5;
        container.scrollLeft = scrollLeft - walk;
    });
}

function enableSimpleMouseDragScroll(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    let isDown = false;
    let startX;
    let scrollLeft;

    container.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        isDown = true;
        startX = e.pageX - container.offsetLeft;
        scrollLeft = container.scrollLeft;
        container.style.scrollBehavior = 'auto';
    });

    container.addEventListener('mouseleave', () => {
        isDown = false;
        container.style.scrollBehavior = 'smooth';
    });

    container.addEventListener('mouseup', () => {
        isDown = false;
        container.style.scrollBehavior = 'smooth';
    });

    container.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - container.offsetLeft;
        const walk = (x - startX) * 1.5;
        container.scrollLeft = scrollLeft - walk;
    });
}

// ==================== NEW HELPERS FOR MONTH SELECTOR & DATA COMBINATION ====================
function getCategoryIcon(category) {
    const found = (window.spendyMetadata || []).find(m => m.nama.toLowerCase() === String(category).toLowerCase());
    if (found && found.icon_emoji) return found.icon_emoji;

    const clean = String(category).toLowerCase();
    if (clean.includes('food') || clean.includes('makan') || clean.includes('minum')) return '🍔';
    if (clean.includes('transport') || clean.includes('perjalanan') || clean.includes('bensin')) return '🚗';
    if (clean.includes('phone') || clean.includes('pulsa') || clean.includes('internet') || clean.includes('kuota')) return '📱';
    if (clean.includes('salary') || clean.includes('gaji') || clean.includes('income') || clean.includes('pendapatan')) return '💼';
    if (clean.includes('gift') || clean.includes('hadiah')) return '🎁';
    if (clean.includes('netflix') || clean.includes('hiburan') || clean.includes('game') || clean.includes('nonton') || clean.includes('movie')) return '🎮';
    if (clean.includes('belanja') || clean.includes('shop') || clean.includes('outfit')) return '🛍️';
    if (clean.includes('listrik') || clean.includes('tagihan') || clean.includes('bill')) return '⚡';
    return '📝';
}

function getCategoryColor(category) {
    const clean = String(category).toLowerCase();
    if (clean.includes('food') || clean.includes('makan') || clean.includes('minum')) return 'bg-orange-100 text-orange-600';
    if (clean.includes('transport') || clean.includes('perjalanan') || clean.includes('bensin')) return 'bg-blue-100 text-blue-600';
    if (clean.includes('phone') || clean.includes('pulsa') || clean.includes('internet') || clean.includes('kuota')) return 'bg-pink-100 text-pink-600';
    if (clean.includes('salary') || clean.includes('gaji') || clean.includes('income') || clean.includes('pendapatan')) return 'bg-yellow-100 text-yellow-600';
    if (clean.includes('gift') || clean.includes('hadiah')) return 'bg-amber-100 text-amber-600';
    if (clean.includes('netflix') || clean.includes('hiburan') || clean.includes('game') || clean.includes('nonton') || clean.includes('movie')) return 'bg-emerald-100 text-emerald-600';
    if (clean.includes('belanja') || clean.includes('shop') || clean.includes('outfit')) return 'bg-purple-100 text-purple-600';
    if (clean.includes('listrik') || clean.includes('tagihan') || clean.includes('bill')) return 'bg-yellow-100 text-yellow-600';

    // Hash based color fallback for custom metadata categories
    const colors = [
        "bg-emerald-100 text-emerald-600",
        "bg-pink-100 text-pink-600",
        "bg-amber-100 text-amber-600",
        "bg-cyan-100 text-cyan-600",
        "bg-indigo-100 text-indigo-600",
        "bg-rose-100 text-rose-600",
        "bg-teal-100 text-teal-600"
    ];
    let hash = 0;
    for (let i = 0; i < clean.length; i++) {
        hash += clean.charCodeAt(i);
    }
    return colors[hash % colors.length];
}

function getRowMonthYear(row) {
    if (!row || !row.date) return '';
    if (row.date.includes('/')) {
        const parts = row.date.split('/');
        if (parts.length === 3) {
            return `${parts[2]}-${parts[1]}`;
        }
    } else if (row.date.includes('-')) {
        const parts = row.date.split('-');
        if (parts.length === 3) {
            if (parts[0].length === 4) {
                return `${parts[0]}-${parts[1]}`;
            } else {
                return `${parts[2]}-${parts[1]}`;
            }
        }
    }
    return '';
}

function formatGroupDate(dateStr) {
    let date;
    if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        date = new Date(parts[2], parts[1] - 1, parts[0]);
    } else {
        const parts = dateStr.split('-');
        date = new Date(parts[0], parts[1] - 1, parts[2]);
    }
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    return `${date.getDate()} ${months[date.getMonth()]} ${days[date.getDay()]}`;
}

function populateMonthYearPickers() {
    const appBarSel = document.getElementById('appBarMonthYear');

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const months = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];

    const optionsHtml = [];

    // Generate for previous year, current year, and next year
    for (let y = currentYear - 1; y <= currentYear + 1; y++) {
        for (let m = 0; m < 12; m++) {
            const value = `${y}-${String(m + 1).padStart(2, '0')}`;
            const label = `${months[m]} ${y}`;
            const selected = (y === currentYear && m === currentMonth) ? 'selected' : '';
            optionsHtml.push(`<option value="${value}" ${selected} class="text-slate-800 font-semibold bg-white">${label}</option>`);
        }
    }

    const selectContent = optionsHtml.join('');
    if (appBarSel) appBarSel.innerHTML = selectContent;

    selectedMonth = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;

    populateMonthTabs();
}

function syncIframeMonth() {
    const iframe = document.getElementById('budgetingIframe');
    if (iframe && iframe.contentWindow && selectedMonth) {
        iframe.contentWindow.postMessage({ type: 'SET_MONTH', month: selectedMonth }, '*');
    }
}

function changeMonthYear(val) {
    selectedMonth = val;

    const appBarSel = document.getElementById('appBarMonthYear');
    if (appBarSel) appBarSel.value = val;

    populateMonthTabs();

    loadData();

    syncIframeMonth();
    // TAMBAHKAN BARIS INI:
    updateBudgetAllocationDropdown();
}

function formatRupiah(value) {
    let num = Number(String(value).replace(/[^0-9]/g, '')) || 0;
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num);
}

// ==================== NEW HELPERS: CATEGORY LOCAL STORAGE CRUD ====================
// ==================== NEW HELPERS: METADATA & DROPDOWN CRUD (SUPABASE) ====================
const DEFAULT_METADATA = [
    { id: -1, nama: 'Food', jenis: 'Category', icon_emoji: '🍔' },
    { id: -2, nama: 'Transport', jenis: 'Category', icon_emoji: '🚗' },
    { id: -3, nama: 'Other', jenis: 'Category', icon_emoji: '📝' },
    { id: -4, nama: 'Cash', jenis: 'Source', icon_emoji: '💵' },
    { id: -5, nama: 'E-Wallet', jenis: 'Source', icon_emoji: '📱' },
    { id: -6, nama: 'Bank Transfer', jenis: 'Source', icon_emoji: '💳' }
];
window.spendyMetadata = [];
window.metaFilter = 'ALL';

function loadCachedMetadata() {
    try {
        const cached = localStorage.getItem('spendy_metadata_cache');
        if (cached) {
            window.spendyMetadata = JSON.parse(cached);
        } else {
            window.spendyMetadata = DEFAULT_METADATA;
            localStorage.setItem('spendy_metadata_cache', JSON.stringify(DEFAULT_METADATA));
        }
    } catch (e) {
        window.spendyMetadata = DEFAULT_METADATA;
    }
}

async function syncMetadataFromSupabase() {
    try {
        const { data, error } = await supabaseClient.from('spendy_metadata').select('*').order('nama');
        if (!error && data) {
            window.spendyMetadata = data;
            localStorage.setItem('spendy_metadata_cache', JSON.stringify(data));
            updateCategoryAndSourceDropdowns();
            renderMetadataList();
        }
    } catch (e) {
        console.warn("Failed to sync metadata from Supabase:", e);
    }
}

async function updateBudgetAllocationDropdown() {
    const dropdown = document.getElementById('expenses_id');
    if (!dropdown) return;

    // Ambil data alokasi dari Supabase berdasarkan bulan terpilih
    const { data, error } = await supabaseClient
        .from('expenses')
        .select('id, name')
        .eq('month', selectedMonth);

    const prevVal = dropdown.value;
    dropdown.innerHTML = '<option value="">-- Tidak Ditautkan --</option>';

    if (!error && data) {
        data.forEach(item => {
            dropdown.innerHTML += `<option value="${item.id}">${item.name}</option>`;
        });
    }

    // Pertahankan pilihan sebelumnya jika sedang edit
    if (prevVal) dropdown.value = prevVal;
}

function updateCategoryAndSourceDropdowns() {
    const metadata = window.spendyMetadata || [];
    const categories = metadata.filter(m => m.jenis === 'Category').map(m => m.nama);
    const sources = metadata.filter(m => m.jenis === 'Source').map(m => m.nama);

    // 1. Update filterCategory select in tab-transactions
    const filterCat = document.getElementById('filterCategory');
    if (filterCat) {
        const prevVal = filterCat.value;
        filterCat.innerHTML = '<option value="ALL">Semua Kategori</option>';
        categories.forEach(cat => {
            filterCat.innerHTML += `<option value="${cat}">${cat}</option>`;
        });
        filterCat.value = categories.includes(prevVal) ? prevVal : 'ALL';
    }

    // 2. Update filterSource select in tab-transactions
    const filterSrc = document.getElementById('filterSource');
    if (filterSrc) {
        const prevVal = filterSrc.value;
        filterSrc.innerHTML = '<option value="ALL">Semua Sumber</option>';
        sources.forEach(src => {
            filterSrc.innerHTML += `<option value="${src}">${src}</option>`;
        });
        filterSrc.value = sources.includes(prevVal) ? prevVal : 'ALL';
    }

    // 3. Update category select in formModal
    const formCat = document.getElementById('category');
    if (formCat) {
        const prevVal = formCat.value;
        formCat.innerHTML = '';
        categories.forEach(cat => {
            formCat.innerHTML += `<option value="${cat}">${cat}</option>`;
        });
        if (categories.includes(prevVal)) {
            formCat.value = prevVal;
        } else if (categories.length > 0) {
            formCat.value = categories[0];
        }
    }

    // 4. Update source select in formModal
    const formSrc = document.getElementById('source');
    if (formSrc) {
        const prevVal = formSrc.value;
        formSrc.innerHTML = '';
        sources.forEach(src => {
            formSrc.innerHTML += `<option value="${src}">${src}</option>`;
        });
        if (sources.includes(prevVal)) {
            formSrc.value = prevVal;
        } else if (sources.length > 0) {
            formSrc.value = sources[0];
        }
    }
}



function renderMetadataList() {
    const container = document.getElementById('metadataListContainer');
    if (!container) return;
    container.innerHTML = '';

    const filter = window.metaFilter || 'ALL';
    const items = window.spendyMetadata.filter(m => filter === 'ALL' || m.jenis === filter);

    if (items.length === 0) {
        container.innerHTML = `<p class="text-center py-4 text-[11px] font-semibold text-slate-400">Tidak ada data.</p>`;
        return;
    }

    items.forEach(item => {
        const div = document.createElement('div');
        div.className = "flex justify-between items-center py-2.5";

        div.innerHTML = `
            <div class="flex items-center gap-2">
                <span class="text-base">${item.icon_emoji}</span>
                <span class="text-xs font-semibold text-slate-700">${item.nama}</span>
                <span class="text-[9px] px-1.5 py-0.5 rounded font-extrabold ${item.jenis === 'Category' ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'}">${item.jenis === 'Category' ? 'Kategori' : 'Sumber'}</span>
            </div>
            <div class="flex items-center gap-2">
                <button onclick="editMetadata(${item.id})" class="text-[10px] font-bold text-teal-600 bg-teal-50 hover:bg-teal-100 px-2 py-1 rounded-md transition active:scale-95">Edit</button>
                <button onclick="deleteMetadata(${item.id})" class="text-[10px] font-bold text-rose-500 bg-rose-50 hover:bg-rose-100 px-2 py-1 rounded-md transition active:scale-95">Hapus</button>
            </div>
        `;
        container.appendChild(div);
    });
}

function editMetadata(id) {
    const item = window.spendyMetadata.find(m => Number(m.id) === Number(id));
    if (!item) return;

    document.getElementById('metaEditId').value = item.id;

    // Check if name is used in window.expenseList
    const isUsed = (window.expenseList || []).some(t =>
        (t.category === item.nama && item.jenis === 'Category') ||
        (t.source === item.nama && item.jenis === 'Source')
    );

    const metaNama = document.getElementById('metaNama');
    metaNama.value = item.nama;

    if (isUsed) {
        metaNama.disabled = true;
        metaNama.classList.remove('bg-slate-50');
        metaNama.classList.add('bg-slate-200', 'text-slate-400');
    } else {
        metaNama.disabled = false;
        metaNama.classList.remove('bg-slate-200', 'text-slate-400');
        metaNama.classList.add('bg-slate-50');
    }

    const metaJenis = document.getElementById('metaJenis');
    metaJenis.value = item.jenis;
    metaJenis.disabled = true;

    document.getElementById('metaIcon').value = item.icon_emoji;

    document.getElementById('metaSubmitBtn').innerText = "Simpan";
    document.getElementById('metaCancelBtn').classList.remove('hidden');
}

function cancelEditMetadata() {
    document.getElementById('metaEditId').value = '';

    const metaNama = document.getElementById('metaNama');
    metaNama.value = '';
    metaNama.disabled = false;
    metaNama.classList.remove('bg-slate-200', 'text-slate-400');
    metaNama.classList.add('bg-slate-50');

    const metaJenis = document.getElementById('metaJenis');
    metaJenis.disabled = false;

    document.getElementById('metaIcon').value = '';

    document.getElementById('metaSubmitBtn').innerText = "Tambah";
    document.getElementById('metaCancelBtn').classList.add('hidden');
}

async function saveMetadata(event) {
    event.preventDefault();
    const id = document.getElementById('metaEditId').value;
    const nama = document.getElementById('metaNama').value.trim();
    const jenis = document.getElementById('metaJenis').value;
    const emoji = document.getElementById('metaIcon').value.trim();

    if (!nama || !emoji) {
        return showGrowl("Nama dan Emoji tidak boleh kosong!", "error");
    }

    if (id) {
        const metaNama = document.getElementById('metaNama');
        const updatePayload = { icon_emoji: emoji };

        // If name input is enabled, we allow editing the name too
        if (!metaNama.disabled) {
            // Check unique name for other items
            const conflict = window.spendyMetadata.some(m =>
                Number(m.id) !== Number(id) &&
                m.nama.toLowerCase() === nama.toLowerCase() &&
                m.jenis === jenis
            );
            if (conflict) {
                return showGrowl(`Nama ${jenis === 'Category' ? 'Kategori' : 'Sumber'} sudah digunakan!`, "error");
            }
            updatePayload.nama = nama;
        }

        try {
            const { error } = await supabaseClient
                .from('spendy_metadata')
                .update(updatePayload)
                .eq('id', id);

            if (error) throw error;

            showGrowl("Berhasil memperbarui data!");
            cancelEditMetadata();
            await syncMetadataFromSupabase();
        } catch (e) {
            console.error(e);
            showGrowl("Gagal memperbarui data.", "error");
        }
    } else {
        // INSERT
        // Check unique name in memory first
        const exists = window.spendyMetadata.some(m => m.nama.toLowerCase() === nama.toLowerCase() && m.jenis === jenis);
        if (exists) {
            return showGrowl(`Nama ${jenis === 'Category' ? 'Kategori' : 'Sumber'} sudah digunakan!`, "error");
        }

        try {
            const { error } = await supabaseClient
                .from('spendy_metadata')
                .insert([{ nama, jenis, icon_emoji: emoji }]);

            if (error) {
                if (error.code === '23505') {
                    return showGrowl("Nama tersebut sudah terdaftar!", "error");
                }
                throw error;
            }

            showGrowl("Berhasil menambahkan data!");
            document.getElementById('metaNama').value = '';
            document.getElementById('metaIcon').value = '';
            await syncMetadataFromSupabase();
        } catch (e) {
            console.error(e);
            showGrowl("Gagal menyimpan data.", "error");
        }
    }
}

let _pendingDeleteMetaId = null;

function tutupMetaDeleteModal() {
    _pendingDeleteMetaId = null;
    const modal = document.getElementById('metaDeleteConfirmModal');
    if (modal) modal.classList.add('hidden');
}

async function deleteMetadata(id) {
    // Check seed fallback first
    if (Number(id) < 0) {
        // Since it's negative, it's a local default seed item. It cannot be deleted from Supabase.
        // We can just warn the user.
        return showGrowl("Data default bawaan tidak dapat dihapus sebelum disimpan di database.", "error");
    }

    const item = window.spendyMetadata.find(m => Number(m.id) === Number(id));
    if (!item) return;

    // Check if name is used in window.expenseList
    const isUsed = (window.expenseList || []).some(t =>
        (t.category === item.nama && item.jenis === 'Category') ||
        (t.source === item.nama && item.jenis === 'Source')
    );

    if (isUsed) {
        return showGrowl(`"${item.nama}" sudah digunakan dalam transaksi dan tidak dapat dihapus!`, "error");
    }

    _pendingDeleteMetaId = id;
    const confirmTextEl = document.getElementById('metaDeleteConfirmText');
    if (confirmTextEl) {
        confirmTextEl.innerText = `Apakah Anda yakin ingin menghapus ${item.jenis === 'Category' ? 'kategori' : 'sumber dana'} "${item.nama}"?`;
    }
    const modal = document.getElementById('metaDeleteConfirmModal');
    if (modal) modal.classList.remove('hidden');
}

async function konfirmasiHapusMeta() {
    const id = _pendingDeleteMetaId;
    tutupMetaDeleteModal();
    if (id == null) return;

    try {
        const { error } = await supabaseClient
            .from('spendy_metadata')
            .delete()
            .eq('id', id);

        if (error) throw error;

        showGrowl("Berhasil menghapus data!");
        await syncMetadataFromSupabase();
    } catch (e) {
        console.error(e);
        showGrowl("Gagal menghapus data.", "error");
    }
}

function filterMetadataList(jenis) {
    window.metaFilter = jenis;
    const filters = ['ALL', 'Category', 'Source'];
    filters.forEach(f => {
        const btn = document.getElementById(`btn-meta-filter-${f}`);
        if (btn) {
            if (f === jenis) {
                btn.className = "px-2.5 py-1 rounded bg-teal-600 text-white transition";
            } else {
                btn.className = "px-2.5 py-1 rounded bg-slate-100 text-slate-500 hover:bg-slate-200 transition";
            }
        }
    });
    renderMetadataList();
}

function resetMetadataFormText() {
    // Stub
}

// ==================== NEW HELPERS: NOMINAL FORMAT & SHORTCUT ====================
function formatAmountInput(input) {
    let value = input.value.replace(/[^0-9]/g, '');
    if (value === '') {
        input.value = '';
        return;
    }
    input.value = new Intl.NumberFormat('id-ID').format(value);
}

function appendThousandShortcut() {
    const input = document.getElementById('amount');
    let cleanVal = input.value.replace(/[^0-9]/g, '');
    if (!cleanVal) return;
    cleanVal += "000";
    input.value = new Intl.NumberFormat('id-ID').format(cleanVal);
    input.dispatchEvent(new Event('input'));
}

const CACHE_KEY = 'spendy_expense_cache';

function saveExpenseCache(data) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch (e) {
        console.warn('Cache write failed:', e);
    }
}

function loadExpenseCache() {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

function setLoader(show) {
    // Legacy full-screen loader: only used as fallback, now hidden
    const el = document.getElementById('loadingBackdrop');
    if (el) el.classList.toggle('hidden', !show);
}

function showSyncIndicator() {
    const el = document.getElementById('appBarSyncIndicator');
    if (el) el.classList.remove('hidden');
}

function hideSyncIndicator() {
    const el = document.getElementById('appBarSyncIndicator');
    if (el) el.classList.add('hidden');
    // Stop spinning animation on sync button
    const icon = document.getElementById('appBarSyncIcon');
    if (icon) icon.classList.remove('animate-spin');
}

/**
 * manualSync: Triggered by the user pressing the sync button.
 * Force-fetches fresh data from the spreadsheet and Supabase,
 * updates the cache, and re-renders the UI.
 */
async function manualSync() {
    // Spin the sync button icon to indicate loading
    const icon = document.getElementById('appBarSyncIcon');
    if (icon) icon.classList.add('animate-spin');
    showSyncIndicator();

    // Trigger sync in budgeting page if embedded
    const iframe = document.getElementById('budgetingIframe');
    if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'REFRESH' }, '*');
    }

    try {
        const [sheetsRes, supabaseRes, supabaseMetaRes] = await Promise.all([
            fetch(API_URL),
            supabaseClient.from('incomes').select('*').eq('month', selectedMonth),
            supabaseClient.from('spendy_metadata').select('*').order('nama')
        ]);

        const freshData = await sheetsRes.json();
        if (supabaseRes.error) throw supabaseRes.error;
        if (supabaseMetaRes.error) throw supabaseMetaRes.error;

        window.expenseList = freshData;
        window.incomeList = supabaseRes.data || [];
        // TAMBAHKAN BARIS DI BAWAH INI:
        localStorage.setItem('spendy_income_cache', JSON.stringify(window.incomeList));
        window.spendyMetadata = supabaseMetaRes.data || [];
        saveExpenseCache(freshData);
        localStorage.setItem('spendy_metadata_cache', JSON.stringify(supabaseMetaRes.data || []));

        updateCategoryAndSourceDropdowns();
        renderMetadataList();
        renderAllUI();
        showGrowl('Data berhasil disinkronkan!');
    } catch (err) {
        console.error('Manual Sync Error:', err);
        showGrowl('Sinkronisasi gagal. Periksa koneksi.', 'error');
    } finally {
        hideSyncIndicator();
    }
}

function showGrowl(message, type = 'success') {
    const toast = document.getElementById('growlToast');
    const bg = document.getElementById('growlBg');
    const icon = document.getElementById('growlIcon');
    const text = document.getElementById('growlText');

    text.innerText = message;
    if (type === 'error') {
        bg.className = "bg-rose-500 text-white px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 animate-bounce";
        icon.innerText = "⚠️";
    } else {
        bg.className = "bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 border border-white/10";
        icon.innerText = "✨";
    }

    toast.classList.remove('scale-0', 'opacity-0');
    toast.classList.add('scale-100', 'opacity-100');
    setTimeout(() => {
        toast.classList.remove('scale-100', 'opacity-100');
        toast.classList.add('scale-0', 'opacity-0');
    }, 3000);
}

function switchTab(tabId) {
    activeTab = tabId;
    const tabs = ['budgeting', 'transactions', 'reports', 'settings'];

    tabs.forEach(t => {
        const section = document.getElementById(`tab-${t}`);
        if (section) section.classList.toggle('hidden', t !== tabId);
        const navBtn = document.getElementById(`nav-${t}`);
        if (navBtn) {
            if (t === tabId) {
                navBtn.classList.remove('text-slate-400');
                navBtn.classList.add('text-teal-600');
            } else {
                navBtn.classList.remove('text-teal-600');
                navBtn.classList.add('text-slate-400');
            }
        }
    });

    // Update App Bar
    const titleEl = document.getElementById('appBarTitle');
    const iconEl = document.getElementById('appBarIcon');
    if (titleEl) {
        if (tabId === 'budgeting') {
            titleEl.innerText = "Budgeting";
            if (iconEl) iconEl.innerText = "📊";
        } else if (tabId === 'transactions') {
            titleEl.innerText = "Transaksi";
            if (iconEl) iconEl.innerText = "💰";
        } else if (tabId === 'reports') {
            titleEl.innerText = "Laporan";
            if (iconEl) iconEl.innerText = "📈";
        } else if (tabId === 'settings') {
            titleEl.innerText = "Pengaturan";
            if (iconEl) iconEl.innerText = "⚙️";
        }
    }

    const monthSelector = document.getElementById('appBarMonthSelectorContainer');
    const syncBtn = document.getElementById('appBarSyncBtn');
    if (monthSelector) {
        monthSelector.classList.toggle('hidden', tabId === 'settings');
    }
    if (syncBtn) {
        syncBtn.classList.toggle('hidden', tabId === 'settings');
    }

    if (tabId === 'budgeting') {
        syncIframeMonth();
    } else if (tabId === 'reports') {
        setTimeout(() => {
            renderCharts();

            // Scroll the month selection tabs to focus on the active selectedMonth
            const monthTabsContainer = document.getElementById('reportMonthTabs');
            const activeTabEl = document.getElementById(`tab-month-${selectedMonth}`);
            if (monthTabsContainer && activeTabEl) {
                monthTabsContainer.scrollLeft = activeTabEl.offsetLeft - monthTabsContainer.offsetWidth / 2 + activeTabEl.offsetWidth / 2;
            }

            const container = document.getElementById('chartCarouselContainer');
            if (container) {
                container.scrollLeft = 0;
            }
            updateCarouselDots(0);
        }, 50);
    } else if (tabId === 'settings') {
        renderMetadataList();
    }
}

function bukaModalTambah() {
    resetForm();
    document.getElementById('formModal').classList.remove('hidden');
}
function tutupModal() {
    document.getElementById('formModal').classList.add('hidden');
}

/**
 * Recalculates totals and refreshes UI from window.expenseList + window.incomeList.
 * Used by both cache-load and fresh-sync paths.
 */
function renderAllUI() {
    const data = window.expenseList || [];

    let monthlyExpensesTotal = 0;
    data.forEach(row => {
        if (getRowMonthYear(row) === selectedMonth) {
            let num = Number(String(row.amount).replace(/[^0-9]/g, '')) || 0;
            monthlyExpensesTotal += num;
        }
    });

    let monthlyIncomeTotal = 0;
    (window.incomeList || []).forEach(inc => {
        let num = Number(inc.amount) || 0;
        monthlyIncomeTotal += num;
    });

    const monthlyBalance = monthlyIncomeTotal - monthlyExpensesTotal;

    const elExpenses = document.getElementById('totalExpenses');
    const elIncome = document.getElementById('totalIncome');
    const elBalance = document.getElementById('totalBalance');

    if (elExpenses) elExpenses.innerText = formatRupiah(monthlyExpensesTotal);
    if (elIncome) elIncome.innerText = formatRupiah(monthlyIncomeTotal);
    if (elBalance) elBalance.innerText = formatRupiah(monthlyBalance);

    filterAndRenderTransactions();
    if (activeTab === 'reports') renderCharts();
}

/**
 * OFFLINE-FIRST loadData:
 * 1. Show cached data immediately (no loading screen)
 * 2. Start background fetch with small sync indicator
 * 3. On success: save to cache and refresh UI
 *
 * @param {boolean} silent - If true, suppress error growl toasts (for post-CRUD background refreshes)
 */
async function loadData(silent = false) {
    // ── STEP 1: Show cached data immediately ──────────────────────────────
    // ── STEP 1: Show cached data immediately ──────────────────────────────
    const cached = loadExpenseCache();
    const cachedIncome = localStorage.getItem('spendy_income_cache'); // Ambil dari local

    if (cached || cachedIncome) {
        window.expenseList = cached ? cached : [];
        window.incomeList = cachedIncome ? JSON.parse(cachedIncome) : []; // Masukkan ke state
        renderAllUI();
    }

    // ── STEP 2: Background sync from Google Sheets ────────────────────────
    showSyncIndicator();
    try {
        // Fetch spreadsheet and Supabase in parallel.
        // Supabase failure is non-fatal — we handle it separately.
        const [sheetsRes, supabaseResult, supabaseMetaResult] = await Promise.all([
            fetch(API_URL),
            supabaseClient.from('incomes').select('*').eq('month', selectedMonth)
                .then(r => r)
                .catch(e => ({ data: [], error: e })),  // absorb Supabase network errors
            supabaseClient.from('spendy_metadata').select('*').order('nama')
                .then(r => r)
                .catch(e => ({ data: [], error: e }))   // absorb Supabase network errors
        ]);

        const freshData = await sheetsRes.json();

        // Supabase: log error but don't abort the whole sync
        if (supabaseResult.error) {
            console.warn('Supabase income fetch failed (non-fatal):', supabaseResult.error);
            window.incomeList = window.incomeList || [];
        } else {
            window.incomeList = supabaseResult.data || [];
            localStorage.setItem('spendy_income_cache', JSON.stringify(window.incomeList));
        }

        // Supabase Metadata
        if (supabaseMetaResult.error) {
            console.warn('Supabase metadata fetch failed (non-fatal):', supabaseMetaResult.error);
        } else if (supabaseMetaResult.data) {
            window.spendyMetadata = supabaseMetaResult.data;
            localStorage.setItem('spendy_metadata_cache', JSON.stringify(supabaseMetaResult.data));
            updateCategoryAndSourceDropdowns();
            renderMetadataList();
        }
        // TAMBAHKAN BARIS INI:
        updateBudgetAllocationDropdown();

        // Only re-render if data actually changed (avoid flicker)
        const freshStr = JSON.stringify(freshData);
        const cachedStr = JSON.stringify(window.expenseList);
        const dataChanged = freshStr !== cachedStr;

        window.expenseList = freshData;
        saveExpenseCache(freshData);

        if (dataChanged || !cached) {
            renderAllUI();
        }

    } catch (err) {
        // Only reach here if the Google Sheets fetch itself failed
        console.error("Sync Error:", err);
        if (!silent) {
            if (!cached) {
                showGrowl("Tidak ada koneksi & belum ada data tersimpan.", "error");
            }
            // If there's a cache, we already showed it — no need to alarm the user
        }
    } finally {
        hideSyncIndicator();
    }
}

function renderHomeRecent(data) {
    // Left empty for compatibility, home tab is removed
}

function filterAndRenderTransactions() {
    const feed = document.getElementById('transactionFeed');
    if (!feed) return;
    feed.innerHTML = '';

    const catFilter = document.getElementById('filterCategory').value;
    const srcFilter = document.getElementById('filterSource').value;

    const data = window.expenseList || [];
    const incomes = window.incomeList || [];

    let combinedList = [];

    // 1. Process expenses
    data.forEach((row, index) => {
        if (getRowMonthYear(row) !== selectedMonth) return;

        if (catFilter !== 'ALL' && row.category !== catFilter) return;
        if (srcFilter !== 'ALL' && row.source !== srcFilter) return;

        combinedList.push({
            type: 'expense',
            date: row.date,
            category: row.category || 'Other',
            amount: Number(String(row.amount).replace(/[^0-9]/g, '')) || 0,
            notes: row.notes,
            source: row.source || 'Cash',
            rowindex: row.rowindex,
            originalIndex: index
        });
    });

    // 2. Process incomes (only if filters are ALL)
    if (catFilter === 'ALL' && srcFilter === 'ALL') {
        incomes.forEach(inc => {
            const monthParts = selectedMonth.split('-');
            const dateStr = `01/${monthParts[1]}/${monthParts[0]}`;

            combinedList.push({
                type: 'income',
                date: dateStr,
                category: 'Income',
                amount: Number(inc.amount) || 0,
                notes: inc.name || 'Pendapatan',
                source: 'Supabase',
                id: inc.id
            });
        });
    }

    function parseDateObj(dateStr) {
        if (!dateStr) return new Date(0);
        const parts = dateStr.split('/');
        if (parts.length === 3) {
            return new Date(parts[2], parts[1] - 1, parts[0]);
        }
        return new Date(dateStr);
    }

    // Sort descending by date, then by rowindex descending (latest entry at top for same date)
    // Negative rowindex = optimistic/temp row → always goes first within its date group
    combinedList.sort((a, b) => {
        const dateA = parseDateObj(a.date);
        const dateB = parseDateObj(b.date);
        if (dateA.getTime() !== dateB.getTime()) {
            return dateB.getTime() - dateA.getTime();
        }
        // Optimistic rows (negative rowindex) sort as highest priority
        const riA = (a.rowindex < 0) ? Number.MAX_SAFE_INTEGER : (a.rowindex || 0);
        const riB = (b.rowindex < 0) ? Number.MAX_SAFE_INTEGER : (b.rowindex || 0);
        if (riA !== riB) {
            return riB - riA;
        }
        if (a.type !== b.type) {
            return a.type === 'income' ? -1 : 1;
        }
        return 0;
    });

    // Group by date
    let groups = {};
    combinedList.forEach(item => {
        if (!groups[item.date]) {
            groups[item.date] = {
                date: item.date,
                items: [],
                totalExpense: 0,
                totalIncome: 0
            };
        }
        groups[item.date].items.push(item);
        if (item.type === 'expense') {
            groups[item.date].totalExpense += item.amount;
        } else {
            groups[item.date].totalIncome += item.amount;
        }
    });

    const sortedDates = Object.keys(groups).sort((a, b) => parseDateObj(b).getTime() - parseDateObj(a).getTime());

    if (sortedDates.length === 0) {
        feed.innerHTML = '<div class="text-center py-12 text-xs font-semibold text-slate-400">Tidak ada transaksi yang cocok.</div>';
        return;
    }

    sortedDates.forEach(dateStr => {
        const group = groups[dateStr];
        const groupDiv = document.createElement('div');
        groupDiv.className = "bg-white border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm mb-4";

        const formattedDate = formatGroupDate(group.date);

        let rightSideText = '';
        if (group.totalExpense > 0 && group.totalIncome > 0) {
            rightSideText = `Expenses: ${new Intl.NumberFormat('id-ID').format(group.totalExpense)}  Income: ${new Intl.NumberFormat('id-ID').format(group.totalIncome)}`;
        } else if (group.totalExpense > 0) {
            rightSideText = `Expenses: ${new Intl.NumberFormat('id-ID').format(group.totalExpense)}`;
        } else if (group.totalIncome > 0) {
            rightSideText = `Income: ${new Intl.NumberFormat('id-ID').format(group.totalIncome)}`;
        }

        let itemsHtml = '';
        group.items.forEach(item => {
            const icon = getCategoryIcon(item.category);
            const colorClass = getCategoryColor(item.category);
            const amountStr = new Intl.NumberFormat('id-ID').format(item.amount);

            itemsHtml += `
            <div class="flex justify-between items-center py-3 border-b border-slate-100 last:border-b-0 transition active:bg-slate-50/50">
                <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                        <span class="text-base shrink-0">${icon}</span>
                        <h4 class="font-bold text-slate-800 text-sm truncate">${item.notes && item.notes !== '-' ? item.notes : item.category}</h4>
                    </div>
                    <div class="mt-1 pl-6 flex flex-col gap-0.5">
                        <span class="font-extrabold text-sm ${item.type === 'expense' ? 'text-rose-600' : 'text-teal-600'}">
                            ${item.type === 'expense' ? '-' : ''}Rp ${amountStr}
                        </span>
                        <span class="text-[10px] text-slate-400 font-bold">
                            ${item.category} • ${item.source}
                        </span>
                    </div>
                </div>
                <div class="shrink-0 ml-2">
                    ${item.type === 'expense' ? (
                    item.rowindex < 0
                        // ── Optimistic / pending row: buttons disabled ──────────────────
                        ? `<div class="flex items-center gap-1.5 text-[10px] font-bold">
                               <span class="flex items-center gap-1 text-amber-500 bg-amber-50 px-2 py-0.5 rounded-md">
                                   <span class="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                                   Menyimpan...
                               </span>
                           </div>`
                        // ── Real row: circular edit / hapus buttons matching image ──────
                        : `<div class="flex items-center gap-2">
                               <button onclick="siapkanEdit(${item.originalIndex})" class="w-8 h-8 rounded-full bg-teal-50/80 text-teal-600 border border-teal-100 flex items-center justify-center transition active:scale-90 hover:bg-teal-100" title="Edit">✏️</button>
                               <button onclick="hapusData(${item.rowindex})" class="w-8 h-8 rounded-full bg-rose-50/80 text-rose-500 border border-rose-100 flex items-center justify-center transition active:scale-90 hover:bg-rose-100" title="Hapus">🗑️</button>
                           </div>`
                ) : ''}
                </div>
            </div>
            `;
        });

        groupDiv.innerHTML = `
            <div class="bg-slate-50 border-b border-slate-200/60 px-4 py-2.5 flex justify-between items-center text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <span>${formattedDate}</span>
                <span class="normal-case font-bold text-slate-400/90">${rightSideText}</span>
            </div>
            <div class="px-4">
                ${itemsHtml}
            </div>
        `;
        feed.appendChild(groupDiv);
    });

    const spacer = document.createElement('div');
    spacer.className = "h-28 shrink-0";
    feed.appendChild(spacer);
}

function getCategoryBadgeStyle(category) {
    const clean = String(category).toLowerCase();
    if (clean === 'food' || clean === 'makanan' || clean === 'minuman') {
        return "bg-orange-50 text-orange-600 border-orange-100";
    }
    if (clean === 'transport' || clean === 'transportasi' || clean === 'perjalanan') {
        return "bg-blue-50 text-blue-600 border-blue-100";
    }
    if (clean === 'other' || clean === 'lainnya') {
        return "bg-purple-50 text-purple-600 border-purple-100";
    }
    const colors = [
        "bg-emerald-50 text-emerald-600 border-emerald-100",
        "bg-pink-50 text-pink-600 border-pink-100",
        "bg-amber-50 text-amber-600 border-amber-100",
        "bg-cyan-50 text-cyan-600 border-cyan-100",
        "bg-indigo-50 text-indigo-600 border-indigo-100",
        "bg-rose-50 text-rose-600 border-rose-100"
    ];
    let hash = 0;
    for (let i = 0; i < clean.length; i++) {
        hash += clean.charCodeAt(i);
    }
    return colors[hash % colors.length];
}

function createMobileCard(row, index) {
    let displayAmount = row.amount || '0';
    if (!String(displayAmount).includes('Rp')) displayAmount = formatRupiah(displayAmount);

    let badgeStyle = getCategoryBadgeStyle(row.category || 'Other');

    const div = document.createElement('div');
    div.className = "bg-white border border-slate-200/60 rounded-[1.25rem] p-4 shadow-sm flex justify-between items-center transition active:bg-slate-50 active:scale-[0.98]";
    div.innerHTML = `
        <div class="space-y-1.5 min-w-0 flex-1 pr-3">
            <div class="flex items-center gap-2">
                <span class="text-[10px] font-bold px-2.5 py-0.5 rounded-lg border ${badgeStyle}">${row.category || 'Other'}</span>
                <span class="text-[10px] text-slate-400 font-bold">${row.date || ''}</span>
            </div>
            <h4 class="font-bold text-slate-800 text-sm truncate">${row.notes && row.notes !== '-' ? row.notes : 'Tanpa Catatan'}</h4>
            <p class="text-[11px] text-slate-400 font-semibold flex items-center gap-1.5">
                <span class="w-1.5 h-1.5 rounded-full bg-slate-300"></span> ${row.source || 'Cash'}
            </p>
        </div>
        <div class="text-right flex flex-col items-end space-y-2 shrink-0">
            <span class="font-black text-slate-900 text-[15px]">${displayAmount}</span>
            <div class="flex items-center gap-3 text-[11px] font-bold">
                <button onclick="siapkanEdit(${index})" class="text-teal-600 hover:text-teal-700 bg-teal-50 px-2.5 py-1 rounded-md">Edit</button>
                <button onclick="hapusData(${row.rowindex})" class="text-rose-500 hover:text-rose-600 bg-rose-50 px-2.5 py-1 rounded-md">Hapus</button>
            </div>
        </div>
    `;
    return div;
}

function renderCharts() {
    const data = window.expenseList || [];
    const categories = (window.spendyMetadata || []).length > 0
        ? (window.spendyMetadata || []).filter(m => m.jenis === 'Category').map(m => m.nama)
        : ['Food', 'Transport', 'Other'];

    // 1. Target dates details
    const parts = selectedMonth.split('-');
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]);
    const daysInMonth = new Date(year, month, 0).getDate();

    const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // Initialize maps
    let catMap = {};
    categories.forEach(cat => { catMap[cat] = 0; });

    let dateMap = {};
    let dateLabels = [];
    for (let d = 1; d <= daysInMonth; d++) {
        const label = `${d} ${monthsShort[month - 1]}`;
        dateMap[label] = 0;
        dateLabels.push(label);
    }

    const sources = (window.spendyMetadata || []).length > 0
        ? (window.spendyMetadata || []).filter(m => m.jenis === 'Source').map(m => m.nama)
        : ['Cash', 'E-Wallet', 'Bank Transfer'];
    let srcMap = {};
    sources.forEach(src => { srcMap[src] = 0; });
    let expenseItems = [];
    let totalExpenses = 0;

    // 2. Aggregate data for selectedMonth
    data.forEach(row => {
        if (getRowMonthYear(row) !== selectedMonth) return;

        let num = Number(String(row.amount).replace(/[^0-9]/g, '')) || 0;
        totalExpenses += num;

        // Category aggregation
        if (catMap[row.category] !== undefined) {
            catMap[row.category] += num;
        } else {
            const fallback = categories.includes('Other') ? 'Other' : (categories[0] || 'Other');
            if (catMap[fallback] !== undefined) {
                catMap[fallback] += num;
            } else {
                catMap[row.category] = num;
            }
        }

        // Date aggregation
        const shortDate = getShortGroupDate(row.date);
        if (dateMap[shortDate] !== undefined) {
            dateMap[shortDate] += num;
        }

        // Source aggregation
        if (srcMap[row.source] !== undefined) {
            srcMap[row.source] += num;
        } else {
            const fallbackSrc = sources.includes('Cash') ? 'Cash' : (sources[0] || 'Cash');
            if (srcMap[fallbackSrc] !== undefined) {
                srcMap[fallbackSrc] += num;
            } else {
                srcMap[row.source] = num;
            }
        }

        expenseItems.push({ notes: row.notes, category: row.category, amount: num, date: row.date });
    });

    // 3. Render Rincian Pengeluaran (Progress List)
    const progressContainer = document.getElementById('categoryProgressList');
    if (progressContainer) {
        progressContainer.innerHTML = '';
        const sortedCats = Object.keys(catMap).sort((a, b) => catMap[b] - catMap[a]);
        let progressCount = 0;

        sortedCats.forEach(cat => {
            const amt = catMap[cat];
            if (amt === 0) return;
            progressCount++;

            const pct = totalExpenses > 0 ? ((amt / totalExpenses) * 100).toFixed(2) : 0;
            const icon = getCategoryIcon(cat);
            const colorClass = getCategoryColor(cat);
            const barColor = getCategoryBarColor(cat);

            progressContainer.innerHTML += `
            <div class="space-y-1.5">
                <div class="flex justify-between items-center text-xs font-bold text-slate-700">
                    <div class="flex items-center gap-2">
                        <span class="w-7 h-7 rounded-full flex items-center justify-center text-sm ${colorClass}">${icon}</span>
                        <span>${cat} <span class="text-[10px] text-slate-400 font-medium ml-1">${pct}%</span></span>
                    </div>
                    <span class="text-slate-800">${new Intl.NumberFormat('id-ID').format(amt)}</span>
                </div>
                <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div class="h-full rounded-full ${barColor}" style="width: ${pct}%"></div>
                </div>
            </div>
            `;
        });
        if (progressCount === 0) {
            progressContainer.innerHTML = '<div class="text-center py-4 text-xs font-bold text-slate-400">Belum ada pengeluaran.</div>';
        }
    }

    // 4. Render Top Expenses List (Aliran Dana Terbesar)
    expenseItems.sort((a, b) => b.amount - a.amount);
    const topListContainer = document.getElementById('reportTopExpenses');
    if (topListContainer) {
        topListContainer.innerHTML = '';
        let topLimit = Math.min(expenseItems.length, 3);
        for (let i = 0; i < topLimit; i++) {
            const item = expenseItems[i];
            const div = document.createElement('div');
            div.className = "flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100";
            div.innerHTML = `
                <div class="min-w-0 flex-1 pr-2">
                    <p class="text-xs font-bold text-slate-800 truncate">${item.notes && item.notes !== '-' ? item.notes : 'Tanpa catatan'}</p>
                    <p class="text-[10px] font-semibold text-slate-400 mt-0.5">${item.category} • ${item.date}</p>
                </div>
                <span class="font-bold text-rose-600 text-xs shrink-0">${formatRupiah(item.amount)}</span>
            `;
            topListContainer.appendChild(div);
        }
        if (expenseItems.length === 0) {
            topListContainer.innerHTML = '<div class="text-center py-2 text-xs font-semibold text-slate-400">Belum ada data.</div>';
        }
    }

    // 5. CHART 1: Category Doughnut Chart
    const baseColors = ['#22c55e', '#f97316', '#3b82f6', '#ec4899', '#a855f7', '#0ea5e9', '#f59e0b', '#10b981', '#6366f1'];

    // Update center total text
    const elCenterTotal = document.getElementById('chartCenterTotal');
    if (elCenterTotal) {
        elCenterTotal.innerText = new Intl.NumberFormat('id-ID').format(totalExpenses);
    }

    let catLabels = [];
    let catValues = [];
    let catLegendItems = [];
    let catIndex = 0;

    Object.keys(catMap).forEach(cat => {
        const amt = catMap[cat];
        if (amt > 0) {
            catLabels.push(cat);
            catValues.push(amt);
            const pct = totalExpenses > 0 ? ((amt / totalExpenses) * 100).toFixed(2) : 0;
            catLegendItems.push({
                label: cat,
                color: baseColors[catIndex % baseColors.length],
                rightValue: `${pct}%`
            });
            catIndex++;
        }
    });

    const catLegendContainer = document.getElementById('categoryChartLegend');
    if (catLegendContainer) {
        catLegendContainer.innerHTML = '';
        catLegendItems.forEach(item => {
            catLegendContainer.innerHTML += `
            <div class="flex items-center justify-between py-0.5">
                <div class="flex items-center gap-1.5 min-w-0">
                    <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: ${item.color}"></span>
                    <span class="truncate text-slate-700">${item.label}</span>
                </div>
                <span class="text-slate-500 font-extrabold text-right shrink-0">${item.rightValue}</span>
            </div>
            `;
        });
        if (catLegendItems.length === 0) {
            catLegendContainer.innerHTML = '<div class="text-center py-4 text-xs text-slate-400">Tidak ada data.</div>';
        }
    }

    if (catChartInstance) catChartInstance.destroy();
    const catCtx = document.getElementById('categoryChartCtx').getContext('2d');
    catChartInstance = new Chart(catCtx, {
        type: 'doughnut',
        data: {
            labels: catLabels,
            datasets: [{
                data: catValues,
                backgroundColor: catLegendItems.map(item => item.color),
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '72%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return ` Rp ${new Intl.NumberFormat('id-ID').format(context.raw)}`;
                        }
                    }
                }
            }
        }
    });

    // 6. CHART 2: Trend Daily Line Chart
    const averageExpense = totalExpenses / daysInMonth;
    const elTrendTotal = document.getElementById('trendTotalText');
    const elTrendAvg = document.getElementById('trendAvgText');
    if (elTrendTotal) elTrendTotal.innerText = new Intl.NumberFormat('id-ID').format(totalExpenses);
    if (elTrendAvg) elTrendAvg.innerText = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(averageExpense);

    const trendCtx = document.getElementById('trendChartCtx').getContext('2d');
    if (trendChartInstance) trendChartInstance.destroy();

    const pointColors = dateLabels.map((lbl, idx) => baseColors[idx % baseColors.length]);
    const trendValues = dateLabels.map(lbl => dateMap[lbl]);

    trendChartInstance = new Chart(trendCtx, {
        type: 'line',
        data: {
            labels: dateLabels,
            datasets: [{
                label: 'Trend',
                data: trendValues,
                borderColor: '#14b8a6',
                backgroundColor: 'rgba(20, 184, 166, 0.05)',
                fill: true,
                tension: 0.35,
                borderWidth: 2,
                pointBackgroundColor: pointColors,
                pointBorderColor: '#ffffff',
                pointBorderWidth: 1.5,
                pointRadius: 3.5,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { display: false },
                    ticks: {
                        font: { size: 9, family: "'Plus Jakarta Sans', sans-serif" },
                        maxTicksLimit: 3,
                        callback: function (val) {
                            if (val >= 1000) return (val / 1000) + 'k';
                            return val;
                        }
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: {
                        font: { size: 9, family: "'Plus Jakarta Sans', sans-serif" },
                        autoSkip: false,
                        callback: function (val, index) {
                            const lbl = dateLabels[index];
                            const dayNum = parseInt(lbl.split(' ')[0]);
                            if (dayNum === 1 || dayNum === 8 || dayNum === 15 || dayNum === 22 || dayNum === 29 || dayNum === daysInMonth) {
                                return lbl;
                            }
                            return '';
                        }
                    }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return ` Rp ${new Intl.NumberFormat('id-ID').format(context.raw)}`;
                        }
                    }
                }
            }
        }
    });

    // 7. CHART 3: Source Doughnut Chart
    const elSourceTotal = document.getElementById('sourceCenterTotal');
    if (elSourceTotal) {
        elSourceTotal.innerText = new Intl.NumberFormat('id-ID').format(totalExpenses);
    }

    let srcLabels = [];
    let srcValues = [];
    let srcLegendItems = [];
    let srcIndex = 0;

    Object.keys(srcMap).forEach(src => {
        const amt = srcMap[src];
        if (amt > 0) {
            srcLabels.push(src);
            srcValues.push(amt);
            srcLegendItems.push({
                label: src,
                color: baseColors[srcIndex % baseColors.length],
                rightValue: new Intl.NumberFormat('id-ID').format(amt)
            });
            srcIndex++;
        }
    });

    const srcLegendContainer = document.getElementById('sourceChartLegend');
    if (srcLegendContainer) {
        srcLegendContainer.innerHTML = '';
        srcLegendItems.forEach(item => {
            srcLegendContainer.innerHTML += `
            <div class="flex items-center justify-between py-0.5">
                <div class="flex items-center gap-1.5 min-w-0">
                    <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: ${item.color}"></span>
                    <span class="truncate text-slate-700">${item.label}</span>
                </div>
                <span class="text-slate-500 font-extrabold text-right shrink-0">${item.rightValue}</span>
            </div>
            `;
        });
        if (srcLegendItems.length === 0) {
            srcLegendContainer.innerHTML = '<div class="text-center py-4 text-xs text-slate-400">Tidak ada data.</div>';
        }
    }

    if (sourceChartInstance) sourceChartInstance.destroy();
    const srcCtx = document.getElementById('sourceChartCtx').getContext('2d');
    sourceChartInstance = new Chart(srcCtx, {
        type: 'doughnut',
        data: {
            labels: srcLabels,
            datasets: [{
                data: srcValues,
                backgroundColor: srcLegendItems.map(item => item.color),
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '72%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return ` Rp ${new Intl.NumberFormat('id-ID').format(context.raw)}`;
                        }
                    }
                }
            }
        }
    });
}

// ==================== SUBMIT FORM HANDLER — OPTIMISTIC UI ====================
document.getElementById('expenseForm').addEventListener('submit', function (e) {
    e.preventDefault();
    tutupModal();

    const editRowIndex = document.getElementById('editRowIndex').value;
    const actionType = editRowIndex ? 'update' : 'create';
    const rawAmount = document.getElementById('amount').value.replace(/[^0-9]/g, '');
    const dateValue = document.getElementById('date').value;           // YYYY-MM-DD
    const dateForSheets = formatDateForSheets(dateValue);              // DD/MM/YYYY
    const categoryValue = document.getElementById('category').value;
    const sourceValue = document.getElementById('source').value;
    const notesValue = document.getElementById('notes').value || '-';
    const amountValue = parseInt(rawAmount) || 0;
    // AMBIL VALUE MAPPING
    const expensesIdValue = document.getElementById('expenses_id').value;

    // ── OPTIMISTIC UPDATE: mutate local list immediately ─────────────────
    if (actionType === 'create') {
        // Build a temporary row (temp rowindex < 0 so it can't collide with real ones)
        const tempRow = {
            date: dateForSheets,
            category: categoryValue,
            amount: amountValue,
            source: sourceValue,
            notes: notesValue,
            rowindex: -Date.now()   // unique negative temp ID
        };
        window.expenseList = [tempRow, ...(window.expenseList || [])];
    } else {
        // Patch existing row in-place
        const targetIdx = (window.expenseList || []).findIndex(
            r => String(r.rowindex) === String(editRowIndex)
        );
        if (targetIdx !== -1) {
            window.expenseList[targetIdx] = {
                ...window.expenseList[targetIdx],
                date: dateForSheets,
                category: categoryValue,
                amount: amountValue,
                source: sourceValue,
                notes: notesValue
            };
        }
    }
    saveExpenseCache(window.expenseList);
    renderAllUI();
    resetForm();
    showGrowl(actionType === 'update' ? 'Transaksi diperbarui!' : 'Transaksi disimpan!');

    // ── BACKGROUND SYNC to Google Sheets ─────────────────────────────────
    const payload = {
        action: actionType,
        rowindex: editRowIndex ? parseInt(editRowIndex) : null,
        date: dateForSheets,
        category: categoryValue,
        amount: amountValue,
        source: sourceValue,
        notes: notesValue,
        // TAMBAHKAN DUA BARIS INI:
        expenses_id: expensesIdValue,
        mapping_by: expensesIdValue ? 'user' : ''
    };

    showSyncIndicator();
    fetch(API_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
    })
        .then(() => {
            // Re-fetch after 1.5s to get real rowindex from sheets
            setTimeout(() => loadData(true), 1500);
        })
        .catch(error => {
            console.error('Fetch API Error:', error);
            showGrowl('Sinkronisasi cloud gagal. Data tersimpan lokal.', 'error');
            hideSyncIndicator();
        });
});

function siapkanEdit(index) {
    const row = window.expenseList[index];
    if (!row) return;

    const parts = row.date.split('/');
    const dateForInput = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : today;
    const cleanAmount = String(row.amount).replace(/[^0-9]/g, '');

    document.getElementById('editRowIndex').value = row.rowindex;
    document.getElementById('date').value = dateForInput;
    document.getElementById('category').value = row.category;

    // TAMBAHKAN BARIS INI:
    const expensesDropdown = document.getElementById('expenses_id');
    if (expensesDropdown) expensesDropdown.value = row.expenses_id || '';

    const amountInput = document.getElementById('amount');
    amountInput.value = cleanAmount;
    formatAmountInput(amountInput);

    const sourceSelect = document.getElementById('source');
    if (sourceSelect) {
        sourceSelect.value = row.source || 'Cash';
    }
    document.getElementById('notes').value = (row.notes === '-' || row.notes === 'undefined') ? '' : row.notes;

    document.getElementById('modalTitle').innerText = "Ubah Catatan Transaksi";
    document.getElementById('submitBtn').innerText = "Update Data";
    document.getElementById('submitBtn').className = "w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-4 rounded-xl shadow-lg transition duration-200 text-base active:scale-[0.98]";

    document.getElementById('formModal').classList.remove('hidden');
}

function resetForm() {
    document.getElementById('editRowIndex').value = '';
    document.getElementById('date').value = today;
    document.getElementById('amount').value = '';
    document.getElementById('notes').value = '';

    const expensesDropdown = document.getElementById('expenses_id');
    if (expensesDropdown) expensesDropdown.value = '';

    // --- LOGIKA DEFAULT KATEGORI TERBANYAK ---
    const mostFrequentCat = getMostFrequentItem('category');
    const catSelect = document.getElementById('category');
    if (catSelect) {
        if (mostFrequentCat && [...catSelect.options].some(opt => opt.value === mostFrequentCat)) {
            catSelect.value = mostFrequentCat;
        } else if (catSelect.options.length > 0) {
            catSelect.selectedIndex = 0; // Fallback ke item pertama jika data kosong
        }
    }

    // --- LOGIKA DEFAULT SUMBER DANA TERBANYAK ---
    const mostFrequentSrc = getMostFrequentItem('source');
    const sourceSelect = document.getElementById('source');
    if (sourceSelect) {
        if (mostFrequentSrc && [...sourceSelect.options].some(opt => opt.value === mostFrequentSrc)) {
            sourceSelect.value = mostFrequentSrc;
        } else if ([...sourceSelect.options].some(opt => opt.value === 'Cash')) {
            sourceSelect.value = 'Cash'; // Fallback ke Cash
        } else if (sourceSelect.options.length > 0) {
            sourceSelect.selectedIndex = 0; // Fallback ke item pertama
        }
    }

    document.getElementById('modalTitle').innerText = "Catat Transaksi";
    document.getElementById('submitBtn').innerText = "Simpan Transaksi";
    document.getElementById('submitBtn').className = "w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-4 px-4 rounded-xl shadow-lg transition duration-200 text-base active:scale-[0.98]";
}

function getMostFrequentItem(type) {
    const data = window.expenseList || [];
    if (data.length === 0) return null;

    let counts = {};
    data.forEach(row => {
        let val = type === 'category' ? row.category : row.source;
        // Abaikan data kosong atau strip
        if (val && val !== '-') {
            counts[val] = (counts[val] || 0) + 1;
        }
    });

    let maxCount = 0;
    let mostFreq = null;
    for (let key in counts) {
        if (counts[key] > maxCount) {
            maxCount = counts[key];
            mostFreq = key;
        }
    }
    return mostFreq;
}

// ── Delete modal state ────────────────────────────────────────────────────────
let _pendingDeleteRowIndex = null;

function hapusData(rowIndex) {
    _pendingDeleteRowIndex = rowIndex;
    document.getElementById('deleteConfirmModal').classList.remove('hidden');
}

function tutupDeleteModal() {
    _pendingDeleteRowIndex = null;
    document.getElementById('deleteConfirmModal').classList.add('hidden');
}

function konfirmasiHapus() {
    const rowIndex = _pendingDeleteRowIndex;
    tutupDeleteModal();
    if (rowIndex == null) return;

    // ── OPTIMISTIC: remove from local list immediately ────────────────────
    window.expenseList = (window.expenseList || []).filter(
        r => String(r.rowindex) !== String(rowIndex)
    );
    saveExpenseCache(window.expenseList);
    renderAllUI();
    showGrowl('Transaksi dihapus.');

    // ── BACKGROUND SYNC: delete from sheets ──────────────────────────────
    showSyncIndicator();
    fetch(API_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'delete', rowindex: rowIndex })
    })
        .then(() => {
            setTimeout(() => loadData(true), 1500);
        })
        .catch((e) => {
            console.error('Delete Error:', e);
            showGrowl('Hapus cloud gagal. Coba sync ulang.', 'error');
            hideSyncIndicator();
        });
}

function exportToCSV() {
    const data = window.expenseList || [];
    if (data.length === 0) return showGrowl("Tidak ada data untuk diekspor", "error");

    let csvContent = "data:text/csv;charset=utf-8,Tanggal,Kategori,Jumlah,Sumber,Catatan\n";
    data.forEach(row => {
        let cleanAmt = String(row.amount).replace(/[^0-9]/g, '');
        csvContent += `"${row.date}","${row.category}","${cleanAmt}","${row.source}","${row.notes}"\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Rekap_Spendy_${new Date().getFullYear()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showGrowl("File CSV terunduh!");
}

function formatDateForSheets(inputDate) {
    if (!inputDate) return '';
    const parts = inputDate.split('-');
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// ==================== FIX: AUTO LOAD ON START ====================
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById('date').value = today;
    populateMonthYearPickers();
    loadCachedMetadata();
    updateCategoryAndSourceDropdowns();
    loadData();

    // Setup carousel scroll snap swipe listener
    const carousel = document.getElementById('chartCarouselContainer');
    if (carousel) {
        carousel.addEventListener('scroll', () => {
            const width = carousel.offsetWidth;
            if (width > 0) {
                const scrollLeft = carousel.scrollLeft;
                const index = Math.round(scrollLeft / width);
                updateCarouselDots(index);
            }
        });

        // Enable desktop swipe drag behavior
        enableMouseDragScroll('chartCarouselContainer');
    }

    // Enable desktop drag behavior for the horizontal month selection tabs
    enableSimpleMouseDragScroll('reportMonthTabs');

    // Handle deep link via URL hash (e.g. index2.html#reports)
    const hashTab = window.location.hash.replace('#', '');
    const validTabs = ['budgeting', 'transactions', 'reports', 'settings'];
    if (hashTab && validTabs.includes(hashTab)) {
        switchTab(hashTab);
    }
});
