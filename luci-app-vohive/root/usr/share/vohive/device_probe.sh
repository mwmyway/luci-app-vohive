#!/bin/sh

ACTION="${1:-probe}"

case "$ACTION" in
	status|probe)
		exec /usr/share/vohive/device_tools.sh "$ACTION"
		;;
	*)
		printf '{"ok":false,"message":"只读探测接口不支持该操作"}\n'
		exit 1
		;;
esac
