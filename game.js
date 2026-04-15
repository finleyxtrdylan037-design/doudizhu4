// Four-player Dou Di Zhu (108 cards, 2 decks)
// ES5 only, Unicode-escaped Chinese, no let/const/arrow/template

(function() {

// ========== CONSTANTS ==========
var SUITS = ['\u2660','\u2665','\u2666','\u2663']; // spade heart diamond club
var SUIT_COLORS = {'\u2660':'black','\u2665':'red','\u2666':'red','\u2663':'black'};
var RANK_NAMES = {3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A',15:'2',16:'\u5c0f\u738b',17:'\u5927\u738b'};
var RANK_SHORT = {3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A',15:'2',16:'S',17:'B'};

// Players: 0=me, 1=aiC(right), 2=aiB(top), 3=aiA(left) -- counterclockwise
var PLAYER_NAMES = ['\u73a9\u5bb6','\u7535\u8111C','\u7535\u8111B','\u7535\u8111A'];
var PLAY_AREA_IDS = ['playMe','playC','playB','playA'];
var AI_CARD_IDS = [null,'cardsC','cardsB','cardsA'];
var AI_COUNT_IDS = [null,'countC','countB','countA'];
var AI_LABEL_IDS = [null,'labelC','labelB','labelA'];

// Game state
var hands = [[],[],[],[]];
var diPaiCards = [];
var landlord = -1;
var currentPlayer = -1;
var lastPlayCards = [];
var lastPlayType = null;
var lastPlayer = -1;
var passCount = 0;
var totalScore = 0;
var baseScore = 0;
var multiplier = 1;
var playedRecord = {};
var playCountPerPlayer = [0,0,0,0];
var cheatMode = false;
var gamePhase = ''; // bid, play, end
var bidHistory = [];
var currentBid = 0;
var bidStarter = 0;
var bidTurns = 0;
var hintList = [];
var hintIdx = -1;
var lastHintRound = -1;
var roundId = 0;
var audioCtx = null;

// ========== DECK & SHUFFLE ==========
function createDeck() {
  var deck = [];
  var id = 0;
  for (var d = 0; d < 2; d++) {
    for (var s = 0; s < 4; s++) {
      for (var v = 3; v <= 15; v++) {
        deck.push({value:v, suit:SUITS[s], deck:d, id:id++});
      }
    }
    deck.push({value:16, suit:'joker', deck:d, id:id++}); // small joker
    deck.push({value:17, suit:'joker', deck:d, id:id++}); // big joker
  }
  return deck;
}

function shuffle(arr) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
}

function sortHand(h) {
  h.sort(function(a, b) {
    if (b.value !== a.value) return b.value - a.value;
    if (a.suit === 'joker' && b.suit === 'joker') return b.value - a.value;
    var si = SUITS.indexOf(a.suit), sj = SUITS.indexOf(b.suit);
    return si - sj;
  });
}

// ========== AUDIO ==========
function initAudio() {
  if (audioCtx) return;
  try {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  } catch(e) {}
}

function playSound(type) {
  if (!audioCtx) return;
  try {
    var now = audioCtx.currentTime;
    var osc, gain, dur;
    if (type === 'play') {
      osc = audioCtx.createOscillator(); gain = audioCtx.createGain();
      osc.type = 'square'; osc.frequency.setValueAtTime(800, now);
      osc.frequency.linearRampToValueAtTime(400, now + 0.1);
      gain.gain.setValueAtTime(0.15, now); gain.gain.linearRampToValueAtTime(0, now + 0.12);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(now); osc.stop(now + 0.12);
    } else if (type === 'pass') {
      osc = audioCtx.createOscillator(); gain = audioCtx.createGain();
      osc.type = 'sine'; osc.frequency.setValueAtTime(200, now);
      osc.frequency.linearRampToValueAtTime(100, now + 0.2);
      gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0, now + 0.2);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(now); osc.stop(now + 0.2);
    } else if (type === 'bomb') {
      var bufSize = audioCtx.sampleRate * 0.4;
      var buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i/bufSize);
      var src = audioCtx.createBufferSource(); src.buffer = buf;
      gain = audioCtx.createGain(); gain.gain.setValueAtTime(0.3, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.4);
      src.connect(gain); gain.connect(audioCtx.destination);
      src.start(now); src.stop(now + 0.4);
      osc = audioCtx.createOscillator(); osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(80, now); osc.frequency.linearRampToValueAtTime(30, now+0.3);
      var g2 = audioCtx.createGain(); g2.gain.setValueAtTime(0.2, now);
      g2.gain.linearRampToValueAtTime(0, now+0.3);
      osc.connect(g2); g2.connect(audioCtx.destination);
      osc.start(now); osc.stop(now+0.3);
    } else if (type === 'win') {
      var freqs = [523,659,784,1047];
      for (var f = 0; f < freqs.length; f++) {
        osc = audioCtx.createOscillator(); gain = audioCtx.createGain();
        osc.type = 'triangle'; osc.frequency.value = freqs[f];
        var t = now + f * 0.15;
        gain.gain.setValueAtTime(0.15, t); gain.gain.linearRampToValueAtTime(0, t + 0.2);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(t); osc.stop(t + 0.2);
      }
    } else if (type === 'lose') {
      osc = audioCtx.createOscillator(); gain = audioCtx.createGain();
      osc.type = 'sawtooth'; osc.frequency.setValueAtTime(400, now);
      osc.frequency.linearRampToValueAtTime(200, now + 0.4);
      gain.gain.setValueAtTime(0.15, now); gain.gain.linearRampToValueAtTime(0, now + 0.4);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(now); osc.stop(now + 0.4);
    } else if (type === 'bid') {
      osc = audioCtx.createOscillator(); gain = audioCtx.createGain();
      osc.type = 'sine'; osc.frequency.value = 660;
      gain.gain.setValueAtTime(0.12, now); gain.gain.linearRampToValueAtTime(0, now + 0.1);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(now); osc.stop(now + 0.1);
    } else if (type === 'select') {
      osc = audioCtx.createOscillator(); gain = audioCtx.createGain();
      osc.type = 'sine'; osc.frequency.value = 1200;
      gain.gain.setValueAtTime(0.08, now); gain.gain.linearRampToValueAtTime(0, now + 0.06);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(now); osc.stop(now + 0.06);
    }
  } catch(e) {}
}

// ========== CARD HTML ==========
function cardRankStr(c) {
  if (c.value === 17) return '\u5927';
  if (c.value === 16) return '\u5c0f';
  return RANK_NAMES[c.value] || '';
}

function cardSuitStr(c) {
  if (c.value >= 16) return '\u738b';
  return c.suit;
}

function cardColorClass(c) {
  if (c.value === 17) return 'joker-red';
  if (c.value === 16) return 'joker-black';
  return SUIT_COLORS[c.suit] || 'black';
}

function renderCard(c, cls) {
  var cc = cardColorClass(c);
  return '<div class="' + cls + ' ' + cc + '">' + cardRankStr(c) + '<br>' + cardSuitStr(c) + '</div>';
}

// ========== UI UPDATE ==========
function updateAI(p) {
  var idx = p; // 1,2,3
  var el = document.getElementById(AI_CARD_IDS[idx]);
  var countEl = document.getElementById(AI_COUNT_IDS[idx]);
  var h = hands[idx];
  countEl.textContent = h.length;
  el.innerHTML = '';
  if (cheatMode) {
    for (var i = 0; i < h.length; i++) {
      el.innerHTML += renderCard(h[i], 'mini-card');
    }
  } else {
    for (var i = 0; i < h.length; i++) {
      el.innerHTML += '<div class="back-card"></div>';
    }
  }
}

function updateAllAI() {
  updateAI(1); updateAI(2); updateAI(3);
}

function updateLandlordLabels() {
  for (var p = 0; p < 4; p++) {
    var labelId = AI_LABEL_IDS[p];
    if (!labelId) continue;
    var lbl = document.getElementById(labelId);
    var icon = landlord === p ? ' <span class="landlord-icon">\u2605</span>' : '';
    lbl.innerHTML = PLAYER_NAMES[p] + ' <span id="' + AI_COUNT_IDS[p] + '">' + hands[p].length + '</span>\u5f20' + icon;
  }
}

function updateHand() {
  var el = document.getElementById('handArea');
  el.innerHTML = '';
  var h = hands[0];
  for (var i = 0; i < h.length; i++) {
    var c = h[i];
    var cc = cardColorClass(c);
    var div = document.createElement('div');
    div.className = 'hand-card ' + cc;
    div.setAttribute('data-idx', i);
    div.innerHTML = cardRankStr(c) + '<br>' + cardSuitStr(c);
    div.addEventListener('click', (function(idx) {
      return function() { toggleSelect(idx); };
    })(i));
    el.appendChild(div);
  }
}

function toggleSelect(idx) {
  initAudio();
  var cards = document.getElementById('handArea').children;
  if (idx >= 0 && idx < cards.length) {
    cards[idx].classList.toggle('selected');
    playSound('select');
    hintIdx = -1;
  }
}

function getSelectedCards() {
  var cards = document.getElementById('handArea').children;
  var sel = [];
  for (var i = 0; i < cards.length; i++) {
    if (cards[i].classList.contains('selected')) {
      sel.push(hands[0][i]);
    }
  }
  return sel;
}

function clearSelection() {
  var cards = document.getElementById('handArea').children;
  for (var i = 0; i < cards.length; i++) {
    cards[i].classList.remove('selected');
  }
}

function selectCards(cardList) {
  clearSelection();
  var cards = document.getElementById('handArea').children;
  for (var i = 0; i < cardList.length; i++) {
    for (var j = 0; j < hands[0].length; j++) {
      if (hands[0][j].id === cardList[i].id) {
        if (j < cards.length) cards[j].classList.add('selected');
        break;
      }
    }
  }
}

function showPlayArea(p, played) {
  var el = document.getElementById(PLAY_AREA_IDS[p]);
  el.innerHTML = '';
  if (!played || played.length === 0) return;
  if (played === 'pass') {
    el.innerHTML = '<span class="pass-text">\u8fc7</span>';
    return;
  }
  for (var i = 0; i < played.length; i++) {
    el.innerHTML += renderCard(played[i], 'play-card');
  }
}

function clearAllPlayAreas() {
  for (var i = 0; i < 4; i++) {
    document.getElementById(PLAY_AREA_IDS[i]).innerHTML = '';
  }
}

function showToast(msg, dur) {
  var el = document.getElementById('toast');
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(function() { el.style.display = 'none'; }, dur || 1500);
}

function showMultiInfo() {
  var el = document.getElementById('multiInfo');
  el.textContent = '\u500d\u6570:' + multiplier + 'x | \u5e95\u5206:' + baseScore;
  el.style.display = baseScore > 0 ? 'block' : 'none';
}

// ========== CARD TYPE DETECTION ==========
function getValueCounts(cards) {
  var counts = {};
  for (var i = 0; i < cards.length; i++) {
    var v = cards[i].value;
    counts[v] = (counts[v] || 0) + 1;
  }
  return counts;
}

function classifyHand(cards) {
  if (!cards || cards.length === 0) return null;
  var n = cards.length;
  var vc = getValueCounts(cards);
  var vals = [];
  for (var k in vc) { if (vc.hasOwnProperty(k)) vals.push({v:parseInt(k), c:vc[k]}); }
  vals.sort(function(a,b){return a.v - b.v;});

  // Rocket: 4 jokers (2 big + 2 small)
  if (n === 4) {
    var jokerCount = 0;
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].value >= 16) jokerCount++;
    }
    if (jokerCount === 4) return {type:'rocket', rank:99, len:4};
  }

  // Bomb: all same value, 4+
  if (vals.length === 1 && n >= 4) {
    return {type:'bomb', rank:vals[0].v, len:n};
  }

  // Single
  if (n === 1) return {type:'single', rank:vals[0].v, len:1};

  // Pair
  if (n === 2 && vals.length === 1 && vals[0].c === 2) return {type:'pair', rank:vals[0].v, len:2};

  // Triple
  if (n === 3 && vals.length === 1 && vals[0].c === 3) return {type:'triple', rank:vals[0].v, len:3};

  // Triple + 1
  if (n === 4 && vals.length === 2) {
    for (var i = 0; i < vals.length; i++) {
      if (vals[i].c === 3) return {type:'triple1', rank:vals[i].v, len:4};
    }
  }

  // Triple + pair
  if (n === 5 && vals.length === 2) {
    var triV = -1, pairV = -1;
    for (var i = 0; i < vals.length; i++) {
      if (vals[i].c === 3) triV = vals[i].v;
      if (vals[i].c === 2) pairV = vals[i].v;
    }
    if (triV >= 0 && pairV >= 0) return {type:'triple2', rank:triV, len:5};
  }

  // Four + 2 singles
  if (n === 6 && vals.length === 3) {
    for (var i = 0; i < vals.length; i++) {
      if (vals[i].c === 4) {
        var rest = [];
        for (var j = 0; j < vals.length; j++) { if (j !== i) rest.push(vals[j]); }
        if (rest[0].c === 1 && rest[1].c === 1) return {type:'four2s', rank:vals[i].v, len:6};
      }
    }
  }

  // Four + 2 pairs
  if (n === 8) {
    for (var i = 0; i < vals.length; i++) {
      if (vals[i].c === 4) {
        var allPairs = true;
        for (var j = 0; j < vals.length; j++) {
          if (j !== i && vals[j].c !== 2) { allPairs = false; break; }
        }
        if (allPairs && vals.length === 3) return {type:'four2p', rank:vals[i].v, len:8};
      }
    }
  }

  // Straight (single): 5+ consecutive, no 2/joker
  if (n >= 5) {
    var isStraight = true;
    if (vals.length === n) {
      for (var i = 0; i < vals.length; i++) {
        if (vals[i].c !== 1 || vals[i].v > 14) { isStraight = false; break; }
      }
      if (isStraight) {
        for (var i = 1; i < vals.length; i++) {
          if (vals[i].v !== vals[i-1].v + 1) { isStraight = false; break; }
        }
        if (isStraight) return {type:'straight', rank:vals[vals.length-1].v, len:n, startRank:vals[0].v};
      }
    }
  }

  // Double straight (pairs): 3+ consecutive pairs, no 2/joker
  if (n >= 6 && n % 2 === 0) {
    var isDblStr = true;
    var pairCount = n / 2;
    if (vals.length === pairCount) {
      for (var i = 0; i < vals.length; i++) {
        if (vals[i].c !== 2 || vals[i].v > 14) { isDblStr = false; break; }
      }
      if (isDblStr && pairCount >= 3) {
        for (var i = 1; i < vals.length; i++) {
          if (vals[i].v !== vals[i-1].v + 1) { isDblStr = false; break; }
        }
        if (isDblStr) return {type:'dblstraight', rank:vals[vals.length-1].v, len:n, startRank:vals[0].v};
      }
    }
  }

  // Airplane (consecutive triples), optionally with wings
  var triples = [];
  var extras = [];
  for (var i = 0; i < vals.length; i++) {
    if (vals[i].c >= 3 && vals[i].v <= 14) {
      triples.push(vals[i].v);
    }
  }
  triples.sort(function(a,b){return a-b;});

  // Find longest consecutive run of triples
  if (triples.length >= 2) {
    var bestRun = [];
    var run = [triples[0]];
    for (var i = 1; i < triples.length; i++) {
      if (triples[i] === triples[i-1] + 1) {
        run.push(triples[i]);
      } else {
        if (run.length > bestRun.length) bestRun = run.slice();
        run = [triples[i]];
      }
    }
    if (run.length > bestRun.length) bestRun = run;

    if (bestRun.length >= 2) {
      var tripleTotal = bestRun.length * 3;
      var remaining = n - tripleTotal;
      var planeCount = bestRun.length;

      // No wings
      if (remaining === 0) {
        return {type:'plane', rank:bestRun[bestRun.length-1], len:n, count:planeCount, wing:'none'};
      }
      // Single wings
      if (remaining === planeCount) {
        return {type:'plane', rank:bestRun[bestRun.length-1], len:n, count:planeCount, wing:'single'};
      }
      // Pair wings
      if (remaining === planeCount * 2) {
        // Check that remaining cards form pairs
        var remVC = {};
        for (var i = 0; i < vals.length; i++) {
          var inRun = false;
          for (var j = 0; j < bestRun.length; j++) {
            if (vals[i].v === bestRun[j]) { inRun = true; break; }
          }
          if (!inRun) {
            remVC[vals[i].v] = vals[i].c;
          } else {
            var leftover = vals[i].c - 3;
            if (leftover > 0) remVC[vals[i].v] = leftover;
          }
        }
        var allPairs = true;
        var pairCnt = 0;
        for (var k in remVC) {
          if (remVC.hasOwnProperty(k)) {
            if (remVC[k] % 2 !== 0) { allPairs = false; break; }
            pairCnt += remVC[k] / 2;
          }
        }
        if (allPairs && pairCnt === planeCount) {
          return {type:'plane', rank:bestRun[bestRun.length-1], len:n, count:planeCount, wing:'pair'};
        }
      }
    }
  }

  return null;
}

function canBeat(newType, oldType) {
  if (!oldType) return true;
  if (newType.type === 'rocket') return true;
  if (oldType.type === 'rocket') return false;

  if (newType.type === 'bomb' && oldType.type === 'bomb') {
    if (newType.len !== oldType.len) return newType.len > oldType.len;
    return newType.rank > oldType.rank;
  }
  if (newType.type === 'bomb' && oldType.type !== 'bomb') return true;
  if (newType.type !== 'bomb' && oldType.type === 'bomb') return false;

  if (newType.type !== oldType.type) return false;
  if (newType.len !== oldType.len) return false;
  return newType.rank > oldType.rank;
}

// ========== FIND VALID PLAYS ==========
function findValid(hand, lastType) {
  var results = [];
  var vc = getValueCounts(hand);
  var valArr = [];
  for (var k in vc) { if (vc.hasOwnProperty(k)) valArr.push(parseInt(k)); }
  valArr.sort(function(a,b){return a-b;});

  function getCardsOfValue(v, count) {
    var found = [];
    for (var i = 0; i < hand.length; i++) {
      if (hand[i].value === v && found.length < count) found.push(hand[i]);
    }
    return found;
  }

  if (!lastType) {
    // Free play - enumerate all possible plays
    // Singles
    var seen = {};
    for (var i = 0; i < hand.length; i++) {
      if (!seen[hand[i].value]) {
        results.push([hand[i]]);
        seen[hand[i].value] = true;
      }
    }
    // Pairs
    for (var i = 0; i < valArr.length; i++) {
      if (vc[valArr[i]] >= 2) results.push(getCardsOfValue(valArr[i], 2));
    }
    // Triples
    for (var i = 0; i < valArr.length; i++) {
      if (vc[valArr[i]] >= 3) results.push(getCardsOfValue(valArr[i], 3));
    }
    // Triple+1
    for (var i = 0; i < valArr.length; i++) {
      if (vc[valArr[i]] >= 3) {
        for (var j = 0; j < valArr.length; j++) {
          if (valArr[j] !== valArr[i]) {
            results.push(getCardsOfValue(valArr[i], 3).concat(getCardsOfValue(valArr[j], 1)));
          }
        }
      }
    }
    // Triple+pair
    for (var i = 0; i < valArr.length; i++) {
      if (vc[valArr[i]] >= 3) {
        for (var j = 0; j < valArr.length; j++) {
          if (valArr[j] !== valArr[i] && vc[valArr[j]] >= 2) {
            results.push(getCardsOfValue(valArr[i], 3).concat(getCardsOfValue(valArr[j], 2)));
          }
        }
      }
    }
    // Straights
    for (var start = 3; start <= 10; start++) {
      var run = [];
      for (var v = start; v <= 14; v++) {
        if (vc[v] >= 1) run.push(v);
        else break;
        if (run.length >= 5) {
          var cards = [];
          for (var r = 0; r < run.length; r++) cards = cards.concat(getCardsOfValue(run[r], 1));
          results.push(cards);
        }
      }
    }
    // Double straights
    for (var start = 3; start <= 12; start++) {
      var run = [];
      for (var v = start; v <= 14; v++) {
        if (vc[v] >= 2) run.push(v);
        else break;
        if (run.length >= 3) {
          var cards = [];
          for (var r = 0; r < run.length; r++) cards = cards.concat(getCardsOfValue(run[r], 2));
          results.push(cards);
        }
      }
    }
    // Planes
    for (var start = 3; start <= 13; start++) {
      var run = [];
      for (var v = start; v <= 14; v++) {
        if (vc[v] >= 3) run.push(v);
        else break;
        if (run.length >= 2) {
          // Plane no wings
          var base = [];
          for (var r = 0; r < run.length; r++) base = base.concat(getCardsOfValue(run[r], 3));
          results.push(base.slice());
          // Plane + single wings
          var otherVals = [];
          for (var ov = 0; ov < valArr.length; ov++) {
            var inRun = false;
            for (var r = 0; r < run.length; r++) { if (valArr[ov] === run[r]) { inRun = true; break; } }
            if (!inRun) otherVals.push(valArr[ov]);
          }
          if (otherVals.length >= run.length) {
            // Just pick first N singles
            var wings = [];
            for (var w = 0; w < run.length && w < otherVals.length; w++) {
              wings = wings.concat(getCardsOfValue(otherVals[w], 1));
            }
            if (wings.length === run.length) results.push(base.concat(wings));
          }
          // Plane + pair wings
          var pairVals = [];
          for (var ov = 0; ov < valArr.length; ov++) {
            var inRun = false;
            for (var r = 0; r < run.length; r++) { if (valArr[ov] === run[r]) { inRun = true; break; } }
            if (!inRun && vc[valArr[ov]] >= 2) pairVals.push(valArr[ov]);
          }
          if (pairVals.length >= run.length) {
            var wings = [];
            for (var w = 0; w < run.length && w < pairVals.length; w++) {
              wings = wings.concat(getCardsOfValue(pairVals[w], 2));
            }
            if (wings.length === run.length * 2) results.push(base.concat(wings));
          }
        }
      }
    }
    // Four+2s
    for (var i = 0; i < valArr.length; i++) {
      if (vc[valArr[i]] >= 4) {
        // Get pairs of singles
        var others = [];
        for (var j = 0; j < valArr.length; j++) {
          if (valArr[j] !== valArr[i]) others.push(valArr[j]);
        }
        for (var a = 0; a < others.length; a++) {
          for (var b = a+1; b < others.length; b++) {
            results.push(getCardsOfValue(valArr[i], 4).concat(getCardsOfValue(others[a],1)).concat(getCardsOfValue(others[b],1)));
          }
        }
        // Four+2pairs
        var pv = [];
        for (var j = 0; j < valArr.length; j++) {
          if (valArr[j] !== valArr[i] && vc[valArr[j]] >= 2) pv.push(valArr[j]);
        }
        for (var a = 0; a < pv.length; a++) {
          for (var b = a+1; b < pv.length; b++) {
            results.push(getCardsOfValue(valArr[i],4).concat(getCardsOfValue(pv[a],2)).concat(getCardsOfValue(pv[b],2)));
          }
        }
      }
    }
    // Bombs (4+)
    for (var i = 0; i < valArr.length; i++) {
      if (vc[valArr[i]] >= 4 && valArr[i] <= 15) {
        for (var bc = 4; bc <= vc[valArr[i]]; bc++) {
          results.push(getCardsOfValue(valArr[i], bc));
        }
      }
    }
    // Rocket (4 jokers)
    var jCount16 = vc[16] || 0;
    var jCount17 = vc[17] || 0;
    if (jCount16 >= 2 && jCount17 >= 2) {
      results.push(getCardsOfValue(16,2).concat(getCardsOfValue(17,2)));
    }
  } else {
    // Must follow lastType
    var lt = lastType;

    if (lt.type === 'single') {
      for (var i = 0; i < valArr.length; i++) {
        if (valArr[i] > lt.rank) results.push(getCardsOfValue(valArr[i], 1));
      }
    } else if (lt.type === 'pair') {
      for (var i = 0; i < valArr.length; i++) {
        if (valArr[i] > lt.rank && vc[valArr[i]] >= 2) results.push(getCardsOfValue(valArr[i], 2));
      }
    } else if (lt.type === 'triple') {
      for (var i = 0; i < valArr.length; i++) {
        if (valArr[i] > lt.rank && vc[valArr[i]] >= 3) results.push(getCardsOfValue(valArr[i], 3));
      }
    } else if (lt.type === 'triple1') {
      for (var i = 0; i < valArr.length; i++) {
        if (valArr[i] > lt.rank && vc[valArr[i]] >= 3) {
          for (var j = 0; j < valArr.length; j++) {
            if (valArr[j] !== valArr[i]) {
              results.push(getCardsOfValue(valArr[i],3).concat(getCardsOfValue(valArr[j],1)));
            }
          }
        }
      }
    } else if (lt.type === 'triple2') {
      for (var i = 0; i < valArr.length; i++) {
        if (valArr[i] > lt.rank && vc[valArr[i]] >= 3) {
          for (var j = 0; j < valArr.length; j++) {
            if (valArr[j] !== valArr[i] && vc[valArr[j]] >= 2) {
              results.push(getCardsOfValue(valArr[i],3).concat(getCardsOfValue(valArr[j],2)));
            }
          }
        }
      }
    } else if (lt.type === 'four2s') {
      for (var i = 0; i < valArr.length; i++) {
        if (valArr[i] > lt.rank && vc[valArr[i]] >= 4) {
          var others = [];
          for (var j = 0; j < valArr.length; j++) {
            if (valArr[j] !== valArr[i]) others.push(valArr[j]);
          }
          for (var a = 0; a < others.length; a++) {
            for (var b = a+1; b < others.length; b++) {
              results.push(getCardsOfValue(valArr[i],4).concat(getCardsOfValue(others[a],1)).concat(getCardsOfValue(others[b],1)));
            }
          }
        }
      }
    } else if (lt.type === 'four2p') {
      for (var i = 0; i < valArr.length; i++) {
        if (valArr[i] > lt.rank && vc[valArr[i]] >= 4) {
          var pv = [];
          for (var j = 0; j < valArr.length; j++) {
            if (valArr[j] !== valArr[i] && vc[valArr[j]] >= 2) pv.push(valArr[j]);
          }
          for (var a = 0; a < pv.length; a++) {
            for (var b = a+1; b < pv.length; b++) {
              results.push(getCardsOfValue(valArr[i],4).concat(getCardsOfValue(pv[a],2)).concat(getCardsOfValue(pv[b],2)));
            }
          }
        }
      }
    } else if (lt.type === 'straight') {
      var sLen = lt.len;
      for (var start = (lt.startRank || lt.rank - sLen + 1) + 1; start + sLen - 1 <= 14; start++) {
        var ok = true;
        for (var v = start; v < start + sLen; v++) {
          if (!vc[v] || vc[v] < 1) { ok = false; break; }
        }
        if (ok) {
          var cards = [];
          for (var v = start; v < start + sLen; v++) cards = cards.concat(getCardsOfValue(v,1));
          results.push(cards);
        }
      }
    } else if (lt.type === 'dblstraight') {
      var pairLen = lt.len / 2;
      for (var start = (lt.startRank || lt.rank - pairLen + 1) + 1; start + pairLen - 1 <= 14; start++) {
        var ok = true;
        for (var v = start; v < start + pairLen; v++) {
          if (!vc[v] || vc[v] < 2) { ok = false; break; }
        }
        if (ok) {
          var cards = [];
          for (var v = start; v < start + pairLen; v++) cards = cards.concat(getCardsOfValue(v,2));
          results.push(cards);
        }
      }
    } else if (lt.type === 'plane') {
      var planeCount = lt.count;
      var wing = lt.wing;
      for (var start = 3; start <= 14; start++) {
        var run = [];
        for (var v = start; v <= 14 && run.length < planeCount; v++) {
          if (vc[v] >= 3) run.push(v);
          else break;
        }
        if (run.length === planeCount && run[run.length-1] > lt.rank) {
          var base = [];
          for (var r = 0; r < run.length; r++) base = base.concat(getCardsOfValue(run[r],3));
          if (wing === 'none') {
            results.push(base);
          } else if (wing === 'single') {
            var others = [];
            for (var ov = 0; ov < valArr.length; ov++) {
              var inRun = false;
              for (var r = 0; r < run.length; r++) { if (valArr[ov] === run[r]) { inRun = true; break; } }
              if (!inRun) others.push(valArr[ov]);
            }
            if (others.length >= planeCount) {
              var w = [];
              for (var wi = 0; wi < planeCount; wi++) w = w.concat(getCardsOfValue(others[wi],1));
              results.push(base.concat(w));
            }
          } else if (wing === 'pair') {
            var pairV = [];
            for (var ov = 0; ov < valArr.length; ov++) {
              var inRun = false;
              for (var r = 0; r < run.length; r++) { if (valArr[ov] === run[r]) { inRun = true; break; } }
              if (!inRun && vc[valArr[ov]] >= 2) pairV.push(valArr[ov]);
            }
            if (pairV.length >= planeCount) {
              var w = [];
              for (var wi = 0; wi < planeCount; wi++) w = w.concat(getCardsOfValue(pairV[wi],2));
              results.push(base.concat(w));
            }
          }
        }
      }
    }

    // Always add bombs and rockets that beat
    for (var i = 0; i < valArr.length; i++) {
      if (vc[valArr[i]] >= 4 && valArr[i] <= 15) {
        for (var bc = 4; bc <= vc[valArr[i]]; bc++) {
          var bombCards = getCardsOfValue(valArr[i], bc);
          var bt = {type:'bomb', rank:valArr[i], len:bc};
          if (canBeat(bt, lt)) results.push(bombCards);
        }
      }
    }
    var j16 = vc[16] || 0, j17 = vc[17] || 0;
    if (j16 >= 2 && j17 >= 2) {
      results.push(getCardsOfValue(16,2).concat(getCardsOfValue(17,2)));
    }
  }

  return results;
}

// ========== HAND COUNT ESTIMATION ==========
function estimateHandCount(hand) {
  if (hand.length === 0) return 0;
  var vc = getValueCounts(hand);
  var counts = [];
  for (var k in vc) { if (vc.hasOwnProperty(k)) counts.push({v:parseInt(k), c:vc[k]}); }
  counts.sort(function(a,b){return a.v - b.v;});

  var handCount = 0;
  var used = {};

  // Rockets
  var j16 = vc[16] || 0, j17 = vc[17] || 0;
  if (j16 >= 2 && j17 >= 2) {
    handCount++; used[16] = 2; used[17] = 2;
  }

  // Bombs (4+)
  for (var i = 0; i < counts.length; i++) {
    var left = counts[i].c - (used[counts[i].v] || 0);
    if (left >= 4 && counts[i].v <= 15) {
      handCount++;
      used[counts[i].v] = (used[counts[i].v] || 0) + left; // use all
    }
  }

  // Triples (can carry singles/pairs)
  var triples = [];
  var singles = [];
  var pairs = [];
  for (var i = 0; i < counts.length; i++) {
    var left = counts[i].c - (used[counts[i].v] || 0);
    if (left >= 3) { triples.push(counts[i].v); left -= 3; }
    if (left >= 2) { pairs.push(counts[i].v); left -= 2; }
    if (left >= 1) { singles.push(counts[i].v); }
  }

  // Triples carry singles or pairs
  for (var i = 0; i < triples.length; i++) {
    handCount++;
    if (singles.length > 0) singles.pop();
    else if (pairs.length > 0) pairs.pop();
  }

  handCount += singles.length + pairs.length;

  // Jokers not used
  for (var jv = 16; jv <= 17; jv++) {
    var left = (vc[jv] || 0) - (used[jv] || 0);
    handCount += left;
  }

  return handCount;
}

// ========== PLAYED RECORD ==========
function recordPlay(cards) {
  for (var i = 0; i < cards.length; i++) {
    var v = cards[i].value;
    playedRecord[v] = (playedRecord[v] || 0) + 1;
  }
}

function getPlayedCount(v) {
  return playedRecord[v] || 0;
}

function isCardMaster(v) {
  // Is v the highest remaining card of its type?
  var maxPerValue = (v >= 16) ? 2 : 8; // 2 decks: 8 of each normal, 2 of each joker
  for (var check = 17; check > v; check--) {
    var maxC = (check >= 16) ? 2 : 8;
    var played = getPlayedCount(check);
    if (played < maxC) return false;
  }
  return true;
}

// ========== AI LOGIC ==========
function isSameTeam(p1, p2) {
  if (p1 === landlord || p2 === landlord) return false;
  if (p1 !== landlord && p2 !== landlord) return true;
  return false;
}

function isEnemy(p1, p2) {
  return !isSameTeam(p1, p2);
}

function enemyAboutToWin(p) {
  for (var i = 0; i < 4; i++) {
    if (isEnemy(p, i) && hands[i].length <= 4) return true;
  }
  return false;
}

function containsBomb(cards) {
  var ct = classifyHand(cards);
  return ct && (ct.type === 'bomb' || ct.type === 'rocket');
}

function breaksBomb(cards, hand) {
  // Check if playing these cards breaks a bomb in hand
  var usedVals = {};
  for (var i = 0; i < cards.length; i++) {
    usedVals[cards[i].value] = (usedVals[cards[i].value] || 0) + 1;
  }
  var vc = getValueCounts(hand);
  for (var k in usedVals) {
    if (usedVals.hasOwnProperty(k)) {
      var v = parseInt(k);
      if (v <= 15 && vc[v] >= 4 && usedVals[k] < vc[v]) {
        // We have a bomb of this value but we're using some (not all)
        var ct = classifyHand(cards);
        if (!ct || ct.type !== 'bomb') return true;
      }
    }
  }
  return false;
}

function aiFilterCandidates(candidates, hand, p, isFree) {
  var hc = estimateHandCount(hand);
  var filtered = [];

  for (var i = 0; i < candidates.length; i++) {
    var c = candidates[i];
    var ct = classifyHand(c);
    if (!ct) continue;

    var remaining = [];
    for (var j = 0; j < hand.length; j++) {
      var inPlay = false;
      for (var k = 0; k < c.length; k++) {
        if (hand[j].id === c[k].id) { inPlay = true; break; }
      }
      if (!inPlay) remaining.push(hand[j]);
    }
    var newHC = estimateHandCount(remaining);
    var isBomb = ct.type === 'bomb' || ct.type === 'rocket';

    // Filter rules
    if (isBomb && isFree && newHC > 2) continue;
    if (isBomb && !isFree && !enemyAboutToWin(p) && newHC > 2) continue;

    if (isFree && hc > 2) {
      if (ct.type === 'single' && c[0].value === 15) continue; // single 2
      if (ct.type === 'single' && c[0].value >= 16) continue; // single joker
      if (ct.type === 'pair' && c[0].value === 15) continue; // pair 2
      if (ct.type === 'triple' && c[0].value === 15 && hc > 3) continue;
    }

    if (breaksBomb(c, hand) && hc > 2 && remaining.length > 0) continue;

    filtered.push(c);
  }

  if (filtered.length === 0) {
    // Relax: only keep rocket restriction
    for (var i = 0; i < candidates.length; i++) {
      var ct = classifyHand(candidates[i]);
      if (!ct) continue;
      if (ct.type === 'rocket' && hc > 2) continue;
      filtered.push(candidates[i]);
    }
  }

  return filtered;
}

function scoreCandidate(c, hand, p, isFree, lastT, lastP) {
  var ct = classifyHand(c);
  if (!ct) return -9999;

  var remaining = [];
  for (var j = 0; j < hand.length; j++) {
    var inPlay = false;
    for (var k = 0; k < c.length; k++) {
      if (hand[j].id === c[k].id) { inPlay = true; break; }
    }
    if (!inPlay) remaining.push(hand[j]);
  }

  var oldHC = estimateHandCount(hand);
  var newHC = estimateHandCount(remaining);
  var hcReduce = oldHC - newHC;
  var score = 0;

  if (remaining.length === 0) return 500; // win!

  if (isFree) {
    score += hcReduce * 30;
    if (isCardMaster(ct.rank)) score += 15;
    score += c.length * 2;

    // High card penalty for singles
    if (ct.type === 'single' && ct.rank > 8) {
      var pen = Math.pow(1.8, ct.rank - 8) * (oldHC > 4 ? 4 : 2);
      score -= pen;
    }
    if (ct.type === 'pair' && ct.rank >= 13 && oldHC > 3) score -= 25;

    // Position strategy
    var nextP = (p + 3) % 4; // counterclockwise: next player
    if (p !== landlord && nextP === landlord) {
      if (ct.type === 'single' && isCardMaster(ct.rank)) score += 20;
    }
    if (p !== landlord && isSameTeam(p, nextP) && hands[nextP].length <= 5) {
      if (ct.type === 'single' && ct.rank <= 8) score += 15;
    }
  } else {
    score = 10 + hcReduce * 25;

    if (ct.rank >= 15 && lastT && lastT.rank <= 10 && oldHC > 3) score -= 60;
    if (ct.rank > 8 && oldHC > 3) {
      score -= Math.pow(1.4, ct.rank - 8) * 2;
    }

    // Teammate cooperation
    if (lastP >= 0 && isSameTeam(p, lastP)) {
      if (containsBomb(c)) score -= 300;
      score -= 40;
    }

    // Against landlord
    if (lastP >= 0 && lastP === landlord) {
      score += 15;
      if (hands[landlord].length <= 5) score += 25;
      if (isCardMaster(ct.rank)) score += 10;
    }

    if (enemyAboutToWin(p)) score += 25;
  }

  return score;
}

function aiPlay(p) {
  var hand = hands[p];
  var isFree = (passCount >= 3) || (lastPlayer === p) || (lastPlayCards.length === 0);
  var lt = isFree ? null : lastPlayType;

  var candidates = findValid(hand, lt);
  if (candidates.length === 0) return null; // pass

  candidates = aiFilterCandidates(candidates, hand, p, isFree);
  if (candidates.length === 0) return null;

  // Score and pick best
  var bestScore = -99999;
  var bestPlay = null;
  for (var i = 0; i < candidates.length; i++) {
    var s = scoreCandidate(candidates[i], hand, p, isFree, lastPlayType, lastPlayer);
    if (s > bestScore) {
      bestScore = s;
      bestPlay = candidates[i];
    }
  }

  if (!isFree && bestScore < -30) return null; // pass

  return bestPlay;
}

// ========== AI BIDDING ==========
function aiBidValue(p) {
  var hand = hands[p];
  var score = 0;
  var vc = getValueCounts(hand);

  // Count 2s
  var twos = vc[15] || 0;
  score += twos * 3;

  // Count As
  var aces = vc[14] || 0;
  score += aces * 2;

  // Jokers
  var sj = vc[16] || 0, bj = vc[17] || 0;
  if (sj >= 1 && bj >= 1) score += 5;
  if (bj >= 2) score += 6;
  else if (bj === 1) score += 3;
  if (sj >= 2) score += 3;
  else if (sj === 1 && bj === 0) score += 1;

  // Bombs
  for (var v = 3; v <= 15; v++) {
    if ((vc[v] || 0) >= 4) {
      score += 6;
      if ((vc[v] || 0) >= 5) score += 2;
    }
  }

  var bid = 0;
  if (score >= 18) bid = 3;
  else if (score >= 14) bid = 2;
  else if (currentBid === 0 && score >= 8) bid = 1;
  else if (currentBid === 1 && score >= 11) bid = 2;
  else if (currentBid === 2 && score >= 14) bid = 3;

  if (bid <= currentBid) bid = 0;
  return bid;
}

// ========== HINT SYSTEM ==========
function getHintSignature(cards) {
  var vals = [];
  for (var i = 0; i < cards.length; i++) vals.push(cards[i].value);
  vals.sort(function(a,b){return a-b;});
  return vals.join(',');
}

function generateHints() {
  var isFree = (passCount >= 3) || (lastPlayer === 0) || (lastPlayCards.length === 0);
  var lt = isFree ? null : lastPlayType;
  var candidates = findValid(hands[0], lt);

  // Deduplicate
  var seen = {};
  var unique = [];
  for (var i = 0; i < candidates.length; i++) {
    var sig = getHintSignature(candidates[i]);
    if (!seen[sig]) {
      seen[sig] = true;
      unique.push(candidates[i]);
    }
  }

  // Sort
  unique.sort(function(a, b) {
    var ca = classifyHand(a), cb = classifyHand(b);
    if (!ca || !cb) return 0;

    var ba = breaksBomb(a, hands[0]) ? 1 : 0;
    var bb = breaksBomb(b, hands[0]) ? 1 : 0;
    // Exception: long straights don't count as breaking bombs
    if (ba && ca.type === 'straight' && a.length >= 7) ba = 0;
    if (bb && cb.type === 'straight' && b.length >= 7) bb = 0;
    if (ba !== bb) return ba - bb;

    var bombA = (ca.type === 'bomb' || ca.type === 'rocket') ? 1 : 0;
    var bombB = (cb.type === 'bomb' || cb.type === 'rocket') ? 1 : 0;
    if (bombA !== bombB) return bombA - bombB;

    var remA = [], remB = [];
    for (var i = 0; i < hands[0].length; i++) {
      var inA = false, inB = false;
      for (var j = 0; j < a.length; j++) { if (hands[0][i].id === a[j].id) inA = true; }
      for (var j = 0; j < b.length; j++) { if (hands[0][i].id === b[j].id) inB = true; }
      if (!inA) remA.push(hands[0][i]);
      if (!inB) remB.push(hands[0][i]);
    }
    var hcA = estimateHandCount(hands[0]) - estimateHandCount(remA);
    var hcB = estimateHandCount(hands[0]) - estimateHandCount(remB);
    if (hcA !== hcB) return hcB - hcA;

    if (a.length !== b.length) return b.length - a.length;
    return ca.rank - cb.rank;
  });

  return unique;
}

// ========== GAME FLOW ==========
function startGame() {
  // Reset
  document.getElementById('resultOverlay').style.display = 'none';
  clearAllPlayAreas();
  document.getElementById('centerInfo').textContent = '';
  document.getElementById('diPai').style.display = 'none';
  document.getElementById('diPai').innerHTML = '';
  document.getElementById('bidBtns').style.display = 'none';
  document.getElementById('actionBtns').style.display = 'none';
  document.getElementById('handArea').innerHTML = '';

  hands = [[],[],[],[]];
  diPaiCards = [];
  landlord = -1;
  currentPlayer = -1;
  lastPlayCards = [];
  lastPlayType = null;
  lastPlayer = -1;
  passCount = 0;
  baseScore = 0;
  multiplier = 1;
  playedRecord = {};
  playCountPerPlayer = [0,0,0,0];
  cheatMode = false;
  document.getElementById('cheatBtn').className = '';
  gamePhase = '';
  bidHistory = [];
  currentBid = 0;
  bidTurns = 0;
  hintList = [];
  hintIdx = -1;
  lastHintRound = -1;
  roundId = 0;

  showMultiInfo();

  // Create and shuffle
  var deck = createDeck();
  shuffle(deck);

  // Deal: 25 each, 8 dipai
  for (var i = 0; i < 100; i++) {
    hands[i % 4].push(deck[i]);
  }
  for (var i = 100; i < 108; i++) {
    diPaiCards.push(deck[i]);
  }

  for (var p = 0; p < 4; p++) sortHand(hands[p]);

  updateHand();
  updateAllAI();

  // Start bidding
  bidStarter = Math.floor(Math.random() * 4);
  gamePhase = 'bid';
  currentPlayer = bidStarter;
  bidTurn();
}

function bidTurn() {
  if (bidTurns >= 4) {
    // Nobody bid
    if (currentBid === 0) {
      showToast('\u65e0\u4eba\u53eb\u7260\uff0c\u91cd\u65b0\u53d1\u724c', 1500);
      setTimeout(startGame, 1800);
      return;
    }
    // Find highest bidder
    finishBidding();
    return;
  }

  if (currentBid >= 3) {
    finishBidding();
    return;
  }

  if (currentPlayer === 0) {
    // Player bids
    showBidButtons();
  } else {
    // AI bids
    setTimeout(function() {
      var bid = aiBidValue(currentPlayer);
      if (bid > currentBid) {
        currentBid = bid;
        landlord = currentPlayer;
        showToast(PLAYER_NAMES[currentPlayer] + ' \u53eb' + bid + '\u5206', 1000);
        playSound('bid');
        if (bid >= 3) {
          bidTurns = 4; // end immediately
          setTimeout(function() { bidTurn(); }, 800);
          return;
        }
      } else {
        showToast(PLAYER_NAMES[currentPlayer] + ' \u4e0d\u53eb', 800);
      }
      bidTurns++;
      currentPlayer = (currentPlayer + 1) % 4;
      setTimeout(function() { bidTurn(); }, 1000);
    }, 600);
  }
}

function showBidButtons() {
  var el = document.getElementById('bidBtns');
  el.innerHTML = '';

  for (var b = 1; b <= 3; b++) {
    if (b > currentBid) {
      var btn = document.createElement('button');
      btn.className = 'bid-score';
      btn.textContent = b + '\u5206';
      btn.setAttribute('data-bid', b);
      btn.addEventListener('click', (function(val) {
        return function() {
          initAudio();
          playerBid(val);
        };
      })(b));
      el.appendChild(btn);
    }
  }
  var passBtn = document.createElement('button');
  passBtn.className = 'bid-pass';
  passBtn.textContent = '\u4e0d\u53eb';
  passBtn.addEventListener('click', function() {
    initAudio();
    playerBid(0);
  });
  el.appendChild(passBtn);
  el.style.display = 'block';
}

function playerBid(val) {
  document.getElementById('bidBtns').style.display = 'none';
  if (val > 0) {
    currentBid = val;
    landlord = 0;
    playSound('bid');
    showToast('\u4f60\u53eb\u4e86' + val + '\u5206', 800);
    if (val >= 3) {
      bidTurns = 4;
      setTimeout(function() { bidTurn(); }, 800);
      return;
    }
  } else {
    showToast('\u4f60\u4e0d\u53eb', 800);
  }
  bidTurns++;
  currentPlayer = (currentPlayer + 1) % 4;
  setTimeout(function() { bidTurn(); }, 800);
}

function finishBidding() {
  if (currentBid === 0) {
    showToast('\u65e0\u4eba\u53eb\u7260\uff0c\u91cd\u65b0\u53d1\u724c', 1500);
    setTimeout(startGame, 1800);
    return;
  }

  baseScore = currentBid;
  showMultiInfo();

  // Show dipai
  var dpEl = document.getElementById('diPai');
  dpEl.innerHTML = '';
  for (var i = 0; i < diPaiCards.length; i++) {
    dpEl.innerHTML += renderCard(diPaiCards[i], 'dipai-card');
  }
  dpEl.style.display = '-webkit-flex';
  dpEl.style.display = 'flex';

  document.getElementById('centerInfo').textContent = PLAYER_NAMES[landlord] + ' \u662f\u5730\u4e3b\uff01';
  updateLandlordLabels();

  // Give dipai to landlord
  for (var i = 0; i < diPaiCards.length; i++) {
    hands[landlord].push(diPaiCards[i]);
  }
  sortHand(hands[landlord]);

  updateHand();
  updateAllAI();

  setTimeout(function() {
    dpEl.style.display = 'none';
    document.getElementById('centerInfo').textContent = '';
    gamePhase = 'play';
    currentPlayer = landlord;
    lastPlayCards = [];
    lastPlayType = null;
    lastPlayer = -1;
    passCount = 0;
    playTurn();
  }, 2500);
}

function playTurn() {
  if (gamePhase !== 'play') return;

  clearAllPlayAreas();

  if (currentPlayer === 0) {
    showActionButtons();
  } else {
    setTimeout(function() {
      var play = aiPlay(currentPlayer);
      if (play && play.length > 0) {
        executePlay(currentPlayer, play);
      } else {
        executePass(currentPlayer);
      }
    }, 800);
  }
}

function showActionButtons() {
  var el = document.getElementById('actionBtns');
  var isFree = (passCount >= 3) || (lastPlayer === 0) || (lastPlayCards.length === 0);
  document.getElementById('btnPass').style.display = isFree ? 'none' : 'inline-block';
  el.style.display = 'block';
  hintList = [];
  hintIdx = -1;
}

function hideActionButtons() {
  document.getElementById('actionBtns').style.display = 'none';
}

function onPlay() {
  initAudio();
  var sel = getSelectedCards();
  if (sel.length === 0) {
    showToast('\u8bf7\u9009\u62e9\u8981\u51fa\u7684\u724c', 800);
    return;
  }

  var ct = classifyHand(sel);
  if (!ct) {
    showToast('\u65e0\u6548\u7684\u724c\u578b', 800);
    return;
  }

  var isFree = (passCount >= 3) || (lastPlayer === 0) || (lastPlayCards.length === 0);
  if (!isFree) {
    if (!canBeat(ct, lastPlayType)) {
      showToast('\u5fc5\u987b\u6253\u51fa\u66f4\u5927\u7684\u724c', 800);
      return;
    }
  }

  hideActionButtons();
  executePlay(0, sel);
}

function onPass() {
  initAudio();
  hideActionButtons();
  executePass(0);
}

function onHint() {
  initAudio();
  if (hintList.length === 0 || lastHintRound !== roundId) {
    hintList = generateHints();
    hintIdx = -1;
    lastHintRound = roundId;
  }
  if (hintList.length === 0) {
    showToast('\u6ca1\u6709\u53ef\u51fa\u7684\u724c', 800);
    return;
  }
  hintIdx = (hintIdx + 1) % hintList.length;
  selectCards(hintList[hintIdx]);
  showToast('\u65b9\u6848 ' + (hintIdx + 1) + '/' + hintList.length, 800);
}

function executePlay(p, cards) {
  var ct = classifyHand(cards);

  // Remove from hand
  for (var i = 0; i < cards.length; i++) {
    for (var j = 0; j < hands[p].length; j++) {
      if (hands[p][j].id === cards[i].id) {
        hands[p].splice(j, 1);
        break;
      }
    }
  }

  // Sort played cards for display
  cards.sort(function(a,b){ return b.value - a.value; });

  recordPlay(cards);
  playCountPerPlayer[p]++;

  lastPlayCards = cards;
  lastPlayType = ct;
  lastPlayer = p;
  passCount = 0;
  roundId++;

  // Update multiplier
  if (ct.type === 'bomb' || ct.type === 'rocket') {
    multiplier *= 2;
    showMultiInfo();
    playSound('bomb');
  } else {
    playSound('play');
  }

  showPlayArea(p, cards);
  if (p === 0) {
    clearSelection();
    updateHand();
  }
  updateAllAI();
  updateLandlordLabels();

  // Check win
  if (hands[p].length === 0) {
    setTimeout(function() { endGame(p); }, 600);
    return;
  }

  currentPlayer = (currentPlayer + 1) % 4;
  setTimeout(function() { playTurn(); }, 600);
}

function executePass(p) {
  passCount++;
  playSound('pass');
  showPlayArea(p, 'pass');

  if (p === 0) {
    clearSelection();
  }

  if (passCount >= 3) {
    // Everyone else passed, lastPlayer plays free
    currentPlayer = lastPlayer;
    setTimeout(function() {
      clearAllPlayAreas();
      lastPlayCards = [];
      lastPlayType = null;
      roundId++;
      playTurn();
    }, 600);
    return;
  }

  currentPlayer = (currentPlayer + 1) % 4;
  setTimeout(function() { playTurn(); }, 600);
}

// ========== END GAME ==========
function endGame(winner) {
  gamePhase = 'end';
  hideActionButtons();

  // Check spring
  var isSpring = false;
  var isAntiSpring = false;

  if (winner === landlord) {
    // Spring: all 3 farmers never played
    var allFarmerZero = true;
    for (var i = 0; i < 4; i++) {
      if (i !== landlord && playCountPerPlayer[i] > 0) { allFarmerZero = false; break; }
    }
    if (allFarmerZero) { isSpring = true; multiplier *= 2; }
  } else {
    // Anti-spring: landlord only played once
    if (playCountPerPlayer[landlord] <= 1) { isAntiSpring = true; multiplier *= 2; }
  }

  // Calculate score
  var playerIsLandlord = (landlord === 0);
  var landlordWon = (winner === landlord);
  var delta = 0;

  if (playerIsLandlord) {
    delta = baseScore * multiplier * 3 * (landlordWon ? 1 : -1);
  } else {
    var farmersWon = !landlordWon;
    delta = baseScore * multiplier * (farmersWon ? 1 : -1);
  }

  totalScore += delta;
  document.getElementById('totalScore').textContent = '\u79ef\u5206: ' + totalScore;

  // Cheat mode on
  cheatMode = true;
  document.getElementById('cheatBtn').className = 'active';
  updateAllAI();

  // Show result
  var card = document.getElementById('resultCard');
  var playerWon = (playerIsLandlord && landlordWon) || (!playerIsLandlord && !landlordWon);

  card.className = playerWon ? 'win' : 'lose';
  document.getElementById('resultTitle').textContent = playerWon ? '\u80dc \u5229 \uff01' : '\u5931 \u8d25';

  var springEl = document.getElementById('springBadge');
  if (isSpring) {
    springEl.textContent = '\u2728 \u6625\u5929\uff01 \u2728';
    springEl.style.display = 'block';
  } else if (isAntiSpring) {
    springEl.textContent = '\u2728 \u53cd\u6625\u5929\uff01 \u2728';
    springEl.style.display = 'block';
  } else {
    springEl.style.display = 'none';
  }

  document.getElementById('resultDetail').textContent =
    '\u5e95\u5206:' + baseScore + ' \u00d7 \u500d\u6570:' + multiplier +
    (playerIsLandlord ? ' \u00d7 3(\u5730\u4e3b)' : ' \u00d7 1(\u519c\u6c11)');

  var scoreEl = document.getElementById('resultScore');
  scoreEl.textContent = (delta >= 0 ? '+' : '') + delta;
  scoreEl.style.color = delta >= 0 ? '#f0c040' : '#ff6666';

  document.getElementById('resultTotal').textContent = '\u603b\u79ef\u5206: ' + totalScore;
  document.getElementById('resultOverlay').style.display = 'block';

  playSound(playerWon ? 'win' : 'lose');

  if (playerWon) spawnConfetti();
}

function spawnConfetti() {
  var colors = ['#f0c040','#ff6666','#66ff66','#6666ff','#ff66ff','#66ffff'];
  var area = document.getElementById('gameArea');
  for (var i = 0; i < 30; i++) {
    var c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = (Math.random() * 100) + '%';
    c.style.top = (Math.random() * 30) + '%';
    c.style.background = colors[Math.floor(Math.random() * colors.length)];
    c.style.borderRadius = Math.random() > 0.5 ? '50%' : '0';
    c.style.width = (6 + Math.random() * 6) + 'px';
    c.style.height = (6 + Math.random() * 6) + 'px';
    c.style.animationDelay = (Math.random() * 0.5) + 's';
    c.style.webkitAnimationDelay = (Math.random() * 0.5) + 's';
    area.appendChild(c);
    (function(el) {
      setTimeout(function() { if (el.parentNode) el.parentNode.removeChild(el); }, 3000);
    })(c);
  }
}

// ========== RULE & CHEAT ==========
function toggleRule() {
  var el = document.getElementById('ruleModal');
  el.style.display = el.style.display === 'block' ? 'none' : 'block';
}

function toggleCheat() {
  initAudio();
  cheatMode = !cheatMode;
  document.getElementById('cheatBtn').className = cheatMode ? 'active' : '';
  updateAllAI();
}

// ========== RESIZE ==========
function onResize() {
  var h = window.innerHeight;
  document.body.style.height = h + 'px';
}

window.addEventListener('resize', onResize);
window.addEventListener('load', function() {
  onResize();
  startGame();
});

// Init audio on first touch
document.addEventListener('touchstart', function() { initAudio(); }, {once: true});
document.addEventListener('click', function() { initAudio(); }, {once: true});

// Expose globals
window.startGame = startGame;
window.toggleRule = toggleRule;
window.toggleCheat = toggleCheat;
window.onHint = onHint;
window.onPass = onPass;
window.onPlay = onPlay;

})();
