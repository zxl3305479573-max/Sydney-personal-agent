import asyncio
import json
import logging

from pymobiledevice3.remote.userspace_tunnel import UserspaceRsdTunnel
from pymobiledevice3.services.cryptexd import CryptexdService
from pymobiledevice3.usbmux import list_devices


async def inspect_cryptex():
    devices = await list_devices()
    if len(devices) != 1:
        return {"status": "unexpected_device_count", "device_count": len(devices)}
    try:
        async with UserspaceRsdTunnel(autopair=False, remotepairing_fallback=False) as remote:
            installed = await CryptexdService(remote).copy_installed()
            found = any(entry.identifier == "com.apple.MobileAsset.DDI" for entry in installed)
            return {"status": "queried", "developer_cryptex_found": found}
    except Exception as error:
        return {"status": "unavailable", "error_type": type(error).__name__}


def main():
    logging.disable(logging.CRITICAL)
    try:
        result = asyncio.run(asyncio.wait_for(inspect_cryptex(), timeout=30))
    except TimeoutError:
        result = {"status": "timeout"}
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
