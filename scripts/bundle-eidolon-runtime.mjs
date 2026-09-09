/**
 * Stage a minimal Eidolon tree into assets/eidolon-runtime for electron-builder
 * extraResources. Required for packaged Cipher keybundle import/export (Python CLI).
 *
 * Also stages a self-contained CPython (python-build-standalone) with the deps
 * the ceremony and the CLI need (numpy, cryptography, eidolon_crypto), so the
 * packaged app runs the Genesis ceremony locally without any Python installed
 * on the user's machine.
 *
 * Run automatically before `npm run build:win` / `build:linux` / `build:mac`.
 * Set EIDOLON_ROOT to point at an Eidolon checkout outside ../Eidolon.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cipherRoot = path.resolve(__dirname, '..');
// CI checks Eidolon out as a sibling of the workspace rather than of the repo,
// so allow an explicit override. Same env var main.js honors at runtime.
const eidolonRoot = process.env.EIDOLON_ROOT
  ? path.resolve(process.env.EIDOLON_ROOT)
  : path.resolve(cipherRoot, '..', 'Eidolon');
const destRoot = path.join(cipherRoot, 'assets', 'eidolon-runtime');
const cliMarker = path.join(eidolonRoot, 'scripts', 'public', 'keybundle_cli.py');

const SKIP_DIR_NAMES = new Set([
  '__pycache__',
  '.git',
  '.pytest_cache',
  '.mypy_cache',
  'node_modules',
  'target',
  'dist',
  'build',
  'tests',
  'test',
]);

// pqcrypto is PINNED, not floated. 1.0.0 renamed the whole API surface:
// mceliece6960119 / falcon_512 / sphincs_sha2_256f_simple no longer exist,
// and hqc_256 moved from generate_keypair/encrypt/decrypt to keygen/encaps/
// decaps. Eidolon's real_post_quantum.py calls the 0.x API, so an unpinned
// install resolves to 1.0.0, the import fails, the try/except swallows it and
// the ceremony silently falls back to "Post-quantum disabled" — the exact
// state this pin exists to fix. 0.3.4 ships cp311 wheels for win_amd64 and
// manylinux_2_17_x86_64, matching the bundled CPython and both CI runners.
//
// Note the coupling: these wheels are cp311-specific (unlike eidolon_crypto's
// abi3). Moving PBS_PYTHON_VERSION off 3.11 requires re-checking this pin.
const VENV_REQUIREMENTS = ['numpy>=1.24.0', 'cryptography>=41.0.0', 'pqcrypto==0.3.4'];

// eidolon_crypto is the Rust native extension. Without it the ceremony walks
// all the way to phase 8 and then dies writing the .psnx:
//   "The Eidolon native crypto extension (eidolon_crypto) is required for
//    build_native_psnx_bytes, but could not be imported."
// It is not on PyPI — Eidolon ships prebuilt abi3 wheels per platform.
const PREBUILT_WHEELS_DIR = path.join(eidolonRoot, 'prebuilt_wheels');
const NATIVE_WHEEL_PATTERN = process.platform === 'win32'
  ? /^eidolon_crypto-.*-win_amd64\.whl$/
  : /^eidolon_crypto-.*-manylinux.*_x86_64\.whl$/;

function findNativeCryptoWheel() {
  if (!fs.existsSync(PREBUILT_WHEELS_DIR)) return null;
  const match = fs
    .readdirSync(PREBUILT_WHEELS_DIR)
    .filter((f) => NATIVE_WHEEL_PATTERN.test(f))
    .sort()
    .pop();
  return match ? path.join(PREBUILT_WHEELS_DIR, match) : null;
}

function shouldSkipDir(name) {
  return SKIP_DIR_NAMES.has(name);
}

function copyTree(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      if (shouldSkipDir(entry)) continue;
      copyTree(path.join(src, entry), path.join(dest, entry));
    }
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

// --- Portable CPython -------------------------------------------------------
// A `python -m venv` tree is NOT redistributable: it keeps only
// site-packages, and `pyvenv.cfg home` points at the BUILD machine's
// interpreter, so the stdlib resolves to a path that does not exist on a
// user's machine (`os.__file__` -> C:\Users\<builder>\...\Python311\Lib\os.py).
// Shipping one means the ceremony dies on any machine without that exact
// Python install.
//
// python-build-standalone publishes self-contained CPython builds designed
// for exactly this. Release, version and SHA-256 are pinned; the digests come
// from the GitHub release asset metadata and are re-verified on every build,
// so a swapped archive fails the build instead of shipping.
const PBS_RELEASE = '20260901';
const PBS_PYTHON_VERSION = '3.11.16';
const PBS_TARGETS = {
  win32: {
    asset: `cpython-${PBS_PYTHON_VERSION}+${PBS_RELEASE}-x86_64-pc-windows-msvc-install_only.tar.gz`,
    sha256: '6be524fa6752af802146a4adc7d098565425b0b1c166e19a5a7a4c8cccb86bf6',
    python: path.join('python', 'python.exe'),
  },
  linux: {
    asset: `cpython-${PBS_PYTHON_VERSION}+${PBS_RELEASE}-x86_64-unknown-linux-gnu-install_only.tar.gz`,
    sha256: 'faa0758583a63f14c5eee516af82738403b59c13edda6fc0a21d953febd89eed',
    python: path.join('python', 'bin', 'python3'),
  },
};
const PBS_CACHE_DIR = path.join(cipherRoot, 'assets', '.python-cache');

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

async function downloadPortablePython(target) {
  fs.mkdirSync(PBS_CACHE_DIR, { recursive: true });
  const archive = path.join(PBS_CACHE_DIR, target.asset);

  if (fs.existsSync(archive) && sha256File(archive) === target.sha256) {
    console.log('[bundle-eidolon] Using cached CPython archive');
    return archive;
  }

  const url =
    `https://github.com/astral-sh/python-build-standalone/releases/download/` +
    `${PBS_RELEASE}/${target.asset}`;
  console.log('[bundle-eidolon] Downloading portable CPython', PBS_PYTHON_VERSION);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`download failed: HTTP ${res.status} for ${url}`);
  }
  fs.writeFileSync(archive, Buffer.from(await res.arrayBuffer()));

  const actual = sha256File(archive);
  if (actual !== target.sha256) {
    fs.rmSync(archive, { force: true });
    throw new Error(
      `SHA-256 mismatch for ${target.asset}\n  expected ${target.sha256}\n  got      ${actual}`,
    );
  }
  console.log('[bundle-eidolon] SHA-256 verified');
  return archive;
}

/**
 * Stage a self-contained CPython into assets/eidolon-runtime/python and
 * install the ceremony's dependencies into it. Returns the interpreter path,
 * or null on failure (caller aborts the build).
 */
async function createBundledPython() {
  const target = PBS_TARGETS[process.platform === 'win32' ? 'win32' : 'linux'];
  if (!target || (process.platform !== 'win32' && process.platform !== 'linux')) {
    console.error(`[bundle-eidolon] No portable CPython pinned for ${process.platform}`);
    return null;
  }

  let archive;
  try {
    archive = await downloadPortablePython(target);
  } catch (err) {
    console.error('[bundle-eidolon]', err.message);
    return null;
  }

  // The install_only archives contain a single top-level `python/` directory.
  const pythonDest = path.join(destRoot, 'python');
  fs.rmSync(pythonDest, { recursive: true, force: true });
  try {
    // Extract from a path RELATIVE to destRoot: GNU tar (Git for Windows)
    // reads a leading `C:` in an absolute path as a remote host spec and
    // fails with "Cannot connect to C: resolve failed". A relative path has
    // no colon, and works identically under the bsdtar shipped with Windows.
    const relArchive = path.relative(destRoot, archive).split(path.sep).join('/');
    execSync(`tar -xzf "${relArchive}"`, { cwd: destRoot, stdio: 'pipe', timeout: 300_000 });
  } catch (err) {
    console.error('[bundle-eidolon] Failed to extract CPython:', err.message);
    return null;
  }

  const python = path.join(destRoot, target.python);
  if (!fs.existsSync(python)) {
    console.error('[bundle-eidolon] Interpreter missing after extract:', python);
    return null;
  }

  const pipInstall = (args, label) => {
    console.log('[bundle-eidolon]', label);
    execSync(`"${python}" -m pip install ${args} --no-cache-dir --disable-pip-version-check`, {
      stdio: 'pipe',
      timeout: 600_000,
    });
  };

  try {
    pipInstall(VENV_REQUIREMENTS.map((r) => `"${r}"`).join(' '), 'Installing ceremony dependencies...');
  } catch (err) {
    console.error('[bundle-eidolon] pip install failed:', err.message);
    return null;
  }

  // Native crypto extension — mandatory for the Genesis ceremony (phase 9
  // writes the .psnx through build_native_psnx_bytes). Not on PyPI; Eidolon
  // ships prebuilt abi3 wheels per platform.
  const wheel = findNativeCryptoWheel();
  if (!wheel) {
    console.error(
      `[bundle-eidolon] No eidolon_crypto wheel for ${process.platform} in ${PREBUILT_WHEELS_DIR}`,
    );
    return null;
  }
  try {
    pipInstall(`"${wheel}"`, `Installing native crypto extension: ${path.basename(wheel)}`);
  } catch (err) {
    console.error('[bundle-eidolon] eidolon_crypto install failed:', err.message);
    return null;
  }

  // Prove the interpreter is self-contained and every ceremony import
  // resolves. A wheel that installs but fails to load (wrong abi3 tag,
  // missing VC runtime) would otherwise only surface at phase 9 on a user's
  // machine — the exact failure this whole change exists to remove.
  //
  // Written to a file rather than passed with -c: nested quotes in an inline
  // program are mangled by cmd.exe, which silently produced an empty (and
  // therefore meaningless) self-check.
  const probeFile = path.join(destRoot, '_runtime_selfcheck.py');
  fs.writeFileSync(
    probeFile,
    [
      'import os, sys',
      'import numpy, cryptography, eidolon_crypto',
      'assert os.__file__.startswith(sys.prefix), "stdlib outside bundle: " + os.__file__',
      // Ask Eidolon itself whether PQ is live, rather than trusting that the
      // pinned wheel still exposes the module names its 0.x API expects. This
      // is what catches a pqcrypto that installs but no longer integrates.
      'from src.crypto.real_post_quantum import check_pqcrypto_available',
      'assert check_pqcrypto_available(), "pqcrypto installed but not usable by Eidolon"',
      'print("self-contained", sys.version.split()[0], "numpy", numpy.__version__, "pq ok")',
    ].join(String.fromCharCode(10)) + String.fromCharCode(10),
    'utf8',
  );
  try {
    const out = execSync(`"${python}" "${probeFile}"`, {
      stdio: 'pipe',
      timeout: 120_000,
      encoding: 'utf8',
    });
    if (!out.includes('self-contained')) {
      console.error('[bundle-eidolon] Self-check produced no result — aborting.');
      return null;
    }
    console.log('[bundle-eidolon] Runtime self-check:', out.trim());
  } catch (err) {
    console.error(
      '[bundle-eidolon] Bundled runtime self-check failed:',
      (err.stderr || err.message || '').toString().slice(-800),
    );
    return null;
  } finally {
    fs.rmSync(probeFile, { force: true });
  }

  return python;
}

async function main() {
  if (!fs.existsSync(cliMarker)) {
    console.warn(
      '[bundle-eidolon] Skipping: ../Eidolon not found (expected',
      eidolonRoot,
      ').',
    );
    console.warn(
      '[bundle-eidolon] Packaged keybundle import needs Eidolon at build time,',
    );
    console.warn(
      '[bundle-eidolon] or set EIDOLON_ROOT to a full Eidolon checkout at runtime.',
    );
    return;
  }

  if (fs.existsSync(destRoot)) {
    fs.rmSync(destRoot, { recursive: true, force: true });
  }
  fs.mkdirSync(destRoot, { recursive: true });

  for (const rel of ['config', 'src', path.join('scripts', 'public')]) {
    const src = path.join(eidolonRoot, rel);
    const dst = path.join(destRoot, rel);
    if (!fs.existsSync(src)) {
      console.warn(`[bundle-eidolon] Missing ${rel} in Eidolon tree — skipped`);
      continue;
    }
    copyTree(src, dst);
  }

  for (const required of [
    path.join('scripts', 'public', 'keybundle_cli.py'),
    // Genesis ceremony entry point — spawned by main.js over the genesis:start
    // IPC channel. Missing here means signup dies at the ceremony screen.
    path.join('src', 'crypto', 'vault_auto_provision.py'),
  ]) {
    if (!fs.existsSync(path.join(destRoot, required))) {
      console.error(`[bundle-eidolon] Staging failed: ${required} missing in output`);
      process.exit(1);
    }
  }

  // Fatal: the packaged app has no other Python to fall back on for the
  // ceremony, and a silent miss would ship an installer that cannot create
  // an account.
  const python = await createBundledPython();
  if (!python) {
    console.error('[bundle-eidolon] Bundled Python runtime incomplete — refusing to package.');
    process.exit(1);
  }

  console.log('[bundle-eidolon] Staged Eidolon runtime →', destRoot);
}

await main();
