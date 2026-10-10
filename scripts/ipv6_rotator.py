#!/usr/bin/env python3
"""
Lightweight Rotating IPv6 HTTP/HTTPS Proxy for GapirAI.
Rotates across 5,000 configured IPv6 addresses on eth0.
"""
import asyncio
import random
import sys

PORT = 8888
SUBNET_PREFIX = "2a02:c207:2360:5436::"
IP_MIN = 1000
IP_MAX = 6000


def get_random_ipv6() -> str:
    return f"{SUBNET_PREFIX}{random.randint(IP_MIN, IP_MAX)}"


async def pipe(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
    try:
        while not reader.at_eof():
            data = await reader.read(65536)
            if not data:
                break
            writer.write(data)
            await writer.drain()
    except Exception:
        pass
    finally:
        try:
            writer.close()
            await writer.wait_closed()
        except Exception:
            pass


async def handle_client(client_reader: asyncio.StreamReader, client_writer: asyncio.StreamWriter):
    try:
        line = await client_reader.readline()
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
            h = await client_reader.readline()
            if not h or h == b"\r\n":
                break

        if method.upper() == "CONNECT":
            host, port_str = url.split(":") if ":" in url else (url, "443")
            port = int(port_str)
            out_ip = get_random_ipv6()

            try:
                remote_reader, remote_writer = await asyncio.open_connection(
                    host, port, local_addr=(out_ip, 0)
                )
            except Exception:
                # Fallback to default routing if specific IPv6 fails
                try:
                    remote_reader, remote_writer = await asyncio.open_connection(host, port)
                except Exception:
                    client_writer.write(b"HTTP/1.1 502 Bad Gateway\r\n\r\n")
                    await client_writer.drain()
                    client_writer.close()
                    return

            client_writer.write(b"HTTP/1.1 200 Connection Established\r\n\r\n")
            await client_writer.drain()

            asyncio.create_task(pipe(client_reader, remote_writer))
            asyncio.create_task(pipe(remote_reader, client_writer))
        else:
            client_writer.close()
    except Exception:
        client_writer.close()


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
