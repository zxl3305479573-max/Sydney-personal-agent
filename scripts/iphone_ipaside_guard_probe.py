import argparse
import base64
from contextlib import ExitStack, contextmanager, redirect_stderr, redirect_stdout
import io
import json
import os
import socket
import subprocess
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch


CERTIFICATES_ENDPOINT = "ios/listAllDevelopmentCerts.action"
SYNTHETIC_SERIAL = "synthetic-certificate"
SYNTHETIC_KEY = b"synthetic-key"
SYNTHETIC_CERTIFICATE = b"synthetic-certificate"


class GuardDenied(RuntimeError):
    pass


def deny_io(*_args, **_kwargs):
    raise GuardDenied("offline experiment denied I/O")


@contextmanager
def offline_process():
    with ExitStack() as stack:
        for method in ("connect", "connect_ex", "send", "sendall", "sendto"):
            stack.enter_context(patch.object(socket.socket, method, deny_io))
        stack.enter_context(patch.object(socket, "create_connection", deny_io))
        stack.enter_context(patch.object(socket, "getaddrinfo", deny_io))
        stack.enter_context(patch.object(subprocess, "Popen", deny_io))
        stack.enter_context(patch.object(os, "system", deny_io))
        yield


class SyntheticCache:
    def __init__(self, value):
        self.value = value

    def __truediv__(self, _name):
        return self

    def exists(self):
        return self.value is not None

    def read_text(self, encoding):
        if encoding != "utf-8" or self.value is None:
            raise RuntimeError("unexpected synthetic cache read")
        return self.value


def synthetic_cache(serial=SYNTHETIC_SERIAL):
    return json.dumps(
        {
            "serial": serial,
            "key_pem": base64.b64encode(SYNTHETIC_KEY).decode("ascii"),
            "cert_der": base64.b64encode(SYNTHETIC_CERTIFICATE).decode("ascii"),
        }
    )


def synthetic_request(certificates, attempts):
    def request(endpoint, params=None, team_id=None):
        attempts.append(endpoint)
        if endpoint != CERTIFICATES_ENDPOINT:
            raise GuardDenied("offline experiment denied developer action")
        return {"certificates": certificates}

    return request


def exercise_case(provision, developer, signing, cache, certificates):
    attempts = []
    key_generation = []

    def deny_key_generation():
        key_generation.append(True)
        raise GuardDenied("offline experiment denied key generation")

    with (
        patch.object(provision.paths, "signing_dir", return_value=SyntheticCache(cache)),
        patch.object(developer, "_request", synthetic_request(certificates, attempts)),
        patch.object(signing, "generate_key_and_csr", deny_key_generation),
    ):
        try:
            result = provision._ensure_certificate("synthetic-team", "synthetic-account")
        except GuardDenied:
            outcome = "denied"
        except json.JSONDecodeError:
            outcome = "invalid_cache"
        else:
            expected = (SYNTHETIC_KEY, SYNTHETIC_CERTIFICATE, SYNTHETIC_SERIAL)
            if result != expected:
                raise RuntimeError("unexpected synthetic certificate result")
            outcome = "reused"
    return {
        "outcome": outcome,
        "attempts": attempts,
        "key_generation_attempted": bool(key_generation),
    }


def exercise_invalid_matching_identity(provision, developer):
    attempts = []
    cache = json.dumps(
        {"serial": SYNTHETIC_SERIAL, "key_pem": "", "cert_der": ""}
    )
    certificates = [{"serialNumber": SYNTHETIC_SERIAL, "machineName": "iPASide"}]
    with (
        patch.object(provision.paths, "signing_dir", return_value=SyntheticCache(cache)),
        patch.object(developer, "_request", synthetic_request(certificates, attempts)),
    ):
        result = provision._ensure_certificate("synthetic-team", "synthetic-account")
    if result != (b"", b"", SYNTHETIC_SERIAL) or attempts != [CERTIFICATES_ENDPOINT]:
        raise RuntimeError("unexpected invalid identity outcome")


def exercise_signing_cache_overwrite(provision, developer, signing, *, isolated=False):
    with tempfile.TemporaryDirectory() as temporary:
        original = Path(temporary) / "original"
        original.mkdir()
        (original / "profile.mobileprovision").write_bytes(b"synthetic-old-profile")
        (original / "identity.p12").write_bytes(b"synthetic-old-identity")
        (original / "bundle.json").write_text("synthetic-old-bundle", encoding="utf-8")
        directory = Path(temporary) / "isolated" if isolated else original
        if isolated:
            directory.mkdir()
        profile_path = directory / "profile.mobileprovision"
        identity_path = directory / "identity.p12"
        bundle_path = directory / "bundle.json"
        with ExitStack() as stack:
            stack.enter_context(patch.object(provision.gsa, "load_session", return_value={}))
            stack.enter_context(
                patch.object(developer, "list_teams", return_value=[{"teamId": "synthetic-team"}])
            )
            stack.enter_context(
                patch.object(provision, "_ensure_certificate", return_value=(b"key", b"cert", "serial"))
            )
            stack.enter_context(patch.object(provision, "_ensure_device"))
            stack.enter_context(
                patch.object(provision, "_ensure_app_id", return_value={"appIdId": "synthetic-app"})
            )
            stack.enter_context(
                patch.object(
                    developer, "download_profile", return_value={"encodedProfile": b"synthetic-new-profile"}
                )
            )
            stack.enter_context(patch.object(signing, "build_p12", return_value=b"synthetic-new-identity"))
            stack.enter_context(patch.object(provision.paths, "signing_dir", return_value=directory))
            provision.ensure_signing_assets("org.synthetic.runner", "synthetic-device")
        if profile_path.read_bytes() != b"synthetic-new-profile":
            raise RuntimeError("synthetic profile was not replaced")
        if identity_path.read_bytes() != b"synthetic-new-identity":
            raise RuntimeError("synthetic identity was not replaced")
        bundle = json.loads(bundle_path.read_text(encoding="utf-8"))
        if bundle.get("bundle_id") != "org.synthetic.runner":
            raise RuntimeError("synthetic bundle was not replaced")
        if isolated and (
            (original / "profile.mobileprovision").read_bytes() != b"synthetic-old-profile"
            or (original / "identity.p12").read_bytes() != b"synthetic-old-identity"
            or (original / "bundle.json").read_text(encoding="utf-8") != "synthetic-old-bundle"
        ):
            raise RuntimeError("synthetic original cache changed")


def exercise_sideload_entrypoint(
    entrypoint, sideload, provision, developer, signing, *, matching_cache=False
):
    attempts = []
    own_certificate = {"serialNumber": SYNTHETIC_SERIAL, "machineName": "iPASide"}
    arguments = argparse.Namespace(
        ipa="synthetic.ipa",
        udid="synthetic-device",
        bundle_id="org.example.synthetic.runner",
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
    with ExitStack() as stack:
        stack.enter_context(redirect_stderr(io.StringIO()))
        stack.enter_context(patch.object(sideload, "resolve_udid", return_value="synthetic-device"))
        stack.enter_context(
            patch.object(sideload.ipa_module, "inspect", return_value={"bundle_id": "synthetic"})
        )
        stack.enter_context(patch.object(sideload, "_device_values", return_value={}))
        stack.enter_context(patch.object(provision.gsa, "load_session", return_value={}))
        stack.enter_context(
            patch.object(developer, "list_teams", return_value=[{"teamId": "synthetic-team"}])
        )
        cache = synthetic_cache() if matching_cache else None
        stack.enter_context(patch.object(provision.paths, "signing_dir", return_value=SyntheticCache(cache)))
        stack.enter_context(
            patch.object(developer, "_request", synthetic_request([own_certificate], attempts))
        )
        key_generation = stack.enter_context(patch.object(signing, "generate_key_and_csr"))
        register_device = stack.enter_context(
            patch.object(provision, "_ensure_device", side_effect=GuardDenied)
        )
        register_app = stack.enter_context(patch.object(provision, "_ensure_app_id"))
        open_output = stack.enter_context(patch.object(sideload, "_open_signed_dir"))
        sign = stack.enter_context(patch.object(signing, "sign_ipa"))
        try:
            entrypoint._cmd_sideload(arguments)
        except GuardDenied:
            pass
        else:
            raise RuntimeError("synthetic sideload did not fail closed")
        for operation in (key_generation, register_app, open_output, sign):
            operation.assert_not_called()
        if matching_cache:
            register_device.assert_called_once()
        else:
            register_device.assert_not_called()
    expected = (
        [CERTIFICATES_ENDPOINT]
        if matching_cache
        else [CERTIFICATES_ENDPOINT, "ios/revokeDevelopmentCert.action"]
    )
    if attempts != expected:
        raise RuntimeError("unexpected synthetic sideload endpoints")


def exercise_full_sideload_isolation(
    entrypoint, sideload, provision, developer, signing, *, matching_cache=True
):
    attempts = []
    with tempfile.TemporaryDirectory() as temporary:
        original = Path(temporary) / "original"
        isolated = Path(temporary) / "isolated"
        scratch = Path(temporary) / "scratch"
        original.mkdir()
        isolated.mkdir()
        scratch.mkdir()
        (original / "profile.mobileprovision").write_bytes(b"synthetic-original-profile")
        (original / "identity.p12").write_bytes(b"synthetic-original-identity")
        (original / "bundle.json").write_bytes(b"synthetic-original-bundle")
        cache_serial = SYNTHETIC_SERIAL if matching_cache else "different-synthetic-serial"
        (isolated / "certificate.json").write_text(synthetic_cache(cache_serial), encoding="utf-8")
        own_certificate = {"serialNumber": SYNTHETIC_SERIAL, "machineName": "iPASide"}
        arguments = argparse.Namespace(
            ipa="synthetic.ipa",
            udid="synthetic-device",
            bundle_id="org.example.synthetic.runner",
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
        with ExitStack() as stack:
            stack.enter_context(redirect_stdout(io.StringIO()))
            stack.enter_context(redirect_stderr(io.StringIO()))
            stack.enter_context(patch.object(sideload, "resolve_udid", return_value="synthetic-device"))
            stack.enter_context(
                patch.object(
                    sideload.ipa_module, "inspect", return_value={"bundle_id": "org.example.synthetic.runner"}
                )
            )
            stack.enter_context(patch.object(sideload.ipa_module, "deepest_entry", return_value=0))
            stack.enter_context(patch.object(sideload, "_device_values", return_value={}))
            stack.enter_context(patch.object(provision.gsa, "load_session", return_value={}))
            stack.enter_context(
                patch.object(developer, "list_teams", return_value=[{"teamId": "synthetic-team"}])
            )
            stack.enter_context(patch.object(provision.paths, "signing_dir", return_value=isolated))
            stack.enter_context(
                patch.object(developer, "_request", synthetic_request([own_certificate], attempts))
            )
            generate = stack.enter_context(patch.object(signing, "generate_key_and_csr", side_effect=GuardDenied))
            stack.enter_context(patch.object(provision, "_ensure_device"))
            stack.enter_context(
                patch.object(provision, "_ensure_app_id", return_value={"appIdId": "synthetic-app"})
            )
            stack.enter_context(
                patch.object(
                    developer, "download_profile", return_value={"encodedProfile": b"synthetic-new-profile"}
                )
            )
            stack.enter_context(patch.object(signing, "build_p12", return_value=b"synthetic-new-identity"))
            stack.enter_context(patch.object(sideload, "_open_signed_dir", return_value=(Path(temporary), scratch)))
            sign = stack.enter_context(patch.object(signing, "sign_ipa"))
            install = stack.enter_context(patch.object(sideload.apps, "install"))
            stack.enter_context(patch.object(sideload, "_deliver_pairing_if_needed", return_value=None))
            stack.enter_context(patch.object(sideload.refresh, "profile_expiration", return_value=None))
            record = stack.enter_context(patch.object(sideload.refresh, "record"))
            try:
                result = entrypoint._cmd_sideload(arguments)
            except GuardDenied:
                if matching_cache:
                    raise
            else:
                if not matching_cache or result != 0:
                    raise RuntimeError("unexpected synthetic sideload outcome")
            generate.assert_not_called()
            if matching_cache:
                sign.assert_called_once()
                install.assert_called_once()
                record.assert_called_once()
            else:
                sign.assert_not_called()
                install.assert_not_called()
                record.assert_not_called()
        expected = (
            [CERTIFICATES_ENDPOINT]
            if matching_cache
            else [CERTIFICATES_ENDPOINT, "ios/revokeDevelopmentCert.action"]
        )
        if attempts != expected:
            raise RuntimeError("unexpected synthetic developer action")
        if (
            (original / "profile.mobileprovision").read_bytes() != b"synthetic-original-profile"
            or (original / "identity.p12").read_bytes() != b"synthetic-original-identity"
            or (original / "bundle.json").read_bytes() != b"synthetic-original-bundle"
        ):
            raise RuntimeError("synthetic cache isolation failed")
        if matching_cache and (
            (isolated / "profile.mobileprovision").read_bytes() != b"synthetic-new-profile"
            or (isolated / "identity.p12").read_bytes() != b"synthetic-new-identity"
        ):
            raise RuntimeError("synthetic isolated cache was not populated")
        if not matching_cache and (
            (isolated / "profile.mobileprovision").exists()
            or (isolated / "identity.p12").exists()
            or (isolated / "bundle.json").exists()
        ):
            raise RuntimeError("synthetic denied run wrote signing assets")


def run_experiment(entrypoint, sideload, provision, developer, signing):
    if provision.developer is not developer or provision.signing is not signing:
        raise RuntimeError("unexpected iPASide module references")
    if provision.CERTIFICATE_MACHINE_NAME != "iPASide":
        raise RuntimeError("unexpected iPASide certificate machine name")
    if issubclass(GuardDenied, developer.DeveloperServicesError):
        raise RuntimeError("guard exception could be swallowed by iPASide")

    own_certificate = {"serialNumber": SYNTHETIC_SERIAL, "machineName": "iPASide"}
    other_certificate = {"serialNumber": SYNTHETIC_SERIAL, "machineName": "another-tool"}
    scenarios = {
        "matching_cache": (synthetic_cache(), [own_certificate]),
        "missing_cache": (None, [own_certificate]),
        "mismatched_cache": (synthetic_cache("different-synthetic-serial"), [own_certificate]),
        "no_certificate": (None, []),
        "other_certificate": (None, [other_certificate]),
        "invalid_cache": ("invalid synthetic json", [own_certificate]),
    }
    results = {
        name: exercise_case(provision, developer, signing, cache, certificates)
        for name, (cache, certificates) in scenarios.items()
    }
    expected = {
        "matching_cache": ("reused", [CERTIFICATES_ENDPOINT], False),
        "missing_cache": (
            "denied", [CERTIFICATES_ENDPOINT, "ios/revokeDevelopmentCert.action"], False
        ),
        "mismatched_cache": (
            "denied", [CERTIFICATES_ENDPOINT, "ios/revokeDevelopmentCert.action"], False
        ),
        "no_certificate": ("denied", [CERTIFICATES_ENDPOINT], True),
        "other_certificate": ("denied", [CERTIFICATES_ENDPOINT], True),
        "invalid_cache": ("invalid_cache", [CERTIFICATES_ENDPOINT], False),
    }
    for name, (outcome, attempts, key_generation) in expected.items():
        result = results[name]
        if (
            result["outcome"] != outcome
            or result["attempts"] != attempts
            or result["key_generation_attempted"] != key_generation
        ):
            raise RuntimeError(f"unexpected synthetic outcome: {name}")

    attempts = []
    with patch.object(developer, "_request", synthetic_request([], attempts)):
        for call in (
            lambda: developer.revoke_certificate("synthetic-team", SYNTHETIC_SERIAL),
            lambda: developer.submit_csr("synthetic-team", "synthetic-csr"),
            lambda: developer._request("unknown.action"),
        ):
            try:
                call()
            except GuardDenied:
                continue
            raise RuntimeError("unexpected synthetic developer action")
    if attempts != [
        "ios/revokeDevelopmentCert.action",
        "ios/submitDevelopmentCSR.action",
        "unknown.action",
    ]:
        raise RuntimeError("unexpected synthetic developer endpoints")
    exercise_sideload_entrypoint(entrypoint, sideload, provision, developer, signing)
    exercise_sideload_entrypoint(
        entrypoint, sideload, provision, developer, signing, matching_cache=True
    )
    exercise_invalid_matching_identity(provision, developer)
    exercise_signing_cache_overwrite(provision, developer, signing)
    exercise_signing_cache_overwrite(provision, developer, signing, isolated=True)
    exercise_full_sideload_isolation(entrypoint, sideload, provision, developer, signing)
    exercise_full_sideload_isolation(
        entrypoint, sideload, provision, developer, signing, matching_cache=False
    )
    return {
        "certificate_scenarios_passed": len(results),
        "developer_actions_denied": len(attempts),
        "sideload_entrypoint_stopped_before_signing": True,
        "reused_certificate_stopped_before_device_registration": True,
        "empty_synthetic_identity_reused_by_serial": True,
        "synthetic_signing_cache_overwritten": True,
        "synthetic_signing_cache_redirect_preserved_original": True,
        "synthetic_full_sideload_isolation_passed": True,
        "synthetic_full_sideload_mismatch_denied": True,
        "network_and_subprocess": "blocked_in_process",
    }


def main():
    if len(sys.argv) != 1:
        raise SystemExit("This offline experiment does not accept arguments.")
    sys.dont_write_bytecode = True
    with offline_process():
        import ipaside_engine
        from ipaside_engine import __main__ as entrypoint
        from ipaside_engine import developer, provision, sideload, signing

        if ipaside_engine.__version__ != "1.2.14":
            raise RuntimeError("unsupported iPASide version")
        report = run_experiment(entrypoint, sideload, provision, developer, signing)
    print(json.dumps(report, sort_keys=True))


if __name__ == "__main__":
    main()
