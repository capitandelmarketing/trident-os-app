#!/usr/bin/env python3
"""
serve.py — Dev server with no-cache headers.

`python -m http.server` caches ES modules by URL, which means edits to .js files
don't take effect on browser reload (the module URL is identical, so the browser
uses the cached version). This script sends Cache-Control: no-store on every
response to force fresh fetches on each reload.

Usage:
    python serve.py [port]    # default port 3460

For production (Firebase Hosting) the cache config is in firebase.json.
"""

import os
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler

# Change cwd to the script's directory so http.server serves trident-os-app/
os.chdir(os.path.dirname(os.path.abspath(__file__)))


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # Disable all caching · forces fresh fetch on every reload
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        # Quieter logs · only log paths, no timestamp
        sys.stderr.write(f"  {self.command} {self.path}\n")


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 3460
    server = HTTPServer(("", port), NoCacheHandler)
    print(f"[serve.py] Trident OS dev server on http://localhost:{port}/  (no-cache headers)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[serve.py] Stopping...")
        server.server_close()


if __name__ == "__main__":
    main()
