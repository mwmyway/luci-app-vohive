#!/bin/sh

set -eu

. /usr/share/vohive/lib.sh

BIN_DIR="/etc/vohive/bin"
BIN="$BIN_DIR/vohive"
BACKUP="$BIN_DIR/vohive.bak"
VERSION_FILE="$BIN_DIR/version"
BACKUP_VERSION_FILE="$BIN_DIR/version.bak"
DOWNLOAD_DIR="/tmp/vohive/download"

fail() {
	printf '{"ok":false,"message":"%s"}\n' "$(json_escape "$*")"
	exit 1
}

repo="$(github_repo_slug "$(uci_get release_repo 'https://github.com/iniwex5/vohive-release')")"
version="${1:-}"
[ -n "$version" ] || version="$(uci_get version 'latest')"
[ -n "$version" ] || version="latest"

validate_github_repo "$repo" || fail "Invalid GitHub repository: $repo"

arch="$(uname -m)"
case "$arch" in
	aarch64|arm64) asset_arch="arm64" ;;
	x86_64|amd64) asset_arch="amd64" ;;
	armv7l|armv7) asset_arch="armv7" ;;
	*) fail "Unsupported architecture: $arch" ;;
esac

if [ "$version" = "latest" ] || [ "$version" = "stable" ]; then
	latest_json="$(curl -fsSL --show-error --connect-timeout 15 --retry 2 "https://api.github.com/repos/$repo/releases/latest")" || fail "Failed to query latest release"
	version="$(printf '%s' "$latest_json" | jsonfilter -e '@.tag_name' 2>/dev/null || true)"
	[ -n "$version" ] || fail "Failed to parse latest release"
fi

asset="vohive_${version}_linux_${asset_arch}"
url="https://github.com/$repo/releases/download/$version/$asset"
downloaded="$DOWNLOAD_DIR/$asset"
was_running=0

mkdir -p "$BIN_DIR" "$DOWNLOAD_DIR"
rm -f "$downloaded"

curl -fsSL --show-error --connect-timeout 15 --retry 2 "$url" -o "$downloaded" || fail "Failed to download $url"
[ -s "$downloaded" ] || fail "Downloaded file is empty"
chmod +x "$downloaded"

if command -v file >/dev/null 2>&1; then
	file "$downloaded" | grep -Eq 'ELF|executable' || fail "Downloaded file is not an executable"
fi

/etc/init.d/vohive running >/dev/null 2>&1 && was_running=1
[ "$was_running" = "0" ] || /etc/init.d/vohive stop || true

if [ -x "$BIN" ]; then
	cp -f "$BIN" "$BACKUP"
	if [ -s "$VERSION_FILE" ]; then
		cp -f "$VERSION_FILE" "$BACKUP_VERSION_FILE"
	else
		printf '已安装，版本未知\n' > "$BACKUP_VERSION_FILE"
	fi
fi

cp -f "$downloaded" "$BIN"
chmod 0755 "$BIN"
printf '%s\n' "$version" > "$VERSION_FILE"

if [ "$was_running" = "1" ]; then
	if ! /etc/init.d/vohive start >/tmp/vohive-start.log 2>&1; then
		if [ -f "$BACKUP" ]; then
			cp -f "$BACKUP" "$BIN"
			/etc/init.d/vohive start >/dev/null 2>&1 || true
		fi
		fail "Core installed but service failed to start; rolled back when possible"
	fi
fi

printf '{"ok":true,"message":"已安装 VoHive 核心 %s"}\n' "$(json_escape "$version")"
