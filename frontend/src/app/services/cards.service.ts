import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

const API_URL = 'http://localhost:3000';

export interface Card {
  id: string;
  number: string;
  holder: string;
  expiry: string;
  cvv: string;
  status: 'ACTIVE' | 'FROZEN';
  createdAt?: string;
}

@Injectable({ providedIn: 'root' })
export class CardsService {
  private readonly http = inject(HttpClient);

  /** Devuelve la tarjeta del usuario (se genera automáticamente si no existe) */
  getMyCard(): Observable<Card> {
    return this.http.get<Card>(`${API_URL}/cards`);
  }

  /** Congela (FROZEN) o activa (ACTIVE) la tarjeta */
  setStatus(cardId: string, status: 'ACTIVE' | 'FROZEN'): Observable<Card> {
    return this.http.patch<Card>(`${API_URL}/cards/${cardId}/status`, { status });
  }
}
