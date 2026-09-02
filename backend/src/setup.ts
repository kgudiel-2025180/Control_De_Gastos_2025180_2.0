import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool } from './db';

async function setup(): Promise<void> {
  console.log('Creando tablas…');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'USER' CHECK (role IN ('ADMIN','USER'))
    )
  `);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'USER' CHECK (role IN ('ADMIN','USER'))`);

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

  const demoPassword = await bcrypt.hash('demo1234', 10);
  await pool.query(
    `INSERT INTO users (email, password, name, role)
     VALUES ('demo@guate.tech', $1, 'Usuario Demo', 'USER')
     ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role`,
    [demoPassword],
  );

  const adminPassword = await bcrypt.hash('admin12345', 10);
  await pool.query(
    `INSERT INTO users (email, password, name, role)
     VALUES ('admin@guate.tech', $1, 'admin', 'ADMIN')
     ON CONFLICT (email) DO UPDATE SET role = 'ADMIN'`,
    [adminPassword],
  );

  const userPassword = await bcrypt.hash('user1234', 10);
  await pool.query(
    `INSERT INTO users (email, password, name, role)
     VALUES ('user@guate.tech', $1, 'usuario', 'USER')
     ON CONFLICT (email) DO UPDATE SET role = 'USER'`,
    [userPassword],
  );

  console.log('Base de datos lista.');
}

setup()
  .then(() => pool.end())
  .catch((error) => {
    console.error('Error durante el setup:', error);
    pool.end();
    process.exitCode = 1;
  });