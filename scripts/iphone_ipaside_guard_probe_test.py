import base64
import json
import socket
import subprocess
import unittest

import iphone_ipaside_guard_probe as probe


class GuardProbeTests(unittest.TestCase):
    def test_synthetic_request_allows_only_certificates_list(self):
        attempts = []
        request = probe.synthetic_request([{"serialNumber": "example"}], attempts)
        self.assertEqual(
            request(probe.CERTIFICATES_ENDPOINT),
            {"certificates": [{"serialNumber": "example"}]},
        )
        for endpoint in (
            "ios/revokeDevelopmentCert.action",
            "ios/submitDevelopmentCSR.action",
            "ios/addAppId.action",
            "unknown.action",
        ):
            with self.subTest(endpoint=endpoint), self.assertRaises(probe.GuardDenied):
                request(endpoint)
        self.assertEqual(len(attempts), 5)

    def test_synthetic_cache_never_requires_a_real_path(self):
        cache = probe.SyntheticCache(probe.synthetic_cache())
        self.assertIs(cache / "ignored", cache)
        self.assertTrue(cache.exists())
        content = json.loads(cache.read_text(encoding="utf-8"))
        self.assertEqual(base64.b64decode(content["key_pem"]), probe.SYNTHETIC_KEY)
        self.assertFalse(probe.SyntheticCache(None).exists())
        with self.assertRaises(RuntimeError):
            probe.SyntheticCache(None).read_text(encoding="utf-8")

    def test_offline_process_rejects_network_and_subprocess(self):
        with probe.offline_process():
            with self.assertRaises(probe.GuardDenied):
                socket.create_connection(("127.0.0.1", 1))
            with socket.socket() as synthetic_socket:
                with self.assertRaises(probe.GuardDenied):
                    synthetic_socket.connect(("127.0.0.1", 1))
            with self.assertRaises(probe.GuardDenied):
                socket.getaddrinfo("localhost", 1)
            with self.assertRaises(probe.GuardDenied):
                subprocess.Popen(["not-executed"])

    def test_process_guard_is_restored_after_error(self):
        original_connection = socket.create_connection
        with self.assertRaisesRegex(RuntimeError, "synthetic"):
            with probe.offline_process():
                raise RuntimeError("synthetic")
        self.assertIs(socket.create_connection, original_connection)


if __name__ == "__main__":
    unittest.main()
