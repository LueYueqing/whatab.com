#!/usr/bin/env python3
"""本机直连 RDS + OSS，多线程转存 nav_sites 外链图标。

用法：
  python scripts/migrate_nav_icons_local.py

环境变量（可选）：
  WA_ICON_WORKERS  并发数，默认 12
  WA_ICON_BATCH    每批条数，默认 80
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from email.utils import format_datetime
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
WORKERS = int(os.environ.get("WA_ICON_WORKERS", "12"))
BATCH = int(os.environ.get("WA_ICON_BATCH", "80"))
TIMEOUT = 15
MAX_BYTES = 2 * 1024 * 1024
UA = "whatab-icon/1.0"


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


def strip_host(value: str) -> str:
    text = (value or "").strip().replace("https://", "").replace("http://", "")
    return text.rstrip("/")


def oss_cfg() -> dict:
    access_key_id = os.environ.get("ALIYUN_ACCESS_KEY_ID", "")
    access_key_secret = os.environ.get("ALIYUN_ACCESS_KEY_SECRET", "")
    bucket = os.environ.get("ALIYUN_OSS_BUCKET", "")
    endpoint = strip_host(os.environ.get("ALIYUN_OSS_ENDPOINT", ""))
    domain = (os.environ.get("ALIYUN_OSS_DOMAIN") or "").strip().rstrip("/")
    picnan = (os.environ.get("ALIYUN_OSS_DOMAIN_PICNAN") or "").strip().rstrip("/")
    if domain and not domain.startswith("http"):
        domain = f"https://{domain}"
    if picnan and not picnan.startswith("http"):
        picnan = f"https://{picnan}"
    host = endpoint
    if bucket and host and not host.startswith(f"{bucket}."):
        host = f"{bucket}.{host}"
    return {
        "access_key_id": access_key_id,
        "access_key_secret": access_key_secret,
        "bucket": bucket,
        "endpoint": endpoint,
        "host": host,
        "domain": domain,
        "picnan": picnan,
        "ready": bool(access_key_id and access_key_secret and bucket and endpoint),
    }


def is_own_icon(url: str) -> bool:
    text = (url or "").strip().lower()
    return "/nav-icons/" in text and any(
        part in text for part in ("aliyuncs.com", "tkrmw.com", "picnan")
    )


def needs_mirror(icon: str) -> bool:
    text = (icon or "").strip()
    if not text or text.startswith("data:"):
        return False
    if is_own_icon(text):
        return False
    if text.startswith("/static/") or text.startswith("/uploads/"):
        return True
    return text.lower().startswith(("http://", "https://"))


def detect_ext(data: bytes, content_type: str) -> tuple[str, str]:
    mime = (content_type or "").lower()
    if data[:8].startswith(b"\x89PNG") or "png" in mime:
        return "png", "image/png"
    if data[:3] == b"\xff\xd8\xff" or "jpeg" in mime or "jpg" in mime:
        return "jpg", "image/jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp", "image/webp"
    if data[:3] == b"GIF" or "gif" in mime:
        return "gif", "image/gif"
    if data[:4] == b"\x00\x00\x01\x00" or "icon" in mime:
        return "ico", "image/x-icon"
    return "png", "image/png"


def download_icon(url: str) -> tuple[bytes, str]:
    text = (url or "").strip()
    if text.startswith("/static/") or text.startswith("/uploads/"):
        path = ROOT / "public" / text.lstrip("/")
        data = path.read_bytes()
        if not data:
            raise RuntimeError("本地图标为空")
        if len(data) > MAX_BYTES:
            raise RuntimeError("图标不能超过 2MB")
        return data, ""
    req = urllib.request.Request(
        text,
        headers={"User-Agent": UA, "Accept": "image/*,*/*;q=0.8"},
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        data = resp.read(MAX_BYTES + 1)
        content_type = resp.headers.get("Content-Type") or ""
    if not data:
        raise RuntimeError("图标为空")
    if len(data) > MAX_BYTES:
        raise RuntimeError("图标不能超过 2MB")
    return data, content_type


def put_oss(data: bytes, content_type: str) -> str:
    cfg = oss_cfg()
    if not cfg["ready"]:
        raise RuntimeError("上传服务还没有配置")
    ext, ctype = detect_ext(data, content_type)
    key = f"nav-icons/{secrets.token_hex(8)}.{ext}"
    date = format_datetime(datetime.now(timezone.utc), usegmt=True)
    resource = f"/{cfg['bucket']}/{key}"
    oss_headers = {"x-oss-object-acl": "public-read"}
    canonical = "".join(f"{k}:{oss_headers[k]}\n" for k in sorted(oss_headers))
    string_to_sign = f"PUT\n\n{ctype}\n{date}\n{canonical}{resource}"
    signature = base64.b64encode(
        hmac.new(cfg["access_key_secret"].encode(), string_to_sign.encode(), hashlib.sha1).digest()
    ).decode()
    headers = {
        "Date": date,
        "Authorization": f"OSS {cfg['access_key_id']}:{signature}",
        "Content-Type": ctype,
        "Content-Length": str(len(data)),
        "Cache-Control": "public, max-age=31536000",
        **oss_headers,
    }
    req = urllib.request.Request(
        f"https://{cfg['host']}/{key}",
        data=data,
        headers=headers,
        method="PUT",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            if resp.status != 200:
                raise RuntimeError(f"上传失败 HTTP {resp.status}")
    except urllib.error.HTTPError as exc:
        if exc.code != 403:
            raise RuntimeError(f"上传失败 HTTP {exc.code}") from exc
        # 无 ACL 头再试
        string_to_sign = f"PUT\n\n{ctype}\n{date}\n{resource}"
        signature = base64.b64encode(
            hmac.new(cfg["access_key_secret"].encode(), string_to_sign.encode(), hashlib.sha1).digest()
        ).decode()
        headers = {
            "Date": date,
            "Authorization": f"OSS {cfg['access_key_id']}:{signature}",
            "Content-Type": ctype,
            "Content-Length": str(len(data)),
            "Cache-Control": "public, max-age=31536000",
        }
        req = urllib.request.Request(
            f"https://{cfg['host']}/{key}",
            data=data,
            headers=headers,
            method="PUT",
        )
        with urllib.request.urlopen(req, timeout=20) as resp:
            if resp.status != 200:
                raise RuntimeError(f"上传失败 HTTP {resp.status}")
    base = (cfg["picnan"] or f"https://{cfg['host']}" or cfg["domain"]).rstrip("/")
    return f"{base}/{key}"


def migrate_one(row: tuple) -> tuple[str, int, str]:
    site_id, logo, icon_url = row
    current = (logo or icon_url or "").strip()
    if not current or is_own_icon(current) or not needs_mirror(current):
        return "skipped", site_id, ""
    try:
        data, content_type = download_icon(current)
        next_url = put_oss(data, content_type)
        if not next_url or next_url == current:
            return "skipped", site_id, ""
        return "migrated", site_id, next_url
    except Exception as exc:  # noqa: BLE001
        return "failed", site_id, str(exc)[:180]


def main() -> int:
    load_env_file(ROOT / ".env")
    load_env_file(ROOT / ".env.local")
    try:
        import pymysql
    except ImportError:
        print("请先安装 pymysql：pip install pymysql", file=sys.stderr)
        return 1
    if not oss_cfg()["ready"]:
        print("缺少 OSS 配置", file=sys.stderr)
        return 1

    conn = pymysql.connect(
        host=os.environ["DB_HOST"],
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
        database=os.environ["DB_NAME"],
        charset="utf8mb4",
        connect_timeout=12,
        read_timeout=60,
        write_timeout=60,
        autocommit=True,
    )
    migrated = skipped = failed = 0
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT COUNT(*) FROM nav_sites
                WHERE (
                  (
                    COALESCE(NULLIF(logo, ''), NULLIF(icon_url, '')) LIKE 'http%%'
                    AND COALESCE(NULLIF(logo, ''), NULLIF(icon_url, '')) NOT LIKE '%%/nav-icons/%%'
                  )
                  OR COALESCE(NULLIF(logo, ''), NULLIF(icon_url, '')) LIKE '/static/%%'
                  OR COALESCE(NULLIF(logo, ''), NULLIF(icon_url, '')) LIKE '/uploads/%%'
                )
                """
            )
            missing = int(cur.fetchone()[0])
            print(f"待转存约 {missing}（并发 {WORKERS}，每批 {BATCH}）", flush=True)

            after_id = 0
            round_no = 0
            while True:
                round_no += 1
                cur.execute(
                    """
                    SELECT id, logo, icon_url FROM nav_sites
                    WHERE id > %s
                      AND (
                        (
                          COALESCE(NULLIF(logo, ''), NULLIF(icon_url, '')) LIKE 'http%%'
                          AND COALESCE(NULLIF(logo, ''), NULLIF(icon_url, '')) NOT LIKE '%%/nav-icons/%%'
                        )
                        OR COALESCE(NULLIF(logo, ''), NULLIF(icon_url, '')) LIKE '/static/%%'
                        OR COALESCE(NULLIF(logo, ''), NULLIF(icon_url, '')) LIKE '/uploads/%%'
                      )
                    ORDER BY id ASC
                    LIMIT %s
                    """,
                    (after_id, BATCH),
                )
                rows = cur.fetchall()
                if not rows:
                    break

                results = []
                with ThreadPoolExecutor(max_workers=WORKERS) as pool:
                    futures = {pool.submit(migrate_one, row): row[0] for row in rows}
                    for fut in as_completed(futures):
                        results.append(fut.result())

                batch_migrated = batch_skipped = batch_failed = 0
                for kind, site_id, payload in sorted(results, key=lambda item: item[1]):
                    after_id = max(after_id, site_id)
                    if kind == "migrated":
                        cur.execute(
                            "UPDATE nav_sites SET logo = %s, icon_url = %s WHERE id = %s",
                            (payload, payload, site_id),
                        )
                        migrated += 1
                        batch_migrated += 1
                    elif kind == "skipped":
                        skipped += 1
                        batch_skipped += 1
                    else:
                        failed += 1
                        batch_failed += 1
                        print(f"  fail id={site_id}: {payload}", flush=True)

                print(
                    f"#{round_no} scanned={len(rows)} migrated={batch_migrated} "
                    f"skipped={batch_skipped} failed={batch_failed} after_id={after_id} "
                    f"累计成功={migrated}",
                    flush=True,
                )
                if len(rows) < BATCH:
                    break
    finally:
        conn.close()

    print(f"完成：成功 {migrated}，跳过 {skipped}，失败 {failed}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
