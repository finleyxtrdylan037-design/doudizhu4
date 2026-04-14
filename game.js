/**
 * 四人斗地主 (Si Ren Dou Di Zhu) - 完整逻辑版
 * 修复：AI出牌可见性、出牌区布局、基础出牌算法
 */

(function() {
    var audioCtx = null;
    var cards = []; 
    var players = [
        { id: 0, name: '\u73a9\u5bb6', hand: [], type: 'farmer', pos: 'player' }, 
        { id: 1, name: '\u7535\u8111A(\u4e0a\u5bb6)', hand: [], type: 'farmer', pos: 'left' },
        { id: 2, name: '\u7535\u8111B(\u5bf9\u5bb6)', hand: [], type: 'farmer', pos: 'top' },
        { id: 3, name: '\u7535\u8111C(\u4e0b\u5bb6)', hand: [], type: 'farmer', pos: 'right' }
    ];
    var bottomCards = [];
    var landlordIdx = -1;
    var currentPlayer = -1;
    var lastHand = null; 
    var lastPlayerIdx = -1; // 记录最后出牌的人，用于判断是否一轮结束
    var selectedCards = [];
    var totalScore = 0;
    var basePoint = 0;
    var multiplier = 1;
    var gameStage = 'waiting';

    var cardValues = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
    var suits = ['\u2660', '\u2665', '\u2666', '\u2663']; 

    // 初始化音频
    window.initAudio = function() {
        if (audioCtx) return;
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        } catch(e) {}
    };

    function playTone(freq, type, duration, vol) {
        if (!audioCtx) return;
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(vol || 0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    }

    // --- 游戏启动 ---
    function initGame() {
        cards = [];
        for (var d = 0; d < 2; d++) {
            for (var v = 0; v < 13; v++) {
                for (var s = 0; s < 4; s++) {
                    cards.push({ val: cardValues[v], suit: suits[s], id: cards.length });
                }
            }
            cards.push({ val: 16, suit: '', id: cards.length }); 
            cards.push({ val: 17, suit: '', id: cards.length }); 
        }
        
        for (var i = cards.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var temp = cards[i]; cards[i] = cards[j]; cards[j] = temp;
        }

        for (var p = 0; p < 4; p++) {
            players[p].hand = cards.splice(0, 25);
            sortHand(players[p].hand);
        }
        bottomCards = cards;
        
        renderAll();
        document.getElementById('bid-bar').style.display = 'flex';
    }

    function sortHand(hand) {
        hand.sort(function(a, b) { return b.val - a.val; });
    }

    // --- 渲染逻辑 ---
    function renderAll() {
        renderPlayerHand();
        renderAICounts();
        renderBottomCards(gameStage !== 'waiting' && gameStage !== 'bidding');
    }

    function renderPlayerHand() {
        var container = document.getElementById('player-hand');
        container.innerHTML = '';
        players[0].hand.forEach(function(card) {
            var cardEl = document.createElement('div');
            cardEl.className = 'card' + (isSelected(card) ? ' selected' : '');
            var isRed = (card.suit === '\u2665' || card.suit === '\u2666');
            cardEl.innerHTML = '<div class="value ' + (isRed?'red':'black') + '">' + formatVal(card.val) + '</div>' +
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
                var isRed = (card.suit === '\u2665' || card.suit === '\u2666');
                el.innerHTML = '<div class="value ' + (isRed?'red':'black') + '" style="font-size:12px">' + formatVal(card.val) + '</div>';
            }
            container.appendChild(el);
        });
    }

    function renderPlayZone(pIdx, playCards, isPass) {
        var pos = players[pIdx].pos;
        var zone = document.getElementById('play-zone-' + pos);
        zone.innerHTML = '';
        
        if (isPass) {
            zone.innerHTML = '<span style="color:#f0c040; font-size:24px; font-weight:bold;">\u8fc7</span>'; // "过"
            return;
        }

        playCards.forEach(function(c) {
            var el = document.createElement('div');
            el.className = 'card';
            el.style.margin = '0 -18px'; 
            el.style.zIndex = '1';
            var isRed = (c.suit === '\u2665' || c.suit === '\u2666');
            el.innerHTML = '<div class="value ' + (isRed?'red':'black') + '">' + formatVal(c.val) + '</div>';
            zone.appendChild(el);
        });
    }

    function formatVal(v) {
        if (v <= 10) return v;
        var map = {11:'J', 12:'Q', 13:'K', 14:'A', 15:'2', 16:'\u5c0f', 17:'\u5927'};
        return map[v];
    }

    function toggleSelect(card) {
        var idx = -1;
        for(var i=0; i<selectedCards.length; i++) {
            if(selectedCards[i].id === card.id) { idx = i; break; }
        }
        if (idx === -1) selectedCards.push(card);
        else selectedCards.splice(idx, 1);
        renderPlayerHand();
    }

    function isSelected(card) {
        for(var i=0; i<selectedCards.length; i++) {
            if(selectedCards[i].id === card.id) return true;
        }
        return false;
    }

    // --- 叫牌逻辑 ---
    window.handleBid = function(score) {
        if (score > basePoint) { basePoint = score; landlordIdx = 0; }
        // 简单化：点击后直接开始
        finalizeLandlord(landlordIdx === -1 ? Math.floor(Math.random()*4) : landlordIdx);
    };

    function finalizeLandlord(idx) {
        landlordIdx = idx;
        players[idx].hand = players[idx].hand.concat(bottomCards);
        players[idx].type = 'landlord';
        sortHand(players[idx].hand);
        
        document.getElementById('bid-bar').style.display = 'none';
        document.getElementById('action-bar').style.display = 'flex';
        
        gameStage = 'playing';
        currentPlayer = idx;
        lastPlayerIdx = idx; // 初始自由出牌
        
        renderAll();
        if (currentPlayer !== 0) setTimeout(executeAI, 800);
    }

    // --- 核心出牌算法 ---
    function analyzeHand(cards) {
        if (cards.length === 0) return null;
        var len = cards.length;
        var counts = {};
        cards.forEach(function(c) { counts[c.val] = (counts[c.val] || 0) + 1; });
        var valArr = Object.keys(counts).map(Number).sort(function(a,b){return a-b;});

        // 炸弹
        if (valArr.length === 1 && counts[valArr[0]] >= 4) return { type: 'bomb', val: valArr[0], count: len };
        // 王炸
        if (len === 4 && (counts[16]||0) + (counts[17]||0) === 4) return { type: 'rocket', val: 999, count: 4 };
        // 单/对
        if (len === 1) return { type: 'single', val: cards[0].val, count: 1 };
        if (len === 2 && cards[0].val === cards[1].val) return { type: 'pair', val: cards[0].val, count: 2 };
        // 三带对 (四人版规则)
        if (len === 5 && valArr.length === 2) {
            if (counts[valArr[0]] === 3 && counts[valArr[1]] === 2) return { type: 'trio_pair', val: valArr[0], count: 5 };
            if (counts[valArr[1]] === 3 && counts[valArr[0]] === 2) return { type: 'trio_pair', val: valArr[1], count: 5 };
        }
        return null; 
    }

    function canBeat(newH, oldH) {
        if (!oldH) return true;
        if (newH.type === 'rocket') return true;
        if (newH.type === 'bomb') {
            if (oldH.type !== 'bomb' && oldH.type !== 'rocket') return true;
            if (oldH.type === 'bomb') return newH.count > oldH.count || (newH.count === oldH.count && newH.val > oldH.val);
        }
        return newH.type === oldH.type && newH.count === oldH.count && newH.val > oldH.val;
    }

    // --- 游戏流程控制 ---
    document.getElementById('btn-play').onclick = function() {
        if (currentPlayer !== 0) return;
        var info = analyzeHand(selectedCards);
        if (!info || !canBeat(info, (lastPlayerIdx === 0 ? null : lastHand))) {
            alert('\u51fa\u724c\u4e0d\u5408\u89c4\u5219\u6216\u4e0d\u591f\u5927'); // 出牌不合规则或不够大
            return;
        }
        executePlay(0, selectedCards, info);
    };

    document.getElementById('btn-pass').onclick = function() {
        if (currentPlayer !== 0 || lastPlayerIdx === 0) return;
        executePass(0);
    };

    function executePlay(pIdx, pCards, info) {
        // 清除旧出牌显示
        if (lastPlayerIdx === pIdx || !lastHand) {
            for(var i=0; i<4; i++) document.getElementById('play-zone-'+players[i].pos).innerHTML = '';
        }

        pCards.forEach(function(c) {
            for(var i=0; i<players[pIdx].hand.length; i++) {
                if(players[pIdx].hand[i].id === c.id) { players[pIdx].hand.splice(i, 1); break; }
            }
        });

        lastHand = info;
        lastPlayerIdx = pIdx;
        selectedCards = [];
        renderPlayZone(pIdx, pCards, false);
        playTone(600, 'square', 0.1, 0.1);
        
        if (players[pIdx].hand.length === 0) { endGame(pIdx); return; }
        nextTurn();
    }

    function executePass(pIdx) {
        renderPlayZone(pIdx, [], true);
        playTone(200, 'sine', 0.1, 0.1);
        nextTurn();
    }

    function nextTurn() {
        currentPlayer = (currentPlayer + 1) % 4;
        renderAll();
        // 如果转了一圈回到出牌人，清空上一手
        if (currentPlayer === lastPlayerIdx) {
            lastHand = null; 
        }
        
        if (currentPlayer !== 0) setTimeout(executeAI, 1000);
    }

    function executeAI() {
        var hand = players[currentPlayer].hand;
        var bestPlay = null;

        // 简单AI算法：尝试找能打过的最小组合
        if (!lastHand || lastPlayerIdx === currentPlayer) {
            // 自由出牌，出一张最小的
            bestPlay = [hand[hand.length-1]];
        } else {
            // 跟牌：查找单张或对子
            for(var i=hand.length-1; i>=0; i--) {
                var test = [hand[i]];
                var info = analyzeHand(test);
                if (info && canBeat(info, lastHand)) { bestPlay = test; break; }
            }
        }

        if (bestPlay) executePlay(currentPlayer, bestPlay, analyzeHand(bestPlay));
        else executePass(currentPlayer);
    }

    function endGame(pIdx) {
        var isLandlordWin = (players[pIdx].type === 'landlord');
        var playerWin = (players[0].type === 'landlord' ? isLandlordWin : !isLandlordWin);
        
        document.getElementById('result-title').innerText = playerWin ? '\u80dc \u5229 \uff01' : '\u5931 \u8d25';
        document.getElementById('modal-result').style.display = 'flex';
    }

    initGame();
})();
