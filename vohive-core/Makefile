include $(TOPDIR)/rules.mk

VOHIVE_ASSET_ARCH:=$(if $(VOHIVE_ASSET_ARCH),$(VOHIVE_ASSET_ARCH),arm64)
PKG_NAME:=vohive-core-$(VOHIVE_ASSET_ARCH)
PKG_VERSION:=$(if $(VOHIVE_VERSION),$(VOHIVE_VERSION),v1.4.3)
PKG_RELEASE:=1
PKG_LICENSE:=Proprietary
PKG_MAINTAINER:=VoHive

include $(INCLUDE_DIR)/package.mk

define Package/$(PKG_NAME)
  SECTION:=utils
  CATEGORY:=Utilities
  TITLE:=VoHive core binary ($(VOHIVE_ASSET_ARCH))
  DEPENDS:=
  CONFLICTS:=$(filter-out $(PKG_NAME),vohive-core vohive-core-arm64 vohive-core-amd64 vohive-core-armv7)
endef

define Package/$(PKG_NAME)/description
  Preinstalled VoHive linux_$(VOHIVE_ASSET_ARCH) core binary for luci-app-vohive.
endef

define Build/Compile
endef

define Package/$(PKG_NAME)/install
	$(INSTALL_DIR) $(1)/etc/vohive/bin
	$(INSTALL_BIN) ./files/vohive $(1)/etc/vohive/bin/vohive
	echo "$(PKG_VERSION)" > $(1)/etc/vohive/bin/version
	echo "$(VOHIVE_ASSET_ARCH)" > $(1)/etc/vohive/bin/arch
endef

define Package/$(PKG_NAME)/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	if [ -x /etc/init.d/vohive ] && /etc/init.d/vohive running >/dev/null 2>&1; then
		/etc/init.d/vohive restart || true
	fi
}
exit 0
endef

$(eval $(call BuildPackage,$(PKG_NAME)))
