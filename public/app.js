// public/app.js
const user = { id: null, username: null };

const API_BASE = window.location.origin.startsWith("file://") 
  ? "http://localhost:3001" 
  : window.location.origin;

// Initialize Discord SDK connection and fetch authorized user
async function initializeDiscordUser() {
  try {
    if (!window.discordReady) throw new Error('Discord SDK initialization is unavailable');
    await window.discordReady;

    const auth = await discordSdk.commands.authorize({
      client_id: '1543237982918672394',
      response_type: 'code',
      state: '',
      prompt: 'none',
      scope: ['identify', 'guilds', 'applications.commands'],
    });
    if (!auth?.code) throw new Error('Discord authorization did not return a code');

    const response = await fetch(`${API_BASE}/api/discord/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ code: auth.code }),
    });
    
    const tokenData = await response.json();
    if (!response.ok || !tokenData.access_token) {
      throw new Error(tokenData.error || 'Discord token exchange failed');
    }

    const discordUserAuth = await discordSdk.commands.authenticate({
      access_token: tokenData.access_token,
    });
    if (!discordUserAuth?.user) throw new Error('Discord authentication returned no user');

    user.id = discordUserAuth.user.id;
    user.username = discordUserAuth.user.username;
  } catch (err) {
    console.error('Discord Activity authentication failed:', err);
    user.id = null; // The server decides whether local demo mode is allowed
  }

  await fetchUserBalance();
}

// Tab Switching
window.switchGame = function(game) {
  if (isSlotSpinning) return;

  stopAuto('slots');
  stopAuto('plinko');

  document.getElementById('slots-view').classList.toggle('active', game === 'slots');
  document.getElementById('plinko-view').classList.toggle('active', game === 'plinko');
  document.getElementById('leaderboard-view').classList.toggle('active', game === 'leaderboard');
  document.getElementById('tab-slots').classList.toggle('active', game === 'slots');
  document.getElementById('tab-plinko').classList.toggle('active', game === 'plinko');
  document.getElementById('tab-leaderboard').classList.toggle('active', game === 'leaderboard');
  if (game === 'leaderboard') fetchLeaderboard();
};

// Fetch Initial Balance
async function fetchUserBalance() {
  try {
    const res = await fetch(API_BASE + '/api/session', { credentials: 'include' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Session unavailable');
    user.id = data.player.id;
    user.username = data.player.displayName;
    const balanceElem = document.getElementById('balance');
    const playerElem = document.getElementById('playerName');
    const connectionElem = document.getElementById('connectionState');
    if (balanceElem) balanceElem.innerText = data.balance;
    if (playerElem) playerElem.innerText = data.player.displayName;
    if (connectionElem) connectionElem.innerText = data.player.mode === 'discord' ? 'DISCORD CONNECTED' : 'LOCAL PREVIEW';
  } catch (err) {
    console.error('Failed to load session:', err);
    const connectionElem = document.getElementById('connectionState');
    if (connectionElem) connectionElem.innerText = 'OPEN IN DISCORD';
  }
}

// Helper to lock bet inputs
function setInputsLocked(game, locked) {
  const selector = game === 'slots' ? '.slot-ctrl' : '.plinko-ctrl';
  const controls = document.querySelectorAll(selector);
  controls.forEach(ctrl => {
    ctrl.disabled = locked;
  });

  const tabSlots = document.getElementById('tab-slots');
  const tabPlinko = document.getElementById('tab-plinko');
  const tabLeaderboard = document.getElementById('tab-leaderboard');
  const isAnyActive = isSlotSpinning;
  if (tabSlots) tabSlots.disabled = isAnyActive;
  if (tabPlinko) tabPlinko.disabled = isAnyActive;
  if (tabLeaderboard) tabLeaderboard.disabled = isAnyActive;
}

// Bet Modifiers
window.setBet = function(inputId, amount) {
  const input = document.getElementById(inputId);
  if (input && !input.disabled) input.value = amount;
};

window.modifyBet = function(inputId, factor) {
  const input = document.getElementById(inputId);
  if (!input || input.disabled) return;
  let val = parseInt(input.value || 0, 10);
  val = Math.max(10, Math.floor(val * factor));
  input.value = val;
};

window.setMaxBet = function(inputId) {
  const balanceElem = document.getElementById("balance");
  const input = document.getElementById(inputId);
  if (!balanceElem || !input || input.disabled) return;
  const currentBalance = parseInt(balanceElem.innerText || 0, 10);
  if (currentBalance < 10) return;
  input.value = Math.min(10000, currentBalance);
};

function createRequestKey(prefix) {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2);
}

let leaderboardPeriod = 'daily';
let leaderboardSort = 'won';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

window.setLeaderboardPeriod = function(period, button) {
  leaderboardPeriod = period;
  document.querySelectorAll('[data-leaderboard-period]').forEach(item => item.classList.remove('selected'));
  button?.classList.add('selected');
  fetchLeaderboard();
};

window.setLeaderboardSort = function(sort, button) {
  leaderboardSort = sort;
  document.querySelectorAll('[data-leaderboard-sort]').forEach(item => item.classList.remove('selected'));
  button?.classList.add('selected');
  fetchLeaderboard();
};

async function fetchLeaderboard() {
  const body = document.getElementById('leaderboardBody');
  const status = document.getElementById('leaderboardStatus');
  if (!body || !status) return;
  status.innerText = 'Loading rankings...';
  try {
    const response = await fetch(API_BASE + '/api/leaderboard?period=' + encodeURIComponent(leaderboardPeriod) + '&sort=' + encodeURIComponent(leaderboardSort));
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Leaderboard unavailable');
    body.innerHTML = data.entries.map(entry => `
      <tr>
        <td class="leaderboard-rank">#${entry.rank}</td>
        <td><div class="leaderboard-player">${entry.avatar ? `<img src="${escapeHtml(entry.avatar)}" alt="">` : '<span class="leaderboard-avatar-fallback">?</span>'}<span>${escapeHtml(entry.displayName)}</span></div></td>
        <td>${Number(entry.wagered).toLocaleString()}</td>
        <td>${Number(entry.won).toLocaleString()}</td>
      </tr>`).join('');
    status.innerText = data.entries.length ? '' : 'No wagers in this period yet.';
  } catch (error) {
    console.error('Leaderboard error:', error);
    body.innerHTML = '';
    status.innerText = 'Rankings are temporarily unavailable.';
  }
}

// Auto-Bet State
const autoState = {
  slots: { enabled: false, running: false, rounds: 10, remaining: 0 },
  plinko: { enabled: false, running: false, rounds: 10, remaining: 0, intervalId: null }
};

window.toggleAutoMode = function(game) {
  const isSlots = game === 'slots';
  const state = autoState[game];
  state.enabled = !state.enabled;

  const toggleBtn = document.getElementById(isSlots ? 'slotAutoToggle' : 'plinkoAutoToggle');
  const optionsPanel = document.getElementById(isSlots ? 'slotAutoOptions' : 'plinkoAutoOptions');
  const actionBtn = document.getElementById(isSlots ? 'spinBtn' : 'dropBtn');

  if (state.enabled) {
    toggleBtn.classList.add('active');
    toggleBtn.innerText = 'AUTO: ON';
    optionsPanel.classList.add('visible');
    actionBtn.innerText = isSlots ? 'START AUTO SPIN' : 'START AUTO DROP';
  } else {
    stopAuto(game);
  }
};

window.setAutoRounds = function(game, rounds, el) {
  autoState[game].rounds = rounds;
  const container = el.parentElement;
  container.querySelectorAll('.rounds-btn').forEach(btn => btn.classList.remove('selected'));
  el.classList.add('selected');
};

function stopAuto(game) {
  const isSlots = game === 'slots';
  const state = autoState[game];
  state.enabled = false;
  state.running = false;
  state.remaining = 0;

  if (state.intervalId) {
    clearInterval(state.intervalId);
    state.intervalId = null;
  }

  if (game === 'slots') {
    if (!isSlotSpinning) setInputsLocked('slots', false);
  } else {
    updatePlinkoInputState();
  }

  const toggleBtn = document.getElementById(isSlots ? 'slotAutoToggle' : 'plinkoAutoToggle');
  const optionsPanel = document.getElementById(isSlots ? 'slotAutoOptions' : 'plinkoAutoOptions');
  const actionBtn = document.getElementById(isSlots ? 'spinBtn' : 'dropBtn');

  if (toggleBtn) {
    toggleBtn.classList.remove('active');
    toggleBtn.innerText = 'AUTO: OFF';
  }
  if (optionsPanel) optionsPanel.classList.remove('visible');
  if (actionBtn) {
    actionBtn.innerText = isSlots ? 'SPIN' : 'DROP BALL';
    actionBtn.classList.remove('stop-btn');
    actionBtn.disabled = false;
  }
}

// ==========================================
// SLOT ENGINE
// ==========================================
const SYMBOLS = ['🍒', '🍋', '🍊', '🍇', '🔔', '💎', '7️⃣'];
const SLOT_SYMBOL_HTML = {
  '🔔': '<span class="slot-symbol slot-symbol-bar">BAR</span>',
  '7️⃣': '<span class="slot-symbol slot-symbol-seven">7</span>',
};
function renderSlotSymbol(symbol) {
  return SLOT_SYMBOL_HTML[symbol] || '<span class="slot-symbol">' + symbol + '</span>';
}
const CELL_HEIGHT = 75;
const GAP = 10;
const ITEM_STEP = CELL_HEIGHT + GAP;
let isSlotSpinning = false;

let currentGridState = [
  ['🍒', '🍋', '🍊', '🍇', '🔔'],
  ['🍋', '🍊', '🍇', '🔔', '💎'],
  ['🍊', '🍇', '🔔', '💎', '7️⃣']
];

function initReelColumns() {
  for (let c = 0; c < 5; c++) {
    const track = document.getElementById(`col-track-${c}`);
    if (!track) continue;
    track.style.transition = 'none';
    track.style.transform = 'translateY(0px)';
    track.innerHTML = `
      <div class="reel-cell" id="cell-0-${c}">${renderSlotSymbol(currentGridState[0][c])}</div>
      <div class="reel-cell" id="cell-1-${c}">${renderSlotSymbol(currentGridState[1][c])}</div>
      <div class="reel-cell" id="cell-2-${c}">${renderSlotSymbol(currentGridState[2][c])}</div>
    `;
  }
}

window.handleSlotSpinClick = function() {
  const state = autoState.slots;
  if (state.running) {
    stopAuto('slots');
    return;
  }

  if (state.enabled) {
    state.running = true;
    state.remaining = state.rounds;
    const actionBtn = document.getElementById('spinBtn');
    actionBtn.classList.add('stop-btn');
    setInputsLocked('slots', true);
    runAutoSlotsLoop();
  } else {
    spinMegaFruits();
  }
};

async function runAutoSlotsLoop() {
  const state = autoState.slots;
  const actionBtn = document.getElementById('spinBtn');

  while (state.running && state.remaining > 0) {
    const roundsText = state.remaining === Infinity ? '∞' : state.remaining;
    actionBtn.innerText = `STOP AUTO (${roundsText})`;

    const success = await spinMegaFruits();
    if (!success) {
      stopAuto('slots');
      break;
    }

    if (state.remaining !== Infinity) {
      state.remaining--;
    }

    if (state.running && state.remaining > 0) {
      await new Promise(r => setTimeout(r, 400));
    }
  }

  if (state.running && state.remaining === 0) {
    stopAuto('slots');
  }
}

window.spinMegaFruits = async function() {
  const betInput = document.getElementById("slotBet");
  const spinBtn = document.getElementById("spinBtn");
  const winBanner = document.getElementById("slotWinBanner");

  const bet = parseInt(betInput ? betInput.value : 0, 10);
  const balanceElem = document.getElementById("balance");
  const currentBal = parseInt(balanceElem ? balanceElem.innerText : 0, 10);

  if (!bet || bet <= 0 || currentBal < bet) {
    alert("Insufficient balance or invalid bet.");
    return false;
  }

  document.querySelectorAll('.reel-cell').forEach(el => el.classList.remove('win-highlight'));
  
  isSlotSpinning = true;
  if (!autoState.slots.running) {
    spinBtn.disabled = true;
    setInputsLocked('slots', true);
  }

  if (winBanner) winBanner.innerText = "Spinning...";

  try {
    const res = await fetch(`${API_BASE}/api/game/megafruit`, {
      method: "POST",
      headers: {
              'Content-Type': 'application/json',
              'X-Idempotency-Key': createRequestKey('spin'),
            },
            credentials: 'include',
            body: JSON.stringify({ bet }),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Slot error occurred.");
      isSlotSpinning = false;
      if (!autoState.slots.running) {
        spinBtn.disabled = false;
        setInputsLocked('slots', false);
      }
      return false;
    }

    await animateContinuousRollingStripsFast(data.grid);

    currentGridState = data.grid;
    if (balanceElem) balanceElem.innerText = data.newBalance;

    if (winBanner) {
      if (data.winAmount > 0) {
        winBanner.innerText = `🎉 WIN! Multiplier: ${Number(data.multiplier).toFixed(2)}x — Won ${data.winAmount} Credits!`;
        data.winningPositions.forEach(pos => {
          const cell = document.getElementById(`cell-${pos.r}-${pos.c}`);
          if (cell) cell.classList.add('win-highlight');
        });
      } else {
        winBanner.innerText = `No payline hits. Better luck next spin!`;
      }
    }

    isSlotSpinning = false;
    if (!autoState.slots.running) {
      spinBtn.disabled = false;
      setInputsLocked('slots', false);
    }
    return true;

  } catch (err) {
    console.error("MegaFruit Connection Error:", err);
    alert(`Server error connecting to MegaFruit endpoint!`);
    isSlotSpinning = false;
    if (!autoState.slots.running) {
      spinBtn.disabled = false;
      setInputsLocked('slots', false);
    }
    return false;
  }
};

function animateContinuousRollingStripsFast(finalGrid) {
  const rollingItemsCount = 12;
  const columns = Array.from({ length: 5 }, (_, c) => {
    const track = document.getElementById(`col-track-${c}`);
    if (!track) return Promise.resolve();

    let stripHTML = `
      <div class="reel-cell">${renderSlotSymbol(finalGrid[0][c])}</div>
      <div class="reel-cell">${renderSlotSymbol(finalGrid[1][c])}</div>
      <div class="reel-cell">${renderSlotSymbol(finalGrid[2][c])}</div>
    `;
    for (let i = 0; i < rollingItemsCount; i++) {
      const randSym = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
      stripHTML += `<div class="reel-cell spin-blur">${renderSlotSymbol(randSym)}</div>`;
    }
    stripHTML += `
      <div class="reel-cell">${renderSlotSymbol(currentGridState[0][c])}</div>
      <div class="reel-cell">${renderSlotSymbol(currentGridState[1][c])}</div>
      <div class="reel-cell">${renderSlotSymbol(currentGridState[2][c])}</div>
    `;

    const distance = (rollingItemsCount + 3) * ITEM_STEP;
    track.style.transition = 'none';
    track.style.transform = `translateY(-${distance}px)`;
    track.innerHTML = stripHTML;
    track.getBoundingClientRect();

    const durationSeconds = 0.76 + (c * 0.15);
    return new Promise(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        track.style.transition = `transform ${durationSeconds}s cubic-bezier(0.16, 0.72, 0.14, 1)`;
        track.style.transform = 'translateY(0px)';
      }));
      setTimeout(() => {
        track.style.transition = 'none';
        track.style.transform = 'translateY(0px)';
        track.innerHTML = `
          <div class="reel-cell" id="cell-0-${c}">${renderSlotSymbol(finalGrid[0][c])}</div>
          <div class="reel-cell" id="cell-1-${c}">${renderSlotSymbol(finalGrid[1][c])}</div>
          <div class="reel-cell" id="cell-2-${c}">${renderSlotSymbol(finalGrid[2][c])}</div>
        `;
        resolve();
      }, durationSeconds * 1000 + 40);
    });
  });
  return Promise.all(columns);
}

// ==========================================
// PLINKO ENGINE (MULTI-DROP CAPABLE)
// ==========================================
const canvas = document.getElementById('plinkoCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;

const ROWS = 9;
const MULTIPLIERS = [10, 4, 2, 1.2, 0.2, 0.2, 1.2, 2, 4, 10];
const PEG_RADIUS = 4;
const BALL_RADIUS = 7;
const START_Y = 32;
const ROW_SPACING = 28;
const PEG_SPACING = 28;

const activeBalls = [];
let plinkoLoopStarted = false;
let activePlinkoDrops = 0;
let pendingPlinkoWagers = 0;

function updatePlinkoInputState() {
  setInputsLocked('plinko', autoState.plinko.running);
  
  const dropBtn = document.getElementById('dropBtn');
  if (dropBtn && !autoState.plinko.running) {
    dropBtn.disabled = false;
  }
}

function getPegX(row, col) {
  if (!canvas) return 0;
  const countInRow = row + 3;
  const rowWidth = (countInRow - 1) * PEG_SPACING;
  const startX = (canvas.width - rowWidth) / 2;
  return startX + col * PEG_SPACING;
}

function getPegY(row) {
  return START_Y + row * ROW_SPACING;
}

function getGapX(row, gapIndex) {
  const leftPegX = getPegX(row, gapIndex);
  return leftPegX + (PEG_SPACING / 2);
}

function drawPlinkoBoard() {
  if (!canvas || !ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#ffffff";
  for (let r = 0; r < ROWS; r++) {
    const count = r + 3;
    for (let c = 0; c < count; c++) {
      const px = getPegX(r, c);
      const py = getPegY(r);
      ctx.beginPath();
      ctx.arc(px, py, PEG_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const lastRow = ROWS - 1;
  const bucketY = getPegY(ROWS) + 18;

  for (let i = 0; i < MULTIPLIERS.length; i++) {
    const bucketX = getGapX(lastRow, i);
    const mult = MULTIPLIERS[i];

    const slotColor = mult < 1 ? '#ef4444' : mult < 2 ? '#f59e0b' : mult < 4 ? '#22c55e' : mult < 10 ? '#22d3ee' : '#d946ef';
    ctx.fillStyle = slotColor;
    ctx.globalAlpha = 0.28;
    ctx.beginPath();
    ctx.roundRect(bucketX - 13, bucketY - 13, 26, 19, 4);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = slotColor;
    ctx.stroke();
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 9px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(mult) + 'x', bucketX, bucketY);
  }
}

window.handlePlinkoDropClick = function() {
  const state = autoState.plinko;
  if (state.running) {
    stopAuto('plinko');
    return;
  }

  if (state.enabled) {
    state.running = true;
    state.remaining = state.rounds;
    const dropBtn = document.getElementById('dropBtn');
    dropBtn.classList.add('stop-btn');
    setInputsLocked('plinko', true);
    runAutoPlinkoLoop();
  } else {
    dropPlinkoBall();
  }
};

async function runAutoPlinkoLoop() {
  const state = autoState.plinko;
  const dropBtn = document.getElementById('dropBtn');

  while (state.running && state.remaining > 0) {
    const roundsText = state.remaining === Infinity ? '∞' : state.remaining;
    dropBtn.innerText = `STOP AUTO (${roundsText})`;

    const success = await dropPlinkoBall();
    if (!success) {
      stopAuto('plinko');
      break;
    }

    if (state.remaining !== Infinity) {
      state.remaining--;
    }

    if (state.running && state.remaining > 0) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  if (state.running && state.remaining === 0) {
    stopAuto('plinko');
  }
}

window.dropPlinkoBall = async function() {
  const betInput = document.getElementById("plinkoBet");
  const dropBtn = document.getElementById("dropBtn");
  const winBanner = document.getElementById("plinkoWinBanner");

  const bet = parseInt(betInput ? betInput.value : 0, 10);
  const balanceElem = document.getElementById("balance");
  const currentBal = parseInt(balanceElem ? balanceElem.innerText : 0, 10);

  if (!bet || bet <= 0 || currentBal - pendingPlinkoWagers < bet) {
    alert("Insufficient balance or invalid bet.");
    return false;
  }

  activePlinkoDrops++;
  pendingPlinkoWagers += bet;
  updatePlinkoInputState();

  try {
    const res = await fetch(`${API_BASE}/api/game/plinko`, {
      method: "POST",
      headers: {
              'Content-Type': 'application/json',
              'X-Idempotency-Key': createRequestKey('drop'),
            },
            credentials: 'include',
            body: JSON.stringify({ bet }),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Plinko error occurred.");
      activePlinkoDrops--;
      pendingPlinkoWagers = Math.max(0, pendingPlinkoWagers - bet);
      updatePlinkoInputState();
      return false;
    }

    const waypoints = [];
    let currentRow = 0;
    let currentCol = 0;

    waypoints.push({ x: canvas.width / 2, y: START_Y - 15 });

    for (let r = 0; r < data.path.length; r++) {
      if (data.path[r] === 1) currentCol++;
      waypoints.push({ x: getGapX(r, currentCol), y: getPegY(r) + (ROW_SPACING / 2) });
    }

    const lastRow = ROWS - 1;
    const finalBucketX = getGapX(lastRow, data.slotIndex);
    const finalBucketY = getPegY(ROWS) + 8;
    waypoints.push({ x: finalBucketX, y: finalBucketY });

    activeBalls.push({
      waypoints,
      currentWaypointIndex: 0,
      x: waypoints[0].x,
      y: waypoints[0].y,
      progress: 0,
      speed: 0.08,
      multiplier: data.multiplier,
      bet,
      winAmount: data.winAmount
    });

    if (!plinkoLoopStarted) {
      plinkoLoopStarted = true;
      requestAnimationFrame(updatePlinkoPhysics);
    }

    return true;

  } catch (err) {
    console.error("Plinko Connection Error:", err);
    alert(`Server error connecting to Plinko endpoint!`);
    activePlinkoDrops--;
    pendingPlinkoWagers = Math.max(0, pendingPlinkoWagers - bet);
    updatePlinkoInputState();
    return false;
  }
};

function updatePlinkoPhysics() {
  drawPlinkoBoard();

  for (let i = activeBalls.length - 1; i >= 0; i--) {
    const ball = activeBalls[i];
    const targetWp = ball.waypoints[ball.currentWaypointIndex + 1];

    if (!targetWp) {
      activeBalls.splice(i, 1);
      activePlinkoDrops = Math.max(0, activePlinkoDrops - 1);
      pendingPlinkoWagers = Math.max(0, pendingPlinkoWagers - ball.bet);
      updatePlinkoInputState();

      const balanceElem = document.getElementById("balance");
      if (balanceElem) {
        const visibleBalance = parseInt(balanceElem.innerText || 0, 10);
        balanceElem.innerText = visibleBalance - ball.bet + ball.winAmount;
      }

      const winBanner = document.getElementById("plinkoWinBanner");
      if (winBanner) {
        winBanner.innerText = `⚪ Plinko Ball Landed in ${ball.multiplier}x! Won ${ball.winAmount} Credits!`;
      }
      continue;
    }

    const startWp = ball.waypoints[ball.currentWaypointIndex];
    ball.progress += ball.speed;

    if (ball.progress >= 1) {
      ball.progress = 0;
      ball.currentWaypointIndex++;
      ball.x = targetWp.x;
      ball.y = targetWp.y;
    } else {
      ball.x = startWp.x + (targetWp.x - startWp.x) * ball.progress;
      ball.y = startWp.y + (targetWp.y - startWp.y) * ball.progress + Math.sin(ball.progress * Math.PI) * -15;
    }

    ctx.fillStyle = "#f8fafc";
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  if (activeBalls.length > 0) {
    requestAnimationFrame(updatePlinkoPhysics);
  } else {
    plinkoLoopStarted = false;
  }
}

window.toggleLivePaylines = function(button) {
  const overlay = document.querySelector('.payline-overlay-live');
  if (!overlay) return;
  const visible = overlay.classList.toggle('visible');
  button.classList.toggle('active', visible);
  button.innerHTML = '<i class="payline-dot"></i> ' + (visible ? 'Hide' : 'Show') + ' paylines';
  button.setAttribute('aria-pressed', String(visible));
};

function installUpdatedCasinoUI() {
  if (!document.getElementById('casinoUpdateStyles')) {
    const style = document.createElement('style');
    style.id = 'casinoUpdateStyles';
    style.textContent = `
      .leaderboard-panel { padding: 14px; }
      .leaderboard-filters { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
      .leaderboard-filter-group { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
      .leaderboard-filter-label { flex-basis: 100%; color: var(--text-muted); font-size: .58rem; letter-spacing: .08em; text-transform: uppercase; }
      .payline-overlay-live { display: none; position: absolute; inset: 8px; z-index: 2; width: calc(100% - 16px); height: calc(100% - 16px); pointer-events: none; }
      .payline-overlay-live.visible { display: block; }
      .payline-overlay-live polyline { fill: none; opacity: .78; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; vector-effect: non-scaling-stroke; filter: drop-shadow(0 0 2px rgba(0,0,0,.9)); }
      .payline-toggle-live { padding: 3px 5px; border: 1px solid var(--border); border-radius: 4px; background: transparent; color: var(--text-muted); font-size: .56rem; text-transform: uppercase; }
      .payline-toggle-live.active { border-color: #fbbf24; color: #fbbf24; }
      .slot-symbol { display: inline-flex; min-width: 1.1em; align-items: center; justify-content: center; }
      .slot-symbol-bar { min-width: 2.5em; padding: 5px 4px; border: 2px solid #f8fafc; border-radius: 4px; background: linear-gradient(180deg,#f8fafc 0 36%,#111827 36% 64%,#f8fafc 64%); color: #ef4444; font-size: .52em; font-weight: 900; }
      .slot-symbol-seven { color: #ef233c; font-size: 1.3em; font-style: italic; font-weight: 900; -webkit-text-stroke: 1px #ffccd5; text-shadow: 0 3px 0 #8b0015,0 0 10px rgba(239,35,60,.4); transform: skew(-5deg); }
      .leaderboard-table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: 6px; }
      .leaderboard-table { width: 100%; border-collapse: collapse; font-size: .72rem; }
      .leaderboard-table th, .leaderboard-table td { padding: 9px 7px; border-bottom: 1px solid var(--border); text-align: right; }
      .leaderboard-table th:nth-child(2), .leaderboard-table td:nth-child(2) { text-align: left; }
      .leaderboard-table tr:last-child td { border-bottom: 0; }
      .leaderboard-rank { width: 36px; color: var(--accent); font-weight: 800; }
      .leaderboard-player { display: flex; align-items: center; gap: 7px; min-width: 110px; }
      .leaderboard-player img, .leaderboard-avatar-fallback { width: 24px; height: 24px; border-radius: 50%; object-fit: cover; }
      .leaderboard-avatar-fallback { display: inline-grid; place-items: center; background: var(--surface-light); color: var(--text-muted); }
      .leaderboard-status { min-height: 26px; padding: 8px; color: var(--text-muted); font-size: .7rem; text-align: center; }
      [data-leaderboard-period].selected, [data-leaderboard-sort].selected { border-color: var(--accent); color: var(--accent); }
    `;
    document.head.appendChild(style);
  }

  for (const config of [
    { inputId: 'slotBet', controlClass: 'slot-ctrl' },
    { inputId: 'plinkoBet', controlClass: 'plinko-ctrl' },
  ]) {
    const input = document.getElementById(config.inputId);
    const group = input?.closest('.bet-input-group');
    if (!group) continue;
    group.innerHTML = `
      <button class="chip-btn ${config.controlClass}" onclick="modifyBet('${config.inputId}', 2)">2x</button>
      <input type="number" id="${config.inputId}" class="${config.controlClass} bet-input" value="${escapeHtml(input.value || '10')}" min="10">
      <div class="chip-btns">
        <button class="chip-btn ${config.controlClass}" onclick="setBet('${config.inputId}', 10)">10</button>
        <button class="chip-btn ${config.controlClass}" onclick="setBet('${config.inputId}', 50)">50</button>
        <button class="chip-btn ${config.controlClass}" onclick="setBet('${config.inputId}', 100)">100</button>
        <button class="chip-btn ${config.controlClass}" onclick="setMaxBet('${config.inputId}')">MAX</button>
      </div>
    `;
  }

  const slotsWrapper = document.querySelector('#slots-view .slots-grid-wrapper');
  if (slotsWrapper && !slotsWrapper.querySelector('.payline-overlay-live')) {
    slotsWrapper.querySelectorAll('.payline-line').forEach(line => line.remove());
    const paylines = [[0,0,0,0,0],[1,1,1,1,1],[2,2,2,2,2],[0,1,2,1,0],[2,1,0,1,2],[0,0,1,2,2],[2,2,1,0,0],[1,0,0,0,1],[1,2,2,2,1]];
    const colors = ['#ff4757','#2ed573','#3b82f6','#fbbf24','#a855f7','#22d3ee','#f97316','#ec4899','#84cc16'];
    slotsWrapper.insertAdjacentHTML('afterbegin', '<svg class="payline-overlay-live" viewBox="0 0 500 300" preserveAspectRatio="none" aria-hidden="true">' + paylines.map((line, index) => '<polyline stroke="' + colors[index] + '" points="' + line.map((row, column) => (50 + column * 100) + ',' + (50 + row * 100)).join(' ') + '"></polyline>').join('') + '</svg>');
    const legend = document.querySelector('#slots-view .payline-legend');
    if (legend) legend.innerHTML = '<button class="payline-toggle-live" onclick="toggleLivePaylines(this)"><i class="payline-dot"></i> Show paylines</button><span>9 lines · 96.24% RTP</span><span>🔒 server resolved</span>';
  }

  const tabs = document.querySelector('.nav-tabs');
  if (tabs && !document.getElementById('tab-leaderboard')) {
    tabs.insertAdjacentHTML('beforeend', '<button id="tab-leaderboard" class="tab-btn" onclick="switchGame(\'leaderboard\')">Ranks</button>');
  }

  const container = document.querySelector('.casino-container');
  if (container && !document.getElementById('leaderboard-view')) {
    container.insertAdjacentHTML('beforeend', `
      <div id="leaderboard-view" class="game-view">
        <div class="win-banner">PLAYER RANKINGS</div>
        <div class="leaderboard-panel">
          <div class="leaderboard-filters">
            <div class="leaderboard-filter-group">
              <span class="leaderboard-filter-label">Ranking</span>
              <button class="chip-btn selected" data-leaderboard-sort onclick="setLeaderboardSort('won', this)">Most Won</button>
              <button class="chip-btn" data-leaderboard-sort onclick="setLeaderboardSort('wagered', this)">Most Wagered</button>
            </div>
            <div class="leaderboard-filter-group">
              <span class="leaderboard-filter-label">Period filter</span>
              <button class="rounds-btn selected" data-leaderboard-period onclick="setLeaderboardPeriod('daily', this)">Daily</button>
              <button class="rounds-btn" data-leaderboard-period onclick="setLeaderboardPeriod('weekly', this)">Weekly</button>
              <button class="rounds-btn" data-leaderboard-period onclick="setLeaderboardPeriod('monthly', this)">Monthly</button>
              <button class="rounds-btn" data-leaderboard-period onclick="setLeaderboardPeriod('all', this)">All Time</button>
            </div>
          </div>
          <div class="leaderboard-table-wrap">
            <table class="leaderboard-table">
              <thead><tr><th>#</th><th>Player</th><th>Wagered</th><th>Won</th></tr></thead>
              <tbody id="leaderboardBody"></tbody>
            </table>
          </div>
          <div id="leaderboardStatus" class="leaderboard-status">Open rankings to load players.</div>
        </div>
      </div>
    `);
  }
}

// Initial setup triggers on load
window.addEventListener('DOMContentLoaded', () => {
  installUpdatedCasinoUI();
  initializeDiscordUser();
  initReelColumns();
  drawPlinkoBoard();
});