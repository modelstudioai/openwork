#!/usr/bin/env node

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const root = path.join(packageDir, 'bootstrap');
const host = '127.0.0.1';
const port = 1420;
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
};

http
  .createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', `http://${host}:${port}`)
      .pathname;
    const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
    const filePath = path.resolve(root, relativePath);

    if (
      !filePath.startsWith(`${root}${path.sep}`) ||
      !fs.existsSync(filePath) ||
      !fs.statSync(filePath).isFile()
    ) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }

    response.writeHead(200, {
      'Content-Type':
        contentTypes[path.extname(filePath)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(filePath).pipe(response);
  })
  .listen(port, host, () => {
    console.log(
      `OpenWork bootstrap server listening on http://${host}:${port}`,
    );
  });
