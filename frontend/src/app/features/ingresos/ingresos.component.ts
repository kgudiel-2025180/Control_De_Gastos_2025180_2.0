import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { TransactionsService, Transaction } from '../../services/transactions.service';
import { CategoriesService, Category } from '../../services/categories.service';

@Component({
  selector: 'app-ingresos',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './ingresos.component.html',
  styleUrl: './ingresos.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IngresosComponent implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly transactionsService = inject(TransactionsService);
  private readonly categoriesService = inject(CategoriesService);

  readonly name = signal<string>('');
  readonly sessionExpired = signal(false);
  private timer: ReturnType<typeof setInterval> | null = null;

  // Data
  readonly incomes = signal<Transaction[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  // Filters
  readonly search = signal<string>('');

  // Modal state
  readonly showModal = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly showCategoryForm = signal(false);

  // Form fields
  formDescription = '';
  formAmount: number | null = null;
  formDate = new Date().toISOString().slice(0, 10);
  formCategory: string | null = null;

  // Category form fields
  catName = '';
  catIcon = 'work';
  catColor = '#19DCE8';
  catBudget: number | null = 0;

  readonly filteredIncomes = computed(() => {
    const term = this.search().toLowerCase().trim();
    const all = this.incomes().filter((t) => t.type === 'INCOME');
    if (!term) return all;
    return all.filter(
      (t) =>
        (t.description ?? '').toLowerCase().includes(term) ||
        this.getCategoryName(t.category).toLowerCase().includes(term) ||
        t.date.includes(term),
    );
  });

  readonly totalMensual = computed(() => {
    const now = new Date();
    const m = now.getMonth();
    const y = now.getFullYear();
    return this.incomes()
      .filter((t) => t.type === 'INCOME')
      .filter((t) => {
        const d = new Date(t.date);
        return d.getMonth() === m && d.getFullYear() === y;
      })
      .reduce((acc, t) => acc + t.amount, 0);
  });

  readonly totalPrevio = computed(() => {
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const m = prev.getMonth();
    const y = prev.getFullYear();
    return this.incomes()
      .filter((t) => t.type === 'INCOME')
      .filter((t) => {
        const d = new Date(t.date);
        return d.getMonth() === m && d.getFullYear() === y;
      })
      .reduce((acc, t) => acc + t.amount, 0);
  });

  readonly variacion = computed(() => {
    const prev = this.totalPrevio();
    const curr = this.totalMensual();
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 100);
  });

  readonly fuentesActivas = computed(() => {
    const groups = new Map<string, number>();
    const total = this.incomes()
      .filter((t) => t.type === 'INCOME')
      .reduce((acc, t) => acc + t.amount, 0);
    for (const t of this.incomes().filter((x) => x.type === 'INCOME')) {
      const key = this.getCategoryName(t.category) || 'Sin categoría';
      groups.set(key, (groups.get(key) ?? 0) + t.amount);
    }
    return Array.from(groups.entries())
      .map(([name, sum]) => ({ name, sum, pct: total ? Math.round((sum / total) * 100) : 0 }))
      .sort((a, b) => b.sum - a.sum)
      .slice(0, 5);
  });

  readonly chartData = computed(() => {
    const months: { label: string; total: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleString('es-ES', { month: 'short' });
      const m = d.getMonth();
      const y = d.getFullYear();
      const total = this.incomes()
        .filter((t) => t.type === 'INCOME')
        .filter((t) => {
          const td = new Date(t.date);
          return td.getMonth() === m && td.getFullYear() === y;
        })
        .reduce((acc, t) => acc + t.amount, 0);
      months.push({ label: label.charAt(0).toUpperCase() + label.slice(1), total });
    }
    return months;
  });

  readonly chartMax = computed(() => {
    const max = Math.max(...this.chartData().map((m) => m.total), 1000);
    return Math.ceil(max / 5000) * 5000 || 5000;
  });

  ngOnInit(): void {
    const user = this.auth.user;
    if (user) this.name.set(user.name);
    this.timer = setInterval(() => this.checkSession(), 1000);
    this.loadAll();
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

  logout(): void {
    this.stopTimer();
    this.auth.clearSession();
    this.router.navigate(['/login']);
  }

  backToLogin(): void {
    this.auth.clearSession();
    this.router.navigate(['/login']);
  }

  loadAll(): void {
    this.loading.set(true);
    this.error.set(null);
    this.transactionsService.getAll().subscribe({
      next: (rows) => {
        this.incomes.set(rows);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(e?.error?.message ?? 'Error al cargar ingresos');
        this.loading.set(false);
      },
    });
    this.categoriesService.getAll().subscribe({
      next: (cats) => this.categories.set(cats),
      error: () => {},
    });
  }

  getCategoryName(id: string | null): string {
    if (!id) return '';
    const cat = this.categories().find((c) => c.id === id);
    return cat ? cat.name : '';
  }

  getCategoryColor(id: string | null): string {
    if (!id) return '#19DCE8';
    const cat = this.categories().find((c) => c.id === id);
    return cat ? cat.color : '#19DCE8';
  }

  openCreate(): void {
    this.editingId.set(null);
    this.formDescription = '';
    this.formAmount = null;
    this.formDate = new Date().toISOString().slice(0, 10);
    this.formCategory = this.categories()[0]?.id ?? null;
    this.showCategoryForm.set(false);
    this.showModal.set(true);
  }

  isAdmin(): boolean {
    return this.auth.isAdmin();
  }

  openEdit(item: Transaction): void {
    if (!this.isAdmin()) {
      this.error.set('Solo un usuario administrador puede realizar esta acción');
      setTimeout(() => this.error.set(null), 3000);
      return;
    }
    this.editingId.set(item.id);
    this.formDescription = item.description ?? '';
    this.formAmount = item.amount;
    this.formDate = item.date;
    this.formCategory = item.category;
    this.showCategoryForm.set(false);
    this.showModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
    this.showCategoryForm.set(false);
  }

  save(): void {
    if (this.editingId() && !this.isAdmin()) {
      this.error.set('Solo un usuario administrador puede realizar esta acción');
      setTimeout(() => this.error.set(null), 3000);
      return;
    }
    if (!this.formAmount || this.formAmount <= 0) {
      this.error.set('El monto debe ser mayor a 0');
      return;
    }
    if (!this.formDate) {
      this.error.set('La fecha es obligatoria');
      return;
    }
    const payload = {
      amount: Number(this.formAmount),
      type: 'INCOME' as const,
      category: this.formCategory,
      date: this.formDate,
      description: this.formDescription.trim() || undefined,
    };
    const id = this.editingId();
    const obs = id
      ? this.transactionsService.update(id, payload)
      : this.transactionsService.create(payload);
    obs.subscribe({
      next: () => {
        this.closeModal();
        this.loadAll();
      },
      error: (e) => this.error.set(e?.error?.message ?? 'Error al guardar'),
    });
  }

  delete(id: string): void {
    if (!this.isAdmin()) {
      this.error.set('Solo un usuario administrador puede realizar esta acción');
      setTimeout(() => this.error.set(null), 3000);
      return;
    }
    this.transactionsService.delete(id).subscribe({
      next: () => this.loadAll(),
      error: (e) => this.error.set(e?.error?.message ?? 'Error al eliminar'),
    });
  }

  createCategory(): void {
    if (!this.catName.trim()) {
      this.error.set('El nombre de la categoría es obligatorio');
      return;
    }
    this.categoriesService
      .create({
        name: this.catName.trim(),
        icon: this.catIcon.trim() || 'work',
        color: this.catColor.trim() || '#19DCE8',
        budgetLimit: Number(this.catBudget) || 0,
      })
      .subscribe({
        next: (cat) => {
          this.categories.update((prev) => [...prev, cat]);
          this.formCategory = cat.id;
          this.catName = '';
          this.showCategoryForm.set(false);
        },
        error: (e) => this.error.set(e?.error?.message ?? 'Error al crear categoría'),
      });
  }

  // SVG helpers for chart
  chartPath(): string {
    const data = this.chartData();
    const max = this.chartMax();
    const w = 800;
    const h = 200;
    const left = 50;
    const right = 780;
    const step = (right - left) / Math.max(data.length - 1, 1);
    const points = data.map((d, i) => {
      const x = left + i * step;
      const y = 200 - (d.total / max) * 180;
      return { x, y };
    });
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

  chartPoints(): { x: number; y: number }[] {
    const data = this.chartData();
    const max = this.chartMax();
    const left = 50;
    const right = 780;
    const step = (right - left) / Math.max(data.length - 1, 1);
    return data.map((d, i) => ({
      x: left + i * step,
      y: 200 - (d.total / max) * 180,
    }));
  }
}
