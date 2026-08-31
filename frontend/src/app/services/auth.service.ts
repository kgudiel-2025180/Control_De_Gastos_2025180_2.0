import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

const API_URL = 'http://localhost:3000';
const TOKEN_KEY = 'control_gastos_token';
const USER_KEY = 'control_gastos_user';
const EXPIRES_KEY = 'control_gastos_expires';
const SESSION_DURATION_MS = 300 * 1000; // 5 minutos, sincronizado con backend

export interface LoginResponse {
  token: string;
  expiresIn: number;
  user: { id: string; email: string; name: string };
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  login(username: string, password: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${API_URL}/auth/login`, { username, password })
      .pipe(
        map((res) => {
          this.persistSession(res);
          return res;
        }),
      );
  }

  logout(): void {
    this.clearSession();
  }

  persistSession(res: LoginResponse): void {
    const expiresAt = Date.now() + SESSION_DURATION_MS;
    localStorage.setItem(TOKEN_KEY, res.token);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    localStorage.setItem(EXPIRES_KEY, String(expiresAt));
  }

  clearSession(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(EXPIRES_KEY);
  }

  get token(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  get user(): AuthUser | null {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  }

  get expiresAt(): number {
    const raw = localStorage.getItem(EXPIRES_KEY);
    return raw ? Number(raw) : 0;
  }

  get remainingMs(): number {
    return Math.max(0, this.expiresAt - Date.now());
  }

  isLoggedIn(): boolean {
    return Boolean(this.token && this.expiresAt > Date.now());
  }
}