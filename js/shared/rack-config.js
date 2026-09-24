// ============================================================
// js/shared/rack-config.js — 貨架配置與各層容量（桌機版與手機版共用）
// ============================================================

// ========== 貨架配置表（統一管理）==========
window.RACK_CONFIG = {
    // ========== 簡化版容量系統 ==========
    // 核心概念：一個棧板就是一個棧板，佔用一個地面位置
    // 差異在於「高度」：不足板/散板較低，可以堆疊

    // 各層的地面棧板位數量
    LEVEL_FLOOR_SLOTS: {
        '3F': 8,    // 8 個地面位置
        '2F': 4,    // 4 個地面位置
        '1F': 8     // 8 個地面位置（挑高）
    },

    // ========== 各層可放板數（已計算堆疊） ==========
    // 整板：不堆疊
    // 不足板：1F 可堆疊 1.5 倍
    // 散板：2F 可堆疊 1.5 倍，1F 可堆疊 2 倍
    LEVEL_CAPACITY: {
        '3F': { full: 8, partial: 0, scattered: 0 },   // 3F 只放整板，不堆疊
        '2F': { full: 4, partial: 4, scattered: 6 },   // 2F：4位，散板可堆疊
        '1F': { full: 8, partial: 12, scattered: 16 }  // 1F：8位，挑高可堆疊
    },

    // 入庫優先順序（2F → 3F → 1F）
    LEVEL_PRIORITY: ['2F', '3F', '1F'],

    // 各區域的巷道數
    ZONE_LANES: {
        'I-A': 8, 'I-B': 8,
        'J-C': 8, 'J-D': 8,
        'K-E': 22, 'K-F': 22, 'K-G': 22, 'K-H': 22
    },

    // 板型判斷閾值（依填充率）
    PALLET_FILL_THRESHOLDS: {
        full: 0.80,      // ≥80% = 整板
        partial: 0.50,   // 50%~79% = 不足板
        scattered: 0.20  // 20%~49% = 散板
    }
};

// ========== 判斷板型（依填充率） ==========
window.getPalletType = function(quantity, palletCapacity) {
    var cap = palletCapacity || 40;
    var fillRate = (quantity || 0) / cap;
    var THRESHOLDS = window.RACK_CONFIG.PALLET_FILL_THRESHOLDS;

    if (fillRate >= THRESHOLDS.full) return 'full';
    if (fillRate >= THRESHOLDS.partial) return 'partial';
    return 'scattered';
};

// ========== 取得某層對特定板型的容量 ==========
window.getLevelCapacity = function(level, palletType) {
    var capacity = window.RACK_CONFIG.LEVEL_CAPACITY[level];
    if (!capacity) return 0;
    return capacity[palletType] || 0;
};

// ========== 混合板型的層使用率（所有容量計算共用）==========
// 每種板型的容量不同（例如 2F：整板 4、不足板 4、散板 6），
// 一層放了不同板型時，使用率 = Σ(各板型數量 ÷ 該板型容量)，1 代表滿。
// counts: { full: n, partial: n, scattered: n }
window.levelUsageRatio = function(counts, level, factor) {
    var cap = window.RACK_CONFIG.LEVEL_CAPACITY[level];
    if (!cap || !counts) return 0;
    var f = factor || 1;
    var ratio = 0;
    ['full', 'partial', 'scattered'].forEach(function(t) {
        var n = counts[t] || 0;
        if (n <= 0) return;
        var c = Math.floor((cap[t] || 0) * f);
        // 這層不允許此板型卻已經放了，視為滿
        ratio += c > 0 ? n / c : 1;
    });
    return ratio;
};

// 這層還能再放幾板 palletType
window.levelRemaining = function(counts, level, palletType, factor) {
    var cap = window.RACK_CONFIG.LEVEL_CAPACITY[level];
    if (!cap) return 0;
    var c = Math.floor((cap[palletType] || 0) * (factor || 1));
    if (c <= 0) return 0;
    var free = 1 - window.levelUsageRatio(counts, level, factor);
    return Math.max(0, Math.floor(free * c + 1e-9));
};

window.canLevelFit = function(counts, level, palletType, factor) {
    return window.levelRemaining(counts, level, palletType, factor) >= 1;
};

// 依棧板本身的數量與每板容量判斷板型
window.palletTypeOf = function(p) {
    return window.getPalletType(parseFloat(p.quantity) || 0, parseFloat(p.palletCapacity) || 40);
};

window.addPalletToCounts = function(counts, p) {
    var t = window.palletTypeOf(p);
    counts[t] = (counts[t] || 0) + 1;
};

// 搬到某儲位前的容量檢查：本倉貨架（I/J/K）這一層滿了回傳提醒文字，沒滿或不是貨架回傳 ''
// pallets：目前全部棧板；pallet：要搬過去的板（算板型用）
window.locationFullWarning = function(loc, pallet, pallets) {
    var m = /^([IJK]-[A-H]-\d{2})-([123]F)$/.exec(String(loc || '').toUpperCase());
    if (!m) return '';
    var level = m[2];
    var counts = {};
    var n = 0;
    (pallets || []).forEach(function(p) {
        if (String(p.locationId || '').toUpperCase() === m[0] && (!pallet || p.id !== pallet.id)) {
            window.addPalletToCounts(counts, p);
            n++;
        }
    });
    var type = pallet ? window.palletTypeOf(pallet) : 'full';
    if (window.canLevelFit(counts, level, type)) return '';
    var names = { full: '整板', partial: '不足板', scattered: '散板' };
    var cap = window.RACK_CONFIG.LEVEL_CAPACITY[level] || {};
    if (!cap[type]) return '⚠️ ' + m[0] + ' 這一層不放' + names[type] + '（目前 ' + n + ' 板）';
    return '⚠️ ' + m[0] + ' 已經滿了（目前 ' + n + ' 板，' + names[type] + '最多 ' + cap[type] + ' 板）';
};
