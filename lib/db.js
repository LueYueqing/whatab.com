import mysql from 'mysql2/promise';

let pool;

export function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || 'homepage',
      waitForConnections: true,
      connectionLimit: Math.max(5, Math.min(32, Number(process.env.DB_POOL_LIMIT) || 5)),
      charset: 'utf8mb4',
    });
  }
  return pool;
}
