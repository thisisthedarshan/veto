/*
 * Copyright 2026 Darshan
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { randomBytes } from 'node:crypto';
import { createConnection, createServer } from 'node:net';
import { chmodSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const ENDPOINT = fileURLToPath(new URL('../.local/veto-hook-endpoint.json', import.meta.url));

export function hookAddress(platform, pid, nonce) {
  if (platform === 'win32') return `\\\\.\\pipe\\veto-hook-${pid}-${nonce}`;
  return fileURLToPath(new URL(`../.local/veto-hook-${pid}-${nonce}.sock`, import.meta.url));
}

export async function startHookBridge(gate) {
  mkdirSync(dirname(ENDPOINT), { recursive: true });
  const socketPath = hookAddress(process.platform, process.pid, randomBytes(8).toString('hex'));
  const token = randomBytes(32).toString('hex');
  const server = createServer(socket => {
    let buffer = '';
    socket.setEncoding('utf8');
    socket.on('data', async chunk => {
      buffer += chunk;
      if (buffer.length > 65536) { socket.end(JSON.stringify({ error: 'request too large' }) + '\n'); return; }
      if (!buffer.includes('\n')) return;
      const line = buffer.slice(0, buffer.indexOf('\n'));
      buffer = '';
      try {
        const message = JSON.parse(line);
        if (message.token !== token) throw new Error('unauthorized hook client');
        let result;
        if (message.method === 'authorize') result = await gate.authorize(message.params);
        else if (message.method === 'report') result = gate.report(message.params);
        else if (message.method === 'report_reviewed') result = gate.reportReviewed(message.params);
        else throw new Error('unknown hook method');
        socket.end(`${JSON.stringify({ result })}\n`);
      } catch (error) { socket.end(`${JSON.stringify({ error: error.message })}\n`); }
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, resolve);
  });
  if (process.platform !== 'win32') chmodSync(socketPath, 0o600);
  const temp = `${ENDPOINT}.${process.pid}`;
  writeFileSync(temp, JSON.stringify({ socketPath, token }), { mode: 0o600 });
  renameSync(temp, ENDPOINT);
  const cleanup = () => {
    if (process.platform !== 'win32') try { unlinkSync(socketPath); } catch {}
    try {
      const active = JSON.parse(readFileSync(ENDPOINT, 'utf8'));
      if (active.socketPath === socketPath) unlinkSync(ENDPOINT);
    } catch {}
  };
  process.once('exit', cleanup);
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => { cleanup(); process.exit(0); });
  }
  return server;
}

export function callHookBridge(method, params, timeoutMs = 120000) {
  const { socketPath, token } = JSON.parse(readFileSync(ENDPOINT, 'utf8'));
  return new Promise((resolve, reject) => {
    const socket = createConnection(socketPath);
    let buffer = '';
    const timer = setTimeout(() => { socket.destroy(); reject(new Error('VETO hook bridge timed out')); }, timeoutMs);
    socket.setEncoding('utf8');
    socket.on('connect', () => socket.write(`${JSON.stringify({ token, method, params })}\n`));
    socket.on('data', chunk => {
      buffer += chunk;
      if (!buffer.includes('\n')) return;
      clearTimeout(timer);
      socket.end();
      try {
        const response = JSON.parse(buffer.slice(0, buffer.indexOf('\n')));
        if (response.error) reject(new Error(response.error));
        else resolve(response.result);
      } catch (error) { reject(error); }
    });
    socket.on('error', error => { clearTimeout(timer); reject(error); });
  });
}
