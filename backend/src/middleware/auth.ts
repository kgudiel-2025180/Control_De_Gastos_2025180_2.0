import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
}

export function authRequired(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ message: 'No autorizado' });
    return;
  }

  const token = header.slice('Bearer '.length);
  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET ?? 'control-gastos-secret-dev',
    ) as { userId?: string; role?: string };
    if (!payload.userId) {
      res.status(401).json({ message: 'No autorizado' });
      return;
    }
    req.userId = payload.userId;
    req.userRole = payload.role ?? 'USER';
    next();
  } catch {
    res.status(401).json({ message: 'Sesión no válida' });
  }
}