import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Globe,
  Lock,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { apiRequest } from '../lib/api.js';
import { TgStickerMedia, TicketEmblem } from './Emblems.jsx';

export default function SettingsDrawer({
  initialSection = 'profile',
  adminConfig,
  onClose,
  onSaved,
  onToast,
}) {
  const [section, setSection] = useState(initialSection);
  const [draft, setDraft] = useState(() => structuredClone(adminConfig));
  const [saving, setSaving] = useState(false);
  const [testingProbe, setTestingProbe] = useState(false);
  const [probeTestResult, setProbeTestResult] = useState(null);

  // Telegram Sticker / Custom Emoji pack browser state
  const [packInput, setPackInput] = useState('');
  const [loadingPack, setLoadingPack] = useState(false);
  const [loadedPack, setLoadedPack] = useState(null);

  // In-panel Sticker Quiz adder state
  const [showQuizAdder, setShowQuizAdder] = useState(false);
  const [quizPackInput, setQuizPackInput] = useState('');
  const [quizPackLoading, setQuizPackLoading] = useState(false);
  const [quizLoadedPack, setQuizLoadedPack] = useState(null);
  const [quizSelectedSticker, setQuizSelectedSticker] = useState(null);
  const [quizQuestion, setQuizQuestion] = useState('');
  const [quizAnswer, setQuizAnswer] = useState('');
  const [quizWrongText, setQuizWrongText] = useState('');

  const handleFetchQuizPack = async () => {
    if (!quizPackInput.trim()) {
      onToast('请粘贴 t.me/addstickers/... 贴纸包链接');
      return;
    }
    try {
      setQuizPackLoading(true);
      const res = await apiRequest('/api/admin/stickers/pack', {
        method: 'POST',
        body: { input: quizPackInput.trim() },
      });
      setQuizLoadedPack(res);
      onToast(`已加载「${res.title}」（共 ${res.stickers?.length || 0} 张贴纸）`);
    } catch (err) {
      onToast(err.message);
    } finally {
      setQuizPackLoading(false);
    }
  };

  const handleAddStickerQuiz = () => {
    if (!quizSelectedSticker?.fileId) {
      onToast('请先从贴纸包或收藏中点选一张贴纸');
      return;
    }
    const q = quizQuestion.trim();
    const a = quizAnswer.trim();
    const wrong = quizWrongText
      .split(/[,，|｜\n]+/)
      .map((s) => s.trim())
      .filter((s) => s && s !== a)
      .slice(0, 3);
    if (!q || !a || wrong.length === 0) {
      onToast('请填写题目、正确答案和至少 1 个干扰项');
      return;
    }
    const nextList = [
      {
        id: `sq_${Date.now()}`,
        ...quizSelectedSticker,
        question: q,
        answer: a,
        wrong,
      },
      ...(draft.pmBot.stickerChallenges || []),
    ].slice(0, 40);
    updateField('pmBot', 'stickerChallenges', nextList);
    setQuizSelectedSticker(null);
    setQuizQuestion('');
    setQuizAnswer('');
    setQuizWrongText('');
    setShowQuizAdder(false);
    onToast('🎉 已加入题库！记得点击底部「保存全部设置」');
  };

  const updateField = (group, key, value) => {
    setDraft((prev) => ({
      ...prev,
      [group]: { ...prev[group], [key]: value },
    }));
  };

  const updateEmblem = (patch) => {
    setDraft((prev) => ({
      ...prev,
      profile: {
        ...prev.profile,
        emblem: {
          ...(prev.profile?.emblem || {}),
          ...patch,
        },
      },
    }));
  };

  const handleSelectSticker = (sticker) => {
    const existingSaved = Array.isArray(draft.profile?.emblem?.savedStickers)
      ? draft.profile.emblem.savedStickers
      : [];
    const mergedSaved = [sticker, ...existingSaved]
      .filter((item, idx, arr) => item?.fileId && arr.findIndex((x) => x.fileId === item.fileId) === idx)
      .slice(0, 30);

    updateEmblem({
      type: 'tg_sticker',
      fileId: sticker.fileId,
      format: sticker.format || 'webp',
      emoji: sticker.emoji || '',
      setName: sticker.setName || '',
      savedStickers: mergedSaved,
    });
    onToast('✨ 已选中该徽章，点底部「保存全部设置」生效');
  };

  const handleFetchStickerPack = async () => {
    if (!packInput.trim()) {
      onToast('请粘贴 t.me/addstickers/... 或 t.me/addemoji/... 链接');
      return;
    }
    try {
      setLoadingPack(true);
      const res = await apiRequest('/api/admin/stickers/pack', {
        method: 'POST',
        body: { input: packInput.trim() },
      });
      setLoadedPack(res);
      onToast(`已加载「${res.title}」（共 ${res.stickers?.length || 0} 枚）`);
    } catch (err) {
      onToast(err.message);
    } finally {
      setLoadingPack(false);
    }
  };

  const handleAddSite = (visibility = 'public') => {
    setDraft((prev) => ({
      ...prev,
      sites: [
        ...(prev.sites || []),
        {
          id: `site-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          name: visibility === 'private' ? '常用私密站点' : '新公开小站',
          url: 'https://',
          description: '',
          category: visibility === 'private' ? '常用' : '工具',
          icon: visibility === 'private' ? '🔐' : '✨',
          badge: '',
          visibility,
        },
      ],
    }));
  };

  const handleUpdateSite = (idx, key, val) => {
    setDraft((prev) => {
      const next = [...prev.sites];
      next[idx] = { ...next[idx], [key]: val };
      return { ...prev, sites: next };
    });
  };

  const handleMoveSite = (idx, delta) => {
    setDraft((prev) => {
      const target = idx + delta;
      if (target < 0 || target >= prev.sites.length) return prev;
      const next = [...prev.sites];
      [next[idx], next[target]] = [next[target], next[idx]];
      return { ...prev, sites: next };
    });
  };

  const handleRemoveSite = (idx) => {
    setDraft((prev) => ({
      ...prev,
      sites: prev.sites.filter((_, i) => i !== idx),
    }));
  };

  const handleAddSocial = () => {
    setDraft((prev) => ({
      ...prev,
      profile: {
        ...prev.profile,
        socials: [
          ...(prev.profile.socials || []),
          { id: `soc-${Date.now()}`, label: '新链接', value: '', url: 'https://', icon: 'link' },
        ],
      },
    }));
  };

  const handleUpdateSocial = (idx, key, val) => {
    setDraft((prev) => {
      const next = [...(prev.profile.socials || [])];
      next[idx] = { ...next[idx], [key]: val };
      return { ...prev, profile: { ...prev.profile, socials: next } };
    });
  };

  const handleRemoveSocial = (idx) => {
    setDraft((prev) => ({
      ...prev,
      profile: {
        ...prev.profile,
        socials: prev.profile.socials.filter((_, i) => i !== idx),
      },
    }));
  };

  const handleTestProbe = async () => {
    try {
      setTestingProbe(true);
      setProbeTestResult(null);
      const res = await apiRequest('/api/admin/probe/test', {
        method: 'POST',
        body: draft.probe,
      });
      setProbeTestResult({
        ok: true,
        text: `连接成功 (${res.protocol})！读取到 ${res.summary?.total || 0} 台节点（在线 ${res.summary?.online || 0} 台）`,
      });
    } catch (err) {
      setProbeTestResult({ ok: false, text: err.message });
    } finally {
      setTestingProbe(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const res = await apiRequest('/api/admin/config', {
        method: 'PUT',
        body: draft,
      });
      onToast('✅ 面板配置已实时生效');
      onSaved(res);
      onClose();
    } catch (err) {
      onToast(err.message);
    } finally {
      setSaving(false);
    }
  };

  const emblem = draft.profile?.emblem || { type: 'builtin', variant: 'owner', savedStickers: [] };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet-panel" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-header">
          <div className="sheet-title">面板可视化设置</div>
          <button className="icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="chip-row">
          {[
            { id: 'profile', label: '名片与徽章' },
            { id: 'sites', label: '个人小站' },
            { id: 'probe', label: 'Komari 探针' },
            { id: 'modes', label: '社区与防骚扰' },
          ].map((tab) => (
            <button
              key={tab.id}
              className={`chip ${section === tab.id ? 'active' : ''}`}
              onClick={() => setSection(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Section 1: Profile & Ticket Emblem (TG Stickers / Custom Emojis!) */}
        {section === 'profile' && (
          <>
            {/* Ticket Stub Emblem Picker Card */}
            <div className="card">
              <div className="card-header" style={{ marginBottom: 10 }}>
                <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Sparkles size={15} color="var(--accent)" /> 名片主徽章（支持 TG 贴纸 / 收藏表情）
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 18,
                    background: 'var(--bg-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <TicketEmblem emblem={emblem} size={60} />
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[
                    { id: 'builtin', label: '内置玫瑰' },
                    { id: 'tg_sticker', label: 'TG 贴纸·表情' },
                    { id: 'url', label: '图片链接' },
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      className={`pill ${emblem.type === mode.id ? 'rose' : ''}`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => updateEmblem({ type: mode.id })}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              {emblem.type === 'builtin' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {[
                    { id: 'owner', label: '玫瑰花瓣' },
                    { id: 'bottle', label: '水晶药水瓶' },
                    { id: 'crown', label: '星辰皇冠' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className={`sticker-cell ${emblem.variant === opt.id ? 'selected' : ''}`}
                      onClick={() => updateEmblem({ type: 'builtin', variant: opt.id })}
                    >
                      <TicketEmblem emblem={{ type: 'builtin', variant: opt.id }} size={44} />
                      <span style={{ fontSize: 11, marginTop: 4 }}>{opt.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {emblem.type === 'url' && (
                <div className="field" style={{ marginBottom: 0 }}>
                  <label className="field-label">透明底 PNG / WebP / GIF 图片链接</label>
                  <input
                    className="input"
                    value={emblem.url || ''}
                    onChange={(e) => updateEmblem({ type: 'url', url: e.target.value })}
                    placeholder="https://example.com/badge.webp"
                  />
                </div>
              )}

              {emblem.type === 'tg_sticker' && (
                <div>
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--accent)',
                      background: 'var(--accent-soft)',
                      borderRadius: 12,
                      padding: '8px 10px',
                      marginBottom: 10,
                      lineHeight: 1.5,
                    }}
                  >
                    💡 <b>最快捷方式</b>：直接私聊机器人发 <code>/set</code>，再发任意一张贴纸、收藏的 TG 自定义表情或贴纸包链接即可秒设！也可在下方贴贴纸包链接挑选：
                  </div>

                  <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                    <input
                      className="input"
                      value={packInput}
                      onChange={(e) => setPackInput(e.target.value)}
                      placeholder="粘贴 t.me/addstickers/... 或 addemoji/..."
                    />
                    <button
                      type="button"
                      className="btn btn-soft"
                      style={{ flexShrink: 0 }}
                      disabled={loadingPack}
                      onClick={handleFetchStickerPack}
                    >
                      {loadingPack ? <RefreshCw size={14} className="spin" /> : '拉取'}
                    </button>
                  </div>

                  {loadedPack?.stickers?.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div className="field-label">
                        「{loadedPack.title}」点击选用（支持静态 / 动态）
                      </div>
                      <div className="sticker-grid">
                        {loadedPack.stickers.map((st) => (
                          <button
                            key={st.fileId}
                            type="button"
                            className={`sticker-cell ${emblem.fileId === st.fileId ? 'selected' : ''}`}
                            onClick={() => handleSelectSticker(st)}
                          >
                            <TgStickerMedia
                              fileId={st.thumbFileId || st.fileId}
                              format={st.thumbFileId ? 'webp' : st.format}
                              emoji={st.emoji}
                              size={42}
                              previewOnly
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {emblem.savedStickers?.length > 0 && (
                    <div>
                      <div className="field-label">我的收藏徽章库（点击切换）</div>
                      <div className="sticker-grid">
                        {emblem.savedStickers.map((st) => (
                          <button
                            key={st.fileId}
                            type="button"
                            className={`sticker-cell ${emblem.fileId === st.fileId ? 'selected' : ''}`}
                            onClick={() => handleSelectSticker(st)}
                          >
                            <TgStickerMedia
                              fileId={st.thumbFileId || st.fileId}
                              format={st.thumbFileId ? 'webp' : st.format}
                              emoji={st.emoji}
                              size={42}
                              previewOnly
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="card">
              <div className="field">
                <label className="field-label">显示昵称</label>
                <input
                  className="input"
                  value={draft.profile.displayName}
                  onChange={(e) => updateField('profile', 'displayName', e.target.value)}
                />
              </div>
              <div className="field">
                <label className="field-label">Bot / 个人账号标识</label>
                <input
                  className="input"
                  value={draft.profile.handle}
                  onChange={(e) => updateField('profile', 'handle', e.target.value)}
                />
              </div>
              <div className="field">
                <label className="field-label">当前状态文案</label>
                <input
                  className="input"
                  value={draft.profile.statusText}
                  onChange={(e) => updateField('profile', 'statusText', e.target.value)}
                  placeholder="例如：在线营业中 / 摸鱼中 / 勿扰"
                />
              </div>
              <div className="field">
                <label className="field-label">个人简介</label>
                <textarea
                  className="textarea"
                  value={draft.profile.tagline}
                  onChange={(e) => updateField('profile', 'tagline', e.target.value)}
                />
              </div>
              <div className="field">
                <label className="field-label">自定义头像图片链接（留空自动取站长 TG 头像）</label>
                <input
                  className="input"
                  value={draft.profile.avatarUrl}
                  onChange={(e) => updateField('profile', 'avatarUrl', e.target.value)}
                  placeholder="https://..."
                />
              </div>
              <div className="field">
                <label className="field-label">置顶公告（留空则隐藏）</label>
                <input
                  className="input"
                  value={draft.profile.notice}
                  onChange={(e) => updateField('profile', 'notice', e.target.value)}
                  placeholder="可选：向访客展示一条置顶公告"
                />
              </div>
              <div className="field">
                <label className="field-label">个人标签（可选，逗号或空格分隔）</label>
                <input
                  className="input"
                  value={draft.profile.tags || ''}
                  onChange={(e) => updateField('profile', 'tags', e.target.value)}
                  placeholder="例如：VPS 折腾, 自托管, 开源, ACG"
                />
              </div>
              <div className="field">
                <label className="field-label">下方说明卡标题（如「来信礼仪」「关于我」）</label>
                <input
                  className="input"
                  value={draft.profile.noteTitle ?? '来信礼仪'}
                  onChange={(e) => updateField('profile', 'noteTitle', e.target.value)}
                  placeholder="来信礼仪"
                />
              </div>
              <div className="field">
                <label className="field-label">下方说明卡内容（每行一条，全部留空则隐藏）</label>
                <textarea
                  className="textarea"
                  value={draft.profile.noteLines ?? ''}
                  onChange={(e) => updateField('profile', 'noteLines', e.target.value)}
                  placeholder="例如：初次私聊请直接说明来意，不用只发「在吗」"
                />
              </div>

              <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span className="field-label" style={{ margin: 0 }}>社交与联系方式</span>
                  <button className="btn btn-soft btn-sm" onClick={handleAddSocial}>
                    <Plus size={13} /> 添加
                  </button>
                </div>
                {(draft.profile.socials || []).map((soc, idx) => (
                  <div
                    key={soc.id || idx}
                    style={{
                      background: 'var(--bg-subtle)',
                      borderRadius: 14,
                      padding: 10,
                      marginBottom: 8,
                    }}
                  >
                    <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                      <input
                        className="input"
                        style={{ background: 'var(--bg-elevated)' }}
                        value={soc.label}
                        placeholder="名称"
                        onChange={(e) => handleUpdateSocial(idx, 'label', e.target.value)}
                      />
                      <button className="icon-btn" onClick={() => handleRemoveSocial(idx)}>
                        <Trash2 size={14} color="var(--red)" />
                      </button>
                    </div>
                    <input
                      className="input"
                      style={{ background: 'var(--bg-elevated)', marginBottom: 6 }}
                      value={soc.value}
                      placeholder="展示文字"
                      onChange={(e) => handleUpdateSocial(idx, 'value', e.target.value)}
                    />
                    <input
                      className="input"
                      style={{ background: 'var(--bg-elevated)' }}
                      value={soc.url}
                      placeholder="跳转 URL（留空则点击复制）"
                      onChange={(e) => handleUpdateSocial(idx, 'url', e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Section 2: Sites (Public & Private Bookmarks + Reorder) */}
        {section === 'sites' && (
          <div>
            {(draft.sites || []).map((site, idx) => {
              const isPriv = site.visibility === 'private';
              return (
                <div className="card" key={site.id || idx}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 8,
                      gap: 6,
                    }}
                  >
                    <button
                      type="button"
                      className={`pill ${isPriv ? 'amber' : 'green'}`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => handleUpdateSite(idx, 'visibility', isPriv ? 'public' : 'private')}
                    >
                      {isPriv ? <Lock size={11} /> : <Globe size={11} />}
                      {isPriv ? '仅我可见（私密隐藏）' : '公开可见'}
                    </button>

                    <div style={{ display: 'flex', gap: 5 }}>
                      <button
                        type="button"
                        className="icon-btn"
                        disabled={idx === 0}
                        title="上移"
                        onClick={() => handleMoveSite(idx, -1)}
                      >
                        <ArrowUp size={13} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        disabled={idx === draft.sites.length - 1}
                        title="下移"
                        onClick={() => handleMoveSite(idx, 1)}
                      >
                        <ArrowDown size={13} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        title="删除"
                        onClick={() => handleRemoveSite(idx)}
                      >
                        <Trash2 size={14} color="var(--red)" />
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <input
                      className="input"
                      style={{ width: 56, textAlign: 'center' }}
                      value={site.icon}
                      onChange={(e) => handleUpdateSite(idx, 'icon', e.target.value)}
                      placeholder="🌐"
                    />
                    <input
                      className="input"
                      value={site.name}
                      onChange={(e) => handleUpdateSite(idx, 'name', e.target.value)}
                      placeholder="站点名称"
                    />
                  </div>
                  <div className="field">
                    <input
                      className="input"
                      value={site.url}
                      onChange={(e) => handleUpdateSite(idx, 'url', e.target.value)}
                      placeholder="https://your-site.com"
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                    <input
                      className="input"
                      value={site.category}
                      onChange={(e) => handleUpdateSite(idx, 'category', e.target.value)}
                      placeholder="分类（如 博客 / 常用 / 后台）"
                    />
                    <input
                      className="input"
                      value={site.badge}
                      onChange={(e) => handleUpdateSite(idx, 'badge', e.target.value)}
                      placeholder="角标（可选，如 主站）"
                    />
                  </div>
                  <input
                    className="input"
                    value={site.description}
                    onChange={(e) => handleUpdateSite(idx, 'description', e.target.value)}
                    placeholder="一句话介绍"
                  />
                </div>
              );
            })}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
              <button className="btn btn-soft btn-block" onClick={() => handleAddSite('public')}>
                <Globe size={15} /> + 公开小站
              </button>
              <button className="btn btn-subtle btn-block" onClick={() => handleAddSite('private')}>
                <Lock size={15} /> + 私密常用站
              </button>
            </div>
          </div>
        )}

        {/* Section 3: Komari Probe */}
        {section === 'probe' && (
          <div className="card">
            <div className="field">
              <label className="field-label">Komari 探针地址（自动兼容 v2 /api/rpc2 与 v1 /api/nodes）</label>
              <input
                className="input"
                value={draft.probe.url}
                onChange={(e) => updateField('probe', 'url', e.target.value)}
                placeholder="https://status.example.com"
              />
            </div>
            <div className="field">
              <label className="field-label">对外跳转链接（可选，留空同上）</label>
              <input
                className="input"
                value={draft.probe.publicUrl}
                onChange={(e) => updateField('probe', 'publicUrl', e.target.value)}
                placeholder="https://status.example.com"
              />
            </div>
            <div className="field">
              <label className="field-label">API Token / Cookie（公开 Komari 留空即可）</label>
              <input
                className="input"
                type="password"
                value={draft.probe.apiKey}
                onChange={(e) => updateField('probe', 'apiKey', e.target.value)}
                placeholder="公开探针无需填写；私有站点可填 Bearer Token 或 session_token=..."
              />
            </div>

            <div className="list-row">
              <div className="row-main">
                <div className="row-title" style={{ fontSize: 14 }}>演示模式（未填地址时展示示例节点）</div>
                <div className="row-desc wrap">便于在未接入探针前预览节点卡片效果</div>
              </div>
              <button
                type="button"
                className={`switch ${draft.probe.demoMode ? 'on' : ''}`}
                onClick={() => updateField('probe', 'demoMode', !draft.probe.demoMode)}
              >
                <span className="switch-knob" />
              </button>
            </div>

            <button
              className="btn btn-soft btn-block"
              style={{ marginTop: 10 }}
              disabled={testingProbe}
              onClick={handleTestProbe}
            >
              <RefreshCw size={15} className={testingProbe ? 'spin' : ''} /> 测试 Komari 连接
            </button>

            {probeTestResult && (
              <div
                style={{
                  marginTop: 10,
                  padding: '9px 12px',
                  borderRadius: 12,
                  fontSize: 12,
                  background: probeTestResult.ok ? 'var(--green-soft)' : 'var(--red-soft)',
                  color: probeTestResult.ok ? 'var(--green)' : 'var(--red)',
                }}
              >
                {probeTestResult.ok ? '✅ ' : '❌ '}
                {probeTestResult.text}
              </div>
            )}
          </div>
        )}

        {/* Section 4: Community Check-in & PM Anti-Spam */}
        {section === 'modes' && (
          <div className="card">
            <div className="list-row">
              <div className="row-main">
                <div className="row-title" style={{ fontSize: 14 }}>群签到与积分徽章模式</div>
                <div className="row-desc wrap">
                  关闭时为极简个人名片；开启后支持群员每日签到、连签奖励、等级与徽章墙
                </div>
              </div>
              <button
                type="button"
                className={`switch ${draft.community.enableCheckin ? 'on' : ''}`}
                onClick={() => updateField('community', 'enableCheckin', !draft.community.enableCheckin)}
              >
                <span className="switch-knob" />
              </button>
            </div>

            {draft.community.enableCheckin && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
                <div className="field">
                  <label className="field-label">每日最低积分</label>
                  <input
                    className="input"
                    type="number"
                    value={draft.community.dailyMinPoints}
                    onChange={(e) => updateField('community', 'dailyMinPoints', Number(e.target.value))}
                  />
                </div>
                <div className="field">
                  <label className="field-label">每日最高积分</label>
                  <input
                    className="input"
                    type="number"
                    value={draft.community.dailyMaxPoints}
                    onChange={(e) => updateField('community', 'dailyMaxPoints', Number(e.target.value))}
                  />
                </div>
                <div className="field">
                  <label className="field-label">连签每日递增奖励</label>
                  <input
                    className="input"
                    type="number"
                    value={draft.community.streakStepBonus}
                    onChange={(e) => updateField('community', 'streakStepBonus', Number(e.target.value))}
                  />
                </div>
                <div className="field">
                  <label className="field-label">积分单位名称</label>
                  <input
                    className="input"
                    value={draft.community.currencyName}
                    onChange={(e) => updateField('community', 'currencyName', e.target.value)}
                  />
                </div>
              </div>
            )}

            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <label className="field-label">私聊防骚扰人机验证模式</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                {[
                  { id: 'emoji', label: '🎯 Emoji 找茬/点选', desc: '0延迟推荐' },
                  {
                    id: 'sticker_quiz',
                    label: '🎭 表情包看图猜题',
                    desc: `已录 ${(draft.pmBot.stickerChallenges || []).length} 题`,
                  },
                  { id: 'quiz', label: '📝 常识题库', desc: '0延迟四选一' },
                  { id: 'turnstile', label: '🛡️ CF Turnstile', desc: '严格防扫号' },
                  { id: 'off', label: '关闭验证', desc: '直接转发' },
                ].map((opt) => {
                  const active = (draft.pmBot.verificationMode || 'emoji') === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      className={`sticker-cell ${active ? 'selected' : ''}`}
                      style={{ padding: '10px 8px', textAlign: 'center' }}
                      onClick={() => {
                        updateField('pmBot', 'verificationMode', opt.id);
                        updateField('pmBot', 'enableVerification', opt.id !== 'off');
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 700 }}>{opt.label}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                        {opt.desc}
                      </span>
                    </button>
                  );
                })}
              </div>

              {(draft.pmBot.verificationMode === 'sticker_quiz' ||
                (draft.pmBot.stickerChallenges || []).length > 0) && (
                <div
                  style={{
                    background: 'var(--bg-subtle)',
                    borderRadius: 16,
                    padding: 12,
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 8,
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 700 }}>
                      🎭 我的表情包验证题库（{(draft.pmBot.stickerChallenges || []).length} 题）
                    </span>
                    <button
                      type="button"
                      className="btn btn-soft btn-sm"
                      onClick={() => setShowQuizAdder((v) => !v)}
                    >
                      <Plus size={13} /> {showQuizAdder ? '收起' : '面板添加'}
                    </button>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--accent)', marginBottom: 8, lineHeight: 1.5 }}>
                    💡 既可点右上角「面板添加」拉贴纸包选图出题，也可直接私聊机器人发 <code>/add</code> 3 秒直录！
                    {(draft.pmBot.stickerChallenges || []).length === 0 &&
                      '（当前题库为空时会自动回退到 Emoji 模式）'}
                  </div>

                  {showQuizAdder && (
                    <div
                      style={{
                        background: 'var(--bg-elevated)',
                        borderRadius: 14,
                        padding: 10,
                        marginBottom: 10,
                        border: '1px solid var(--accent-line)',
                      }}
                    >
                      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                        <input
                          className="input"
                          value={quizPackInput}
                          onChange={(e) => setQuizPackInput(e.target.value)}
                          placeholder="粘贴贴纸包链接（如 t.me/addstickers/cclovely）"
                        />
                        <button
                          type="button"
                          className="btn btn-soft"
                          style={{ flexShrink: 0 }}
                          disabled={quizPackLoading}
                          onClick={handleFetchQuizPack}
                        >
                          {quizPackLoading ? <RefreshCw size={14} className="spin" /> : '拉取'}
                        </button>
                      </div>

                      {quizLoadedPack?.stickers?.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div className="field-label">点击选用一张贴纸：</div>
                          <div className="sticker-grid" style={{ maxHeight: 160 }}>
                            {quizLoadedPack.stickers.map((st) => (
                              <button
                                key={st.fileId}
                                type="button"
                                className={`sticker-cell ${quizSelectedSticker?.fileId === st.fileId ? 'selected' : ''}`}
                                onClick={() => setQuizSelectedSticker(st)}
                              >
                                <TgStickerMedia
                                  fileId={st.thumbFileId || st.fileId}
                                  format={st.thumbFileId ? 'webp' : st.format}
                                  emoji={st.emoji}
                                  size={40}
                                  previewOnly
                                />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {quizSelectedSticker && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                          <TgStickerMedia
                            fileId={quizSelectedSticker.thumbFileId || quizSelectedSticker.fileId}
                            format={quizSelectedSticker.thumbFileId ? 'webp' : quizSelectedSticker.format}
                            emoji={quizSelectedSticker.emoji}
                            size={44}
                            previewOnly
                          />
                          <span className="pill green">已选中贴纸</span>
                        </div>
                      )}

                      <div className="field" style={{ marginBottom: 6 }}>
                        <input
                          className="input"
                          value={quizQuestion}
                          onChange={(e) => setQuizQuestion(e.target.value)}
                          placeholder="问题（如：上面这个画面在干嘛？）"
                        />
                      </div>
                      <div className="field" style={{ marginBottom: 6 }}>
                        <input
                          className="input"
                          value={quizAnswer}
                          onChange={(e) => setQuizAnswer(e.target.value)}
                          placeholder="正确答案（如：两条腿在晃）"
                        />
                      </div>
                      <div className="field" style={{ marginBottom: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                            3 个干扰项（逗号分隔）
                          </span>
                          <button
                            type="button"
                            className="pill rose"
                            style={{ cursor: 'pointer', fontSize: 10, padding: '2px 7px' }}
                            onClick={() => setQuizWrongText('在开挖掘机, 在写微积分, 在修宇宙飞船')}
                          >
                            🎲 填离谱干扰项
                          </button>
                        </div>
                        <input
                          className="input"
                          value={quizWrongText}
                          onChange={(e) => setQuizWrongText(e.target.value)}
                          placeholder="例如：在开挖掘机, 在写微积分, 在修宇宙飞船"
                        />
                      </div>

                      <button
                        type="button"
                        className="btn btn-primary btn-block"
                        onClick={handleAddStickerQuiz}
                      >
                        加入题库
                      </button>
                    </div>
                  )}

                  {(draft.pmBot.stickerChallenges || []).map((item, idx) => (
                    <div
                      key={item.id || idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        background: 'var(--bg-elevated)',
                        borderRadius: 13,
                        padding: 8,
                        marginBottom: 6,
                      }}
                    >
                      <TgStickerMedia
                        fileId={item.thumbFileId || item.fileId}
                        format={item.thumbFileId ? 'webp' : item.format}
                        emoji={item.emoji || '🎭'}
                        size={42}
                        previewOnly
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.question}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 2 }}>
                          ✅ {item.answer}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          干扰项：{(item.wrong || []).join(' / ')}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="icon-btn"
                        title="删除该题"
                        onClick={() =>
                          updateField(
                            'pmBot',
                            'stickerChallenges',
                            (draft.pmBot.stickerChallenges || []).filter((_, i) => i !== idx)
                          )
                        }
                      >
                        <Trash2 size={14} color="var(--red)" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {draft.pmBot.verificationMode === 'turnstile' && (
                <div
                  style={{
                    fontSize: 12,
                    padding: '8px 10px',
                    borderRadius: 12,
                    marginBottom: 10,
                    background: draft.pmBot.turnstileReady ? 'var(--green-soft)' : 'var(--amber-soft)',
                    color: draft.pmBot.turnstileReady ? 'var(--green)' : 'var(--amber)',
                  }}
                >
                  {draft.pmBot.turnstileReady
                    ? '✅ 已检测到 Cloudflare Turnstile 密钥，严格模式就绪！'
                    : '⚠️ 尚未配置 TURNSTILE_SITE_KEY / TURNSTILE_SECRET，未配置前将自动回退至 Emoji 点选。'}
                </div>
              )}

              {draft.pmBot.verificationMode !== 'off' && draft.pmBot.verificationMode !== 'turnstile' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label className="field-label">最多容错次数</label>
                    <input
                      className="input"
                      type="number"
                      min="1"
                      max="5"
                      value={draft.pmBot.maxVerifyFailures ?? 2}
                      onChange={(e) => updateField('pmBot', 'maxVerifyFailures', Number(e.target.value))}
                    />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label className="field-label">失败冷却（分钟）</label>
                    <input
                      className="input"
                      type="number"
                      min="1"
                      max="1440"
                      value={draft.pmBot.cooldownMinutes ?? 10}
                      onChange={(e) => updateField('pmBot', 'cooldownMinutes', Number(e.target.value))}
                    />
                  </div>
                </div>
              )}

              {/* 4-Layer Anti-Spam Shield Toggles */}
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                <div className="field-label" style={{ marginBottom: 6 }}>🛡️ 四层智能反广告护盾</div>

                <div className="list-row">
                  <div className="row-main">
                    <div className="row-title" style={{ fontSize: 13 }}>CAS 全球反垃圾黑名单联防</div>
                    <div className="row-desc wrap">陌生人首次联系查 api.cas.chat（KV 缓存），命中已知协议号直接静默拦截</div>
                  </div>
                  <button
                    type="button"
                    className={`switch ${draft.pmBot.enableCasCheck !== false ? 'on' : ''}`}
                    onClick={() => updateField('pmBot', 'enableCasCheck', draft.pmBot.enableCasCheck === false)}
                  >
                    <span className="switch-knob" />
                  </button>
                </div>

                <div className="list-row">
                  <div className="row-main">
                    <div className="row-title" style={{ fontSize: 13 }}>拦截未验证首条图片 / 广告海报</div>
                    <div className="row-desc wrap">防 USDT/赌场/机场纯图广告：未验证发图不转发，必须先过验证再发图</div>
                  </div>
                  <button
                    type="button"
                    className={`switch ${draft.pmBot.blockUnverifiedMedia !== false ? 'on' : ''}`}
                    onClick={() =>
                      updateField('pmBot', 'blockUnverifiedMedia', draft.pmBot.blockUnverifiedMedia === false)
                    }
                  >
                    <span className="switch-knob" />
                  </button>
                </div>

                <div className="list-row">
                  <div className="row-main">
                    <div className="row-title" style={{ fontSize: 13 }}>高危广告自动升级 CF Turnstile</div>
                    <div className="row-desc wrap">检测到转发、外链、首条图片、零宽混淆或广告昵称自动拉高验证等级</div>
                  </div>
                  <button
                    type="button"
                    className={`switch ${draft.pmBot.smartEscalation !== false ? 'on' : ''}`}
                    onClick={() => updateField('pmBot', 'smartEscalation', draft.pmBot.smartEscalation === false)}
                  >
                    <span className="switch-knob" />
                  </button>
                </div>

                <div className="list-row">
                  <div className="row-main">
                    <div className="row-title" style={{ fontSize: 13 }}>蜜罐防盲点陷阱</div>
                    <div className="row-desc wrap">在验证题底部埋设诱饵按钮，无脑脚本误点直接静默拉黑</div>
                  </div>
                  <button
                    type="button"
                    className={`switch ${draft.pmBot.enableHoneypot !== false ? 'on' : ''}`}
                    onClick={() => updateField('pmBot', 'enableHoneypot', draft.pmBot.enableHoneypot === false)}
                  >
                    <span className="switch-knob" />
                  </button>
                </div>

                <div className="field" style={{ marginTop: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                    <label className="field-label" style={{ margin: 0 }}>
                      广告屏蔽关键词（自动去零宽/全角/同形字混淆）
                    </label>
                    <button
                      type="button"
                      className="pill rose"
                      style={{ cursor: 'pointer', fontSize: 11, padding: '3px 8px' }}
                      onClick={() => {
                        const preset = 'USDT, 跑分, 博彩, 赌场, 棋牌, 机场, 翻墙节点, 承兑, 兼职日结, 代收代付, 私聊领福利';
                        const cur = (draft.pmBot.blockedKeywords || '').trim();
                        updateField('pmBot', 'blockedKeywords', cur ? `${cur}, ${preset}` : preset);
                        onToast('已填入常见广告屏蔽词');
                      }}
                    >
                      + 填入常见词
                    </button>
                  </div>
                  <textarea
                    className="textarea"
                    value={draft.pmBot.blockedKeywords || ''}
                    onChange={(e) => updateField('pmBot', 'blockedKeywords', e.target.value)}
                    placeholder="逗号或换行分隔，例如：USDT, 赌场, 机场, 跑分"
                  />
                </div>
              </div>
            </div>

            <div className="field" style={{ marginTop: 10 }}>
              <label className="field-label">私聊 /start 欢迎语</label>
              <textarea
                className="textarea"
                value={draft.pmBot.welcomeText}
                onChange={(e) => updateField('pmBot', 'welcomeText', e.target.value)}
              />
            </div>
          </div>
        )}

        <button className="btn btn-primary btn-block" disabled={saving} onClick={handleSave}>
          <Check size={16} /> {saving ? '保存中…' : '保存全部设置'}
        </button>
      </div>
    </div>
  );
}
