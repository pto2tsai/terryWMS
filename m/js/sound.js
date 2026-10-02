// 手機的聲音、語音、螢幕外框閃光（揀貨畫面和「聲音試聽」頁共用）
// 每支手機可以在「聲音試聽」頁替每個時機選 A 遊戲／B 鐘聲／C 說話，記在這支手機；沒選的用 B 鐘聲
(function() {
    // 同一個發聲器（iPhone 有數量限制，不能每次新開）；手機要先碰過螢幕才能出聲：第一次點畫面時準備好
    let ctx = null, voiceReady = false;
    function unlock() {
        try {
            if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) ctx = new AC(); }
            if (ctx && ctx.state === 'suspended') ctx.resume();
            if (!voiceReady && window.speechSynthesis) { voiceReady = true; window.speechSynthesis.speak(new SpeechSynthesisUtterance('')); }   // iPhone：第一次要在點畫面時說話
        } catch (e) {}
    }
    window.unlockSound = unlock;
    document.addEventListener('touchstart', unlock, { passive: true });
    document.addEventListener('click', unlock);

    function getPref(k, dflt) { try { const v = localStorage.getItem(k); return v === null ? dflt : v; } catch (e) { return dflt; } }
    function setPref(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
    window.soundOn = function() { return getPref('tw-sound', 'on') !== 'off'; };
    window.voiceOn = function() { return getPref('tw-voice', 'on') !== 'off'; };
    window.flashOn = function() { return getPref('tw-flash', 'on') !== 'off'; };
    window.setFlashOn = function(on) { setPref('tw-flash', on ? 'on' : 'off'); };

    // ---------- 發聲 ----------
    // 一個音：頻率 f（可以滑到 f2）、第 at 秒開始、長 d 秒
    function tone(f, at, d, type, vol, f2) {
        const t0 = ctx.currentTime + 0.03 + at, o = ctx.createOscillator(), g = ctx.createGain(), v = vol || 0.5;
        o.type = type || 'sine'; o.frequency.setValueAtTime(f, t0);
        if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + d);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(v, t0 + 0.012);
        g.gain.setValueAtTime(v, t0 + Math.max(0.02, d - 0.04));
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
        o.connect(g); g.connect(ctx.destination); o.start(t0); o.stop(t0 + d + 0.02);
    }
    // 鐘聲：幾個泛音一起響、慢慢消失
    function bell(f, at, d, vol) {
        const t0 = ctx.currentTime + 0.03 + at, v = vol || 0.6;
        [[1, 1], [2.0, 0.55], [3.01, 0.35], [4.2, 0.22], [5.43, 0.15]].forEach(function(p) {
            const o = ctx.createOscillator(), g = ctx.createGain();
            o.type = 'sine'; o.frequency.value = f * p[0];
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.exponentialRampToValueAtTime(v * p[1], t0 + 0.005);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + d / p[0] * 1.5);
            o.connect(g); g.connect(ctx.destination); o.start(t0); o.stop(t0 + d * 1.6);
        });
    }
    // 說話風的短字（不受「語音」開關影響，它算聲音）
    let wordUntil = 0;
    function word(text, delay) {
        wordUntil = Date.now() + 1200;
        setTimeout(function() { sayNow(text); }, delay || 0);
    }

    // 每一種：回傳大概響多久（秒），語音會等它響完再念
    const SETS = {
        A: {   // 遊戲風
            ok: function() { tone(988, 0, 0.07, 'square', 0.35); tone(1319, 0.07, 0.2, 'square', 0.35); return 0.3; },
            err: function() { tone(110, 0, 0.5, 'sawtooth', 0.6); tone(117, 0, 0.5, 'sawtooth', 0.5); return 0.5; },
            done: function() { [523, 659, 784].forEach(function(f, i) { tone(f, i * 0.06, 0.06, 'square', 0.3); }); tone(1047, 0.18, 0.16, 'square', 0.3); return 0.35; },
            short: function() { tone(523, 0, 0.18, 'triangle', 0.8, 494); tone(392, 0.22, 0.32, 'triangle', 0.8, 330); return 0.55; },
            sorted: function() { tone(700, 0, 0.09, 'sine', 0.7, 1500); return 0.1; },
            finish: function() { [[523, 0], [659, 0.11], [784, 0.22], [1047, 0.33]].forEach(function(n) { tone(n[0], n[1], 0.1, 'square', 0.3); }); tone(784, 0.48, 0.12, 'square', 0.3); tone(1047, 0.62, 0.45, 'square', 0.35); tone(1319, 0.62, 0.45, 'square', 0.2); return 1.1; },
            alarm: function() { for (let i = 0; i < 4; i++) { tone(700, i * 0.45, 0.22, 'square', 0.8, 1300); tone(1300, i * 0.45 + 0.22, 0.22, 'square', 0.8, 700); } return 1.8; }
        },
        B: {   // 鐘聲風（預設）
            ok: function() { bell(1568, 0, 0.6, 0.6); return 0.4; },
            err: function() { bell(196, 0, 0.9, 0.8); bell(277, 0, 0.9, 0.6); bell(196, 0.35, 0.9, 0.8); bell(277, 0.35, 0.9, 0.6); return 0.9; },
            done: function() { bell(1047, 0, 0.6, 0.6); bell(1568, 0.14, 0.8, 0.6); return 0.5; },
            short: function() { bell(784, 0, 0.7, 0.7); bell(622, 0.22, 0.7, 0.7); bell(523, 0.44, 1, 0.7); return 0.9; },
            sorted: function() { bell(2093, 0, 0.4, 0.4); return 0.3; },
            finish: function() { [[659, 0], [523, 0.32], [587, 0.64], [392, 0.96], [392, 1.5], [587, 1.82], [659, 2.14]].forEach(function(n) { bell(n[0], n[1], 1, 0.7); }); bell(523, 2.46, 1.6, 0.8); return 1.5; },
            alarm: function() { for (let i = 0; i < 8; i++) bell(i % 2 ? 988 : 1319, i * 0.18, 0.5, 0.9); return 1.5; }
        },
        C: {   // 說話風（前面一個很短的提示音，聽得出是系統在說話）
            ok: function() { tone(1800, 0, 0.04, 'sine', 0.3); word('好'); return 0.6; },
            err: function() { tone(220, 0, 0.12, 'square', 0.4); word('錯了'); return 0.9; },
            done: function() { tone(1800, 0, 0.04, 'sine', 0.3); word('拿好了'); return 1; },
            short: function() { tone(440, 0, 0.08, 'triangle', 0.5); word('不夠'); return 0.9; },
            sorted: function() { tone(1800, 0, 0.04, 'sine', 0.3); word('分好了'); return 1; },
            finish: function() { tone(1047, 0, 0.1, 'sine', 0.4); tone(1319, 0.1, 0.18, 'sine', 0.4); word('完成'); return 1; },
            alarm: function() { tone(1000, 0, 0.3, 'square', 0.9); tone(1000, 0.4, 0.3, 'square', 0.9); word('注意，鼎新改單', 800); return 2; }
        }
    };
    window.SOUND_EVENTS = [
        ['ok', '掃對了', '儲位、板號掃對'],
        ['err', '掃錯了', '拿錯板、走錯儲位'],
        ['done', '一項拿好了', '按「拿好了」或掃完一項'],
        ['short', '不夠', '按「不夠」記下缺貨'],
        ['sorted', '這家分好了', '分貨時一家好了'],
        ['finish', '全部完成', '全部拿完、全部分好、波次完成'],
        ['alarm', '鼎新改單警示', '要放回、改了數量（這個不能關）']
    ];
    // 這支手機每個時機選了哪一種（沒選＝B）
    window.soundStyles = function() { try { return JSON.parse(getPref('tw-sound-style', '{}')) || {}; } catch (e) { return {}; } };
    window.setSoundStyle = function(ev, style) { const m = window.soundStyles(); if (style) m[ev] = style; else delete m[ev]; setPref('tw-sound-style', JSON.stringify(m)); };
    window.resetSoundStyles = function() { setPref('tw-sound-style', '{}'); };
    function styleOf(ev) { const s = window.soundStyles()[ev]; return SETS[s] ? s : 'B'; }

    const VIBRATE = { err: [150, 80, 150], short: [120, 60, 120], finish: [80, 60, 80, 60, 160], alarm: [400, 150, 400, 150, 400] };
    let sfxUntil = 0;   // 提示音響到什麼時候（語音等它響完再念）
    // 播某一種（試聽頁用）
    window.playSound = function(ev, style) {
        unlock();
        if (!ctx) return;
        try { const sec = SETS[style || styleOf(ev)][ev](); sfxUntil = Date.now() + Math.min(1500, sec * 1000); } catch (e) {}
    };
    // 揀貨畫面用：震動＋外框閃光＋這支手機選的聲音（聲音關掉時只剩鼎新改單警示會響）
    window.sfx = function(name) {
        try { if (navigator.vibrate) navigator.vibrate(VIBRATE[name] || 60); } catch (e) {}   // iPhone 不支援震動，會略過
        window.edgeFlash(name);
        if (name !== 'alarm' && !window.soundOn()) return;
        window.playSound(name);
    };

    // ---------- 語音 ----------
    function sayNow(text) {
        if (!window.speechSynthesis) return;
        try {
            const u = new SpeechSynthesisUtterance(text);
            u.lang = 'zh-TW'; u.rate = 1.05; u.volume = 1;
            const vs = window.speechSynthesis.getVoices();
            const v = vs.find(function(x) { return /zh[-_]TW/i.test(x.lang); }) || vs.find(function(x) { return /^zh/i.test(x.lang); });
            if (v) u.voice = v;
            window.speechSynthesis.speak(u);
        } catch (e) {}
    }
    // 念出下一項之類的話（開關在主選單右上角）；說話風的短字還沒念完就排在它後面
    window.speak = function(text, force) {
        if (!text || !window.speechSynthesis || (!force && !window.voiceOn())) return;
        try {
            if (Date.now() > wordUntil) window.speechSynthesis.cancel();
            setTimeout(function() { sayNow(text); }, Math.max(250, sfxUntil - Date.now()));
        } catch (e) {}
    };
    if (window.speechSynthesis) try { window.speechSynthesis.getVoices(); } catch (e) {}

    // ---------- 螢幕外框閃光 ----------
    // 綠＝對／拿好、紅＝錯、橘＝不夠、藍＝分好；鼎新改單紅橘交替一直閃，直到按「知道了」（這個不能關）
    const FLASH = { ok: ['#22c55e', 1, 160], done: ['#22c55e', 1, 260], err: ['#ef4444', 2, 180], short: ['#f97316', 2, 220],
        sorted: ['#3b82f6', 1, 260], finish: ['#22c55e', 2, 450], alarm: ['#f97316', 0, 250] };
    let flashTimers = [], alarmLoop = null;
    function flashEl() {
        let el = document.getElementById('edge-flash');
        if (!el) {
            el = document.createElement('div'); el.id = 'edge-flash';
            el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:1000;box-shadow:inset 0 0 0 14px var(--fc,transparent);opacity:0';
            document.body.appendChild(el);
        }
        return el;
    }
    function setOn(el, on) { el.classList.toggle('on', on); el.style.opacity = on ? '1' : '0'; }
    window.stopFlash = function() {
        flashTimers.forEach(clearTimeout); flashTimers = [];
        if (alarmLoop) { clearInterval(alarmLoop); alarmLoop = null; }
        const el = document.getElementById('edge-flash'); if (el) setOn(el, false);
    };
    window.edgeFlash = function(name) {
        const f = FLASH[name];
        if (!f) return;
        if (alarmLoop && name !== 'alarm') return;   // 改單警示閃著的時候，其他的不蓋掉它
        if (name !== 'alarm' && !window.flashOn()) return;
        window.stopFlash();
        const el = flashEl();
        if (name === 'alarm') {
            let i = 0;
            alarmLoop = setInterval(function() { el.style.setProperty('--fc', i % 2 ? '#ef4444' : '#f97316'); setOn(el, !el.classList.contains('on')); i++; }, f[2]);
            return;
        }
        el.style.setProperty('--fc', f[0]);
        for (let i = 0; i < f[1]; i++) {
            flashTimers.push(setTimeout(function() { setOn(el, true); }, i * f[2] * 2));
            flashTimers.push(setTimeout(function() { setOn(el, false); }, i * f[2] * 2 + f[2]));
        }
    };
})();
