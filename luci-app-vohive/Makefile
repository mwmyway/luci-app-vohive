include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-vohive
PKG_VERSION?=0.1.1
PKG_RELEASE:=1
PKG_LICENSE:=MIT
PKG_MAINTAINER:=VoHive
PKGARCH:=all

include $(INCLUDE_DIR)/package.mk

define Package/luci-app-vohive
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=LuCI support for VoHive
  DEPENDS:=+luci-base +rpcd +rpcd-mod-file +curl +ca-bundle +jsonfilter
endef

define Package/luci-app-vohive/description
  LuCI management page for installing, configuring, and controlling VoHive.
endef

define Build/Compile
endef

define Package/luci-app-vohive/conffiles
/etc/config/vohive
endef

define Package/luci-app-vohive/install
	$(CP) ./root/* $(1)/
	$(INSTALL_DIR) $(1)/usr/share/vohive
	echo "$(PKG_VERSION)" > $(1)/usr/share/vohive/plugin_version
endef

define Package/luci-app-vohive/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	mkdir -p /etc/vohive/config /etc/vohive/data /tmp/vohive/logs /tmp/vohive/download
}
exit 0
endef

$(eval $(call BuildPackage,luci-app-vohive))
