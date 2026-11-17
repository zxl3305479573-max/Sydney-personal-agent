import json
from pathlib import Path
import plistlib
import tempfile
import unittest
import zipfile

from iphone_renewal_metadata_readonly import compare_versions, read_records, summarize


class RenewalMetadataTests(unittest.TestCase):
    def test_versions_require_nonempty_strings(self):
        self.assertEqual(
            compare_versions(
                {"CFBundleVersion": "1", "CFBundleShortVersionString": "2"},
                {"CFBundleVersion": "1", "CFBundleShortVersionString": "3"},
            ),
            {"CFBundleVersion": "match", "CFBundleShortVersionString": "different"},
        )
        self.assertEqual(compare_versions({}, {})["CFBundleVersion"], "unavailable")
        self.assertEqual(compare_versions({"CFBundleVersion": 1}, {"CFBundleVersion": "1"})["CFBundleVersion"], "unavailable")

    def test_matching_record_compares_metadata_without_exposing_identity(self):
        with tempfile.TemporaryDirectory() as directory:
            ipa = Path(directory) / "private.ipa"
            with zipfile.ZipFile(ipa, "w") as archive:
                archive.writestr(
                    "Payload/Synthetic.app/Info.plist",
                    plistlib.dumps({"CFBundleVersion": "1", "CFBundleShortVersionString": "2"}),
                )
            apps = {
                "org.synthetic.sydney": {
                    "CFBundleVersion": "1",
                    "CFBundleShortVersionString": "2",
                }
            }
            records = [{"bundle_id": "org.synthetic.sydney", "udid": "private-device", "source_ipa": str(ipa)}]
            result = summarize(apps, records, lambda value: value == "private-device")
            self.assertEqual(result["status"], "ok")
            self.assertEqual(result["versions"]["CFBundleVersion"], "match")
            self.assertNotIn("private", json.dumps(result))
            self.assertNotIn("synthetic", json.dumps(result))
            self.assertEqual(summarize(apps, records, lambda _: False)["status"], "unexpected_record_count")
            self.assertEqual(summarize(apps, records * 2, lambda _: True)["status"], "unexpected_record_count")

    def test_rejects_ambiguous_manifest_and_bad_records(self):
        with tempfile.TemporaryDirectory() as directory:
            ipa = Path(directory) / "source.ipa"
            with zipfile.ZipFile(ipa, "w") as archive:
                for name in ("One", "Two"):
                    archive.writestr(f"Payload/{name}.app/Info.plist", plistlib.dumps({}))
            apps = {"org.sydney": {}}
            records = [{"bundle_id": "org.sydney", "udid": "device", "source_ipa": str(ipa)}]
            self.assertEqual(summarize(apps, records, lambda _: True)["status"], "source_unavailable")
            record_file = Path(directory) / "records.json"
            record_file.write_text("[]", encoding="utf-8")
            with self.assertRaises(ValueError):
                read_records(record_file)


if __name__ == "__main__":
    unittest.main()
