import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    String(d.getFullYear()) +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    '_' +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function parseGitStatusPorcelain(text) {
  const out = [];
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd()).filter(Boolean);
  for (const line of lines) {
    const m = line.match(/^[ MADRCU?!]{2}\s+(.*)$/);
    if (!m) continue;
    let p = m[1];
    if (p.includes(' -> ')) p = p.split(' -> ').pop();
    if (!p) continue;
    out.push(p);
  }
  return Array.from(new Set(out)).sort();
}

function ensureDirForFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeFileUtf8(filePath, content) {
  ensureDirForFile(filePath);
  fs.writeFileSync(filePath, content, { encoding: 'utf8' });
}

function main() {
  const status = execSync('git status --porcelain', { cwd: repoRoot, encoding: 'utf8' });
  const relPaths = parseGitStatusPorcelain(status)
    .filter((p) => !p.startsWith('.factory/'))
    .filter((p) => !p.includes('node_modules/'));

  if (relPaths.length === 0) {
    throw new Error('No changed/untracked files found in git status --porcelain');
  }

  const bundleDir = path.join(repoRoot, `signed_bundle_${nowStamp()}`);
  fs.mkdirSync(bundleDir, { recursive: true });

  const manifestLines = [];
  for (const rel of relPaths) {
    const src = path.join(repoRoot, rel);
    if (!fs.existsSync(src) || !fs.statSync(src).isFile()) {
      throw new Error(`Missing source file: ${rel}`);
    }

    const dest = path.join(bundleDir, rel);
    ensureDirForFile(dest);
    fs.copyFileSync(src, dest);

    const data = fs.readFileSync(dest);
    const hash = sha256Hex(data);
    manifestLines.push(`${hash}  ${rel.replaceAll('\\', '/')}`);
  }

  const manifestPath = path.join(bundleDir, 'MANIFEST.sha256');
  writeFileUtf8(manifestPath, manifestLines.join('\n') + '\n');
  const manifestBytes = fs.readFileSync(manifestPath);
  const manifestSha256 = sha256Hex(manifestBytes);
  writeFileUtf8(path.join(bundleDir, 'MANIFEST.sha256.hash'), `${manifestSha256}\n`);

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const sig = crypto.sign(null, manifestBytes, privateKey);

  const publicPem = publicKey.export({ type: 'spki', format: 'pem' });
  const sigB64 = sig.toString('base64');

  writeFileUtf8(path.join(bundleDir, 'MANIFEST.ed25519.public.pem'), publicPem);
  writeFileUtf8(path.join(bundleDir, 'MANIFEST.ed25519.sig.b64'), `${sigB64}\n`);
  writeFileUtf8(path.join(bundleDir, 'MANIFEST.ed25519.sig.sha256'), `${sha256Hex(sig)}\n`);

  const summary = {
    bundleDir,
    files: relPaths,
    manifest: {
      path: 'MANIFEST.sha256',
      sha256: manifestSha256,
    },
    signature: {
      algorithm: 'ed25519',
      sigB64,
      publicKeyPemPath: 'MANIFEST.ed25519.public.pem',
      sigPath: 'MANIFEST.ed25519.sig.b64',
    },
    createdAt: new Date().toISOString(),
  };

  writeFileUtf8(path.join(bundleDir, 'BUNDLE.json'), JSON.stringify(summary, null, 2) + '\n');

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(summary, null, 2));
}

main();
