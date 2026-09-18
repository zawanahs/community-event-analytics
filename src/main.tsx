import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import { communityConfig as config } from './config';
import { formatDataContractError, loadData, onFilterChange } from './data';
import { buildFilterBar } from './components';
import { initEffectiveness } from './dash-effectiveness';
import { initCommunity } from './dash-community';
import type { DashboardController, DashboardData } from './types';

type DashboardTab = 'effectiveness' | 'community';

function BrandLogo() {
  const initials = config.community.shortName.slice(0, 4).toUpperCase();
  return (
    <div className="brand" aria-label={config.community.name}>
      <span className="brand-mark" aria-hidden="true">{initials}</span>
      <span className="brand-copy">
        <strong>{config.community.name}</strong>
        {config.community.locationLabel && <small>{config.community.locationLabel}</small>}
      </span>
    </div>
  );
}

function App() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DashboardTab>('effectiveness');
  const filterBarRef = useRef<HTMLDivElement>(null);
  const effectivenessRef = useRef<HTMLElement>(null);
  const communityRef = useRef<HTMLElement>(null);
  const controllersRef = useRef<Partial<Record<DashboardTab, DashboardController>>>({});

  useEffect(() => {
    document.title = `${config.community.name} · ${config.community.dashboardTitle}`;
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--surface', config.branding.surface);
    rootStyle.setProperty('--card', config.branding.card);
    rootStyle.setProperty('--ink', config.branding.ink);
    rootStyle.setProperty('--brand-primary', config.branding.primary);
    rootStyle.setProperty('--brand-secondary', config.branding.secondary);
    rootStyle.setProperty('--brand-accent', config.branding.accent);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadData()
      .then((loaded) => {
        if (!cancelled) setData(loaded);
      })
      .catch((reason: unknown) => {
        console.error(reason);
        if (!cancelled) setError(formatDataContractError(reason));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!data || !filterBarRef.current || !effectivenessRef.current || !communityRef.current) return;

    buildFilterBar(filterBarRef.current, data);
    const effectiveness: DashboardController = initEffectiveness(effectivenessRef.current, data);
    const community: DashboardController = initCommunity(communityRef.current, data);
    controllersRef.current = { effectiveness, community };
    effectiveness.update();
    community.update();

    const unsubscribe = onFilterChange(() => {
      effectiveness.update();
      community.update();
    });
    const resize = () => {
      effectiveness.resize();
      community.resize();
    };
    window.addEventListener('resize', resize);

    return () => {
      unsubscribe();
      window.removeEventListener('resize', resize);
      effectiveness.dispose?.();
      community.dispose?.();
      controllersRef.current = {};
    };
  }, [data]);

  useEffect(() => {
    requestAnimationFrame(() => controllersRef.current[activeTab]?.resize());
  }, [activeTab]);

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <BrandLogo />
          <div className="topbar-title">
            <h1>{config.community.dashboardTitle}</h1>
            <p className="subtitle">{config.community.subtitle}</p>
          </div>
          <nav className="tabs" role="tablist" aria-label="Dashboard views">
            <button
              className={`tab${activeTab === 'effectiveness' ? ' active' : ''}`}
              type="button"
              role="tab"
              aria-selected={activeTab === 'effectiveness'}
              aria-controls="dash-eff"
              onClick={() => setActiveTab('effectiveness')}
            >
              {config.navigation.effectiveness}
            </button>
            <button
              className={`tab${activeTab === 'community' ? ' active' : ''}`}
              type="button"
              role="tab"
              aria-selected={activeTab === 'community'}
              aria-controls="dash-comm"
              onClick={() => setActiveTab('community')}
            >
              {config.navigation.community}
            </button>
          </nav>
        </div>
      </header>

      <div ref={filterBarRef} className="filterbar" />

      <main>
        {!data && (
          <div className={`status${error ? ' error' : ''}`} role="status">
            {error
              ? error
              : `Loading live data from ${config.data.sourceLabel}…`}
          </div>
        )}
        <section
          ref={effectivenessRef}
          id="dash-eff"
          className={`dashboard-panel${activeTab !== 'effectiveness' ? ' inactive' : ''}`}
          role="tabpanel"
          hidden={!data}
        />
        <section
          ref={communityRef}
          id="dash-comm"
          className={`dashboard-panel${activeTab !== 'community' ? ' inactive' : ''}`}
          role="tabpanel"
          hidden={!data}
        />
      </main>

      <footer className="footer">
        <span>{data ? `Data fetched from ${data.source.sourceLabel} at ${data.source.fetchedAt.toLocaleString()}` : ''}</span>
        <span>{config.community.footer}</span>
      </footer>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
