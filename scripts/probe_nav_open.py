#!/usr/bin/env python3
"""通过线上 MCP 分批探测 nav_sites 打开耗时（秒），打不开则软删除。

本机通常连不上 RDS，所以走 https://whatab.com/api/mcp，在服务器侧探测并写库。

用法：
  set WA_MCP_TOKEN=wa_mcp_xxx
  python scripts/probe_nav_open.py

也可把 WA_MCP_TOKEN 写进项目根目录 .env（不要提交）。
"""

from __future__ import annotations

import http.client
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MCP_URL = os.environ.get("WA_MCP_URL", "https://whatab.com/api/mcp").rstrip("/")


def load_env_file(path: Path) -> None:
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def mcp_call(token: str, name: str, arguments: dict | None = None, retries: int = 5) -> dict:
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {"name": name, "arguments": arguments or {}},
    }
    last_exc: Exception | None = None
    for attempt in range(1, retries + 1):
        req = urllib.request.Request(
            MCP_URL,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json, text/event-stream",
                "Authorization": f"Bearer {token}",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=180) as resp:
                body = resp.read().decode("utf-8")
            data = json.loads(body)
            if data.get("error"):
                raise RuntimeError(json.dumps(data["error"], ensure_ascii=False))
            result = data.get("result") or {}
            if result.get("isError"):
                text = ""
                for item in result.get("content") or []:
                    if item.get("type") == "text":
                        text = item.get("text") or text
                raise RuntimeError(text or "MCP 工具返回错误")
            text = ""
            for item in result.get("content") or []:
                if item.get("type") == "text":
                    text = item.get("text") or ""
                    break
            if not text:
                return {}
            try:
                return json.loads(text)
            except json.JSONDecodeError:
                return {"raw": text}
        except (urllib.error.URLError, TimeoutError, ConnectionError, http.client.HTTPException) as exc:
            last_exc = exc
            wait = min(30, 2 * attempt)
            print(f"MCP 调用中断（第 {attempt}/{retries} 次）：{exc}；{wait}s 后重试", flush=True)
            time.sleep(wait)
    raise RuntimeError(f"MCP 调用失败：{last_exc}")


def wait_for_tool(token: str) -> dict:
    """部署未就绪时轮询，直到 count_nav_open_stats 可用。"""
    for attempt in range(1, 61):
        try:
            return mcp_call(token, "count_nav_open_stats")
        except Exception as exc:  # noqa: BLE001
            message = str(exc)
            if "未知工具" in message or "count_nav_open_stats" in message or "probe_nav_open" in message:
                print(f"等待部署生效（{attempt}/60）… {exc}", flush=True)
                time.sleep(15)
                continue
            raise
    raise RuntimeError("等待部署超时：count_nav_open_stats 仍不可用")


def main() -> int:
    load_env_file(ROOT / ".env")
    load_env_file(ROOT / ".env.local")
    token = (os.environ.get("WA_MCP_TOKEN") or "").strip()
    if not token:
        print("请设置环境变量 WA_MCP_TOKEN（管理员 MCP 密钥）", file=sys.stderr)
        return 1

    stats = wait_for_tool(token)
    print(
        f"待探测约 {stats.get('missing')} / 存活 {stats.get('alive')} "
        f"（已测 {stats.get('probed')}，已删 {stats.get('deleted')}）",
        flush=True,
    )

    after_id = 0
    probed = soft_deleted = skipped = failed = 0
    for round_no in range(1, 5001):
        result = mcp_call(
            token,
            "probe_nav_open_seconds",
            {
                "limit": 6,
                "after_id": after_id,
                "timeout_ms": 8000,
                "soft_delete": True,
            },
        )
        probed += int(result.get("probed") or 0)
        soft_deleted += int(result.get("soft_deleted") or 0)
        skipped += int(result.get("skipped") or 0)
        failed += int(result.get("failed") or 0)
        after_id = int(result.get("after_id") or after_id)
        print(
            f"#{round_no} scanned={result.get('scanned')} "
            f"probed={result.get('probed')} soft_deleted={result.get('soft_deleted')} "
            f"skipped={result.get('skipped')} failed={result.get('failed')} "
            f"after_id={after_id} 累计测到={probed} 累计软删={soft_deleted}",
            flush=True,
        )
        for item in result.get("errors") or []:
            print(f"  fail id={item.get('id')}: {item.get('error')}", flush=True)
        if result.get("done"):
            # 若因 after_id 扫完但仍有 missing（前面被跳过），从头再扫一轮
            again = mcp_call(token, "count_nav_open_stats")
            missing = int(again.get("missing") or 0)
            if missing > 0 and after_id > 0:
                print(f"还有 {missing} 条未测，从头再扫…", flush=True)
                after_id = 0
                continue
            break

    after = mcp_call(token, "count_nav_open_stats")
    print(
        f"完成：测到 {probed}，软删 {soft_deleted}，跳过 {skipped}，失败 {failed}；"
        f"剩余未测约 {after.get('missing')}，已测 {after.get('probed')}",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
