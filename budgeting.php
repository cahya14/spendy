<?php
// --- CONFIGURATION DATABASE MYSQL ---
$host = 'localhost';
$db   = 'lumiodig_budgeting';
$user = 'lumiodig_budgeting';
$pass = 'fgrAvKYBt2aVXMBRZJPB';
$charset = 'utf8mb4';

$dsn = "mysql:host=$host;dbname=$db;charset=$charset";
$options = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
];

try {
     $pdo = new PDO($dsn, $user, $pass, $options);
} catch (\PDOException $e) {
     if (isset($_GET['action'])) {
         header('Content-Type: application/json');
         echo json_encode(['status' => 'error', 'message' => 'Koneksi database gagal: ' . $e->getMessage()]);
         exit;
     }
     die("Koneksi database gagal: " . $e->getMessage());
}

// --- ROUTER API UNTUK AJAX REQUESTS ---
if (isset($_GET['action'])) {
    header('Content-Type: application/json');
    $action = $_GET['action'];
    $input = json_decode(file_get_contents('php://input'), true);
    
    try {
        if ($action === 'get_data') {
            $month = $_GET['month'] ?? date('Y-m');
            
            // Mengambil data pendapatan
            $stmt = $pdo->prepare("SELECT id, name, amount AS amt FROM incomes WHERE month = ? ORDER BY id ASC");
            $stmt->execute([$month]);
            $incomes = $stmt->fetchAll();
            
            // Mengambil data alokasi pengeluaran
            $stmt = $pdo->prepare("SELECT id, name, amount AS amt, income_id AS sourceId, urutan FROM expenses WHERE month = ? ORDER BY urutan ASC, id ASC");
            $stmt->execute([$month]);
            $expenses = $stmt->fetchAll();
            
            echo json_encode(['status' => 'success', 'data' => ['incomes' => $incomes, 'expenses' => $expenses]]);
            exit;
        }
        
        if ($action === 'save_income') {
            $id = $input['id'] ?? null;
            $month = $input['month'];
            $name = $input['name'];
            $amount = $input['amount'];
            
            if ($id) {
                // Update data pendapatan
                $stmt = $pdo->prepare("UPDATE incomes SET name = ?, amount = ? WHERE id = ?");
                $stmt->execute([$name, $amount, $id]);
                echo json_encode(['status' => 'success', 'message' => 'Pendapatan diupdate!']);
            } else {
                // Tambah data pendapatan baru
                $stmt = $pdo->prepare("INSERT INTO incomes (month, name, amount) VALUES (?, ?, ?)");
                $stmt->execute([$month, $name, $amount]);
                $newId = $pdo->lastInsertId();
                echo json_encode(['status' => 'success', 'id' => $newId, 'message' => 'Pendapatan disimpan!']);
            }
            exit;
        }
        
        if ($action === 'delete_income') {
            $id = $_GET['id'] ?? null;
            if ($id) {
                // Hapus data pendapatan (alokasi pengeluaran akan otomatis terhapus karena CASCADE)
                $stmt = $pdo->prepare("DELETE FROM incomes WHERE id = ?");
                $stmt->execute([$id]);
                echo json_encode(['status' => 'success', 'message' => 'Dihapus!']);
            } else {
                echo json_encode(['status' => 'error', 'message' => 'ID tidak valid.']);
            }
            exit;
        }
        
        if ($action === 'save_expense') {
            $id = $input['id'] ?? null;
            $month = $input['month'];
            $name = $input['name'];
            $amount = $input['amount'];
            $sourceId = $input['sourceId'];
            
            if ($id) {
                // Update alokasi pengeluaran
                $stmt = $pdo->prepare("UPDATE expenses SET name = ?, amount = ?, income_id = ? WHERE id = ?");
                $stmt->execute([$name, $amount, $sourceId, $id]);
                echo json_encode(['status' => 'success', 'message' => 'Alokasi diupdate!']);
            } else {
                // Get max urutan
                $stmtMax = $pdo->prepare("SELECT COALESCE(MAX(urutan), 0) FROM expenses WHERE month = ? AND income_id = ?");
                $stmtMax->execute([$month, $sourceId]);
                $maxUrutan = $stmtMax->fetchColumn();
                $urutan = $maxUrutan + 1;

                // Tambah alokasi pengeluaran baru
                $stmt = $pdo->prepare("INSERT INTO expenses (month, name, amount, income_id, urutan) VALUES (?, ?, ?, ?, ?)");
                $stmt->execute([$month, $name, $amount, $sourceId, $urutan]);
                $newId = $pdo->lastInsertId();
                echo json_encode(['status' => 'success', 'id' => $newId, 'message' => 'Alokasi disimpan!']);
            }
            exit;
        }
        
        if ($action === 'delete_expense') {
            $id = $_GET['id'] ?? null;
            if ($id) {
                $stmt = $pdo->prepare("DELETE FROM expenses WHERE id = ?");
                $stmt->execute([$id]);
                echo json_encode(['status' => 'success', 'message' => 'Dihapus!']);
            } else {
                echo json_encode(['status' => 'error', 'message' => 'ID tidak valid.']);
            }
            exit;
        }

        if ($action === 'update_expenses_order') {
            $ids = $input['ids'] ?? [];
            if (is_array($ids)) {
                $pdo->beginTransaction();
                $urutan = 1;
                $stmt = $pdo->prepare("UPDATE expenses SET urutan = ? WHERE id = ?");
                foreach ($ids as $id) {
                    $stmt->execute([$urutan, $id]);
                    $urutan++;
                }
                $pdo->commit();
                echo json_encode(['status' => 'success', 'message' => 'Urutan diperbarui!']);
            } else {
                echo json_encode(['status' => 'error', 'message' => 'Data tidak valid.']);
            }
            exit;
        }
        
        if ($action === 'duplicate_month') {
            $fromMonth = $input['from'];
            $toMonth = $input['to'];
            
            $pdo->beginTransaction();
            
            // Ambil data pendapatan dari bulan asal
            $stmt = $pdo->prepare("SELECT id, name, amount FROM incomes WHERE month = ?");
            $stmt->execute([$fromMonth]);
            $incomes = $stmt->fetchAll();
            
            foreach ($incomes as $inc) {
                $oldId = $inc['id'];
                // Insert ke bulan tujuan
                $insInc = $pdo->prepare("INSERT INTO incomes (month, name, amount) VALUES (?, ?, ?)");
                $insInc->execute([$toMonth, $inc['name'], $inc['amount']]);
                $newIncId = $pdo->lastInsertId();
                
                // Ambil alokasi pengeluaran di bawah ID pendapatan lama
                $stmtExp = $pdo->prepare("SELECT name, amount FROM expenses WHERE month = ? AND income_id = ?");
                $stmtExp->execute([$fromMonth, $oldId]);
                $expenses = $stmtExp->fetchAll();
                
                foreach ($expenses as $exp) {
                    $insExp = $pdo->prepare("INSERT INTO expenses (month, name, amount, income_id) VALUES (?, ?, ?, ?)");
                    $insExp->execute([$toMonth, $exp['name'], $exp['amount'], $newIncId]);
                }
            }
            
            $pdo->commit();
            echo json_encode(['status' => 'success', 'message' => 'Data Berhasil Disalin!']);
            exit;
        }
        
        if ($action === 'get_available_months') {
            $stmt = $pdo->query("SELECT DISTINCT month FROM incomes UNION SELECT DISTINCT month FROM expenses ORDER BY month DESC");
            $months = $stmt->fetchAll(PDO::FETCH_COLUMN);
            echo json_encode(['status' => 'success', 'months' => $months]);
            exit;
        }

        if ($action === 'delete_month') {
            $month = $_GET['month'] ?? null;
            if ($month) {
                $pdo->beginTransaction();
                $stmt = $pdo->prepare("DELETE FROM expenses WHERE month = ?");
                $stmt->execute([$month]);
                $stmt = $pdo->prepare("DELETE FROM incomes WHERE month = ?");
                $stmt->execute([$month]);
                $pdo->commit();
                echo json_encode(['status' => 'success', 'message' => 'Data bulan ini berhasil dihapus!']);
            } else {
                echo json_encode(['status' => 'error', 'message' => 'Bulan tidak valid']);
            }
            exit;
        }

        if ($action === 'reset_all') {
            $password = $input['password'] ?? '';
            if ($password === 'cahya123') {
                $pdo->exec("SET FOREIGN_KEY_CHECKS = 0");
                $pdo->exec("TRUNCATE TABLE expenses");
                $pdo->exec("TRUNCATE TABLE incomes");
                $pdo->exec("SET FOREIGN_KEY_CHECKS = 1");
                echo json_encode(['status' => 'success', 'message' => 'Database dibersihkan!']);
            } else {
                echo json_encode(['status' => 'error', 'message' => 'Password Salah!']);
            }
            exit;
        }
        
        if ($action === 'export_data') {
            $stmt = $pdo->query("SELECT id, month, name, amount AS amt FROM incomes ORDER BY month ASC, id ASC");
            $allIncomes = $stmt->fetchAll();
            
            $stmt = $pdo->query("SELECT id, month, name, amount AS amt, income_id AS sourceId FROM expenses ORDER BY month ASC, id ASC");
            $allExpenses = $stmt->fetchAll();
            
            $export = [];
            foreach ($allIncomes as $inc) {
                $m = $inc['month'];
                if (!isset($export[$m])) {
                    $export[$m] = ['incomes' => [], 'expenses' => []];
                }
                $export[$m]['incomes'][] = [
                    'id' => $inc['id'],
                    'name' => $inc['name'],
                    'amt' => floatval($inc['amt'])
                ];
            }
            foreach ($allExpenses as $exp) {
                $m = $exp['month'];
                if (!isset($export[$m])) {
                    $export[$m] = ['incomes' => [], 'expenses' => []];
                }
                $export[$m]['expenses'][] = [
                    'id' => $exp['id'],
                    'name' => $exp['name'],
                    'amt' => floatval($exp['amt']),
                    'sourceId' => $exp['sourceId']
                ];
            }
            
            echo json_encode($export);
            exit;
        }
        
        if ($action === 'import_data') {
            $data = $input['db'] ?? null;
            if ($data && is_array($data)) {
                $pdo->beginTransaction();
                
                $pdo->exec("SET FOREIGN_KEY_CHECKS = 0");
                $pdo->exec("TRUNCATE TABLE expenses");
                $pdo->exec("TRUNCATE TABLE incomes");
                $pdo->exec("SET FOREIGN_KEY_CHECKS = 1");
                
                foreach ($data as $month => $monthData) {
                    $incomes = $monthData['incomes'] ?? [];
                    $expenses = $monthData['expenses'] ?? [];
                    
                    $idMap = [];
                    foreach ($incomes as $inc) {
                        $stmt = $pdo->prepare("INSERT INTO incomes (month, name, amount) VALUES (?, ?, ?)");
                        $stmt->execute([$month, $inc['name'], $inc['amt']]);
                        $newId = $pdo->lastInsertId();
                        $idMap[$inc['id']] = $newId;
                    }
                    
                    foreach ($expenses as $exp) {
                        $sourceId = $exp['sourceId'] ?? null;
                        $newSourceId = isset($idMap[$sourceId]) ? $idMap[$sourceId] : 0;
                        
                        $stmt = $pdo->prepare("INSERT INTO expenses (month, name, amount, income_id) VALUES (?, ?, ?, ?)");
                        $stmt->execute([$month, $exp['name'], $exp['amt'], $newSourceId]);
                    }
                }
                
                $pdo->commit();
                echo json_encode(['status' => 'success', 'message' => 'Restore Berhasil!']);
            } else {
                echo json_encode(['status' => 'error', 'message' => 'Data tidak valid']);
            }
            exit;
        }
    } catch (\Exception $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        echo json_encode(['status' => 'error', 'message' => 'Database error: ' . $e->getMessage()]);
        exit;
    }
}
?>
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Rencana Budgeting v21</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap');

        :root { 
            --wa-dark: #be5a75;       /* Muted warm rose */
            --wa-primary: #e3859d;    /* Soft blush pink */
            --wa-bg: #fff5f6;         /* Soft pale rose background */
            --wa-bubble-in: #ffffff;  /* Pure white cards */
            --wa-text-main: #5a2b37;  /* Soft dark plum maroon text */
            --wa-text-muted: #9b6271; /* Soft muted dusty rose text */
            --danger: #e05a74;        /* Soft raspberry red */
            --border: #ffd6dd;        /* Sweet soft pastel border */
            --wa-light: #fbcfe8;      /* Light pastel pink glow */
        }
        
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Outfit', 'Segoe UI', sans-serif; }
        body { background-color: var(--wa-bg); color: var(--wa-text-main); padding-bottom: 100px; }
        .app-bar { background-color: var(--wa-dark); color: white; padding: 16px; position: sticky; top: 0; z-index: 100; box-shadow: 0 4px 15px rgba(190, 90, 117, 0.12); display: flex; align-items: center; justify-content: center; }
        .app-bar h1 { font-size: 1.3rem; font-weight: 700; letter-spacing: 0.5px; }
        .container { max-width: 500px; margin: 0 auto; padding: 16px; }
        
        @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(12px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .card { 
            background: var(--wa-bubble-in); 
            border-radius: 16px; 
            padding: 16px; 
            margin-bottom: 16px; 
            box-shadow: 0 4px 12px rgba(190, 90, 117, 0.04); 
            animation: fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        h3 { color: var(--wa-text-main); font-size: 1.05rem; margin-bottom: 12px; font-weight: 700; }
        .label { font-size: 0.85rem; color: var(--wa-text-muted); margin-bottom: 6px; display: block; font-weight: 600; }
        input, select { width: 100%; padding: 12px; border: 1.5px solid var(--border); border-radius: 12px; font-size: 1rem; margin-bottom: 12px; outline: none; background-color: #fff8f9; color: var(--wa-text-main); transition: 0.2s;}
        input:focus, select:focus { border-color: var(--wa-primary); background-color: white; box-shadow: 0 0 0 3px rgba(227, 133, 157, 0.15); }
        
        .btn { 
            width: 100%; padding: 12px; border-radius: 24px; border: none; font-weight: bold; cursor: pointer; color: white; background: var(--wa-primary); 
            transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275); text-align: center;
        }
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 15px rgba(227, 133, 157, 0.25);
        }
        .btn:active {
            transform: translateY(0);
        }
        .btn-success { background: var(--wa-dark); }
        .btn-success:hover { box-shadow: 0 6px 15px rgba(190, 90, 117, 0.25); }
        .btn-danger { background: var(--danger); }
        .btn-danger:hover { box-shadow: 0 6px 15px rgba(224, 90, 116, 0.25); }
        .btn-outline { background: transparent; border: 1.5px solid var(--border); color: var(--wa-text-muted); }
        .btn-outline:hover { background: var(--border); color: var(--wa-dark); transform: translateY(-2px); }
        .btn-sm { padding: 8px 14px; font-size: 0.8rem; width: auto; border-radius: 16px; }
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        
        .btn-icon {
            width: 38px;
            height: 38px;
            border-radius: 50%;
            border: none;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 1.05rem;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            box-shadow: 0 2px 6px rgba(190, 90, 117, 0.08);
        }
        .btn-icon:hover {
            transform: scale(1.1);
        }
        .btn-icon:active {
            transform: scale(0.95);
        }
        .btn-icon-edit {
            background-color: #fff0f2;
            color: var(--wa-dark);
            border: 1.5px solid var(--border);
        }
        .btn-icon-edit:hover {
            background-color: var(--border);
            box-shadow: 0 4px 10px rgba(190, 90, 117, 0.15);
        }
        .btn-icon-delete {
            background-color: #fff0f2;
            color: var(--danger);
            border: 1.5px solid #ffd6dd;
        }
        .btn-icon-delete:hover {
            background-color: #ffd6dd;
            box-shadow: 0 4px 10px rgba(224, 90, 116, 0.2);
        }
        
        .grand-total-box { background: linear-gradient(135deg, var(--wa-primary), var(--wa-dark)); color: white; padding: 20px; border-radius: 18px; margin-bottom: 16px; text-align: center; box-shadow: 0 6px 20px rgba(190, 90, 117, 0.12); }
        .grand-total-box h2 { color: white; margin-top: 5px; font-size: 2rem; font-weight: 800; text-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        
        .summary-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #fff1f2; font-size: 0.95rem; }
        .summary-row:last-child { border-bottom: none; }
        .summary-row strong.min { color: var(--danger); }
        
        .item-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #fff1f2; transition: background-color 0.2s; }
        .item-row:hover { background-color: #fff8f9; }
        .item-row:last-child { border-bottom: none; }
        
        .item-row.dragging {
            opacity: 0.4;
            background-color: var(--border) !important;
            border: 1.5px dashed var(--wa-primary) !important;
        }
        .drag-handle:active {
            cursor: grabbing;
        }
        
        .expense-group { border: 1.5px solid var(--border); border-radius: 16px; margin-bottom: 14px; overflow: hidden; background: white; box-shadow: 0 2px 8px rgba(190, 90, 117, 0.02); }
        .expense-group-header { background-color: #fff1f2; padding: 10px 14px; font-weight: 700; font-size: 0.85rem; color: var(--wa-text-muted); display: flex; justify-content: space-between; border-bottom: 1.5px solid var(--border); }
        .expense-group-body { padding: 0 14px; }
        .text-wa-green { color: var(--wa-primary); }
        
        /* Presenting Mode Fixes */
        body.presenting-mode .no-present { display: none !important; }
        body.presenting-mode .app-bar { position: relative; }
        body.presenting-mode .card { box-shadow: none; border: 1.5px solid var(--border); }
        body.presenting-mode { background: white; padding-top: 0; }
 
        /* Toast / Growl */
        .toast {
            position: fixed; top: 20px; left: 50%; transform: translateX(-50%) translateY(-100px);
            background: white; padding: 12px 24px; border-radius: 12px; box-shadow: 0 8px 30px rgba(190, 90, 117, 0.12);
            z-index: 3000; transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            opacity: 0; font-weight: 700; text-align: center; width: 90%; max-width: 400px;
        }
        .toast.show { transform: translateX(-50%) translateY(0); opacity: 1; }
        .toast-success { border-left: 6px solid var(--wa-light); color: var(--wa-dark); }
        .toast-error { border-left: 6px solid var(--danger); color: var(--danger); }
 
        /* Custom Modals */
        .modal-overlay {
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(76, 5, 25, 0.4); backdrop-filter: blur(4px);
            display: none; justify-content: center; align-items: center; z-index: 2000;
            padding: 20px; opacity: 0; transition: opacity 0.3s ease;
        }
        .modal-overlay.show { display: flex; opacity: 1; }
        .modal-box {
            background: white; width: 100%; max-width: 380px; border-radius: 20px;
            padding: 24px; box-shadow: 0 15px 35px rgba(190, 90, 117, 0.15);
            transform: translateY(30px) scale(0.95); transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        .modal-overlay.show .modal-box { transform: translateY(0) scale(1); }
        .modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px; }
        .modal-btn { padding: 10px 20px; border-radius: 12px; font-weight: bold; cursor: pointer; border: none; font-size: 0.9rem; transition: all 0.2s; }
        .modal-btn:hover { transform: translateY(-2px); }
        .modal-btn-cancel { background: #fff1f2; color: var(--wa-text-muted); }
        .modal-btn-confirm { background: var(--wa-primary); color: white; }
        .modal-btn-danger { background: var(--danger); color: white; }
 
        /* Floating Action Bar Present Mode */
        .present-footer {
            position: fixed; bottom: 0; left: 0; right: 0; 
            background: white; padding: 16px; display: none;
            box-shadow: 0 -2px 15px rgba(190, 90, 117, 0.08); z-index: 1500;
            grid-template-columns: 1fr 1fr; gap: 12px;
        }
        body.presenting-mode .present-footer { display: grid; }

        /* Loading Overlay */
        .loading-overlay {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(11, 20, 26, 0.5); /* 50% transparan */
            display: none;
            justify-content: center;
            align-items: center;
            z-index: 4000;
        }
        .loading-overlay.show {
            display: flex;
        }
        .spinner {
            border: 4px solid rgba(255, 255, 255, 0.3);
            border-top: 4px solid var(--wa-primary);
            border-radius: 50%;
            width: 45px;
            height: 45px;
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body>

<div id="loadingOverlay" class="loading-overlay">
    <div class="spinner"></div>
</div>

<div id="toast" class="toast"></div>

<div id="confirmModal" class="modal-overlay">
    <div class="modal-box">
        <h3 id="confirmTitle">Konfirmasi</h3>
        <p id="confirmText" style="color: var(--wa-text-muted); margin-bottom: 20px;"></p>
        <div class="modal-actions">
            <button class="modal-btn modal-btn-cancel" onclick="closeConfirm()">Batal</button>
            <button class="modal-btn modal-btn-confirm" id="btnConfirmAction" onclick="executeConfirm()">Ya</button>
        </div>
    </div>
</div>

<div id="resetModal" class="modal-overlay">
    <div class="modal-box">
        <h3 style="color: var(--danger);">⚠️ Reset Semua Data</h3>
        <p style="color: var(--wa-text-muted); margin-bottom: 15px;">Tindakan ini menghapus seluruh database secara permanen. Masukkan password <b>cahya123</b>:</p>
        <input type="password" id="resetPasswordInput" placeholder="Password...">
        <div class="modal-actions">
            <button class="modal-btn modal-btn-cancel" onclick="closeReset()">Batal</button>
            <button class="modal-btn modal-btn-danger" onclick="executeReset()">Reset Sekarang</button>
        </div>
    </div>
</div>

<div id="incModal" class="modal-overlay">
    <div class="modal-box">
        <h3 id="incFormTitle" style="color: var(--wa-primary); border-bottom: 2px dashed var(--border); padding-bottom: 10px; margin-bottom: 15px;">🌸 Tambah Pendapatan Baru</h3>
        <input type="hidden" id="incEditId">
        <label class="label">Nama Pendapatan</label>
        <input type="text" id="incName" placeholder="Contoh: Gaji, Bonus...">
        <label class="label">Nominal (Rp)</label>
        <input type="text" id="incAmount" inputmode="numeric" placeholder="0" oninput="formatRupiahInput(this)">
        <div class="modal-actions">
            <button class="modal-btn modal-btn-cancel" onclick="closeIncModal()">Batal</button>
            <button class="modal-btn modal-btn-confirm" id="btnSaveInc" onclick="saveIncome()">Simpan</button>
        </div>
    </div>
</div>

<div id="expModal" class="modal-overlay">
    <div class="modal-box">
        <h3 id="expFormTitle" style="color: var(--wa-dark); border-bottom: 2px dashed var(--border); padding-bottom: 10px; margin-bottom: 15px;">🧁 Tambah Alokasi Pengeluaran</h3>
        <input type="hidden" id="expEditId">
        <label class="label">Nama Pengeluaran</label>
        <input type="text" id="expName" placeholder="Contoh: Listrik, Belanja...">
        <label class="label">Nominal (Rp)</label>
        <input type="text" id="expAmount" inputmode="numeric" placeholder="0" oninput="formatRupiahInput(this)">
        <label class="label">Ambil Dana Dari</label>
        <select id="expSource" style="margin-bottom: 20px;"></select>
        <div class="modal-actions">
            <button class="modal-btn modal-btn-cancel" onclick="closeExpModal()">Batal</button>
            <button class="modal-btn modal-btn-confirm" id="btnSaveExp" style="background: var(--wa-dark);" onclick="saveExpense()">Simpan Alokasi</button>
        </div>
    </div>
</div>

<header class="app-bar">
    <h1 id="appBarTitle">Rencana Budgeting</h1>
</header>

<div class="container">
    <div class="card no-present">
        <label class="label">Pilih Periode Bulan</label>
        <input type="month" id="monthPicker" onchange="loadData()" oninput="loadData()">
    </div>

    <div id="duplicateContainer" class="no-present" style="display: none;"></div>

    <div class="grand-total-box">
        <div style="font-size: 0.9rem; opacity: 0.8;">Sisa Saldo Keseluruhan</div>
        <h2 id="grandBalance">Rp 0</h2>
        <div class="grid-2" style="margin-top: 15px; background: rgba(0,0,0,0.1); padding: 12px; border-radius: 12px;">
            <div>
                <div style="font-size: 0.75rem; opacity: 0.8;">Total Pendapatan</div>
                <div id="grandIncome" style="font-weight: bold; font-size: 1.1rem;">Rp 0</div>
            </div>
            <div>
                <div style="font-size: 0.75rem; opacity: 0.8;">Total Pengeluaran</div>
                <div id="grandExpense" style="font-weight: bold; font-size: 1.1rem;">Rp 0</div>
            </div>
        </div>
    </div>

    <div class="card">
        <h3>Rincian Sisa Per Pendapatan</h3>
        <div id="dynamicBalances"></div>
    </div>

    <div class="grid-2 no-present" style="margin-bottom: 16px;">
        <button class="btn" style="border-radius: 12px; background: var(--wa-primary); display: flex; align-items: center; justify-content: center; gap: 6px; padding: 14px 10px;" onclick="openIncModal()">🌸 Pendapatan Baru</button>
        <button class="btn" style="border-radius: 12px; background: var(--wa-dark); display: flex; align-items: center; justify-content: center; gap: 6px; padding: 14px 10px;" onclick="openExpModal()">🧁 Alokasi Baru</button>
    </div>

    <div class="card">
        <h3 style="border-bottom: 1px solid #f0f2f5; padding-bottom: 10px;">Daftar Pendapatan Masuk</h3>
        <div id="incomeList"></div>
    </div>

    <div style="margin-bottom: 20px;">
        <h3 style="margin-bottom: 10px; padding-left: 5px; color: var(--wa-text-muted); font-size: 0.95rem;">Daftar Pengeluaran Keluar</h3>
        <div id="expenseList"></div>
    </div>

    <div class="card no-present" id="settingsPanel" style="border-top: 4px solid var(--wa-text-muted); display: none;">
        <h3 style="font-size: 1rem; color: var(--wa-text-muted);">⚙️ Pengaturan Data</h3>
        <div class="grid-2">
            <button class="btn btn-outline" onclick="exportData()">💾 Export</button>
            <button class="btn btn-outline" onclick="document.getElementById('importFile').click()">📂 Import</button>
            <input type="file" id="importFile" accept=".json" style="display: none;" onchange="importData(event)">
        </div>
        <button class="btn btn-danger" style="border-radius: 8px; margin-top:10px; background: var(--wa-primary);" onclick="confirmDeleteCurrentMonth()">🗑️ Hapus Data Bulan Ini</button>
        <button class="btn btn-danger" style="border-radius: 8px; margin-top:10px;" onclick="openResetModal()">⚠️ Reset Semua Data</button>
    </div>

    <button class="btn no-present" style="background: white; color: var(--wa-dark); border: 1px solid var(--wa-dark);" onclick="togglePresent()">📺 View as Presenting</button>
    <button class="btn no-present" style="background: white; color: var(--wa-dark); border: 1px solid var(--wa-dark); margin-top: 10px;" onclick="toggleSettings()">⚙️ SETTING</button>
</div>

<div class="present-footer">
    <button class="btn" style="background: #25D366;" onclick="copyBudgetToClipboard()">📋 Copy Text (WA)</button>
    <button class="btn" style="background: #475569;" onclick="togglePresent()">❌ Keluar</button>
</div>

<script>
    // --- DATABASE CACHE ---
    let db = {};
    let currentMonth = "";

    // --- LOGIKA COPY TEXT WHATSAPP ---
    function copyBudgetToClipboard() {
        let data = db[currentMonth];
        if(!data || !data.incomes || data.incomes.length === 0) {
            showToast("Tidak ada data untuk dicopy!", "error");
            return;
        }

        let monthName = formatMonthTitle(currentMonth);
        let grandInc = 0, grandExp = 0;
        
        // Header
        let text = `📊 *LAPORAN BUDGETING - ${monthName.toUpperCase()}*\n`;
        text += `──────────────────\n\n`;

        // Per Sumber Pendapatan
        data.incomes.forEach(inc => {
            let expenses = data.expenses.filter(e => String(e.sourceId) === String(inc.id));
            let subExp = expenses.reduce((s, e) => s + Number(e.amt), 0);
            let sisa = Number(inc.amt) - subExp;
            grandInc += Number(inc.amt);
            grandExp += subExp;

            text += `💰 *Sumber: ${inc.name}*\n`;
            text += `Budget: Rp ${new Intl.NumberFormat('id-ID').format(inc.amt)}\n`;
            
            if(expenses.length > 0) {
                expenses.forEach(e => {
                    text += `  • ${e.name}: Rp ${new Intl.NumberFormat('id-ID').format(e.amt)}\n`;
                });
                text += `*Sisa Saldo: Rp ${new Intl.NumberFormat('id-ID').format(sisa)}*\n`;
            } else {
                text += `_(Belum ada pengeluaran)_\n`;
            }
            text += `\n`;
        });

        // Footer Summary
        text += `──────────────────\n`;
        text += `🟢 *Total Income:* Rp ${new Intl.NumberFormat('id-ID').format(grandInc)}\n`;
        text += `🔴 *Total Alokasi:* Rp ${new Intl.NumberFormat('id-ID').format(grandExp)}\n`;
        text += `⭐ *SISA BERSIH:* Rp ${new Intl.NumberFormat('id-ID').format(grandInc - grandExp)}`;

        // Eksekusi Clipboard
        navigator.clipboard.writeText(text).then(() => {
            showToast("Teks laporan berhasil dicopy!", "success");
        }).catch(() => {
            showToast("Gagal mencopy teks.", "error");
        });
    }

    // --- CUTE & FUN MESSAGES SYSTEM ---
    function getRandomSuccessMessage(type) {
        const incomeMsgs = [
            "Yey berhasil simpan! 💖",
            "Ok sis, berhasil simpan! ✨",
            "Mantul! Saldo nambah lagi! 🎉",
            "Uang datang lagi, yey! 💸",
            "Simpan sukses! Semangat cuan! 🌸"
        ];
        const expenseMsgs = [
            "Alokasi tercatat dengan cantik! 💕",
            "Ok sis, alokasinya aman! 👌",
            "Catatan disimpan! Hemat ya sis! 🧁",
            "Selesai alokasi, dompet tetap chic! 👛"
        ];
        const deleteMsgs = [
            "Dihapus dari catatan! Dadah~ 👋",
            "Bye bye data! Berhasil dihapus! 💨",
            "Data berhasil dihempas syantik! 💅"
        ];
        
        let arr = [];
        if (type === 'income') arr = incomeMsgs;
        else if (type === 'expense') arr = expenseMsgs;
        else if (type === 'delete') arr = deleteMsgs;
        else return "Berhasil disimpan! ✨";
        
        return arr[Math.floor(Math.random() * arr.length)];
    }

    // --- MODAL & TOAST SYSTEM ---
    let tOut;
    function showToast(m, t = 'success') {
        const toast = document.getElementById('toast');
        toast.innerText = m;
        toast.className = `toast toast-${t} show`;
        clearTimeout(tOut);
        tOut = setTimeout(() => toast.className = `toast toast-${t}`, 3000);
    }

    let confirmCb = null;
    function showConfirm(title, msg, isDanger, cb) {
        document.getElementById('confirmTitle').innerText = title;
        document.getElementById('confirmText').innerText = msg;
        document.getElementById('btnConfirmAction').className = isDanger ? "modal-btn modal-btn-danger" : "modal-btn modal-btn-confirm";
        confirmCb = cb;
        document.getElementById('confirmModal').classList.add('show');
    }

    function closeConfirm() { document.getElementById('confirmModal').classList.remove('show'); confirmCb = null; }
    function executeConfirm() { if(confirmCb) confirmCb(); closeConfirm(); }

    function openResetModal() { document.getElementById('resetModal').classList.add('show'); }
    function closeReset() { document.getElementById('resetModal').classList.remove('show'); }

    // Form Modal Open/Close Controls
    function openIncModal() {
        document.getElementById('incFormTitle').innerText = "🌸 Tambah Pendapatan Baru";
        document.getElementById('btnSaveInc').innerText = "Simpan";
        document.getElementById('incModal').classList.add('show');
    }
    function closeIncModal() {
        resetIncomeForm();
    }
    function openExpModal() {
        document.getElementById('expFormTitle').innerText = "🧁 Tambah Alokasi Pengeluaran";
        document.getElementById('btnSaveExp').innerText = "Simpan Alokasi";
        document.getElementById('expModal').classList.add('show');
    }
    function closeExpModal() {
        resetExpenseForm();
    }

    // --- LOADING OVERLAY SYSTEM ---
    function showLoading() {
        document.getElementById('loadingOverlay').classList.add('show');
    }
    function hideLoading() {
        document.getElementById('loadingOverlay').classList.remove('show');
    }

    async function executeReset() {
        let password = document.getElementById('resetPasswordInput').value;
        if (!password) return showToast("Masukkan password!", "error");
        
        showLoading();
        try {
            let res = await fetch('index.php?action=reset_all', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: password })
            });
            let resJson = await res.json();
            if (resJson.status === 'success') {
                db = {};
                closeReset();
                document.getElementById('resetPasswordInput').value = "";
                showToast("Database dibersihkan!", "success");
                await loadData();
            } else {
                showToast(resJson.message || "Password Salah!", "error");
            }
        } catch (err) {
            showToast("Error koneksi database.", "error");
        } finally {
            hideLoading();
        }
    }

    function confirmDeleteCurrentMonth() {
        let monthName = formatMonthTitle(currentMonth);
        showConfirm("Hapus Bulan Ini?", `Apakah Anda yakin ingin menghapus semua data untuk bulan ${monthName}?`, true, async () => {
            showLoading();
            try {
                let res = await fetch(`index.php?action=delete_month&month=${currentMonth}`, {
                    method: 'POST'
                });
                let resJson = await res.json();
                if (resJson.status === 'success') {
                    showToast(getRandomSuccessMessage('delete'));
                    await loadData();
                } else {
                    showToast(resJson.message || "Gagal menghapus data bulan ini.", "error");
                }
            } catch (err) {
                showToast("Error koneksi database.", "error");
            } finally {
                hideLoading();
            }
        });
    }

    // --- CORE LOGIC ---
    function formatRupiahInput(input) {
        let sel = input.selectionStart, oldL = input.value.length;
        let v = input.value.replace(/\D/g, "");
        if(!v) { input.value = ""; return; }
        input.value = new Intl.NumberFormat('id-ID').format(Number(v));
        input.setSelectionRange(sel + (input.value.length - oldL), sel + (input.value.length - oldL));
    }

    // Input numbers cleanup
    function parseAmount(v) { return parseInt(v.toString().replace(/\D/g, "")) || 0; }
    function formatRp(n) { return "Rp " + new Intl.NumberFormat('id-ID').format(n); }
    function formatMonthTitle(p) {
        if(!p) return "";
        const [y, m] = p.split('-');
        const mo = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
        return `${mo[parseInt(m, 10)-1]} ${y}`;
    }

    function resetIncomeForm() {
        document.getElementById('incEditId').value = ""; document.getElementById('incName').value = "";
        document.getElementById('incAmount').value = "";
        document.getElementById('incModal').classList.remove('show');
    }

    function resetExpenseForm() {
        document.getElementById('expEditId').value = ""; document.getElementById('expName').value = "";
        document.getElementById('expAmount').value = "";
        document.getElementById('expModal').classList.remove('show');
    }

    async function loadData() {
        showLoading();
        try {
            currentMonth = document.getElementById('monthPicker').value;
            if (!currentMonth) {
                let d = new Date();
                currentMonth = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, '0');
                document.getElementById('monthPicker').value = currentMonth;
            }
            document.getElementById('appBarTitle').innerText = "Budgeting : " + formatMonthTitle(currentMonth);

            document.getElementById('grandIncome').innerText = "Rp 0";
            document.getElementById('grandExpense').innerText = "Rp 0";
            document.getElementById('grandBalance').innerText = "Rp 0";
            document.getElementById('dynamicBalances').innerHTML = "<p style='color:#be185d;text-align:center;padding:10px;'>Bulan ini masih kosong.</p>";
            document.getElementById('incomeList').innerHTML = "";
            document.getElementById('expenseList').innerHTML = "";
            document.getElementById('duplicateContainer').style.display = "none";

            // Mengambil data dari backend
            let response = await fetch(`index.php?action=get_data&month=${currentMonth}`);
            let resJson = await response.json();
            if (resJson.status !== 'success') {
                showToast(resJson.message || "Gagal memuat data.", "error");
                return;
            }
            
            let data = resJson.data;
            db[currentMonth] = data;

            // Handle Empty Month Duplication
            if (data.incomes.length === 0 && data.expenses.length === 0) {
                let monthsResponse = await fetch(`index.php?action=get_available_months`);
                let monthsJson = await monthsResponse.json();
                let available = (monthsJson.months || []).filter(m => m !== currentMonth);
                
                if (available.length > 0) {
                    available.sort().reverse();
                    let opt = available.map(m => `<option value="${m}">${formatMonthTitle(m)}</option>`).join('');
                    document.getElementById('duplicateContainer').innerHTML = `
                        <div class="card" style="border: 2px dashed var(--wa-primary); background: #fff8f9;">
                            <label class="label">💡 Salin data dari bulan lain?</label>
                            <div style="display: flex; gap: 8px;">
                                <select id="copyMonthSelect" style="margin-bottom: 0;">${opt}</select>
                                <button class="btn btn-sm" onclick="executeDuplicateData()">Salin</button>
                            </div>
                        </div>`;
                    document.getElementById('duplicateContainer').style.display = 'block';
                }
                return;
            }

            // Render Logic
            let gInc = 0, gExp = 0, bals = {};
            let srcSelect = document.getElementById('expSource');
            srcSelect.innerHTML = "";

            data.incomes.forEach(inc => {
                bals[inc.id] = { name: inc.name, amount: Number(inc.amt), used: 0 };
                srcSelect.innerHTML += `<option value="${inc.id}">${inc.name}</option>`;
                gInc += Number(inc.amt);
            });

            data.expenses.forEach(exp => {
                gExp += Number(exp.amt);
                if (bals[exp.sourceId]) bals[exp.sourceId].used += Number(exp.amt);
            });

            // Display Balances
            let bHtml = "";
            for(let id in bals) {
                let b = bals[id], rem = b.amount - b.used;
                bHtml += `<div class="summary-row"><span>${b.name}</span> <div style="display:flex;align-items:center;gap:10px;"><strong class="${rem<0?'min':''}">${formatRp(rem)}</strong><button class="btn btn-outline btn-sm no-present" onclick="editIncome('${id}')">Edit</button></div></div>`;
            }
            document.getElementById('dynamicBalances').innerHTML = bHtml;

            // Display Lists
            document.getElementById('incomeList').innerHTML = data.incomes.map(i => `
<div class="item-row">
    <div style="display: flex; align-items: center; gap: 8px;">
        <div style="display: flex; flex-direction: column; gap: 2px;">
            <div class="item-name" style="font-weight: 600; font-size: 0.95rem; color: var(--wa-text-main);">${i.name}</div>
            <div class="item-amount" style="font-size: 0.85rem; font-weight: 700; color: var(--wa-dark);">${formatRp(i.amt)}</div>
        </div>
    </div>
    <div class="action-btns no-present" style="display: flex; gap: 8px; align-items: center;">
        <button class="btn-icon btn-icon-edit" onclick="editIncome('${i.id}')" title="Edit">✏️</button>
        <button class="btn-icon btn-icon-delete" onclick="deleteIncome('${i.id}')" title="Hapus">🗑️</button>
    </div>
</div>`).join('');

            let eHtml = "";
            data.incomes.forEach(inc => {
                let its = data.expenses.filter(e => String(e.sourceId) === String(inc.id));
                if (its.length > 0) {
                    let sub = its.reduce((s, i) => s + Number(i.amt), 0);
                    eHtml += `<div class="expense-group"><div class="expense-group-header"><span>Dari: ${inc.name}</span><span>Sub: ${formatRp(sub)}</span></div><div class="expense-group-body">`;
                    its.forEach(ex => eHtml += `
<div class="item-row" data-id="${ex.id}">
    <div style="display: flex; align-items: center; gap: 8px;">
        <div class="drag-handle no-present" style="cursor: grab; padding-right: 4px; color: var(--wa-text-muted); font-size: 1.2rem; user-select: none;">☰</div>
        <div style="display: flex; flex-direction: column; gap: 2px;">
            <div class="item-name" style="font-weight: 600; font-size: 0.95rem; color: var(--wa-text-main);">${ex.name}</div>
            <div class="item-amount" style="font-size: 0.85rem; font-weight: 700; color: var(--wa-primary);">${formatRp(ex.amt)}</div>
        </div>
    </div>
    <div class="action-btns no-present" style="display: flex; gap: 8px; align-items: center;">
        <button class="btn-icon btn-icon-edit" onclick="editExpense('${ex.id}')" title="Edit">✏️</button>
        <button class="btn-icon btn-icon-delete" onclick="deleteExpense('${ex.id}')" title="Hapus">🗑️</button>
    </div>
</div>`);
                    eHtml += `</div></div>`;
                }
            });
            document.getElementById('expenseList').innerHTML = eHtml || "<p style='text-align:center;padding:20px;color:#be185d;'>Belum ada pengeluaran.</p>";

            initSorting();

            document.getElementById('grandIncome').innerText = formatRp(gInc);
            document.getElementById('grandExpense').innerText = formatRp(gExp);
            document.getElementById('grandBalance').innerText = formatRp(gInc - gExp);

        } catch (e) { 
            console.error(e);
            showToast("Gagal memuat layar.", "error"); 
        } finally {
            hideLoading();
        }
    }

    async function saveIncome() {
        let id = document.getElementById('incEditId').value, n = document.getElementById('incName').value, a = parseAmount(document.getElementById('incAmount').value);
        if(!n || a <= 0) return showToast("Data tidak valid!", "error");
        
        let payload = {
            id: id || null,
            month: currentMonth,
            name: n,
            amount: a
        };
        
        showLoading();
        try {
            let res = await fetch('index.php?action=save_income', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            let resJson = await res.json();
            if (resJson.status === 'success') {
                showToast(getRandomSuccessMessage('income'));
                resetIncomeForm();
                await loadData();
            } else {
                showToast(resJson.message || "Gagal menyimpan pendapatan.", "error");
            }
        } catch (err) {
            showToast("Error koneksi database.", "error");
        } finally {
            hideLoading();
        }
    }

    function deleteIncome(id) {
        showConfirm("Hapus Pendapatan?", "Seluruh alokasi dana dari sumber ini akan hilang.", true, async () => {
            showLoading();
            try {
                let res = await fetch(`index.php?action=delete_income&id=${id}`);
                let resJson = await res.json();
                if (resJson.status === 'success') {
                    showToast(getRandomSuccessMessage('delete'));
                    await loadData();
                } else {
                    showToast(resJson.message || "Gagal menghapus.", "error");
                }
            } catch (err) {
                showToast("Error koneksi database.", "error");
            } finally {
                hideLoading();
            }
        });
    }

    async function saveExpense() {
        let id = document.getElementById('expEditId').value, n = document.getElementById('expName').value, a = parseAmount(document.getElementById('expAmount').value), sid = document.getElementById('expSource').value;
        if(!n || a <= 0 || !sid) return showToast("Lengkapi data!", "error");
        
        let payload = {
            id: id || null,
            month: currentMonth,
            name: n,
            amount: a,
            sourceId: sid
        };
        
        showLoading();
        try {
            let res = await fetch('index.php?action=save_expense', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            let resJson = await res.json();
            if (resJson.status === 'success') {
                showToast(getRandomSuccessMessage('expense'));
                resetExpenseForm();
                await loadData();
            } else {
                showToast(resJson.message || "Gagal menyimpan alokasi.", "error");
            }
        } catch (err) {
            showToast("Error koneksi database.", "error");
        } finally {
            hideLoading();
        }
    }

    function deleteExpense(id) {
        showConfirm("Hapus Alokasi?", "Data ini akan dihapus dari daftar.", true, async () => {
            showLoading();
            try {
                let res = await fetch(`index.php?action=delete_expense&id=${id}`);
                let resJson = await res.json();
                if (resJson.status === 'success') {
                    showToast(getRandomSuccessMessage('delete'));
                    await loadData();
                } else {
                    showToast(resJson.message || "Gagal menghapus.", "error");
                }
            } catch (err) {
                showToast("Error koneksi database.", "error");
            } finally {
                hideLoading();
            }
        });
    }

    async function executeDuplicateData() {
        let from = document.getElementById('copyMonthSelect').value;
        if (!from) return;
        
        let payload = {
            from: from,
            to: currentMonth
        };
        
        showLoading();
        try {
            let res = await fetch('index.php?action=duplicate_month', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            let resJson = await res.json();
            if (resJson.status === 'success') {
                showToast("Data Berhasil Disalin!");
                await loadData();
            } else {
                showToast(resJson.message || "Gagal menyalin data.", "error");
            }
        } catch (err) {
            showToast("Error koneksi database.", "error");
        } finally {
            hideLoading();
        }
    }

    async function exportData() {
        showLoading();
        try {
            let res = await fetch('index.php?action=export_data');
            let data = await res.json();
            let b = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
            let a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `Backup_Budgeting.json`; a.click();
            showToast("Backup Berhasil!");
        } catch (err) {
            showToast("Export Gagal!", "error");
        } finally {
            hideLoading();
        }
    }

    function importData(e) {
        let r = new FileReader(); r.onload = (ev) => {
            showConfirm("Import Data?", "Data saat ini akan tertimpa.", false, async () => {
                showLoading();
                try {
                    let parsed = JSON.parse(ev.target.result);
                    let res = await fetch('index.php?action=import_data', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ db: parsed })
                    });
                    let resJson = await res.json();
                    if (resJson.status === 'success') {
                        showToast("Restore Berhasil!");
                        await loadData();
                    } else {
                        showToast(resJson.message || "Import Gagal!", "error");
                    }
                } catch(err) { 
                    showToast("File Rusak!", "error"); 
                } finally {
                    hideLoading();
                }
            });
        }; r.readAsText(e.target.files[0]);
    }

    function togglePresent() { document.body.classList.toggle('presenting-mode'); }

    function toggleSettings() {
        const panel = document.getElementById('settingsPanel');
        if (panel.style.display === 'none') {
            panel.style.display = 'block';
            panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
            panel.style.display = 'none';
        }
    }

    function editIncome(id) {
        let it = db[currentMonth].incomes.find(i => String(i.id) === String(id));
        if(it) {
            document.getElementById('incEditId').value = it.id;
            document.getElementById('incName').value = it.name;
            document.getElementById('incAmount').value = new Intl.NumberFormat('id-ID').format(it.amt);
            document.getElementById('incFormTitle').innerText = "🌸 Edit Pendapatan";
            document.getElementById('btnSaveInc').innerText = "Update";
            document.getElementById('incModal').classList.add('show');
        }
    }

    function editExpense(id) {
        let it = db[currentMonth].expenses.find(i => String(i.id) === String(id));
        if(it) {
            document.getElementById('expEditId').value = it.id;
            document.getElementById('expName').value = it.name;
            document.getElementById('expAmount').value = new Intl.NumberFormat('id-ID').format(it.amt);
            document.getElementById('expSource').value = it.sourceId;
            document.getElementById('expFormTitle').innerText = "🧁 Edit Alokasi";
            document.getElementById('btnSaveExp').innerText = "Update";
            document.getElementById('expModal').classList.add('show');
        }
    }

    function initSorting() {
        initDragAndDrop();
        initTouchDragAndDrop();
    }

    function initDragAndDrop() {
        const bodies = document.querySelectorAll('.expense-group-body');
        bodies.forEach(body => {
            let draggedItem = null;

            body.querySelectorAll('.item-row').forEach(item => {
                const handle = item.querySelector('.drag-handle');
                if (!handle) return;
                
                item.setAttribute('draggable', 'true');
                
                item.addEventListener('dragstart', (e) => {
                    draggedItem = item;
                    item.classList.add('dragging');
                    e.dataTransfer.effectAllowed = 'move';
                });

                item.addEventListener('dragend', () => {
                    draggedItem = null;
                    item.classList.remove('dragging');
                    saveNewOrder(body);
                });

                item.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    const afterElement = getDragAfterElement(body, e.clientY);
                    if (afterElement == null) {
                        body.appendChild(draggedItem);
                    } else {
                        body.insertBefore(draggedItem, afterElement);
                    }
                });
            });
        });
    }

    function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.item-row:not(.dragging)')];

        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    function initTouchDragAndDrop() {
        const bodies = document.querySelectorAll('.expense-group-body');
        bodies.forEach(body => {
            let draggedItem = null;
            let pressTimer = null;
            let isDragging = false;
            
            body.querySelectorAll('.item-row').forEach(item => {
                const handle = item.querySelector('.drag-handle');
                if (!handle) return;
                
                handle.addEventListener('touchstart', (e) => {
                    draggedItem = item;
                    pressTimer = setTimeout(() => {
                        isDragging = true;
                        item.classList.add('dragging');
                        if (navigator.vibrate) navigator.vibrate(50);
                    }, 300);
                });
                
                handle.addEventListener('touchmove', (e) => {
                    if (!isDragging) {
                        clearTimeout(pressTimer);
                        return;
                    }
                    e.preventDefault();
                    
                    const touch = e.touches[0];
                    const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
                    if (!targetEl) return;
                    
                    const row = targetEl.closest('.item-row');
                    if (row && row !== draggedItem && row.parentNode === body) {
                        const rect = row.getBoundingClientRect();
                        const next = (touch.clientY - rect.top) / rect.height > 0.5;
                        body.insertBefore(draggedItem, next ? row.nextSibling : row);
                    }
                });
                
                handle.addEventListener('touchend', (e) => {
                    clearTimeout(pressTimer);
                    if (isDragging) {
                        isDragging = false;
                        item.classList.remove('dragging');
                        saveNewOrder(body);
                    }
                    draggedItem = null;
                });
                
                handle.addEventListener('touchcancel', () => {
                    clearTimeout(pressTimer);
                    if (isDragging) {
                        isDragging = false;
                        item.classList.remove('dragging');
                    }
                    draggedItem = null;
                });
            });
        });
    }

    async function saveNewOrder(body) {
        const itemRows = body.querySelectorAll('.item-row');
        const ids = Array.from(itemRows).map(row => row.getAttribute('data-id'));
        
        showLoading();
        try {
            let res = await fetch('index.php?action=update_expenses_order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: ids })
            });
            let resJson = await res.json();
            if (resJson.status === 'success') {
                showToast("Urutan berhasil disimpan! ✨");
            } else {
                showToast("Gagal menyimpan urutan.", "error");
            }
        } catch (e) {
            showToast("Error koneksi database.", "error");
        } finally {
            hideLoading();
        }
    }

    loadData();
</script>
</body>
</html>
