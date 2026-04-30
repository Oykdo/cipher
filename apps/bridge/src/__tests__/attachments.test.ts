import { describe, expect, it } from 'vitest';
import { buildAttachmentContentDisposition } from '../routes/attachments.js';

describe('attachment download headers', () => {
  it('encodes screenshot filenames with typographic and accented characters', () => {
    const header = buildAttachmentContentDisposition('Capture d\u2019\u00e9cran 2026-04-28 204206.png');

    expect(header).toBe(
      'attachment; filename="Capture d__cran 2026-04-28 204206.png.enc"; filename*=UTF-8\'\'Capture%20d%E2%80%99%C3%A9cran%202026-04-28%20204206.png.enc'
    );
    expect(Buffer.from(header, 'ascii').toString('ascii')).toBe(header);
  });

  it('removes control characters and path separators from both filename variants', () => {
    const header = buildAttachmentContentDisposition('bad\r\n../name".png');

    expect(header).toBe(
      'attachment; filename="bad.._name_.png.enc"; filename*=UTF-8\'\'bad.._name%22.png.enc'
    );
  });
});
