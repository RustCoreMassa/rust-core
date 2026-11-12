import { Routes } from '@angular/router';
import { adminGuard } from './features/admin/admin-guard';

export const routes: Routes = [
  {
    path: '',
    title: 'RustCore — Self-custodial tools for Massa',
    loadComponent: () => import('./features/home/home-page').then((m) => m.HomePage),
  },
  {
    path: 'tokens',
    title: 'Tokens · RustCore',
    loadComponent: () => import('./features/explore/explore-page').then((m) => m.ExplorePage),
    data: { kind: 0 },
  },
  {
    path: 'tokens/:address',
    title: 'Token · RustCore',
    loadComponent: () => import('./features/tokens/token-page').then((m) => m.TokenPage),
  },
  {
    path: 'collections',
    title: 'Collections · RustCore',
    loadComponent: () => import('./features/explore/explore-page').then((m) => m.ExplorePage),
    data: { kind: 1 },
  },
  {
    path: 'collections/:address',
    title: 'Collection · RustCore',
    loadComponent: () =>
      import('./features/collections/collection-page').then((m) => m.CollectionPage),
  },
  {
    path: 'collections/:address/:tokenId',
    title: 'NFT · RustCore',
    loadComponent: () => import('./features/collections/nft-page').then((m) => m.NftPage),
  },
  {
    path: 'marketplace',
    title: 'Marketplace · RustCore',
    loadComponent: () =>
      import('./features/marketplace/marketplace-page').then((m) => m.MarketplacePage),
  },
  {
    path: 'presales',
    title: 'Presales · RustCore',
    loadComponent: () => import('./features/presales/presales-page').then((m) => m.PresalesPage),
  },
  {
    path: 'presales/:id',
    title: 'Presale · RustCore',
    loadComponent: () => import('./features/presales/presale-page').then((m) => m.PresalePage),
  },
  {
    path: 'launch',
    title: 'Fair launch · RustCore',
    loadComponent: () =>
      import('./features/fair-launch/fair-launches-page').then((m) => m.FairLaunchesPage),
  },
  {
    path: 'launch/new',
    title: 'Launch a memecoin · RustCore',
    loadComponent: () =>
      import('./features/fair-launch/create-fair-launch-page').then((m) => m.CreateFairLaunchPage),
  },
  {
    path: 'launch/:id',
    title: 'Fair launch · RustCore',
    loadComponent: () =>
      import('./features/fair-launch/fair-launch-page').then((m) => m.FairLaunchPage),
  },
  {
    path: 'create/token',
    title: 'Create a token · RustCore',
    loadComponent: () =>
      import('./features/create/create-token-page').then((m) => m.CreateTokenPage),
  },
  {
    path: 'create/collection',
    title: 'Create a collection · RustCore',
    loadComponent: () =>
      import('./features/create/create-collection-page').then((m) => m.CreateCollectionPage),
  },
  {
    path: 'create/presale/:token',
    title: 'Start a presale · RustCore',
    loadComponent: () =>
      import('./features/create/create-presale-page').then((m) => m.CreatePresalePage),
  },
  {
    path: 'me',
    title: 'My launches · RustCore',
    loadComponent: () => import('./features/dashboard/dashboard-page').then((m) => m.DashboardPage),
  },
  {
    path: 'api',
    title: 'Public API · RustCore',
    loadComponent: () => import('./features/developers/api-page').then((m) => m.ApiPage),
  },
  {
    path: 'admin',
    title: 'Admin · RustCore',
    loadComponent: () => import('./features/admin/admin-page').then((m) => m.AdminPage),
    canActivate: [adminGuard],
  },
  {
    path: '**',
    title: 'Page not found · RustCore',
    loadComponent: () => import('./features/not-found/not-found-page').then((m) => m.NotFoundPage),
  },
];
