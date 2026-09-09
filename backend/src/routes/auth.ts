import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
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

interface GoogleTokenInfo {
  aud?: string;
  email?: string;
  email_verified?: string | boolean;
  name?: string;
  given_name?: string;
  exp?: string | number;
}

authRouter.post('/google', async (req, res) => {
  try {
    const { credential } = req.body as { credential?: string };
    if (!credential) {
      res.status(400).json({ message: 'La credencial de Google es obligatoria' });
      return;
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      res.status(500).json({ message: 'El inicio de sesión con Google no está configurado en el servidor' });
      return;
    }

    // Verifica el ID token directamente con Google
    const response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`,
    );
    if (!response.ok) {
      res.status(401).json({ message: 'La credencial de Google no es válida o expiró' });
      return;
    }
    const info = (await response.json()) as GoogleTokenInfo;

    if (info.aud !== clientId) {
      res.status(401).json({ message: 'La credencial de Google no pertenece a esta aplicación' });
      return;
    }
    if (info.exp && Number(info.exp) * 1000 < Date.now()) {
      res.status(401).json({ message: 'La credencial de Google expiró' });
      return;
    }
    const emailVerified = info.email_verified === true || info.email_verified === 'true';
    if (!info.email || !emailVerified) {
      res.status(401).json({ message: 'El correo de Google no está verificado' });
      return;
    }

    const email = info.email.trim().toLowerCase();
    const existing = await pool.query<UserRow>(
      'SELECT id, email, password, name, role FROM users WHERE email = $1',
      [email],
    );
    let row = existing.rows[0];

    // Si no existe, se registra automáticamente con rol USER y contraseña aleatoria
    if (!row) {
      const randomPassword = randomBytes(32).toString('hex');
      const hash = await bcrypt.hash(randomPassword, 10);
      const name = (info.name ?? info.given_name ?? '').trim() || email.split('@')[0];
      const created = await pool.query<UserRow>(
        `INSERT INTO users (email, password, name, role) VALUES ($1, $2, $3, 'USER') RETURNING id, email, name, role`,
        [email, hash, name],
      );
      const newRow = created.rows[0];
      if (!newRow) {
        res.status(500).json({ message: 'Error del servidor' });
        return;
      }
      row = { ...newRow, password: hash };
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
    console.error('Error en /auth/google:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
});