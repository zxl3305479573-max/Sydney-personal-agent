#!/usr/bin/env python3
"""Offline unit tests for build_sideload_download_site.py."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import plistlib
import tempfile
import unittest
import urllib.parse
import zipfile
from pathlib import Path

_SCRIPT_PATH = Path(__file__).resolve().parent / "build_sideload_download_site.py"
_SPEC = importlib.util.spec_from_file_location("build_sideload_download_site", _SCRIPT_PATH)
assert _SPEC is not None and _SPEC.loader is not None
builder = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(builder)


def create_synthetic_ipa(
    target: Path,
    *,
    version: str = "1.0.19",
    build: str = "8",
    bundle_id: str = "xin.zxlup.sydney",
    with_extension: bool = True,
    ota_enabled: bool = True,
) -> bytes:
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        info = {
            "CFBundleIdentifier": bundle_id,
            "CFBundleDisplayName": "Sydney",
            "CFBundleShortVersionString": version,
            "CFBundleVersion": build,
            "MinimumOSVersion": "16.4",
            "NSCameraUsageDescription": "Camera for <photos> & bills",
            "NSMicrophoneUsageDescription": "Microphone for voice",
        }
        zf.writestr("Payload/Sydney.app/Info.plist", plistlib.dumps(info))
        zf.writestr(
            "Payload/Sydney.app/Expo.plist",
            plistlib.dumps(
                {
                    "EXUpdatesEnabled": ota_enabled,
                    "EXUpdatesRuntimeVersion": "sydney-ios-ip-1",
                }
            ),
        )
        if with_extension:
            ext_info = {
                "CFBundleIdentifier": f"{bundle_id}.companion",
                "CFBundleShortVersionString": version,
                "CFBundleVersion": build,
            }
            zf.writestr(
                "Payload/Sydney.app/PlugIns/SydneyCompanionWidget.appex/Info.plist",
                plistlib.dumps(ext_info),
            )
        zf.writestr("Payload/Sydney.app/main.jsbundle", b"console.log('sydney');")
    return target.read_bytes()


class BuildSideloadDownloadSiteTests(unittest.TestCase):
    def test_generates_source_direct_source_html_and_checksum(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            ipa = root / "raw.ipa"
            ipa_bytes = create_synthetic_ipa(ipa)
            expected_sha = hashlib.sha256(ipa_bytes).hexdigest()

            icon = root / "icon.png"
            icon.write_bytes(b"\x89PNG\r\n\x1a\nfake")

            ota_json = root / "sydney-release.json"
            ota_json.write_text(
                json.dumps(
                    {
                        "version": "1.0.47",
                        "releasedOn": "2026-11-28",
                        "notes": {"zh-CN": ["修复头像显示 <script>alert(1)</script>"]},
                    }
                ),
                encoding="utf-8",
            )

            out_dir = root / "site"
            base_url = "https://example.test/download/demo-token-123"
            direct_url = "https://192.0.2.10/download/demo-token-123"
            result = builder.generate_site(
                ipa_path=ipa,
                output_dir=out_dir,
                base_url=base_url,
                direct_base_url=direct_url,
                icon_path=icon,
                ota_release_path=ota_json,
                release_date="2026-11-28T01:45:00Z",
                version_notes="灵动岛与语音输出升级",
            )

            self.assertEqual(result["ipaFilename"], "Sydney-1.0.19-8-unsigned.ipa")
            self.assertTrue((out_dir / "Sydney-1.0.19-8-unsigned.ipa").is_file())
            self.assertEqual(
                (out_dir / "SHA256.txt").read_text(encoding="utf-8"),
                f"{expected_sha}  Sydney-1.0.19-8-unsigned.ipa\n",
            )

            source = json.loads((out_dir / "source.json").read_text(encoding="utf-8"))
            self.assertEqual(source["identifier"], "xin.zxlup.sydney.source")
            self.assertEqual(source["sourceURL"], f"{base_url}/source.json")
            self.assertEqual(source["iconURL"], f"{base_url}/icon.png")
            self.assertEqual(len(source["apps"]), 1)

            app = source["apps"][0]
            self.assertEqual(app["bundleIdentifier"], "xin.zxlup.sydney")
            self.assertEqual(app["appPermissions"]["entitlements"], [])
            self.assertEqual(
                app["appPermissions"]["privacy"]["NSCameraUsageDescription"],
                "Camera for <photos> & bills",
            )
            ver = app["versions"][0]
            self.assertEqual(ver["version"], "1.0.19")
            self.assertEqual(ver["buildVersion"], "8")
            self.assertEqual(ver["size"], len(ipa_bytes))
            self.assertEqual(ver["sha256"], expected_sha)
            self.assertEqual(ver["minOSVersion"], "16.4")
            self.assertEqual(
                ver["downloadURL"],
                f"{base_url}/Sydney-1.0.19-8-unsigned.ipa",
            )

            direct_source = json.loads(
                (out_dir / "source-direct.json").read_text(encoding="utf-8")
            )
            self.assertEqual(
                direct_source["sourceURL"], f"{direct_url}/source-direct.json"
            )
            self.assertEqual(
                direct_source["apps"][0]["versions"][0]["downloadURL"],
                f"{direct_url}/Sydney-1.0.19-8-unsigned.ipa",
            )

            html_text = (out_dir / "index.html").read_text(encoding="utf-8")
            expected_sidestore = (
                "sidestore://source?url="
                + urllib.parse.quote(f"{base_url}/source.json", safe="")
            )
            expected_altstore = (
                "altstore://source?url="
                + urllib.parse.quote(f"{base_url}/source.json", safe="")
            )
            self.assertIn(expected_sidestore, html_text)
            self.assertIn(expected_altstore, html_text)
            self.assertIn("./Sydney-1.0.19-8-unsigned.ipa", html_text)
            self.assertIn(expected_sha, html_text)
            self.assertIn("最新热更 OTA v1.0.47", html_text)
            self.assertIn("共占 2 个免费 Apple ID 名额", html_text)
            self.assertNotIn("<script>alert(1)</script>", html_text)
            self.assertIn("&lt;script&gt;alert(1)&lt;/script&gt;", html_text)
            self.assertIn('name="referrer" content="no-referrer"', html_text)
            self.assertIn('name="robots" content="noindex, nofollow"', html_text)

    def test_preserves_and_deduplicates_previous_versions(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            ipa = root / "new.ipa"
            create_synthetic_ipa(ipa, version="1.0.20", build="9", with_extension=False)

            prev = root / "prev-source.json"
            prev.write_text(
                json.dumps(
                    {
                        "apps": [
                            {
                                "bundleIdentifier": "xin.zxlup.sydney",
                                "versions": [
                                    {
                                        "version": "1.0.20",
                                        "buildVersion": "9",
                                        "downloadURL": "https://example.test/old-dup.ipa",
                                    },
                                    {
                                        "version": "1.0.19",
                                        "buildVersion": "8",
                                        "downloadURL": "https://example.test/old-19.ipa",
                                    },
                                ],
                            }
                        ]
                    }
                ),
                encoding="utf-8",
            )

            out_dir = root / "site"
            builder.generate_site(
                ipa_path=ipa,
                output_dir=out_dir,
                base_url="https://example.test/download/t1",
                previous_source_path=prev,
            )
            source = json.loads((out_dir / "source.json").read_text(encoding="utf-8"))
            versions = source["apps"][0]["versions"]
            self.assertEqual(
                [(v["version"], v["buildVersion"]) for v in versions],
                [("1.0.20", "9"), ("1.0.19", "8")],
            )
            self.assertEqual(
                versions[0]["downloadURL"],
                "https://example.test/download/t1/Sydney-1.0.20-9-unsigned.ipa",
            )
            html_text = (out_dir / "index.html").read_text(encoding="utf-8")
            self.assertIn("仅占 1 个免费 Apple ID 名额", html_text)

    def test_rejects_non_https_base_url_and_invalid_ipa(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            ipa = root / "valid.ipa"
            create_synthetic_ipa(ipa)
            with self.assertRaises(ValueError):
                builder.generate_site(
                    ipa_path=ipa,
                    output_dir=root / "out1",
                    base_url="http://example.test/download/tok",
                )
            with self.assertRaises(ValueError):
                builder.generate_site(
                    ipa_path=ipa,
                    output_dir=root / "out2",
                    base_url="https://example.test/download/tok?x=1",
                )

            broken_ipa = root / "broken.ipa"
            with zipfile.ZipFile(broken_ipa, "w") as zf:
                zf.writestr("README.txt", "not an ipa")
            with self.assertRaises(ValueError):
                builder.inspect_ipa(broken_ipa)


if __name__ == "__main__":
    unittest.main()
