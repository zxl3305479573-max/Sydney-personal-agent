import asyncio
import os
import sys


async def pipe(reader, writer):
    try:
        while data := await reader.read(65536):
            writer.write(data)
            await writer.drain()
        if writer.can_write_eof():
            writer.write_eof()
            await writer.drain()
    except (ConnectionError, OSError):
        pass


async def relay(reader, writer, connect):
    upstream_writer = None
    try:
        upstream_reader, upstream_writer = await connect()
        await asyncio.gather(pipe(reader, upstream_writer), pipe(upstream_reader, writer))
    except (ConnectionError, OSError):
        pass
    finally:
        writer.close()
        if upstream_writer is not None:
            upstream_writer.close()


async def run():
    runtime = os.environ["SYDNEY_WEB_RUNTIME_DIR"]
    app_dir = os.environ["SYDNEY_WEB_APP_DIR"]
    node = os.environ["SYDNEY_WEB_NODE"]
    web_socket = os.path.join(runtime, "web.sock")
    api_socket = os.path.join(runtime, "api.sock")
    screen_socket = os.path.join(runtime, "screen.sock")
    try:
        os.unlink(web_socket)
    except FileNotFoundError:
        pass

    api_server = await asyncio.start_server(
        lambda reader, writer: relay(
            reader, writer, lambda: asyncio.open_unix_connection(api_socket)
        ),
        "127.0.0.1",
        3100,
    )
    screen_server = await asyncio.start_server(
        lambda reader, writer: relay(
            reader, writer, lambda: asyncio.open_unix_connection(screen_socket)
        ),
        "127.0.0.1",
        16080,
    )
    web_server = await asyncio.start_unix_server(
        lambda reader, writer: relay(
            reader, writer, lambda: asyncio.open_connection("127.0.0.1", 5174)
        ),
        web_socket,
    )
    os.chmod(web_socket, 0o600)
    process = await asyncio.create_subprocess_exec(
        node,
        os.path.join(app_dir, "node_modules/vite/bin/vite.js"),
        "preview",
        "--host",
        "127.0.0.1",
        "--port",
        "5174",
        "--strictPort",
        cwd=app_dir,
    )
    try:
        return await process.wait()
    finally:
        for server in (api_server, screen_server, web_server):
            server.close()
        await asyncio.gather(
            api_server.wait_closed(), screen_server.wait_closed(), web_server.wait_closed()
        )


if __name__ == "__main__":
    sys.exit(asyncio.run(run()))
