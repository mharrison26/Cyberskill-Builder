import { describe, expect, it } from 'vitest';

import { scanFilename, scanUpload } from '@/lib/compliance/scanUpload';

describe('scanFilename', () => {
  it('rejects filenames with CUI markings', () => {
    const result = scanFilename('evidence-CUI//SP-EXAMPLE.png');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.matchedPattern).toMatch(/CUI/i);
    }
  });

  it('rejects filenames with classified markings', () => {
    const result = scanFilename('screenshot-TOP SECRET.png');
    expect(result.ok).toBe(false);
  });

  it('allows benign filenames', () => {
    expect(scanFilename('risk-register-screenshot.png').ok).toBe(true);
  });
});

describe('scanUpload', () => {
  it('scans text file contents under the size limit', () => {
    const content = Buffer.from('Header\nSECRET//NOFORN\nFooter', 'utf8');
    const result = scanUpload({
      filename: 'notes.txt',
      mimeType: 'text/plain',
      size: content.byteLength,
      buffer: content,
    });

    expect(result.ok).toBe(false);
  });

  it('skips content scan for files over the size limit', () => {
    const content = Buffer.from('TOP SECRET', 'utf8');
    const result = scanUpload({
      filename: 'large.bin',
      mimeType: 'application/octet-stream',
      size: 6 * 1024 * 1024,
      buffer: content,
    });

    expect(result.ok).toBe(true);
  });

  it('still scans filenames for oversized files', () => {
    const content = Buffer.from('x', 'utf8');
    const result = scanUpload({
      filename: 'SECRET//export.png',
      mimeType: 'image/png',
      size: 6 * 1024 * 1024,
      buffer: content,
    });

    expect(result.ok).toBe(false);
  });
});
