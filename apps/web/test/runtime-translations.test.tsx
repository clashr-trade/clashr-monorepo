import {describe, expect, it} from 'vitest';
import {readFileSync, readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import {renderToStaticMarkup} from 'react-dom/server';
import {translateLanding} from '../lib/landing-languages';
import {LanguageProvider} from '../components/landing/language-provider';
import {Trenches} from '../components/terminal/trenches';

// Brand names, currency symbols, commands, filenames and example identifiers
// retain their literal spelling in every supported language.
const invariant = new Set([
  '$CLASHR', 'CLASHR', 'BNB', 'WBNB', 'ETH', 'USD', 'PancakeSwap',
  'PancakeSwap v2 / v3', 'CHAIN 56 · BNB / WBNB', 'Robinhood Chain',
  'Across', 'DexScreener', 'skill.md', 'llms.txt', 'npx -y @clashr/legacy-mcp',
  'yourname', 'RUSHR-XXXXXXXX', '00:00 UTC →', '23:59 UTC',
  'eth_call', 'eth_simulateV1', '0.0 ETH',
  'CA / BNB SMART CHAIN', 'CLASHR / BNB CHAIN', 'BNB Smart Chain',
  'https://…',
]);

function sourceLabels() {
  const labels = new Set<string>();
  const root = fileURLToPath(new URL('..', import.meta.url));
  function scan(directory: string) {
    for (const entry of readdirSync(directory, {withFileTypes:true})) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) scan(file);
      else if (file.endsWith('.tsx')) {
        const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
        function visit(node: ts.Node) {
          if (file.includes(`${path.sep}terminal${path.sep}`) || file.includes(`${path.sep}trade${path.sep}`)) {
            if (ts.isJsxAttribute(node) && ['label','title','sub','hint','placeholder','text','k','detail','description'].includes(node.name.getText(source)) && node.initializer && ts.isStringLiteral(node.initializer)) {
              const value = node.initializer.text;
              if (/[a-z]{3}/i.test(value) && !invariant.has(value)) labels.add(value);
            }
          }
          if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ['t','translateUI'].includes(node.expression.text)) {
            const argument = node.arguments[0];
            function collect(part: ts.Node) {
              if (ts.isStringLiteral(part) && /[a-z]{3}/i.test(part.text) && !invariant.has(part.text)) labels.add(part.text);
              if (ts.isConditionalExpression(part)) {
                collect(part.whenTrue);
                collect(part.whenFalse);
              }
            }
            if (argument) collect(argument);
          }
          ts.forEachChild(node, visit);
        }
        visit(source);
      }
    }
  }
  scan(path.join(root,'components'));
  scan(path.join(root,'app'));
  return [...labels];
}

describe('runtime localization coverage', () => {
  it('provides Chinese and Japanese copy for literal UI translation calls', () => {
    const missing: string[] = [];
    for (const label of sourceLabels()) for (const language of ['zh-CN','ja'] as const) {
      if (translateLanding(label,language) === label) missing.push(`${language}: ${label}`);
      expect(translateLanding(label,'en')).toBe(label);
    }
    expect(missing).toEqual([]);
  });

  it.each(['ja','zh-CN','en'] as const)('renders every sort option in %s', language => {
    const html = renderToStaticMarkup(<LanguageProvider initialLanguage={language}><Trenches initial={[]} serverNow={0} chainId={56}/></LanguageProvider>);
    for (const label of ['Newest','Market cap','Volume','Holders','Transactions']) {
      expect(html).toContain(`>${translateLanding(label,language)}</option>`);
      if (language !== 'en') expect(html).not.toContain(`>${label}</option>`);
    }
  });
});
