"""Plan and, with explicit approval, install desktop prerequisites over SSH."""

import argparse
import base64
import hashlib
import json
import sys
from pathlib import Path

from computer_profiles import get_profiles
from inspect_remote import InspectionError, run_remote_script

PLAN_LIMIT = 8192


def host_binding(profile):
    try:
        with Path(profile["known_hosts"]).open("rb") as file:
            known_hosts = file.read(256 * 1024 + 1)
    except OSError as exc:
        raise InspectionError("credential_file_unavailable") from exc
    if len(known_hosts) > 256 * 1024:
        raise InspectionError("invalid_known_hosts")
    return {
        "host": profile["host"],
        "port": profile["port"],
        "user": profile["user"],
        "host_keys_sha256": hashlib.sha256(known_hosts).hexdigest(),
    }


def remote_action(profile, action, plan=None):
    payload = Path(__file__).with_name("package_setup.py").read_bytes()
    if action == "plan":
        command = "python3 - plan"
        timeout = 120
    elif action == "apply" and plan is not None:
        encoded = base64.b64encode(
            json.dumps(plan, separators=(",", ":")).encode("utf-8")
        ).decode("ascii")
        if len(encoded) > 16384:
            raise InspectionError("invalid_plan")
        command = "python3 - apply " + encoded
        timeout = 1900
    else:
        raise InspectionError("invalid_remote_operation")
    try:
        status, output = run_remote_script(
            profile["host"], profile["user"], profile["port"], profile["identity"],
            profile["known_hosts"], payload, command, timeout,
        )
    except InspectionError as exc:
        if action == "apply":
            raise InspectionError("install_result_unknown") from exc
        raise
    try:
        response = json.loads(output)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise InspectionError("install_result_unknown" if action == "apply" else "invalid_response") from exc
    if not isinstance(response, dict) or not isinstance(response.get("ok"), bool):
        raise InspectionError("invalid_response")
    if not response["ok"]:
        allowed = {
            "unsupported_system", "package_query_failed", "package_candidate_unavailable",
            "invalid_plan", "system_changed", "package_candidates_changed",
            "install_result_unknown", "installer_unavailable", "install_failed_inspect_before_retry",
        }
        error = response.get("error")
        raise InspectionError(error if error in allowed else "remote_preparation_failed")
    if status != 0 or not isinstance(response.get("result"), dict):
        raise InspectionError("invalid_response")
    return response["result"]


def create_plan(profile):
    return {"target": host_binding(profile), "preparation": remote_action(profile, "plan")}


def apply_plan(profile, document):
    if not isinstance(document, dict) or set(document) != {"target", "preparation"}:
        raise InspectionError("invalid_plan")
    if document["target"] != host_binding(profile):
        raise InspectionError("target_changed")
    return remote_action(profile, "apply", document["preparation"])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file", type=Path, required=True)
    parser.add_argument("--id", required=True)
    subparsers = parser.add_subparsers(dest="operation", required=True)
    subparsers.add_parser("plan")
    apply_parser = subparsers.add_parser("apply")
    apply_parser.add_argument("--plan-file", type=Path, required=True)
    apply_parser.add_argument("--confirm-system-changes", action="store_true", required=True)
    args = parser.parse_args()
    try:
        profile = get_profiles(args.file).get(args.id)
        if profile is None:
            raise InspectionError("profile_not_found")
        if args.operation == "plan":
            result = create_plan(profile)
        else:
            try:
                with args.plan_file.open("rb") as file:
                    raw = file.read(PLAN_LIMIT + 1)
                if len(raw) > PLAN_LIMIT:
                    raise InspectionError("invalid_plan")
                envelope = json.loads(raw)
                if not isinstance(envelope, dict) or envelope.get("ok") is not True:
                    raise InspectionError("invalid_plan")
                document = envelope.get("result")
            except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
                raise InspectionError("invalid_plan") from exc
            result = apply_plan(profile, document)
    except InspectionError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}), file=sys.stderr)
        return 1
    print(json.dumps({"ok": True, "result": result}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
