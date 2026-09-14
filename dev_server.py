#!/usr/bin/env python3
# Static dev server with caching disabled so edits show up on reload.
import http.server, sys, os
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control','no-store, must-revalidate'); self.send_header('Expires','0'); super().end_headers()
    def log_message(self,*a): pass
port=int(sys.argv[1]) if len(sys.argv)>1 else 8321
os.chdir(os.path.dirname(os.path.abspath(__file__)))
http.server.ThreadingHTTPServer(('127.0.0.1',port),H).serve_forever()
