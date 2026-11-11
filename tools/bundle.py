"""Bundle the project into one self-contained HTML file for sharing.

  python -I tools/bundle.py [out.html]

Inlines css/style.css, every module under js/, every data/*.json file as JSON and every
data/*.gz file (the citywide build-out) as base64. Each other city's folder (data/<city>/, see
js/cities.js) is inlined the same way, its block ids prefixed with "<city>-" and its files named
in data-file. three.js still loads from the CDN through the page's import map. The result opens
straight from disk.
"""
import base64, json, os, re, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
# the shareable file lives at the repo root and is committed alongside the sources
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "city-models.html")
ENTRY = "js/main.js"

IMPORT = re.compile(r"^import\s+(.+?)\s+from\s+'([^']+)';\s*$", re.M)
EXPORT_FN = re.compile(r"^export\s+((?:async\s+)?function\*?\s+(\w+))", re.M)
EXPORT_CLASS = re.compile(r"^export\s+(class\s+(\w+))", re.M)
EXPORT_VAR = re.compile(r"^export\s+((?:const|let|var)\s+)", re.M)


def read(p):
    with open(os.path.join(ROOT, p), encoding="utf-8") as f:
        return f.read()


def resolve(frm, spec):
    return os.path.normpath(os.path.join(os.path.dirname(frm), spec)).replace(os.sep, "/")


def var_names(src, start):
    """Top-level names declared by `const a = ..., b = ...;` beginning at src[start]."""
    names, depth, i, expect = [], 0, start, True
    while i < len(src):
        ch = src[i]
        if expect:
            m = re.match(r"\s*(\w+)", src[i:])
            names.append(m.group(1))
            i += m.end()
            expect = False
            continue
        if src.startswith("//", i):          # comments may hold quotes ("NJ Transit's")
            i = src.find("\n", i)
            if i < 0:
                break
            continue
        if src.startswith("/*", i):
            i = src.find("*/", i + 2) + 2
            continue
        if ch in "([{":
            depth += 1
        elif ch in ")]}":
            depth -= 1
        elif ch in "'\"`":
            j = i + 1
            while src[j] != ch:
                j += 2 if src[j] == "\\" else 1
            i = j
        elif ch == "," and depth == 0:
            expect = True
        elif ch == ";" and depth == 0:
            break
        i += 1
    return names


modules, order, external = {}, [], {}


def visit(path):
    if path in modules:
        return
    src = read(path)
    deps = []
    for spec_names, spec in IMPORT.findall(src):
        if spec.startswith("."):
            dep = resolve(path, spec)
            deps.append((spec_names, dep))
            visit(dep)
        else:
            external[(spec_names, spec)] = True
    modules[path] = (src, deps)
    order.append(path)


visit(ENTRY)


def wrap(path):
    src, deps = modules[path]
    exports = []

    def local_import(m):
        names, spec = m.group(1), m.group(2)
        if not spec.startswith("."):
            return ""  # hoisted to the top of the bundle
        dep = resolve(path, spec)
        names = names.strip()
        if names.startswith("{"):
            body = names.strip("{} ").replace(" as ", ": ")
            return f"const {{ {body} }} = __mods[{json.dumps(dep)}];"
        if names.startswith("* as "):
            return f"const {names[5:].strip()} = __mods[{json.dumps(dep)}];"
        raise SystemExit(f"{path}: unsupported import {m.group(0)}")

    src = IMPORT.sub(local_import, src)
    for m in EXPORT_FN.finditer(src):
        exports.append(m.group(2))
    for m in EXPORT_CLASS.finditer(src):
        exports.append(m.group(2))
    for m in EXPORT_VAR.finditer(src):
        exports += var_names(src, m.end())
    src = EXPORT_FN.sub(r"\1", src)
    src = EXPORT_CLASS.sub(r"\1", src)
    src = EXPORT_VAR.sub(r"\1", src)
    if re.search(r"^export\s", src, re.M):
        raise SystemExit(f"{path}: unsupported export form")
    ret = ", ".join(exports)
    return f"// ---- {path}\n__mods[{json.dumps(path)}] = await (async () => {{\n{src}\nreturn {{ {ret} }};\n}})();\n"


imports = "".join(f"import {n} from '{s}';\n" for n, s in external)  # must stay at module top level
bundle = "const __mods = {};\n" + "".join(wrap(p) for p in order)

html = read("index.html")
css = read("css/style.css")
html = html.replace('<link rel="stylesheet" href="css/style.css">', f"<style>\n{css}</style>")
data_tags = ""
# Philadelphia's files in data/, then each other city's folder data/<city>/ (js/cities.js)
dirs = [("", "")] + [(d + "/", d + "-") for d in sorted(os.listdir(os.path.join(ROOT, "data"))) if os.path.isdir(os.path.join(ROOT, "data", d))]
for sub, prefix in dirs:
    for name in sorted(os.listdir(os.path.join(ROOT, "data", sub))):
        if name.endswith(".json"):
            body = read("data/" + sub + name).replace("</", "<\\/")
            file_attr = f' data-file="{sub}{name}"' if sub else ""
            data_tags += f'<script type="application/json" id="data-{prefix}{name[:-5]}"{file_attr}>{body}</script>\n'
        elif name.endswith(".gz"):   # gzip data (city build-out): base64, decoded by js/data.js
            with open(os.path.join(ROOT, "data", sub, name), "rb") as f:
                b64 = base64.b64encode(f.read()).decode("ascii")
            data_tags += f'<script type="application/gzip-base64" id="data-{prefix}{name.split(".")[0]}" data-file="{sub}{name}">{b64}</script>\n'
loader = re.search(r'<script type="module">\s*import\(\'\./js/main\.js\'\).*?</script>', html, re.S)
html = html.replace(loader.group(0), data_tags + f'<script type="module">\n{imports}try {{\n{bundle}\n}} catch (e) {{ console.error(e); document.getElementById(\'err\').style.display = \'flex\'; }}\n</script>')
# the editing guide rides along as a comment right after the doctype, so whoever opens
# the file (person or AI) reads it first
guide = read("docs/EDITING.md")
if "-->" in guide:
    raise SystemExit("docs/EDITING.md must not contain '-->' (it would end the HTML comment)")
doctype = re.match(r"(?i)<!doctype html>\r?\n", html)
html = html[:doctype.end()] + "<!--\n" + guide.rstrip() + "\n-->\n" + html[doctype.end():]
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    f.write(html)
print(f"{OUT}: {os.path.getsize(OUT) / 1e6:.1f} MB, {len(order)} modules, {data_tags.count('<script ')} data blocks")
