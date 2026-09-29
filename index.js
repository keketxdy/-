/* ==========================================================================
   RPG 状态面板 - 主脚本 (TauriTavern 兼容版)
   ==========================================================================
   TauriTavern 加载方式：
   - 作为静态资源通过 <script> 标签加载
   - 不支持 Node.js 后端 API
   - 通过 MutationObserver 监听消息变化
   ==========================================================================
*/

(function () {
  'use strict';

  // ========== 配置 ==========
  const STATS_MARKER = /<!--\s*RPGSTATS:\s*(\{[\s\S]*?\})\s*-->/;

  // 游戏主题色
  const THEMES = {
    default: { primary: '#e94560', secondary: '#16213e', bg: '#0f0f23', accent: '#00d9ff' },
    genshin: { primary: '#d4a857', secondary: '#1a1a2e', bg: '#0d1117', accent: '#5eb14e' },
    hi3: { primary: '#ff6b9d', secondary: '#1a1a2e', bg: '#0d0d1a', accent: '#c77dff' },
    starrail: { primary: '#00d9ff', secondary: '#0a0a1a', bg: '#050510', accent: '#ffd700' },
    pmoon: { primary: '#8b0000', secondary: '#1a0a0a', bg: '#0d0d0d', accent: '#daa520' },
    zzz: { primary: '#ff4757', secondary: '#0a0a1a', bg: '#050510', accent: '#00ff88' }
  };

  let currentStats = null;
  let currentTheme = 'default';
  let panelCreated = false;

  // ========== 兼容短键名格式 ==========
  function normalizeStats(s) {
    if (!s) return null;
    if (s.name !== undefined) return s;
    return {
      name: s.n, level: s.l, origin: s.o, location: s.loc, time: s.t, weather: s.w, game: s.g,
      stats: s.s ? {
        hp: s.s.h ? { value: s.s.h.v, max: s.s.h.x, name: s.s.h.nm } : undefined,
        mp: s.s.m ? { value: s.s.m.v, max: s.s.m.x, name: s.s.m.nm } : undefined,
        mental: s.s.me ? { value: s.s.me.v, max: s.s.me.x, name: s.s.me.nm } : undefined,
        reputation: s.s.r ? { value: s.s.r.v, max: s.s.r.x, name: s.s.r.nm } : undefined,
        agi: s.s.a ? { value: s.s.a.v, max: s.s.a.x, name: s.s.a.nm } : undefined,
        luck: s.s.lu ? { value: s.s.lu.v, max: s.s.lu.x, name: s.s.lu.nm } : undefined
      } : undefined,
      battle: s.b ? { atk: s.b.a, def: s.b.d, crit: s.b.c, critDmg: s.b.cd, element: s.b.e, charge: s.b.ch } : undefined,
      currency: s.cu ? { primary: s.cu.p, primaryName: s.cu.pn, special: s.cu.s, specialName: s.cu.sn } : undefined,
      traits: s.tr ? s.tr.map(t => ({ name: t.n, rarity: t.r, desc: t.d })) : undefined,
      equipment: s.eq ? { weapon: s.eq.w, head: s.eq.h, armor: s.eq.a, accessory: s.eq.ac } : undefined,
      status: s.st ? s.st.map(x => ({ name: x.n, type: x.t })) : undefined,
      affection: s.af ? s.af.map(a => ({ name: a.n, level: a.l, percent: a.p })) : undefined,
      inventory: s.iv ? s.iv.map(i => ({ name: i.n, count: i.c, icon: i.i })) : undefined,
      quests: s.q ? { main: s.q.m, daily: s.q.d, character: s.q.c, world: s.q.w } : undefined,
      exploration: s.ex ? s.ex.map(e => ({ name: e.n, percent: e.p })) : undefined,
      achievements: s.ac ? { unlocked: s.ac.u, total: s.ac.t } : undefined
    };
  }

  // ========== 工具函数 ==========
  function $(id) { return document.getElementById(id); }

  function createEl(tag, attrs, children) {
    attrs = attrs || {};
    children = children || [];
    var el = document.createElement(tag);
    for (var k in attrs) {
      if (k === 'class') el.className = attrs[k];
      else if (k === 'style') el.style.cssText = attrs[k];
      else el.setAttribute(k, attrs[k]);
    }
    children.forEach(function(c) {
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  // ========== 主题切换 ==========
  function applyTheme(themeName) {
    var theme = THEMES[themeName] || THEMES.default;
    currentTheme = themeName;
    var panel = $('rpg-panel');
    if (!panel) return;
    panel.style.setProperty('--rpg-primary', theme.primary);
    panel.style.setProperty('--rpg-secondary', theme.secondary);
    panel.style.setProperty('--rpg-bg', theme.bg);
    panel.style.setProperty('--rpg-accent', theme.accent);
  }

  // ========== 从消息中提取数据 ==========
  function extractStats(text) {
    var match = text.match(STATS_MARKER);
    if (!match) return null;
    try {
      return JSON.parse(match[1]);
    } catch (e) {
      console.warn('[RPG面板] 数据解析失败:', e);
      return null;
    }
  }

  // ========== 渲染面板 ==========
  function renderPanel(stats) {
    var panel = $('rpg-panel');
    if (!panel) return;

    applyTheme(stats.game || currentTheme);
    panel.innerHTML = '';

    // 顶部标题栏
    var header = createEl('div', { class: 'rpg-header' });
    var titleLeft = createEl('div', { class: 'rpg-header-left' });
    titleLeft.appendChild(createEl('div', { class: 'rpg-char-name' }, [stats.name || '冒险者']));
    titleLeft.appendChild(createEl('div', { class: 'rpg-char-sub' }, ['Lv.' + (stats.level || 1) + ' · ' + (stats.origin || '')]));
    header.appendChild(titleLeft);

    var titleRight = createEl('div', { class: 'rpg-header-right' });
    titleRight.appendChild(createEl('div', { class: 'rpg-location' }, ['📍 ' + (stats.location || '未知')]));
    titleRight.appendChild(createEl('div', { class: 'rpg-time' }, ['🕐 ' + (stats.time || '') + ' ' + (stats.weather || '')]));
    header.appendChild(titleRight);
    panel.appendChild(header);

    var content = createEl('div', { class: 'rpg-content' });

    if (stats.stats) content.appendChild(renderSection('核心属性', renderStats(stats.stats), true));
    if (stats.battle) content.appendChild(renderSection('战斗属性', renderBattleStats(stats.battle)));
    if (stats.currency) content.appendChild(renderSection('货币', renderCurrency(stats.currency)));
    if (stats.traits && stats.traits.length > 0) content.appendChild(renderSection('特性天赋', renderTraits(stats.traits)));
    if (stats.equipment) content.appendChild(renderSection('当前装备', renderEquipment(stats.equipment)));
    if (stats.status && stats.status.length > 0) content.appendChild(renderSection('状态', renderStatus(stats.status)));
    if (stats.affection && stats.affection.length > 0) content.appendChild(renderSection('好感度', renderAffection(stats.affection)));
    if (stats.inventory && stats.inventory.length > 0) content.appendChild(renderSection('物品栏', renderInventory(stats.inventory)));
    if (stats.quests) content.appendChild(renderSection('任务', renderQuests(stats.quests)));
    if (stats.exploration && stats.exploration.length > 0) content.appendChild(renderSection('探索进度', renderExploration(stats.exploration)));
    if (stats.achievements) content.appendChild(renderSection('成就', renderAchievements(stats.achievements)));

    panel.appendChild(content);

    // 底部
    var footer = createEl('div', { class: 'rpg-footer' });
    var toggleBtn = createEl('button', { class: 'rpg-btn', title: '收起/展开面板' }, ['▼']);
    toggleBtn.onclick = function() {
      content.classList.toggle('rpg-collapsed');
      toggleBtn.textContent = content.classList.contains('rpg-collapsed') ? '▲' : '▼';
    };
    footer.appendChild(toggleBtn);
    panel.appendChild(footer);
  }

  function renderSection(title, contentEl, defaultOpen) {
    var section = createEl('div', { class: 'rpg-section' + (defaultOpen ? '' : ' rpg-section-closed') });
    var header = createEl('div', { class: 'rpg-section-header' });
    var toggle = createEl('span', { class: 'rpg-section-toggle' }, [defaultOpen ? '▼' : '▶']);
    header.appendChild(toggle);
    header.appendChild(createEl('span', { class: 'rpg-section-title' }, [title]));
    header.onclick = function() {
      section.classList.toggle('rpg-section-closed');
      toggle.textContent = section.classList.contains('rpg-section-closed') ? '▶' : '▼';
    };
    section.appendChild(header);
    var body = createEl('div', { class: 'rpg-section-body' });
    body.appendChild(contentEl);
    section.appendChild(body);
    return section;
  }

  function renderStats(stats) {
    var wrap = createEl('div', { class: 'rpg-stats-grid' });
    var statList = [
      { key: 'hp', name: '体力', icon: '❤️' },
      { key: 'mp', name: '能量', icon: '⚡' },
      { key: 'mental', name: '精神', icon: '🧠' },
      { key: 'reputation', name: '声望', icon: '⭐' },
      { key: 'agi', name: '敏捷', icon: '💨' },
      { key: 'luck', name: '运气', icon: '🍀' }
    ];
    statList.forEach(function(s) {
      var data = stats[s.key];
      if (!data) return;
      var name = data.name || s.name;
      var val = data.value || 0;
      var max = data.max || 100;
      var pct = clamp((val / max) * 100, 0, 100);

      var row = createEl('div', { class: 'rpg-stat-row' });
      var label = createEl('div', { class: 'rpg-stat-label' });
      label.appendChild(createEl('span', { class: 'rpg-stat-icon' }, [s.icon]));
      label.appendChild(createEl('span', {}, [name]));
      row.appendChild(label);

      var barWrap = createEl('div', { class: 'rpg-bar-wrap' });
      barWrap.appendChild(createEl('div', { class: 'rpg-bar-fill', style: 'width: ' + pct + '%' }));
      row.appendChild(barWrap);

      row.appendChild(createEl('div', { class: 'rpg-stat-num' }, [val + '/' + max]));
      wrap.appendChild(row);
    });
    return wrap;
  }

  function renderBattleStats(battle) {
    var grid = createEl('div', { class: 'rpg-battle-grid' });
    var items = [
      { k: 'atk', n: '攻击', i: '⚔️' },
      { k: 'def', n: '防御', i: '🛡️' },
      { k: 'crit', n: '暴击率', i: '💥', suf: '%' },
      { k: 'critDmg', n: '暴伤', i: '🔥', suf: '%' },
      { k: 'element', n: '特殊', i: '✨' },
      { k: 'charge', n: '充能', i: '⚡', suf: '%' }
    ];
    items.forEach(function(item) {
      if (battle[item.k] === undefined) return;
      var cell = createEl('div', { class: 'rpg-battle-cell' });
      cell.appendChild(createEl('span', { class: 'rpg-battle-icon' }, [item.i]));
      cell.appendChild(createEl('span', { class: 'rpg-battle-name' }, [item.n]));
      cell.appendChild(createEl('span', { class: 'rpg-battle-val' }, [battle[item.k] + (item.suf || '')]));
      grid.appendChild(cell);
    });
    return grid;
  }

  function renderCurrency(currency) {
    var wrap = createEl('div', { class: 'rpg-currency' });
    if (currency.primary !== undefined) {
      wrap.appendChild(createEl('div', { class: 'rpg-currency-row' }, [
        createEl('span', { class: 'rpg-currency-name' }, [currency.primaryName || '金币']),
        createEl('span', { class: 'rpg-currency-val' }, [String(currency.primary)])
      ]));
    }
    if (currency.special !== undefined) {
      wrap.appendChild(createEl('div', { class: 'rpg-currency-row rpg-currency-special' }, [
        createEl('span', { class: 'rpg-currency-name' }, [currency.specialName || '特殊货币']),
        createEl('span', { class: 'rpg-currency-val' }, [String(currency.special)])
      ]));
    }
    return wrap;
  }

  function renderTraits(traits) {
    var wrap = createEl('div', { class: 'rpg-traits' });
    var rarityIcon = { common: '◇', rare: '◆', unique: '★' };
    var rarityClass = { common: 'rpg-trait-common', rare: 'rpg-trait-rare', unique: 'rpg-trait-unique' };
    traits.forEach(function(t) {
      var row = createEl('div', { class: 'rpg-trait ' + (rarityClass[t.rarity] || 'rpg-trait-common') });
      row.appendChild(createEl('span', { class: 'rpg-trait-icon' }, [rarityIcon[t.rarity] || '◇']));
      row.appendChild(createEl('span', { class: 'rpg-trait-name' }, [t.name]));
      if (t.desc) row.title = t.desc;
      wrap.appendChild(row);
    });
    return wrap;
  }

  function renderEquipment(eq) {
    var wrap = createEl('div', { class: 'rpg-equip-grid' });
    var slots = [
      { k: 'weapon', n: '武器', i: '🗡️' },
      { k: 'head', n: '头盔', i: '⛑️' },
      { k: 'armor', n: '护甲', i: '🥋' },
      { k: 'accessory', n: '饰品', i: '💍' }
    ];
    slots.forEach(function(s) {
      var cell = createEl('div', { class: 'rpg-equip-cell' });
      cell.appendChild(createEl('div', { class: 'rpg-equip-icon' }, [s.i]));
      cell.appendChild(createEl('div', { class: 'rpg-equip-slot' }, [s.n]));
      cell.appendChild(createEl('div', { class: 'rpg-equip-name' }, [eq[s.k] || '无']));
      wrap.appendChild(cell);
    });
    return wrap;
  }

  function renderStatus(status) {
    var wrap = createEl('div', { class: 'rpg-status-list' });
    status.forEach(function(s) {
      var cls = s.type === 'debuff' ? 'rpg-status-debuff' : s.type === 'special' ? 'rpg-status-special' : 'rpg-status-buff';
      var icon = s.type === 'debuff' ? '⚠️' : s.type === 'special' ? '✨' : '✓';
      wrap.appendChild(createEl('div', { class: 'rpg-status-item ' + cls }, [icon + ' ' + s.name]));
    });
    return wrap;
  }

  function renderAffection(affection) {
    var wrap = createEl('div', { class: 'rpg-affection-list' });
    affection.forEach(function(a) {
      var row = createEl('div', { class: 'rpg-affection-row' });
      row.appendChild(createEl('span', { class: 'rpg-affection-name' }, [a.name]));
      var barWrap = createEl('div', { class: 'rpg-bar-wrap rpg-affection-bar' });
      var pct = clamp(a.percent || 0, 0, 100);
      barWrap.appendChild(createEl('div', { class: 'rpg-bar-fill rpg-affection-fill', style: 'width: ' + pct + '%' }));
      row.appendChild(barWrap);
      row.appendChild(createEl('span', { class: 'rpg-affection-level' }, ['Lv.' + (a.level || 0)]));
      wrap.appendChild(row);
    });
    return wrap;
  }

  function renderInventory(inv) {
    var grid = createEl('div', { class: 'rpg-inv-grid' });
    inv.forEach(function(item) {
      var cell = createEl('div', { class: 'rpg-inv-cell', title: item.name });
      cell.appendChild(createEl('div', { class: 'rpg-inv-icon' }, [item.icon || '📦']));
      cell.appendChild(createEl('div', { class: 'rpg-inv-name' }, [item.name]));
      cell.appendChild(createEl('div', { class: 'rpg-inv-count' }, ['×' + (item.count || 1)]));
      grid.appendChild(cell);
    });
    return grid;
  }

  function renderQuests(quests) {
    var wrap = createEl('div', { class: 'rpg-quest-list' });
    var types = [
      { k: 'main', n: '主线', i: '☀️' },
      { k: 'character', n: '角色任务', i: '⭐' },
      { k: 'daily', n: '日常', i: '📅' },
      { k: 'world', n: '世界任务', i: '🎯' }
    ];
    types.forEach(function(t) {
      var q = quests[t.k];
      if (!q || (Array.isArray(q) && q.length === 0)) return;
      var section = createEl('div', { class: 'rpg-quest-type' });
      section.appendChild(createEl('div', { class: 'rpg-quest-type-title' }, [t.i + ' ' + t.n]));
      var list = Array.isArray(q) ? q : [q];
      list.forEach(function(item) {
        var row = createEl('div', { class: 'rpg-quest-item' });
        row.appendChild(createEl('span', { class: 'rpg-quest-name' }, [item.name || item]));
        if (item.progress !== undefined) {
          row.appendChild(createEl('span', { class: 'rpg-quest-progress' }, [item.progress + '%']));
        }
        section.appendChild(row);
      });
      wrap.appendChild(section);
    });
    return wrap;
  }

  function renderExploration(explore) {
    var wrap = createEl('div', { class: 'rpg-explore-list' });
    explore.forEach(function(e) {
      var row = createEl('div', { class: 'rpg-explore-row' });
      row.appendChild(createEl('span', { class: 'rpg-explore-name' }, [e.name]));
      var pct = clamp(e.percent || 0, 0, 100);
      var barWrap = createEl('div', { class: 'rpg-bar-wrap rpg-explore-bar' });
      barWrap.appendChild(createEl('div', { class: 'rpg-bar-fill rpg-explore-fill', style: 'width: ' + pct + '%' }));
      row.appendChild(barWrap);
      row.appendChild(createEl('span', { class: 'rpg-explore-pct' }, [pct + '%']));
      wrap.appendChild(row);
    });
    return wrap;
  }

  function renderAchievements(ach) {
    var wrap = createEl('div', { class: 'rpg-achievements' });
    var pct = ach.total ? clamp((ach.unlocked / ach.total) * 100, 0, 100) : 0;
    wrap.appendChild(createEl('div', { class: 'rpg-achievement-count' }, ['🏆 ' + (ach.unlocked || 0) + ' / ' + (ach.total || 0)]));
    var barWrap = createEl('div', { class: 'rpg-bar-wrap' });
    barWrap.appendChild(createEl('div', { class: 'rpg-bar-fill rpg-achievement-fill', style: 'width: ' + pct + '%' }));
    wrap.appendChild(barWrap);
    return wrap;
  }

  // ========== 消息处理 ==========
  function processMessage(text) {
    var raw = extractStats(text);
    var stats = normalizeStats(raw);
    if (stats) {
      currentStats = stats;
      renderPanel(stats);
      try { localStorage.setItem('rpg_panel_stats', JSON.stringify(stats)); } catch (e) {}
    }
  }

  // ========== 查找聊天容器 ==========
  function findChatContainer() {
    // TauriTavern / SillyTavern 的聊天容器选择器
    var selectors = [
      '#chat',                    // SillyTavern 标准
      '.chat-messages',           // 备选
      '#chat-container',         // 备选
      '[class*="chat"]',          // 模糊匹配
      'main'                      // 最后fallback
    ];
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el && el.children.length > 0) return el;
    }
    return null;
  }

  // ========== 查找消息元素 ==========
  function findMessageElements() {
    var selectors = [
      '.mes_text',                // SillyTavern 标准
      '.message-text',            // 备选
      '.mes .mes_text',           // 更精确
      '[class*="message"] [class*="text"]',
      '[class*="message"]'
    ];
    for (var i = 0; i < selectors.length; i++) {
      var els = document.querySelectorAll(selectors[i]);
      if (els.length > 0) return els;
    }
    return [];
  }

  // ========== 监听消息 ==========
  var observer = null;
  var retryCount = 0;
  var maxRetries = 30;

  function observeMessages() {
    var chatContainer = findChatContainer();
    if (!chatContainer) {
      if (retryCount < maxRetries) {
        retryCount++;
        setTimeout(observeMessages, 1000);
      }
      return;
    }

    // 扫描现有消息，找最后一条有RPGSTATS的
    var messages = findMessageElements();
    var lastStats = null;
    for (var i = 0; i < messages.length; i++) {
      var s = extractStats(messages[i].textContent || messages[i].innerText || '');
      if (s) lastStats = s;
    }
    if (lastStats) {
      currentStats = lastStats;
      renderPanel(lastStats);
    }

    // MutationObserver 监听新消息
    if (observer) observer.disconnect();
    observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(m) {
        m.addedNodes.forEach(function(node) {
          if (node.nodeType === 1) {
            var text = node.textContent || node.innerText || '';
            processMessage(text);
          }
        });
      });
    });
    observer.observe(chatContainer, { childList: true, subtree: true });
  }

  // ========== 初始化 ==========
  function init() {
    // 创建面板DOM
    if (!$('rpg-panel')) {
      var panel = createEl('div', { id: 'rpg-panel', class: 'rpg-panel' });
      panel.innerHTML = '<div class="rpg-loading">⏳ RPG面板加载中...</div>';
      document.body.appendChild(panel);
      panelCreated = true;
    }

    // 恢复保存的状态
    try {
      var saved = localStorage.getItem('rpg_panel_stats');
      if (saved) {
        var stats = JSON.parse(saved);
        currentStats = stats;
        renderPanel(stats);
      }
    } catch (e) {}

    // 开始监听
    observeMessages();

    console.log('[RPG状态面板] 扩展已加载 (TauriTavern兼容版)');
  }

  // 等待页面加载
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 500);
  }

})();
