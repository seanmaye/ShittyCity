"""Unpack the single-file build back into the source tree (the reverse of bundle.py).

  python -I tools/unbundle.py [bundled.html] [out_dir]

Defaults: schuylkill-monorail.html -> the repo root. Writes index.html, css/style.css,
js/**.js, data/*.json, data/<city>/* and docs/EDITING.md, overwriting what is there.
Use it when someone has edited the shared HTML directly, then check the result with
`python -I tools/unbundle.py --check`, which re-bundles and compares.
"""
import base64, json, os, re, subprocess, sys, tempfile

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
LOADER = ("<script type=\"module\">\nimport('./js/main.js').catch(e => { console.error(e); "
          "document.getElementById('err').style.display = 'flex'; });\n</script>")
EXTERNALS = [  # (import line, how to tell a module uses it), in the order bundle.py hoists them
    ("import * as THREE from 'three';", re.compile(r"\bTHREE\.")),
    ("import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';", re.compile(r"\bOrbitControls\b")),
    ("import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';", re.compile(r"\bBufferGeometryUtils\b")),
    ("import { Line2 } from 'three/examples/jsm/lines/Line2.js';", re.compile(r"\bLine2\b")),
    ("import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';", re.compile(r"\bLineSegments2\b")),
    ("import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';", re.compile(r"\bLineSegmentsGeometry\b")),
    ("import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';", re.compile(r"\bLineMaterial\b")),
    ("import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';", re.compile(r"\bLineGeometry\b")),
]
# gzip data files are embedded as base64, with their file name
GZBLOCK = re.compile(r'^<script type="application/gzip-base64" id="data-([\w-]+)" data-file="([^"]+)">(.*?)</script>\n', re.S | re.M)
CHUNK = re.compile(r'// ---- (\S+)\n__mods\["\1"\] = await \(async \(\) => \{\n(.*?)\nreturn \{ ?(.*?) ?\};\n\}\)\(\);\n', re.S)
# a data block starts a line (the editing guide quotes the tag mid-line, which must not match)
# (another city's blocks also name their file: data-file="nyc/transit.json")
BLOCK = re.compile(r'^<script type="application/json" id="data-([\w-]+)"(?: data-file="([^"]+)")?>(.*?)</script>\n', re.S | re.M)
LOCAL = re.compile(r'^const \{ (.*?) \} = __mods\["([^"]+)"\];$', re.M)


def rel(frm, to):
    r = os.path.relpath(to, os.path.dirname(frm)).replace(os.sep, "/")
    return r if r.startswith(".") else "./" + r


def module_source(path, body, exports):
    lines = body.split("\n")
    # local imports were turned into `const { a, b: c } = __mods["x"];` in place
    for i, l in enumerate(lines):
        m = LOCAL.match(l)
        if m:
            names = m.group(1).replace(": ", " as ")
            lines[i] = f"import {{ {names} }} from '{rel(path, m.group(2))}';"
    # external imports were blanked; put them back into the blank lines of the import header
    code = "\n".join(l for l in lines if not l.startswith("import "))
    need = [imp for imp, used in EXTERNALS if used.search(code)]
    # the import block runs from the top to the first line of code (external imports may sit
    # before, between or after the local ones)
    header_end = next((i for i, l in enumerate(lines) if l.strip() and not l.startswith(("//", "import "))), len(lines))
    blanks = [i for i in range(0, header_end) if lines[i] == ""]
    if len(blanks) < len(need):
        raise SystemExit(f"{path}: no room to restore {need[len(blanks):]}")
    for i, imp in zip(blanks, need):  # first blanks after the header comment = original slots
        lines[i] = imp
    # exports: put `export` back on the top-level declarations named in `return { ... }`
    names = [n.strip() for n in exports.split(",") if n.strip()]
    covered = set()
    for i, l in enumerate(lines):
        m = re.match(r"^((?:async\s+)?function\*?\s+(\w+)|class\s+(\w+)|(?:const|let|var)\s+(\w+))", l)
        if not m:
            continue
        name = m.group(2) or m.group(3) or m.group(4)
        if name in names and name not in covered:
            lines[i] = "export " + l
            covered.add(name)
            if m.group(4):  # `export const A = 1, B = 2;` exports B too
                covered |= set(re.findall(r",\s*(\w+)\s*=", l))
    missing = [n for n in names if n not in covered]
    if missing:
        raise SystemExit(f"{path}: could not find declarations for exports {missing}")
    return "\n".join(lines).rstrip("\n") + "\n"


def unbundle(src_html, out):
    html = open(src_html, encoding="utf-8").read()
    files = {}
    # editing guide comment right after the doctype
    m = re.match(r"(?is)(<!doctype html>\n)<!--\n(.*?)\n-->\n", html)
    if m:
        files["docs/EDITING.md"] = m.group(2) + "\n"
        html = m.group(1) + html[m.end():]
    # stylesheet
    m = re.search(r"<style>\n(.*?)</style>", html, re.S)
    files["css/style.css"] = m.group(1)
    html = html[:m.start()] + '<link rel="stylesheet" href="css/style.css">' + html[m.end():]
    # data blocks: JSON as text, gzip files as base64
    blocks = sorted(list(BLOCK.finditer(html)) + list(GZBLOCK.finditer(html)), key=lambda b: b.start())
    for b in blocks:
        if b.re is GZBLOCK:
            files[f"data/{b.group(2)}"] = base64.b64decode(b.group(3))
            continue
        body = b.group(3).replace("<\\/", "</")
        json.loads(body)  # sanity
        files[f"data/{b.group(2) or b.group(1) + '.json'}"] = body
    # code
    m = re.search(r'<script type="module">\n(.*?)</script>', html[blocks[-1].end():], re.S)
    script = m.group(1)
    for c in CHUNK.finditer(script):
        files[c.group(1)] = module_source(c.group(1), c.group(2), c.group(3))
    start = blocks[0].start()
    end = blocks[-1].end() + m.end()
    files["index.html"] = html[:start] + LOADER + html[end:]
    for p, text in files.items():
        dst = os.path.join(out, p)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        if isinstance(text, bytes):
            with open(dst, "wb") as f:
                f.write(text)
            continue
        with open(dst, "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
    return files


def blocks_of(html):
    data = {m.group(1): m.group(3) for m in BLOCK.finditer(html)}
    data.update({m.group(1): m.group(3) for m in GZBLOCK.finditer(html)})
    rest = GZBLOCK.sub("", BLOCK.sub("", html))
    return data, rest


def check(src_html):
    """Unbundle into a temp dir, bundle again, compare with the original."""
    with tempfile.TemporaryDirectory() as tmp:
        os.makedirs(os.path.join(tmp, "tools"))
        for t in ("bundle.py",):
            with open(os.path.join(ROOT, "tools", t), encoding="utf-8") as f, open(os.path.join(tmp, "tools", t), "w", encoding="utf-8") as g:
                g.write(f.read())
        unbundle(src_html, tmp)
        out = os.path.join(tmp, "rebuilt.html")
        subprocess.run([sys.executable, "-I", os.path.join(tmp, "tools", "bundle.py"), out], check=True, capture_output=True)
        a, b = open(src_html, encoding="utf-8").read(), open(out, encoding="utf-8").read()
        if a == b:
            print("round trip: byte-identical")
            return True
        (da, ra), (db, rb) = blocks_of(a), blocks_of(b)
        same_data = da == db
        same_rest = ra == rb
        print(f"round trip: data blocks identical: {same_data} ({len(da)} blocks); everything else identical: {same_rest}")
        if same_data and same_rest:
            print("  (only the order of the data blocks differs)")
        elif not same_rest:
            la, lb = ra.split("\n"), rb.split("\n")
            for i, (x, y) in enumerate(zip(la, lb)):
                if x != y:
                    print(f"  first difference at line {i + 1}:\n  - {x[:160]}\n  + {y[:160]}")
                    break
            else:
                print(f"  line counts differ: {len(la)} vs {len(lb)}")
        return same_data and same_rest


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    src = args[0] if args else os.path.join(ROOT, "schuylkill-monorail.html")
    if "--check" in sys.argv:
        sys.exit(0 if check(src) else 1)
    out = args[1] if len(args) > 1 else ROOT
    files = unbundle(src, out)
    print(f"wrote {len(files)} files to {out}: " + ", ".join(sorted(files)))
