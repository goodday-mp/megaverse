import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

let db;
let balanceAdjustmentQueue = Promise.resolve();
const STARTING_BALANCE = 1000;

export async function initDB() {
  db = await open({ filename: './casino.db', driver: sqlite3.Database });
  await db.exec('PRAGMA busy_timeout = 5000;');
  await db.exec(`CREATE TABLE IF NOT EXISTS users (
    discord_id TEXT PRIMARY KEY,
    username TEXT,
    avatar TEXT,
    balance INTEGER NOT NULL DEFAULT 1000,
    deposit_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );`);
  await db.exec(`CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id TEXT NOT NULL,
    type TEXT NOT NULL,
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    reason TEXT NOT NULL,
    reference_id TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );`);
  for (const statement of [
    "ALTER TABLE users ADD COLUMN username TEXT",
    "ALTER TABLE users ADD COLUMN avatar TEXT",
    "ALTER TABLE users ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP",
    "ALTER TABLE transactions ADD COLUMN balance_after INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE transactions ADD COLUMN reason TEXT NOT NULL DEFAULT 'legacy transaction'",
    "ALTER TABLE transactions ADD COLUMN reference_id TEXT",
  ]) {
    try { await db.run(statement); } catch (error) {
      if (!String(error?.message || error).includes('duplicate column name')) throw error;
    }
  }
  await db.run('CREATE UNIQUE INDEX IF NOT EXISTS transactions_reference_id_idx ON transactions(reference_id) WHERE reference_id IS NOT NULL');
  return db;
}

function requireDB() {
  if (!db) throw new Error('Database is not initialized');
  return db;
}

export async function getUser(discordId, profile = {}) {
  const database = requireDB();
  let user = await database.get('SELECT * FROM users WHERE discord_id = ?', [discordId]);
  if (!user) {
    await database.run(
      'INSERT INTO users (discord_id, username, avatar, balance) VALUES (?, ?, ?, ?)',
      [discordId, profile.username || null, profile.avatar || null, STARTING_BALANCE],
    );
    user = await database.get('SELECT * FROM users WHERE discord_id = ?', [discordId]);
  } else if (profile.username || profile.avatar) {
    await database.run(
      'UPDATE users SET username = COALESCE(?, username), avatar = COALESCE(?, avatar) WHERE discord_id = ?',
      [profile.username || null, profile.avatar || null, discordId],
    );
    user = await database.get('SELECT * FROM users WHERE discord_id = ?', [discordId]);
  }
  return user;
}

async function adjustBalanceLocked(discordId, amountChange, options = {}) {
  const database = requireDB();
  if (!Number.isInteger(amountChange) || amountChange === 0) {
    throw new Error('Balance adjustments must be non-zero whole credits');
  }

  await database.run('BEGIN IMMEDIATE');
  try {
    if (options.referenceId) {
      const duplicate = await database.get(
        'SELECT * FROM transactions WHERE reference_id = ?',
        [options.referenceId],
      );
      if (duplicate) {
        await database.run('COMMIT');
        return getUser(discordId);
      }
    }

    await getUser(discordId, options.profile);
    const updated = await database.run(
      'UPDATE users SET balance = balance + ? WHERE discord_id = ? AND balance + ? >= 0',
      [amountChange, discordId, amountChange],
    );
    if (updated.changes !== 1) throw new Error('Insufficient balance');

    const user = await getUser(discordId);
    await database.run(
      `INSERT INTO transactions (discord_id, type, amount, balance_after, reason, reference_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        discordId,
        options.type || (amountChange > 0 ? 'deposit' : 'withdrawal'),
        amountChange,
        user.balance,
        options.reason || 'balance adjustment',
        options.referenceId || null,
      ],
    );
    await database.run('COMMIT');
    return user;
  } catch (error) {
    try { await database.run('ROLLBACK'); } catch {}
    throw error;
  }
}

export function adjustBalance(discordId, amountChange, options = {}) {
  const operation = balanceAdjustmentQueue.then(() => adjustBalanceLocked(discordId, amountChange, options));
  balanceAdjustmentQueue = operation.catch(() => {});
  return operation;
}

export async function updateBalance(discordId, amountChange, options = {}) {
  return adjustBalance(discordId, amountChange, options);
}

export async function getRecentTransactions(discordId, limit = 10) {
  return requireDB().all(
    'SELECT id, type, amount, balance_after, reason, created_at FROM transactions WHERE discord_id = ? ORDER BY id DESC LIMIT ?',
    [discordId, limit],
  );
}

export async function getLeaderboard(period = 'all', sort = 'won', limit = 50) {
  const database = requireDB();
  const periodModifiers = { daily: '-1 day', weekly: '-7 days', monthly: '-1 month', all: null };
  if (!Object.prototype.hasOwnProperty.call(periodModifiers, period)) throw new Error('Invalid leaderboard period');
  if (!['won', 'wagered'].includes(sort)) throw new Error('Invalid leaderboard sort');

  const modifier = periodModifiers[period];
  const activityWindow = modifier ? "AND t.created_at >= datetime('now', ?)" : '';
  const orderColumn = sort === 'wagered' ? 'wagered' : 'won';
  const secondaryColumn = sort === 'wagered' ? 'won' : 'wagered';
  const params = modifier ? [modifier, limit] : [limit];
  const rows = await database.all(
    `SELECT COALESCE(u.username, 'Discord player') AS display_name,
            u.avatar AS avatar,
            COALESCE(SUM(CASE WHEN t.type = 'bet' THEN ABS(t.amount) ELSE 0 END), 0) AS wagered,
            COALESCE(SUM(CASE WHEN t.type = 'win' THEN t.amount ELSE 0 END), 0) AS won
       FROM users u
       LEFT JOIN transactions t ON t.discord_id = u.discord_id ${activityWindow}
      GROUP BY u.discord_id, u.username, u.avatar
      ORDER BY ${orderColumn} DESC, ${secondaryColumn} DESC, display_name COLLATE NOCASE ASC
      LIMIT ?`,
    params,
  );

  return rows.map((row, index) => ({
    rank: index + 1,
    displayName: row.display_name,
    avatar: row.avatar || null,
    wagered: Number(row.wagered) || 0,
    won: Number(row.won) || 0,
  }));
}

export function getDB() { return db; }
