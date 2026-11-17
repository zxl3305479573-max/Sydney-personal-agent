import asyncio
import json
import logging

from pymobiledevice3.lockdown import create_using_usbmux
from pymobiledevice3.services.mobile_image_mounter import MobileImageMounterService
from pymobiledevice3.usbmux import list_devices


async def inspect_device():
    devices = await list_devices()
    if len(devices) != 1:
        return {"status": "unexpected_device_count", "device_count": len(devices)}

    client = None
    try:
        client = await create_using_usbmux(autopair=False, connection_type="USB")
        result = {"status": "connected", "ios_version": client.product_version}
        try:
            async with MobileImageMounterService(lockdown=client) as mounter:
                result["personalized_image_found"] = await mounter.is_image_mounted("Personalized")
        except Exception as error:
            result["image_query"] = "unavailable"
            result["image_error_type"] = type(error).__name__
        return result
    except Exception as error:
        return {"status": "connection_unavailable", "error_type": type(error).__name__}
    finally:
        if client is not None:
            await client.close()


def main():
    logging.disable(logging.CRITICAL)
    try:
        result = asyncio.run(asyncio.wait_for(inspect_device(), timeout=15))
    except TimeoutError:
        result = {"status": "timeout"}
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
