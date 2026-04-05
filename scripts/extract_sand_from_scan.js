#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Source: saved scan JSON in VSCode workspaceStorage (absolute path)
const src = 'c:\\Users\\letsj\\AppData\\Roaming\\Code\\User\\workspaceStorage\\9f0337c2df5233321649d3e9b528c4ea\\GitHub.copilot-chat\\chat-session-resources\\5343353a-1913-48bf-ac3c-6f7b557d49bc\\call_mCQV7w7kwZ7knffGGme3qvq2__vscode-1774869523740\\content.json';

const outDir = path.resolve(__dirname, '..', 'scans');
const outFile = path.join(outDir, 'sand_positions_radius5.csv');

try {
  if (!fs.existsSync(src)) {
    console.error('Source scan file not found:', src);
    process.exit(2);
  }
  const text = fs.readFileSync(src, 'utf8');
  // match block objects that contain "name": "sand"
  const objRegex = /{[^}]*"name"\s*:\s*"sand"[^}]*}/g;
  const matches = text.match(objRegex) || [];
  const positions = [];
  for (const m of matches) {
    const xm = m.match(/"x"\s*:\s*(-?\d+)/);
    const ym = m.match(/"y"\s*:\s*(-?\d+)/);
    const zm = m.match(/"z"\s*:\s*(-?\d+)/);
    if (xm && ym && zm) {
      positions.push([xm[1], ym[1], zm[1]]);
    }
  }
  const uniq = Array.from(new Set(positions.map(a => a.join(',')))).map(s => s.split(','));
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const csv = 'x,y,z\n' + uniq.map(a => a.join(',')).join('\n');
  fs.writeFileSync(outFile, csv, 'utf8');
  console.log('Wrote', uniq.length, 'positions to', outFile);
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
