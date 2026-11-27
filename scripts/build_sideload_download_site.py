#!/usr/bin/env python3
"""Generate a static Sydney iOS sideload download page and SideStore/AltStore source JSON."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import html
import json
import plistlib
import re
import shutil
import sys
import urllib.parse
import zipfile
from pathlib import Path
from typing import Any

DEFAULT_TINT_COLOR = "#B86B43"
DEFAULT_DEVELOPER_NAME = "Sydney Personal Agent"
DEFAULT_SOURCE_NAME = "Sydney 个人下载源"
DEFAULT_SOURCE_SUBTITLE = "Sydney iPhone 侧载版与 SideStore / AltStore 订阅源"
DEFAULT_APP_SUBTITLE = "个人智能助手（iPhone 侧载版）"


def validate_https_base_url(raw: str, label: str) -> str:
    cleaned = raw.strip().rstrip("/")
    parsed = urllib.parse.urlsplit(cleaned)
    if parsed.scheme != "https" or not parsed.netloc:
        raise ValueError(f"{label} must be an https:// URL with a host: {raw!r}")
    if parsed.query or parsed.fragment or parsed.username or parsed.password:
        raise ValueError(f"{label} must not contain credentials, query, or fragment: {raw!r}")
    return cleaned


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def inspect_ipa(ipa_path: Path) -> dict[str, Any]:
    if not ipa_path.is_file():
        raise FileNotFoundError(f"IPA file not found: {ipa_path}")

    with zipfile.ZipFile(ipa_path, "r") as archive:
        names = archive.namelist()
        app_info_candidates = [
            name
            for name in names
            if re.fullmatch(r"Payload/[^/]+\.app/Info\.plist", name)
        ]
        if len(app_info_candidates) != 1:
            raise ValueError(
                f"Expected exactly one Payload/*.app/Info.plist in {ipa_path}, found {app_info_candidates}"
            )
        app_info_entry = app_info_candidates[0]
        app_root = app_info_entry.rsplit("/", 1)[0]
        info = plistlib.loads(archive.read(app_info_entry))

        bundle_id = str(info.get("CFBundleIdentifier") or "").strip()
        version = str(info.get("CFBundleShortVersionString") or "").strip()
        build_version = str(info.get("CFBundleVersion") or "").strip()
        app_name = str(
            info.get("CFBundleDisplayName") or info.get("CFBundleName") or "Sydney"
        ).strip()
        min_os_version = str(info.get("MinimumOSVersion") or "16.0").strip()

        if not bundle_id or not version or not build_version:
            raise ValueError(
                f"IPA Info.plist missing required keys: bundle_id={bundle_id!r}, "
                f"version={version!r}, build_version={build_version!r}"
            )

        privacy = {
            key: str(value)
            for key, value in sorted(info.items())
            if isinstance(key, str)
            and key.startswith("NS")
            and key.endswith("UsageDescription")
            and isinstance(value, str)
            and value.strip()
        }

        expo_entry = f"{app_root}/Expo.plist"
        ota_enabled = False
        ota_runtime_version: str | None = None
        if expo_entry in names:
            expo_plist = plistlib.loads(archive.read(expo_entry))
            ota_enabled = bool(expo_plist.get("EXUpdatesEnabled"))
            runtime = expo_plist.get("EXUpdatesRuntimeVersion")
            if isinstance(runtime, str) and runtime.strip():
                ota_runtime_version = runtime.strip()

        extensions: list[dict[str, str]] = []
        ext_prefix = f"{app_root}/PlugIns/"
        for entry in sorted(names):
            if entry.startswith(ext_prefix) and entry.endswith(".appex/Info.plist"):
                ext_info = plistlib.loads(archive.read(entry))
                ext_dir = entry[len(ext_prefix) :].split("/", 1)[0]
                extensions.append(
                    {
                        "name": ext_dir,
                        "bundleIdentifier": str(ext_info.get("CFBundleIdentifier") or ""),
                    }
                )

    stat = ipa_path.stat()
    return {
        "appName": app_name,
        "bundleIdentifier": bundle_id,
        "version": version,
        "buildVersion": build_version,
        "minOSVersion": min_os_version,
        "size": stat.st_size,
        "sha256": sha256_file(ipa_path),
        "privacy": privacy,
        "otaEnabled": ota_enabled,
        "otaRuntimeVersion": ota_runtime_version,
        "extensions": extensions,
    }


def load_ota_release_metadata(path: Path | None) -> dict[str, Any] | None:
    if path is None or not path.is_file():
        return None
    raw = json.loads(path.read_text(encoding="utf-8"))
    version = str(raw.get("version") or "").strip()
    released_on = str(raw.get("releasedOn") or "").strip()
    notes_obj = raw.get("notes") if isinstance(raw.get("notes"), dict) else {}
    zh_notes = notes_obj.get("zh-CN") if isinstance(notes_obj.get("zh-CN"), list) else []
    notes = [str(item).strip() for item in zh_notes if str(item).strip()]
    if not version:
        return None
    return {
        "version": version,
        "releasedOn": released_on,
        "notes": notes,
    }


def load_previous_versions(previous_source_path: Path | None, bundle_id: str) -> list[dict[str, Any]]:
    if previous_source_path is None or not previous_source_path.is_file():
        return []
    raw = json.loads(previous_source_path.read_text(encoding="utf-8"))
    apps = raw.get("apps") if isinstance(raw, dict) else None
    if not isinstance(apps, list):
        return []
    for app in apps:
        if isinstance(app, dict) and app.get("bundleIdentifier") == bundle_id:
            versions = app.get("versions")
            if isinstance(versions, list):
                return [item for item in versions if isinstance(item, dict)]
    return []


def format_bytes(num_bytes: int) -> str:
    return f"{num_bytes / (1024 * 1024):.1f} MB"


def build_source_manifest(
    *,
    meta: dict[str, Any],
    base_url: str,
    ipa_filename: str,
    release_date: str,
    version_notes: str,
    ota_meta: dict[str, Any] | None,
    previous_versions: list[dict[str, Any]],
    source_name: str,
    source_subtitle: str,
    source_identifier: str,
    icon_filename: str | None,
) -> dict[str, Any]:
    download_url = f"{base_url}/{urllib.parse.quote(ipa_filename)}"
    icon_url = f"{base_url}/{urllib.parse.quote(icon_filename)}" if icon_filename else ""

    current_version_entry: dict[str, Any] = {
        "version": meta["version"],
        "buildVersion": meta["buildVersion"],
        "date": release_date,
        "localizedDescription": version_notes,
        "downloadURL": download_url,
        "size": meta["size"],
        "sha256": meta["sha256"],
        "minOSVersion": meta["minOSVersion"],
    }

    deduped_versions = [current_version_entry]
    seen_keys = {(meta["version"], meta["buildVersion"])}
    for entry in previous_versions:
        key = (str(entry.get("version") or ""), str(entry.get("buildVersion") or ""))
        if key in seen_keys or not key[0]:
            continue
        seen_keys.add(key)
        deduped_versions.append(entry)

    app_description_parts = [
        "Sydney 个人智能助手 iPhone 侧载版，支持多 Bot 对话、项目工作区、云电脑画面、天气地图与个人账单。",
    ]
    if meta["extensions"]:
        app_description_parts.append(
            f"当前安装包包含灵动岛实时活动扩展（共占用 {1 + len(meta['extensions'])} 个免费 Apple ID 名额；若需节省名额，可在 SideStore 安装时选择移除扩展）。"
        )
    if meta["otaEnabled"]:
        ota_suffix = f"（当前最新热更 {ota_meta['version']}）" if ota_meta else ""
        app_description_parts.append(
            f"装好底座后，打开 App 前往「设置 → 检查更新」即可免费在线热更新最新功能{ota_suffix}，无需每次重装 IPA。"
        )

    app_entry: dict[str, Any] = {
        "name": meta["appName"],
        "bundleIdentifier": meta["bundleIdentifier"],
        "developerName": DEFAULT_DEVELOPER_NAME,
        "subtitle": DEFAULT_APP_SUBTITLE,
        "localizedDescription": "\n\n".join(app_description_parts),
        "tintColor": DEFAULT_TINT_COLOR,
        "category": "productivity",
        "versions": deduped_versions,
        "appPermissions": {
            "entitlements": [],
            "privacy": meta["privacy"],
        },
    }
    if icon_url:
        app_entry["iconURL"] = icon_url

    manifest: dict[str, Any] = {
        "name": source_name,
        "subtitle": source_subtitle,
        "description": "面向受邀好友的 Sydney iPhone 无签名侧载安装源。",
        "identifier": source_identifier,
        "sourceURL": f"{base_url}/source.json",
        "website": f"{base_url}/",
        "tintColor": DEFAULT_TINT_COLOR,
        "apps": [app_entry],
        "news": [],
    }
    if icon_url:
        manifest["iconURL"] = icon_url
    return manifest


def render_html(
    *,
    meta: dict[str, Any],
    base_url: str,
    direct_base_url: str | None,
    ipa_filename: str,
    release_date: str,
    version_notes: str,
    ota_meta: dict[str, Any] | None,
    has_icon: bool,
) -> str:
    app_name = html.escape(meta["appName"])
    version = html.escape(meta["version"])
    build_version = html.escape(meta["buildVersion"])
    min_os = html.escape(meta["minOSVersion"])
    size_label = html.escape(format_bytes(meta["size"]))
    sha256 = html.escape(meta["sha256"])
    bundle_id = html.escape(meta["bundleIdentifier"])
    ipa_href = html.escape(urllib.parse.quote(ipa_filename))
    release_day = html.escape(release_date.split("T", 1)[0])

    primary_source_url = f"{base_url}/source.json"
    sidestore_href = html.escape(
        f"sidestore://source?url={urllib.parse.quote(primary_source_url, safe='')}"
    )
    altstore_href = html.escape(
        f"altstore://source?url={urllib.parse.quote(primary_source_url, safe='')}"
    )
    primary_source_escaped = html.escape(primary_source_url)

    direct_section = ""
    if direct_base_url:
        direct_source_url = f"{direct_base_url}/source-direct.json"
        direct_ipa_url = f"{direct_base_url}/{urllib.parse.quote(ipa_filename)}"
        direct_sidestore_href = html.escape(
            f"sidestore://source?url={urllib.parse.quote(direct_source_url, safe='')}"
        )
        direct_source_escaped = html.escape(direct_source_url)
        direct_ipa_escaped = html.escape(direct_ipa_url)
        direct_section = f"""
      <div class="alt-box">
        <div class="alt-title">国内网络直连加速（备用）</div>
        <p class="muted">如果默认域名下载慢，可直接使用服务器 IP 直连源或直连下载 IPA（证书与文件摘要完全一致）：</p>
        <div class="btn-row">
          <a class="btn btn-secondary" href="{direct_sidestore_href}">SideStore 导入直连源</a>
          <button class="btn btn-ghost" type="button" data-copy="{direct_source_escaped}">复制直连源地址</button>
          <a class="btn btn-ghost" href="{direct_ipa_escaped}" download>IP 直连下载 IPA</a>
        </div>
      </div>"""

    ota_badge = ""
    ota_notes_html = ""
    if meta["otaEnabled"] and ota_meta:
        ota_ver = html.escape(ota_meta["version"])
        ota_day = html.escape(ota_meta["releasedOn"] or release_day)
        ota_badge = f'<span class="pill pill-accent">最新热更 OTA v{ota_ver}</span>'
        if ota_meta["notes"]:
            items = "".join(f"<li>{html.escape(line)}</li>" for line in ota_meta["notes"])
            ota_notes_html = f"""
      <div class="notes-block">
        <div class="notes-heading">App 内最新在线热更说明（v{ota_ver} · {ota_day}）</div>
        <ul>{items}</ul>
      </div>"""

    ext_count = len(meta["extensions"])
    app_id_count = 1 + ext_count
    ext_hint = (
        f"包含灵动岛扩展，共占 {app_id_count} 个免费 Apple ID 名额；若 SideStore 提示名额不足，安装时选「Remove Extensions」即可只占 1 个名额。"
        if ext_count > 0
        else "无额外扩展，仅占 1 个免费 Apple ID 名额。"
    )

    icon_markup = (
        '<img class="app-icon" src="./icon.png" alt="Sydney 图标" width="76" height="76">'
        if has_icon
        else '<div class="app-icon app-icon-fallback" aria-hidden="true">S</div>'
    )
    notes_escaped = html.escape(version_notes).replace("\n", "<br>")

    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <meta name="referrer" content="no-referrer">
  <title>{app_name} iPhone 下载与侧载安装</title>
  <style>
    :root {{
      --bg: #f5f2eb;
      --surface: #fcfaf6;
      --surface-soft: #f0ebe1;
      --border: rgba(45, 36, 28, 0.10);
      --text: #221d18;
      --muted: #655b51;
      --accent: #b86b43;
      --accent-dark: #975230;
      --accent-soft: rgba(184, 107, 67, 0.12);
      --ok: #256f46;
      --radius: 20px;
    }}
    @media (prefers-color-scheme: dark) {{
      :root {{
        --bg: #15171c;
        --surface: #1e2128;
        --surface-soft: #262a33;
        --border: rgba(255, 255, 255, 0.10);
        --text: #f2efe9;
        --muted: #aba49a;
        --accent: #d8895e;
        --accent-dark: #e69d74;
        --accent-soft: rgba(216, 137, 94, 0.16);
        --ok: #6fd199;
      }}
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Helvetica Neue", sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }}
    .wrap {{
      max-width: 720px;
      margin: 0 auto;
      padding: 28px 18px 56px;
    }}
    .card {{
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 22px;
      margin-bottom: 16px;
      box-shadow: 0 8px 28px rgba(0, 0, 0, 0.04);
    }}
    .hero {{
      display: flex;
      gap: 18px;
      align-items: center;
      flex-wrap: wrap;
    }}
    .app-icon {{
      width: 76px;
      height: 76px;
      border-radius: 18px;
      border: 1px solid var(--border);
      object-fit: cover;
      flex: 0 0 auto;
    }}
    .app-icon-fallback {{
      display: grid;
      place-items: center;
      background: var(--accent-soft);
      color: var(--accent);
      font-size: 32px;
      font-weight: 700;
    }}
    h1 {{
      margin: 0 0 6px;
      font-size: 24px;
      line-height: 1.25;
      letter-spacing: -0.02em;
    }}
    h2 {{
      margin: 0 0 10px;
      font-size: 17px;
      line-height: 1.35;
    }}
    p {{
      margin: 0 0 12px;
    }}
    .muted {{
      color: var(--muted);
      font-size: 14px;
    }}
    .pills {{
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 8px;
    }}
    .pill {{
      display: inline-flex;
      align-items: center;
      padding: 3px 10px;
      border-radius: 999px;
      background: var(--surface-soft);
      color: var(--muted);
      font-size: 12.5px;
      font-weight: 500;
    }}
    .pill-accent {{
      background: var(--accent-soft);
      color: var(--accent);
    }}
    .btn-row {{
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 12px;
    }}
    .btn {{
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      padding: 10px 16px;
      border-radius: 13px;
      border: 1px solid transparent;
      font-size: 14.5px;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
      font-family: inherit;
      transition: opacity 0.15s ease, transform 0.1s ease;
    }}
    .btn:active {{
      transform: scale(0.98);
    }}
    .btn-primary {{
      background: var(--accent);
      color: #fff;
    }}
    .btn-primary:hover {{
      background: var(--accent-dark);
    }}
    .btn-secondary {{
      background: var(--surface-soft);
      color: var(--text);
      border-color: var(--border);
    }}
    .btn-ghost {{
      background: transparent;
      color: var(--text);
      border-color: var(--border);
    }}
    .code-box {{
      margin-top: 12px;
      padding: 10px 12px;
      border-radius: 12px;
      background: var(--surface-soft);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12.5px;
      word-break: break-all;
      color: var(--text);
      border: 1px solid var(--border);
    }}
    .alt-box {{
      margin-top: 16px;
      padding-top: 14px;
      border-top: 1px dashed var(--border);
    }}
    .alt-title {{
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 6px;
    }}
    ol, ul {{
      margin: 8px 0 0;
      padding-left: 20px;
    }}
    li {{
      margin-bottom: 8px;
      font-size: 14.5px;
    }}
    .notes-block {{
      margin-top: 14px;
      padding: 12px 14px;
      border-radius: 14px;
      background: var(--surface-soft);
    }}
    .notes-heading {{
      font-size: 13.5px;
      font-weight: 600;
      margin-bottom: 6px;
    }}
    .meta-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 10px;
      margin-top: 12px;
    }}
    .meta-item {{
      padding: 10px 12px;
      border-radius: 12px;
      background: var(--surface-soft);
    }}
    .meta-label {{
      font-size: 12px;
      color: var(--muted);
    }}
    .meta-val {{
      font-size: 14px;
      font-weight: 600;
      margin-top: 2px;
    }}
    .toast {{
      position: fixed;
      left: 50%;
      bottom: 24px;
      transform: translateX(-50%) translateY(16px);
      padding: 10px 16px;
      border-radius: 999px;
      background: var(--text);
      color: var(--bg);
      font-size: 13.5px;
      font-weight: 500;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s ease, transform 0.2s ease;
    }}
    .toast.show {{
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }}
    footer {{
      text-align: center;
      font-size: 12.5px;
      color: var(--muted);
      margin-top: 10px;
    }}
  </style>
</head>
<body>
  <main class="wrap">
    <section class="card">
      <div class="hero">
        {icon_markup}
        <div>
          <h1>{app_name} for iPhone</h1>
          <div class="muted">受邀好友私密免费侧载分发页</div>
          <div class="pills">
            <span class="pill">原生底座 v{version} (Build {build_version})</span>
            {ota_badge}
            <span class="pill">{size_label}</span>
            <span class="pill">iOS {min_os}+</span>
          </div>
        </div>
      </div>
      <div class="meta-grid">
        <div class="meta-item">
          <div class="meta-label">Bundle ID</div>
          <div class="meta-val">{bundle_id}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">底座更新日期</div>
          <div class="meta-val">{release_day}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">在线热更新</div>
          <div class="meta-val">{"已启用（App 内检查更新）" if meta["otaEnabled"] else "未启用"}</div>
        </div>
      </div>
    </section>

    <section class="card">
      <h2>方式一：SideStore / AltStore 一键添加订阅源（推荐）</h2>
      <p class="muted">手机已安装 SideStore 或 AltStore 时，点击下方按钮即可自动添加 Sydney 源并直接下载安装；后续有新版 IPA 时可直接在手机内点更新，且支持连 Wi-Fi 续签。</p>
      <div class="btn-row">
        <a class="btn btn-primary" href="{sidestore_href}">在 SideStore 中添加源</a>
        <a class="btn btn-secondary" href="{altstore_href}">在 AltStore 中添加源</a>
        <button class="btn btn-ghost" type="button" data-copy="{primary_source_escaped}">复制源链接</button>
      </div>
      <div class="code-box">{primary_source_escaped}</div>
      {direct_section}
    </section>

    <section class="card">
      <h2>方式二：直接下载无签名 IPA（电脑侧载）</h2>
      <p class="muted">若使用电脑上的 <strong>Sideloadly</strong> 或 <strong>iPASide</strong>，直接下载下方 IPA 并用你自己的免费 Apple ID 签名装入 iPhone 即可。</p>
      <div class="btn-row">
        <a class="btn btn-primary" href="./{ipa_href}" download>直接下载 {html.escape(ipa_filename)}</a>
        <a class="btn btn-ghost" href="./SHA256.txt">查看 SHA256.txt</a>
        <button class="btn btn-ghost" type="button" data-copy="{sha256}">复制 SHA-256</button>
      </div>
      <div class="code-box">SHA-256: {sha256}</div>
      <div class="notes-block">
        <div class="notes-heading">当前原生底座说明（v{version} Build {build_version}）</div>
        <p class="muted" style="margin:0">{notes_escaped}</p>
      </div>
      {ota_notes_html}
    </section>

    <section class="card">
      <h2>安装与续签简明步骤</h2>
      <ol>
        <li><strong>首次安装：</strong>免费 Apple ID 需用电脑安装一次 SideStore（推荐，以后不用插电脑）或直接用 Sideloadly 拖入 IPA 签名安装。</li>
        <li><strong>信任证书与开发者模式：</strong>装好后在 iPhone 打开「设置 → 通用 → VPN 与设备管理」信任你的个人账号证书；首次侧载需在「设置 → 隐私与安全性」底部开启开发者模式并重启。</li>
        <li><strong>拉取最新功能（免费 OTA）：</strong>进入 Sydney 登录后，前往「设置 → 检查更新」下载最新热更新并重启，日常功能更新均无需重装 IPA。</li>
        <li><strong>7 天续签与 App ID 说明：</strong>免费 Apple ID 证书每 7 天续签一次（SideStore 手机连 Wi-Fi 点刷新即可）。{html.escape(ext_hint)}</li>
      </ol>
    </section>

    <footer>本页面仅限私密链接访问，请勿公开转发或上传至第三方重签平台。</footer>
  </main>

  <div class="toast" id="toast" role="status" aria-live="polite"></div>
  <script>
    (function () {{
      var toast = document.getElementById("toast");
      var timer = null;
      function showToast(msg) {{
        toast.textContent = msg;
        toast.classList.add("show");
        clearTimeout(timer);
        timer = setTimeout(function () {{ toast.classList.remove("show"); }}, 2200);
      }}
      function copyText(text) {{
        if (navigator.clipboard && navigator.clipboard.writeText) {{
          return navigator.clipboard.writeText(text);
        }}
        return new Promise(function (resolve, reject) {{
          var area = document.createElement("textarea");
          area.value = text;
          area.style.position = "fixed";
          area.style.opacity = "0";
          document.body.appendChild(area);
          area.select();
          try {{
            if (document.execCommand("copy")) resolve();
            else reject(new Error("copy failed"));
          }} catch (e) {{
            reject(e);
          }} finally {{
            document.body.removeChild(area);
          }}
        }});
      }}
      document.querySelectorAll("[data-copy]").forEach(function (btn) {{
        btn.addEventListener("click", function () {{
          var value = btn.getAttribute("data-copy") || "";
          copyText(value).then(
            function () {{ showToast("已复制到剪贴板"); }},
            function () {{ showToast("复制失败，请长按上方地址手动复制"); }}
          );
        }});
      }});
    }})();
  </script>
</body>
</html>
"""


def generate_site(
    *,
    ipa_path: Path,
    output_dir: Path,
    base_url: str,
    direct_base_url: str | None = None,
    icon_path: Path | None = None,
    ota_release_path: Path | None = None,
    previous_source_path: Path | None = None,
    release_date: str | None = None,
    version_notes: str | None = None,
    source_name: str = DEFAULT_SOURCE_NAME,
    source_subtitle: str = DEFAULT_SOURCE_SUBTITLE,
) -> dict[str, Any]:
    validated_base = validate_https_base_url(base_url, "base_url")
    validated_direct = (
        validate_https_base_url(direct_base_url, "direct_base_url")
        if direct_base_url
        else None
    )

    meta = inspect_ipa(ipa_path)
    ota_meta = load_ota_release_metadata(ota_release_path)
    previous_versions = load_previous_versions(
        previous_source_path, meta["bundleIdentifier"]
    )

    resolved_date = release_date or dt.datetime.now(dt.timezone.utc).replace(
        microsecond=0
    ).isoformat().replace("+00:00", "Z")
    resolved_notes = (
        version_notes.strip()
        if version_notes and version_notes.strip()
        else f"Sydney iPhone 无签名侧载底座 {meta['version']}（Build {meta['buildVersion']}），安装后支持在 App 内免费拉取最新 Expo OTA 热更新。"
    )

    ipa_filename = f"{meta['appName']}-{meta['version']}-{meta['buildVersion']}-unsigned.ipa"
    output_dir.mkdir(parents=True, exist_ok=True)

    target_ipa = output_dir / ipa_filename
    if ipa_path.resolve() != target_ipa.resolve():
        shutil.copy2(ipa_path, target_ipa)

    icon_filename: str | None = None
    if icon_path is not None and icon_path.is_file():
        icon_filename = "icon.png"
        target_icon = output_dir / icon_filename
        if icon_path.resolve() != target_icon.resolve():
            shutil.copy2(icon_path, target_icon)

    (output_dir / "SHA256.txt").write_text(
        f"{meta['sha256']}  {ipa_filename}\n", encoding="utf-8"
    )

    source_identifier = f"{meta['bundleIdentifier']}.source"
    primary_source = build_source_manifest(
        meta=meta,
        base_url=validated_base,
        ipa_filename=ipa_filename,
        release_date=resolved_date,
        version_notes=resolved_notes,
        ota_meta=ota_meta,
        previous_versions=previous_versions,
        source_name=source_name,
        source_subtitle=source_subtitle,
        source_identifier=source_identifier,
        icon_filename=icon_filename,
    )
    (output_dir / "source.json").write_text(
        json.dumps(primary_source, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    generated_files = ["index.html", "source.json", "SHA256.txt", ipa_filename]
    if icon_filename:
        generated_files.append(icon_filename)

    if validated_direct:
        direct_source = build_source_manifest(
            meta=meta,
            base_url=validated_direct,
            ipa_filename=ipa_filename,
            release_date=resolved_date,
            version_notes=resolved_notes,
            ota_meta=ota_meta,
            previous_versions=[],
            source_name=f"{source_name}（直连）",
            source_subtitle=source_subtitle,
            source_identifier=f"{source_identifier}.direct",
            icon_filename=icon_filename,
        )
        direct_source["sourceURL"] = f"{validated_direct}/source-direct.json"
        (output_dir / "source-direct.json").write_text(
            json.dumps(direct_source, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        generated_files.append("source-direct.json")

    html_text = render_html(
        meta=meta,
        base_url=validated_base,
        direct_base_url=validated_direct,
        ipa_filename=ipa_filename,
        release_date=resolved_date,
        version_notes=resolved_notes,
        ota_meta=ota_meta,
        has_icon=icon_filename is not None,
    )
    (output_dir / "index.html").write_text(html_text, encoding="utf-8")

    return {
        "ipaFilename": ipa_filename,
        "meta": meta,
        "otaMeta": ota_meta,
        "generatedFiles": generated_files,
        "sourceUrl": f"{validated_base}/source.json",
        "directSourceUrl": f"{validated_direct}/source-direct.json"
        if validated_direct
        else None,
    }


def main(argv: list[str] | None = None) -> int:
    repo_root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(
        description="Build static download page and SideStore/AltStore source JSON for Sydney iOS IPA."
    )
    parser.add_argument("--ipa", required=True, type=Path, help="Path to unsigned .ipa file")
    parser.add_argument(
        "--output-dir", required=True, type=Path, help="Output directory for static site files"
    )
    parser.add_argument(
        "--base-url",
        required=True,
        help="Public HTTPS base URL where output-dir will be served (e.g. https://pc.zxlup.xin/download/<token>)",
    )
    parser.add_argument(
        "--direct-base-url",
        default=None,
        help="Optional direct HTTPS IP base URL for Mainland fallback source-direct.json",
    )
    parser.add_argument(
        "--icon",
        type=Path,
        default=repo_root / "apps" / "mobile" / "assets" / "icon.png",
        help="Optional PNG icon file to copy into output-dir",
    )
    parser.add_argument(
        "--ota-release-json",
        type=Path,
        default=repo_root / "apps" / "mobile" / "sydney-release.json",
        help="Optional sydney-release.json path to show latest OTA notes on the download page",
    )
    parser.add_argument(
        "--previous-source",
        type=Path,
        default=None,
        help="Optional existing source.json to retain prior versions in versions[]",
    )
    parser.add_argument(
        "--release-date",
        default=None,
        help="ISO-8601 release timestamp (defaults to current UTC time)",
    )
    parser.add_argument(
        "--notes",
        default=None,
        help="Release notes for the IPA version entry",
    )
    args = parser.parse_args(argv)

    summary = generate_site(
        ipa_path=args.ipa,
        output_dir=args.output_dir,
        base_url=args.base_url,
        direct_base_url=args.direct_base_url,
        icon_path=args.icon,
        ota_release_path=args.ota_release_json,
        previous_source_path=args.previous_source,
        release_date=args.release_date,
        version_notes=args.notes,
    )
    print(
        json.dumps(
            {
                "ipaFilename": summary["ipaFilename"],
                "version": summary["meta"]["version"],
                "buildVersion": summary["meta"]["buildVersion"],
                "size": summary["meta"]["size"],
                "sha256": summary["meta"]["sha256"],
                "extensions": len(summary["meta"]["extensions"]),
                "generatedFiles": summary["generatedFiles"],
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
