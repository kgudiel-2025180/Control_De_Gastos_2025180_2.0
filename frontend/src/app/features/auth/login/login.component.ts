import { ChangeDetectionStrategy, Component, AfterViewInit, ElementRef, OnInit, ViewChild, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
            auto_select?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              theme?: string;
              size?: string;
              shape?: string;
              text?: string;
              locale?: string;
              width?: number;
            },
          ) => void;
        };
      };
    };
  }
}

const GOOGLE_CLIENT_ID =
  '585021197810-8p9806hbl30h46682dsbsak5dde7elrn.apps.googleusercontent.com';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [RouterLink, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent implements OnInit, AfterViewInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly showPassword = signal(false);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  @ViewChild('googleBtnContainer') googleBtnContainer?: ElementRef<HTMLDivElement>;

  password = '';
  username = '';
  private googleRenderRetries = 0;

  ngOnInit(): void {
    if (this.auth.isLoggedIn()) {
      this.router.navigate(['/dashboard']);
    }
  }

  ngAfterViewInit(): void {
    this.tryRenderGoogleButton();
  }

  togglePasswordVisibility(): void {
    this.showPassword.update((visible) => !visible);
  }

  onSubmit(): void {
    if (this.loading()) {
      return;
    }

    this.error.set(null);
    this.loading.set(true);

    this.auth.login(this.username, this.password).subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.loading.set(false);
        const msg =
          err?.error?.message ?? 'No se pudo iniciar sesión. Intenta de nuevo.';
        this.error.set(msg);
      },
    });
  }

  /** Renderiza el botón oficial de Google cuando el script de GSI está cargado */
  private tryRenderGoogleButton(): void {
    const container = this.googleBtnContainer?.nativeElement;
    if (!container) {
      return;
    }
    const google = window.google;
    if (!google) {
      // El script se carga con async/defer: reintenta unos segundos
      if (this.googleRenderRetries < 20) {
        this.googleRenderRetries++;
        setTimeout(() => this.tryRenderGoogleButton(), 300);
      }
      return;
    }

    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response) => this.handleGoogleCredential(response.credential ?? ''),
    });
    google.accounts.id.renderButton(container, {
      theme: 'filled_black',
      size: 'large',
      shape: 'pill',
      text: 'continue_with',
      locale: 'es',
      width: 320,
    });
  }

  handleGoogleCredential(credential: string): void {
    if (!credential) {
      this.error.set('No se pudo obtener la credencial de Google');
      return;
    }
    this.error.set(null);
    this.loading.set(true);

    this.auth.loginWithGoogle(credential).subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.loading.set(false);
        const msg =
          err?.error?.message ?? 'No se pudo iniciar sesión con Google. Intenta de nuevo.';
        this.error.set(msg);
      },
    });
  }
}