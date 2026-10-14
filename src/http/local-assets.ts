import { Router, static as staticFiles } from 'express';
import { resolve } from 'node:path';

export function localAssets(): Router {
  const router = Router();
  router.use(staticFiles(resolve('public'), { index: false, dotfiles: 'deny' }));
  router.get(['/', '/entrar', '/agenda', '/reservas/:id'], (_request, response) => {
    response.sendFile(resolve('public/index.html'));
  });
  return router;
}
