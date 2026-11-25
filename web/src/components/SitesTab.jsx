import React, { useMemo, useState } from 'react';
import { Copy, ExternalLink, Plus } from 'lucide-react';
import { copyText, openExternalUrl } from '../lib/telegram.js';

export default function SitesTab({ sites = [], isAdmin, onOpenSettings, onToast }) {
  const [selectedCat, setSelectedCat] = useState('全部');

  const categories = useMemo(() => {
    const cats = new Set();
    sites.forEach((s) => {
      if (s.category) cats.add(s.category);
    });
    return ['全部', ...Array.from(cats)];
  }, [sites]);

  const filtered = useMemo(() => {
    if (selectedCat === '全部') return sites;
    return sites.filter((s) => s.category === selectedCat);
  }, [sites, selectedCat]);

  const hostnameOf = (url) => {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div className="chip-row" style={{ marginBottom: 0, flex: 1 }}>
          {categories.map((cat) => (
            <button
              key={cat}
              className={`chip ${selectedCat === cat ? 'active' : ''}`}
              onClick={() => setSelectedCat(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
        {isAdmin && (
          <button
            className="btn btn-soft btn-sm"
            style={{ marginLeft: 8, flexShrink: 0 }}
            onClick={() => onOpenSettings('sites')}
          >
            <Plus size={14} /> 管理
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="card empty-state">
          <div style={{ fontSize: 28, marginBottom: 8 }}>🌐</div>
          <div>还没有添加个人小站</div>
          {isAdmin && (
            <button
              className="btn btn-primary btn-sm"
              style={{ marginTop: 12 }}
              onClick={() => onOpenSettings('sites')}
            >
              立即添加小站
            </button>
          )}
        </div>
      ) : (
        <div className="card">
          {filtered.map((site) => (
            <div className="list-row" key={site.id || site.url}>
              <div className="row-icon-box">{site.icon || '🌐'}</div>
              <div
                className="row-main"
                style={{ cursor: 'pointer' }}
                onClick={() => openExternalUrl(site.url)}
              >
                <div className="row-title">
                  <span>{site.name}</span>
                  {site.badge && <span className="pill rose">{site.badge}</span>}
                </div>
                <div className="row-desc">{site.description || hostnameOf(site.url)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {hostnameOf(site.url)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button
                  className="icon-btn"
                  title="复制链接"
                  onClick={async () => {
                    const ok = await copyText(site.url);
                    onToast(ok ? '已复制站点链接' : '复制失败');
                  }}
                >
                  <Copy size={14} />
                </button>
                <button
                  className="btn btn-soft btn-sm"
                  onClick={() => openExternalUrl(site.url)}
                >
                  访问 <ExternalLink size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
