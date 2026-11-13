"""One-off repair for data/nola/city_buildings.bin.gz: the NOLA build (before the fix in
build_nola.py) wrote the polygon vertices as absolute values, but the engine
(js/scene/city.js) decodes them delta-encoded per ring (first absolute, then differences),
so every ring accumulated into a giant starburst (the radial streaks in the 'Whole city' view).

This re-encodes only the vx and vz sections in place, leaving every other byte untouched:
  new[0] = old[0];  new[i] = old[i] - old[i-1]   (per ring, ring lengths from pn)

    tools/.venv/bin/python -I tools/nola/fix_phb.py            # fix data/nola/
    tools/.venv/bin/python -I tools/nola/fix_phb.py --check    # verify only, no write
"""
import gzip
import os
import shutil
import struct
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
PATH = os.path.join(ROOT, 'data', 'nola', 'city_buildings.bin.gz')


def main():
    check = '--check' in sys.argv
    raw = gzip.open(PATH, 'rb').read()
    assert raw[:4] == b'PHB1', 'bad header'
    nB, nP, nV = struct.unpack_from('<III', raw, 4)

    # section offsets (see js/scene/city.js decode and tools/nyc/import_nyc.py)
    o = 16
    off = {}
    for name, n, sz in [('bx', nB, 4), ('bz', nB, 4), ('vx', nV, 4), ('vz', nV, 4),
                        ('bw', nB, 2), ('bd', nB, 2), ('br', nB, 2), ('bh', nB, 2),
                        ('pn', nP, 2), ('ph', nP, 2), ('bk', nB, 1), ('pk', nP, 1)]:
        off[name] = (o, n, sz)
        o += n * sz
    assert o == len(raw), f'layout mismatch: sections end at {o}, file is {len(raw)} bytes'

    vx = np.frombuffer(raw, dtype='<i4', count=nV, offset=off['vx'][0]).copy()
    vz = np.frombuffer(raw, dtype='<i4', count=nV, offset=off['vz'][0]).copy()
    pn = np.frombuffer(raw, dtype='<u2', count=nP, offset=off['pn'][0])
    assert int(pn.sum()) == nV, f'pn sums to {pn.sum()}, expected nV={nV}'

    # report the before extents (m)
    def extents(v):
        lo, hi, v0 = 1e18, -1e18, 0
        for n in pn.tolist():
            seg = v[v0:v0 + n]
            x = np.empty(n)
            x[0] = seg[0]
            for i in range(1, n):
                x[i] = x[i - 1] + seg[i]
            lo, hi = min(lo, x.min()), max(hi, x.max())
            v0 += n
        return lo / 10, hi / 10

    print(f'nB={nB} nP={nP} nV={nV}')
    bx0, bx1 = extents(vx); bz0, bz1 = extents(vz)
    print(f'  current: vx [{bx0:.0f}, {bx1:.0f}] m   vz [{bz0:.0f}, {bz1:.0f}] m')

    # already delta-encoded (within the city, ~ +/- 10 km)? then there is nothing to do —
    # running this twice would double-delta-encode and break the file again.
    if max(abs(bx0), abs(bx1), abs(bz0), abs(bz1)) < 20000:
        print('  already delta-encoded: nothing to do')
        return

    if check:
        return

    # delta-encode per ring: first absolute, then differences against the previous ORIGINAL value
    def delta(v):
        out = v.copy()
        v0 = 0
        for n in pn.tolist():
            seg = v[v0:v0 + n]
            out[v0 + 1:v0 + n] = seg[1:] - seg[:-1]
            v0 += n
        return out

    nvx, nvz = delta(vx), delta(vz)
    raw = bytearray(raw)
    raw[off['vx'][0]:off['vx'][0] + nV * 4] = nvx.tobytes()
    raw[off['vz'][0]:off['vz'][0] + nV * 4] = nvz.tobytes()

    bak = PATH + '.bak'
    if not os.path.exists(bak):
        shutil.copy2(PATH, bak)
        print(f'  backup -> {os.path.relpath(bak, ROOT)}')
    with open(PATH, 'wb') as fo, gzip.GzipFile(fileobj=fo, mode='wb', compresslevel=9, mtime=0) as gz:
        gz.write(bytes(raw))
    print(f'  after:  vx [{extents(nvx)[0]:.0f}, {extents(nvx)[1]:.0f}] m   vz [{extents(nvz)[0]:.0f}, {extents(nvz)[1]:.0f}] m')
    print(f'  wrote {os.path.relpath(PATH, ROOT)} ({os.path.getsize(PATH) // 1024} KB)')


if __name__ == '__main__':
    main()
