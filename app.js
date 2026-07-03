const API_URL = "https://script.google.com/macros/s/AKfycbzSF2zAHlG6MiOl5EhHTl_b9eHKS-UK8XO7imELEpyILgQIrLR5-o6QequuUgktPCaevg/exec";
const today = new Date().toISOString().split('T')[0];
window.expenseList = [];
let activeTab = 'transactions';
let catChartInstance = null;
let srcChartInstance = null;

function formatRupiah(value) {
    let num = Number(String(value).replace(/[^0-9]/g, '')) || 0;
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num);
}

// ==================== NEW HELPERS: CATEGORY LOCAL STORAGE CRUD ====================
function getCategories() {
    let stored = localStorage.getItem('spendy_categories');
    if (!stored) {
        stored = JSON.stringify(['Food', 'Transport', 'Other']);
        localStorage.setItem('spendy_categories', stored);
    }
    return JSON.parse(stored);
}

function renderCategoryList() {
    const list = getCategories();
    const container = document.getElementById('categoryListContainer');
    if (container) {
        container.innerHTML = '';
        list.forEach((cat, index) => {
            const div = document.createElement('div');
            div.className = "flex justify-between items-center py-2.5";
            div.innerHTML = `
                <span class="text-xs font-semibold text-slate-700">${cat}</span>
                <button onclick="deleteCategory(${index})" class="text-[10px] font-bold text-rose-500 bg-rose-50 hover:bg-rose-100 px-2.5 py-1 rounded-md transition active:scale-95">Hapus</button>
            `;
            container.appendChild(div);
        });
    }
    updateCategoryDropdowns();
}

function addCategory() {
    const input = document.getElementById('newCategoryInput');
    const val = input.value.trim();
    if (!val) return showGrowl("Nama kategori tidak boleh kosong", "error");

    let list = getCategories();
    if (list.map(c => c.toLowerCase()).includes(val.toLowerCase())) {
        return showGrowl("Kategori sudah ada", "error");
    }
    list.push(val);
    localStorage.setItem('spendy_categories', JSON.stringify(list));
    input.value = '';
    renderCategoryList();
    showGrowl("Kategori ditambahkan");
}

function deleteCategory(index) {
    let list = getCategories();
    const catToDelete = list[index];
    if (confirm(`Hapus kategori "${catToDelete}"?`)) {
        list.splice(index, 1);
        localStorage.setItem('spendy_categories', JSON.stringify(list));
        renderCategoryList();
        showGrowl("Kategori dihapus");
    }
}

function updateCategoryDropdowns() {
    const list = getCategories();

    // 1. Update filterCategory select in tab-transactions
    const filterCat = document.getElementById('filterCategory');
    if (filterCat) {
        const prevVal = filterCat.value;
        filterCat.innerHTML = '<option value="ALL">Semua Kategori</option>';
        list.forEach(cat => {
            filterCat.innerHTML += `<option value="${cat}">${cat}</option>`;
        });
        filterCat.value = list.includes(prevVal) ? prevVal : 'ALL';
    }

    // 2. Update category select in formModal
    const formCat = document.getElementById('category');
    if (formCat) {
        const prevVal = formCat.value;
        formCat.innerHTML = '';
        list.forEach(cat => {
            formCat.innerHTML += `<option value="${cat}">${cat}</option>`;
        });
        if (list.includes(prevVal)) {
            formCat.value = prevVal;
        } else if (list.length > 0) {
            formCat.value = list[0];
        }
    }
}

// ==================== NEW HELPERS: RADIO DANA ====================
function selectSource(val) {
    const sourceInput = document.getElementById('source');
    if (sourceInput) sourceInput.value = val;
    const sources = ['Cash', 'E-Wallet', 'Bank Transfer'];
    sources.forEach(src => {
        const btn = document.getElementById(`btn-source-${src}`);
        if (btn) {
            if (src === val) {
                btn.className = "py-3 px-2 rounded-xl border-2 font-bold transition text-xs text-center select-none bg-teal-50 border-teal-500 text-teal-700";
            } else {
                btn.className = "py-3 px-2 rounded-xl border bg-slate-50 font-semibold transition text-xs text-center select-none text-slate-700 hover:bg-slate-100";
            }
        }
    });
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

function setLoader(show) {
    document.getElementById('loadingBackdrop').classList.toggle('hidden', !show);
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

    if (tabId === 'reports') renderCharts();
}

function bukaModalTambah() {
    resetForm();
    document.getElementById('formModal').classList.remove('hidden');
}
function tutupModal() {
    document.getElementById('formModal').classList.add('hidden');
}

function loadData() {
    setLoader(true);
    fetch(API_URL)
        .then(res => res.json())
        .then(data => {
            window.expenseList = data;

            let totalAmount = 0;
            data.forEach(row => {
                let num = Number(String(row.amount).replace(/[^0-9]/g, '')) || 0;
                totalAmount += num;
            });

            // Null-safe updates (home elements removed, but keep for compatibility)
            const elTotal = document.getElementById('homeTotalAmount');
            const elCount = document.getElementById('homeTotalCount');
            const elAvg   = document.getElementById('homeDailyAvg');
            if (elTotal) elTotal.innerText = formatRupiah(totalAmount);
            if (elCount) elCount.innerText = `${data.length} Data`;
            if (elAvg)   elAvg.innerText   = formatRupiah(data.length > 0 ? Math.round(totalAmount / 30) : 0);

            filterAndRenderTransactions();
            if (activeTab === 'reports') renderCharts();
        })
        .catch(err => {
            console.error("Load Data Error:", err);
            showGrowl("Koneksi cloud terputus.", "error");
        })
        .finally(() => setLoader(false));
}

function renderHomeRecent(data) {
    const feed = document.getElementById('homeRecentFeed');
    feed.innerHTML = '';
    if (data.length === 0) {
        feed.innerHTML = '<div class="text-center py-4 text-xs font-semibold text-slate-400 bg-slate-100/50 rounded-xl border border-slate-100">Belum ada aktivitas.</div>';
        return;
    }
    let limit = Math.min(data.length, 3);
    for (let i = data.length - 1; i >= data.length - limit; i--) {
        feed.appendChild(createMobileCard(data[i], i));
    }
}

function filterAndRenderTransactions() {
    const feed = document.getElementById('transactionFeed');
    const catFilter = document.getElementById('filterCategory').value;
    const srcFilter = document.getElementById('filterSource').value;

    feed.innerHTML = '';
    const data = window.expenseList || [];
    let filteredCount = 0;

    for (let i = data.length - 1; i >= 0; i--) {
        const row = data[i];
        if (catFilter !== 'ALL' && row.category !== catFilter) continue;
        if (srcFilter !== 'ALL' && row.source !== srcFilter) continue;
        feed.appendChild(createMobileCard(row, i));
        filteredCount++;
    }

    if (filteredCount === 0) {
        feed.innerHTML = '<div class="text-center py-12 text-xs font-semibold text-slate-400">Tidak ada transaksi yang cocok.</div>';
    } else {
        const spacer = document.createElement('div');
        spacer.className = "h-28 shrink-0";
        feed.appendChild(spacer);
    }
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
    const categories = getCategories();
    let catMap = {};
    categories.forEach(cat => { catMap[cat] = 0; });
    let srcMap = { 'Cash': 0, 'E-Wallet': 0, 'Bank Transfer': 0 };
    let expenseItems = [];

    data.forEach(row => {
        let num = Number(String(row.amount).replace(/[^0-9]/g, '')) || 0;

        // Group dynamic categories, fallback to first category or 'Other' if deleted
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

        if (srcMap[row.source] !== undefined) srcMap[row.source] += num;
        else srcMap['Cash'] += num;
        expenseItems.push({ notes: row.notes, category: row.category, amount: num, date: row.date });
    });

    expenseItems.sort((a, b) => b.amount - a.amount);
    const topListContainer = document.getElementById('reportTopExpenses');
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
    if (expenseItems.length === 0) topListContainer.innerHTML = '<div class="text-center py-2 text-xs font-semibold text-slate-400">Belum ada data.</div>';

    if (catChartInstance) catChartInstance.destroy();
    if (srcChartInstance) srcChartInstance.destroy();

    // Dynamic pie chart colors
    const baseColors = ['#f97316', '#3b82f6', '#a855f7', '#10b981', '#ec4899', '#f59e0b', '#06b6d4', '#6366f1'];
    const chartColors = Object.keys(catMap).map((_, i) => baseColors[i % baseColors.length]);

    const catCtx = document.getElementById('categoryChartCtx').getContext('2d');
    catChartInstance = new Chart(catCtx, {
        type: 'pie',
        data: {
            labels: Object.keys(catMap),
            datasets: [{ data: Object.values(catMap), backgroundColor: chartColors, borderWidth: 0 }]
        },
        options: { plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11, family: "'Plus Jakarta Sans', sans-serif", weight: 'bold' } } } } }
    });

    const srcCtx = document.getElementById('sourceChartCtx').getContext('2d');
    srcChartInstance = new Chart(srcCtx, {
        type: 'bar',
        data: {
            labels: Object.keys(srcMap),
            datasets: [{ label: 'Total Rupiah', data: Object.values(srcMap), backgroundColor: '#0f766e', borderRadius: 8 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, grid: { display: false, drawBorder: false }, ticks: { font: { family: "'Plus Jakarta Sans', sans-serif" } } },
                x: { grid: { display: false, drawBorder: false }, ticks: { font: { family: "'Plus Jakarta Sans', sans-serif", weight: 'bold' } } }
            },
            plugins: { legend: { display: false } }
        }
    });
}

// ==================== FIX: SUBMIT FORM HANDLER ====================
document.getElementById('expenseForm').addEventListener('submit', function (e) {
    e.preventDefault();
    tutupModal();
    setLoader(true);

    const editRowIndex = document.getElementById('editRowIndex').value;
    const actionType = editRowIndex ? 'update' : 'create';

    // Clean dots from amount string before parsing
    const rawAmount = document.getElementById('amount').value.replace(/[^0-9]/g, '');

    const payload = {
        action: actionType,
        rowindex: editRowIndex ? parseInt(editRowIndex) : null,
        date: formatDateForSheets(document.getElementById('date').value),
        category: document.getElementById('category').value,
        amount: parseInt(rawAmount) || 0,
        source: document.getElementById('source').value,
        notes: document.getElementById('notes').value
    };

    // FIX: Using text/plain ensures no CORS preflight is sent, avoiding silent block in some browsers
    fetch(API_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
    })
        .then(res => {
            showGrowl(actionType === 'update' ? "Data cloud diperbarui!" : "Transaksi cloud disimpan!");
            resetForm();
            setTimeout(loadData, 1200);
        })
        .catch(error => {
            console.error("Fetch API Error: ", error);
            showGrowl("Sinkronisasi gagal. Periksa jaringan Anda.", "error");
            setLoader(false);
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

    const amountInput = document.getElementById('amount');
    amountInput.value = cleanAmount;
    formatAmountInput(amountInput);

    selectSource(row.source || 'Cash');
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
    selectSource('Cash');
    document.getElementById('modalTitle').innerText = "Catat Transaksi";
    document.getElementById('submitBtn').innerText = "Simpan Transaksi";
    document.getElementById('submitBtn').className = "w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-4 px-4 rounded-xl shadow-lg transition duration-200 text-base active:scale-[0.98]";
}

function hapusData(rowIndex) {
    if (confirm("Hapus baris transaksi ini permanen dari cloud?")) {
        setLoader(true);
        fetch(API_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'delete', rowindex: rowIndex })
        })
            .then(() => {
                showGrowl("Transaksi terhapus dari cloud.");
                setTimeout(loadData, 1200);
            })
            .catch((e) => {
                console.error("Delete Error:", e);
                showGrowl("Gagal menghapus.", "error");
                setLoader(false);
            });
    }
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
    renderCategoryList();
    selectSource('Cash');
    loadData();

    // Handle deep link via URL hash (e.g. index2.html#reports)
    const hashTab = window.location.hash.replace('#', '');
    const validTabs = ['budgeting', 'transactions', 'reports', 'settings'];
    if (hashTab && validTabs.includes(hashTab)) {
        switchTab(hashTab);
    }
});
