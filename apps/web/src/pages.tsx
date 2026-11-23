import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import QRCode from "qrcode";
import { CONNECTORS, formatHashrate } from "@hashly/connectors";
import { format, type Locale } from "@hashly/i18n";
import { PRICES_PLN } from "@hashly/license";
import { estimateProfit, recommend, type Currency } from "@hashly/market";
import { miningCsv, parseBrand } from "@hashly/pro";
import {
  addressesFromAccountXpub,
  assertMnemonic,
  btcToSats,
  checkQuiz,
  createMnemonic,
  pickQuizPositions,
  signWalletMessage,
  signWalletTransfer,
  type WalletRecord,
} from "@hashly/wallet";
import { broadcastTx, fetchUtxos } from "./api";
import {
  access,
  addConnection,
  refreshMarket,
  refreshMining,
  removeAlert,
  removeConnection,
  reportedHashrateThs,
  saveAlert,
  saveWallet,
  updateSettings,
  useHashly,
  useT,
  withWallet,
} from "./store";

const TAG: Record<Locale, string> = { pl: "pl-PL", en: "en-GB", de: "de-DE", es: "es-ES", ru: "ru-RU" };

function money(amount: number, currency: Currency, locale: Locale): string {
  return new Intl.NumberFormat(TAG[locale], { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

function errText(code: string, t: ReturnType<typeof useT>): string {
  return (t.errors as Record<string, string>)[code] ?? t.errors.generic;
}

export function OverviewPage() {
  const t = useT();
  const { persisted, runtime, access: gate } = useHashly();
  const hashrate = runtime.snapshots.reduce((sum, item) => sum + item.hashrateHs, 0);
  const unpaid = runtime.snapshots.reduce((sum, item) => sum + (item.unpaidBtc ?? 0), 0);
  const workers = runtime.snapshots.flatMap((item) => item.workers);
  const offline = workers.filter((worker) => worker.status === "offline").length;
  const estimate = hashrate
    ? estimateProfit({
        hashrateThs: hashrate / 1e12,
        watts: 3000,
        electricityPerKwh: persisted.currency === "PLN" ? 0.85 : 0.12,
        currency: persisted.currency,
        poolFeePct: 2,
        market: runtime.market,
      })
    : null;
  return (
    <section data-testid="overview">
      <header className="page-head">
        <div>
          <h1>{t.overview.title}</h1>
          <p>{t.meta.subtitle}</p>
        </div>
        <span className="pill">{gate.trial.active ? format(t.overview.trial, { n: gate.trial.daysLeft }) : gate.plan}</span>
      </header>
      <div className="stats">
        <article className="card">
          <span>{t.overview.wallet}</span>
          <strong>{runtime.view?.btcAddress ? `${runtime.view.btcAddress.slice(0, 10)}…` : t.overview.noWallet}</strong>
          <Link to="/wallet">{runtime.view ? t.wallet.receive : t.overview.create}</Link>
        </article>
        <article className="card">
          <span>{t.overview.hashrate}</span>
          <strong>{formatHashrate(hashrate)}</strong>
          <Link to="/mining">{t.common.refresh}</Link>
        </article>
        <article className="card">
          <span>{t.overview.workers}</span>
          <strong>{workers.length}</strong>
          <em className={offline ? "bad" : "good"}>{offline ? `${offline} ${t.common.offline}` : t.common.online}</em>
        </article>
        <article className="card">
          <span>{t.overview.unpaid}</span>
          <strong>{unpaid.toFixed(8)} BTC</strong>
          <em>{t.overview.unpaidNote}</em>
        </article>
      </div>
      {estimate ? (
        <article className="card estimate">
          <span>{t.overview.net}</span>
          <strong className={estimate.profitable ? "good" : "bad"}>{money(estimate.netPerDay, persisted.currency, persisted.locale)}</strong>
          <p className="hint">{persisted.currency === "PLN" ? "3 kW · 0.85 PLN/kWh · 2% fee" : "3 kW · 0.12 / kWh · 2% fee"}</p>
          <p>{t.meta.risk}</p>
        </article>
      ) : null}
    </section>
  );
}

export function WalletPage() {
  const t = useT();
  const { persisted, runtime } = useHashly();
  const [mode, setMode] = useState<"home" | "create" | "restore" | "watch" | "seed">("home");
  const [mnemonic, setMnemonic] = useState("");
  const [quiz, setQuiz] = useState<number[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [error, setError] = useState("");
  const [show, setShow] = useState(false);
  const [qr, setQr] = useState("");
  const [signed, setSigned] = useState("");
  const [txid, setTxid] = useState("");
  const [message, setMessage] = useState("Hashly");
  const [signature, setSignature] = useState("");
  const view = runtime.view;

  useEffect(() => {
    if (!view?.btcAddress) return;
    QRCode.toDataURL(view.btcAddress, { margin: 1, color: { dark: "#121214", light: "#ffffff" } }).then(setQr).catch(() => setQr(""));
  }, [view?.btcAddress]);

  function commit(record: WalletRecord) {
    try {
      saveWallet(record);
      setMode("home");
      setError("");
      setMnemonic("");
    } catch (reason) {
      setError(errText(reason instanceof Error ? reason.message : "generic", t));
    }
  }

  return (
    <section data-testid="wallet">
      <header className="page-head">
        <div>
          <h1>{t.wallet.title}</h1>
          <p>{t.wallet.intro}</p>
        </div>
      </header>
      {runtime.demo ? <p className="hint">{t.overview.demoBanner}</p> : null}
      {!view && !runtime.demo ? (
        <div className="row">
          <button className="primary" onClick={() => { const words = createMnemonic(12); setMnemonic(words); setQuiz(pickQuizPositions(12, 3)); setAnswers({}); setShow(false); setMode("create"); }}>{t.wallet.create}</button>
          <button className="ghost" onClick={() => setMode("restore")}>{t.wallet.restore}</button>
          <button className="ghost" onClick={() => setMode("watch")}>{t.wallet.watch}</button>
        </div>
      ) : null}
      {mode === "create" ? (
        <article className="card">
          <p>{t.wallet.words}</p>
          <button className="ghost" type="button" onClick={() => setShow((value) => !value)}>{show ? t.wallet.hide : t.wallet.show}</button>
          <ol className={show ? "words" : "words blur"}>{mnemonic.split(" ").map((word, index) => <li key={`${word}-${index}`}>{word}</li>)}</ol>
          <p>{t.wallet.quiz}</p>
          {quiz.map((index) => (
            <label key={index}>{format(t.wallet.wordN, { n: index + 1 })}
              <input value={answers[index] ?? ""} onChange={(event) => setAnswers({ ...answers, [index]: event.target.value })} />
            </label>
          ))}
          {error ? <p className="bad">{error}</p> : null}
          <button
            className="primary"
            onClick={() => {
              if (!checkQuiz(mnemonic, answers)) return setError(t.wallet.quizBad);
              commit({ v: 1, kind: "seed", mnemonic, network: persisted.btcNetwork, createdAt: new Date().toISOString() });
            }}
          >{t.common.save}</button>
        </article>
      ) : null}
      {mode === "restore" ? (
        <article className="card">
          <label>{t.wallet.restore}<textarea value={mnemonic} onChange={(event) => setMnemonic(event.target.value)} rows={4} /></label>
          {error ? <p className="bad">{error}</p> : null}
          <button className="primary" onClick={() => {
            try {
              commit({ v: 1, kind: "seed", mnemonic: assertMnemonic(mnemonic), network: persisted.btcNetwork, createdAt: new Date().toISOString() });
            } catch (reason) {
              setError(errText(reason instanceof Error ? reason.message : "bad-mnemonic", t));
            }
          }}>{t.common.save}</button>
        </article>
      ) : null}
      {mode === "watch" ? (
        <WatchForm onSave={(addresses, network) => commit({ v: 1, kind: "watch", network, watchAddresses: addresses, createdAt: new Date().toISOString() })} />
      ) : null}
      {view ? (
        <div className="split">
          <article className="card" data-testid="receive">
            <h2>{t.wallet.receive}</h2>
            <p className="hint">{view.watchOnly ? t.wallet.watchSaved : view.btcPath}</p>
            <strong className="addr">{view.btcAddress}</strong>
            {qr ? <img className="qr" alt="" src={qr} /> : null}
            <p>{t.wallet.eth}: {view.ethAddress ?? "—"}</p>
            <p className="hint">{t.wallet.ethNote}</p>
            <p className="hint">{t.wallet.network}: {view.network === "mainnet" ? t.wallet.mainnet : t.wallet.testnet}</p>
            {!view.watchOnly ? <button className="ghost" onClick={() => { setMnemonic(withWallet((record) => record.mnemonic ?? "")); setMode("seed"); }}>{t.wallet.seedAgain}</button> : null}
            {persisted.wallet ? <button className="ghost" onClick={() => download("hashly-vault.json", JSON.stringify(persisted.wallet, null, 2))}>{t.wallet.backup}</button> : null}
          </article>
          {!view.watchOnly && !runtime.demo ? <SendForm address={view.btcAddress ?? ""} network={view.network} onSigned={setSigned} onTx={setTxid} signed={signed} txid={txid} /> : null}
          {!view.watchOnly && !runtime.demo ? (
            <article className="card">
              <h2>{t.wallet.message}</h2>
              <label>{t.wallet.signMsg}<input value={message} onChange={(event) => setMessage(event.target.value)} /></label>
              <button className="primary" onClick={() => setSignature(withWallet((record) => signWalletMessage(record, message).signature))}>{t.wallet.message}</button>
              {signature ? <p className="addr">{signature}</p> : null}
            </article>
          ) : null}
        </div>
      ) : null}
      {mode === "seed" ? (
        <article className="card">
          <p>{t.wallet.words}</p>
          <ol className="words">{mnemonic.split(" ").map((word, index) => <li key={`${word}-${index}`}>{word}</li>)}</ol>
          <button className="ghost" onClick={() => { setMnemonic(""); setMode("home"); }}>{t.common.close}</button>
        </article>
      ) : null}
    </section>
  );
}

function WatchForm({ onSave }: { onSave: (addresses: string[], network: "testnet" | "mainnet") => void }) {
  const t = useT();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  return (
    <article className="card">
      <label>{t.wallet.watchLabel}<input value={value} onChange={(event) => setValue(event.target.value)} /></label>
      {error ? <p className="bad">{error}</p> : null}
      <button className="primary" onClick={() => {
        const trimmed = value.trim();
        if (trimmed.startsWith("bc1") || trimmed.startsWith("tb1")) {
          onSave([trimmed], trimmed.startsWith("bc1") ? "mainnet" : "testnet");
          return;
        }
        try {
          const parsed = addressesFromAccountXpub(trimmed, 3);
          onSave(parsed.addresses.map((item) => item.address), parsed.network);
        } catch {
          setError(t.errors["bad-address"]);
        }
      }}>{t.common.save}</button>
    </article>
  );
}

function SendForm({ address, network, signed, txid, onSigned, onTx }: { address: string; network: "testnet" | "mainnet"; signed: string; txid: string; onSigned: (hex: string) => void; onTx: (id: string) => void }) {
  const t = useT();
  const [to, setTo] = useState(address);
  const [amount, setAmount] = useState("0.0001");
  const [fee, setFee] = useState("2");
  const [utxo, setUtxo] = useState({ txid: "", vout: "0", valueSats: "" });
  const [error, setError] = useState("");
  return (
    <article className="card" data-testid="send">
      <h2>{t.wallet.send}</h2>
      {network === "mainnet" ? <p className="risk">{t.wallet.mainnetWarn}</p> : null}
      <label>{t.wallet.to}<input value={to} onChange={(event) => setTo(event.target.value)} /></label>
      <label>{t.wallet.amount}<input value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
      <label>{t.wallet.fee}<input value={fee} onChange={(event) => setFee(event.target.value)} /></label>
      <div className="row">
        <label>{t.wallet.utxo}<input value={utxo.txid} onChange={(event) => setUtxo({ ...utxo, txid: event.target.value })} /></label>
        <label>{t.wallet.vout}<input value={utxo.vout} onChange={(event) => setUtxo({ ...utxo, vout: event.target.value })} /></label>
        <label>{t.wallet.value}<input value={utxo.valueSats} onChange={(event) => setUtxo({ ...utxo, valueSats: event.target.value })} /></label>
      </div>
      {network === "testnet" ? (
        <button className="ghost" onClick={async () => {
          try {
            const rows = await fetchUtxos(address, "testnet");
            if (!rows[0]) return setError(t.wallet.noUtxo);
            setUtxo({ txid: rows[0].txid, vout: String(rows[0].vout), valueSats: String(rows[0].valueSats) });
            setError("");
          } catch {
            setError(t.wallet.noUtxo);
          }
        }}>{t.wallet.fetch}</button>
      ) : null}
      {error ? <p className="bad">{error}</p> : null}
      <button className="primary" onClick={() => {
        try {
          const hex = withWallet((record) => signWalletTransfer(record, {
            to,
            amountSats: btcToSats(amount),
            feeRateSatPerVb: Number(fee),
            utxos: [{ txid: utxo.txid, vout: Number(utxo.vout), valueSats: Number(utxo.valueSats) }],
          }).hex);
          onSigned(hex);
          setError("");
        } catch (reason) {
          setError(errText(reason instanceof Error ? reason.message : "generic", t));
        }
      }}>{t.wallet.sign}</button>
      {signed ? <p className="hint">{t.wallet.signed}</p> : null}
      {signed ? <p className="addr">{signed}</p> : null}
      {signed && network === "testnet" ? (
        <button className="ghost" onClick={async () => {
          if (!window.confirm(t.wallet.broadcastWarn)) return;
          try {
            onTx(await broadcastTx(signed, "testnet"));
          } catch {
            setError(t.errors.generic);
          }
        }}>{t.wallet.broadcast}</button>
      ) : null}
      {txid ? <p className="good">{t.wallet.broadcasted} {txid}</p> : null}
    </article>
  );
}

export function MiningPage() {
  const t = useT();
  const { persisted, runtime, access: gate } = useHashly();
  const [connectorId, setConnectorId] = useState<(typeof CONNECTORS)[number]["id"]>("nicehash");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const definition = CONNECTORS.find((item) => item.id === connectorId)!;
  return (
    <section data-testid="mining">
      <header className="page-head">
        <div>
          <h1>{t.mining.title}</h1>
          <p>{t.mining.intro}</p>
        </div>
        {!runtime.demo ? <button className="ghost" onClick={() => refreshMining()}>{t.mining.refresh}</button> : null}
      </header>
      <p className="hint">{format(t.mining.limit, { n: gate.limits.connectors })}</p>
      {!runtime.demo ? (
        <article className="card">
          <div className="row">
            {CONNECTORS.map((item) => (
              <button key={item.id} className={item.id === connectorId ? "primary" : "ghost"} onClick={() => { setConnectorId(item.id); setFields({}); }}>{item.name}</button>
            ))}
          </div>
          <p>{definition.description}</p>
          {definition.localNetwork ? <p className="hint">{t.mining.lanNote}</p> : null}
          <label>Label<input value={label} onChange={(event) => setLabel(event.target.value)} /></label>
          {definition.fields.map((field) => (
            <label key={field.key}>{field.label}
              <input type={field.secret ? "password" : "text"} placeholder={field.placeholder} value={fields[field.key] ?? ""} onChange={(event) => setFields({ ...fields, [field.key]: event.target.value })} />
            </label>
          ))}
          {error ? <p className="bad">{error}</p> : null}
          <button className="primary" onClick={async () => {
            try {
              await addConnection(connectorId as "nicehash" | "braiins" | "cgminer", label || definition.name, fields);
              setFields({});
              setError("");
            } catch (reason) {
              setError(errText(reason instanceof Error ? reason.message : "generic", t));
            }
          }}>{t.mining.connect}</button>
        </article>
      ) : null}
      <div className="stack">
        {runtime.snapshots.length === 0 ? <p>{t.mining.empty}</p> : null}
        {runtime.snapshots.map((snapshot) => (
          <article className="card" key={`${snapshot.connectorId}-${snapshot.label}`}>
            <header className="spread">
              <h2>{snapshot.label}</h2>
              <span className="pill">{snapshot.demo ? t.common.demo : snapshot.connectorId}</span>
            </header>
            <strong>{formatHashrate(snapshot.hashrateHs)}</strong>
            <p>{t.mining.unpaid}: {snapshot.unpaidBtc != null ? `${snapshot.unpaidBtc.toFixed(8)} BTC` : "—"}</p>
            <table>
              <thead><tr><th>{t.mining.workers}</th><th>{t.common.online}</th><th>{t.mining.hashrate}</th></tr></thead>
              <tbody>
                {snapshot.workers.map((worker) => (
                  <tr key={worker.id}>
                    <td>{worker.name}</td>
                    <td>{t.common[worker.status]}</td>
                    <td>{formatHashrate(worker.hashrateHs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {snapshot.notes.map((note) => <p className="hint" key={note}>{note === "upstream" ? t.mining.error : note}</p>)}
            {!snapshot.demo ? <button className="ghost" onClick={() => {
              const connection = persisted.connections.find((item) => item.label === snapshot.label);
              if (connection) removeConnection(connection.id);
            }}>{t.mining.remove}</button> : null}
          </article>
        ))}
      </div>
    </section>
  );
}

export function CalculatorPage() {
  const t = useT();
  const { persisted, runtime } = useHashly();
  const [hashrate, setHashrate] = useState("100");
  const [watts, setWatts] = useState("3200");
  const [power, setPower] = useState(persisted.currency === "PLN" ? "0.85" : "0.12");
  const [fee, setFee] = useState("2");
  const [uptime, setUptime] = useState("98");
  const input = {
    hashrateThs: Number(hashrate) || 0,
    watts: Number(watts) || 0,
    electricityPerKwh: Number(power) || 0,
    currency: persisted.currency,
    poolFeePct: Number(fee) || 0,
    uptimePct: Number(uptime) || 0,
    market: runtime.market,
  };
  let estimate = null as ReturnType<typeof estimateProfit> | null;
  let ranking = null as ReturnType<typeof recommend> | null;
  let error = "";
  try {
    estimate = estimateProfit(input);
    ranking = recommend(input);
  } catch {
    error = t.errors.generic;
  }
  return (
    <section data-testid="calculator">
      <header className="page-head"><div><h1>{t.calc.title}</h1><p>{t.calc.intro}</p></div></header>
      <div className="split">
        <article className="card">
          <label>{t.calc.hashrate}<input value={hashrate} onChange={(event) => setHashrate(event.target.value)} /></label>
          <label>{t.calc.watts}<input value={watts} onChange={(event) => setWatts(event.target.value)} /></label>
          <label>{t.calc.power} ({persisted.currency})<input value={power} onChange={(event) => setPower(event.target.value)} /></label>
          <label>{t.calc.fee}<input value={fee} onChange={(event) => setFee(event.target.value)} /></label>
          <label>{t.calc.uptime}<input value={uptime} onChange={(event) => setUptime(event.target.value)} /></label>
          <button className="ghost" onClick={() => setHashrate(String(Math.max(0, Math.round(reportedHashrateThs() * 100) / 100)))}>{t.calc.useReported}</button>
          <button className="ghost" onClick={() => refreshMarket()}>{t.common.refresh}</button>
          <p className="hint">{runtime.market.live ? t.calc.live : t.calc.offline}</p>
          <p className="hint">{format(t.calc.reward, { n: runtime.market.blockRewardBtc })}</p>
        </article>
        {estimate && ranking ? (
          <article className="card" data-testid="calc-result">
            <p>{t.calc.btcDay}</p>
            <strong>{estimate.btcPerDay.toFixed(8)} BTC</strong>
            <p>{t.calc.revenue}: {money(estimate.revenuePerDay, persisted.currency, persisted.locale)}</p>
            <p>{t.calc.powerCost}: {money(estimate.powerPerDay, persisted.currency, persisted.locale)}</p>
            <p>{t.calc.net}: <b className={estimate.profitable ? "good" : "bad"}>{money(estimate.netPerDay, persisted.currency, persisted.locale)}</b></p>
            <p>{t.calc.month}: {money(estimate.netPerMonth, persisted.currency, persisted.locale)}</p>
            <p>{t.calc.hashprice}: {money(estimate.hashpricePerThDay, persisted.currency, persisted.locale)}</p>
            <p>{t.calc.breakEven}: {money(estimate.breakEvenElectricity, persisted.currency, persisted.locale)} / kWh</p>
            <p className={estimate.profitable ? "good" : "bad"}>{estimate.profitable ? t.calc.positive : t.calc.negative}</p>
            <h2>{t.calc.rank}</h2>
            {ranking.allNegative ? <p>{t.calc.none}</p> : <p>{t.calc.best}: {ranking.ranked[0]?.name}</p>}
            <ul>{ranking.ranked.map((venue) => <li key={venue.id}>{venue.name} · {venue.feePct}% · {money(venue.netPerDay, persisted.currency, persisted.locale)}<br /><span className="hint">{venue.note}</span></li>)}</ul>
            <p className="risk">{ranking.disclaimer}</p>
          </article>
        ) : <p className="bad">{error}</p>}
      </div>
    </section>
  );
}

export function AlertsPage() {
  const t = useT();
  const { persisted, access: gate } = useHashly();
  const [type, setType] = useState<"workerOffline" | "hashrateDrop" | "profitBelow">("workerOffline");
  const [channel, setChannel] = useState<"desktop" | "webhook" | "telegram">("desktop");
  const [threshold, setThreshold] = useState("20");
  const [secret, setSecret] = useState({ token: "", chatId: "", url: "" });
  const [error, setError] = useState("");
  const channels = gate.limits.channels;
  return (
    <section data-testid="alerts">
      <header className="page-head"><div><h1>{t.alerts.title}</h1><p>{t.alerts.intro}</p></div></header>
      <article className="card">
        <label>{t.alerts.type}
          <select value={type} onChange={(event) => setType(event.target.value as typeof type)}>
            <option value="workerOffline">{t.alerts.workerOffline}</option>
            <option value="hashrateDrop">{t.alerts.hashrateDrop}</option>
            <option value="profitBelow">{t.alerts.profitBelow}</option>
          </select>
        </label>
        <label>{t.alerts.channel}
          <select value={channel} onChange={(event) => setChannel(event.target.value as typeof channel)}>
            {channels.map((item) => <option key={item} value={item}>{t.alerts[item]}</option>)}
          </select>
        </label>
        {type !== "workerOffline" ? <label>{t.alerts.threshold}<input value={threshold} onChange={(event) => setThreshold(event.target.value)} /></label> : null}
        {channel === "telegram" ? (
          <>
            <label>{t.alerts.token}<input type="password" value={secret.token} onChange={(event) => setSecret({ ...secret, token: event.target.value })} /></label>
            <label>{t.alerts.chat}<input value={secret.chatId} onChange={(event) => setSecret({ ...secret, chatId: event.target.value })} /></label>
          </>
        ) : null}
        {channel === "webhook" ? <label>{t.alerts.url}<input value={secret.url} onChange={(event) => setSecret({ ...secret, url: event.target.value })} /></label> : null}
        {!gate.can("advancedAlerts") && channel !== "desktop" ? <p className="hint">{t.alerts.locked}</p> : null}
        {error ? <p className="bad">{error}</p> : null}
        <button className="primary" onClick={() => {
          try {
            saveAlert({
              id: crypto.randomUUID(),
              type,
              channel,
              threshold: Number(threshold),
              enabled: true,
            }, channel === "desktop" ? undefined : secret);
            setError("");
          } catch (reason) {
            setError(errText(reason instanceof Error ? reason.message : "plan-required", t));
          }
        }}>{t.alerts.add}</button>
      </article>
      {persisted.alerts.length === 0 ? <p>{t.alerts.empty}</p> : null}
      <ul>{persisted.alerts.map((rule) => (
        <li key={rule.id} className="card spread">
          <span>{t.alerts[rule.type]} · {t.alerts[rule.channel]}</span>
          <button className="ghost" onClick={() => removeAlert(rule.id)}>{t.common.remove}</button>
        </li>
      ))}</ul>
    </section>
  );
}

export function PlansPage() {
  const t = useT();
  const { access: gate, persisted } = useHashly();
  const [token, setToken] = useState(persisted.licenseToken);
  const [notice, setNotice] = useState("");
  const checkout = import.meta.env.VITE_HASHLY_CHECKOUT_URL as string | undefined;
  return (
    <section data-testid="plans">
      <header className="page-head"><div><h1>{t.plans.title}</h1><p>{t.plans.intro}</p></div></header>
      <p>{t.plans.current}: <strong>{gate.plan}</strong> {gate.trial.active ? format(t.plans.days, { n: gate.trial.daysLeft }) : gate.trial.endsAt && !gate.trial.active && gate.plan === "free" ? t.plans.expired : ""}</p>
      {gate.devTrustAnchor ? <p className="hint">{t.overview.devKey}</p> : null}
      <div className="plans">
        <article className="card"><h2>{t.plans.freeTitle}</h2><p>{t.plans.freeBody}</p><strong>0</strong></article>
        <article className="card"><h2>{t.plans.trialTitle}</h2><p>{t.plans.trialBody}</p></article>
        <article className="card featured"><h2>{t.plans.proTitle}</h2><p>{t.plans.proBody}</p><strong>{t.plans.proPrice}</strong></article>
        <article className="card"><h2>{t.plans.teamTitle}</h2><p>{t.plans.teamBody}</p><strong>{t.plans.teamPrice}</strong></article>
        <article className="card"><h2>{t.plans.whiteTitle}</h2><p>{t.plans.whiteBody}</p><strong>{t.plans.whitePrice}</strong></article>
      </div>
      <p className="hint">Pro {PRICES_PLN.pro} PLN · Team {PRICES_PLN.team} PLN</p>
      {checkout ? <a className="primary linkish" href={`${checkout}?plan=pro`}>{t.plans.checkout}</a> : <p className="hint">{t.plans.noCheckout}</p>}
      <article className="card">
        <label>{t.plans.paste}<textarea value={token} onChange={(event) => setToken(event.target.value)} rows={4} /></label>
        <button className="primary" onClick={() => {
          updateSettings({ licenseToken: token.trim() });
          const next = access();
          setNotice(next.license.state === "valid" ? t.plans.valid : t.plans.invalid);
        }}>{t.plans.apply}</button>
        {notice ? <p>{notice}</p> : null}
      </article>
    </section>
  );
}

export function SettingsPage() {
  const t = useT();
  const { persisted, runtime, access: gate } = useHashly();
  const [brand, setBrand] = useState({ productName: persisted.brand?.productName ?? "", accent: persisted.brand?.accent ?? "#ff7a1a", graphite: persisted.brand?.graphite ?? "#121214", supportUrl: persisted.brand?.supportUrl ?? "" });
  const [error, setError] = useState("");
  return (
    <section data-testid="settings">
      <header className="page-head"><div><h1>{t.settings.title}</h1></div></header>
      <article className="card">
        <LanguageSelect locale={persisted.locale} />
        <label>{t.common.currency}
          <select value={persisted.currency} onChange={(event) => updateSettings({ currency: event.target.value as Currency })}>
            <option>PLN</option><option>USD</option><option>EUR</option>
          </select>
        </label>
        <label>{t.settings.network}
          <select value={persisted.btcNetwork} onChange={(event) => updateSettings({ btcNetwork: event.target.value as "testnet" | "mainnet" })}>
            <option value="testnet">{t.wallet.testnet}</option>
            <option value="mainnet">{t.wallet.mainnet}</option>
          </select>
        </label>
        <label>{t.settings.autoLock}<input type="number" min={1} max={120} value={persisted.autoLockMinutes} onChange={(event) => updateSettings({ autoLockMinutes: Number(event.target.value) })} /></label>
        <label>{t.settings.proxy}<input value={persisted.proxyUrl} placeholder="socks5://127.0.0.1:9050" onChange={(event) => updateSettings({ proxyUrl: event.target.value })} /></label>
        <p className="hint">{t.settings.proxyHint}</p>
        <p className="hint">{t.settings.telemetry}</p>
        <label>{t.settings.automation}<input type="number" min={5} value={persisted.automationMinutes} disabled={!gate.can("automation")} onChange={(event) => updateSettings({ automationMinutes: Number(event.target.value) })} /></label>
        {!gate.can("automation") ? <p className="hint">{t.settings.automationLocked}</p> : null}
        <button className="ghost" disabled={!gate.can("csv")} onClick={() => {
          const csv = miningCsv(runtime.snapshots.flatMap((snapshot) => snapshot.workers.map((worker) => ({
            date: snapshot.fetchedAt.slice(0, 10),
            source: snapshot.label,
            btc: snapshot.unpaidBtc != null ? String(snapshot.unpaidBtc) : "",
            note: `${worker.name} ${worker.status}`,
          }))));
          download("hashly-mining.csv", csv);
        }}>{t.settings.export}</button>
        {!gate.can("csv") ? <p className="hint">{t.settings.exportLocked}</p> : null}
      </article>
      <article className="card">
        <h2>{t.settings.brand}</h2>
        {!gate.can("whiteLabel") ? <p className="hint">{t.settings.brandLocked}</p> : null}
        <label>{t.settings.brandName}<input disabled={!gate.can("whiteLabel")} value={brand.productName} onChange={(event) => setBrand({ ...brand, productName: event.target.value })} /></label>
        <label>{t.settings.accent}<input disabled={!gate.can("whiteLabel")} value={brand.accent} onChange={(event) => setBrand({ ...brand, accent: event.target.value })} /></label>
        <label>{t.settings.graphite}<input disabled={!gate.can("whiteLabel")} value={brand.graphite} onChange={(event) => setBrand({ ...brand, graphite: event.target.value })} /></label>
        <label>{t.settings.support}<input disabled={!gate.can("whiteLabel")} value={brand.supportUrl} onChange={(event) => setBrand({ ...brand, supportUrl: event.target.value })} /></label>
        {error ? <p className="bad">{error}</p> : null}
        <button className="primary" disabled={!gate.can("whiteLabel")} onClick={() => {
          try {
            updateSettings({ brand: parseBrand({ ...brand, supportUrl: brand.supportUrl || undefined }) });
            setError("");
          } catch {
            setError(t.errors.generic);
          }
        }}>{t.common.save}</button>
      </article>
    </section>
  );
}

export function SecurityPage() {
  const t = useT();
  return (
    <section data-testid="security">
      <h1>{t.security.title}</h1>
      <article className="card prose"><p>{t.security.p1}</p><p>{t.security.p2}</p><p>{t.security.p3}</p><p>{t.security.p4}</p><p>{t.security.p5}</p></article>
    </section>
  );
}

const LEGAL: Record<Locale, { privacy: string; terms: string }> = {
  en: {
    privacy: "Draft for lawyer review. Hashly / Infinitas does not run an account system. Seeds, pool keys, and licence tokens stay in this browser or desktop profile. There is no telemetry. When you refresh, this device calls CoinGecko, mempool.space, and any pool or webhook you configured. Those services see the request, including a pool token you chose to send. The operator of the software is the Polish sole proprietorship Infinitas - Krzysztof Paweł Michalak. Address, tax id, and the final controller wording are still to be completed.",
    terms: "Draft for lawyer review. Hashly is software. It does not hold funds, sell hashrate, process card, BLIK, or crypto payments, or promise mining results. You are responsible for your seed, your pool accounts, and your electricity. Estimates can be wrong. The wallet stays usable without a paid plan. Paid features need a signed licence key checked on this device. Checkout, if configured, is an external page. Polish law is the intended governing law, subject to a lawyer's review.",
  },
  pl: {
    privacy: "Szkic do przeglądu prawnika. Hashly / Infinitas nie prowadzi kont. Frazy, klucze pul i token licencji zostają w tej przeglądarce albo profilu aplikacji. Telemetrii nie ma. Przy odświeżeniu to urządzenie woła CoinGecko, mempool.space oraz pulę lub webhook, które sam ustawisz. Te serwisy widzą żądanie, w tym token puli, który zdecydujesz się wysłać. Operatorem oprogramowania jest jednoosobowa działalność Infinitas - Krzysztof Paweł Michalak. Adres, NIP i ostateczne brzmienie administratora są do uzupełnienia.",
    terms: "Szkic do przeglądu prawnika. Hashly jest oprogramowaniem. Nie trzyma środków, nie sprzedaje mocy, nie obsługuje karty, BLIK ani płatności krypto i nie obiecuje wyniku kopania. Odpowiadasz za frazę, konta na pulach i prąd. Szacunki mogą być błędne. Portfel działa bez płatnego planu. Funkcje płatne wymagają podpisanego klucza sprawdzanego na tym urządzeniu. Kasa, jeśli jest ustawiona, to zewnętrzna strona. Prawem właściwym ma być prawo polskie, po przeglądzie prawnika.",
  },
  de: {
    privacy: "Entwurf zur anwaltlichen Prüfung. Hashly / Infinitas führt keine Konten. Seeds, Pool-Schlüssel und Lizenztoken bleiben in diesem Browser oder Desktop-Profil. Es gibt keine Telemetrie. Beim Aktualisieren ruft dieses Gerät CoinGecko, mempool.space und einen Pool oder Webhook auf, den du einträgst. Diese Dienste sehen die Anfrage. Betreiber der Software ist das polnische Einzelunternehmen Infinitas - Krzysztof Paweł Michalak. Anschrift und Steuerdaten sind noch einzutragen.",
    terms: "Entwurf zur anwaltlichen Prüfung. Hashly ist Software. Sie verwahrt keine Mittel, verkauft keine Hashrate, verarbeitet keine Karten-, BLIK- oder Krypto-Zahlungen und verspricht kein Mining-Ergebnis. Du verantwortest Seed, Poolkonten und Strom. Schätzungen können falsch sein. Die Wallet bleibt ohne Bezahlplan nutzbar. Polnisches Recht ist als anwendbares Recht vorgesehen, nach anwaltlicher Prüfung.",
  },
  es: {
    privacy: "Borrador para revisión legal. Hashly / Infinitas no tiene cuentas. La semilla, las claves del pool y la licencia se quedan en este navegador o perfil de escritorio. No hay telemetría. Al actualizar, este dispositivo llama a CoinGecko, mempool.space y al pool o webhook que configures. Esos servicios ven la petición. El operador del software es el empresario individual polaco Infinitas - Krzysztof Paweł Michalak. Dirección e identificador fiscal están pendientes.",
    terms: "Borrador para revisión legal. Hashly es software. No custodia fondos, no vende hashrate, no procesa pagos con tarjeta, BLIK ni cripto, y no promete un resultado de minado. Tú respondes de la semilla, de las cuentas del pool y de la electricidad. Las estimaciones pueden fallar. La cartera sigue usable sin un plan de pago. La ley prevista es la polaca, sujeta a revisión legal.",
  },
  ru: {
    privacy: "Черновик для проверки юристом. Hashly / Infinitas не ведёт аккаунты. Сид, ключи пула и лицензия остаются в этом браузере или профиле приложения. Телеметрии нет. При обновлении устройство обращается к CoinGecko, mempool.space и к пулу или вебхуку, который вы указали. Эти сервисы видят запрос. Оператор программы — польское ИП Infinitas - Krzysztof Paweł Michalak. Адрес и налоговый номер ещё нужно внести.",
    terms: "Черновик для проверки юристом. Hashly — это программа. Она не хранит средства, не продаёт хешрейт, не проводит оплату картой, BLIK или криптовалютой и не обещает результат майнинга. Вы отвечаете за сид, аккаунты пулов и электричество. Оценки могут быть неверны. Кошелёк работает без платного плана. Предполагаемое право — польское, после проверки юристом.",
  },
};

export function LegalPage() {
  const t = useT();
  const { persisted } = useHashly();
  const { doc } = useParams();
  const copy = LEGAL[persisted.locale];
  const body = doc === "terms" ? copy.terms : copy.privacy;
  const title = doc === "terms" ? t.legal.termsTitle : t.legal.privacyTitle;
  return (
    <section className="card prose" data-testid="legal">
      <p className="pill">{t.legal.draft}</p>
      <h1>{title}</h1>
      <p>{body}</p>
      <Link to="/">{t.common.back}</Link>
    </section>
  );
}

export function LanguageSelect({ locale }: { locale: Locale }) {
  const t = useT();
  return (
    <label>
      {t.common.language}
      <select value={locale} onChange={(event) => updateSettings({ locale: event.target.value as Locale })}>
        <option value="pl">Polski</option>
        <option value="en">English</option>
        <option value="de">Deutsch</option>
        <option value="ru">Русский</option>
        <option value="es">Español</option>
      </select>
    </label>
  );
}

function download(name: string, contents: string) {
  const blob = new Blob([contents], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

