import { useEffect, useState } from "react";
import { Link, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { brandStyle } from "@hashly/pro";
import { AlertsPage, CalculatorPage, LanguageSelect, LegalPage, MiningPage, OverviewPage, PlansPage, SecurityPage, SettingsPage, WalletPage } from "./pages";
import { createLock, enterDemo, exitDemo, lock, refreshMining, unlock, useHashly, useT } from "./store";

export function App() {
  const state = useHashly();
  const t = useT();
  const entitledBrand = state.access.can("whiteLabel") ? state.persisted.brand : null;
  useEffect(() => {
    if (!state.runtime.unlocked) return;
    let timer = window.setTimeout(() => lock(), state.persisted.autoLockMinutes * 60_000);
    const bump = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => lock(), state.persisted.autoLockMinutes * 60_000);
    };
    window.addEventListener("pointerdown", bump);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", bump);
    };
  }, [state.runtime.unlocked, state.persisted.autoLockMinutes]);
  const automate = state.runtime.unlocked && state.access.can("automation");
  useEffect(() => {
    if (!automate) return;
    const timer = window.setInterval(() => {
      void refreshMining();
    }, Math.max(5, state.persisted.automationMinutes) * 60_000);
    return () => window.clearInterval(timer);
  }, [automate, state.persisted.automationMinutes]);
  useEffect(() => {
    if (!entitledBrand) return;
    const style = brandStyle(entitledBrand);
    for (const [key, value] of Object.entries(style)) document.documentElement.style.setProperty(key, value);
  }, [entitledBrand]);

  if (!state.runtime.ready) return null;
  if (!state.persisted.verifier && !state.runtime.demo) return <Welcome />;
  if (state.persisted.verifier && !state.runtime.unlocked && !state.runtime.demo) return <LockScreen />;
  const name = entitledBrand?.productName ?? "Hashly";
  return (
    <div className="app">
      <aside>
        <Link className="brand" to="/">
          <Mark />
          <span>{name.slice(0, Math.max(0, name.length - 2))}<b>{name.slice(-2)}</b></span>
        </Link>
        <nav>
          <NavLink to="/" end>{t.nav.overview}</NavLink>
          <NavLink to="/wallet">{t.nav.wallet}</NavLink>
          <NavLink to="/mining">{t.nav.mining}</NavLink>
          <NavLink to="/calculator">{t.nav.calculator}</NavLink>
          <NavLink to="/alerts">{t.nav.alerts}</NavLink>
          <NavLink to="/plans">{t.nav.plans}</NavLink>
          <NavLink to="/settings">{t.nav.settings}</NavLink>
          <NavLink to="/security">{t.nav.security}</NavLink>
        </nav>
        <div className="side-foot">
          <span className="pill">{state.access.plan.toUpperCase()}</span>
          {state.runtime.unlocked ? <button className="ghost" onClick={lock}>{t.common.lock}</button> : null}
          {state.runtime.demo ? <button className="ghost" onClick={exitDemo}>{t.common.close}</button> : null}
        </div>
      </aside>
      <div className="main">
        {state.runtime.demo ? <div className="banner" data-testid="demo-banner">{t.overview.demoBanner}</div> : null}
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/wallet" element={<WalletPage />} />
          <Route path="/mining" element={<MiningPage />} />
          <Route path="/calculator" element={<CalculatorPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/plans" element={<PlansPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/security" element={<SecurityPage />} />
          <Route path="/legal/:doc" element={<LegalPage />} />
        </Routes>
        <footer>
          <span>{t.meta.published}</span>
          <span>{t.meta.risk}</span>
          <span className="row">
            <Link to="/legal/privacy">{t.nav.privacy}</Link>
            <Link to="/legal/terms">{t.nav.terms}</Link>
          </span>
        </footer>
      </div>
    </div>
  );
}

function Mark() {
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#ff7a1a" />
      <path d="M12 6 9 26M22 6l-3 20M6 13h21M5 20h21" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}

function Welcome() {
  const t = useT();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const { runtime, persisted } = useHashly();
  return (
    <main className="gate" data-testid="welcome">
      <div className="gate-copy">
        <Mark />
        <p className="eyebrow">{t.meta.published}</p>
        <h1>{t.meta.tagline}</h1>
        <p>{t.meta.subtitle}</p>
        <p className="risk">{t.meta.risk}</p>
      </div>
      <form
        className="card gate-card"
        onSubmit={async (event) => {
          event.preventDefault();
          if (password.length < 10) return setError(t.welcome.short);
          if (password !== confirm) return setError(t.welcome.mismatch);
          setError("");
          await createLock(password);
          navigate("/");
        }}
      >
        <h2>{t.welcome.title}</h2>
        <p>{t.welcome.body}</p>
        <label>{t.welcome.passphrase}<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" /></label>
        <label>{t.welcome.confirm}<input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" /></label>
        <p className="hint">{t.welcome.passphraseHint}</p>
        {error ? <p className="bad">{error}</p> : null}
        <button className="primary" type="submit" disabled={runtime.busy}>{runtime.busy ? t.lock.wait : t.welcome.create}</button>
        <button
          className="ghost"
          type="button"
          data-testid="enter-demo"
          onClick={async () => {
            await enterDemo();
            navigate("/");
          }}
        >
          {t.welcome.demo}
        </button>
        <p className="hint">{t.welcome.demoNote}</p>
        <LanguageSelect locale={persisted.locale} />
      </form>
    </main>
  );
}

function LockScreen() {
  const t = useT();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { runtime, persisted } = useHashly();
  return (
    <main className="gate" data-testid="lock">
      <form
        className="card gate-card"
        onSubmit={async (event) => {
          event.preventDefault();
          try {
            await unlock(password);
            setError("");
          } catch {
            setError(t.lock.bad);
          }
        }}
      >
        <Mark />
        <h1>{t.lock.title}</h1>
        <p>{t.lock.body}</p>
        <label>{t.welcome.passphrase}<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus /></label>
        {error ? <p className="bad">{error}</p> : null}
        <button className="primary" disabled={runtime.busy}>{runtime.busy ? t.lock.wait : t.common.unlock}</button>
        <button className="ghost" type="button" data-testid="enter-demo" onClick={() => enterDemo()}>{t.welcome.demo}</button>
        <LanguageSelect locale={persisted.locale} />
      </form>
    </main>
  );
}
