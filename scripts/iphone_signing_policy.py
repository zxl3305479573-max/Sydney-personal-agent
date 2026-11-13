"""Candidate request and identity policy; not a complete process security boundary."""

from contextlib import ExitStack, contextmanager
from pathlib import Path
import plistlib
from threading import Lock
from urllib.parse import parse_qsl, urlsplit
from unittest.mock import patch

from cryptography import x509
from cryptography.hazmat.primitives import serialization
import requests


_PROCESS_GUARD_LOCK = Lock()


class PolicyDenied(RuntimeError):
    pass


class DeveloperRequestPolicy:
    READ_ENDPOINTS = frozenset(
        {
            "ios/listAllDevelopmentCerts.action",
            "ios/listDevices.action",
            "ios/listAppIds.action",
        }
    )

    def __init__(self, request, team_id, target_bundle_id, protected_bundle_ids):
        if not callable(request) or not isinstance(team_id, str) or not team_id:
            raise ValueError("invalid team or request")
        if not isinstance(target_bundle_id, str) or not target_bundle_id:
            raise ValueError("invalid target bundle")
        if (
            not isinstance(protected_bundle_ids, (set, frozenset))
            or not protected_bundle_ids
            or any(not isinstance(value, str) or not value for value in protected_bundle_ids)
            or target_bundle_id.casefold() in {value.casefold() for value in protected_bundle_ids}
        ):
            raise ValueError("invalid protected bundle set")
        self._request = request
        self._team_id = team_id
        self._target_bundle_id = target_bundle_id
        self._known_target_ids = set()

    def _remember_target(self, value):
        if not isinstance(value, dict) or value.get("identifier") != self._target_bundle_id:
            return
        app_id = value.get("appIdId")
        if isinstance(app_id, str) and app_id:
            self._known_target_ids.add(app_id)

    def check(self, endpoint, params=None, team_id=None):
        if endpoint == "listTeams.action":
            if team_id is not None or params not in (None, {}):
                raise PolicyDenied("team request rejected")
        elif team_id != self._team_id:
            raise PolicyDenied("team mismatch")
        elif endpoint in self.READ_ENDPOINTS:
            if params not in (None, {}):
                raise PolicyDenied("unexpected query parameters")
        elif endpoint == "ios/addAppId.action":
            if (
                not isinstance(params, dict)
                or set(params) != {"identifier", "name"}
                or params["identifier"] != self._target_bundle_id
                or not isinstance(params["name"], str)
                or not params["name"]
            ):
                raise PolicyDenied("target app creation rejected")
        elif endpoint == "ios/downloadTeamProvisioningProfile.action":
            if (
                not isinstance(params, dict)
                or set(params) != {"appIdId"}
                or not isinstance(params["appIdId"], str)
                or params["appIdId"] not in self._known_target_ids
            ):
                raise PolicyDenied("profile target rejected")
        else:
            raise PolicyDenied("developer action rejected")

    def __call__(self, endpoint, params=None, team_id=None):
        self.check(endpoint, params, team_id)
        result = self._request(endpoint, params, team_id=team_id)
        if not isinstance(result, dict):
            raise PolicyDenied("invalid developer response")
        if endpoint == "ios/listAppIds.action":
            app_ids = result.get("appIds")
            if not isinstance(app_ids, list):
                raise PolicyDenied("invalid app list")
            self._known_target_ids.clear()
            for app in app_ids:
                self._remember_target(app)
        elif endpoint == "ios/addAppId.action":
            self._remember_target(result.get("appId"))
        return result


def check_transport(policy, request, options):
    """Fail closed for requests outside the expected Apple developer protocol."""
    try:
        parsed = urlsplit(request.url)
        if (
            request.method != "POST"
            or parsed.scheme != "https"
            or parsed.netloc != "developerservices2.apple.com"
            or parsed.fragment
            or not parsed.path.startswith("/services/QH65B2/")
            or parse_qsl(parsed.query, keep_blank_values=True, strict_parsing=True)
            != [("clientId", "XABBG36SBA")]
        ):
            raise PolicyDenied("network destination rejected")
        if options.get("verify") is False or not options.get("verify"):
            raise PolicyDenied("TLS verification required")
        proxies = options.get("proxies") or {}
        if not isinstance(proxies, dict) or any(
            not isinstance(key, str)
            or (key.casefold() not in {"no", "no_proxy"} and bool(value))
            for key, value in proxies.items()
        ):
            raise PolicyDenied("proxy rejected")
        if not isinstance(request.body, bytes) or len(request.body) > 64 * 1024:
            raise PolicyDenied("invalid network payload")
        body = plistlib.loads(request.body)
        if not isinstance(body, dict):
            raise PolicyDenied("invalid network payload")
        if (
            body.pop("clientId", None) != "XABBG36SBA"
            or body.pop("protocolVersion", None) != "QH65B2"
            or not isinstance(body.pop("requestId", None), str)
        ):
            raise PolicyDenied("invalid protocol envelope")
        team = body.pop("teamId", None)
        endpoint = parsed.path[len("/services/QH65B2/") :]
        policy.check(endpoint, body or None, team)
    except PolicyDenied:
        raise
    except Exception as error:
        raise PolicyDenied("invalid network request") from error


def _certificate_content(entry):
    for key in ("certContent", "certificateContent", "certificate"):
        value = entry.get(key)
        if isinstance(value, (bytes, bytearray)):
            return bytes(value)
        if isinstance(value, dict):
            for inner_key in ("certContent", "certificateContent"):
                inner = value.get(inner_key)
                if isinstance(inner, (bytes, bytearray)):
                    return bytes(inner)
    return None


def reuse_certificate(key_pem, certificate_der, serial, server_certificates, now):
    """Return cached identity only when key, validity, serial and server DER agree."""
    if not isinstance(serial, str) or not serial or not isinstance(server_certificates, list):
        raise PolicyDenied("invalid certificate evidence")
    try:
        key = serialization.load_pem_private_key(key_pem, password=None)
        certificate = x509.load_der_x509_certificate(certificate_der)
        key_public = key.public_key().public_bytes(
            serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo
        )
        certificate_public = certificate.public_key().public_bytes(
            serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo
        )
        if key_public != certificate_public:
            raise PolicyDenied("certificate key mismatch")
        if now.tzinfo is None or not certificate.not_valid_before_utc <= now < certificate.not_valid_after_utc:
            raise PolicyDenied("certificate outside validity")
    except PolicyDenied:
        raise
    except Exception as error:
        raise PolicyDenied("invalid certificate identity") from error
    matches = [
        entry
        for entry in server_certificates
        if isinstance(entry, dict)
        and entry.get("serialNumber") == serial
        and _certificate_content(entry) == certificate_der
    ]
    if len(matches) != 1:
        raise PolicyDenied("certificate not uniquely matched")
    return key_pem, certificate_der, serial


@contextmanager
def guarded_process(
    developer,
    provision,
    signing,
    apps,
    *,
    team_id,
    target_bundle_id,
    allowed_device_id,
    protected_bundle_ids,
    protected_directory,
    isolated_directory,
    key_pem,
    certificate_der,
    serial,
    now_provider,
    verify_package,
):
    """Candidate process-local interception; callers must enforce OS isolation."""
    protected = Path(protected_directory)
    isolated = Path(isolated_directory)
    if protected.is_symlink() or isolated.is_symlink() or not protected.is_dir() or not isolated.is_dir():
        raise PolicyDenied("invalid cache directories")
    protected = protected.resolve(strict=True)
    isolated = isolated.resolve(strict=True)
    if isolated == protected or isolated.is_relative_to(protected) or protected.is_relative_to(isolated):
        raise PolicyDenied("cache directories overlap")
    if any(isolated.iterdir()):
        raise PolicyDenied("isolated cache is not empty")
    if not callable(now_provider):
        raise PolicyDenied("invalid clock")
    if not callable(verify_package):
        raise PolicyDenied("missing package verifier")
    if not isinstance(allowed_device_id, str) or not allowed_device_id.replace("-", ""):
        raise PolicyDenied("invalid device")
    normalized_device = allowed_device_id.replace("-", "").casefold()
    if not normalized_device.isascii() or not normalized_device.isalnum():
        raise PolicyDenied("invalid device")
    policy = DeveloperRequestPolicy(
        developer._request, team_id, target_bundle_id, protected_bundle_ids
    )
    original_assets = provision.ensure_signing_assets
    original_install = apps.install
    original_send = requests.Session.send
    state = {"assets": "unused"}

    def guarded_identity(requested_team, _account_slug):
        if requested_team != team_id:
            raise PolicyDenied("team mismatch")
        try:
            moment = now_provider()
        except Exception as error:
            raise PolicyDenied("clock unavailable") from error
        return reuse_certificate(
            key_pem, certificate_der, serial, developer.list_certificates(team_id), moment
        )

    def denied(*_args, **_kwargs):
        raise PolicyDenied("certificate mutation rejected")

    def guarded_send(session, request, **kwargs):
        check_transport(policy, request, kwargs)
        return original_send(session, request, **kwargs)

    def guarded_assets(bundle_id, device_id, *args, **kwargs):
        if args or not set(kwargs) <= {"app_name", "device_name", "on_step", "app_groups"}:
            raise PolicyDenied("unexpected asset arguments")
        if bundle_id != target_bundle_id:
            raise PolicyDenied("target bundle mismatch")
        if not isinstance(device_id, str) or device_id.replace("-", "").casefold() != normalized_device:
            raise PolicyDenied("device mismatch")
        if kwargs.get("app_groups"):
            raise PolicyDenied("application groups rejected")
        if state["assets"] != "unused":
            raise PolicyDenied("asset preparation already attempted")
        state["assets"] = "preparing"
        try:
            result = original_assets(bundle_id, device_id, *args, **kwargs)
        except BaseException:
            state["assets"] = "failed"
            raise
        state["assets"] = "ready"
        return result

    def guarded_install(ipa_path, serial=None, progress=None):
        if state["assets"] != "ready":
            raise PolicyDenied("signing assets not ready")
        if not isinstance(serial, str) or serial.replace("-", "").casefold() != normalized_device:
            raise PolicyDenied("installation device mismatch")
        if not isinstance(ipa_path, (str, Path)):
            raise PolicyDenied("invalid installation package")
        path = Path(ipa_path)
        if not path.is_absolute() or path.is_symlink() or not path.is_file() or path.suffix.lower() != ".ipa":
            raise PolicyDenied("invalid installation package")
        try:
            verified = verify_package(path, target_bundle_id)
        except Exception as error:
            raise PolicyDenied("package verification failed") from error
        if verified is not True:
            raise PolicyDenied("package verification rejected")
        state["assets"] = "consumed"
        return original_install(ipa_path, serial, progress=progress)

    if not _PROCESS_GUARD_LOCK.acquire(blocking=False):
        raise PolicyDenied("another guard is active")
    try:
        with ExitStack() as stack:
            stack.enter_context(patch.object(developer, "_request", policy))
            stack.enter_context(patch.object(requests.Session, "send", guarded_send))
            stack.enter_context(patch.object(developer, "revoke_certificate", denied))
            stack.enter_context(patch.object(developer, "submit_csr", denied))
            stack.enter_context(patch.object(signing, "generate_key_and_csr", denied))
            stack.enter_context(patch.object(provision, "_ensure_certificate", guarded_identity))
            stack.enter_context(patch.object(provision.paths, "signing_dir", return_value=isolated))
            stack.enter_context(patch.object(provision, "ensure_signing_assets", guarded_assets))
            stack.enter_context(patch.object(apps, "install", guarded_install))
            yield
    finally:
        _PROCESS_GUARD_LOCK.release()
