import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { CategoriesService, Category } from '../../services/categories.service';
import { TransactionsService, Transaction } from '../../services/transactions.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly transactionsService = inject(TransactionsService);
  private readonly categoriesService = inject(CategoriesService);

  readonly name = signal<string>('');
  readonly email = signal<string>('');
  readonly sessionExpired = signal(false);

  private timer: ReturnType<typeof setInterval> | null = null;

  // Real data
  readonly transactions = signal<Transaction[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly search = signal<string>('');

  readonly ingresosTotales = computed(() =>
    this.transactions()
      .filter((t) => t.type === 'INCOME')
      .reduce((acc, t) => acc + t.amount, 0),
  );
  readonly gastosTotales = computed(() =>
    this.transactions()
      .filter((t) => t.type === 'EXPENSE')
      .reduce((acc, t) => acc + t.amount, 0),
  );
  readonly total = computed(() => this.ingresosTotales() - this.gastosTotales());
  readonly ahorro = computed(() => this.total());

  readonly filtered = computed(() => {
    const term = this.search().toLowerCase().trim();
    if (!term) return this.transactions().slice(0, 20);
    return this.transactions().filter(
      (t) =>
        (t.description ?? '').toLowerCase().includes(term) ||
        this.getCategoryName(t.category).toLowerCase().includes(term) ||
        t.date.includes(term),
    );
  });

  readonly chartData = computed(() => {
    const months: { label: string; ingresos: number; gastos: number }[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleString('es-ES', { month: 'short' });
      const m = d.getMonth();
      const y = d.getFullYear();
      const ingresos = this.transactions()
        .filter((t) => t.type === 'INCOME')
        .filter((t) => {
          const td = new Date(t.date);
          return td.getMonth() === m && td.getFullYear() === y;
        })
        .reduce((acc, t) => acc + t.amount, 0);
      const gastos = this.transactions()
        .filter((t) => t.type === 'EXPENSE')
        .filter((t) => {
          const td = new Date(t.date);
          return td.getMonth() === m && td.getFullYear() === y;
        })
        .reduce((acc, t) => acc + t.amount, 0);
      months.push({ label: label.charAt(0).toUpperCase() + label.slice(1, 3), ingresos, gastos });
    }
    return months;
  });

  readonly chartMax = computed(() => {
    const max = Math.max(...this.chartData().flatMap((m) => [m.ingresos, m.gastos]), 1000);
    return Math.ceil(max / 1000) * 1000 || 1000;
  });

  ngOnInit(): void {
    const user = this.auth.user;
    if (user) {
      this.name.set(user.name);
      this.email.set(user.email);
    }
    this.timer = setInterval(() => this.checkSession(), 1000);
    this.loadData();
  }

  ngOnDestroy(): void {
    this.stopTimer();
  }

  private checkSession(): void {
    if (this.auth.remainingMs <= 0) {
      this.stopTimer();
      this.auth.clearSession();
      this.sessionExpired.set(true);
    }
  }

  private stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  loadData(): void {
    this.transactionsService.getAll().subscribe({
      next: (rows) => this.transactions.set(rows),
      error: () => {},
    });
    this.categoriesService.getAll().subscribe({
      next: (cats) => this.categories.set(cats),
      error: () => {},
    });
  }

  isAdmin(): boolean {
    return this.auth.isAdmin();
  }

  getCategoryName(id: string | null): string {
    if (!id) return '';
    return this.categories().find((c) => c.id === id)?.name ?? '';
  }

  chartIngresosPath(): string {
    const data = this.chartData();
    const max = this.chartMax();
    const left = 50;
    const right = 610;
    const step = (right - left) / Math.max(data.length - 1, 1);
    const points = data.map((d, i) => ({
      x: left + i * step,
      y: 105 - (d.ingresos / max) * 80,
    }));
    if (points.length < 2) return '';
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cx = (prev.x + curr.x) / 2;
      d += ` Q ${cx} ${prev.y} ${curr.x} ${curr.y}`;
    }
    return d;
  }

  chartGastosPath(): string {
    const data = this.chartData();
    const max = this.chartMax();
    const left = 50;
    const right = 610;
    const step = (right - left) / Math.max(data.length - 1, 1);
    const points = data.map((d, i) => ({
      x: left + i * step,
      y: 105 + (d.gastos / max) * 80,
    }));
    if (points.length < 2) return '';
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cx = (prev.x + curr.x) / 2;
      d += ` Q ${cx} ${prev.y} ${curr.x} ${curr.y}`;
    }
    return d;
  }

  logout(): void {
    this.stopTimer();
    this.auth.clearSession();
    this.router.navigate(['/login']);
  }

  backToLogin(): void {
    this.auth.clearSession();
    this.router.navigate(['/login']);
  }
}
