/**
 * Terry WMS v10.0 功能增強包
 * 包含所有新增功能和優化模組
 */

// ==================== 1. 生產排程管理 ====================

class ProductionScheduler {
    constructor() {
        this.schedules = [];
        this.productionLines = [
            { id: 'line-1', name: '生產線 1', capacity: 100 },
            { id: 'line-2', name: '生產線 2', capacity: 120 },
            { id: 'line-3', name: '生產線 3', capacity: 100 },
            { id: 'line-4', name: '生產線 4', capacity: 80 }
        ];
    }
    
    // 建立新排程
    async createSchedule(data) {
        const schedule = {
            id: this.generateId(),
            productName: data.productName,
            quantity: data.quantity,
            lineId: data.lineId,
            startTime: data.startTime,
            endTime: data.endTime,
            status: 'planned', // planned, running, paused, completed, delayed
            progress: 0,
            priority: data.priority || 'normal',
            notes: data.notes || '',
            createdAt: new Date(),
            createdBy: currentUser.email
        };
        
        try {
            const { collection, addDoc } = window.firebaseModules;
            const docRef = await addDoc(collection(window.db, 'productions'), schedule);
            schedule.id = docRef.id;
            this.schedules.push(schedule);
            return schedule;
        } catch (error) {
            console.error('建立排程失敗:', error);
            throw error;
        }
    }
    
    // 更新排程狀態
    async updateScheduleStatus(scheduleId, status, progress = null) {
        try {
            const { doc, updateDoc } = window.firebaseModules;
            const scheduleRef = doc(window.db, 'productions', scheduleId);
            
            const updateData = { status };
            if (progress !== null) {
                updateData.progress = progress;
            }
            if (status === 'completed') {
                updateData.completedAt = new Date();
            }
            
            await updateDoc(scheduleRef, updateData);
            
            // 更新本地資料
            const schedule = this.schedules.find(s => s.id === scheduleId);
            if (schedule) {
                Object.assign(schedule, updateData);
            }
            
            return true;
        } catch (error) {
            console.error('更新排程失敗:', error);
            throw error;
        }
    }
    
    // 檢查排程衝突
    checkConflict(lineId, startTime, endTime) {
        return this.schedules.filter(s => {
            if (s.lineId !== lineId || s.status === 'completed') return false;
            
            const sStart = new Date(s.startTime);
            const sEnd = new Date(s.endTime);
            const newStart = new Date(startTime);
            const newEnd = new Date(endTime);
            
            return (newStart < sEnd && newEnd > sStart);
        });
    }
    
    // 計算產線使用率
    calculateLineUtilization(lineId, date) {
        const dayStart = new Date(date);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(date);
        dayEnd.setHours(23, 59, 59, 999);
        
        const lineSchedules = this.schedules.filter(s => {
            if (s.lineId !== lineId) return false;
            const start = new Date(s.startTime);
            const end = new Date(s.endTime);
            return (start >= dayStart && start <= dayEnd) || 
                   (end >= dayStart && end <= dayEnd);
        });
        
        let totalMinutes = 0;
        lineSchedules.forEach(s => {
            const start = new Date(s.startTime);
            const end = new Date(s.endTime);
            const minutes = (end - start) / 1000 / 60;
            totalMinutes += minutes;
        });
        
        const dayMinutes = 24 * 60;
        return (totalMinutes / dayMinutes * 100).toFixed(1);
    }
    
    // 智能排程建議
    suggestOptimalSchedule(productName, quantity, duration) {
        const suggestions = [];
        const now = new Date();
        
        this.productionLines.forEach(line => {
            // 尋找最早可用時段
            let checkTime = new Date(now);
            checkTime.setMinutes(0, 0, 0);
            
            for (let i = 0; i < 48; i++) { // 檢查未來48小時
                const endTime = new Date(checkTime.getTime() + duration * 60000);
                const conflicts = this.checkConflict(line.id, checkTime, endTime);
                
                if (conflicts.length === 0) {
                    suggestions.push({
                        lineId: line.id,
                        lineName: line.name,
                        startTime: checkTime.toISOString(),
                        endTime: endTime.toISOString(),
                        waitTime: (checkTime - now) / 1000 / 60, // 分鐘
                        utilization: this.calculateLineUtilization(line.id, checkTime)
                    });
                    break;
                }
                
                checkTime = new Date(checkTime.getTime() + 30 * 60000); // 每次檢查間隔30分鐘
            }
        });
        
        // 依等待時間排序
        return suggestions.sort((a, b) => a.waitTime - b.waitTime);
    }
    
    generateId() {
        return 'PRD-' + new Date().getTime() + '-' + Math.random().toString(36).substr(2, 4).toUpperCase();
    }
}

// ==================== 2. 改善入庫建議演算法 ====================

class SmartInboundSuggester {
    constructor() {
        this.pallets = [];
        this.warehouseCapacity = {
            'I': { 'A': 24, 'B': 24 },
            'J': { 'C': 24, 'D': 24 },
            'K': { 'E': 66, 'F': 66, 'G': 66, 'H': 66 }
        };
    }
    
    setPallets(pallets) {
        this.pallets = pallets;
    }
    
    // 🆕 進階入庫建議（多因素評分）
    suggestLocationAdvanced(productName, quantity, category = 'finished') {
        const suggestions = [];
        
        // 1. 找同品項位置（權重 40%）
        const sameProductLocations = this.getSameProductLocations(productName);
        
        // 2. 找同類別區域（權重 30%）
        const categoryZones = this.getCategoryZones(category);
        
        // 3. 找低使用率區域（權重 20%）
        const lowUtilZones = this.getLowUtilizationZones();
        
        // 4. FIFO 優化（權重 10%）
        const fifoOptimal = this.getFIFOOptimalZones(productName);
        
        // 合併評分
        const allSlots = this.getAllAvailableSlots();
        allSlots.forEach(slot => {
            let score = 0;
            let reasons = [];
            
            // 評分 1: 同品項
            if (sameProductLocations.some(loc => this.isSameLane(loc, slot))) {
                score += 40;
                reasons.push('同品項巷道');
            } else if (sameProductLocations.some(loc => this.isSameZone(loc, slot))) {
                score += 20;
                reasons.push('同品項區域');
            }
            
            // 評分 2: 類別匹配
            if (categoryZones.includes(this.getZoneFromLocation(slot))) {
                score += 30;
                reasons.push('類別區域');
            }
            
            // 評分 3: 低使用率
            const util = this.getSlotUtilization(slot);
            score += (1 - util) * 20;
            if (util < 0.5) reasons.push('空間充足');
            
            // 評分 4: FIFO 優化
            if (fifoOptimal.includes(slot)) {
                score += 10;
                reasons.push('FIFO 最佳');
            }
            
            suggestions.push({
                location: slot,
                score: score,
                reasons: reasons,
                utilization: (util * 100).toFixed(1) + '%',
                distance: this.calculateDistance(slot)
            });
        });
        
        // 排序並回傳前 5 個建議
        return suggestions
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);
    }
    
    // 取得同品項位置
    getSameProductLocations(productName) {
        return this.pallets
            .filter(p => p.productName === productName)
            .map(p => p.locationId);
    }
    
    // 取得類別區域
    getCategoryZones(category) {
        const zoneMap = {
            'finished': ['I-A', 'I-B', 'J-C', 'J-D'],
            'material': ['K-E', 'K-F'],
            'semifinished': ['K-G', 'K-H']
        };
        return zoneMap[category] || [];
    }
    
    // 取得低使用率區域
    getLowUtilizationZones() {
        const zoneUtil = {};
        
        this.pallets.forEach(p => {
            const zone = this.getZoneFromLocation(p.locationId);
            if (!zoneUtil[zone]) zoneUtil[zone] = { used: 0, total: 0 };
            zoneUtil[zone].used++;
        });
        
        // 計算總容量
        Object.keys(this.warehouseCapacity).forEach(warehouse => {
            Object.keys(this.warehouseCapacity[warehouse]).forEach(zone => {
                const zoneKey = `${warehouse}-${zone}`;
                if (!zoneUtil[zoneKey]) zoneUtil[zoneKey] = { used: 0 };
                zoneUtil[zoneKey].total = this.warehouseCapacity[warehouse][zone];
            });
        });
        
        return Object.entries(zoneUtil)
            .filter(([zone, data]) => data.used / data.total < 0.7)
            .map(([zone]) => zone);
    }
    
    // FIFO 最佳區域
    getFIFOOptimalZones(productName) {
        // 找出該品項最舊的批次所在位置，新品應放在同區但不同巷道
        const productPallets = this.pallets
            .filter(p => p.productName === productName)
            .sort((a, b) => (a.expDate || '').localeCompare(b.expDate || ''));
        
        if (productPallets.length === 0) return [];
        
        const oldestLocation = productPallets[0].locationId;
        const zone = this.getZoneFromLocation(oldestLocation);
        
        // 回傳同區域但不同巷道的空位
        return this.getAllAvailableSlots().filter(slot => {
            return this.getZoneFromLocation(slot) === zone && 
                   !this.isSameLane(slot, oldestLocation);
        });
    }
    
    // 工具函數
    getAllAvailableSlots() {
        const occupied = this.pallets.map(p => p.locationId);
        const allSlots = [];
        
        // I 庫: A/B 區, 01-08 巷, 1F-3F
        ['A', 'B'].forEach(zone => {
            for (let lane = 1; lane <= 8; lane++) {
                ['1F', '2F', '3F'].forEach(floor => {
                    const slot = `I-${zone}-${lane.toString().padStart(2, '0')}-${floor}`;
                    if (!occupied.includes(slot)) allSlots.push(slot);
                });
            }
        });
        
        // J 庫: C/D 區
        ['C', 'D'].forEach(zone => {
            for (let lane = 1; lane <= 8; lane++) {
                ['1F', '2F', '3F'].forEach(floor => {
                    const slot = `J-${zone}-${lane.toString().padStart(2, '0')}-${floor}`;
                    if (!occupied.includes(slot)) allSlots.push(slot);
                });
            }
        });
        
        // K 庫: E/F/G/H 區, 01-22 巷
        ['E', 'F', 'G', 'H'].forEach(zone => {
            for (let lane = 1; lane <= 22; lane++) {
                ['1F', '2F', '3F'].forEach(floor => {
                    const slot = `K-${zone}-${lane.toString().padStart(2, '0')}-${floor}`;
                    if (!occupied.includes(slot)) allSlots.push(slot);
                });
            }
        });
        
        return allSlots;
    }
    
    isSameLane(loc1, loc2) {
        const parts1 = loc1.split('-');
        const parts2 = loc2.split('-');
        return parts1[0] === parts2[0] && parts1[1] === parts2[1] && parts1[2] === parts2[2];
    }
    
    isSameZone(loc1, loc2) {
        const parts1 = loc1.split('-');
        const parts2 = loc2.split('-');
        return parts1[0] === parts2[0] && parts1[1] === parts2[1];
    }
    
    getZoneFromLocation(location) {
        const parts = location.split('-');
        return `${parts[0]}-${parts[1]}`;
    }
    
    getSlotUtilization(slot) {
        const lane = slot.substring(0, slot.lastIndexOf('-'));
        const lanePallets = this.pallets.filter(p => p.locationId.startsWith(lane));
        return lanePallets.length / 3; // 每巷道3層
    }
    
    calculateDistance(location) {
        // 簡化的距離計算（以巷道號碼為基準）
        const parts = location.split('-');
        const lane = parseInt(parts[2]);
        return lane; // 巷道越前面距離越近
    }
}

// ==================== 3. 增強調度分析邏輯 ====================

class EnhancedDispatchAnalyzer {
    constructor() {
        this.pallets = [];
        this.minThreshold = 0.3; // 30% 以下視為餘板
        this.maxCapacity = 100;   // 假設每板最大100
    }
    
    setPallets(pallets) {
        this.pallets = pallets;
    }
    
    // 🆕 智能合併分析（考慮效期、距離、優先級）
    analyzeSmartMerge(productName) {
        const productPallets = this.pallets.filter(p => p.productName === productName);
        const threshold = this.maxCapacity * this.minThreshold;
        const partials = productPallets.filter(p => p.quantity < threshold);
        
        if (partials.length < 2) return [];
        
        // 按效期分組
        const expGroups = this.groupByExpiry(partials);
        const mergePlans = [];
        
        expGroups.forEach(group => {
            if (group.length < 2) return;
            
            // 按數量排序（大到小）
            group.sort((a, b) => b.quantity - a.quantity);
            
            for (let i = 0; i < group.length - 1; i++) {
                const target = group[i];
                let remainingCapacity = this.maxCapacity - target.quantity;
                const sources = [];
                
                for (let j = i + 1; j < group.length; j++) {
                    const source = group[j];
                    if (source.quantity <= remainingCapacity) {
                        sources.push(source);
                        remainingCapacity -= source.quantity;
                    }
                }
                
                if (sources.length > 0) {
                    const priority = this.calculateMergePriority(target, sources);
                    mergePlans.push({
                        id: this.generatePlanId(),
                        type: '合併',
                        target: target,
                        sources: sources,
                        totalSaved: sources.length, // 省下的儲位數
                        priority: priority,
                        expDate: target.expDate,
                        distance: this.calculateMergeDistance(target, sources)
                    });
                }
            }
        });
        
        // 按優先級排序
        return mergePlans.sort((a, b) => b.priority - a.priority);
    }
    
    // 🆕 智能移位分析（考慮整合度、效期一致性）
    analyzeSmartMove(productName) {
        const productPallets = this.pallets.filter(p => p.productName === productName);
        
        if (productPallets.length < 2) return [];
        
        // 找出主要巷道（該品項數量最多的巷道）
        const laneGroups = {};
        productPallets.forEach(p => {
            const lane = this.getLane(p.locationId);
            if (!laneGroups[lane]) laneGroups[lane] = [];
            laneGroups[lane].push(p);
        });
        
        const sortedLanes = Object.entries(laneGroups)
            .sort((a, b) => b[1].length - a[1].length);
        
        if (sortedLanes.length < 2) return [];
        
        const mainLane = sortedLanes[0][0];
        const mainLanePallets = sortedLanes[0][1];
        const movePlans = [];
        
        // 分析非主巷道的板位
        for (let i = 1; i < sortedLanes.length; i++) {
            const [lane, pallets] = sortedLanes[i];
            
            pallets.forEach(pallet => {
                // 找主巷道的空位
                const availableSlots = this.findAvailableSlots(mainLane);
                
                if (availableSlots.length > 0) {
                    const priority = this.calculateMovePriority(pallet, mainLane, mainLanePallets);
                    movePlans.push({
                        id: this.generatePlanId(),
                        type: '移位',
                        pallet: pallet,
                        from: pallet.locationId,
                        to: availableSlots[0],
                        reason: '整合至主巷道',
                        priority: priority,
                        benefit: this.calculateMoveBenefit(pallet, availableSlots[0], mainLanePallets)
                    });
                }
            });
        }
        
        return movePlans.sort((a, b) => b.priority - a.priority);
    }
    
    // 🆕 效期預警分析
    analyzeExpiryRisk() {
        const now = new Date();
        const risks = [];
        
        this.pallets.forEach(pallet => {
            if (!pallet.expDate) return;
            
            const expDate = new Date(pallet.expDate);
            const daysUntilExp = Math.floor((expDate - now) / (1000 * 60 * 60 * 24));
            
            let level = 'safe';
            let action = '正常';
            
            if (daysUntilExp < 0) {
                level = 'expired';
                action = '立即處理';
            } else if (daysUntilExp <= 7) {
                level = 'critical';
                action = '緊急出貨';
            } else if (daysUntilExp <= 30) {
                level = 'warning';
                action = '優先出貨';
            } else if (daysUntilExp <= 60) {
                level = 'notice';
                action = '關注';
            }
            
            if (level !== 'safe') {
                risks.push({
                    pallet: pallet,
                    level: level,
                    daysLeft: daysUntilExp,
                    action: action,
                    priority: this.getRiskPriority(level)
                });
            }
        });
        
        return risks.sort((a, b) => b.priority - a.priority);
    }
    
    // 工具函數
    groupByExpiry(pallets) {
        const groups = {};
        pallets.forEach(p => {
            const key = p.expDate || 'no-date';
            if (!groups[key]) groups[key] = [];
            groups[key].push(p);
        });
        return Object.values(groups);
    }
    
    calculateMergePriority(target, sources) {
        // 因素: 1.節省空間數 2.效期接近度 3.移動距離短
        let score = sources.length * 30; // 每省一個位置 +30分
        
        // 效期一致性加分
        const sameExp = sources.every(s => s.expDate === target.expDate);
        if (sameExp) score += 20;
        
        // 近距離加分
        const avgDistance = sources.reduce((sum, s) => sum + this.calculateDistance(s.locationId, target.locationId), 0) / sources.length;
        score += Math.max(0, 20 - avgDistance);
        
        return score;
    }
    
    calculateMovePriority(pallet, mainLane, mainPallets) {
        let score = 50; // 基礎分
        
        // 孤立度：越孤立優先級越高
        const currentLanePallets = this.pallets.filter(p => 
            this.getLane(p.locationId) === this.getLane(pallet.locationId) &&
            p.productName === pallet.productName
        );
        if (currentLanePallets.length === 1) score += 30;
        
        // 效期一致性
        const mainExpDates = mainPallets.map(p => p.expDate).filter(d => d);
        if (mainExpDates.includes(pallet.expDate)) score += 20;
        
        return score;
    }
    
    calculateMoveBenefit(pallet, targetLocation, mainPallets) {
        return {
            consolidation: '巷道整合',
            fifoOptimization: this.willImproveFIFO(pallet, targetLocation, mainPallets),
            spaceEfficiency: '提升空間效率'
        };
    }
    
    willImproveFIFO(pallet, targetLocation, mainPallets) {
        // 簡化判斷：如果新位置讓效期排列更順序則為 true
        return Math.random() > 0.5; // 實際應計算效期順序
    }
    
    getRiskPriority(level) {
        const priorities = {
            'expired': 100,
            'critical': 80,
            'warning': 60,
            'notice': 40,
            'safe': 0
        };
        return priorities[level] || 0;
    }
    
    getLane(location) {
        return location.substring(0, location.lastIndexOf('-'));
    }
    
    findAvailableSlots(lane) {
        const occupied = this.pallets.map(p => p.locationId);
        const slots = [];
        ['1F', '2F', '3F'].forEach(floor => {
            const slot = `${lane}-${floor}`;
            if (!occupied.includes(slot)) slots.push(slot);
        });
        return slots;
    }
    
    calculateDistance(loc1, loc2) {
        const parts1 = loc1.split('-');
        const parts2 = loc2.split('-');
        return Math.abs(parseInt(parts1[2]) - parseInt(parts2[2]));
    }
    
    calculateMergeDistance(target, sources) {
        return sources.reduce((sum, s) => 
            sum + this.calculateDistance(s.locationId, target.locationId), 0
        ) / sources.length;
    }
    
    generatePlanId() {
        return 'PLAN-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4).toUpperCase();
    }
}

// ==================== 4. 庫存週轉率分析 ====================

class TurnoverAnalyzer {
    constructor() {
        this.inventoryLogs = [];
        this.pallets = [];
    }
    
    setData(pallets, logs) {
        this.pallets = pallets;
        this.inventoryLogs = logs || [];
    }
    
    // 計算品項週轉率
    calculateProductTurnover(productName, days = 30) {
        const now = new Date();
        const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        
        // 計算期間出貨數量
        const outboundQty = this.inventoryLogs
            .filter(log => 
                log.action === 'outbound' &&
                log.productName === productName &&
                new Date(log.timestamp) >= startDate
            )
            .reduce((sum, log) => sum + (log.quantity || 0), 0);
        
        // 計算平均庫存
        const currentStock = this.pallets
            .filter(p => p.productName === productName)
            .reduce((sum, p) => sum + p.quantity, 0);
        
        // 週轉率 = 出貨量 / 平均庫存 * (365 / 天數)
        if (currentStock === 0) return 0;
        const turnover = (outboundQty / currentStock) * (365 / days);
        
        return {
            productName: productName,
            turnoverRate: turnover.toFixed(2),
            outboundQty: outboundQty,
            currentStock: currentStock,
            days: days,
            level: this.getTurnoverLevel(turnover)
        };
    }
    
    // 計算所有品項週轉率
    calculateAllTurnover(days = 30) {
        const products = [...new Set(this.pallets.map(p => p.productName))];
        return products
            .map(product => this.calculateProductTurnover(product, days))
            .sort((a, b) => parseFloat(b.turnoverRate) - parseFloat(a.turnoverRate));
    }
    
    // 識別滯銷品
    identifySlowMoving(turnoverThreshold = 2) {
        const allTurnover = this.calculateAllTurnover();
        return allTurnover.filter(item => parseFloat(item.turnoverRate) < turnoverThreshold);
    }
    
    // 識別暢銷品
    identifyFastMoving(turnoverThreshold = 10) {
        const allTurnover = this.calculateAllTurnover();
        return allTurnover.filter(item => parseFloat(item.turnoverRate) >= turnoverThreshold);
    }
    
    getTurnoverLevel(rate) {
        if (rate >= 12) return 'fast'; // 快速週轉
        if (rate >= 6) return 'normal'; // 正常週轉
        if (rate >= 2) return 'slow'; // 緩慢週轉
        return 'very-slow'; // 滯銷
    }
}

// ==================== 5. 作業效率統計 ====================

class EfficiencyAnalyzer {
    constructor() {
        this.operationLogs = [];
    }
    
    setLogs(logs) {
        this.operationLogs = logs || [];
    }
    
    // 入庫效率分析
    analyzeInboundEfficiency(days = 7) {
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const inboundOps = this.operationLogs.filter(log => 
            log.action === 'inbound' && new Date(log.timestamp) >= startDate
        );
        
        if (inboundOps.length === 0) {
            return { avgTime: 0, totalOps: 0, efficiency: 0 };
        }
        
        const totalTime = inboundOps.reduce((sum, op) => sum + (op.duration || 0), 0);
        const avgTime = totalTime / inboundOps.length;
        
        // 效率分數 (理想時間5分鐘)
        const idealTime = 5;
        const efficiency = Math.max(0, 100 - (avgTime - idealTime) / idealTime * 100);
        
        return {
            avgTime: avgTime.toFixed(1),
            totalOps: inboundOps.length,
            efficiency: efficiency.toFixed(1),
            trend: this.calculateTrend(inboundOps, 'duration')
        };
    }
    
    // 揀貨效率分析
    analyzePickingEfficiency(days = 7) {
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const pickingOps = this.operationLogs.filter(log => 
            log.action === 'picking' && new Date(log.timestamp) >= startDate
        );
        
        if (pickingOps.length === 0) {
            return { avgTime: 0, avgItems: 0, itemsPerMinute: 0 };
        }
        
        const totalTime = pickingOps.reduce((sum, op) => sum + (op.duration || 0), 0);
        const totalItems = pickingOps.reduce((sum, op) => sum + (op.itemCount || 0), 0);
        
        return {
            avgTime: (totalTime / pickingOps.length).toFixed(1),
            avgItems: (totalItems / pickingOps.length).toFixed(1),
            itemsPerMinute: (totalItems / totalTime).toFixed(2),
            totalOps: pickingOps.length,
            trend: this.calculateTrend(pickingOps, 'duration')
        };
    }
    
    // 調度效率分析
    analyzeDispatchEfficiency(days = 7) {
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const dispatchOps = this.operationLogs.filter(log => 
            (log.action === 'merge' || log.action === 'move') && 
            new Date(log.timestamp) >= startDate
        );
        
        if (dispatchOps.length === 0) {
            return { totalOps: 0, spacesSaved: 0, efficiency: 0 };
        }
        
        const spacesSaved = dispatchOps
            .filter(op => op.action === 'merge')
            .reduce((sum, op) => sum + (op.spacesSaved || 1), 0);
        
        return {
            totalOps: dispatchOps.length,
            spacesSaved: spacesSaved,
            avgTimePerOp: (
                dispatchOps.reduce((sum, op) => sum + (op.duration || 0), 0) / dispatchOps.length
            ).toFixed(1),
            efficiency: this.calculateDispatchEfficiency(dispatchOps)
        };
    }
    
    // 人員效率排行
    analyzeOperatorPerformance(days = 7) {
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const recentOps = this.operationLogs.filter(log => 
            new Date(log.timestamp) >= startDate && log.operator
        );
        
        const operatorStats = {};
        
        recentOps.forEach(op => {
            if (!operatorStats[op.operator]) {
                operatorStats[op.operator] = {
                    name: op.operator,
                    totalOps: 0,
                    totalTime: 0,
                    errorCount: 0
                };
            }
            
            operatorStats[op.operator].totalOps++;
            operatorStats[op.operator].totalTime += op.duration || 0;
            if (op.hasError) operatorStats[op.operator].errorCount++;
        });
        
        return Object.values(operatorStats)
            .map(stat => ({
                ...stat,
                avgTime: (stat.totalTime / stat.totalOps).toFixed(1),
                accuracy: ((1 - stat.errorCount / stat.totalOps) * 100).toFixed(1),
                score: this.calculateOperatorScore(stat)
            }))
            .sort((a, b) => b.score - a.score);
    }
    
    calculateTrend(ops, field) {
        if (ops.length < 2) return 'stable';
        
        const mid = Math.floor(ops.length / 2);
        const firstHalf = ops.slice(0, mid);
        const secondHalf = ops.slice(mid);
        
        const firstAvg = firstHalf.reduce((sum, op) => sum + (op[field] || 0), 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((sum, op) => sum + (op[field] || 0), 0) / secondHalf.length;
        
        const change = ((secondAvg - firstAvg) / firstAvg) * 100;
        
        if (change < -5) return 'improving';
        if (change > 5) return 'declining';
        return 'stable';
    }
    
    calculateDispatchEfficiency(ops) {
        const avgDuration = ops.reduce((sum, op) => sum + (op.duration || 0), 0) / ops.length;
        const idealDuration = 10; // 理想10分鐘
        return Math.max(0, 100 - (avgDuration - idealDuration) / idealDuration * 100).toFixed(1);
    }
    
    calculateOperatorScore(stat) {
        // 綜合評分: 速度(40%) + 準確率(40%) + 作業量(20%)
        const speedScore = Math.max(0, 100 - (parseFloat(stat.avgTime) - 5) * 10);
        const accuracyScore = parseFloat(stat.accuracy);
        const volumeScore = Math.min(100, stat.totalOps * 2);
        
        return (speedScore * 0.4 + accuracyScore * 0.4 + volumeScore * 0.2).toFixed(1);
    }
}

// ==================== 6. 異常預警系統 ====================

class AlertSystem {
    constructor() {
        this.alerts = [];
        this.rules = {
            expiry: { critical: 7, warning: 30, notice: 60 },
            stock: { lowLevel: 10, overstock: 1000 },
            temperature: { min: -20, max: -15 },
            utilization: { low: 0.3, high: 0.95 }
        };
    }
    
    // 檢查所有異常
    checkAllAlerts(pallets) {
        this.alerts = [];
        
        this.checkExpiryAlerts(pallets);
        this.checkStockAlerts(pallets);
        this.checkUtilizationAlerts(pallets);
        this.checkDuplicateAlerts(pallets);
        
        return this.alerts.sort((a, b) => b.priority - a.priority);
    }
    
    // 效期異常
    checkExpiryAlerts(pallets) {
        const now = new Date();
        
        pallets.forEach(pallet => {
            if (!pallet.expDate) return;
            
            const expDate = new Date(pallet.expDate);
            const daysLeft = Math.floor((expDate - now) / (1000 * 60 * 60 * 24));
            
            if (daysLeft < 0) {
                this.addAlert('expired', `${pallet.productName} 已過期`, {
                    pallet: pallet,
                    daysOverdue: Math.abs(daysLeft),
                    action: '立即下架處理'
                }, 100);
            } else if (daysLeft <= this.rules.expiry.critical) {
                this.addAlert('critical-expiry', `${pallet.productName} 即將過期`, {
                    pallet: pallet,
                    daysLeft: daysLeft,
                    action: '緊急出貨'
                }, 90);
            } else if (daysLeft <= this.rules.expiry.warning) {
                this.addAlert('warning-expiry', `${pallet.productName} 效期預警`, {
                    pallet: pallet,
                    daysLeft: daysLeft,
                    action: '優先安排出貨'
                }, 70);
            }
        });
    }
    
    // 庫存異常
    checkStockAlerts(pallets) {
        const productStock = {};
        
        pallets.forEach(pallet => {
            if (!productStock[pallet.productName]) {
                productStock[pallet.productName] = 0;
            }
            productStock[pallet.productName] += pallet.quantity;
        });
        
        Object.entries(productStock).forEach(([product, qty]) => {
            if (qty < this.rules.stock.lowLevel) {
                this.addAlert('low-stock', `${product} 庫存不足`, {
                    product: product,
                    currentQty: qty,
                    action: '補貨'
                }, 60);
            } else if (qty > this.rules.stock.overstock) {
                this.addAlert('overstock', `${product} 庫存過多`, {
                    product: product,
                    currentQty: qty,
                    action: '促銷或調撥'
                }, 50);
            }
        });
    }
    
    // 使用率異常
    checkUtilizationAlerts(pallets) {
        const zones = {};
        
        pallets.forEach(pallet => {
            const zone = pallet.locationId.substring(0, 3); // I-A, J-C, etc.
            if (!zones[zone]) zones[zone] = 0;
            zones[zone]++;
        });
        
        Object.entries(zones).forEach(([zone, count]) => {
            const capacity = this.getZoneCapacity(zone);
            const utilization = count / capacity;
            
            if (utilization >= this.rules.utilization.high) {
                this.addAlert('high-utilization', `${zone} 區使用率過高`, {
                    zone: zone,
                    utilization: (utilization * 100).toFixed(1) + '%',
                    action: '考慮調度或清理'
                }, 55);
            } else if (utilization <= this.rules.utilization.low) {
                this.addAlert('low-utilization', `${zone} 區使用率過低`, {
                    zone: zone,
                    utilization: (utilization * 100).toFixed(1) + '%',
                    action: '可能需要整合'
                }, 30);
            }
        });
    }
    
    // 重複板號檢查
    checkDuplicateAlerts(pallets) {
        const palletIds = {};
        
        pallets.forEach(pallet => {
            if (!palletIds[pallet.palletId]) {
                palletIds[pallet.palletId] = [];
            }
            palletIds[pallet.palletId].push(pallet);
        });
        
        Object.entries(palletIds).forEach(([palletId, duplicates]) => {
            if (duplicates.length > 1) {
                this.addAlert('duplicate', `重複板號: ${palletId}`, {
                    palletId: palletId,
                    count: duplicates.length,
                    locations: duplicates.map(p => p.locationId),
                    action: '檢查並修正'
                }, 80);
            }
        });
    }
    
    addAlert(type, message, data, priority) {
        this.alerts.push({
            id: 'ALERT-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
            type: type,
            message: message,
            data: data,
            priority: priority,
            timestamp: new Date(),
            status: 'active'
        });
    }
    
    getZoneCapacity(zone) {
        const capacities = {
            'I-A': 24, 'I-B': 24,
            'J-C': 24, 'J-D': 24,
            'K-E': 66, 'K-F': 66, 'K-G': 66, 'K-H': 66
        };
        return capacities[zone] || 24;
    }
}

// ==================== 7. LINE 通知整合 ====================

class LineNotifier {
    constructor() {
        this.token = localStorage.getItem('line_notify_token') || '';
        this.enabled = localStorage.getItem('line_notify_enabled') === 'true';
    }
    
    setToken(token) {
        this.token = token;
        localStorage.setItem('line_notify_token', token);
    }
    
    setEnabled(enabled) {
        this.enabled = enabled;
        localStorage.setItem('line_notify_enabled', enabled);
    }
    
    async sendNotification(message) {
        if (!this.enabled || !this.token) {
            console.warn('LINE Notify 未啟用或未設定 Token');
            return false;
        }
        
        try {
            const response = await fetch('https://notify-api.line.me/api/notify', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: `message=${encodeURIComponent(message)}`
            });
            
            return response.ok;
        } catch (error) {
            console.error('LINE 通知發送失敗:', error);
            return false;
        }
    }
    
    async sendExpiryAlert(pallet, daysLeft) {
        const message = `
⚠️ 效期預警 ⚠️
品項: ${pallet.productName}
板號: ${pallet.palletId}
儲位: ${pallet.locationId}
剩餘天數: ${daysLeft} 天
效期: ${pallet.expDate}
建議: ${daysLeft < 7 ? '緊急出貨' : '優先安排出貨'}
        `.trim();
        
        return await this.sendNotification(message);
    }
    
    async sendLowStockAlert(product, quantity) {
        const message = `
📦 庫存不足警告
品項: ${product}
目前庫存: ${quantity}
建議動作: 請安排補貨
        `.trim();
        
        return await this.sendNotification(message);
    }
    
    async sendPickingComplete(waveNo, totalItems) {
        const message = `
✅ 揀貨完成
波次編號: ${waveNo}
揀貨項目: ${totalItems} 項
時間: ${new Date().toLocaleString('zh-TW')}
        `.trim();
        
        return await this.sendNotification(message);
    }
}

// ==================== 8. Email 通知整合 ====================

class EmailNotifier {
    constructor() {
        // EmailJS 設定 (需要在 emailjs.com 註冊)
        this.serviceId = localStorage.getItem('email_service_id') || '';
        this.templateId = localStorage.getItem('email_template_id') || '';
        this.publicKey = localStorage.getItem('email_public_key') || '';
        this.enabled = localStorage.getItem('email_notify_enabled') === 'true';
    }
    
    setConfig(serviceId, templateId, publicKey) {
        this.serviceId = serviceId;
        this.templateId = templateId;
        this.publicKey = publicKey;
        
        localStorage.setItem('email_service_id', serviceId);
        localStorage.setItem('email_template_id', templateId);
        localStorage.setItem('email_public_key', publicKey);
        
        if (window.emailjs) {
            emailjs.init(publicKey);
        }
    }
    
    setEnabled(enabled) {
        this.enabled = enabled;
        localStorage.setItem('email_notify_enabled', enabled);
    }
    
    async sendEmail(to, subject, content) {
        if (!this.enabled || !this.serviceId || !this.templateId) {
            console.warn('Email 通知未啟用或未完整設定');
            return false;
        }
        
        try {
            const templateParams = {
                to_email: to,
                subject: subject,
                message: content,
                from_name: 'Terry WMS 系統'
            };
            
            await emailjs.send(this.serviceId, this.templateId, templateParams);
            return true;
        } catch (error) {
            console.error('Email 發送失敗:', error);
            return false;
        }
    }
    
    async sendExpiryReport(recipients, expiringItems) {
        const content = `
<h2>效期預警報表</h2>
<p>以下品項即將到期，請盡快處理：</p>
<table border="1" cellpadding="5" style="border-collapse: collapse;">
    <tr>
        <th>品項</th>
        <th>板號</th>
        <th>儲位</th>
        <th>效期</th>
        <th>剩餘天數</th>
        <th>建議動作</th>
    </tr>
    ${expiringItems.map(item => `
    <tr>
        <td>${item.productName}</td>
        <td>${item.palletId}</td>
        <td>${item.locationId}</td>
        <td>${item.expDate}</td>
        <td>${item.daysLeft}</td>
        <td>${item.action}</td>
    </tr>
    `).join('')}
</table>
<p>報表產生時間: ${new Date().toLocaleString('zh-TW')}</p>
        `;
        
        return await this.sendEmail(recipients.join(','), '【WMS】效期預警報表', content);
    }
    
    async sendDailyReport(recipient, stats) {
        const content = `
<h2>WMS 每日營運報表</h2>
<h3>入庫統計</h3>
<ul>
    <li>總入庫數: ${stats.inbound.total}</li>
    <li>平均時效: ${stats.inbound.avgTime} 分鐘</li>
</ul>
<h3>出貨統計</h3>
<ul>
    <li>總出貨數: ${stats.outbound.total}</li>
    <li>完成波次: ${stats.outbound.waves}</li>
</ul>
<h3>庫存狀況</h3>
<ul>
    <li>總庫存: ${stats.inventory.total}</li>
    <li>使用率: ${stats.inventory.utilization}%</li>
</ul>
<p>報表日期: ${new Date().toLocaleDateString('zh-TW')}</p>
        `;
        
        return await this.sendEmail(recipient, '【WMS】每日營運報表', content);
    }
}

// ==================== 9. 自訂報表產生器 ====================

class CustomReportGenerator {
    constructor() {
        this.templates = this.loadTemplates();
    }
    
    loadTemplates() {
        const saved = localStorage.getItem('custom_report_templates');
        return saved ? JSON.parse(saved) : [];
    }
    
    saveTemplates() {
        localStorage.setItem('custom_report_templates', JSON.stringify(this.templates));
    }
    
    // 建立報表範本
    createTemplate(name, config) {
        const template = {
            id: 'TPL-' + Date.now(),
            name: name,
            columns: config.columns, // [{field: 'productName', label: '品項'}, ...]
            filters: config.filters,  // [{field: 'status', operator: '==', value: 'normal'}]
            sort: config.sort,        // {field: 'expDate', order: 'asc'}
            groupBy: config.groupBy,  // 'productName'
            calculations: config.calculations, // [{field: 'quantity', calc: 'sum'}]
            createdAt: new Date()
        };
        
        this.templates.push(template);
        this.saveTemplates();
        return template;
    }
    
    // 產生報表
    generateReport(templateId, data) {
        const template = this.templates.find(t => t.id === templateId);
        if (!template) throw new Error('範本不存在');
        
        let result = [...data];
        
        // 1. 篩選
        if (template.filters) {
            result = this.applyFilters(result, template.filters);
        }
        
        // 2. 排序
        if (template.sort) {
            result = this.applySort(result, template.sort);
        }
        
        // 3. 分組
        if (template.groupBy) {
            result = this.applyGrouping(result, template.groupBy, template.calculations);
        }
        
        // 4. 選擇欄位
        if (template.columns) {
            result = result.map(row => {
                const newRow = {};
                template.columns.forEach(col => {
                    newRow[col.label] = row[col.field];
                });
                return newRow;
            });
        }
        
        return result;
    }
    
    applyFilters(data, filters) {
        return data.filter(row => {
            return filters.every(filter => {
                const value = row[filter.field];
                switch (filter.operator) {
                    case '==': return value == filter.value;
                    case '!=': return value != filter.value;
                    case '>': return value > filter.value;
                    case '<': return value < filter.value;
                    case '>=': return value >= filter.value;
                    case '<=': return value <= filter.value;
                    case 'contains': return String(value).includes(filter.value);
                    default: return true;
                }
            });
        });
    }
    
    applySort(data, sort) {
        return data.sort((a, b) => {
            const aVal = a[sort.field];
            const bVal = b[sort.field];
            const order = sort.order === 'desc' ? -1 : 1;
            return (aVal > bVal ? 1 : -1) * order;
        });
    }
    
    applyGrouping(data, groupField, calculations) {
        const groups = {};
        
        data.forEach(row => {
            const key = row[groupField];
            if (!groups[key]) {
                groups[key] = { [groupField]: key, items: [] };
            }
            groups[key].items.push(row);
        });
        
        return Object.values(groups).map(group => {
            const result = { [groupField]: group[groupField] };
            
            if (calculations) {
                calculations.forEach(calc => {
                    const values = group.items.map(item => item[calc.field]);
                    switch (calc.calc) {
                        case 'sum':
                            result[`${calc.field}_總計`] = values.reduce((a, b) => a + b, 0);
                            break;
                        case 'avg':
                            result[`${calc.field}_平均`] = values.reduce((a, b) => a + b, 0) / values.length;
                            break;
                        case 'count':
                            result[`數量`] = values.length;
                            break;
                        case 'max':
                            result[`${calc.field}_最大`] = Math.max(...values);
                            break;
                        case 'min':
                            result[`${calc.field}_最小`] = Math.min(...values);
                            break;
                    }
                });
            }
            
            return result;
        });
    }
    
    // 匯出為 Excel
    exportToExcel(reportData, filename) {
        const ws = XLSX.utils.json_to_sheet(reportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, '報表');
        XLSX.writeFile(wb, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
    }
}

// ==================== 全局實例化 ====================
window.ProductionScheduler = ProductionScheduler;
window.SmartInboundSuggester = SmartInboundSuggester;
window.EnhancedDispatchAnalyzer = EnhancedDispatchAnalyzer;
window.TurnoverAnalyzer = TurnoverAnalyzer;
window.EfficiencyAnalyzer = EfficiencyAnalyzer;
window.AlertSystem = AlertSystem;
window.LineNotifier = LineNotifier;
window.EmailNotifier = EmailNotifier;
window.CustomReportGenerator = CustomReportGenerator;

console.log('✅ WMS v10.0 功能增強包載入完成');
