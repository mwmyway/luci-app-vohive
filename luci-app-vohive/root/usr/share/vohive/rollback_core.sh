#!/bin/sh

set -eu

. /usr/share/vohive/lib.sh

BIN="/etc/vohive/bin/vohive"
BACKUP="/etc/vohive/bin/vohive.bak"
VERSION_FILE="/etc/vohive/bin/version"
BACKUP_VERSION_FILE="/etc/vohive/bin/version.bak"

fail() {
	printf '{"ok":false,"message":"%s"}\n' "$(json_escape "$*")"
	exit 1
}

[ -s "$BACKUP" ] || fail "No backup core found"

was_running=0
/etc/init.d/vohive running >/dev/null 2>&1 && was_running=1
[ "$was_running" = "0" ] || /etc/init.d/vohive stop || true

cp -f "$BACKUP" "$BIN"
chmod +x "$BIN"
rollback_version="$(cat "$BACKUP_VERSION_FILE" 2>/dev/null || true)"
[ -n "$rollback_version" ] || rollback_version="已安装，版本未知"
printf '%s\n' "$rollback_version" > "$VERSION_FILE"

if [ "$was_running" = "1" ]; then
	/etc/init.d/vohive start || fail "Rolled back core, but service failed to start"
fi

printf '{"ok":true,"message":"已回滚到 %s"}\n' "$(json_escape "$rollback_version")"
