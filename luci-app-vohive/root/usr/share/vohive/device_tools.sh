#!/bin/sh

ACTION="${1:-status}"
PORT="${2:-}"
TARGET="${3:-}"

TIMEOUT_SECONDS=2

json_escape() {
	printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g; s/	/\\t/g; s/\r//g; :a; N; $!ba; s/\n/\\n/g'
}

fail() {
	printf '{"ok":false,"message":"%s"}\n' "$(json_escape "$1")"
	exit 1
}

pkg_installed() {
	opkg status "$1" 2>/dev/null | grep -q '^Status: .* installed'
}

dep_value() {
	if pkg_installed "$1"; then
		printf 'true'
	else
		printf 'false'
	fi
}

has_cmd() {
	command -v "$1" >/dev/null 2>&1
}

has_timeout() {
	has_cmd timeout || busybox timeout 1 true >/dev/null 2>&1
}

run_timeout() {
	if has_cmd timeout; then
		timeout "$@"
	else
		busybox timeout "$@"
	fi
}

bind_option_id() {
	local vendor="$1"
	local product="$2"
	local new_id="/sys/bus/usb-serial/drivers/option1/new_id"

	modprobe option 2>/dev/null || true
	[ -w "$new_id" ] || return 0
	printf '%s %s\n' "$vendor" "$product" > "$new_id" 2>/dev/null || true
}

prepare_serial_driver() {
	bind_option_id 2ca3 4006
	bind_option_id 2c7c 0125
}

serial_ports() {
	ls /dev/ttyUSB* 2>/dev/null | sort -V
}

at_with_socat() {
	local port="$1"
	local command="$2"

	printf '%s\r\n' "$command" | socat -T "$TIMEOUT_SECONDS" - "OPEN:$port,raw,echo=0,crnl,waitlock=/tmp/vohive-at.lock" 2>&1 || true
}

at_with_shell() {
	local port="$1"
	local command="$2"
	local tmp="/tmp/vohive/at.$$"

	mkdir -p /tmp/vohive
	stty -F "$port" 115200 raw -echo -echoe -echok 2>/dev/null || true
	run_timeout "$TIMEOUT_SECONDS" cat "$port" > "$tmp" 2>/dev/null &
	local reader="$!"
	sleep 1
	printf '%s\r\n' "$command" > "$port" 2>/dev/null || true
	wait "$reader" 2>/dev/null || true
	cat "$tmp" 2>/dev/null || true
	rm -f "$tmp"
}

at_command() {
	local port="$1"
	local command="$2"

	if has_cmd socat; then
		at_with_socat "$port" "$command"
	elif has_timeout && has_cmd stty; then
		at_with_shell "$port" "$command"
	else
		return 1
	fi
}

normalize_at() {
	printf '%s' "$1" | tr '\r' '\n' | sed '/^[[:space:]]*$/d'
}

extract_usb_cfg() {
	printf '%s\n' "$1" | grep -Eio '0x[0-9a-f]{4}[, ]+0x[0-9a-f]{4}' | head -n 1 | tr '[:lower:]' '[:upper:]'
}

identity_from_cfg() {
	case "$1" in
		0X2CA3*0X4006) printf 'dji' ;;
		0X2C7C*0X0125) printf 'ec25' ;;
		*) printf 'unknown' ;;
	esac
}

identity_label() {
	case "$1" in
		dji) printf 'DJI 4G Module (2ca3:4006)' ;;
		ec25) printf 'Quectel EC25 (2c7c:0125)' ;;
		*) printf '未知' ;;
	esac
}

probe_port_json() {
	local port="$1"
	local at ati qgmr qcfg output cfg identity module status

	at="$(normalize_at "$(at_command "$port" AT 2>/dev/null || true)")"
	status="no_response"
	module=""
	cfg=""
	identity="unknown"
	output="AT:\n$at"

	if printf '%s\n' "$at" | grep -q 'OK'; then
		status="ok"
		ati="$(normalize_at "$(at_command "$port" ATI 2>/dev/null || true)")"
		qgmr="$(normalize_at "$(at_command "$port" 'AT+QGMR' 2>/dev/null || true)")"
		qcfg="$(normalize_at "$(at_command "$port" 'AT+QCFG="usbcfg"' 2>/dev/null || true)")"
		cfg="$(extract_usb_cfg "$qcfg")"
		identity="$(identity_from_cfg "$cfg")"
		module="$(printf '%s\n%s\n' "$ati" "$qgmr" | grep -Ei 'Quectel|EG25|EC25|EG|EC' | head -n 2 | tr '\n' ' ' | sed 's/[[:space:]]*$//')"
		output="AT:\n$at\n\nATI:\n$ati\n\nAT+QGMR:\n$qgmr\n\nAT+QCFG=\"usbcfg\":\n$qcfg"
	fi

	printf '{"port":"%s","status":"%s","identity":"%s","identity_label":"%s","module":"%s","usb_config":"%s","output":"%s"}' \
		"$(json_escape "$port")" \
		"$(json_escape "$status")" \
		"$(json_escape "$identity")" \
		"$(json_escape "$(identity_label "$identity")")" \
		"$(json_escape "$module")" \
		"$(json_escape "$cfg")" \
		"$(json_escape "$output")"
}

status_json() {
	printf '{"ok":true,'
	printf '"serial_driver_installed":%s,' "$(dep_value kmod-usb-serial)"
	printf '"option_driver_installed":%s,' "$(dep_value kmod-usb-serial-option)"
	printf '"socat_installed":%s,' "$(dep_value socat)"
	printf '"stty_available":%s,' "$(has_cmd stty && printf true || printf false)"
	printf '"timeout_available":%s' "$(has_timeout && printf true || printf false)"
	printf '}\n'
}

probe_json() {
	local first=1 port

	prepare_serial_driver
	printf '{"ok":true,'
	printf '"serial_driver_installed":%s,' "$(dep_value kmod-usb-serial)"
	printf '"option_driver_installed":%s,' "$(dep_value kmod-usb-serial-option)"
	printf '"socat_installed":%s,' "$(dep_value socat)"
	printf '"stty_available":%s,' "$(has_cmd stty && printf true || printf false)"
	printf '"timeout_available":%s,' "$(has_timeout && printf true || printf false)"
	printf '"ports":['
	for port in $(serial_ports); do
		[ "$first" = 1 ] || printf ','
		first=0
		probe_port_json "$port"
	done
	printf ']}\n'
}

install_packages() {
	local packages="$1"
	local output

	output="$(opkg update 2>&1 && opkg install $packages 2>&1)" || {
		printf '{"ok":false,"message":"安装失败","output":"%s"}\n' "$(json_escape "$output")"
		exit 1
	}

	printf '{"ok":true,"message":"安装完成","output":"%s"}\n' "$(json_escape "$output")"
}

target_command() {
	case "$1" in
		ec25) printf 'AT+QCFG="usbcfg",0x2C7C,0x0125,1,1,1,1,1,0,0' ;;
		dji) printf 'AT+QCFG="usbcfg",0x2CA3,0x4006,1,1,1,1,1,0,0' ;;
		*) return 1 ;;
	esac
}

wait_for_identity() {
	local target="$1"
	local now end
	local port qcfg cfg identity

	now="$(date +%s)"
	end="$((now + 30))"
	while [ "$(date +%s)" -lt "$end" ]; do
		prepare_serial_driver
		for port in $(serial_ports); do
			qcfg="$(normalize_at "$(at_command "$port" 'AT+QCFG="usbcfg"' 2>/dev/null || true)")"
			cfg="$(extract_usb_cfg "$qcfg")"
			identity="$(identity_from_cfg "$cfg")"
			if [ "$identity" = "$target" ]; then
				printf '检测到目标身份：%s on %s\n' "$(identity_label "$target")" "$port"
				return 0
			fi
		done
		sleep 2
	done

	printf '30 秒内未检测到目标身份：%s\n' "$(identity_label "$target")"
	return 1
}

convert_json() {
	local port="$1"
	local target="$2"
	local command output write_result reset_result wait_result ok=true

	[ -c "$port" ] || fail "串口不存在: $port"
	command="$(target_command "$target")" || fail "不支持的目标身份: $target"

	output="停止 VoHive 服务...\n"
	output="$output$(/etc/init.d/vohive stop 2>&1 || true)\n\n"

	output="${output}写入 USB 身份：$(identity_label "$target")\n"
	write_result="$(normalize_at "$(at_command "$port" "$command" 2>&1 || true)")"
	output="$output$write_result\n\n"
	if ! printf '%s\n' "$write_result" | grep -q 'OK'; then
		ok=false
		output="${output}写入命令未返回 OK。\n\n"
	fi

	output="${output}重启模块...\n"
	reset_result="$(normalize_at "$(at_command "$port" 'AT+CFUN=1,1' 2>&1 || true)")"
	output="$output$reset_result\n\n"

	output="${output}等待模块重新枚举...\n"
	wait_result="$(wait_for_identity "$target" 2>&1)" || true
	output="$output$wait_result\n\n"

	output="${output}启动 VoHive 服务...\n"
	output="$output$(/etc/init.d/vohive start 2>&1 || true)\n"

	if [ "$ok" = true ]; then
		printf '{"ok":true,"message":"操作已执行，VoHive 已启动","output":"%s"}\n' "$(json_escape "$output")"
	else
		printf '{"ok":false,"message":"写入命令未确认成功，VoHive 已启动","output":"%s"}\n' "$(json_escape "$output")"
	fi
}

case "$ACTION" in
	status)
		status_json
		;;
	probe)
		probe_json
		;;
	install_serial_drivers)
		install_packages 'kmod-usb-serial kmod-usb-serial-option'
		;;
	install_socat)
		install_packages 'socat'
		;;
	convert)
		convert_json "$PORT" "$TARGET"
		;;
	*)
		fail "不支持的操作: $ACTION"
		;;
esac
