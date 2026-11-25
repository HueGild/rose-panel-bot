import React, { useCallback, useEffect, useState } from 'react';
import {
  Globe,
  Moon,
  RefreshCw,
  Server,
  Settings,
  Sun,
  Ticket,
  Trophy,
  Users,
} from 'lucide-react';
import LeaderboardTab from './components/LeaderboardTab.jsx';
import ProbeTab from './components/ProbeTab.jsx';
import SettingsDrawer from './components/SettingsDrawer.jsx';
import SitesTab from './components/SitesTab.jsx';
import TicketTab from './components/TicketTab.jsx';
import VisitorsTab from './components/VisitorsTab.jsx';
import { apiRequest, getDevRole, setDevRole } from './lib/api.js';
import {
  getLaunchTarget,
  getTelegramColorScheme,
  haptic,
  initTelegramWebApp,
} from './lib/telegram.js';

export default function App() {
  const [theme, setTheme] = useState(() => getTelegramColorScheme());
  const [bootstrap, setBootstrap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('profile');
  const [deepVisitorId, setDeepVisitorId] = useState('');
  const [settingsSection, setSettingsSection] = useState(null);
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [previewRole, setPreviewRole] = useState(() => getDevRole());

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => {
      setToast((curr) => (curr === msg ? '' : curr));
    }, 2600);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const loadBootstrap = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await apiRequest('/api/bootstrap');
      setBootstrap(res);

      // Handle Telegram start_param deep links (e.g. visitor_123456)
      const target = getLaunchTarget();
      if (target.tab === 'visitors' && res.isAdmin) {
        setActiveTab('visitors');
        if (target.visitorId) setDeepVisitorId(target.visitorId);
      } else if (['profile', 'sites', 'probe'].includes(target.tab)) {
        setActiveTab(target.tab);
      }
    } catch (err) {
      setError(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    initTelegramWebApp();
    loadBootstrap();
  }, [loadBootstrap]);

  const handleCheckin = async () => {
    try {
      setCheckinLoading(true);
      const res = await apiRequest('/api/checkin', { method: 'POST' });
      setBootstrap((prev) => (prev ? { ...prev, checkin: res.ticket } : prev));
      if (res.alreadyCheckedIn) {
        showToast('今日已经签过啦 🌸');
      } else {
        haptic('success');
        const badgeMsg =
          res.newlyUnlocked?.length > 0
            ? ` · 解锁徽章「${res.newlyUnlocked.map((b) => b.name).join('、')}」`
            : '';
        showToast(
          `🎉 签到成功 +${res.gained} ${bootstrap?.config?.community?.currencyName || '积分'}${badgeMsg}`
        );
      }
    } catch (err) {
      showToast(err.message);
    } finally {
      setCheckinLoading(false);
    }
  };

  const handleSwitchPreviewRole = () => {
    const next = previewRole === 'admin' ? 'guest' : 'admin';
    setDevRole(next);
    setPreviewRole(next);
    if (next === 'guest' && activeTab === 'visitors') {
      setActiveTab('profile');
    }
    loadBootstrap();
  };

  if (loading && !bootstrap) {
    return (
      <div className="app-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="empty-state">
          <RefreshCw size={24} className="spin" color="var(--accent)" />
          <div style={{ marginTop: 10 }}>正在打开个人面板…</div>
        </div>
      </div>
    );
  }

  if (error && !bootstrap) {
    return (
      <div className="app-shell">
        <div className="card empty-state">
          <div style={{ fontSize: 28, marginBottom: 8 }}>🥀</div>
          <div style={{ fontWeight: 700, color: 'var(--text)' }}>无法连接到面板服务</div>
          <div style={{ marginTop: 6 }}>{error}</div>
          <button className="btn btn-primary btn-sm" style={{ marginTop: 14 }} onClick={loadBootstrap}>
            重试
          </button>
        </div>
      </div>
    );
  }

  const isAdmin = Boolean(bootstrap?.isAdmin);
  const enableCheckin = Boolean(bootstrap?.config?.community?.enableCheckin);

  const navItems = [
    { id: 'profile', label: '票根', icon: Ticket },
    { id: 'sites', label: '小站', icon: Globe },
    { id: 'probe', label: '探针', icon: Server },
  ];

  if (isAdmin) {
    navItems.push({
      id: 'visitors',
      label: '访客',
      icon: Users,
      badge: bootstrap?.visitorSummary?.active || 0,
    });
  } else if (enableCheckin) {
    navItems.push({ id: 'leaderboard', label: '榜单', icon: Trophy });
  }

  return (
    <div className="app-shell">
      {toast && <div className="toast">{toast}</div>}

      {bootstrap?.isPreview && (
        <div className="preview-banner">
          <span>🧪 本地预览模式（当前视角：{isAdmin ? '站长' : '访客'}）</span>
          <button
            className="btn btn-sm"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text)', padding: '4px 10px' }}
            onClick={handleSwitchPreviewRole}
          >
            切换视角
          </button>
        </div>
      )}

      {/* Top Bar */}
      <header className="top-bar">
        <div className="top-brand">
          <span className="top-brand-dot" />
          <span className="top-title">{bootstrap?.config?.profile?.displayName || 'RosePanel'}</span>
          <span className="top-sub">小程序</span>
        </div>

        <div className="top-actions">
          <button
            className="icon-btn"
            title="切换深浅色主题"
            onClick={() => {
              haptic('light');
              setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
            }}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          {isAdmin && (
            <button
              className="icon-btn accent"
              title="面板可视化设置"
              onClick={() => {
                haptic('light');
                setSettingsSection('profile');
              }}
            >
              <Settings size={16} />
            </button>
          )}
        </div>
      </header>

      {/* Main View */}
      <main>
        {activeTab === 'profile' && (
          <TicketTab
            data={bootstrap}
            onNavigate={(tab) => {
              haptic('light');
              setActiveTab(tab);
            }}
            onCheckin={handleCheckin}
            checkinLoading={checkinLoading}
            onToast={showToast}
          />
        )}

        {activeTab === 'sites' && (
          <SitesTab
            sites={bootstrap?.config?.sites || []}
            isAdmin={isAdmin}
            onOpenSettings={(sec) => setSettingsSection(sec)}
            onSitesUpdated={(updatedRes) =>
              setBootstrap((prev) =>
                prev
                  ? {
                      ...prev,
                      config: updatedRes.config,
                      adminConfig: updatedRes.adminConfig,
                    }
                  : prev
              )
            }
            onToast={showToast}
          />
        )}

        {activeTab === 'probe' && (
          <ProbeTab
            probeConfig={bootstrap?.config?.probe}
            isAdmin={isAdmin}
            onOpenSettings={(sec) => setSettingsSection(sec)}
            onToast={showToast}
          />
        )}

        {activeTab === 'visitors' && isAdmin && (
          <VisitorsTab
            initialVisitorId={deepVisitorId}
            onClearInitial={() => setDeepVisitorId('')}
            onToast={showToast}
          />
        )}

        {activeTab === 'leaderboard' && enableCheckin && (
          <LeaderboardTab
            currencyName={bootstrap?.config?.community?.currencyName || '积分'}
            onToast={showToast}
          />
        )}
      </main>

      {/* Floating Glass Pill Bottom Dock */}
      <nav className="bottom-dock-wrap" aria-label="主导航">
        <div className="bottom-dock">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`dock-item ${active ? 'active' : ''}`}
                onClick={() => {
                  haptic('light');
                  setActiveTab(item.id);
                }}
              >
                <Icon size={20} strokeWidth={active ? 2.2 : 1.9} />
                <span>{item.label}</span>
                {item.badge > 0 && <span className="dock-badge">{item.badge > 99 ? '99+' : item.badge}</span>}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Admin Visual Settings Drawer */}
      {isAdmin && settingsSection && bootstrap?.adminConfig && (
        <SettingsDrawer
          initialSection={settingsSection}
          adminConfig={bootstrap.adminConfig}
          onClose={() => setSettingsSection(null)}
          onSaved={(savedRes) => {
            setBootstrap((prev) =>
              prev
                ? {
                    ...prev,
                    config: savedRes.config,
                    adminConfig: savedRes.adminConfig,
                  }
                : prev
            );
            loadBootstrap();
          }}
          onToast={showToast}
        />
      )}
    </div>
  );
}
