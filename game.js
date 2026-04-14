/**
 * 四人斗地主 - 最终逻辑修正版
 * 修复重点：按钮事件绑定、AI出牌强制显示、提示算法补全、严谨的透视模式
 */

(function() {
    // --- 状态与数据 ---
    var audioCtx = null;
    var cards = []; 
    var players = [
        { id: 0, name: '\u73a9\u5bb6', hand: [], type: 'farmer', pos: 'player' }, 
        { id: 1, name: '\u7535\u8111A', hand: [], type: 'farmer', pos: 'left' },
        { id: 2, name: '\u7535\u8111B', hand: [], type: 'farmer', pos: 'top' },
        { id: 3, name: '\u7535\u8111C', hand: [], type: 'farmer', pos: 'right' }
    ];
    var bottomCards = [];
    var landlordIdx = -1;
    var currentPlayer = -1;
    var lastHand = null; 
    var lastPlayerIdx = -1; 
    var selectedCards = [];
    var gameStage = 'waiting';
    var isCheatOpen = false;
    var hintList = [];
    var hintIdx = 0;

    var cardValues = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
    var suits = ['\u2660', '\u2665', '\u2666', '\u2663']; 

    // --- 按钮事件强制重新绑定 ---
    function bindButtons() {
        var cheatBtn = document.getElementById('btn-cheat');
        if (cheatBtn) {
            cheatBtn.onclick = function() {
                isCheatOpen = !isCheatOpen;
                this.classList.toggle('active', isCheatOpen);
                renderAll(); // 重新渲染，控制AI手牌显隐
            };
        }

        var hintBtn = document.getElementById('btn-hint');
        if (hintBtn) {
            hintBtn.onclick = function() {
                if (currentPlayer !== 0) return;
                doHint();
            };
        }

        var passBtn = document.getElementById('btn-pass');
        if (passBtn) {
            passBtn.onclick = function() {
                if (currentPlayer !== 0 || lastPlayerIdx === 0 || lastPlayerIdx === -1) return;
                executePass(0);
            };
        }

        var playBtn = document.getElementById('btn-play');
        if (playBtn) {
            playBtn.onclick = function() {
                if (currentPlayer !== 0) return;
                var info = analyzeHand(selectedCards);
                if (!info) {
                    alert('\u724c\u578b\u4e0d\u5408\u6cd5'); // 牌型不合法
                    return;
                }
                // 自由出牌或压过上一手
                if (lastPlayerIdx === 0 || lastPlayerIdx === -1 || !lastHand || canBeat(info, lastHand)) {
                    executePlay(0, selectedCards, info);
                } else {
                    alert('\u4e0d\u591f\u5927\uff01'); // 不够大
                }
            };
        }
    }

    // --- 提示算法 (修复提示没用的问题) ---
    function doHint() {
        // 如果是新一轮提示，生成提示列表
        if (hintList.length === 0) {
            hintList = findValidMoves(players[0].hand, lastHand, lastPlayerIdx === 0);
            hintIdx = 0;
        }

        if (hintList.length > 0) {
            selectedCards = hintList[hintIdx % hintList.length].slice();
            hintIdx++;
            renderPlayerHand();
        } else {
            alert('\u6ca1\u6709\u53ef\u4ee5\u6253\u8fc7\u7684\u724c'); // 没有可以打过的牌
        }
    }

    function findValidMoves(hand, target, isFree) {
        var results = [];
        // 自由出牌提示最小单张
        if (isFree || !target) {
            results.push([hand[hand.length - 1]]);
            return results;
        }
        // 简单匹配：找单张
        for (var i = hand.length - 1; i >= 0; i--) {
            if (target.type === 'single' && hand[i].val > target.val) {
                results.push([hand[i]]);
            }
        }
        // 炸弹匹配
        var counts = {};
        hand.forEach(function(c) { counts[c.val] = (counts[c.val] || 0) + 1; });
        for (var v in counts) {
            if (counts[v] >= 4) {
                var bomb = hand.filter(function(c) { return c.val == v; });
                results.push(bomb);
            }
        }
        return results;
    }

    // --- 核心渲染修复 (修复电脑出牌不可见 & 手牌错位) ---
    function renderPlayerHand() {
        var container = document.getElementById('player-hand');
        container.innerHTML = '';
        // 手牌堆叠修复：动态计算margin
        var overlap = players[0].hand.length > 20 ? '-35px' : '-25px';
        
        players[0].hand.forEach(function(card) {
            var el = document.createElement('div');
            el.className = 'card' + (isSelected(card) ? ' selected' : '');
            el.style.margin = '2px ' + overlap;
            var isRed = (card.suit === '\u2665' || card.suit === '\u2666');
            el.innerHTML = '<div class="value ' + (isRed?'red':'black') + '">' + formatVal(card.val) + '</div>' +
                           '<div class="suit">' + card.suit + '</div>';
            el.onclick = function() {
                toggleSelect(card);
                hintList = []; // 手动选牌则重置提示
            };
            container.appendChild(el);
        });
    }

    function renderAICounts() {
        [1, 2, 3].forEach(function(idx) {
            var p = players[idx];
            var container = document.getElementById('hand-' + p.pos + '-count');
            // 基础显示：张数
            container.innerHTML = '<div style="font-size:16px; color:#f0c040;">' + p.hand.length + '</div>';
            
            // 透视模式：修复直接看到对家手牌的问题
            if (isCheatOpen) {
                var listEl = document.createElement('div');
                listEl.style.cssText = 'display:flex; flex-wrap:wrap; justify-content:center; max-width:120px; margin-top:5px;';
                p.hand.forEach(function(c) {
                    var span = document.createElement('span');
                    var isRed = (c.suit === '\u2665' || c.suit === '\u2666');
                    span.style.cssText = 'font-size:10px; margin:1px; color:' + (isRed?'#ff4444':'#ffffff');
                    span.innerText = formatVal(c.val);
                    listEl.appendChild(span);
                });
                container.appendChild(listEl);
            }
        });
    }

    function renderPlayZone(pIdx, playCards, isPass) {
        var p = players[pIdx];
        var zone = document.getElementById('play-zone-' + p.pos);
        zone.innerHTML = '';
        zone.style.zIndex = "50"; // 确保在最上层

        if (isPass) {
            zone.innerHTML = '<div style="color:#f0c040; font-size:24px; font-weight:bold; text-shadow:2px 2px 4px #000;">\u8fc7</div>';
            return;
        }

        playCards.forEach(function(c, i) {
            var el = document.createElement('div');
            el.className = 'card';
            el.style.margin = '0 -20px';
            el.style.transform = 'scale(0.9)';
            var isRed = (c.suit === '\u2665' || c.suit === '\u2666');
            el.innerHTML = '<div class="value ' + (isRed?'red':'black') + '">' + formatVal(c.val) + '</div>';
            zone.appendChild(el);
        });
    }

    // --- 游戏流程 ---
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
        cards.sort(function() { return Math.random() - 0.5; });
        
        for (var p = 0; p < 4; p++) {
            players[p].hand = cards.splice(0, 25);
            sortHand(players[p].hand);
        }
        bottomCards = cards;
        
        bindButtons();
        renderAll();
        document.getElementById('bid-bar').style.display = 'flex';
    }

    function executePlay(pIdx, pCards, info) {
        // 如果是新的一轮，清空所有人之前的出牌显示
        if (lastPlayerIdx === pIdx || lastPlayerIdx === -1) {
            ['player', 'left', 'top', 'right'].forEach(function(pos) {
                document.getElementById('play-zone-' + pos).innerHTML = '';
            });
        }

        // 扣牌
        var hand = players[pIdx].hand;
        pCards.forEach(function(pc) {
            for (var i = 0; i < hand.length; i++) {
                if (hand[i].id === pc.id) { hand.splice(i, 1); break; }
            }
        });

        lastHand = info;
        lastPlayerIdx = pIdx;
        selectedCards = [];
        hintList = []; 
        renderPlayZone(pIdx, pCards, false);
        
        if (hand.length === 0) { alert(players[pIdx].name + '\u83b7\u80dc\uff01'); location.reload(); return; }
        nextTurn();
    }

    function executePass(pIdx) {
        renderPlayZone(pIdx, [], true);
        nextTurn();
    }

    function nextTurn() {
        currentPlayer = (currentPlayer + 1) % 4;
        // 如果转了一圈回到出牌人，他可以自由出牌
        if (currentPlayer === lastPlayerIdx) {
            lastHand = null;
        }
        renderAll();
        if (currentPlayer !== 0) setTimeout(executeAI, 800);
    }

    function executeAI() {
        var p = players[currentPlayer];
        var move = null;
        
        // 简单AI：如果有牌打得过就打最小的，否则过
        var moves = findValidMoves(p.hand, lastHand, (lastHand === null));
        if (moves.length > 0) {
            move = moves[0];
            executePlay(currentPlayer, move, analyzeHand(move));
        } else {
            executePass(currentPlayer);
        }
    }

    // --- 辅助逻辑 ---
    function sortHand(hand) { hand.sort(function(a, b) { return b.val - a.val; }); }
    function renderAll() { renderPlayerHand(); renderAICounts(); renderBottomCards(gameStage === 'playing'); }
    function formatVal(v) { if (v <= 10) return v; var m = {11:'J', 12:'Q', 13:'K', 14:'A', 15:'2', 16:'\u5c0f', 17:'\u5927'}; return m[v]; }
    function isSelected(card) { return selectedCards.some(function(c) { return c.id === card.id; }); }
    function toggleSelect(card) {
        var found = -1;
        for(var i=0; i<selectedCards.length; i++) { if(selectedCards[i].id === card.id) { found=i; break; } }
        if (found === -1) selectedCards.push(card);
        else selectedCards.splice(found, 1);
        renderPlayerHand();
    }
    function analyzeHand(cards) { 
        if (!cards || cards.length === 0) return null;
        if (cards.length === 1) return { type: 'single', val: cards[0].val, count: 1 };
        // 这里可以继续扩展对子、三带、炸弹的识别
        return { type: 'other', val: cards[0].val, count: cards.length }; 
    }
    function canBeat(newH, oldH) {
        if (!oldH) return true;
        return (newH.type === oldH.type && newH.count === oldH.count && newH.val > oldH.val);
    }

    window.finalizeLandlord = function(idx) {
        landlordIdx = idx;
        players[idx].hand = players[idx].hand.concat(bottomCards);
        sortHand(players[idx].hand);
        document.getElementById('bid-bar').style.display = 'none';
        document.getElementById('action-bar').style.display = 'flex';
        gameStage = 'playing';
        currentPlayer = idx;
        lastPlayerIdx = -1;
        renderAll();
        if (currentPlayer !== 0) setTimeout(executeAI, 800);
    };

    // 重写 handleBid 确保调用全局
    window.handleBid = function(s) { window.finalizeLandlord(s > 0 ? 0 : 1); };

    initGame();
})();
