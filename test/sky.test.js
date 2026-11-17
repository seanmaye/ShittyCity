import { describe, expect, it } from 'vitest';
import { setCity } from '../js/cities.ts';
import { sunAt, sunsetHour } from '../js/scene/sky.ts';

// the sun over Philadelphia (CITY.sun: 39.952 N, 75.164 W) on the solstices of 2025, in local clock time
// (EDT in June, EST in December). Noon elevation is 90 - latitude ± 23.44.
const highest = date => { let best = { h: 0, el: -90 }; for (let h = 10; h < 15; h += .01) { const s = sunAt(h, date); if (s.el > best.el) best = { h, ...s }; } return best; };

describe('sunAt and sunsetHour', () => {
  setCity('phl');
  it('peaks due south at solar noon, at the solstice elevations', () => {
    const june = highest(new Date(2025, 5, 21, 12)), dec = highest(new Date(2025, 11, 21, 12));
    expect(june.el).toBeCloseTo(90 - 39.952 + 23.44, 0);
    expect(dec.el).toBeCloseTo(90 - 39.952 - 23.44, 0);
    expect(june.h).toBeCloseTo(13.03, 1);   // 13:02 EDT
    expect(dec.h).toBeCloseTo(11.97, 1);    // 11:58 EST
    expect(june.az).toBeCloseTo(180, 0);
    expect(dec.az).toBeCloseTo(180, 0);
  });
  // sunset here is elevation 0, in 3-minute steps: about 5 minutes before the almanac's (8:32 PM EDT, 4:38 PM EST),
  // which counts the top of the disc, lifted by refraction
  it('sets when the sun reaches the horizon', () => {
    expect(sunsetHour(new Date(2025, 5, 21, 12))).toBeCloseTo(20.45, 2);
    expect(sunsetHour(new Date(2025, 11, 21, 12))).toBeCloseTo(16.55, 2);
  });
});
