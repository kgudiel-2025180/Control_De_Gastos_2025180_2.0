import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

const API_URL = 'http://localhost:3000';

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  budgetLimit: number;
}

export type CreateCategoryPayload = Omit<Category, 'id'>;

@Injectable({ providedIn: 'root' })
export class CategoriesService {
  private readonly http = inject(HttpClient);

  getAll(): Observable<Category[]> {
    return this.http.get<Category[]>(`${API_URL}/categories`);
  }

  create(payload: CreateCategoryPayload): Observable<Category> {
    return this.http.post<Category>(`${API_URL}/categories`, payload);
  }

  update(id: string, payload: CreateCategoryPayload): Observable<Category> {
    return this.http.put<Category>(`${API_URL}/categories/${id}`, payload);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${API_URL}/categories/${id}`);
  }
}
