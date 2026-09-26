/*
 * Copyright 2026 Darshan
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software is distributed
 * on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND.
 * See the License for the specific language governing permissions and limitations.
 */
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
export const workspace = join(root, 'workspace');
export const baseline = join(root, 'baseline', 'workspace');

export function assertLabPaths() {
  if (resolve(workspace) !== join(root, 'workspace') || resolve(baseline) !== join(root, 'baseline', 'workspace')) {
    throw new Error('Lab path validation failed');
  }
  for (const path of [root, dirname(baseline), baseline]) {
    if (!existsSync(path) || !lstatSync(path).isDirectory() || lstatSync(path).isSymbolicLink()) {
      throw new Error(`Expected ordinary lab directory missing: ${path}`);
    }
  }
  if (existsSync(workspace) && (!lstatSync(workspace).isDirectory() || lstatSync(workspace).isSymbolicLink())) {
    throw new Error('Workspace must be an ordinary directory');
  }
  for (const path of [join(baseline, 'package.json'), join(baseline, 'sandbox', 'IMPORTANT_FILE.txt')]) {
    if (!existsSync(path) || !lstatSync(path).isFile()) throw new Error(`Baseline marker missing: ${path}`);
  }
}

export function fileMap(directory) {
  const map = new Map();
  if (!existsSync(directory)) return map;
  function visit(path) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const next = join(path, entry.name);
      const rel = relative(directory, next).split(sep).join('/');
      if (entry.isSymbolicLink()) throw new Error(`Symlink in lab tree: ${rel}`);
      if (entry.isDirectory()) visit(next);
      else if (entry.isFile()) map.set(rel, createHash('sha256').update(readFileSync(next)).digest('hex'));
      else throw new Error(`Unsupported lab entry: ${rel}`);
    }
  }
  visit(directory);
  return map;
}
