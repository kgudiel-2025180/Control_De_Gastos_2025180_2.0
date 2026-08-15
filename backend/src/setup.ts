import 'dotenv/config';
import { pool } from './db';

async function setup(): Promise<void> {
  console.log('Creando tablas…');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      icon TEXT NOT NULL,
      color TEXT NOT NULL,
      budget_limit NUMERIC(12, 2) NOT NULL DEFAULT 0
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      amount NUMERIC(12, 2) NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('EXPENSE', 'INCOME')),
      category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
      date DATE NOT NULL,
      description TEXT
    )
  `);

  console.log('Base de datos lista.');
}

setup()
  .then(() => pool.end())
  .catch((error) => {
    console.error('Error durante el setup:', error);
    pool.end();
    process.exitCode = 1;
  });