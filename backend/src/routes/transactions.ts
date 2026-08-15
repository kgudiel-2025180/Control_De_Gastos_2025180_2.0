import { Router } from 'express';
import { pool } from '../db';
import { authRequired, AuthRequest } from '../middleware/auth';

export const transactionsRouter = Router();

transactionsRouter.use(authRequired);

interface TransactionRow {
  id: string;
  amount: string | number;
  type: string;
  category_id: string | null;
  date: string;
  description: string | null;
}

function mapTransaction(row: TransactionRow) {
  return {
    id: row.id,
    amount: Number(row.amount),
    type: row.type,
    category: row.category_id,
    date: row.date,
    ...(row.description ? { description: row.description } : {}),
  };
}

interface TransactionBody {
  amount?: number;
  type?: string;
  category?: string;
  date?: string;
  description?: string;
}

function validateBody(
  body: TransactionBody,
): { amount: number; type: 'EXPENSE' | 'INCOME'; category: string | null; date: string; description: string | null } | string {
  const amount = body.amount;

  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return 'El monto debe ser un número mayor a 0';
  }
  if (body.type !== 'EXPENSE' && body.type !== 'INCOME') {
    return 'El tipo debe ser EXPENSE o INCOME';
  }
  if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    return 'La fecha no es válida';
  }

  return {
    amount,
    type: body.type as 'EXPENSE' | 'INCOME',
    category: body.category?.trim() ? body.category.trim() : null,
    date: body.date,
    description: body.description?.trim() ? body.description.trim() : null,
  };
}

transactionsRouter.get('/', async (req: AuthRequest, res) => {
  try {
    const result = await pool.query<TransactionRow>(
      `SELECT id, amount, type, category_id, TO_CHAR(date, 'YYYY-MM-DD') AS date, description
       FROM transactions
       WHERE user_id = $1
       ORDER BY date DESC`,
      [req.userId],
    );
    res.json(result.rows.map(mapTransaction));
  } catch (error) {
    console.error('Error al listar transacciones:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
});

transactionsRouter.post('/', async (req: AuthRequest, res) => {
  try {
    const body = validateBody(req.body as TransactionBody);
    if (typeof body === 'string') {
      res.status(400).json({ message: body });
      return;
    }

    const result = await pool.query<TransactionRow>(
      `INSERT INTO transactions (user_id, amount, type, category_id, date, description)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, amount, type, category_id, TO_CHAR(date, 'YYYY-MM-DD') AS date, description`,
      [req.userId, body.amount, body.type, body.category, body.date, body.description],
    );
    const created = result.rows[0];
    if (!created) {
      res.status(500).json({ message: 'No se pudo crear la transacción' });
      return;
    }
    res.status(201).json(mapTransaction(created));
  } catch (error) {
    console.error('Error al crear transacción:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
});

transactionsRouter.put('/:id', async (req: AuthRequest, res) => {
  try {
    const body = validateBody(req.body as TransactionBody);
    if (typeof body === 'string') {
      res.status(400).json({ message: body });
      return;
    }

    const result = await pool.query<TransactionRow>(
      `UPDATE transactions
       SET amount = $3, type = $4, category_id = $5, date = $6, description = $7
       WHERE id = $1 AND user_id = $2
       RETURNING id, amount, type, category_id, TO_CHAR(date, 'YYYY-MM-DD') AS date, description`,
      [req.params.id, req.userId, body.amount, body.type, body.category, body.date, body.description],
    );
    const updated = result.rows[0];
    if (!updated) {
      res.status(404).json({ message: 'Transacción no encontrada' });
      return;
    }
    res.json(mapTransaction(updated));
  } catch (error) {
    console.error('Error al actualizar transacción:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
});

transactionsRouter.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM transactions WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId],
    );
    if (result.rowCount === 0) {
      res.status(404).json({ message: 'Transacción no encontrada' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    console.error('Error al eliminar transacción:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
});