import unittest
import tempfile
import argparse
import io
import plistlib
from contextlib import redirect_stderr, redirect_stdout
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import NameOID
import requests

from iphone_signing_policy import (
    DeveloperRequestPolicy,
    PolicyDenied,
    check_transport,
    guarded_process,
    reuse_certificate,
)
from ipaside_engine import __main__ as entrypoint
from ipaside_engine import developer, provision, sideload, signing


class DeveloperPolicyTests(unittest.TestCase):
    def setUp(self):
        self.calls = []

        def request(endpoint, params=None, team_id=None):
            self.calls.append((endpoint, params, team_id))
            if endpoint == "ios/listAppIds.action":
                return {
                    "appIds": [
                        {"identifier": "org.synthetic.runner", "appIdId": "runner-id"},
                        {"identifier": "org.synthetic.sydney", "appIdId": "sydney-id"},
                    ]
                }
            if endpoint == "ios/addAppId.action":
                return {"appId": {"identifier": params["identifier"], "appIdId": "new-id"}}
            return {}

        self.policy = DeveloperRequestPolicy(
            request, "synthetic-team", "org.synthetic.runner", {"org.synthetic.sydney"}
        )

    def test_refuses_protected_target_or_missing_inventory(self):
        for protected in (
            set(), {"org.synthetic.runner"}, {"ORG.SYNTHETIC.RUNNER"}, {"org.synthetic.sydney", ""}
        ):
            with self.subTest(protected=protected), self.assertRaises(ValueError):
                DeveloperRequestPolicy(lambda *_args, **_kwargs: {}, "team", "org.synthetic.runner", protected)

    def test_permitted_list_and_verified_target_profile(self):
        self.policy("listTeams.action")
        self.policy("ios/listAppIds.action", team_id="synthetic-team")
        self.policy(
            "ios/downloadTeamProvisioningProfile.action",
            {"appIdId": "runner-id"},
            team_id="synthetic-team",
        )
        self.assertEqual(len(self.calls), 3)

    def test_new_target_id_must_come_from_matching_response(self):
        self.policy(
            "ios/addAppId.action",
            {"identifier": "org.synthetic.runner", "name": "Synthetic"},
            team_id="synthetic-team",
        )
        self.policy(
            "ios/downloadTeamProvisioningProfile.action",
            {"appIdId": "new-id"},
            team_id="synthetic-team",
        )
        self.assertEqual(len(self.calls), 2)

    def test_denies_revoke_issue_delete_unknown_and_cross_target(self):
        self.policy("ios/listAppIds.action", team_id="synthetic-team")
        denied = (
            ("ios/revokeDevelopmentCert.action", None, "synthetic-team"),
            ("ios/submitDevelopmentCSR.action", None, "synthetic-team"),
            ("ios/deleteAppId.action", None, "synthetic-team"),
            ("ios/updateAppId.action", None, "synthetic-team"),
            ("ios/addDevice.action", None, "synthetic-team"),
            ("ios/unknown.action", None, "synthetic-team"),
            ("ios/listDevices.action", None, "other-team"),
            ("ios/listDevices.action", {"unexpected": 1}, "synthetic-team"),
            ("ios/addAppId.action", {"identifier": "org.synthetic.sydney", "name": "x"}, "synthetic-team"),
            ("ios/downloadTeamProvisioningProfile.action", {"appIdId": "sydney-id"}, "synthetic-team"),
            ("ios/downloadTeamProvisioningProfile.action", {"appIdId": []}, "synthetic-team"),
        )
        for endpoint, params, team in denied:
            with self.subTest(endpoint=endpoint), self.assertRaises(PolicyDenied):
                self.policy(endpoint, params, team)
        self.assertEqual(len(self.calls), 1)

    def test_profile_request_denied_without_prior_target_discovery(self):
        with self.assertRaises(PolicyDenied):
            self.policy(
                "ios/downloadTeamProvisioningProfile.action",
                {"appIdId": "runner-id"},
                team_id="synthetic-team",
            )
        self.assertEqual(self.calls, [])

    def test_installed_developer_functions_use_policy_when_explicitly_patched(self):
        with patch.object(developer, "_request", self.policy):
            self.assertEqual(len(developer.list_app_ids("synthetic-team")), 2)
            with self.assertRaises(PolicyDenied):
                developer.revoke_certificate("synthetic-team", "synthetic-serial")
            with self.assertRaises(PolicyDenied):
                developer.submit_csr("synthetic-team", "synthetic-csr")
            with self.assertRaises(PolicyDenied):
                developer.delete_app_id("synthetic-team", "runner-id")
        self.assertEqual(len(self.calls), 1)

    def test_transport_checks_host_envelope_team_and_action(self):
        def prepared(endpoint, *, host="developerservices2.apple.com", team="synthetic-team", extra=None):
            body = {"clientId": "XABBG36SBA", "protocolVersion": "QH65B2", "requestId": "synthetic"}
            if team is not None:
                body["teamId"] = team
            if extra:
                body.update(extra)
            return requests.Request(
                "POST",
                f"https://{host}/services/QH65B2/{endpoint}?clientId=XABBG36SBA",
                data=plistlib.dumps(body),
            ).prepare()

        safe = prepared("ios/listDevices.action")
        check_transport(self.policy, safe, {"verify": True, "proxies": {}})
        check_transport(self.policy, safe, {"verify": True, "proxies": {"no": "localhost"}})
        denied = (
            (prepared("ios/revokeDevelopmentCert.action"), {"verify": True}),
            (prepared("ios/listDevices.action", host="other.invalid"), {"verify": True}),
            (prepared("ios/listDevices.action", team="other"), {"verify": True}),
            (prepared("ios/listDevices.action", extra={"unexpected": 1}), {"verify": True}),
            (safe, {"verify": False}),
            (safe, {"verify": True, "proxies": {"https": "http://127.0.0.1:1234"}}),
        )
        for request, options in denied:
            with self.subTest(url=request.url), self.assertRaises(PolicyDenied):
                check_transport(self.policy, request, options)


class CertificateReuseTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime.now(timezone.utc)
        key = ec.generate_private_key(ec.SECP256R1())
        other = ec.generate_private_key(ec.SECP256R1())
        name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Synthetic")])
        self.cert = (
            x509.CertificateBuilder()
            .subject_name(name)
            .issuer_name(name)
            .public_key(key.public_key())
            .serial_number(10)
            .not_valid_before(self.now - timedelta(days=1))
            .not_valid_after(self.now + timedelta(days=1))
            .sign(key, hashes.SHA256())
            .public_bytes(serialization.Encoding.DER)
        )
        self.key = self.serialize(key)
        self.other_key = self.serialize(other)
        self.server = [{"serialNumber": "synthetic-serial", "certContent": self.cert}]

    @staticmethod
    def serialize(key):
        return key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )

    def test_matching_cache_and_server_identity(self):
        result = reuse_certificate(self.key, self.cert, "synthetic-serial", self.server, self.now)
        self.assertEqual(result, (self.key, self.cert, "synthetic-serial"))

    def test_invalid_mismatched_expired_or_ambiguous_identity_denied(self):
        cases = (
            (b"", self.cert, "synthetic-serial", self.server, self.now),
            (self.other_key, self.cert, "synthetic-serial", self.server, self.now),
            (self.key, self.cert, "wrong", self.server, self.now),
            (self.key, self.cert, "synthetic-serial", [{"serialNumber": "synthetic-serial"}], self.now),
            (self.key, self.cert, "synthetic-serial", self.server * 2, self.now),
            (self.key, self.cert, "synthetic-serial", self.server, self.now + timedelta(days=2)),
            (self.key, self.cert, "synthetic-serial", self.server, self.now.replace(tzinfo=None)),
        )
        for case in cases:
            with self.subTest(case=cases.index(case)), self.assertRaises(PolicyDenied):
                reuse_certificate(*case)

    def test_process_guard_reuses_identity_rejects_mutation_and_restores_functions(self):
        with tempfile.TemporaryDirectory() as temporary:
            protected = Path(temporary) / "protected"
            isolated = Path(temporary) / "isolated"
            protected.mkdir()
            isolated.mkdir()
            (protected / "profile.mobileprovision").write_bytes(b"synthetic-original")
            calls = []

            def request(endpoint, params=None, team_id=None):
                calls.append(endpoint)
                return {"certificates": self.server}

            original_identity = provision._ensure_certificate
            original_assets = provision.ensure_signing_assets
            original_dir = provision.paths.signing_dir
            original_revoke = developer.revoke_certificate
            with patch.object(developer, "_request", request):
                with self.assertRaisesRegex(RuntimeError, "synthetic exit"):
                    with guarded_process(
                        developer,
                        provision,
                        signing,
                        sideload.apps,
                        team_id="synthetic-team",
                        target_bundle_id="org.synthetic.runner",
                        allowed_device_id="synthetic-device",
                        protected_bundle_ids={"org.synthetic.sydney"},
                        protected_directory=protected,
                        isolated_directory=isolated,
                        key_pem=self.key,
                        certificate_der=self.cert,
                        serial="synthetic-serial",
                        now_provider=lambda: self.now,
                        verify_package=lambda _path, _bundle: True,
                    ):
                        result = provision._ensure_certificate("synthetic-team", None)
                        self.assertEqual(result, (self.key, self.cert, "synthetic-serial"))
                        self.assertEqual(provision.paths.signing_dir(), isolated.resolve())
                        with self.assertRaises(PolicyDenied):
                            developer.revoke_certificate("synthetic-team", "synthetic-serial")
                        with self.assertRaises(PolicyDenied):
                            developer._request("ios/revokeDevelopmentCert.action", team_id="synthetic-team")
                        with self.assertRaises(PolicyDenied):
                            provision._ensure_certificate("other-team", None)
                        for bundle, device, args, kwargs in (
                            ("org.synthetic.sydney", "synthetic-device", (), {}),
                            ("org.synthetic.runner", "other-device", (), {}),
                            ("org.synthetic.runner", "synthetic-device", (), {"app_groups": ["group.synthetic"]}),
                            ("org.synthetic.runner", "synthetic-device", ("positional",), {}),
                        ):
                            with self.assertRaises(PolicyDenied):
                                provision.ensure_signing_assets(bundle, device, *args, **kwargs)
                        raise RuntimeError("synthetic exit")
                self.assertIs(developer._request, request)
            self.assertIs(provision._ensure_certificate, original_identity)
            self.assertIs(provision.ensure_signing_assets, original_assets)
            self.assertIs(provision.paths.signing_dir, original_dir)
            self.assertIs(developer.revoke_certificate, original_revoke)
            self.assertEqual(calls, ["ios/listAllDevelopmentCerts.action"])
            self.assertEqual((protected / "profile.mobileprovision").read_bytes(), b"synthetic-original")

    def test_process_guard_rejects_overlapping_or_nonempty_directories(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            protected = root / "protected"
            protected.mkdir()
            nested = protected / "nested"
            nested.mkdir()
            isolated = root / "isolated"
            isolated.mkdir()
            (isolated / "unexpected").write_bytes(b"synthetic")
            for candidate in (protected, nested, isolated):
                with self.subTest(candidate=candidate.name), self.assertRaises(PolicyDenied):
                    with guarded_process(
                        developer,
                        provision,
                        signing,
                        sideload.apps,
                        team_id="synthetic-team",
                        target_bundle_id="org.synthetic.runner",
                        allowed_device_id="synthetic-device",
                        protected_bundle_ids={"org.synthetic.sydney"},
                        protected_directory=protected,
                        isolated_directory=candidate,
                        key_pem=self.key,
                        certificate_der=self.cert,
                        serial="synthetic-serial",
                        now_provider=lambda: self.now,
                        verify_package=lambda _path, _bundle: True,
                    ):
                        self.fail("guard must not start")

    def test_process_transport_intercepts_direct_requests_calls(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            protected, isolated = root / "protected", root / "isolated"
            protected.mkdir()
            isolated.mkdir()
            calls = []

            def fake_send(_session, request, **_kwargs):
                calls.append(request.url)
                return "synthetic-response"

            body = plistlib.dumps(
                {
                    "clientId": "XABBG36SBA",
                    "protocolVersion": "QH65B2",
                    "requestId": "synthetic",
                    "teamId": "synthetic-team",
                }
            )

            def prepared(endpoint):
                return requests.Request(
                    "POST",
                    "https://developerservices2.apple.com/services/QH65B2/"
                    + endpoint
                    + "?clientId=XABBG36SBA",
                    data=body,
                ).prepare()

            with (
                patch.object(developer, "_request", return_value={}),
                patch.object(requests.Session, "send", fake_send),
                guarded_process(
                    developer,
                    provision,
                    signing,
                    sideload.apps,
                    team_id="synthetic-team",
                    target_bundle_id="org.synthetic.runner",
                    allowed_device_id="synthetic-device",
                    protected_bundle_ids={"org.synthetic.sydney"},
                    protected_directory=protected,
                    isolated_directory=isolated,
                    key_pem=self.key,
                    certificate_der=self.cert,
                    serial="synthetic-serial",
                    now_provider=lambda: self.now,
                    verify_package=lambda _path, _bundle: True,
                ),
            ):
                session = requests.Session()
                self.assertEqual(
                    session.send(prepared("ios/listDevices.action"), verify=True, proxies={}),
                    "synthetic-response",
                )
                with self.assertRaises(PolicyDenied):
                    session.send(prepared("ios/revokeDevelopmentCert.action"), verify=True, proxies={})
                self.assertEqual(len(calls), 1)

    def test_real_developer_request_passes_transport_guard_with_fake_response(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            protected, isolated = root / "protected", root / "isolated"
            protected.mkdir()
            isolated.mkdir()
            calls = []

            def fake_send(_session, request, **_kwargs):
                calls.append(request.url)
                response = requests.Response()
                response.status_code = 200
                response._content = plistlib.dumps({"resultCode": 0, "certificates": self.server})
                response.url = request.url
                response.request = request
                return response

            with (
                patch.object(requests.Session, "send", fake_send),
                patch.object(
                    requests.Session,
                    "merge_environment_settings",
                    return_value={"proxies": {}, "stream": False, "verify": True, "cert": None},
                ),
                patch.object(
                    developer.gsa, "load_session", return_value={"adsid": "synthetic", "auth_token": "synthetic"}
                ),
                patch.object(developer.anisette, "get_headers", return_value={}),
                patch.object(developer.tls, "ca_bundle", return_value="synthetic-ca"),
                guarded_process(
                    developer,
                    provision,
                    signing,
                    sideload.apps,
                    team_id="synthetic-team",
                    target_bundle_id="org.synthetic.runner",
                    allowed_device_id="synthetic-device",
                    protected_bundle_ids={"org.synthetic.sydney"},
                    protected_directory=protected,
                    isolated_directory=isolated,
                    key_pem=self.key,
                    certificate_der=self.cert,
                    serial="synthetic-serial",
                    now_provider=lambda: self.now,
                    verify_package=lambda _path, _bundle: True,
                ),
            ):
                result = developer.list_certificates("synthetic-team")
                self.assertEqual(result, self.server)
                self.assertEqual(len(calls), 1)

    def test_process_guard_runs_actual_asset_preparation_with_fake_services(self):
        with tempfile.TemporaryDirectory() as temporary:
            protected = Path(temporary) / "protected"
            isolated = Path(temporary) / "isolated"
            protected.mkdir()
            isolated.mkdir()
            (protected / "profile.mobileprovision").write_bytes(b"synthetic-original")
            calls = []

            def request(endpoint, params=None, team_id=None):
                calls.append(endpoint)
                responses = {
                    "listTeams.action": {"teams": [{"teamId": "synthetic-team"}]},
                    "ios/listAllDevelopmentCerts.action": {"certificates": self.server},
                    "ios/listDevices.action": {"devices": [{"deviceNumber": "synthetic-device"}]},
                    "ios/listAppIds.action": {
                        "appIds": [{"identifier": "org.synthetic.runner", "appIdId": "runner-id"}]
                    },
                    "ios/downloadTeamProvisioningProfile.action": {
                        "provisioningProfile": {"encodedProfile": b"synthetic-profile"}
                    },
                }
                if endpoint not in responses:
                    self.fail("unexpected synthetic endpoint")
                return responses[endpoint]

            with (
                patch.object(developer, "_request", request),
                patch.object(provision.gsa, "load_session", return_value={}),
                patch.object(signing, "build_p12", return_value=b"synthetic-identity"),
                guarded_process(
                    developer,
                    provision,
                    signing,
                    sideload.apps,
                    team_id="synthetic-team",
                    target_bundle_id="org.synthetic.runner",
                    allowed_device_id="synthetic-device",
                    protected_bundle_ids={"org.synthetic.sydney"},
                    protected_directory=protected,
                    isolated_directory=isolated,
                    key_pem=self.key,
                    certificate_der=self.cert,
                    serial="synthetic-serial",
                    now_provider=lambda: self.now,
                    verify_package=lambda _path, _bundle: True,
                ),
            ):
                provision.ensure_signing_assets("org.synthetic.runner", "synthetic-device")
            self.assertEqual(
                calls,
                [
                    "listTeams.action",
                    "ios/listAllDevelopmentCerts.action",
                    "ios/listDevices.action",
                    "ios/listAppIds.action",
                    "ios/downloadTeamProvisioningProfile.action",
                ],
            )
            self.assertEqual((protected / "profile.mobileprovision").read_bytes(), b"synthetic-original")
            self.assertEqual((isolated / "profile.mobileprovision").read_bytes(), b"synthetic-profile")
            self.assertEqual((isolated / "identity.p12").read_bytes(), b"synthetic-identity")

    def test_process_guard_stale_certificate_stops_before_device_or_file_writes(self):
        with tempfile.TemporaryDirectory() as temporary:
            protected = Path(temporary) / "protected"
            isolated = Path(temporary) / "isolated"
            protected.mkdir()
            isolated.mkdir()
            calls = []

            def request(endpoint, params=None, team_id=None):
                calls.append(endpoint)
                if endpoint == "listTeams.action":
                    return {"teams": [{"teamId": "synthetic-team"}]}
                if endpoint == "ios/listAllDevelopmentCerts.action":
                    return {"certificates": []}
                self.fail("unexpected synthetic endpoint")

            with (
                patch.object(developer, "_request", request),
                patch.object(provision.gsa, "load_session", return_value={}),
                guarded_process(
                    developer,
                    provision,
                    signing,
                    sideload.apps,
                    team_id="synthetic-team",
                    target_bundle_id="org.synthetic.runner",
                    allowed_device_id="synthetic-device",
                    protected_bundle_ids={"org.synthetic.sydney"},
                    protected_directory=protected,
                    isolated_directory=isolated,
                    key_pem=self.key,
                    certificate_der=self.cert,
                    serial="synthetic-serial",
                    now_provider=lambda: self.now,
                    verify_package=lambda _path, _bundle: True,
                ),
            ):
                with self.assertRaises(PolicyDenied):
                    provision.ensure_signing_assets("org.synthetic.runner", "synthetic-device")
            self.assertEqual(calls, ["listTeams.action", "ios/listAllDevelopmentCerts.action"])
            self.assertEqual(list(isolated.iterdir()), [])

    def test_guard_integrates_with_sideload_entrypoint_using_synthetic_services(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            protected, isolated, scratch = root / "protected", root / "isolated", root / "scratch"
            for directory in (protected, isolated, scratch):
                directory.mkdir()
            (protected / "profile.mobileprovision").write_bytes(b"synthetic-original")
            responses = {
                "listTeams.action": {"teams": [{"teamId": "synthetic-team"}]},
                "ios/listAllDevelopmentCerts.action": {"certificates": self.server},
                "ios/listDevices.action": {"devices": [{"deviceNumber": "synthetic-device"}]},
                "ios/listAppIds.action": {
                    "appIds": [{"identifier": "org.synthetic.runner", "appIdId": "runner-id"}]
                },
                "ios/downloadTeamProvisioningProfile.action": {
                    "provisioningProfile": {"encodedProfile": b"synthetic-profile"}
                },
            }
            calls = []

            def request(endpoint, params=None, team_id=None):
                calls.append(endpoint)
                return responses[endpoint]

            arguments = argparse.Namespace(
                ipa="synthetic.ipa",
                udid="synthetic-device",
                bundle_id="org.synthetic.runner",
                allow_other_platform=True,
                name=None,
                set_version=None,
                dylib=None,
                weak_dylibs=False,
                inject_extensions=False,
                remove_extensions=False,
                remove_device_restrictions=False,
                enable_file_sharing=False,
                keep_signed=False,
                signed_dir=None,
                json=True,
            )
            with (
                redirect_stdout(io.StringIO()),
                redirect_stderr(io.StringIO()),
                patch.object(developer, "_request", request),
                patch.object(provision.gsa, "load_session", return_value={}),
                patch.object(sideload, "resolve_udid", return_value="synthetic-device"),
                patch.object(sideload, "_device_values", return_value={}),
                patch.object(sideload.ipa_module, "inspect", return_value={"bundle_id": "org.synthetic.runner"}),
                patch.object(sideload.ipa_module, "deepest_entry", return_value=0),
                patch.object(sideload, "_open_signed_dir", return_value=(root, scratch)),
                patch.object(sideload, "_deliver_pairing_if_needed", return_value=None),
                patch.object(sideload.refresh, "profile_expiration", return_value=None),
                patch.object(sideload.refresh, "record") as record,
                patch.object(sideload.apps, "install") as install,
                patch.object(signing, "build_p12", return_value=b"synthetic-identity"),
                patch.object(
                    signing,
                    "sign_ipa",
                    side_effect=lambda _source, output, **_kwargs: Path(output).write_bytes(b"synthetic-ipa"),
                ) as sign,
                guarded_process(
                    developer,
                    provision,
                    signing,
                    sideload.apps,
                    team_id="synthetic-team",
                    target_bundle_id="org.synthetic.runner",
                    allowed_device_id="synthetic-device",
                    protected_bundle_ids={"org.synthetic.sydney"},
                    protected_directory=protected,
                    isolated_directory=isolated,
                    key_pem=self.key,
                    certificate_der=self.cert,
                    serial="synthetic-serial",
                    now_provider=lambda: self.now,
                    verify_package=lambda path, bundle: (
                        path.read_bytes() == b"synthetic-ipa" and bundle == "org.synthetic.runner"
                    ),
                ),
            ):
                self.assertEqual(entrypoint._cmd_sideload(arguments), 0)
                sign.assert_called_once()
                install.assert_called_once()
                record.assert_called_once()
                self.assertFalse(sign.call_args.kwargs["remove_extensions"])
                with self.assertRaises(PolicyDenied):
                    sideload.apps.install(root / "synthetic_Signed.ipa", "synthetic-device")
                install.assert_called_once()
            self.assertEqual((protected / "profile.mobileprovision").read_bytes(), b"synthetic-original")
            self.assertEqual((isolated / "profile.mobileprovision").read_bytes(), b"synthetic-profile")
            self.assertNotIn("ios/revokeDevelopmentCert.action", calls)

    def test_install_guard_requires_prepared_assets_device_verification_and_no_retry(self):
        for mode in ("device", "verify_false", "verify_exception", "install_throws"):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                protected, isolated = root / "protected", root / "isolated"
                protected.mkdir()
                isolated.mkdir()
                ipa = root / "synthetic.ipa"
                ipa.write_bytes(b"synthetic")

                def verify(_path, _bundle):
                    if mode == "verify_exception":
                        raise RuntimeError("synthetic")
                    return mode != "verify_false"

                def fail_install(*_args, **_kwargs):
                    raise RuntimeError("synthetic install failure")

                with (
                    patch.object(developer, "_request", return_value={}),
                    patch.object(provision, "ensure_signing_assets", return_value={}),
                    patch.object(
                        sideload.apps,
                        "install",
                        side_effect=fail_install if mode == "install_throws" else None,
                    ) as install,
                    guarded_process(
                        developer,
                        provision,
                        signing,
                        sideload.apps,
                        team_id="synthetic-team",
                        target_bundle_id="org.synthetic.runner",
                        allowed_device_id="synthetic-device",
                        protected_bundle_ids={"org.synthetic.sydney"},
                        protected_directory=protected,
                        isolated_directory=isolated,
                        key_pem=self.key,
                        certificate_der=self.cert,
                        serial="synthetic-serial",
                        now_provider=lambda: self.now,
                        verify_package=verify,
                    ),
                ):
                    with self.assertRaises(PolicyDenied):
                        sideload.apps.install(ipa, "synthetic-device")
                    provision.ensure_signing_assets("org.synthetic.runner", "synthetic-device")
                    selected = "other-device" if mode == "device" else "synthetic-device"
                    expected_error = RuntimeError if mode == "install_throws" else PolicyDenied
                    with self.assertRaises(expected_error):
                        sideload.apps.install(ipa, selected)
                    if mode == "install_throws":
                        with self.assertRaises(PolicyDenied):
                            sideload.apps.install(ipa, "synthetic-device")
                        install.assert_called_once()
                    else:
                        install.assert_not_called()


if __name__ == "__main__":
    unittest.main()
