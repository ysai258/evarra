import { describe, expect, it } from 'vitest';
import { faceCrop } from '../../scripts/dataset/generate-assets.ts';
import {
  isDistinctiveName, namesAnotherPerson, rescueFacelessOnly, titleMentions,
  type ValidationResult,
} from '../../scripts/dataset/validate-images.ts';

const portrait = { width: 1000, height: 1500 };

describe('faceCrop', () => {
  it('produces a 4:5 rectangle', () => {
    const crop = faceCrop(portrait, { cx: 0.5, cy: 0.3, size: 0.35 });
    expect(crop.width / crop.height).toBeCloseTo(0.8, 1);
  });

  it('stays inside the image', () => {
    for (const cx of [0, 0.05, 0.5, 0.95, 1]) {
      for (const cy of [0, 0.1, 0.5, 0.9, 1]) {
        const crop = faceCrop(portrait, { cx, cy, size: 0.3 });
        expect(crop.left).toBeGreaterThanOrEqual(0);
        expect(crop.top).toBeGreaterThanOrEqual(0);
        expect(crop.left + crop.width).toBeLessThanOrEqual(portrait.width);
        expect(crop.top + crop.height).toBeLessThanOrEqual(portrait.height);
      }
    }
  });

  it('zooms in on a small face and out on a large one', () => {
    const small = faceCrop(portrait, { cx: 0.5, cy: 0.3, size: 0.25 });
    const large = faceCrop(portrait, { cx: 0.5, cy: 0.3, size: 0.6 });
    expect(small.height).toBeLessThan(large.height);
  });

  it('frames the head at roughly a third of the crop height', () => {
    const crop = faceCrop(portrait, { cx: 0.5, cy: 0.3, size: 0.3 });
    const faceDiameter = 0.3 * Math.min(portrait.width, portrait.height);
    expect(faceDiameter / crop.height).toBeCloseTo(0.36, 1);
  });

  it('never crops so tight that the output would be mostly upscaled', () => {
    const crop = faceCrop({ width: 2000, height: 2500 }, { cx: 0.5, cy: 0.3, size: 0.02 });
    expect(crop.width).toBeGreaterThanOrEqual(520);
  });

  it('never exceeds the source for a very large face', () => {
    const crop = faceCrop(portrait, { cx: 0.5, cy: 0.5, size: 1.5 });
    expect(crop.width).toBeLessThanOrEqual(portrait.width);
    expect(crop.height).toBeLessThanOrEqual(portrait.height);
  });

  it('keeps the face inside the crop', () => {
    const crop = faceCrop(portrait, { cx: 0.35, cy: 0.25, size: 0.3 });
    const faceX = 0.35 * portrait.width;
    const faceY = 0.25 * portrait.height;
    expect(faceX).toBeGreaterThan(crop.left);
    expect(faceX).toBeLessThan(crop.left + crop.width);
    expect(faceY).toBeGreaterThan(crop.top);
    expect(faceY).toBeLessThan(crop.top + crop.height);
  });

  it('stays inside the image at awkward sizes, where rounding could overflow', () => {
    for (let width = 401; width < 460; width += 7) {
      for (let height = 503; height < 560; height += 11) {
        for (const size of [0.11, 0.23, 0.37, 0.49, 0.71]) {
          const crop = faceCrop({ width, height }, { cx: 0.62, cy: 0.31, size });
          expect(crop.left + crop.width, `${width}x${height} @${size}`).toBeLessThanOrEqual(width);
          expect(crop.top + crop.height, `${width}x${height} @${size}`).toBeLessThanOrEqual(height);
          expect(crop.width).toBeGreaterThan(0);
          expect(crop.height).toBeGreaterThan(0);
        }
      }
    }
  });

  it('handles a landscape source', () => {
    const crop = faceCrop({ width: 2000, height: 800 }, { cx: 0.5, cy: 0.4, size: 0.45 });
    expect(crop.height).toBeLessThanOrEqual(800);
    expect(crop.width / crop.height).toBeCloseTo(0.8, 1);
  });
});

describe('titleMentions', () => {
  it('accepts a file named after the person', () => {
    expect(titleMentions('File:Allu Arjun at Pushpa 2 meet.jpg', 'Allu Arjun')).toBe(true);
    expect(titleMentions('File:BhanuPriyaPortrait.jpg', 'Bhanupriya')).toBe(true);
  });

  it('rejects an event photo that never names them', () => {
    expect(titleMentions('File:Shri Bharathiraja lighting the lamp.jpg', 'Devayani')).toBe(false);
  });

  it('ignores short name fragments that would match anything', () => {
    expect(titleMentions('File:Ali Baba and the forty thieves.jpg', 'Ali')).toBe(false);
  });

  it('is false when the person is unknown', () => {
    expect(titleMentions('File:Anything.jpg', undefined)).toBe(false);
  });
});

describe('namesAnotherPerson', () => {
  const everyone = [
    'Jeevitha', 'Mani Ratnam', 'Lakshmi Manchu', 'Samyuktha', 'A. Harsha', 'Rama Krishna',
  ].map((name) => ({ name, tokens: name.toLowerCase().replace(/\./g, '').split(/\s+/).filter(Boolean) }));

  it('catches a two-subject press photo', () => {
    expect(
      namesAnotherPerson(
        'File:Telugu Film Actors, Smt. Jeevitha and Dr. Rajashekhar calling on the PM.jpg',
        'Dr. Rajasekhar',
        everyone,
      ),
    ).toBe('Jeevitha');
  });

  it('does not flag a name that is part of the subject’s own name', () => {
    expect(namesAnotherPerson('File:Suhasini Maniratnam interview.png', 'Suhasini Maniratnam', everyone))
      .toBeUndefined();
  });

  it('does not flag a coincidental substring', () => {
    expect(namesAnotherPerson('File:Azahar Shaik receiving a certificate.jpg', 'Azahar Shaik', everyone))
      .toBeUndefined();
  });

  it('does not flag non-adjacent tokens', () => {
    expect(namesAnotherPerson('File:Kodi Ramakrishna.jpg', 'Kodi Ramakrishna', everyone)).toBeUndefined();
  });

  it('leaves a solo portrait alone', () => {
    expect(namesAnotherPerson('File:Prabhas at the Baahubali launch.jpg', 'Prabhas', everyone))
      .toBeUndefined();
  });
});

describe('isDistinctiveName', () => {
  it('accepts multi-token and long single-token names', () => {
    expect(isDistinctiveName('Mahesh Babu')).toBe(true);
    expect(isDistinctiveName('Brahmanandam')).toBe(true);
  });

  it('rejects a short single-token name that would match anything', () => {
    expect(isDistinctiveName('Ali')).toBe(false);
  });
});

describe('rescueFacelessOnly', () => {
  const make = (over: Partial<ValidationResult>): ValidationResult => ({
    qid: 'Q1', localFile: 'a.jpg', verdict: 'rejected', reasons: [], width: 800, height: 1000, ...over,
  });

  it('restores the largest photo for someone left with nothing', () => {
    const results = [
      make({ localFile: 'small.jpg', reasons: ['no face detected'], width: 600, height: 800 }),
      make({ localFile: 'big.jpg', reasons: ['no face detected'], width: 2000, height: 3000 }),
    ];
    expect(rescueFacelessOnly(results)).toBe(1);
    expect(results.find((r) => r.localFile === 'big.jpg')?.verdict).toBe('review');
    expect(results.find((r) => r.localFile === 'small.jpg')?.verdict).toBe('rejected');
  });

  it('leaves alone someone who already has a usable photo', () => {
    const results = [
      make({ localFile: 'good.jpg', verdict: 'valid' }),
      make({ localFile: 'faceless.jpg', reasons: ['no face detected'] }),
    ];
    expect(rescueFacelessOnly(results)).toBe(0);
    expect(results[1]!.verdict).toBe('rejected');
  });

  it('never rescues an image rejected for anything else', () => {
    const results = [
      make({ reasons: ['no face detected', 'duplicate of x.jpg'] }),
      make({ localFile: 'b.jpg', reasons: ['the file also names Someone Else — the crop could be the wrong person'] }),
    ];
    expect(rescueFacelessOnly(results)).toBe(0);
  });

  it('rescues per person, not globally', () => {
    const results = [
      make({ qid: 'Q1', reasons: ['no face detected'] }),
      make({ qid: 'Q2', localFile: 'b.jpg', reasons: ['no face detected'] }),
    ];
    expect(rescueFacelessOnly(results)).toBe(2);
  });
});
