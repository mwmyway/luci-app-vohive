#!/bin/sh

json_escape() {
	printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

uci_get() {
	local key="$1"
	local default="$2"
	local value

	value="$(uci -q get "vohive.main.$key" 2>/dev/null || true)"
	[ -n "$value" ] && printf '%s' "$value" || printf '%s' "$default"
}

github_repo_slug() {
	local repo="$1"

	repo="${repo#https://github.com/}"
	repo="${repo#http://github.com/}"
	repo="${repo#git@github.com:}"
	repo="${repo%/}"
	repo="${repo%.git}"

	printf '%s' "$repo"
}

validate_github_repo() {
	printf '%s' "$1" | grep -Eq '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'
}
