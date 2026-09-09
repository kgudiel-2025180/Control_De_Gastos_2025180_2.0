import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  {
    path: 'login',
    title: 'Iniciar sesión · Control de Gastos',
    loadComponent: () =>
      import('./features/auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'dashboard',
    title: 'Panel · Control de Gastos',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'transacciones',
    title: 'Transacciones · Control de Gastos',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/transacciones/transacciones.component').then(
        (m) => m.TransaccionesComponent,
      ),
  },
  {
    path: 'ingresos',
    title: 'Ingresos · Control de Gastos',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/ingresos/ingresos.component').then((m) => m.IngresosComponent),
  },
  {
    path: 'tarjeta',
    title: 'Mi Tarjeta · Control de Gastos',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/tarjeta/tarjeta.component').then((m) => m.TarjetaComponent),
  },
  { path: '**', redirectTo: 'login' },
];
