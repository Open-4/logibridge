"""
api.py — Vercel Serverless Function Entrypoint

将 FastAPI (ASGI) 应用适配为 Vercel Python runtime 兼容格式。
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from api_server import app  # noqa: E402

try:
    from mangum import Mangum
    handler = Mangum(app, lifespan="off")
except ImportError:
    # 降级：使用 TestClient 桥接
    from starlette.testclient import TestClient
    _client = TestClient(app)

    def handler(event: dict, context):  # type: ignore
        """Vercel Python runtime handler (event-driven format)"""
        path = event.get("path", "/")
        method = event.get("httpMethod", "GET")
        body = event.get("body", "")
        headers = event.get("headers", {}) or {}
        qs_params = event.get("queryStringParameters", {}) or {}

        # Build query string
        if qs_params:
            from urllib.parse import urlencode
            query = urlencode(qs_params)
            path = f"{path}?{query}"

        # Remove hop-by-hop headers
        skip = {"host", "connection", "keep-alive", "transfer-encoding", "te", "trailer", "upgrade"}
        req_headers = {k: v for k, v in headers.items() if k.lower() not in skip}

        resp = _client.request(
            method=method,
            url=f"https://znkfhyq.xyz{path}",
            content=body or None,
            headers=req_headers,
        )

        return {
            "statusCode": resp.status_code,
            "headers": {k: v for k, v in resp.headers.items()},
            "body": resp.text,
        }
