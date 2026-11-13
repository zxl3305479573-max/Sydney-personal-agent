#!/usr/bin/env python3
"""Serve synthetic responses for the isolated IP staging route check."""

import http.server
import json
import threading


class Handler(http.server.BaseHTTPRequestHandler):
    def reply(self):
        body = json.dumps({"upstream": self.server.name, "path": self.path}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self.reply()

    def do_POST(self):
        self.reply()

    def log_message(self, *_args):
        pass


servers = []
try:
    for port, name in ((3100, "api"), (5173, "web")):
        server = http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler)
        server.name = name
        servers.append(server)
    for server in servers:
        threading.Thread(target=server.serve_forever, daemon=True).start()
    print("synthetic_upstreams_ready", flush=True)
    threading.Event().wait()
finally:
    for server in servers:
        server.server_close()
