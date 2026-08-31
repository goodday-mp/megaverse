import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';
import crypto from 'crypto';
import { initDB, getUser, adjustBalance, getRecentTransactions } from './database.js';

dotenv.config();

const TOKEN = process.env.DISCORD_TOKEN || process.env.TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID || '1543237982918672394';
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || process.env.CLIENT_SECRET;
const ADMIN_USER_ID = process.env.ADMIN_USER_ID;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'g00dday';
const SESSION_SECRET = process.env.SESSION_SECRET;
const ALLOW_DEMO_MODE = process.env.NODE_ENV !== 'production' || process.env.ALLOW_DEMO_MODE === 'true';
const PORT = process.env.PORT || 3000;
const SESSION_COOKIE = 'mega_casino_session';

if (!SESSION_SECRET) console.warn('SESSION_SECRET is not set; Discord session routes are unavailable.');

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '20kb' }));
app.use(express.static('public', { etag: true, maxAge: '1h' }));

const SYMBOLS = ['🍒', '🍋', '🍊', '🍇', '🔔', '💎', '7️⃣'];
const PAYTABLE = {
  '🍒': { 3: 2, 4: 5, 5: 10 }, '🍋': { 3: 2, 4: 5, 5: 10 },
  '🍊': { 3: 3, 4: 8, 5: 15 }, '🍇': { 3: 4, 4: 10, 5: 20 },
  '🔔': { 3: 5, 4: 15, 5: 30 }, '💎': { 3: 10, 4: 25, 5: 50 },
  '7️⃣': { 3: 25, 4: 75, 5: 100 },
};
const PAYLINES = [[0,0,0,0,0], [1,1,1,1,1], [2,2,2,2,2], [0,1,2,1,0], [2,1,0,1,2]];
const PLINKO_MULTIPLIERS = [10, 4, 2, 1.2, 0.2, 0.2, 1.2, 2, 4, 10];

function sign(value) {
  return SESSION_SECRET ? crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('base64url') : '';
}

function setSession(req, res, discordId) {
  const value = encodeURIComponent(discordId);
  const isSecure = req.secure || req.get('x-forwarded-proto') === 'https';
  const sameSite = isSecure ? 'None' : 'Lax';
  res.setHeader('Set-Cookie', SESSION_COOKIE + '=' + value + '.' + sign(value) + '; Path=/; HttpOnly; SameSite=' + sameSite + '; Max-Age=2592000' + (isSecure ? '; Secure' : ''));
}

function getSessionId(req) {
  const raw = req.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(SESSION_COOKIE + '='))?.slice(SESSION_COOKIE.length + 1);
  if (!raw || !SESSION_SECRET) return null;
  const separator = raw.lastIndexOf('.');
  if (separator <= 0) return null;
  const value = raw.slice(0, separator);
  const provided = raw.slice(separator + 1);
  const expected = sign(value);
  try {
    if (provided.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) return null;
    return decodeURIComponent(value);
  } catch { return null; }
}

async function currentUser(req) {
  const discordId = getSessionId(req);
  if (discordId) return getUser(discordId);
  return ALLOW_DEMO_MODE ? getUser('demo', { username: 'Demo Player' }) : null;
}

function validBet(value) { return Number.isInteger(value) && value >= 10 && value <= 10000; }
function sendError(res, message, status = 400) { return res.status(status).json({ error: message }); }

async function playMegafruit(userId, bet, referencePrefix) {
  const afterBet = await adjustBalance(userId, -bet, { type: 'bet', reason: 'MegaFruit wager', referenceId: referencePrefix + ':bet' });
  const grid = Array.from({ length: 3 }, () => Array.from({ length: 5 }, () => SYMBOLS[crypto.randomInt(0, SYMBOLS.length)]));
  let multiplier = 0;
  const winningPositions = [];
  for (const line of PAYLINES) {
    const first = grid[line[0]][0];
    let matches = 1;
    for (let column = 1; column < 5; column += 1) {
      if (grid[line[column]][column] === first) matches += 1; else break;
    }
    if (matches >= 3) {
      multiplier += PAYTABLE[first]?.[matches] || 0;
      for (let column = 0; column < matches; column += 1) winningPositions.push({ r: line[column], c: column });
    }
  }
  const winAmount = Math.floor(bet * multiplier);
  const finalUser = winAmount > 0
    ? await adjustBalance(userId, winAmount, { type: 'win', reason: 'MegaFruit payout', referenceId: referencePrefix + ':win' })
    : afterBet;
  return { grid, multiplier, winAmount, newBalance: finalUser.balance, winningPositions };
}

async function playPlinko(userId, bet, referencePrefix) {
  const afterBet = await adjustBalance(userId, -bet, { type: 'bet', reason: 'Plinko wager', referenceId: referencePrefix + ':bet' });
  const path = [];
  let slotIndex = 0;
  for (let row = 0; row < 9; row += 1) {
    const direction = crypto.randomInt(0, 2);
    path.push(direction);
    slotIndex += direction;
  }
  const multiplier = PLINKO_MULTIPLIERS[slotIndex];
  const winAmount = Math.floor(bet * multiplier);
  const finalUser = await adjustBalance(userId, winAmount, { type: 'win', reason: 'Plinko payout', referenceId: referencePrefix + ':win' });
  return { path, slotIndex, multiplier, winAmount, newBalance: finalUser.balance };
}

app.get('/api/session', async (req, res) => {
  const user = await currentUser(req);
  if (!user) return sendError(res, 'Discord authentication is required.', 401);
  res.json({
    player: { id: user.discord_id, displayName: user.username || 'Discord player', avatar: user.avatar || null, mode: user.discord_id === 'demo' ? 'demo' : 'discord' },
    balance: user.balance,
    recentTransactions: await getRecentTransactions(user.discord_id),
  });
});

app.get('/api/user/balance/:discordId', async (req, res) => {
  const discordId = getSessionId(req);
  if (!discordId || discordId !== req.params.discordId) return sendError(res, 'Use the authenticated session.', 401);
  res.json({ balance: (await getUser(discordId)).balance });
});

app.post('/api/discord/token', async (req, res) => {
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  if (!code || !CLIENT_SECRET || !SESSION_SECRET) return sendError(res, 'Discord authentication is not configured.', 503);
  try {
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'authorization_code', code }),
    });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token) throw new Error('Token exchange failed');
    const userResponse = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: 'Bearer ' + tokenData.access_token } });
    const discordUser = await userResponse.json();
    if (!userResponse.ok || !discordUser.id) throw new Error('Identity lookup failed');
    const avatar = discordUser.avatar ? 'https://cdn.discordapp.com/avatars/' + discordUser.id + '/' + discordUser.avatar + '.png?size=128' : null;
    const user = await getUser(discordUser.id, { username: discordUser.global_name || discordUser.username, avatar });
    setSession(req, res, user.discord_id);
    res.json({ access_token: tokenData.access_token, user: { id: user.discord_id, username: user.username, avatar: user.avatar } });
  } catch (error) {
    console.error('Discord authentication failed:', error);
    sendError(res, 'Failed to authenticate with Discord.', 401);
  }
});

app.post('/api/game/megafruit', async (req, res) => {
  const user = await currentUser(req);
  const bet = req.body?.bet;
  if (!user) return sendError(res, 'Discord authentication is required.', 401);
  if (!validBet(bet) || user.balance < bet) return sendError(res, 'Invalid bet or insufficient balance.');
  try {
    const reference = req.get('x-idempotency-key') || crypto.randomUUID();
    res.json(await playMegafruit(user.discord_id, bet, reference));
  } catch (error) {
    console.error('MegaFruit error:', error);
    sendError(res, error.message === 'Insufficient balance' ? error.message : 'The wager could not be completed.');
  }
});

app.post('/api/game/plinko', async (req, res) => {
  const user = await currentUser(req);
  const bet = req.body?.bet;
  if (!user) return sendError(res, 'Discord authentication is required.', 401);
  if (!validBet(bet) || user.balance < bet) return sendError(res, 'Invalid bet or insufficient balance.');
  try {
    const reference = req.get('x-idempotency-key') || crypto.randomUUID();
    res.json(await playPlinko(user.discord_id, bet, reference));
  } catch (error) {
    console.error('Plinko error:', error);
    sendError(res, error.message === 'Insufficient balance' ? error.message : 'The wager could not be completed.');
  }
});

app.post('/api/bot/wallet', async (req, res) => {
  if (!process.env.BOT_WALLET_TOKEN || req.get('x-bot-token') !== process.env.BOT_WALLET_TOKEN) return sendError(res, 'Bot wallet authorization failed.', 401);
  const { discordId, amount, reason, referenceId } = req.body || {};
  if (typeof discordId !== 'string' || !Number.isInteger(amount) || amount === 0 || typeof reason !== 'string' || !reason.trim()) return sendError(res, 'discordId, non-zero whole amount, and reason are required.');
  try {
    const user = await adjustBalance(discordId, amount, { type: amount > 0 ? 'deposit' : 'withdrawal', reason: reason.trim().slice(0, 200), referenceId });
    res.json({ discordId, balance: user.balance, amount });
  } catch (error) { sendError(res, error.message === 'Insufficient balance' ? error.message : 'Wallet adjustment failed.'); }
});

function isAdmin(user) { return ADMIN_USER_ID ? user.id === ADMIN_USER_ID : user.username === ADMIN_USERNAME; }

async function handleInteraction(interaction) {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, user } = interaction;
  const profile = { username: user.globalName || user.username };
  const dbUser = await getUser(user.id, profile);

  if (commandName === 'balance') {
    const target = interaction.options.getUser('user');
    if (target && !isAdmin(user)) return interaction.reply({ content: '❌ You can only check your own balance.', ephemeral: true });
    const selected = target || user;
    const wallet = await getUser(selected.id, { username: selected.globalName || selected.username });
    const embed = new EmbedBuilder().setTitle('💰 Account Balance').setDescription('**' + selected.username + '** has **' + wallet.balance + '** Credits.').setColor('#2ed573');
    return interaction.reply({ embeds: [embed] });
  }

  if (commandName === 'deposit' || commandName === 'withdraw') {
    if (!isAdmin(user)) return interaction.reply({ content: '❌ Only the configured casino admin can process this.', ephemeral: true });
    const target = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    if (!target || !Number.isInteger(amount) || amount <= 0) return interaction.reply({ content: 'Invalid amount.', ephemeral: true });
    try {
      const change = commandName === 'deposit' ? amount : -amount;
      const wallet = await adjustBalance(target.id, change, {
        type: commandName, reason: 'Bot /' + commandName,
        referenceId: 'discord:' + interaction.id,
        profile: { username: target.globalName || target.username },
      });
      const embed = new EmbedBuilder()
        .setTitle(commandName === 'deposit' ? '✅ Manual Deposit Complete' : '✅ Manual Withdrawal Processed')
        .setDescription((commandName === 'deposit' ? 'Added' : 'Deducted') + ' **' + amount + '** credits for <@' + target.id + '>.')
        .addFields({ name: 'New Balance', value: wallet.balance + ' Credits', inline: true })
        .setColor(commandName === 'deposit' ? '#2ed573' : '#ff4757');
      return interaction.reply({ embeds: [embed] });
    } catch (error) { return interaction.reply({ content: '❌ ' + (error.message === 'Insufficient balance' ? error.message : 'Wallet adjustment failed.'), ephemeral: true }); }
  }

  if (commandName === 'slots' || commandName === 'plinko') {
    const bet = interaction.options.getInteger('bet');
    if (!validBet(bet) || dbUser.balance < bet) return interaction.reply({ content: 'Invalid bet or insufficient balance.', ephemeral: true });
    try {
      const result = commandName === 'slots'
        ? await playMegafruit(user.id, bet, 'discord:' + interaction.id)
        : await playPlinko(user.id, bet, 'discord:' + interaction.id);
      if (commandName === 'slots') {
        const grid = result.grid.map((row) => row.join(' | ')).join('\n');
        const embed = new EmbedBuilder().setTitle('🍉 MegaFruit Slots — ' + (result.winAmount > 0 ? '🎉 WIN!' : '❌ No Win')).setDescription('\n' + grid).addFields({ name: 'Bet', value: String(bet), inline: true }, { name: 'Won', value: result.winAmount + ' Credits', inline: true }, { name: 'New Balance', value: String(result.newBalance), inline: true }).setColor(result.winAmount > 0 ? '#2ed573' : '#ff4757');
        return interaction.reply({ embeds: [embed] });
      }
      const embed = new EmbedBuilder().setTitle('⚪ Plinko Drop — Landed in ' + result.multiplier + 'x!').addFields({ name: 'Bet', value: String(bet), inline: true }, { name: 'Won', value: result.winAmount + ' Credits', inline: true }, { name: 'New Balance', value: String(result.newBalance), inline: true }).setColor(result.multiplier >= 1 ? '#2ed573' : '#ff4757');
      return interaction.reply({ embeds: [embed] });
    } catch { return interaction.reply({ content: 'The wager could not be completed.', ephemeral: true }); }
  }
}

const client = TOKEN ? new Client({ intents: [GatewayIntentBits.Guilds] }) : null;
if (client) {
  client.on('interactionCreate', handleInteraction);
  client.once('ready', () => console.log('Logged in as ' + client.user.tag));
}
await initDB();
app.listen(PORT, () => console.log('Web server & API running on port ' + PORT));
if (client) client.login(TOKEN).catch((error) => console.error('Discord bot login failed:', error));
