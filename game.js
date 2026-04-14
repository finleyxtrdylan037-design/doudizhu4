/**
 * 四人斗地主 (Si Ren Dou Di Zhu) - Game Logic
 * 兼容性：ES5, iOS Chrome/Safari
 */

(function() {
    // --- 全局变量与状态 ---
    var audioCtx = null;
    var cards = []; // 全副牌 (108张)
    var players = [
        { id: 0, name: 'Player', hand: [], type: 'farmer' }, // 玩家
        { id: 1, name: 'AI_A', hand: [], type: 'farmer' },   // 左 (上家)
        { id: 2, name: 'AI_B', hand: [], type: 'farmer' },   // 顶 (对家)
        { id: 3, name: 'AI_C', hand: [], type: 'farmer' }    // 右 (下家)
    ];
    var bottomCards = [];
    var landlordIdx = -1;
    var currentPlayer = -1;
    var lastHand = null; // 上一手出的牌 {cards, type, value, count}
    var selectedCards = [];
    var totalScore = 0;
    var basePoint = 0;
    var multiplier = 1;
    var gameStage = 'waiting'; // bidding, playing, ended

    // 牌值映射 (3-15对应3-2, 16小王, 17大王)
    var cardValues = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
    var suits = ['\u2660', '\u2665', '\u2666', '\u2663']; // ♠, ♥, ♦, ♣

    // --- 初始化音效系统 (iOS要求交互后触发) ---
    window.initAudio = function() {
        if (audioCtx) return;
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    };

    function playTone(freq, type, duration, volume) {
        if (!audioCtx) return;
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(volume || 0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    }

    // --- 核心逻辑：发牌与初始化 ---
    function initGame() {
        // 创建两副牌 (52*2 + 4*2 = 108张)
        cards = [];
        for (var d = 0; d < 2; d++) {
            for (var v = 0; v < 13; v++) {
                for (var s = 0; s < 4; s++) {
                    cards.push({ val: cardValues[v], suit: suits[s], id: cards.length });
                }
            }
            cards.push({ val: 16, suit: '', id: cards.length }); // 小王
            cards.push({ val: 17, suit: '', id: cards.length }); // 大王
        }
        
        // Fisher-Yates 洗牌
        for (var i = cards.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var temp = cards[i];
            cards[i] = cards[j];
            cards[j] = temp;
        }

        // 分发手牌 (每人25张, 留8张底牌)
        for (var p = 0; p < 4; p++) {
            players[p].hand = cards.splice(0, 25);
            sortHand(players[p].hand);
        }
        bottomCards = cards; // 剩余8张
        
        renderAll();
        startBidding();
    }

    function sortHand(hand) {
        hand.sort(function(a, b) {
            return b.val - a.val || 0;
        });
    }

    // --- UI 渲染函数 ---
    function renderAll() {
        renderPlayerHand();
        renderAICounts();
        renderBottomCards(false);
    }

    function renderPlayerHand() {
        var container = document.getElementById('player-hand');
        container.innerHTML = '';
        players[0].hand.forEach(function(card) {
            var cardEl = document.createElement('div');
            cardEl.className = 'card' + (isSelected(card) ? ' selected' : '');
            cardEl.innerHTML = '<div class="value ' + getSuitClass(card.suit) + '">' + 
                               formatVal(card.val) + '</div>' +
                               '<div class="suit">' + card.suit + '</div>';
            cardEl.onclick = function() { toggleSelect(card); };
            container.appendChild(cardEl);
        });
    }

    function renderAICounts() {
        document.getElementById('hand-left-count').innerText = players[1].hand.length;
        document.getElementById('hand-top-count').innerText = players[2].hand.length;
        document.getElementById('hand-right-count').innerText = players[3].hand.length;
    }

    function renderBottomCards(show) {
        var container = document.getElementById('landlord-cards');
        container.innerHTML = '';
        bottomCards.forEach(function(card) {
            var el = document.createElement('div');
            el.className = 'card ' + (show ? '' : 'back');
            if (show) {
                el.innerHTML = '<div class="value ' + getSuitClass(card.suit) + '">' + formatVal(card.val) + '</div>';
            }
            container.appendChild(el);
        });
    }

    // --- 辅助工具 ---
    function formatVal(v) {
        if (v <= 10) return v;
        if (v === 11) return 'J';
        if (v === 12) return 'Q';
        if (v === 13) return 'K';
        if (v === 14) return 'A';
        if (v === 15) return '2';
        return v === 16 ? '\u5c0f\u738b' : '\u5927\u738b'; // 小王, 大王
    }

    function getSuitClass(suit) {
        return (suit === '\u2665' || suit === '\u2666') ? 'red' : 'black';
    }

    function isSelected(card) {
        return selectedCards.indexOf(card) !== -1;
    }

    function toggleSelect(card) {
        playTone(1200, 'sine', 0.05, 0.05); // select音效
        var idx = selectedCards.indexOf(card);
        if (idx === -1) selectedCards.push(card);
        else selectedCards.splice(idx, 1);
        renderPlayerHand();
    }

    // --- 叫牌阶段 ---
    function startBidding() {
        gameStage = 'bidding';
        landlordIdx = -1;
        basePoint = 0;
        document.getElementById('bid-bar').style.display = 'flex';
        // 简化版：随机从玩家开始
    }

    window.handleBid = function(score) {
        if (score > basePoint) {
            basePoint = score;
            landlordIdx = 0; // 玩家暂时作为最高分
        }
        // 此处应循环四个玩家叫牌，简化版直接让玩家当或跳过
        if (score > 0) finalizeLandlord(0);
        else finalizeLandlord(Math.floor(Math.random() * 3) + 1);
    };

    function finalizeLandlord(idx) {
        landlordIdx = idx;
        document.getElementById('bid-bar').style.display = 'none';
        document.getElementById('action-bar').style.display = 'flex';
        
        // 地主拿底牌
        players[idx].hand = players[idx].hand.concat(bottomCards);
        players[idx].type = 'landlord';
        sortHand(players[idx].hand);
        
        renderBottomCards(true);
        renderAll();
        
        currentPlayer = idx;
        gameStage = 'playing';
        updateGameInfo();
        
        if (currentPlayer !== 0) executeAI();
    }

    function updateGameInfo() {
        document.getElementById('game-info').innerText = 
            '\u500d\u6570: ' + multiplier + 'x | \u5e95\u5206: ' + basePoint; // 倍数, 底分
    }

    // --- 牌型校验与比较 ---
    /**
     * 四人版牌型校验 (基于两副牌)
     * 需识别：单/对/三带对/顺子/连对/飞机/炸弹(4-8张)/天王炸
     */
    function analyzeHand(cards) {
        if (cards.length === 0) return null;
        var sorted = cards.slice().sort(function(a, b) { return a.val - b.val; });
        var len = sorted.length;
        var counts = {};
        sorted.forEach(function(c) { counts[c.val] = (counts[c.val] || 0) + 1; });
        var valArr = Object.keys(counts).map(Number).sort(function(a,b){return a-b;});

        // 1. 炸弹 (4-8张)
        if (valArr.length === 1 && counts[valArr[0]] >= 4) {
            return { type: 'bomb', value: valArr[0], count: counts[valArr[0]] };
        }
        // 2. 天王炸 (4张王)
        var kings = (counts[16] || 0) + (counts[17] || 0);
        if (len === 4 && kings === 4) return { type: 'rocket', value: 999, count: 4 };

        // 3. 基础牌型
        if (len === 1) return { type: 'single', value: sorted[0].val, count: 1 };
        if (len === 2 && sorted[0].val === sorted[1].val) return { type: 'pair', value: sorted[0].val, count: 2 };
        
        // 4. 三带对 (四人版不准带单)
        if (len === 5 && valArr.length === 2) {
            if (counts[valArr[0]] === 3 && counts[valArr[1]] === 2) return { type: 'trio_pair', value: valArr[0], count: 5 };
            if (counts[valArr[1]] === 3 && counts[valArr[0]] === 2) return { type: 'trio_pair', value: valArr[1], count: 5 };
        }

        // 5. 顺子 (5张起, 不含2和王)
        if (len >= 5 && valArr.length === len && sorted[len-1].val < 15) {
            var isSequence = true;
            for(var i=0; i<len-1; i++) if(sorted[i+1].val !== sorted[i].val+1) isSequence = false;
            if(isSequence) return { type: 'sequence', value: sorted[0].val, count: len };
        }

        return null; // 非法牌型
    }

    // --- 出牌逻辑 ---
    document.getElementById('btn-play').onclick = function() {
        var handInfo = analyzeHand(selectedCards);
        if (!handInfo) {
            alert('\u4e0d\u7b26\u5408\u51fa\u724c\u89c4\u5219'); // 不符合出牌规则
            return;
        }

        if (lastHand && !canBeat(handInfo, lastHand)) {
            alert('\u4e0d\u591f\u5927\uff01'); // 不够大
            return;
        }

        executePlay(0, selectedCards, handInfo);
    };

    function canBeat(newH, oldH) {
        // 火箭最大
        if (newH.type === 'rocket') return true;
        if (oldH.type === 'rocket') return false;

        // 炸弹逻辑
        if (newH.type === 'bomb') {
            if (oldH.type !== 'bomb') return true;
            if (newH.count > oldH.count) return true; // 张数多者大
            return newH.count === oldH.count && newH.value > oldH.value;
        }
        
        // 普通牌型比较
        return newH.type === oldH.type && newH.count === oldH.count && newH.value > oldH.value;
    }

    function executePlay(pIdx, playCards, info) {
        // 从手牌移除
        playCards.forEach(function(c) {
            var h = players[pIdx].hand;
            for (var i = 0; i < h.length; i++) {
                if (h[i].id === c.id) {
                    h.splice(i, 1);
                    break;
                }
            }
        });

        lastHand = info;
        lastHand.cards = playCards;
        selectedCards = [];
        
        // UI 显示出的牌
        var zone = document.getElementById('play-zone-' + (['player','left','top','right'][pIdx]));
        renderPlayZone(zone, playCards);

        playTone(600, 'square', 0.2, 0.1); // play音效
        
        if (players[pIdx].hand.length === 0) {
            endGame(players[pIdx].type === 'landlord' ? 'landlord' : 'farmer');
            return;
        }

        nextTurn();
    }

    function renderPlayZone(zone, cards) {
        zone.innerHTML = '';
        cards.forEach(function(c) {
            var el = document.createElement('div');
            el.className = 'card';
            el.style.margin = '0 -15px';
            el.innerHTML = '<div class="value ' + getSuitClass(c.suit) + '">' + formatVal(c.val) + '</div>';
            zone.appendChild(el);
        });
    }

    function nextTurn() {
        currentPlayer = (currentPlayer + 1) % 4;
        renderAll();
        if (currentPlayer !== 0) {
            setTimeout(executeAI, 1000);
        }
    }

    // --- AI 简单实现 ---
    function executeAI() {
        // AI 逻辑占位：四人版AI需检测队友
        // 简化：如果能出就出最小的合法牌，否则过
        // ... (此处省略复杂的AI搜索算法，实际项目中需实现 findValid)
        
        // 模拟过牌音效
        playTone(200, 'sine', 0.2, 0.1);
        nextTurn();
    }

    // --- 结算 ---
    function endGame(winnerType) {
        gameStage = 'ended';
        var win = (players[0].type === winnerType);
        var resultTitle = win ? '\u52dc \u5229 \uff01' : '\u5931 \u8d25'; // 胜利, 失败
        
        document.getElementById('modal-result').style.display = 'flex';
        document.getElementById('result-title').innerText = resultTitle;
        
        playTone(win ? 800 : 300, 'triangle', 0.5, 0.2);
    }

    window.restartGame = function() {
        location.reload();
    };

    // 启动游戏
    initGame();

})();
