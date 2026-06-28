'use strict';
'require view';
'require form';
'require fs';
'require ui';
'require uci';
'require dom';
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

function progressbar(usedKb, totalKb, percent) {
	var used = (parseInt(usedKb) || 0) * 1024;
	var total = (parseInt(totalKb) || 0) * 1024;
	var pc = Math.max(0, Math.min(100, parseInt(percent) || 0));
	var text = total ? '%1024.2mB / %1024.2mB (%d%%)'.format(used, total, pc) : _('未知');

	return E('div', {
		'class': 'cbi-progressbar',
		'title': text
	}, E('div', { 'style': 'width:%.2f%%'.format(pc) }));
}

function statusBadge(active) {
	return E('span', {
		'style': 'color:%s; font-weight:700;'.format(active ? '#37a24d' : '#d9534f')
	}, active ? _('运行中') : _('已停止'));
}

function releaseRepoSlug(repo) {
	return (repo || 'https://github.com/iniwex5/vohive-release')
		.replace(/^https?:\/\/github\.com\//, '')
		.replace(/^git@github\.com:/, '')
		.replace(/\/$/, '')
		.replace(/\.git$/, '');
}

function releaseLink(repo, version) {
	if (!repo || !/^v[0-9]/.test(version || ''))
		return version;

	return E('a', {
		'href': 'https://github.com/%s/releases/tag/%s'.format(repo, version),
		'target': '_blank',
		'rel': 'noreferrer'
	}, version);
}

return view.extend({
	logRefreshTimer: null,
	currentLogs: '',

	handleSaveApply: function(ev, mode) {
		return this.super('handleSaveApply', [ ev, mode ]).then(function() {
			return fs.exec_direct('/usr/share/vohive/apply_config.sh', []).then(notifyResult);
		});
	},

	load: function() {
		return Promise.all([
			uci.load('vohive'),
			fs.exec_direct('/usr/share/vohive/status.sh', []).catch(function() { return '{}'; }),
			fs.exec_direct('/usr/share/vohive/logs.sh', [ '100' ]).catch(function() { return ''; })
		]);
	},

	renderCoreSummary: function(status, releases, refreshHandler) {
		var current = status.core_installed ? (status.core_version || _('已安装，版本未知')) : _('未安装');
		var latest = releases.latest || _('未知');
		var backup = status.backup_version || _('无');
		var canUpdate = status.core_installed && releases.latest && status.core_version && status.core_version != releases.latest;
		var repo = releases.repo || '';
		var rows = [
			[ _('当前版本'), releaseLink(repo, current) ],
			[ _('最新版本'), releaseLink(repo, latest) ],
			[ _('可回滚版本'), releaseLink(repo, backup) ],
			[ _('Release 仓库'), repo ? E('a', { 'href': 'https://github.com/%s/releases'.format(repo), 'target': '_blank', 'rel': 'noreferrer' }, repo) : _('未知') ]
		];

		var table = E('table', { 'class': 'table' }, rows.map(function(row) {
			return E('tr', {}, [ E('td', {}, row[0]), E('td', {}, row[1]) ]);
		}));

		var notice = null;

		if (canUpdate)
			notice = E('div', { 'class': 'alert-message warning' }, _('当前核心不是最新版本，可以选择最新版本后安装/更新。'));
		else if (status.core_installed && releases.latest && status.core_version == releases.latest)
			notice = E('div', { 'class': 'alert-message success' }, _('当前核心已是最新版本。'));
		else if (releases.ok === false)
			notice = E('div', { 'class': 'alert-message warning' }, releases.message || _('无法获取 Release 版本列表。'));

		var nodes = [
			E('div', { 'class': 'cbi-section' }, [
				E('div', {
					'style': 'display:flex; align-items:center; justify-content:space-between; gap:1em; flex-wrap:wrap;'
				}, [
					E('h3', { 'style': 'margin-bottom:.75em;' }, _('核心状态')),
					E('button', {
						'class': 'btn cbi-button cbi-button-reload',
						'click': refreshHandler
					}, _('检测更新'))
				]),
				table
			])
		];

		if (notice)
			nodes.unshift(notice);

		return E('div', {}, nodes);
	},

	renderCoreMap: function(status, releases, refreshHandler) {
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
				this.renderCoreSummary(status, releases, refreshHandler),
				mapEl
			]);
		}.bind(this));
	},

	loadCorePane: function(corePane, status, force) {
		if (!force && (corePane.getAttribute('data-loaded') === 'true' || corePane.getAttribute('data-loading') === 'true'))
			return;

		corePane.setAttribute('data-loading', 'true');
		dom.content(corePane, E('div', { 'class': 'cbi-section' }, E('em', { 'class': 'spinning' }, _('正在加载 Release 版本列表...'))));

		return fs.exec_direct('/usr/share/vohive/releases.sh', [ '5' ])
			.catch(function() { return '{}'; })
			.then(function(text) {
				var releases = parseJson(text);
				var refreshHandler = ui.createHandlerFn(this, function() {
					return this.loadCorePane(corePane, status, true);
				});

				return this.renderCoreMap(status, releases, refreshHandler).then(function(coreEl) {
					corePane.setAttribute('data-loaded', 'true');
					corePane.removeAttribute('data-loading');
					dom.content(corePane, coreEl);
				});
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
		var webUrl = 'http://%s:%s'.format(window.location.hostname, status.port || '7575');
		var listenAddress = '%s:%s'.format(status.host || '0.0.0.0', status.port || '7575');
		var releaseRepo = releaseRepoSlug(uci.get('vohive', 'main', 'release_repo'));
		var coreVersion = status.core_installed ? (status.core_version || _('已安装')) : _('未安装');
		var rows = [
			[ _('服务状态'), statusBadge(status.running) ],
			[ _('开机启用'), status.enabled ? _('已启用') : _('未启用') ],
			[ _('核心状态'), status.core_installed ? releaseLink(releaseRepo, coreVersion) : coreVersion ],
			[ _('监听地址'), status.running ? E('a', { 'href': webUrl, 'target': '_blank' }, listenAddress) : listenAddress ],
			[ _('端口状态'), status.port_status || _('未知') ],
			[ _('根分区空间'), progressbar(status.root_used_kb, status.root_total_kb, status.root_percent) ],
			[ _('数据目录空间'), progressbar(status.data_used_kb, status.data_total_kb, status.data_percent) ]
		];

		var table = E('table', { 'class': 'table' }, rows.map(function(row) {
			return E('tr', {}, [ E('td', {}, row[0]), E('td', {}, row[1]) ]);
		}));

		var warnings = [];
		if (status.default_password)
			warnings.push(E('div', { 'class': 'alert-message warning' }, _('LuCI 配置中仍使用默认 Web 密码 admin/admin，请在“基础配置”中修改。')));
		if (!status.core_installed)
			warnings.push(E('div', { 'class': 'alert-message warning' }, _('VoHive 核心尚未安装。')));

		return E('div', { 'class': 'cbi-section' }, [
			E('div', {
				'style': 'display:flex; align-items:center; justify-content:space-between; gap:1em; flex-wrap:wrap;'
			}, [
				E('h3', { 'style': 'margin-bottom:.75em;' }, _('运行状态')),
				status.running ? E('a', { 'class': 'btn cbi-button cbi-button-action', 'target': '_blank', 'href': webUrl }, _('打开 VoHive Web UI')) : ''
			]),
			table
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

	refreshLogs: function(logNode) {
		return fs.exec_direct('/usr/share/vohive/logs.sh', [ '100' ])
			.catch(function() { return ''; })
			.then(function(logs) {
				this.currentLogs = logs || '';
				dom.content(logNode, this.currentLogs || _('暂无日志'));
			}.bind(this));
	},

	setLogAutoRefresh: function(enabled, logNode) {
		if (this.logRefreshTimer) {
			window.clearInterval(this.logRefreshTimer);
			this.logRefreshTimer = null;
		}

		if (enabled) {
			this.refreshLogs(logNode);
			this.logRefreshTimer = window.setInterval(function() {
				this.refreshLogs(logNode);
			}.bind(this), 5000);
		}
	},

	clearLogs: function(logNode) {
		return fs.exec_direct('/usr/share/vohive/clear_logs.sh', [])
			.then(function(text) {
				notifyResult(text);
				return this.refreshLogs(logNode);
			}.bind(this))
			.catch(function(e) {
				ui.addNotification(null, E('p', {}, e.message || String(e)), 'danger');
			});
	},

	downloadLogs: function() {
		var blob = new Blob([ this.currentLogs || '' ], { type: 'text/plain;charset=utf-8' });
		var url = URL.createObjectURL(blob);
		var a = E('a', {
			'href': url,
			'download': 'vohive-logs.txt'
		});

		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		window.setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
	},

	renderLogs: function(logs) {
		this.currentLogs = logs || '';
		var logNode = E('pre', {
			'style': [
				'white-space: pre',
				'height: 460px',
				'overflow: auto',
				'margin: 0',
				'padding: 1em',
				'border: 1px solid var(--border-color-medium)',
				'border-radius: 6px',
				'background: var(--background-color-low)',
				'font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
				'font-size: 12px',
				'line-height: 1.55'
			].join(';')
		}, this.currentLogs || _('暂无日志'));

		return E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('运行日志')),
			E('div', {
				'style': [
					'display: flex',
					'align-items: center',
					'justify-content: space-between',
					'gap: 1em',
					'flex-wrap: wrap',
					'margin-bottom: 1em'
				].join(';')
			}, [
				E('label', {
					'style': 'display: inline-flex; align-items: center; gap: .5em; margin: 0;'
				}, [
					E('input', {
						'type': 'checkbox',
						'style': 'margin: 0;',
						'change': function(ev) {
							this.setLogAutoRefresh(ev.target.checked, logNode);
						}.bind(this)
					}),
					E('span', {}, _('自动刷新'))
				]),
				E('div', { 'style': 'display: flex; gap: .5em; flex-wrap: wrap;' }, [
					E('button', {
						'class': 'btn cbi-button cbi-button-reload',
						'click': ui.createHandlerFn(this, function() { return this.refreshLogs(logNode); })
					}, _('刷新')),
					E('button', {
						'class': 'btn cbi-button cbi-button-reset',
						'click': ui.createHandlerFn(this, function() { return this.clearLogs(logNode); })
					}, _('清理日志')),
					E('button', {
						'class': 'btn cbi-button cbi-button-action',
						'click': ui.createHandlerFn(this, function() { this.downloadLogs(); })
					}, _('下载日志'))
				])
			]),
			logNode
		]);
	},

	render: function(data) {
		var status = parseJson(data[1]);
		var logs = data[2] || '';

		return Promise.all([
			this.renderConfigMap()
		]).then(function(rendered) {
			var corePane = E('div', { 'data-tab': 'core', 'data-tab-title': _('核心管理') }, [
				E('div', { 'class': 'cbi-section' }, E('em', {}, _('点击核心管理后加载版本列表。')))
			]);

			corePane.addEventListener('cbi-tab-active', function() {
				this.loadCorePane(corePane, status);
			}.bind(this));

			var panes = E('div', {}, [
				E('div', { 'data-tab': 'home', 'data-tab-title': _('首页') }, [
					this.renderStatus(status),
					this.renderServiceButtons()
				]),
				corePane,
				E('div', { 'data-tab': 'config', 'data-tab-title': _('基础配置') }, rendered[0]),
				E('div', { 'data-tab': 'logs', 'data-tab-title': _('日志') }, this.renderLogs(logs))
			]);
			var tabs = E('div', {}, panes);

			ui.tabs.initTabGroup(panes.childNodes);

			return E('div', {}, [
				E('h2', {}, _('VoHive')),
				E('div', { 'class': 'cbi-map-descr' }, _('管理 VoHive 核心、服务和基础配置；支持短信、多卡、eSIM/eUICC、轻量代理与 Bot 远程控制。')),
				tabs
			]);
		}.bind(this));
	}
});
