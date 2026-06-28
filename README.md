# luci-app-vohive

VoHive 的 OpenWrt / ImmortalWrt LuCI 管理插件。

## 包结构

- `luci-app-vohive`: LuCI 页面、UCI 配置、procd 服务、核心下载与回滚脚本，不包含 VoHive 二进制。
- `vohive-core`: 只预置 VoHive 二进制和版本文件。

默认路径：

```text
/etc/config/vohive
/etc/vohive/bin/vohive
/etc/vohive/bin/version
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
- 显示核心状态、服务状态、端口监听提示和最近日志。核心版本来自安装脚本或 `vohive-core` 写入的 `/etc/vohive/bin/version`。

## 安装

从 GitHub Release 下载并安装：

```sh
opkg install luci-app-vohive_0.1.1-1_all.ipk
```

如果需要内置核心：

```sh
opkg install luci-app-vohive_0.1.1-1_all.ipk vohive-core_v1.4.3-1_aarch64_cortex-a53.ipk
```

也可以只安装 `luci-app-vohive`，进入 LuCI 页面后点击“安装/更新核心”。

## 发布构建

推送 `v*` tag 会触发 GitHub Action 生成 IPK 包：

```sh
git tag v0.1.1
git push origin v0.1.1
```

Release 产物：

```text
luci-app-vohive_0.1.1-1_all.ipk
vohive-core_v1.4.3-1_aarch64_cortex-a53.ipk
sha256sums.txt
```

## 开发构建

把本仓库作为 OpenWrt SDK 的 package feed 使用，或复制到 SDK 的 `package/` 目录后执行：

```sh
make package/vohive/luci-app-vohive/compile V=s
make package/vohive/vohive-core/compile V=s VOHIVE_VERSION=v1.4.3
```

## TODO

- 浏览器上传本地 VoHive 二进制并安装。
- GitHub 镜像/代理下载配置。
- SHA256SUMS 强校验。
- 更多 OpenWrt 架构支持。
- 英文界面与 i18n 语言包。
