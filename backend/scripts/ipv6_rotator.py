#!/usr/bin/env python3
"""
Lightweight Rotating IPv6 HTTP/HTTPS Proxy for GapirAI.
Rotates across 5,000 configured IPv6 addresses on eth0.
Includes proper timeout handling and strict socket cleanup to prevent descriptor leaks.
"""
import asyncio
import random
import sys

PORT = 8888
SUBNET_PREFIX = "2a02:c207:2360:5436::"
IP_MIN = 1000
IP_MAX = 6000
IDLE_TIMEOUT = 120.0
CONNECT_TIMEOUT = 10.0


def get_random_ipv6() -> str:
    return f"{SUBNET_PREFIX}{random.randint(IP_MIN, IP_MAX)}"


async def pipe_pair(reader1: asyncio.StreamReader, writer1: asyncio.StreamWriter,
                    reader2: asyncio.StreamReader, writer2: asyncio.StreamWriter):
    async def copy_stream(r: asyncio.StreamReader, w: asyncio.StreamWriter):
        try:
            while True:
                data = await asyncio.wait_for(r.read(65536), timeout=IDLE_TIMEOUT)
                if not data:
                    break
                w.write(data)
                await w.drain()
        except Exception:
            pass
        finally:
            try:
                w.close()
                await w.wait_closed()
            except Exception:
                pass

    t1 = asyncio.create_task(copy_stream(reader1, writer2))
    t2 = asyncio.create_task(copy_stream(reader2, writer1))
    await asyncio.wait([t1, t2], return_when=asyncio.FIRST_COMPLETED)
    t1.cancel()
    t2.cancel()
    for w in (writer1, writer2):
        try:
            w.close()
            await w.wait_closed()
        except Exception:
            pass


async def handle_client(client_reader: asyncio.StreamReader, client_writer: asyncio.StreamWriter):
    remote_writer = None
    try:
        line = await asyncio.wait_for(client_reader.readline(), timeout=15.0)
        if not line:
            client_writer.close()
            return

        parts = line.decode("latin1", errors="ignore").split()
        if len(parts) < 2:
            client_writer.close()
            return

        method, url = parts[0], parts[1]

        # Read until empty line (end of client headers)
        while True:
            h = await asyncio.wait_for(client_reader.readline(), timeout=15.0)
            if not h or h == b"\r\n":
                break

        if method.upper() == "CONNECT":
            host, port_str = url.split(":") if ":" in url else (url, "443")
            port = int(port_str)
            out_ip = get_random_ipv6()

            try:
                import socket
                remote_reader, remote_writer = await asyncio.wait_for(
                    asyncio.open_connection(host, port, local_addr=(out_ip, 0), family=socket.AF_INET6),
                    timeout=CONNECT_TIMEOUT,
                )
            except Exception:
                # Fallback to default routing
                try:
                    remote_reader, remote_writer = await asyncio.wait_for(
                        asyncio.open_connection(host, port),
                        timeout=CONNECT_TIMEOUT,
                    )
                except Exception:
                    client_writer.write(b"HTTP/1.1 502 Bad Gateway\r\n\r\n")
                    await client_writer.drain()
                    client_writer.close()
                    return

            client_writer.write(b"HTTP/1.1 200 Connection Established\r\n\r\n")
            await client_writer.drain()

            await pipe_pair(client_reader, client_writer, remote_reader, remote_writer)
        else:
            client_writer.write(b"HTTP/1.1 405 Method Not Allowed\r\n\r\n")
            await client_writer.drain()
            client_writer.close()
    except Exception:
        pass
    finally:
        for w in (client_writer, remote_writer):
            if w:
                try:
                    w.close()
                    await w.wait_closed()
                except Exception:
                    pass


async def main():
    server = await asyncio.start_server(handle_client, "0.0.0.0", PORT)
    print(f"IPv6 Rotating Proxy running on 0.0.0.0:{PORT} (pool: {SUBNET_PREFIX}{IP_MIN}-{IP_MAX})", flush=True)
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        sys.exit(0)
