// The bit of Markdown Claude's replies use (spec 2026-10-16-in-editor-chat §2.3): paragraphs, lists, bold, inline code and
// code blocks. Everything becomes Preact text nodes — a reply can never inject HTML.
import type { VNode } from 'preact';

function inline(s: string): Array<string | VNode> {
  const out: Array<string | VNode> = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const t = m[0];
    out.push(t.startsWith('**') ? <strong>{t.slice(2, -2)}</strong> : <code>{t.slice(1, -1)}</code>);
    last = m.index + t.length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

export function renderMarkdown(text: string): VNode {
  const lines = text.replace(/\r\n/g, '\n').split('\n'), blocks: VNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (/^```/.test(l)) {
      const body: string[] = [];
      for (i++; i < lines.length && !/^```/.test(lines[i]); i++) body.push(lines[i]);
      i++;
      blocks.push(<pre><code>{body.join('\n')}</code></pre>);
      continue;
    }
    // a table: a header row, a |---| rule, then rows
    if (/^\s*\|.*\|\s*$/.test(l) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? '')) {
      const cells = (row: string) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(l), rows: string[][] = [];
      for (i += 2; i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i]); i++) rows.push(cells(lines[i]));
      blocks.push(<table><thead><tr>{head.map((c) => <th>{inline(c)}</th>)}</tr></thead>
        <tbody>{rows.map((r) => <tr>{r.map((c) => <td>{inline(c)}</td>)}</tr>)}</tbody></table>);
      continue;
    }
    if (/^\s*[-*] /.test(l) || /^\s*\d+\. /.test(l)) {
      const ordered = /^\s*\d+\. /.test(l), items: string[] = [];
      for (; i < lines.length && (ordered ? /^\s*\d+\. /.test(lines[i]) : /^\s*[-*] /.test(lines[i])); i++) items.push(lines[i].replace(/^\s*(?:[-*]|\d+\.) /, ''));
      const lis = items.map((x) => <li>{inline(x)}</li>);
      blocks.push(ordered ? <ol>{lis}</ol> : <ul>{lis}</ul>);
      continue;
    }
    if (!l.trim()) { i++; continue; }
    const para: string[] = [];
    for (; i < lines.length && lines[i].trim() && !/^```/.test(lines[i]) && !/^\s*(?:[-*]|\d+\.) /.test(lines[i]); i++) para.push(lines[i]);
    blocks.push(<p>{para.flatMap((x, k) => (k ? [<br />, ...inline(x)] : inline(x)))}</p>);
  }
  return <div class="md">{blocks}</div>;
}
