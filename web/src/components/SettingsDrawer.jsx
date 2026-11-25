import React, { useState } from 'react';
import { Check, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { apiRequest } from '../lib/api.js';

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

  const updateField = (group, key, value) => {
    setDraft((prev) => ({
      ...prev,
      [group]: { ...prev[group], [key]: value },
    }));
  };

  const handleAddSite = () => {
    setDraft((prev) => ({
      ...prev,
      sites: [
        ...(prev.sites || []),
        {
          id: `site-${Date.now()}`,
          name: '新站点',
          url: 'https://',
          description: '',
          category: '工具',
          icon: '✨',
          badge: '',
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
            { id: 'profile', label: '名片信息' },
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

        {/* Section 1: Profile */}
        {section === 'profile' && (
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
        )}

        {/* Section 2: Sites */}
        {section === 'sites' && (
          <div>
            {(draft.sites || []).map((site, idx) => (
              <div className="card" key={site.id || idx}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input
                    className="input"
                    style={{ width: 58, textAlign: 'center' }}
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
                  <button className="icon-btn" onClick={() => handleRemoveSite(idx)}>
                    <Trash2 size={15} color="var(--red)" />
                  </button>
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
                    placeholder="分类（如 博客 / 工具）"
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
            ))}
            <button className="btn btn-soft btn-block" style={{ marginBottom: 12 }} onClick={handleAddSite}>
              <Plus size={16} /> 新增个人小站
            </button>
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
                <div className="row-desc">便于在未接入探针前预览节点卡片效果</div>
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

            <div className="list-row" style={{ marginTop: 8 }}>
              <div className="row-main">
                <div className="row-title" style={{ fontSize: 14 }}>私聊防骚扰人机验证</div>
                <div className="row-desc">陌生人首次私聊需通过 0 延迟常识题库验证</div>
              </div>
              <button
                type="button"
                className={`switch ${draft.pmBot.enableVerification ? 'on' : ''}`}
                onClick={() => updateField('pmBot', 'enableVerification', !draft.pmBot.enableVerification)}
              >
                <span className="switch-knob" />
              </button>
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
