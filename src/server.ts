import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';

export async function startServer(port = 0): Promise<{ url: string; close(): Promise<void> }> {
  const routes: Record<string, { file: URL; type: string }> = {
    '/': { file: new URL('../web/index.html', import.meta.url), type: 'text/html' },
    '/style.css': { file: new URL('../web/style.css', import.meta.url), type: 'text/css' },
    '/favicon.svg': { file: new URL('../web/favicon.svg', import.meta.url), type: 'image/svg+xml' },
    '/browser.js': { file: new URL('./browser.js', import.meta.url), type: 'text/javascript' },
    '/registry.js': { file: new URL('./registry.js', import.meta.url), type: 'text/javascript' },
    '/grader.js': { file: new URL('./grader.js', import.meta.url), type: 'text/javascript' },
  };
  const server = createServer(async (request, response) => {
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    const route = routes[path];
    if (!route || request.method !== 'GET') { response.writeHead(404); response.end('Not found'); return; }
    try {
      const body = await readFile(route.file);
      response.writeHead(200, { 'Content-Type': `${route.type}; charset=utf-8`, 'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'none'; frame-ancestors 'none'" });
      response.end(body);
    } catch {
      response.writeHead(500); response.end('Build assets missing. Run npm run build.');
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    }),
  };
}
