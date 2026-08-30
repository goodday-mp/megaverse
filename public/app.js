// public/app.js
const user = { id: null, username: null };

const API_BASE = window.location.origin.startsWith("file://") 
  ? "http://localhost:3001" 
  : window.location.origin;

// Initialize Discord SDK connection and fetch authorized user
async function initializeDiscordUser() {
  try {
    const auth = await discordSdk.commands.authorize({
      client_id: '1543237982918672394',
      response_type: 'code',
      prompt: 'none',
      scope: ['identify', 'guilds'],
    });

    const response = await fetch(`${API_BASE}/api/discord/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: auth.code }),
    });
    
    const { access_token } = await response.json();
    const discordUserAuth = await discordSdk.commands.authenticate({ access_token });

    if (discordUserAuth && discordUserAuth.user) {
      user.id = discordUserAuth.user.id;
      user.username = discordUserAuth.user.username;
    }
  } catch (err) {
    console.warn("Running outside Discord or auth failed, falling back to local guest ID:", err);
    user.id = '1'; // Fallback for local testing outside Discord
  }

  fetchUserBalance();
}

// Tab Switching
window.switchGame = function(game) {
  if (isSlotSpinning || activePlinkoDrops > 0) return;

  stopAuto('slots');
  stopAuto('plinko');

  document.getElementById('slots-view').classList.toggle('active', game === 'slots');
  document.getElementById('plinko-view').classList.toggle('active', game === 'plinko');
  document.getElementById('tab-slots').classList.toggle('active', game === 'slots');
  document.getElementById('tab-plinko').classList.toggle('active', game === 'plinko');
};

// Fetch Initial Balance
async function fetchUserBalance() {
  try {
    const res = await fetch(`${API_BASE}/api/user/balance/${user.id}`);
    const data = await res.json();
    const balanceElem = document.getElementById("balance");
    if (balanceElem) balanceElem.innerText = data.balance;
  } catch (err) {
    console.error("Failed to load balance:", err);
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
  const isAnyActive = isSlotSpinning || activePlinkoDrops > 0;
  if (tabSlots) tabSlots.disabled = isAnyActive;
  if (tabPlinko) tabPlinko.disabled = isAnyActive;
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
  input.value = Math.max(10, currentBalance);
};

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
      <div class="reel-cell" id="cell-0-${c}">${currentGridState[0][c]}</div>
      <div class="reel-cell" id="cell-1-${c}">${currentGridState[1][c]}</div>
      <div class="reel-cell" id="cell-2-${c}">${currentGridState[2][c]}</div>
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id, bet }),
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
        winBanner.innerText = `🎉 WIN! Multiplier: ${data.multiplier}x — Won ${data.winAmount} Credits!`;
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
  return new Promise(resolve => {
    const totalColumns = 5;
    const rollingItemsCount = 12;

    for (let c = 0; c < totalColumns; c++) {
      const track = document.getElementById(`col-track-${c}`);
      if (!track) continue;

      let stripHTML = `
        <div class="reel-cell" id="cell-0-${c}">${finalGrid[0][c]}</div>
        <div class="reel-cell" id="cell-1-${c}">${finalGrid[1][c]}</div>
        <div class="reel-cell" id="cell-2-${c}">${finalGrid[2][c]}</div>
      `;

      for (let i = 0; i < rollingItemsCount; i++) {
        const randSym = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
        stripHTML += `<div class="reel-cell spin-blur">${randSym}</div>`;
      }

      stripHTML += `
        <div class="reel-cell">${currentGridState[0][c]}</div>
        <div class="reel-cell">${currentGridState[1][c]}</div>
        <div class="reel-cell">${currentGridState[2][c]}</div>
      `;

      track.innerHTML = stripHTML;

      const startOffsetY = -(rollingItemsCount + 3) * ITEM_STEP;
      track.style.transition = 'none';
      track.style.transform = `translateY(${startOffsetY}px)`;

      track.getBoundingClientRect();

      const durationSeconds = 0.6 + (c * 0.15);
      track.style.transition = `transform ${durationSeconds}s cubic-bezier(0.1, 0.9, 0.2, 1.0)`;
      track.style.transform = 'translateY(0px)';

      if (c === totalColumns - 1) {
        setTimeout(() => {
          document.querySelectorAll('.spin-blur').forEach(el => el.classList.remove('spin-blur'));
          resolve();
        }, durationSeconds * 1000);
      }
    }
  });
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
const START_Y = 40;
const ROW_SPACING = 34;
const PEG_SPACING = 36;

const activeBalls = [];
let plinkoLoopStarted = false;
let activePlinkoDrops = 0;

function updatePlinkoInputState() {
  const isLocked = activePlinkoDrops > 0 || autoState.plinko.running;
  setInputsLocked('plinko', isLocked);
  
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
  const bucketY = getPegY(ROWS) + 15;

  for (let i = 0; i < MULTIPLIERS.length; i++) {
    const bucketX = getGapX(lastRow, i);
    const mult = MULTIPLIERS[i];

    ctx.fillStyle = mult >= 2 ? "#ff4757" : (mult >= 1 ? "#ffa502" : "#2ed573");
    ctx.font = "bold 12px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${mult}x`, bucketX, bucketY);
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

  if (!bet || bet <= 0 || currentBal < bet) {
    alert("Insufficient balance or invalid bet.");
    return false;
  }

  activePlinkoDrops++;
  updatePlinkoInputState();

  try {
    const res = await fetch(`${API_BASE}/api/game/plinko`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id, bet }),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Plinko error occurred.");
      activePlinkoDrops--;
      updatePlinkoInputState();
      return false;
    }

    const waypoints = [];
    let currentRow = 0;
    let currentCol = 0;

    waypoints.push({ x: canvas.width / 2, y: START_Y - 15 });

    for (let r = 0; r < data.path.length; r++) {
      waypoints.push({ x: getPegX(r, currentCol), y: getPegY(r) });
      if (data.path[r] === 1) {
        currentCol++;
      }
    }

    const lastRow = ROWS - 1;
    const finalBucketX = getGapX(lastRow, data.slotIndex);
    const finalBucketY = getPegY(ROWS) + 10;
    waypoints.push({ x: finalBucketX, y: finalBucketY });

    activeBalls.push({
      waypoints,
      currentWaypointIndex: 0,
      x: waypoints[0].x,
      y: waypoints[0].y,
      progress: 0,
      speed: 0.08,
      multiplier: data.multiplier,
      winAmount: data.winAmount,
      newBalance: data.newBalance
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
      updatePlinkoInputState();

      const balanceElem = document.getElementById("balance");
      if (balanceElem) balanceElem.innerText = ball.newBalance;

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

    ctx.fillStyle = ball.multiplier >= 2 ? "#ff4757" : (ball.multiplier >= 1 ? "#ffa502" : "#2ed573");
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

// Initial setup triggers on load
window.addEventListener('DOMContentLoaded', () => {
  initializeDiscordUser();
  initReelColumns();
  drawPlinkoBoard();
});