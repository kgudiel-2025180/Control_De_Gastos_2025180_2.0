import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

const API_URL = 'http://localhost:3000';

export interface Transaction {
  id: string;
  amount: number;
  type: 'INCOME' | 'EXPENSE';
  category: string | null;
  date: string; // YYYY-MM-DD
  description?: string;
  user?: { id: string; name: string; email: string };
  categoryName?: string;
  categoryColor?: string;
  categoryIcon?: string;
}

export type CreateTransactionPayload = Omit<Transaction, 'id'>;

@Injectable({ providedIn: 'root' })
export class TransactionsService {
  private readonly http = inject(HttpClient);

  getAll(type?: 'INCOME' | 'EXPENSE'): Observable<Transaction[]> {
    let params = new HttpParams();
    // backend does not filter by type yet, filter client side if needed
    return this.http.get<Transaction[]>(`${API_URL}/transactions`, { params });
  }

  create(payload: CreateTransactionPayload): Observable<Transaction> {
    return this.http.post<Transaction>(`${API_URL}/transactions`, payload);
  }

  update(id: string, payload: CreateTransactionPayload): Observable<Transaction> {
    return this.http.put<Transaction>(`${API_URL}/transactions/${id}`, payload);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${API_URL}/transactions/${id}`);
  }
}
