import json
import os
import urllib.request
from typing import Any, Optional
from pathlib import Path
from app.config import settings

class CloudStore:
    """
    Centralized persistent cloud store using Upstash Redis / Vercel KV REST API.
    Provides shared persistence across all Vercel Serverless Function instances,
    solving the ephemeral container issue permanently.
    """
    def __init__(self):
        self.url = (
            os.environ.get("KV_REST_API_URL") 
            or os.environ.get("UPSTASH_REDIS_REST_URL")
        )
        self.token = (
            os.environ.get("KV_REST_API_TOKEN") 
            or os.environ.get("UPSTASH_REDIS_REST_TOKEN")
        )

    def is_configured(self) -> bool:
        if not self.url:
            self.url = (
                os.environ.get("KV_REST_API_URL") 
                or os.environ.get("UPSTASH_REDIS_REST_URL")
            )
        if not self.token:
            self.token = (
                os.environ.get("KV_REST_API_TOKEN") 
                or os.environ.get("UPSTASH_REDIS_REST_TOKEN")
            )
        return bool(self.url and self.token)

    def get(self, key: str, default: Any = None) -> Any:
        if not self.is_configured():
            return default
        try:
            req = urllib.request.Request(
                f"{self.url.rstrip('/')}/get/{key}",
                headers={"Authorization": f"Bearer {self.token}"}
            )
            with urllib.request.urlopen(req, timeout=6) as res:
                data = json.loads(res.read().decode("utf-8"))
                result = data.get("result")
                if result is None:
                    return default
                try:
                    return json.loads(result)
                except Exception:
                    return result
        except Exception as e:
            print(f"[CloudStore] Warning getting key '{key}': {e}")
            return default

    def set(self, key: str, value: Any) -> bool:
        if not self.is_configured():
            return False
        try:
            payload = json.dumps(value).encode("utf-8") if not isinstance(value, str) else value.encode("utf-8")
            req = urllib.request.Request(
                f"{self.url.rstrip('/')}/set/{key}",
                data=payload,
                headers={
                    "Authorization": f"Bearer {self.token}",
                    "Content-Type": "application/json"
                }
            )
            with urllib.request.urlopen(req, timeout=6) as res:
                return res.status == 200
        except Exception as e:
            print(f"[CloudStore] Warning setting key '{key}': {e}")
            return False

cloud_store = CloudStore()
