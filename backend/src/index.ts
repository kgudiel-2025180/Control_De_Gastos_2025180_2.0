import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { authRouter } from './routes/auth';
import { categoriesRouter } from './routes/categories';
import { transactionsRouter } from './routes/transactions';

const app = express();
const PORT = Number(process.env.PORT ?? 3000);

app.use(cors({ origin: 'http://localhost:4200' }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', db: 'control_gastos' });
});

app.use('/auth', authRouter);
app.use('/categories', categoriesRouter);
app.use('/transactions', transactionsRouter);

app.listen(PORT, () => {
  console.log(`API lista en http://localhost:${PORT}`);
});