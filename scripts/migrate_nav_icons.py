#!/usr/bin/env python3
"""通过线上 MCP 接口，把 nav_sites 外链图标批量转存到自有 OSS。

本机通常连不上 RDS，所以走 https://whatab.com/api/mcp，在服务器侧执行转存。

用法：
  set WA_MCP_TOKEN=wa_mcp_xxx
  python scripts/migrate_nav_icons.py

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


def is_external_icon(icon: str) -> bool:
    text = (icon or "").strip()
    if not text.startswith("http"):
        return bool(text.startswith("/static/") or text.startswith("/uploads/"))
    lower = text.lower()
    if "/nav-icons/" in lower:
        return False
    if any(part in lower for part in ("aliyuncs.com", "tkrmw.com", "picnan")):
        return False
    return True


def migrate_via_update(token: str) -> int:
    """兼容尚未部署 migrate_nav_icons 工具时：逐条 update 触发 saveSite 转存。"""
    print("改用 list_global_sites + update_global_site 逐条转存…")
    offset = 0
    migrated = skipped = failed = 0
    while True:
        data = mcp_call(token, "list_global_sites", {"offset": offset, "q": ""})
        sites = data.get("sites") or []
        total = int(data.get("total") or 0)
        page = int(data.get("page_size") or len(sites) or 20)
        if not sites:
            break
        for site in sites:
            icon = site.get("icon") or ""
            if not is_external_icon(icon):
                skipped += 1
                continue
            try:
                mcp_call(
                    token,
                    "update_global_site",
                    {
                        "id": site["id"],
                        "icon": icon,
                        "title": site.get("title"),
                        "url": site.get("url"),
                        "categories": site.get("categories") or [],
                        "keyword": site.get("keyword") or "",
                        "description": site.get("description") or "",
                        "sort_order": site.get("sort_order"),
                        "popularity": site.get("popularity"),
                        "is_enabled": site.get("is_enabled"),
                    },
                )
                migrated += 1
                print(f"已转存 id={site['id']} {site.get('title')}")
            except Exception as exc:  # noqa: BLE001
                failed += 1
                print(f"失败 id={site.get('id')}: {exc}")
        offset += page
        if offset >= total:
            break
    print(f"完成：成功 {migrated}，跳过 {skipped}，失败 {failed}")
    return 0 if migrated or not failed else 1


def main() -> int:
    load_env_file(ROOT / ".env")
    load_env_file(ROOT / ".env.local")
    token = (os.environ.get("WA_MCP_TOKEN") or "").strip()
    if not token:
        print("请设置环境变量 WA_MCP_TOKEN（管理员 MCP 密钥）", file=sys.stderr)
        return 1

    try:
        stats = mcp_call(token, "count_nav_icon_stats")
    except Exception as exc:  # noqa: BLE001
        message = str(exc)
        if "未知工具" in message or "migrate_nav_icons" in message or "count_nav_icon_stats" in message:
            return migrate_via_update(token)
        print(f"统计失败（若刚部署请稍等）：{exc}", file=sys.stderr)
        return 1

    print(f"待转存约 {stats.get('external')} / {stats.get('total')}", flush=True)
    after_id = 0
    migrated = skipped = failed = 0
    for round_no in range(1, 2001):
        result = mcp_call(
            token,
            "migrate_nav_icons",
            {"limit": 20, "after_id": after_id},
        )
        migrated += int(result.get("migrated") or 0)
        skipped += int(result.get("skipped") or 0)
        failed += int(result.get("failed") or 0)
        after_id = int(result.get("after_id") or after_id)
        print(
            f"#{round_no} scanned={result.get('scanned')} "
            f"migrated={result.get('migrated')} skipped={result.get('skipped')} "
            f"failed={result.get('failed')} after_id={after_id} "
            f"累计成功={migrated}",
            flush=True,
        )
        for item in result.get("errors") or []:
            print(f"  fail id={item.get('id')}: {item.get('error')}", flush=True)
        if result.get("done"):
            break

    after = mcp_call(token, "count_nav_icon_stats")
    print(
        f"完成：成功 {migrated}，跳过 {skipped}，失败 {failed}；"
        f"剩余外链约 {after.get('external')}",
        flush=True,
    )
    return 0 if migrated or not failed else 1


if __name__ == "__main__":
    raise SystemExit(main())
