import { Router } from 'express';
import { pool } from '../db';
import { authRequired, AuthRequest } from '../middleware/auth';

export const cardsRouter = Router();

cardsRouter.use(authRequired);

interface CardRow {
  id: string;
  user_id: string;
  number: string;
  holder: string;
  expiry: string;
  cvv: string;
  status: string;
  created_at: string;
}

interface UserRow {
  name: string;
}

function randomDigits(n: number): string {
  let out = '';
  for (let i = 0; i < n; i++) {
    out += Math.floor(Math.random() * 10).toString();
  }
  return out;
}

function mapCard(row: CardRow) {
  return {
    id: row.id,
    number: row.number,
    holder: row.holder,
    expiry: row.expiry,
    cvv: row.cvv,
    status: row.status,
    createdAt: row.created_at,
  };
}

/** Devuelve la tarjeta del usuario; si no tiene, genera una automáticamente */
cardsRouter.get('/', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId as string;

    const existing = await pool.query<CardRow>(
      'SELECT * FROM cards WHERE user_id = $1',
      [userId],
    );
    if (existing.rows[0]) {
      res.json(mapCard(existing.rows[0]));
      return;
    }

    // Auto-genera la tarjeta virtual del usuario
    const userRes = await pool.query<UserRow>('SELECT name FROM users WHERE id = $1', [
      userId,
    ]);
    const holder = (userRes.rows[0]?.name ?? 'CLIENTE').trim().toUpperCase();
    const number = `4518 ${randomDigits(4)} ${randomDigits(4)} ${randomDigits(4)}`;
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const yearShort = String((now.getFullYear() + 5) % 100).padStart(2, '0');
    const expiry = `${month}/${yearShort}`;
    const cvv = randomDigits(3);

    const created = await pool.query<CardRow>(
      `INSERT INTO cards (user_id, number, holder, expiry, cvv)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET holder = EXCLUDED.holder
       RETURNING *`,
      [userId, number, holder, expiry, cvv],
    );
    const row = created.rows[0];
    if (!row) {
      res.status(500).json({ message: 'Error del servidor' });
      return;
    }
    res.status(201).json(mapCard(row));
  } catch (error) {
    console.error('Error en GET /cards:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
});

/** Congela o descongela la tarjeta propia */
cardsRouter.patch('/:id/status', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId as string;
    const { status } = req.body as { status?: string };
    if (status !== 'ACTIVE' && status !== 'FROZEN') {
      res.status(400).json({ message: 'Estado inválido (ACTIVE o FROZEN)' });
      return;
    }

    const updated = await pool.query<CardRow>(
      'UPDATE cards SET status = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
      [status, req.params.id, userId],
    );
    const row = updated.rows[0];
    if (!row) {
      res.status(404).json({ message: 'Tarjeta no encontrada' });
      return;
    }
    res.json(mapCard(row));
  } catch (error) {
    console.error('Error en PATCH /cards/:id/status:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
});
