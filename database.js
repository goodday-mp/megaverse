// database.js
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

let db;

export async function initDB() {
  db = await open({
    filename: './casino.db',
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      discord_id TEXT PRIMARY KEY,
      balance INTEGER DEFAULT 1000,
      deposit_address TEXT
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_id TEXT,
      type TEXT,
      amount INTEGER,
      status TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  return db;
}

export async function getUser(discordId) {
  let user = await db.get('SELECT * FROM users WHERE discord_id = ?', [discordId]);
  if (!user) {
    await db.run('INSERT INTO users (discord_id, balance) VALUES (?, 1000)', [discordId]);
    user = { discord_id: discordId, balance: 1000 };
  }
  return user;
}

export async function updateBalance(discordId, amountChange) {
  await db.run(
    'UPDATE users SET balance = balance + ? WHERE discord_id = ?',
    [amountChange, discordId]
  );
  return getUser(discordId);
}

export function getDB() {
  return db;
}