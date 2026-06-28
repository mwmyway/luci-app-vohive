'use strict';
'require view';
'require form';
'require fs';
'require ui';
'require uci';
'require poll';

function parseJson(text) {
	try {
		return JSON.parse(text || '{}');
	} catch (e) {
		return { ok: false, message: text || e.message };
	}
}

function notifyResult(text) {
	var result = parseJson(text);
	if (result.ok === false)
		ui.addNotification(null, E('p', {}, result.message || _('操作失败')), 'danger');
	else
		ui.addNotification(null, E('p', {}, result.message || _('操作完成')), 'info');
}

function runScript(path, args) {
	return fs.exec_direct(path, args || []).then(function(text) {
		notifyResult(text);
		window.setTimeout(function() { location.reload(); }, 800);
	}).catch(function(e) {
		ui.addNotification(null, E('p', {}, e.message || String(e)), 'danger');
	});
}

function saveApplyThen(map, fn) {
	return map.save()
		.then(function() { return ui.changes.apply(false); })
		.then(fn);
}

return view.extend({
	handleSaveApply: function(ev, mode) {
		return this.super('handleSaveApply', [ ev, mode ]).then(function() {
			return fs.exec_direct('/usr/share/vohive/apply_config.sh', []).then(notifyResult);
		});
	},

	load: function() {
		return Promise.all([
			uci.load('vohive'),
			fs.exec_direct('/usr/share/vohive/status.sh', []).catch(function() { return '{}'; }),
			fs.exec_direct('/usr/share/vohive/logs.sh', [ '100' ]).catch(function() { return ''; }),
			fs.exec_direct('/usr/share/vohive/releases.sh', [ '5' ]).catch(function() { return '{}'; })
		]);
	},

	renderCoreSummary: function(status, releases) {
		var current = status.core_installed ? (status.core_version || _('已安装，版本未知')) : _('未安装');
		var latest = releases.latest || _('未知');
		var backup = status.backup_version || _('无');
		var canUpdate = status.core_installed && releases.latest && status.core_version && status.core_version != releases.latest;
		var rows = [
			[ _('当前版本'), current ],
			[ _('最新版本'), latest ],
			[ _('可回滚版本'), backup ],
			[ _('Release 仓库'), releases.repo || _('未知') ]
		];

		var table = E('table', { 'class': 'table' }, rows.map(function(row) {
			return E('tr', {}, [ E('td', {}, row[0]), E('td', {}, row[1]) ]);
		}));

		var nodes = [
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('核心状态')),
				table
			])
		];

		if (canUpdate)
			nodes.push(E('div', { 'class': 'alert-message warning' }, _('当前核心不是最新版本，可以选择最新版本后安装/更新。')));
		else if (status.core_installed && releases.latest && status.core_version == releases.latest)
			nodes.push(E('div', { 'class': 'alert-message success' }, _('当前核心已是最新版本。')));
		else if (releases.ok === false)
			nodes.push(E('div', { 'class': 'alert-message warning' }, releases.message || _('无法获取 Release 版本列表。')));

		return E('div', {}, nodes);
	},

	renderCoreMap: function(status, releases) {
		var m = new form.Map('vohive');
		var s, o;

		s = m.section(form.NamedSection, 'main', 'vohive', _('核心管理'));
		s.addremove = false;

		o = s.option(form.Value, 'release_repo', _('Release 仓库地址'));
		o.default = 'https://github.com/iniwex5/vohive-release';
		o.validate = function(section_id, value) {
			return /^(https?:\/\/github\.com\/)?[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(value) || _('必须是 GitHub 仓库地址');
		};

		o = s.option(form.ListValue, 'version', _('指定版本'));
		o.value('latest', releases.latest ? _('最新版本') + ' (' + releases.latest + ')' : _('最新版本'));
		(releases.versions || []).forEach(function(version) {
			o.value(version, version);
		});
		o.default = 'latest';

		o = s.option(form.Button, '_install_core', _('安装/更新核心'));
		o.inputstyle = 'apply';
		o.onclick = ui.createHandlerFn(this, function() {
			return saveApplyThen(m, function() {
				var version = uci.get('vohive', 'main', 'version') || 'latest';
				return runScript('/usr/share/vohive/install_core.sh', [ version ]);
			});
		});

		o = s.option(form.Button, '_rollback_core', status.backup_version ? _('回滚核心') + ' (' + status.backup_version + ')' : _('回滚核心'));
		o.inputstyle = 'reset';
		o.onclick = ui.createHandlerFn(this, function() {
			return runScript('/usr/share/vohive/rollback_core.sh', []);
		});

		return m.render().then(function(mapEl) {
			return E('div', {}, [
				this.renderCoreSummary(status, releases),
				mapEl
			]);
		}.bind(this));
	},

	renderConfigMap: function() {
		var m = new form.Map('vohive');
		var s, o;

		s = m.section(form.NamedSection, 'main', 'vohive', _('基础配置'));
		s.addremove = false;

		o = s.option(form.Flag, 'enabled', _('启用服务'));
		o.default = '0';

		o = s.option(form.Value, 'host', _('监听地址'));
		o.default = '0.0.0.0';

		o = s.option(form.Value, 'port', _('监听端口'));
		o.default = '7575';
		o.datatype = 'port';

		o = s.option(form.Value, 'username', _('Web 用户名'));
		o.default = 'admin';
		o.rmempty = false;

		o = s.option(form.Value, 'password', _('Web 密码'));
		o.default = 'admin';
		o.password = true;
		o.rmempty = false;

		o = s.option(form.ListValue, 'log_level', _('日志级别'));
		o.value('debug', 'debug');
		o.value('info', 'info');
		o.value('warn', 'warn');
		o.value('error', 'error');
		o.default = 'info';

		o = s.option(form.Value, 'data_path', _('数据目录'));
		o.default = '/etc/vohive/data';
		o.validate = function(section_id, value) {
			return /^\/.+/.test(value) || _('必须是绝对路径');
		};

		o = s.option(form.Button, '_apply_config', _('保存并应用'));
		o.inputstyle = 'apply';
		o.onclick = ui.createHandlerFn(this, function() {
			return saveApplyThen(m, function() {
				return runScript('/usr/share/vohive/apply_config.sh', []);
			});
		});

		return m.render();
	},

	renderStatus: function(status) {
		var rows = [
			[ _('服务状态'), status.running ? _('运行中') : _('已停止') ],
			[ _('开机启用'), status.enabled ? _('已启用') : _('未启用') ],
			[ _('核心状态'), status.core_installed ? (status.core_version || _('已安装')) : _('未安装') ],
			[ _('监听地址'), '%s:%s'.format(status.host || '0.0.0.0', status.port || '7575') ],
			[ _('端口状态'), status.port_status || _('未知') ],
			[ _('根分区空间'), status.root_space || _('未知') ],
			[ _('数据目录空间'), status.data_space || _('未知') ]
		];

		var table = E('table', { 'class': 'table' }, rows.map(function(row) {
			return E('tr', {}, [ E('td', {}, row[0]), E('td', {}, row[1]) ]);
		}));

		var warnings = [];
		if (status.default_password)
			warnings.push(E('div', { 'class': 'alert-message warning' }, _('检测到默认 Web 密码 admin/admin，请尽快修改。')));
		if (!status.core_installed)
			warnings.push(E('div', { 'class': 'alert-message warning' }, _('VoHive 核心尚未安装。')));

		var webUrl = 'http://%s:%s'.format(window.location.hostname, status.port || '7575');

		return E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('运行状态')),
			table,
			E('p', {}, [
				E('a', { 'class': 'btn', 'target': '_blank', 'href': webUrl }, _('打开 VoHive Web UI'))
			])
		].concat(warnings));
	},

	renderServiceButtons: function() {
		return E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('服务操作')),
			E('button', {
				'class': 'btn cbi-button cbi-button-apply',
				'click': ui.createHandlerFn(this, function() { return runScript('/usr/share/vohive/service.sh', [ 'start' ]); })
			}, _('启用并启动')),
			' ',
			E('button', {
				'class': 'btn cbi-button cbi-button-reset',
				'click': ui.createHandlerFn(this, function() { return runScript('/usr/share/vohive/service.sh', [ 'stop' ]); })
			}, _('停止并禁用')),
			' ',
			E('button', {
				'class': 'btn cbi-button cbi-button-reload',
				'click': ui.createHandlerFn(this, function() { return runScript('/usr/share/vohive/service.sh', [ 'restart' ]); })
			}, _('重启'))
		]);
	},

	render: function(data) {
		var status = parseJson(data[1]);
		var logs = data[2] || '';
		var releases = parseJson(data[3]);

		return Promise.all([
			this.renderCoreMap(status, releases),
			this.renderConfigMap()
		]).then(function(rendered) {
			var panes = E('div', {}, [
				E('div', { 'data-tab': 'home', 'data-tab-title': _('首页') }, [
					this.renderStatus(status),
					this.renderServiceButtons()
				]),
				E('div', { 'data-tab': 'core', 'data-tab-title': _('核心管理') }, rendered[0]),
				E('div', { 'data-tab': 'config', 'data-tab-title': _('基础配置') }, rendered[1]),
				E('div', { 'data-tab': 'logs', 'data-tab-title': _('日志') }, [
					E('div', { 'class': 'cbi-section' }, [
						E('h3', {}, _('日志')),
						E('pre', { 'style': 'white-space: pre-wrap; max-height: 360px; overflow: auto;' }, logs || _('暂无日志'))
					])
				])
			]);
			var tabs = E('div', {}, panes);

			ui.tabs.initTabGroup(panes.childNodes);

			return E('div', {}, [
				E('h2', {}, _('VoHive')),
				E('div', { 'class': 'cbi-map-descr' }, _('管理 VoHive 核心、服务和基础配置。')),
				tabs
			]);
		}.bind(this));
	}
});
