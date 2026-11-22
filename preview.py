import http.server
import mimetypes
import socketserver
mimetypes.add_type('text/javascript', '.mjs')
mimetypes.add_type('text/javascript', '.js')
with socketserver.TCPServer(('127.0.0.1', 8767), http.server.SimpleHTTPRequestHandler) as server:
    server.serve_forever()
