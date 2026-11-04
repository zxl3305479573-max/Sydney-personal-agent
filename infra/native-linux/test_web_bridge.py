import os
from pathlib import Path
import socket
import socketserver
import subprocess
import tempfile
import threading
import time
import unittest


class Echo(socketserver.BaseRequestHandler):
    def handle(self):
        while data := self.request.recv(65536):
            self.request.sendall(data)


class WebBridgeTest(unittest.TestCase):
    def test_bidirectional_forwarding(self):
        bridge = Path(__file__).with_name("web_bridge.py")
        with tempfile.TemporaryDirectory(prefix="sydney-bridge-") as directory:
            runtime = Path(directory)
            node = runtime / "fake-node"
            node.write_text(
                "#!/usr/bin/python3\n"
                "import socketserver\n"
                "class Echo(socketserver.BaseRequestHandler):\n"
                " def handle(self):\n"
                "  while data := self.request.recv(65536): self.request.sendall(data)\n"
                "socketserver.ThreadingTCPServer.allow_reuse_address = True\n"
                "socketserver.ThreadingTCPServer(('127.0.0.1', 5174), Echo).serve_forever()\n",
                encoding="utf-8",
            )
            node.chmod(0o700)
            upstreams = []
            for name in ("api.sock", "screen.sock"):
                server = socketserver.ThreadingUnixStreamServer(str(runtime / name), Echo)
                threading.Thread(target=server.serve_forever, daemon=True).start()
                upstreams.append(server)
            env = os.environ | {
                "SYDNEY_WEB_RUNTIME_DIR": directory,
                "SYDNEY_WEB_APP_DIR": directory,
                "SYDNEY_WEB_NODE": str(node),
            }
            process = subprocess.Popen(
                ["/usr/bin/python3", str(bridge)],
                env=env,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                start_new_session=True,
            )
            try:
                deadline = time.monotonic() + 10
                while not (runtime / "web.sock").exists() and time.monotonic() < deadline:
                    if process.poll() is not None:
                        self.fail(process.stderr.read().decode())
                    time.sleep(0.05)
                while True:
                    try:
                        with socket.create_connection(("127.0.0.1", 5174), timeout=1):
                            break
                    except OSError:
                        if time.monotonic() >= deadline:
                            raise
                        time.sleep(0.05)
                for address, family in (
                    (("127.0.0.1", 3100), socket.AF_INET),
                    (("127.0.0.1", 16080), socket.AF_INET),
                    (str(runtime / "web.sock"), socket.AF_UNIX),
                ):
                    deadline = time.monotonic() + 10
                    while True:
                        try:
                            with socket.socket(family) as client:
                                client.settimeout(2)
                                client.connect(address)
                                client.sendall(b"test-bridge")
                                self.assertEqual(client.recv(64), b"test-bridge")
                            break
                        except (ConnectionError, OSError):
                            if time.monotonic() >= deadline:
                                raise
                            time.sleep(0.05)
                self.assertEqual((runtime / "web.sock").stat().st_mode & 0o777, 0o600)
            finally:
                os.killpg(process.pid, 15)
                process.wait(timeout=5)
                if process.stderr:
                    process.stderr.close()
                for server in upstreams:
                    server.shutdown()
                    server.server_close()


if __name__ == "__main__":
    unittest.main()
