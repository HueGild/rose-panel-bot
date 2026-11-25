import React, { useEffect, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  Copy,
  ExternalLink,
  Lock,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Star,
  Unlock,
  X,
} from 'lucide-react';
import { apiRequest, formatTimeAgo } from '../lib/api.js';
import { copyText, haptic, openExternalUrl } from '../lib/telegram.js';
import { Avatar } from './Emblems.jsx';

const STATUS_META = {
  banned: { label: '已拉黑', tone: 'red' },
  trusted: { label: '永久信任', tone: 'rose' },
  verified: { label: '已验证', tone: 'green' },
  closed: { label: '已结单', tone: 'amber' },
  pending: { label: '待验证', tone: '' },
};

export default function VisitorsTab({ initialVisitorId = '', onClearInitial, onToast }) {
  const [visitors, setVisitors] = useState([]);
  const [stats, setStats] = useState({ total: 0, active: 0, trusted: 0, banned: 0, closed: 0 });
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeVisitor, setActiveVisitor] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [actionBusy, setActionBusy] = useState(false);

  const loadList = async (q = search, f = filter) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (f && f !== 'all') params.set('filter', f);
      const res = await apiRequest(`/api/admin/visitors?${params.toString()}`);
      setVisitors(res.items || []);
      setStats(res.stats || stats);
    } catch (err) {
      onToast(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => loadList(search, filter), 160);
    return () => clearTimeout(timer);
  }, [search, filter]);

  // Deep-link directly from Telegram Forum Topic button (?startapp=visitor_<uid>)
  useEffect(() => {
    if (!initialVisitorId) return;
    (async () => {
      try {
        const res = await apiRequest(`/api/admin/visitors/${encodeURIComponent(initialVisitorId)}`);
        if (res.visitor) {
          setActiveVisitor(res.visitor);
          setNoteDraft(res.visitor.note || '');
        }
      } catch (err) {
        onToast(err.message);
      } finally {
        onClearInitial?.();
      }
    })();
  }, [initialVisitorId]);

  const openDetail = (v) => {
    setActiveVisitor(v);
    setNoteDraft(v.note || '');
    haptic('light');
  };

  const runAction = async (action, extra = {}) => {
    if (!activeVisitor) return;
    try {
      setActionBusy(true);
      haptic(action === 'ban' ? 'warning' : 'medium');
      const res = await apiRequest(`/api/admin/visitors/${activeVisitor.userId}/action`, {
        method: 'POST',
        body: { action, ...extra },
      });
      setActiveVisitor(res.visitor);
      setNoteDraft(res.visitor.note || '');
      const labels = {
        ban: '🚫 已拉黑该访客',
        unban: '✅ 已解除拉黑',
        trust: '⭐ 已设为永久信任',
        reset: '🔄 已重置人机验证',
        close: '🔒 已关闭对话',
        open: '🔓 已重新开启对话',
        note: '📝 备注已保存',
      };
      onToast(labels[action] || '操作完成');
      loadList(search, filter);
    } catch (err) {
      onToast(err.message);
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <>
      <div className="search-box">
        <Search size={16} color="var(--text-muted)" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索昵称 / @用户名 / UID / 备注"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
          >
            <X size={15} />
          </button>
        )}
      </div>

      <div className="chip-row">
        {[
          { id: 'all', label: `全部 ${stats.total}` },
          { id: 'active', label: `活跃 ${stats.active}` },
          { id: 'trusted', label: `信任 ${stats.trusted}` },
          { id: 'banned', label: `已拉黑 ${stats.banned}` },
          { id: 'closed', label: `已结单 ${stats.closed}` },
        ].map((item) => (
          <button
            key={item.id}
            className={`chip ${filter === item.id ? 'active' : ''}`}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card empty-state">
          <RefreshCw size={20} className="spin" color="var(--accent)" />
          <div style={{ marginTop: 8 }}>加载访客记录中…</div>
        </div>
      ) : visitors.length === 0 ? (
        <div className="card empty-state">
          <div style={{ fontSize: 28, marginBottom: 8 }}>💬</div>
          <div>暂无符合条件的私聊访客</div>
          <div style={{ marginTop: 6 }}>当有人私聊你的机器人时，资料会自动记录在这里。</div>
        </div>
      ) : (
        <div className="card">
          {visitors.map((v) => {
            const meta = STATUS_META[v.status] || STATUS_META.pending;
            return (
              <div
                className="list-row"
                key={v.userId}
                style={{ cursor: 'pointer' }}
                onClick={() => openDetail(v)}
              >
                <Avatar userId={v.userId} name={v.displayName} size="sm" />
                <div className="row-main">
                  <div className="row-title">
                    <span
                      style={{
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {v.displayName}
                    </span>
                    <span className={`pill ${meta.tone}`} style={{ padding: '2px 8px', fontSize: 11 }}>
                      {meta.label}
                    </span>
                  </div>
                  <div className="row-desc">
                    {v.note ? `📝 ${v.note}` : v.last_preview || (v.username ? `@${v.username}` : `UID ${v.userId}`)}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {formatTimeAgo(v.last_seen_at)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, marginTop: 3 }}>
                    {v.msg_count} 条
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Visitor Profile & Moderation Bottom Sheet */}
      {activeVisitor && (
        <div className="sheet-backdrop" onClick={() => setActiveVisitor(null)}>
          <div className="sheet-panel" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-header">
              <div className="sheet-title">访客资料与风控</div>
              <button className="icon-btn" onClick={() => setActiveVisitor(null)}>
                <X size={16} />
              </button>
            </div>

            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <Avatar userId={activeVisitor.userId} name={activeVisitor.displayName} size="lg" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 18, fontWeight: 700 }}>{activeVisitor.displayName}</span>
                  <span
                    className={`pill ${(STATUS_META[activeVisitor.status] || STATUS_META.pending).tone}`}
                  >
                    {(STATUS_META[activeVisitor.status] || STATUS_META.pending).label}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                  {activeVisitor.username ? `@${activeVisitor.username}` : '未设置用户名'} · UID{' '}
                  {activeVisitor.userId}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <button
                    className="btn btn-subtle btn-sm"
                    onClick={async () => {
                      await copyText(activeVisitor.userId);
                      onToast('已复制 UID');
                    }}
                  >
                    <Copy size={12} /> 复制 UID
                  </button>
                  {activeVisitor.username && (
                    <button
                      className="btn btn-soft btn-sm"
                      onClick={() => openExternalUrl(`https://t.me/${activeVisitor.username}`)}
                    >
                      TG 主页 <ExternalLink size={12} />
                    </button>
                  )}
                  {activeVisitor.topicLink && (
                    <button
                      className="btn btn-soft btn-sm"
                      onClick={() => openExternalUrl(activeVisitor.topicLink)}
                    >
                      去话题 <ExternalLink size={12} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="card" style={{ fontSize: 13 }}>
              <div className="list-row">
                <span style={{ color: 'var(--text-secondary)' }}>累计发送消息</span>
                <strong>{activeVisitor.msg_count} 条</strong>
              </div>
              <div className="list-row">
                <span style={{ color: 'var(--text-secondary)' }}>首次私聊</span>
                <span>{formatTimeAgo(activeVisitor.first_seen_at)}</span>
              </div>
              <div className="list-row">
                <span style={{ color: 'var(--text-secondary)' }}>最近活跃</span>
                <span>{formatTimeAgo(activeVisitor.last_seen_at)}</span>
              </div>
              {activeVisitor.last_preview && (
                <div className="list-row">
                  <span style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>最近消息</span>
                  <span
                    style={{
                      textAlign: 'right',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {activeVisitor.last_preview}
                  </span>
                </div>
              )}
            </div>

            {/* Admin Private Note */}
            <div className="card">
              <label className="field-label">站长私密备注（仅你可见）</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="input"
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder="例如：老朋友 / 商务合作 / 广告营销号"
                />
                <button
                  className="btn btn-soft"
                  style={{ flexShrink: 0 }}
                  disabled={actionBusy}
                  onClick={() => runAction('note', { note: noteDraft })}
                >
                  <Save size={14} /> 保存
                </button>
              </div>
            </div>

            {/* One-Tap Moderation Buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {activeVisitor.isBanned ? (
                <button
                  className="btn btn-success btn-block"
                  disabled={actionBusy}
                  onClick={() => runAction('unban')}
                >
                  <CheckCircle2 size={16} /> 解除拉黑
                </button>
              ) : (
                <button
                  className="btn btn-danger btn-block"
                  disabled={actionBusy}
                  onClick={() => runAction('ban')}
                >
                  <Ban size={16} /> 一键拉黑
                </button>
              )}

              {activeVisitor.isTrusted ? (
                <button
                  className="btn btn-subtle btn-block"
                  disabled={actionBusy}
                  onClick={() => runAction('reset')}
                >
                  <RotateCcw size={16} /> 重置验证
                </button>
              ) : (
                <button
                  className="btn btn-soft btn-block"
                  disabled={actionBusy}
                  onClick={() => runAction('trust')}
                >
                  <Star size={16} /> 永久信任
                </button>
              )}

              {activeVisitor.isClosed ? (
                <button
                  className="btn btn-soft btn-block"
                  style={{ gridColumn: 'span 2' }}
                  disabled={actionBusy}
                  onClick={() => runAction('open', { notifyUser: true })}
                >
                  <Unlock size={16} /> 恢复对话并通知对方
                </button>
              ) : (
                <button
                  className="btn btn-subtle btn-block"
                  style={{ gridColumn: 'span 2' }}
                  disabled={actionBusy}
                  onClick={() => runAction('close', { notifyUser: true })}
                >
                  <Lock size={16} /> 结束本次对话并通知对方
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
