import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db';

export const authRouter = Router();

interface LoginBody {
  username?: string;
  email?: string;
  password?: string;
}

interface RegisterBody {
  email?: string;
  password?: string;
  name?: string;
}

interface UserRow {
  id: string;
  email: string;
  password: string;
  name: string;
  role: string;
}

const TOKEN_TTL_SECONDS = 1500; // 25 minutos

authRouter.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body as RegisterBody;
    if (!email || !password || !name) {
      res.status(400).json({ message: 'Correo, contraseña y nombre son obligatorios' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres' });
      return;
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [
      email.trim().toLowerCase(),
    ]);
    if (existing.rows[0]) {
      res.status(409).json({ message: 'Ya existe una cuenta con ese correo' });
      return;
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query<UserRow>(
      `INSERT INTO users (email, password, name, role) VALUES ($1, $2, $3, 'USER') RETURNING id, email, name, role`,
      [email.trim().toLowerCase(), hash, name.trim()],
    );
    const row = result.rows[0];
    if (!row) {
      res.status(500).json({ message: 'Error del servidor' });
      return;
    }

    const token = jwt.sign(
      { userId: row.id, role: row.role },
      process.env.JWT_SECRET ?? 'control-gastos-secret-dev',
      { expiresIn: TOKEN_TTL_SECONDS },
    );

    res.status(201).json({
      token,
      expiresIn: TOKEN_TTL_SECONDS,
      user: { id: row.id, email: row.email, name: row.name, role: row.role },
    });
  } catch (error) {
    console.error('Error en /auth/register:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
});

authRouter.post('/login', async (req, res) => {
  try {
    const { username, email, password } = req.body as LoginBody;
    const identifier = (username ?? email ?? '').trim().toLowerCase();
    if (!identifier || !password) {
      res.status(400).json({ message: 'Usuario y contraseña son obligatorios' });
      return;
    }

    const result = await pool.query<UserRow>(
      'SELECT id, email, password, name, role FROM users WHERE email = $1 OR name = $1',
      [identifier],
    );
    const row = result.rows[0];
    if (!row) {
      res.status(401).json({ message: 'Correo o contraseña incorrectos' });
      return;
    }

    const valid = await bcrypt.compare(password, row.password);
    if (!valid) {
      res.status(401).json({ message: 'Correo o contraseña incorrectos' });
      return;
    }

    const token = jwt.sign(
      { userId: row.id, role: row.role },
      process.env.JWT_SECRET ?? 'control-gastos-secret-dev',
      { expiresIn: TOKEN_TTL_SECONDS },
    );

    res.json({
      token,
      expiresIn: TOKEN_TTL_SECONDS,
      user: { id: row.id, email: row.email, name: row.name, role: row.role },
    });
  } catch (error) {
    console.error('Error en /auth/login:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
});