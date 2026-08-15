import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db';

export const authRouter = Router();

interface LoginBody {
  email?: string;
  password?: string;
}

interface UserRow {
  id: string;
  email: string;
  password: string;
  name: string;
}

authRouter.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body as LoginBody;
    if (!email || !password) {
      res.status(400).json({ message: 'Correo y contraseña son obligatorios' });
      return;
    }

    const result = await pool.query<UserRow>(
      'SELECT id, email, password, name FROM users WHERE email = $1',
      [email.trim().toLowerCase()],
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
      { userId: row.id },
      process.env.JWT_SECRET ?? 'control-gastos-secret-dev',
      { expiresIn: '8h' },
    );

    res.json({
      token,
      user: { id: row.id, email: row.email, name: row.name },
    });
  } catch (error) {
    console.error('Error en /auth/login:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
});