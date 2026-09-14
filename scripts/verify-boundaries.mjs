import { readdir, readFile } from 'node:fs/promises';
import { resolve, relative, dirname, sep } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import { log, error } from 'node:console';
import ts from 'typescript';

export function importViolation(file, specifier, root) {
  const normalize = (value) => value.split(sep).join('/');
  const source = normalize(relative(root, file));
  const target = specifier.startsWith('.')
    ? normalize(relative(root, resolve(dirname(file), specifier)))
    : specifier;
  if (target.startsWith('../') || target.startsWith('/')) return 'imports outside this workspace';
  const server =
    /^(apps\/api(?:\/|$)|packages\/plaud-client(?:\/|$)|@aptly\/(api|plaud-client)(?:\/|$)|(?:@aws-sdk|pg|fastify)(?:\/|$))/.test(
      target,
    );
  if (
    (source.startsWith('apps/mobile/') ||
      source.startsWith('apps/admin/') ||
      source.startsWith('packages/api-client/')) &&
    server
  )
    return 'client imports server-only code';
  if (
    source.startsWith('packages/api-client/') &&
    /^(apps\/|react(?:-native)?(?:\/|$)|expo(?:\/|$)|node:)/.test(target)
  )
    return 'API client imports application or server runtime code';
  if (
    source.startsWith('packages/contracts/') &&
    (server || /^(apps\/|@aptly\/|react(?:-native)?(?:\/|$)|expo(?:\/|$))/.test(target))
  )
    return 'contracts import application code';
  return undefined;
}

async function* sourceFiles(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.expo', 'ios', 'android', 'assets'].includes(item.name)) continue;
    const path = resolve(directory, item.name);
    if (item.isDirectory()) yield* sourceFiles(path);
    else if (/\.[cm]?[jt]sx?$/.test(item.name)) yield path;
  }
}

async function main() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const failures = [];
  for (const folder of ['apps', 'packages']) {
    for await (const file of sourceFiles(resolve(root, folder))) {
      const source = ts.createSourceFile(
        file,
        await readFile(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      const visit = (node) => {
        let literal;
        if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
          literal = node.moduleSpecifier;
        if (
          ts.isCallExpression(node) &&
          (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
            (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
        ) {
          literal = node.arguments[0];
          if (!literal || !ts.isStringLiteral(literal))
            failures.push(`${relative(root, file)}: dynamic module paths are not permitted`);
        }
        if (literal && ts.isStringLiteral(literal)) {
          const violation = importViolation(file, literal.text, root);
          if (violation) failures.push(`${relative(root, file)}: ${violation} (${literal.text})`);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  }
  if (failures.length) {
    error(failures.join('\n'));
    process.exitCode = 1;
  } else log('Import boundaries passed.');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
