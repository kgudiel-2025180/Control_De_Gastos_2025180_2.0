import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { CategoriesService, Category } from '../../services/categories.service';
import { TransactionsService, Transaction } from '../../services/transactions.service';

type RangeKey = 'SEM' | 'MES' | 'AÑO';

interface ChartPoint {
  x: number;
  y: number;
  value: number;
}

interface CategorySplitItem {
  name: string;
  amount: number;
  pct: number;
  color: string;
  icon: string;
}

/** Redondea a un "nice number" para que la escala de la gráfica reaccione mejor a los cambios */
function niceCeil(v: number): number {
  const steps = [100, 250, 500, 1000, 1500, 2000, 3000, 4000, 5000, 7500, 10000, 15000, 20000, 30000, 50000, 75000, 100000];
  for (const s of steps) {
    if (v <= s) return s;
  }
  return Math.ceil(v / 100000) * 100000;
}

@Component({
  selector: 'app-transacciones',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './transacciones.component.html',
  styleUrl: './transacciones.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransaccionesComponent implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly transactionsService = inject(TransactionsService);
  private readonly categoriesService = inject(CategoriesService);

  readonly name = signal<string>('');
  readonly sessionExpired = signal(false);
  readonly transactions = signal<Transaction[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly search = signal<string>('');
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly range = signal<RangeKey>('MES');

  readonly showModal = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly showCategoryForm = signal(false);

  formDescription = '';
  formAmount: number | null = null;
  formDate = new Date().toISOString().slice(0, 10);
  formCategory: string | null = null;

  catName = '';
  catIcon = 'work';
  catColor = '#19DCE8';
  catBudget: number | null = 0;

  private timer: ReturnType<typeof setInterval> | null = null;

  private readonly ICON_MAP: Record<string, string> = {
    work: '💼', salario: '💰', cart: '🛒', compras: '🛒', super: '🛒',
    supermercado: '🛒', vivienda: '🏠', casa: '🏠', alquiler: '🏠', rent: '🏠',
    food: '🍽', comida: '🍽', alimentacion: '🍽', transport: '🚗', transporte: '🚗',
    gas: '⛽', gasolina: '⛽', fuel: '⛽', salud: '🏥', hospital: '🏥',
    gym: '💪', educacion: '📚', escuela: '🎓', suscripciones: '📺', streaming: '📺',
    servicios: '🧾', bills: '🧾', entertainment: '🎬', ocio: '🎬', juego: '🎮',
    tech: '💻', internet: '📡', phone: '📱', celular: '📱', pets: '🐾',
    mascotas: '🐾', otros: '📦', imprevistos: '⚠️', default: '💸',
  };

  // ==== Rango y grafica ====
  readonly chartCount = computed(() => {
    if (this.range() === 'AÑO') return 12;
    if (this.range() === 'SEM') return 3;
    return 6;
  });

  readonly rangeLabel = computed(() => {
    if (this.range() === 'AÑO') return '12 Meses';
    if (this.range() === 'SEM') return '3 Meses';
    return '6 Meses';
  });

  readonly chartData = computed(() => {
    const now = new Date();
    const count = this.chartCount();
    const out: { label: string; value: number }[] = [];
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleString('es', { month: 'short' });
      const value = this.transactions()
        .filter((t) => t.type === 'EXPENSE')
        .filter((t) => this.isSameMonth(t.date, d))
        .reduce((acc, t) => acc + t.amount, 0);
      const capitalized = label.charAt(0).toUpperCase() + label.slice(1);
      out.push({ label: capitalized, value });
    }
    return out;
  });

  readonly chartMax = computed(() => {
    const values = this.chartData().map((m) => m.value);
    return niceCeil(Math.max(...values, 100));
  });

  readonly chartPaths = computed(() => {
    const data = this.chartData();
    const max = Math.max(this.chartMax(), 1);
    const n = data.length;
    const left = 30;
    const right = 670;
    const top = 25;
    const bottom = 175;
    const step = n > 1 ? (right - left) / (n - 1) : 0;
    const pts: ChartPoint[] = data.map((m, i) => {
      const frac = max > 0 ? m.value / max : 0;
      return { x: left + i * step, y: bottom - frac * (bottom - top), value: m.value };
    });
    let line = '';
    if (pts.length > 1) {
      line = `M ${pts[0].x} ${pts[0].y}`;
      for (let i = 1; i < pts.length; i++) {
        const prev = pts[i - 1] ?? pts[i];
        const curr = pts[i];
        line += ` Q ${(prev.x + curr.x) / 2} ${prev.y} ${curr.x} ${curr.y}`;
      }
    }
    const area = pts.length
      ? `${line} L ${pts[pts.length - 1].x} ${bottom} L ${pts[0].x} ${bottom} Z`
      : '';
    const total = data.reduce((acc, m) => acc + m.value, 0);
    const avg = data.length > 0 ? total / data.length : 0;
    const avgY = bottom - (avg * (bottom - top)) / max;
    return { line, area, pts, avgY, max };
  });

  readonly chartLabels = computed(() =>
    this.chartData().map((m) => `${m.label} (${this.formatShortQ(m.value)})`),
  );

  // ==== Egresos y KPIs ====
  readonly egresos = computed(() =>
    this.transactions().filter((t) => t.type === 'EXPENSE'),
  );

  readonly filteredEgresos = computed(() => {
    const term = this.search().toLowerCase().trim();
    const all = this.egresos().slice(0, 60);
    if (!term) return all;
    return all.filter(
      (t) =>
        (t.description ?? '').toLowerCase().includes(term) ||
        this.getCategoryName(t.category).toLowerCase().includes(term) ||
        t.date.includes(term),
    );
  });

  readonly egresosMes = computed(() =>
    this.egresos()
      .filter((t) => this.isMonthOf(t.date, new Date()))
      .reduce((acc, t) => acc + t.amount, 0),
  );

  readonly egresosMesPrev = computed(() => {
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return this.egresos()
      .filter((t) => this.isMonthOf(t.date, prev))
      .reduce((acc, t) => acc + t.amount, 0);
  });

  readonly variacionPct = computed(() => {
    const prev = this.egresosMesPrev();
    const curr = this.egresosMes();
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 100);
  });

  readonly variacionPctLabel = computed(() => {
    const v = this.variacionPct();
    return `${v >= 0 ? '+' : ''}${v}% vs mes ant.`;
  });

  readonly ingresosTotales = computed(() =>
    this.transactions()
      .filter((t) => t.type === 'INCOME')
      .reduce((acc, t) => acc + t.amount, 0),
  );

  readonly egresosTotales = computed(() =>
    this.egresos().reduce((acc, t) => acc + t.amount, 0),
  );

  /** Suma de los presupuestos (budget_limit) de las categorías del usuario en la BD */
  readonly presupuestoMensual = computed(() =>
    this.categories().reduce((acc, c) => acc + (Number(c.budgetLimit) || 0), 0),
  );

  readonly presupuestoUsadoPct = computed(() => {
    const p = this.presupuestoMensual();
    return p > 0 ? Math.min(100, Math.round((this.egresosMes() / p) * 100)) : 0;
  });

  readonly gastoMaximo = computed(() => {
    const egresos = this.egresos().filter((t) =>
      this.isMonthOf(t.date, new Date()),
    );
    if (egresos.length === 0) return { name: '—', amount: 0, pct: 0 };
    const max = egresos.reduce((acc, t) => (t.amount > acc.amount ? t : acc));
    const total = this.egresosMes();
    const pct = total > 0 ? Math.round((max.amount / total) * 100) : 0;
    return {
      name: this.getCategoryName(max.category) || 'Sin categoría',
      amount: max.amount,
      pct,
    };
  });

  readonly categorySplit = computed(() => {
    const groups = new Map<string, number>();
    const egresos = this.egresos().filter((t) =>
      this.isMonthOf(t.date, new Date()),
    );
    for (const t of egresos) {
      const key = this.getCategoryName(t.category) || 'Sin categoría';
      groups.set(key, (groups.get(key) ?? 0) + t.amount);
    }
    const total = this.egresosMes();
    return Array.from(groups.entries())
      .map(([name, amount]) => {
        const cat = this.categories().find((c) => c.name === name);
        return {
          name,
          amount,
          pct: total > 0 ? Math.round((amount / total) * 100) : 0,
          color: cat?.color ?? '#00f0ff',
          icon: cat ? (this.ICON_MAP[cat.icon] ?? this.ICON_MAP['default']) : this.ICON_MAP['default'],
        } satisfies CategorySplitItem;
      })
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  });

  readonly topCategoria = computed(() => {
    const arr = this.categorySplit();
    return arr.length > 0
      ? arr[0]
      : { name: '—', amount: 0, pct: 0, color: '#00f0ff', icon: '💸' };
  });

  readonly saldoDisponible = computed(() =>
    this.ingresosTotales() - this.egresosTotales(),
  );

  readonly diasRestantes = computed(() => {
    const now = new Date();
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return Math.max(0, last.getDate() - now.getDate());
  });

  readonly sugeridoDiario = computed(() => {
    const d = this.diasRestantes();
    return d > 0 ? Math.round((this.saldoDisponible() / d) * 100) / 100 : 0;
  });

  readonly currentMonthLabel = computed(() => {
    const d = new Date();
    const m = d.toLocaleString('es', { month: 'long' });
    return `${m.charAt(0).toUpperCase() + m.slice(1)} ${d.getFullYear()}`;
  });

  // ==== Ciclo de vida ====
  ngOnInit(): void {
    const user = this.auth.user;
    if (user) this.name.set(user.name);
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
    this.loading.set(true);
    this.error.set(null);
    this.transactionsService.getAll().subscribe({
      next: (rows) => {
        this.transactions.set(rows);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(e?.error?.message ?? 'Error al cargar los egresos');
        this.loading.set(false);
      },
    });
    this.categoriesService.getAll().subscribe({
      next: (cats) => this.categories.set(cats),
      error: () => {},
    });
  }

  // ==== Helpers ====
  isSameMonth(date: string, d: Date): boolean {
    const td = new Date(`${date}T00:00:00`);
    return td.getMonth() === d.getMonth() && td.getFullYear() === d.getFullYear();
  }

  isMonthOf(date: string, d: Date): boolean {
    const td = new Date(`${date}T00:00:00`);
    return td.getMonth() === d.getMonth() && td.getFullYear() === d.getFullYear();
  }

  formatQ(v: number): string {
    return v.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  formatShortQ(v: number): string {
    if (v >= 1000) return `${(v / 1000).toFixed(1).replace('.0', '')}k`;
    return String(Math.round(v));
  }

  shortId(id: string): string {
    return `TX-${id.slice(0, 5).toUpperCase()}`;
  }

  formatDateEs(date: string): string {
    const d = new Date(`${date}T00:00:00`);
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `${d.getDate()} ${meses[d.getMonth()] ?? ''} ${d.getFullYear()}`;
  }

  getCategoryName(id: string | null): string {
    if (!id) return '';
    return this.categories().find((c) => c.id === id)?.name ?? '';
  }

  getCategoryColor(id: string | null, fallback: string): string {
    if (!id) return fallback;
    return this.categories().find((c) => c.id === id)?.color ?? fallback;
  }

  getCategoryIcon(id: string | null): string {
    if (!id) return this.ICON_MAP['default'];
    const cat = this.categories().find((c) => c.id === id);
    if (!cat) return this.ICON_MAP['default'];
    return this.ICON_MAP[cat.icon] ?? this.ICON_MAP['default'];
  }

  chipBg(hex: string): string {
    try {
      const h = hex.replace('#', '');
      const r = parseInt(h.substring(0, 2), 16);
      const g = parseInt(h.substring(2, 4), 16);
      const b = parseInt(h.substring(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, 0.15)`;
    } catch {
      return 'rgba(0, 240, 255, 0.15)';
    }
  }

  setRange(r: RangeKey): void {
    this.range.set(r);
  }

  isAdmin(): boolean {
    return this.auth.isAdmin();
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

  openCreate(): void {
    this.error.set(null);
    this.editingId.set(null);
    this.formDescription = '';
    this.formAmount = null;
    this.formDate = new Date().toISOString().slice(0, 10);
    this.formCategory = this.categories()[0]?.id ?? null;
    this.showCategoryForm.set(false);
    this.showModal.set(true);
  }

  openEdit(item: Transaction): void {
    if (!this.isAdmin()) {
      this.error.set('Solo un usuario administrador puede realizar esta acción');
      setTimeout(() => this.error.set(null), 3000);
      return;
    }
    this.error.set(null);
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
    this.error.set(null);
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
      type: 'EXPENSE' as const,
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
        this.loadData();
      },
      error: (e) => this.error.set(e?.error?.message ?? 'Error al guardar'),
    });
  }

  deleteEgreso(id: string): void {
    if (!this.isAdmin()) {
      this.error.set('Solo un usuario administrador puede realizar esta acción');
      setTimeout(() => this.error.set(null), 3000);
      return;
    }
    this.transactionsService.delete(id).subscribe({
      next: () => this.loadData(),
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
}