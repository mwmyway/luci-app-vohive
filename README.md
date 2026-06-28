# luci-app-vohive

VoHive 的 OpenWrt / ImmortalWrt LuCI 管理插件。

## 包结构

- `luci-app-vohive`: LuCI 页面、UCI 配置、procd 服务、核心下载与回滚脚本，不包含 VoHive 二进制。
- `vohive-core-arm64` / `vohive-core-amd64` / `vohive-core-armv7`: 只预置对应架构的 VoHive 二进制和版本文件。

默认路径：

```text
/etc/config/vohive
/etc/vohive/bin/vohive
/etc/vohive/bin/version
/etc/vohive/bin/arch
/etc/vohive/config/config.yaml
/etc/vohive/data
/tmp/vohive/logs
/tmp/vohive/download
```

默认 Release 仓库地址：

```text
https://github.com/iniwex5/vohive-release
```

## 功能

- 在 `服务 -> VoHive` 管理核心安装、更新、回滚。
- 核心管理页会从 GitHub Release 列出最近版本，显示当前版本和最新版本。
- 启动、停止、重启 VoHive procd 服务。
- 通过 UCI 配置渲染 `/etc/vohive/config/config.yaml`。
- 显示核心状态、服务状态、端口监听提示和最近日志。核心版本和架构来自安装脚本或 `vohive-core-*` 写入的 `/etc/vohive/bin/version` 与 `/etc/vohive/bin/arch`。

## 安装

从 GitHub Release 下载并安装：

```sh
opkg install luci-app-vohive_<version>-1_all.ipk
```

如果需要内置核心：

```sh
opkg install luci-app-vohive_<version>-1_all.ipk vohive-core-arm64_v1.4.3-1_all.ipk
opkg install luci-app-vohive_<version>-1_all.ipk vohive-core-amd64_v1.4.3-1_all.ipk
opkg install luci-app-vohive_<version>-1_all.ipk vohive-core-armv7_v1.4.3-1_all.ipk
```

也可以只安装 `luci-app-vohive`，进入 LuCI 页面后点击“安装/更新核心”。

架构对应关系：

```text
aarch64 / arm64 -> arm64
x86_64 / amd64  -> amd64
armv7l / armv7  -> armv7
```

## 发布构建

推送 `v*` tag 会触发 GitHub Action 生成 IPK 包：

```sh
git tag v0.1.2
git push origin v0.1.2
```

Release 产物：

```text
luci-app-vohive_<version>-1_all.ipk
vohive-core-arm64_v1.4.3-1_all.ipk
vohive-core-amd64_v1.4.3-1_all.ipk
vohive-core-armv7_v1.4.3-1_all.ipk
sha256sums.txt
```

## 开发构建

把本仓库作为 OpenWrt SDK 的 package feed 使用，或复制到 SDK 的 `package/` 目录后执行：

```sh
make package/vohive/luci-app-vohive/compile V=s PKG_VERSION=0.1.2
make package/vohive/vohive-core/compile V=s VOHIVE_VERSION=v1.4.3 VOHIVE_ASSET_ARCH=arm64
make package/vohive/vohive-core/compile V=s VOHIVE_VERSION=v1.4.3 VOHIVE_ASSET_ARCH=amd64
make package/vohive/vohive-core/compile V=s VOHIVE_VERSION=v1.4.3 VOHIVE_ASSET_ARCH=armv7
```

## TODO

- 浏览器上传本地 VoHive 二进制并安装。
- GitHub 镜像/代理下载配置。
- SHA256SUMS 强校验。
- 英文界面与 i18n 语言包。
