import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { Client, GatewayIntentBits, EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { createCanvas } from '@napi-rs/canvas';
import crypto from 'crypto';
import { initDB, getUser, updateBalance } from './database.js';

const TOKEN = process.env.DISCORD_TOKEN;[cite: 2]
const CLIENT_ID = '1543237982918672394';[cite: 2]
const ADMIN_USERNAME = 'g00dday';[cite: 2]

// --- EXPRESS WEB SERVER SETUP ---
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));[cite: 2]

const PORT = process.env.PORT || 3000;[cite: 2]

// --- GAME CONSTANTS ---
const SYMBOLS = ['🍒', '🍋', '🍊', '🍇', '🔔', '💎', '7️⃣'];[cite: 2]
const PAYTABLE = {[cite: 2]
  '🍒': { 3: 2, 4: 5, 5: 10 }, '🍋': { 3: 2, 4: 5, 5: 10 },
  '🍊': { 3: 3, 4: 8, 5: 15 }, '🍇': { 3: 4, 4: 10, 5: 20 },
  '🔔': { 3: 5, 4: 15, 5: 30 }, '💎': { 3: 10, 4: 25, 5: 50 },
  '7️⃣': { 3: 25, 4: 75, 5: 100 }
};
const PAYLINES = [[0,0,0,0,0], [1,1,1,1,1], [2,2,2,2,2], [0,1,2,1,0], [2,1,0,1,2]];[cite: 2]
const PLINKO_MULTIPLIERS = [10, 4, 2, 1.2, 0.2, 0.2, 1.2, 2, 4, 10];[cite: 2]

// --- WEB API ENDPOINTS (Matched to public/app.js) ---
app.get('/api/user/balance/:discordId', async (req, res) => {[cite: 2]
  const user = await getUser(req.params.discordId);
  res.json({ balance: user ? user.balance : 1000 });
});

app.post('/api/game/megafruit', async (req, res) => {[cite: 2]
  const { userId, bet } = req.body;
  const dbUser = await getUser(userId);

  if (!dbUser || bet < 10 || dbUser.balance < bet) {
    return res.status(400).json({ error: 'Invalid bet or insufficient balance' });
  }

  await updateBalance(userId, -bet);

  const grid = Array.from({ length: 3 }, () =>
    Array.from({ length: 5 }, () => SYMBOLS[crypto.randomInt(0, SYMBOLS.length)])
  );

  let totalMultiplier = 0;
  const winningPositions = [];

  PAYLINES.forEach((line) => {
    const firstSym = grid[line[0]][0];
    let matchCount = 1;
    for (let c = 1; c < 5; c++) {
      if (grid[line[c]][c] === firstSym) matchCount++;
      else break;
    }
    if (matchCount >= 3) {
      totalMultiplier += PAYTABLE[firstSym]?.[matchCount] || 0;
      for (let c = 0; c < matchCount; c++) {
        winningPositions.push({ r: line[c], c: c });
      }
    }
  });

  const winAmount = Math.floor(bet * totalMultiplier);
  const finalUser = await updateBalance(userId, winAmount);

  res.json({
    grid,
    multiplier: totalMultiplier,
    winAmount,
    newBalance: finalUser.balance,
    winningPositions
  });
});

app.post('/api/game/plinko', async (req, res) => {[cite: 2]
  const { userId, bet } = req.body;
  const dbUser = await getUser(userId);

  if (!dbUser || bet < 10 || dbUser.balance < bet) {
    return res.status(400).json({ error: 'Invalid bet or insufficient balance' });
  }

  await updateBalance(userId, -bet);

  const path = [];
  let slotIndex = 0;
  for (let r = 0; r < 9; r++) {
    const dir = crypto.randomInt(0, 2);
    path.push(dir);
    if (dir === 1) slotIndex++;
  }

  const multiplier = PLINKO_MULTIPLIERS[slotIndex];
  const winAmount = Math.floor(bet * multiplier);
  const finalUser = await updateBalance(userId, winAmount);

  res.json({
    path,
    slotIndex,
    multiplier,
    winAmount,
    newBalance: finalUser.balance
  });
});


// --- DISCORD BOT SETUP & SLASH COMMANDS ---
const client = new Client({ intents: [GatewayIntentBits.Guilds] });[cite: 2]

client.once('ready', async () => {[cite: 2]
  await initDB();
  
  app.listen(PORT, () => {
    console.log(`Web server & API running on port ${PORT}`);
  });
  
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {[cite: 2]
  if (!interaction.isChatInputCommand()) return;

  const { commandName, user } = interaction;
  const dbUser = await getUser(user.id);

  // --- /balance ---
  if (commandName === 'balance') {
    const targetUserOption = interaction.options.getUser('user');

    if (targetUserOption && user.username !== ADMIN_USERNAME) {
      return interaction.reply({ content: '❌ You can only check your own balance.', ephemeral: true });
    }

    const userToCheck = targetUserOption || user;
    const dbTargetUser = await getUser(userToCheck.id);

    const embed = new EmbedBuilder()
      .setTitle('💰 Account Balance')
      .setDescription(`**${userToCheck.username}**'s current balance is **${dbTargetUser.balance}** Credits.`)
      .setColor('#2ed573');
    return interaction.reply({ embeds: [embed] });
  }

  // --- /deposit ---
  if (commandName === 'deposit') {
    if (user.username !== ADMIN_USERNAME) {
      return interaction.reply({ content: '❌ Only **g00dday** can add credits.', ephemeral: true });
    }

    const targetUser = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');

    if (amount <= 0) return interaction.reply({ content: 'Invalid deposit amount.', ephemeral: true });

    const updatedTarget = await updateBalance(targetUser.id, amount);
    const embed = new EmbedBuilder()
      .setTitle('✅ Manual Deposit Complete')
      .setDescription(`Added **${amount}** credits to <@${targetUser.id}>.`)
      .addFields(
        { name: 'Target User', value: `${targetUser.username}`, inline: true },
        { name: 'New Balance', value: `${updatedTarget.balance} Credits`, inline: true }
      )
      .setColor('#2ed573');

    return interaction.reply({ embeds: [embed] });
  }

  // --- /withdraw ---
  if (commandName === 'withdraw') {
    if (user.username !== ADMIN_USERNAME) {
      return interaction.reply({ content: '❌ Only **g00dday** can process withdrawals.', ephemeral: true });
    }

    const targetUser = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');

    if (amount <= 0) return interaction.reply({ content: 'Invalid withdrawal amount.', ephemeral: true });

    const dbTargetUser = await getUser(targetUser.id);
    if (dbTargetUser.balance < amount) {
      return interaction.reply({ content: `❌ User only has ${dbTargetUser.balance} credits. Cannot withdraw ${amount}.`, ephemeral: true });
    }

    const updatedTarget = await updateBalance(targetUser.id, -amount);
    const embed = new EmbedBuilder()
      .setTitle('✅ Manual Withdrawal Processed')
      .setDescription(`Deducted **${amount}** credits from <@${targetUser.id}>.`)
      .addFields(
        { name: 'Target User', value: `${targetUser.username}`, inline: true },
        { name: 'New Balance', value: `${updatedTarget.balance} Credits`, inline: true }
      )
      .setColor('#ff4757');

    return interaction.reply({ embeds: [embed] });
  }

  // --- /slots ---
  if (commandName === 'slots') {
    const bet = interaction.options.getInteger('bet');

    if (bet < 10 || dbUser.balance < bet) {
      return interaction.reply({ content: 'Invalid bet or insufficient balance.', ephemeral: true });
    }

    await updateBalance(user.id, -bet);

    const grid = Array.from({ length: 3 }, () =>
      Array.from({ length: 5 }, () => SYMBOLS[crypto.randomInt(0, SYMBOLS.length)])
    );

    let totalMultiplier = 0;
    PAYLINES.forEach(line => {
      const firstSym = grid[line[0]][0];
      let matchCount = 1;
      for (let c = 1; c < 5; c++) {
        if (grid[line[c]][c] === firstSym) matchCount++;
        else break;
      }
      if (matchCount >= 3) {
        totalMultiplier += PAYTABLE[firstSym]?.[matchCount] || 0;
      }
    });

    const winAmount = Math.floor(bet * totalMultiplier);
    const finalUser = await updateBalance(user.id, winAmount);

    const gridStr = grid.map(row => row.join(' | ')).join('\n');
    const resultTitle = winAmount > 0 ? `🎉 WIN! +${winAmount} Credits!` : '❌ No Win';

    const embed = new EmbedBuilder()
      .setTitle(`🍉 MegaFruit Slots — ${resultTitle}`)
      .setDescription(`\`\`\`\n${gridStr}\n\`\`\``)
      .addFields(
        { name: 'Bet', value: `${bet}`, inline: true },
        { name: 'Multiplier', value: `${totalMultiplier}x`, inline: true },
        { name: 'New Balance', value: `${finalUser.balance}`, inline: true }
      )
      .setColor(winAmount > 0 ? '#2ed573' : '#ff4757');

    return interaction.reply({ embeds: [embed] });
  }

  // --- /plinko ---
  if (commandName === 'plinko') {
    const bet = interaction.options.getInteger('bet');

    if (bet < 10 || dbUser.balance < bet) {
      return interaction.reply({ content: 'Invalid bet or insufficient balance.', ephemeral: true });
    }

    await updateBalance(user.id, -bet);

    let slotIndex = 0;
    for (let r = 0; r < 9; r++) {
      if (crypto.randomInt(0, 2) === 1) slotIndex++;
    }

    const multiplier = PLINKO_MULTIPLIERS[slotIndex];
    const winAmount = Math.floor(bet * multiplier);
    const finalUser = await updateBalance(user.id, winAmount);

    const canvas = createCanvas(400, 250);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0c0d14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#ffffff';
    for (let r = 0; r < 9; r++) {
      const count = r + 3;
      const startX = (400 - (count - 1) * 28) / 2;
      for (let c = 0; c < count; c++) {
        ctx.beginPath();
        ctx.arc(startX + c * 28, 20 + r * 20, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const bucketX = (400 - (10 - 1) * 28) / 2 + slotIndex * 28;
    ctx.fillStyle = '#fffa65';
    ctx.beginPath();
    ctx.arc(bucketX, 210, 8, 0, Math.PI * 2);
    ctx.fill();

    const attachment = new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'plinko.png' });

    const embed = new EmbedBuilder()
      .setTitle(`⚪ Plinko Drop — Landed in ${multiplier}x!`)
      .setImage('attachment://plinko.png')
      .addFields(
        { name: 'Bet', value: `${bet}`, inline: true },
        { name: 'Won', value: `${winAmount} Credits`, inline: true },
        { name: 'New Balance', value: `${finalUser.balance}`, inline: true }
      )
      .setColor(multiplier >= 1 ? '#2ed573' : '#ff4757');

    return interaction.reply({ embeds: [embed], files: [attachment] });
  }
});

client.login(TOKEN);[cite: 2]