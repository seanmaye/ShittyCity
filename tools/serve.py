"""Serve the repo for local development, with caching turned off.

python -m http.server sends no caching headers, so a browser may keep using an old copy of a
module after you edit it (the page then mixes new and stale code). This server tells the browser
never to store anything (Cache-Control: no-store), so every reload gets the files as they are on
disk. It also accepts many connections at once: the page opens dozens of module and data requests.

Run (from anywhere):  python -I tools/serve.py            then open http://localhost:8765
Options:              python -I tools/serve.py 8080       another port
                      python -I tools/serve.py --open     also open the browser
"""
import functools
import http.server
import os
import sys
import webbrowser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):   # only errors, not every request
        if args and str(args[1])[:1] in "45":
            super().log_message(fmt, *args)


class Server(http.server.ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 128   # Windows refuses past the default 5 while the page loads


def main():
    args = sys.argv[1:]
    port = next((int(a) for a in args if a.isdigit()), 8765)
    handler = functools.partial(Handler, directory=ROOT)
    with Server(("127.0.0.1", port), handler) as httpd:
        url = f"http://localhost:{port}"
        print(f"Serving {ROOT} at {url} (no caching). Ctrl+C to stop.", flush=True)
        if "--open" in args:
            webbrowser.open(url)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
