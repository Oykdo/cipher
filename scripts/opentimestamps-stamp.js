import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import OpenTimestampsModule from 'opentimestamps';

const OpenTimestamps = OpenTimestampsModule?.default ?? OpenTimestampsModule;

function usage() {
  // eslint-disable-next-line no-console
  console.log(`\nOpenTimestamps stamping helper\n\nUsage:\n  node scripts/opentimestamps-stamp.js --bundle-dir <path> [--out <file>] [--upgrade]\n  node scripts/opentimestamps-stamp.js --digest-hex <64-hex> [--out <file>] [--upgrade]\n\nNotes:\n  - --bundle-dir expects a file MANIFEST.sha256.hash inside the directory (hex SHA-256).\n  - Output is a detached timestamp proof (.ots).\n  - --upgrade may or may not complete immediately; re-run later to get Bitcoin attestations.\n`);
}

function parseArgs(argv) {
  const out = { bundleDir: undefined, digestHex: undefined, outFile: undefined, upgrade: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--bundle-dir') out.bundleDir = argv[++i];
    else if (a === '--digest-hex') out.digestHex = argv[++i];
    else if (a === '--out') out.outFile = argv[++i];
    else if (a === '--upgrade') out.upgrade = true;
    else if (a === '--help' || a === '-h') {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown arg: ${a}`);
    }
  }
  return out;
}

function hexToBytes(hex) {
  const h = hex.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(h)) {
    throw new Error('digest-hex must be 64 hex chars (SHA-256)');
  }
  return Buffer.from(h, 'hex');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let digestHex = args.digestHex;
  if (!digestHex && args.bundleDir) {
    const p = path.resolve(args.bundleDir, 'MANIFEST.sha256.hash');
    if (!fs.existsSync(p)) {
      throw new Error(`Missing ${p} (expected MANIFEST.sha256.hash in bundle dir)`);
    }
    digestHex = fs.readFileSync(p, 'utf8').trim();
  }

  if (!digestHex) {
    usage();
    throw new Error('Provide --bundle-dir or --digest-hex');
  }

  const digest = hexToBytes(digestHex);

  const detached = OpenTimestamps.DetachedTimestampFile.fromHash(new OpenTimestamps.Ops.OpSHA256(), digest);
  await OpenTimestamps.stamp(detached);

  if (args.upgrade) {
    await OpenTimestamps.upgrade(detached);
  }

  const outFile = args.outFile
    ? path.resolve(args.outFile)
    : args.bundleDir
      ? path.resolve(args.bundleDir, 'MANIFEST.sha256.hash.ots')
      : path.resolve(`${digestHex}.ots`);

  fs.writeFileSync(outFile, Buffer.from(detached.serializeToBytes()));

  // eslint-disable-next-line no-console
  console.log(`Wrote: ${outFile}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err?.message ?? err);
  process.exit(1);
});
