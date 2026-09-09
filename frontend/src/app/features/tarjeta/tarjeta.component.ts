import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { CardsService, Card } from '../../services/cards.service';
import { TransactionsService, Transaction } from '../../services/transactions.service';

@Component({
  selector: 'app-tarjeta',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './tarjeta.component.html',
  styleUrl: './tarjeta.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TarjetaComponent implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly cardsService = inject(CardsService);
  private readonly transactionsService = inject(TransactionsService);

  readonly name = signal<string>('');
  readonly email = signal<string>('');
  readonly sessionExpired = signal(false);

  readonly card = signal<Card | null>(null);
  readonly revealed = signal(false);
  readonly copied = signal(false);
  readonly freezeLoading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly transactions = signal<Transaction[]>([]);

  private timer: ReturnType<typeof setInterval> | null = null;

  /** Número enmascarado cuando los datos están ocultos */
  readonly maskedNumber = computed(() => {
    const number = this.card()?.number ?? '';
    const last4 = number.replace(/\s/g, '').slice(-4);
    return `•••• •••• •••• ${last4}`;
  });

  readonly isFrozen = computed(() => this.card()?.status === 'FROZEN');

  /** Saldo disponible real: ingresos - egresos */
  readonly saldo = computed(() => {
    const rows = this.transactions();
    const ingresos = rows.filter((t) => t.type === 'INCOME').reduce((a, t) => a + t.amount, 0);
    const egresos = rows.filter((t) => t.type === 'EXPENSE').reduce((a, t) => a + t.amount, 0);
    return ingresos - egresos;
  });

  /** Gastos del mes en curso */
  readonly gastosMes = computed(() => {
    const now = new Date();
    return this.transactions()
      .filter((t) => t.type === 'EXPENSE')
      .filter((t) => {
        const d = new Date(`${t.date}T00:00:00`);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      })
      .reduce((a, t) => a + t.amount, 0);
  });

  readonly movimientosCount = computed(
    () => this.transactions().filter((t) => t.type === 'EXPENSE').length,
  );

  /** Últimos 6 egresos (movimientos de la tarjeta) */
  readonly movimientos = computed(() =>
    this.transactions()
      .filter((t) => t.type === 'EXPENSE')
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 6),
  );

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

  toggleReveal(): void {
    this.revealed.update((v) => !v);
  }

  copyNumber(): void {
    const number = this.card()?.number;
    if (!number) return;
    navigator.clipboard?.writeText(number).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }

  toggleFreeze(): void {
    const card = this.card();
    if (!card || this.freezeLoading()) return;
    this.freezeLoading.set(true);
    const next = card.status === 'FROZEN' ? 'ACTIVE' : 'FROZEN';
    this.cardsService.setStatus(card.id, next).subscribe({
      next: (updated) => {
        this.card.set(updated);
        this.freezeLoading.set(false);
      },
      error: () => this.freezeLoading.set(false),
    });
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

  private loadData(): void {
    this.cardsService.getMyCard().subscribe({
      next: (card) => this.card.set(card),
      error: () => this.loadError.set('No se pudo cargar la tarjeta. Verifica que el backend esté corriendo.'),
    });
    this.transactionsService.getAll().subscribe({
      next: (rows) => this.transactions.set(rows),
      error: () => {},
    });
  }
}
