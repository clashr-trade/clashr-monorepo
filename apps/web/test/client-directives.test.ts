import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { expect, it } from 'vitest';

const root = fileURLToPath(new URL('../', import.meta.url));
function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.[jt]sx?$/.test(entry.name) ? [path] : [];
  });
}

it('keeps Next client/server directives before imports, including files containing a BOM', () => {
  const misplaced: string[] = [];
  for (const path of ['app', 'components', 'lib'].flatMap((directory) => sourceFiles(join(root, directory)))) {
    const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
    let prologue = true;
    for (const statement of source.statements) {
      if (ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression)) {
        if (!prologue && ['use client', 'use server'].includes(statement.expression.text)) {
          const line = source.getLineAndCharacterOfPosition(statement.getStart(source)).line + 1;
          misplaced.push(`${relative(root, path)}:${line}`);
        }
      } else prologue = false;
    }
  }
  expect(misplaced).toEqual([]);
});
