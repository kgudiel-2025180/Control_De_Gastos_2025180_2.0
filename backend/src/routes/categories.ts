import { Router } from 'express';
import { pool } from '../db';
import { authRequired, AuthRequest } from '../middleware/auth';

export const categoriesRouter = Router();

categoriesRouter.use(authRequired);

interface CategoryRow {
  id: string;
  name: string;
  icon: string;
  color: string;
  budget_limit: string | number;
}

function mapCategory(row: CategoryRow) {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    color: row.color,
    budgetLimit: Number(row.budget_limit),
  };
}

interface CategoryBody {
  name?: string;
  icon?: string;
  color?: string;
  budgetLimit?: number;
}

function validateBody(body: CategoryBody): Omit<CategoryRow, 'id'> | string {
  const name = body.name?.trim();
  const icon = body.icon?.trim();
  const color = body.color?.trim();
  const budgetLimit = body.budgetLimit;

  if (!name) {
    return 'El nombre es obligatorio';
  }
  if (!icon) {
    return 'El ícono es obligatorio';
  }
  if (!color) {
    return 'El color es obligatorio';
  }
  if (typeof budgetLimit !== 'number' || budgetLimit < 0) {
    return 'El límite de presupuesto debe ser un número mayor o igual a 0';
  }

  return { name, icon, color, budget_limit: budgetLimit };
}

categoriesRouter.get('/', async (req: AuthRequest, res) => {
  try {
    const result = await pool.query<CategoryRow>(
      'SELECT id, name, icon, color, budget_limit FROM categories WHERE user_id = $1 ORDER BY name',
      [req.userId],
    );
    res.json(result.rows.map(mapCategory));
  } catch (error) {
    console.error('Error al listar categorías:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
});

categoriesRouter.post('/', async (req: AuthRequest, res) => {
  try {
    const body = validateBody(req.body as CategoryBody);
    if (typeof body === 'string') {
      res.status(400).json({ message: body });
      return;
    }

    const result = await pool.query<CategoryRow>(
      `INSERT INTO categories (user_id, name, icon, color, budget_limit)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, icon, color, budget_limit`,
      [req.userId, body.name, body.icon, body.color, body.budget_limit],
    );
    const created = result.rows[0];
    if (!created) {
      res.status(500).json({ message: 'No se pudo crear la categoría' });
      return;
    }
    res.status(201).json(mapCategory(created));
  } catch (error) {
    console.error('Error al crear categoría:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
});

categoriesRouter.put('/:id', async (req: AuthRequest, res) => {
  try {
    const body = validateBody(req.body as CategoryBody);
    if (typeof body === 'string') {
      res.status(400).json({ message: body });
      return;
    }

    const result = await pool.query<CategoryRow>(
      `UPDATE categories
       SET name = $3, icon = $4, color = $5, budget_limit = $6
       WHERE id = $1 AND user_id = $2
       RETURNING id, name, icon, color, budget_limit`,
      [req.params.id, req.userId, body.name, body.icon, body.color, body.budget_limit],
    );
    const updated = result.rows[0];
    if (!updated) {
      res.status(404).json({ message: 'Categoría no encontrada' });
      return;
    }
    res.json(mapCategory(updated));
  } catch (error) {
    console.error('Error al actualizar categoría:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
});

categoriesRouter.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM categories WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId],
    );
    if (result.rowCount === 0) {
      res.status(404).json({ message: 'Categoría no encontrada' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    console.error('Error al eliminar categoría:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
});