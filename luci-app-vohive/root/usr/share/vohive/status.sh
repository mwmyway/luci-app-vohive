#!/bin/sh

BIN="/etc/vohive/bin/vohive"
VERSION_FILE="/etc/vohive/bin/version"
BACKUP_VERSION_FILE="/etc/vohive/bin/version.bak"

json_escape() {
	printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g; s/	/\\t/g'
}

uci_get() {
	local key="$1"
	local default="$2"
	local value

	value="$(uci -q get "vohive.main.$key" 2>/dev/null || true)"
	[ -n "$value" ] && printf '%s' "$value" || printf '%s' "$default"
}

is_running=0
/etc/init.d/vohive running >/dev/null 2>&1 && is_running=1

enabled="$(uci_get enabled '0')"
host="$(uci_get host '0.0.0.0')"
port="$(uci_get port '7575')"
data_path="$(uci_get data_path '/etc/vohive/data')"

core_installed=0
core_version=""
backup_version=""
if [ -x "$BIN" ]; then
	core_installed=1
	core_version="$(cat "$VERSION_FILE" 2>/dev/null || true)"
	[ -n "$core_version" ] || core_version="已安装，版本未知"
fi
if [ -s "$BACKUP_VERSION_FILE" ] && [ -s /etc/vohive/bin/vohive.bak ]; then
	backup_version="$(cat "$BACKUP_VERSION_FILE" 2>/dev/null || true)"
elif [ -s /etc/vohive/bin/vohive.bak ]; then
	backup_version="版本未知"
fi

default_password=0
[ "$(uci_get username 'admin')" = "admin" ] && [ "$(uci_get password 'admin')" = "admin" ] && default_password=1

port_status="unknown"
if command -v ss >/dev/null 2>&1; then
	if ss -ltn 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]$port$"; then
		port_status="listening"
	else
		port_status="free"
	fi
elif command -v netstat >/dev/null 2>&1; then
	if netstat -ltn 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]$port$"; then
		port_status="listening"
	else
		port_status="free"
	fi
fi

root_space="$(df -h / 2>/dev/null | awk 'NR==2 {print $4 " available on " $6}' || true)"
data_space="$(df -h "$data_path" 2>/dev/null | awk 'NR==2 {print $4 " available on " $6}' || true)"

printf '{'
printf '"running":%s,' "$is_running"
printf '"enabled":%s,' "$enabled"
printf '"core_installed":%s,' "$core_installed"
printf '"core_version":"%s",' "$(json_escape "$core_version")"
printf '"backup_version":"%s",' "$(json_escape "$backup_version")"
printf '"host":"%s",' "$(json_escape "$host")"
printf '"port":"%s",' "$(json_escape "$port")"
printf '"data_path":"%s",' "$(json_escape "$data_path")"
printf '"default_password":%s,' "$default_password"
printf '"port_status":"%s",' "$port_status"
printf '"root_space":"%s",' "$(json_escape "$root_space")"
printf '"data_space":"%s"' "$(json_escape "$data_space")"
printf '}\n'
