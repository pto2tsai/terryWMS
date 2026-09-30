// ============================================================
// js/shared/product-rules.js — 品項分類（電腦版與手機版共用）
// 運費、包材、冷藏、常溫品等不從倉庫揀（沒有庫存），揀貨清單、分貨標籤、件數統計照這裡判斷
// 兩邊一定要用同一份，不然手機的揀貨清單會跟電腦的不一樣
// ============================================================

window.isFeeItem = function(productName) {
    if (!productName) return true;
    var feeKeywords = ['運費', '費用', '代工費', '加工費', '代收', '代墊', '手續費', '服務費', '代付', '其他費用'];
    return feeKeywords.some(function(kw) { return productName.includes(kw); });
};

window.isPackagingItem = function(productName) {
    if (!productName) return false;
    var packagingKeywords = ['保力龍', '保麗龍', '包材', '紙箱', '冰袋', '冰塊', '保麗龍箱', '保力龍箱'];
    return packagingKeywords.some(function(kw) { return productName.includes(kw); });
};

window.isChilledItem = function(productName) {
    if (!productName) return false;
    var chilledKeywords = ['現流白仁', '冷藏'];
    return chilledKeywords.some(function(kw) { return productName.includes(kw); });
};

// 常溫品（卡啦系列、零嘴）：門市出貨，不在工廠冷凍庫
window.isAmbientStoreItem = function(productName) {
    if (!productName) return false;
    var ambientKeywords = ['卡啦', '夾心絲'];
    return ambientKeywords.some(function(kw) { return productName.includes(kw); });
};

window.isExcludedFromPickingList = function(productName) {
    return window.isFeeItem(productName) || window.isPackagingItem(productName) || window.isChilledItem(productName) || window.isAmbientStoreItem(productName);
};

window.isExcludedFromSortingLabel = function(productName) {
    return window.isFeeItem(productName) || window.isChilledItem(productName) || window.isAmbientStoreItem(productName);
};

window.isExcludedFromQtyCount = function(productName) {
    return window.isFeeItem(productName) || window.isPackagingItem(productName) || window.isChilledItem(productName) || window.isAmbientStoreItem(productName);
};

window.isNonProductItem = window.isExcludedFromSortingLabel;

window.parseBoxPerPackage = function(productName) {
    if (!productName) return 0;

    var patterns = [
        /\*(\d+)盒/,      // *8盒
        /\*(\d+)入/,      // *12入
        /\*(\d+)包/,      // *6包
        /\*(\d+)袋/,      // *10袋
        /x(\d+)盒/i,      // x8盒
        /x(\d+)入/i,      // x12入
        /(\d+)盒\/件/,    // 8盒/件
        /(\d+)入\/件/     // 12入/件
    ];

    for (var i = 0; i < patterns.length; i++) {
        var match = productName.match(patterns[i]);
        if (match && match[1]) {
            return parseInt(match[1]);
        }
    }

    return 0;  // 無法解析時返回0，使用原始邏輯
};

