#!/usr/bin/env python3
import importlib.util
from pathlib import Path


DIRECTORY = Path(__file__).parent


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, DIRECTORY / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


stage_module = load("workspace_stage", "workspace-systemd-supervisor.py")
controller = load("globals_capture_controller", "globals-capture-controller.py")


def capture(project, service, image, volume, user, stage_path, backing, age,
            recipient, limit, timeout, reserve):
    if (type(limit) is not int or not 0 < limit <= 64 * 1024 * 1024
            or type(reserve) is not int or reserve <= 0):
        raise ValueError("invalid stage capacity")
    stage = stage_module.Stage(stage_path, backing)
    try:
        stage.verify(limit + reserve)
        return controller.capture(project, service, image, volume, user, stage.fd, age,
                                  recipient, limit, timeout,
                                  before_publish=lambda: stage.verify(reserve))
    finally:
        stage.close()


if __name__ == "__main__":
    raise SystemExit("Synthetic stage supervisor only; production capture is disabled.")
