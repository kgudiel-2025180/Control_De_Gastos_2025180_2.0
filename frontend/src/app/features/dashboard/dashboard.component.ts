import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly name = signal<string>('');
  readonly email = signal<string>('');
  readonly sessionExpired = signal(false);

  private timer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    const user = this.auth.user;
    if (user) {
      this.name.set(user.name);
      this.email.set(user.email);
    }

    this.timer = setInterval(() => this.checkSession(), 1000);
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
}