import { useEffect, useId, useMemo, useRef, useState } from "react";
import { hnUrl, loadData, loadMentions, thumb, type Data, type Mention, type Video } from "./data";
import {
  byTopic,
  countWhere,
  forYou,
  litIn,
  search,
  semanticSearch,
  shelf,
  surprise,
  typeMatch,
  weightsFor,
  TYPE_GROUPS,
  type Ranked,
  type TopicSort,
} from "./rank";
import { semanticScores } from "./semantic";
import { actions, snapshot, useStore } from "./store";
import { dismiss, toast, useToast } from "./toast";

// ---------- routing (hash, so the site is fully static) ----------

type Route =
  | { page: "home" }
  | { page: "topic"; id: string }
  | { page: "area"; id: string }
  | { page: "watch"; id: string; auto: boolean }
  | { page: "search"; q: string }
  | { page: "liked" | "later" | "history" | "tune" | "about" };

function parse(hash: string): Route {
  const [path, qs] = hash.replace(/^#\/?/, "").split("?");
  const parts = path.split("/").filter(Boolean);
  const params = new URLSearchParams(qs ?? "");
  switch (parts[0]) {
    case "watch":
      return { page: "watch", id: parts[1], auto: params.get("auto") === "1" };
    case "topic":
      return { page: "topic", id: parts[1] };
    case "area":
      return { page: "area", id: parts[1] };
    case "search":
      return { page: "search", q: params.get("q") ?? "" };
    case "threads":
    case "tune":
      return { page: "tune" };
    case "liked":
    case "later":
    case "history":
    case "about":
      return { page: parts[0] };
    default:
      return { page: "home" };
  }
}

function useRoute() {
  const [route, setRoute] = useState(() => parse(location.hash));
  useEffect(() => {
    const on = () => {
      setRoute(parse(location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

const go = (h: string) => (location.hash = h);
const fmt = (n: number) => n.toLocaleString("en-US");

// ---------- icons: one outline set, 16px, 1.5 stroke ----------

const paths = {
  home: "M3 7.5 8 3.5l5 4V13H9.5V9.5h-3V13H3z",
  clock: "M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM8 5v3.2l2 1.3",
  heart: "M8 13.5S2.5 10.2 2.5 6.4A2.9 2.9 0 0 1 8 5a2.9 2.9 0 0 1 5.5 1.4c0 3.8-5.5 7.1-5.5 7.1z",
  history: "M2.5 8a5.5 5.5 0 1 0 1.6-3.9M2.5 2.8v2.6h2.6M8 5.2V8l2 1.2",
  sliders: "M3 4.5h6M12 4.5h1M3 11.5h1M7 11.5h6M10.5 3v3M5.5 10v3",
  info: "M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM8 7.2V11M8 5v.01",
  search: "M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10zM14 14l-3.5-3.5",
  x: "M4 4l8 8M12 4l-8 8",
  menu: "M2.5 4.5h11M2.5 8h11M2.5 11.5h11",
  shuffle: "M2.5 4.5h2.2c3.6 0 3.4 7 7 7h1.8M2.5 11.5h2.2c1.2 0 1.9-.8 2.5-1.8M9 6.3c.6-1 1.3-1.8 2.5-1.8h2M12 2.8l1.7 1.7L12 6.2M12 9.8l1.7 1.7-1.7 1.7",
  back: "M10 3.5 5.5 8l4.5 4.5",
  spark: "M8 2v3M8 11v3M2 8h3M11 8h3M4 4l1.8 1.8M10.2 10.2 12 12M12 4l-1.8 1.8M5.8 10.2 4 12",
  link: "M6.5 9.5l3-3M7 4.5l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1M9 11.5l-1 1A2.5 2.5 0 0 1 4.5 9l1-1",
  keys: "M2 4.5h12v7H2zM4.5 7h.01M7 7h.01M9.5 7h.01M12 7h.01M5 9.5h6",
  down: "M8 2.5v8M4.5 7.5 8 11l3.5-3.5M3 13.5h10",
  up: "M8 13.5v-8M4.5 8.5 8 5l3.5 3.5M3 2.5h10",
  next: "M4 3.5v9l6.5-4.5zM12 3.5v9",
};

function Icon({ name, size = 16 }: { name: keyof typeof paths; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}

function Mark() {
  const id = useId().replace(/:/g, "");
  return (
    <svg className="mark-glyph" viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id={`mk${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffb347" />
          <stop offset="0.55" stopColor="#ff2d95" />
          <stop offset="1" stopColor="#8a3ffc" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="7" fill={`url(#mk${id})`} />
      <path d="M9.5 7v10l8-5z" fill="#0d0716" />
    </svg>
  );
}

// ---------- the sunset: drawn in code, no borrowed art ----------

function Palm({ x, s, flip = false }: { x: number; s: number; flip?: boolean }) {
  const f = flip ? -1 : 1;
  return (
    <g transform={`translate(${x} 300) scale(${f * s} ${s})`} fill="#0d0716">
      <path d="M-3 0 C 2 -60 10 -120 22 -168 L 29 -166 C 18 -118 10 -60 5 0 Z" />
      <g transform="translate(25 -168)">
        <path d="M0 0 C -30 -18 -62 -12 -84 8 C -58 -4 -30 -4 0 6 Z" />
        <path d="M0 0 C -18 -34 -50 -46 -76 -38 C -46 -30 -22 -18 -2 6 Z" />
        <path d="M0 0 C 8 -36 32 -54 58 -54 C 34 -44 16 -24 4 4 Z" />
        <path d="M0 0 C 30 -18 62 -14 86 6 C 58 -4 30 -2 2 6 Z" />
        <path d="M0 0 C 26 4 50 22 60 48 C 40 26 20 14 0 8 Z" />
        <path d="M0 0 C -24 6 -44 26 -50 52 C -34 30 -18 16 0 8 Z" />
      </g>
    </g>
  );
}

function Sunset() {
  const stripes = [0, 1, 2, 3, 4, 5];
  return (
    <svg className="sunset" viewBox="0 0 1200 300" preserveAspectRatio="xMaxYMax slice" aria-hidden="true">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1a0b33" />
          <stop offset="0.38" stopColor="#5b1d8f" />
          <stop offset="0.6" stopColor="#d12a8a" />
          <stop offset="0.8" stopColor="#ff6b4a" />
          <stop offset="0.96" stopColor="#ffb347" />
        </linearGradient>
        <linearGradient id="sun" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe08a" />
          <stop offset="0.5" stopColor="#ff9a4a" />
          <stop offset="1" stopColor="#ff2d95" />
        </linearGradient>
        <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a0e4d" />
          <stop offset="1" stopColor="#0d0716" />
        </linearGradient>
        <mask id="sunCut">
          <rect x="0" y="0" width="1200" height="300" fill="#fff" />
          {stripes.map((i) => (
            <rect key={i} x="0" y={168 + i * 11} width="1200" height={2 + i * 1.3} fill="#000" />
          ))}
        </mask>
      </defs>
      <rect width="1200" height="300" fill="url(#sky)" />
      <circle cx="860" cy="236" r="118" fill="url(#sun)" mask="url(#sunCut)" />
      {/* skyline: an original row of towers on the waterline */}
      <path
        fill="#24103f"
        d="M600 236 V196 h18 v-26 h22 v26 h10 v-58 h26 v58 h14 v-34 h20 v34 h8 v-82 h30 v82 h12 v-46 h24 v46 h16 v-20 h28 v20 h10 v-64 h20 v64 h22 v-30 h26 v30 h14 v-52 h22 v52 h20 v-24 h30 v24 h18 v-40 h26 v40 h16 v-18 h34 V236 Z"
      />
      <g fill="#ff2d95" opacity="0.55">
        {[[700, 168], [706, 180], [770, 150], [776, 170], [846, 190], [930, 196], [1000, 200], [1074, 206]].map(([x, y], i) => (
          <rect key={i} x={x} y={y} width="3" height="3" />
        ))}
      </g>
      <g fill="#1de9d0" opacity="0.5">
        {[[704, 158], [774, 160], [852, 204], [936, 186], [1080, 214]].map(([x, y], i) => (
          <rect key={i} x={x} y={y} width="3" height="3" />
        ))}
      </g>
      <rect y="236" width="1200" height="64" fill="url(#sea)" />
      <g fill="#ffb347">
        {[[810, 244, 100], [828, 252, 64], [842, 260, 36], [852, 268, 18]].map(([x, y, w], i) => (
          <rect key={i} x={x} y={y} width={w} height="2" opacity={0.75 - i * 0.15} />
        ))}
      </g>
      <g fill="#1de9d0" opacity="0.35">
        <rect x="620" y="250" width="70" height="1.5" />
        <rect x="1010" y="258" width="90" height="1.5" />
        <rect x="560" y="272" width="40" height="1.5" />
      </g>
      <Palm x={560} s={0.95} />
      <Palm x={1160} s={1.15} flip />
      <Palm x={1105} s={0.78} />
    </svg>
  );
}

// ---------- the year strip: which years HN recommended a video ----------

function YearStrip({ data, v, big = false }: { data: Data; v: Video; big?: boolean }) {
  const [y0, y1] = data.meta.years;
  const lit = [...v.ry].map(Number);
  const years = lit.map((n, i) => (n ? y0 + i : 0)).filter(Boolean);
  const label = years.length
    ? `Recommended on Hacker News in ${years.length} ${years.length === 1 ? "year" : "different years"}: ${years.join(", ")}`
    : "Not recommended in the comments kept";
  return (
    <span className={big ? "strip big" : "strip"} role="img" aria-label={label} title={big ? undefined : label}>
      <span className="strip-cells">
        {lit.map((n, i) => (
          <span key={i} className="cell" data-l={n === 0 ? 0 : n < 3 ? 1 : n < 5 ? 2 : 3} />
        ))}
      </span>
      {big && (
        <span className="strip-axis" aria-hidden="true">
          {[y0, 2012, 2017, 2022, y1].map((y) => (
            <span key={y} style={{ ["--i" as string]: y - y0 }}>{y}</span>
          ))}
        </span>
      )}
    </span>
  );
}

// ---------- shared actions with feedback ----------

function hideWithUndo(v: Video) {
  actions.hide(v.id);
  toast(`Hidden “${v.t.slice(0, 48)}${v.t.length > 48 ? "…" : ""}”. Similar videos move down.`, {
    label: "Undo",
    run: () => actions.unhide(v.id),
  });
}

function toggleLaterWithNote(v: Video) {
  const was = snapshot().later.includes(v.id);
  actions.toggleLater(v.id);
  toast(was ? "Removed from Watch later" : "Saved to Watch later");
}

function surpriseMe(data: Data) {
  const v = surprise(data, snapshot());
  if (v) go(`#/watch/${v.id}`);
}

// ---------- app ----------

export default function App() {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState(false);
  const [menu, setMenu] = useState(false);
  const [help, setHelp] = useState(false);
  const route = useRoute();
  const load = () => {
    setErr(false);
    loadData().then(setData, () => setErr(true));
  };
  useEffect(load, []);
  useEffect(() => setMenu(false), [route]);
  useShortcuts(data, route, setHelp);

  return (
    <div className="shell">
      <aside className={menu ? "side open" : "side"} aria-label="Navigation">
        <div className="side-head">
          <a className="mark" href="#/" aria-label="Polymath Tube, For you">
            <Mark />
            <span className="wordmark">Polymath Tube</span>
          </a>
          <button className="icon-btn side-close" onClick={() => setMenu(false)} aria-label="Close menu">
            <Icon name="x" />
          </button>
        </div>
        <Nav data={data} route={route} onHelp={() => setHelp(true)} />
      </aside>

      <header className="top">
        <button className="icon-btn menu-btn" onClick={() => setMenu(true)} aria-label="Open menu">
          <Icon name="menu" />
        </button>
        <a className="mark top-mark" href="#/" aria-label="Polymath Tube, For you">
          <Mark />
        </a>
        <SearchBox route={route} />
        {data && (
          <button className="btn ghost surprise" onClick={() => surpriseMe(data)} title="Surprise me (r)">
            <Icon name="spark" />
            <span>Surprise me</span>
          </button>
        )}
      </header>

      <main className="canvas" id="main">
        {err && (
          <div className="frame-msg">
            <p>The video list didn't load.</p>
            <button className="text-btn" onClick={load}>Retry</button>
          </div>
        )}
        {!data && !err && <Skeleton />}
        {data && <Page data={data} route={route} />}
        <footer className="foot">
          Picks, summaries and comments come from{" "}
          <a href="https://hackertube.org" target="_blank" rel="noreferrer">HackerTube</a>'s open data (ODC-By 1.0),
          built from the{" "}
          <a href="https://huggingface.co/datasets/open-index/hacker-news" target="_blank" rel="noreferrer">Hacker News archive</a>.
          Comments remain the work of their authors. {data ? `${fmt(data.videos.length)} videos, data from Oct 31, 2026.` : ""}{" "}
          <a href="#/about">How it works</a>
        </footer>
      </main>

      {help && <Help onClose={() => setHelp(false)} />}
      <ToastView />
    </div>
  );
}

function Page({ data, route }: { data: Data; route: Route }) {
  switch (route.page) {
    case "home":
      return <Home data={data} />;
    case "topic":
      return <Topic data={data} id={route.id} />;
    case "area":
      return <Area data={data} id={route.id} />;
    case "watch":
      return <Watch data={data} id={route.id} auto={route.auto} />;
    case "search":
      return <Search data={data} q={route.q} />;
    case "liked":
    case "later":
    case "history":
      return <Library data={data} which={route.page} />;
    case "tune":
      return <Tune data={data} />;
    case "about":
      return <About data={data} />;
  }
}

// ---------- keyboard ----------

function useShortcuts(data: Data | null, route: Route, setHelp: (f: (h: boolean) => boolean) => void) {
  const ref = useRef({ data, route });
  ref.current = { data, route };
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return;
      const { data, route } = ref.current;
      if (e.key === "Escape") return setHelp(() => false);
      if (e.key === "?") return setHelp((h) => !h);
      if (!data) return;
      const cardEl = t.closest<HTMLElement>("[data-vid]");
      const focused = cardEl ? data.byId.get(cardEl.dataset.vid!) : undefined;
      const onPage = route.page === "watch" ? data.byId.get(route.id) : undefined;
      const v = focused ?? onPage;
      switch (e.key) {
        case "j":
        case "k": {
          const links = [...document.querySelectorAll<HTMLAnchorElement>("[data-vid] .card-title a")];
          if (!links.length) return;
          const i = cardEl ? links.findIndex((a) => cardEl.contains(a)) : -1;
          const next = links[Math.max(0, Math.min(links.length - 1, i + (e.key === "j" ? 1 : -1)))];
          next.focus();
          next.scrollIntoView({ block: "nearest", behavior: "smooth" });
          e.preventDefault();
          return;
        }
        case "w":
          if (v) toggleLaterWithNote(v);
          return;
        case "x":
          if (focused) hideWithUndo(focused);
          return;
        case "l":
          if (v) {
            const was = snapshot().liked.includes(v.id);
            actions.toggleLike(v.id);
            toast(was ? "Like removed" : "Liked. Similar videos move up For you.");
          }
          return;
        case "s":
          if (route.page === "home") actions.shuffle();
          return;
        case "r":
          surpriseMe(data);
          return;
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [setHelp]);
}

function Help({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ["/", "Search"],
    ["j  k", "Next and previous video"],
    ["Enter", "Open the focused video"],
    ["w", "Save to or remove from Watch later"],
    ["l", "Like the focused or playing video"],
    ["x", "Not for me (with undo)"],
    ["s", "Shuffle For you"],
    ["r", "Surprise me"],
    ["?", "Show or hide this list"],
  ];
  return (
    <div className="dialog-wrap" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="keys-title" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <h2 id="keys-title">Keyboard shortcuts</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <dl className="keys">
          {rows.map(([k, d]) => (
            <div key={k}>
              <dt>{k.split("  ").map((x) => <kbd key={x}>{x}</kbd>)}</dt>
              <dd>{d}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

function ToastView() {
  const t = useToast();
  if (!t) return <div className="toast-slot" aria-live="polite" />;
  return (
    <div className="toast-slot" aria-live="polite">
      <div className="toast" key={t.id}>
        <span>{t.text}</span>
        {t.action && (
          <button
            className="text-btn"
            onClick={() => {
              t.action!.run();
              dismiss();
            }}
          >
            {t.action.label}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- chrome ----------

function SearchBox({ route }: { route: Route }) {
  const [q, setQ] = useState(route.page === "search" ? route.q : "");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && t.tagName !== "INPUT" && t.tagName !== "TEXTAREA") {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);
  useEffect(() => {
    if (route.page !== "search") setQ("");
    else setQ(route.q);
  }, [route]);
  return (
    <form
      className="search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) go(`#/search?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <Icon name="search" />
      <input
        ref={input}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by meaning: “how CPUs really work”"
        aria-label="Search"
      />
      <kbd aria-hidden="true">/</kbd>
    </form>
  );
}

/** The area a route is in, so the nav can open it. */
function currentArea(data: Data, route: Route) {
  if (route.page === "area") return route.id;
  if (route.page === "topic") return data.meta.cats[route.id]?.area;
  if (route.page === "watch") {
    const v = data.byId.get(route.id);
    return v ? data.meta.cats[v.cats[0]]?.area : undefined;
  }
  return undefined;
}

function Nav({ data, route, onHelp }: { data: Data | null; route: Route; onHelp: () => void }) {
  const s = useStore();
  const cur = (p: string) => (route.page === p ? "page" : undefined);
  const openArea = data ? currentArea(data, route) : undefined;
  return (
    <nav className="nav">
      <ul className="nav-main">
        <li><a href="#/" aria-current={cur("home")}><Icon name="home" />For you</a></li>
        <li>
          <a href="#/later" aria-current={cur("later")}>
            <Icon name="clock" />Watch later{s.later.length > 0 && <span className="count">{s.later.length}</span>}
          </a>
        </li>
        <li><a href="#/liked" aria-current={cur("liked")}><Icon name="heart" />Liked</a></li>
        <li><a href="#/history" aria-current={cur("history")}><Icon name="history" />History</a></li>
      </ul>
      {data && (
        <>
          <p className="nav-group">Topics</p>
          <ul className="nav-areas">
            {data.meta.areas.map((a) => {
              const open = a.id === openArea;
              return (
                <li key={a.id}>
                  <a href={`#/area/${a.id}`} aria-current={route.page === "area" && route.id === a.id ? "page" : undefined} aria-expanded={open}>
                    {a.name}
                  </a>
                  {open && (
                    <ul className="nav-cats">
                      {a.cats.map((c) => (
                        <li key={c}>
                          <a href={`#/topic/${c}`} aria-current={route.page === "topic" && route.id === c ? "page" : undefined}>
                            {data.meta.cats[c].name}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      <ul className="nav-foot">
        <li><a href="#/tune" aria-current={cur("tune")}><Icon name="sliders" />Tune your feed</a></li>
        <li><a href="#/about" aria-current={cur("about")}><Icon name="info" />How it works</a></li>
        <li>
          <button className="nav-btn" onClick={onHelp}>
            <Icon name="keys" />Keyboard shortcuts<kbd className="count">?</kbd>
          </button>
        </li>
      </ul>
    </nav>
  );
}

function Skeleton() {
  return (
    <div className="skeleton" aria-label="Loading videos">
      <div className="bar hero-bar" />
      <div className="feed" style={{ marginTop: 28 }}>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i}>
            <div className="bar thumb-bar" />
            <div className="bar" style={{ width: "85%", height: 14, marginTop: 12 }} />
            <div className="bar" style={{ width: "45%", height: 12, marginTop: 8 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- cards ----------

function TopicLink({ data, id }: { data: Data; id: string }) {
  const c = data.meta.cats[id];
  if (!c) return null;
  return <a className="topic" href={`#/topic/${id}`}>{c.name}</a>;
}

function CardActions({ v }: { v: Video }) {
  const s = useStore();
  const later = s.later.includes(v.id);
  return (
    <div className="card-actions">
      <button
        className="chip-btn"
        aria-pressed={later}
        onClick={() => toggleLaterWithNote(v)}
        aria-label={later ? `Remove ${v.t} from Watch later` : `Save ${v.t} to Watch later`}
        title={later ? "Saved to Watch later (w)" : "Watch later (w)"}
      >
        <Icon name="clock" />
      </button>
      <button className="chip-btn" onClick={() => hideWithUndo(v)} aria-label={`Not for me: hide ${v.t}`} title="Not for me (x)">
        <Icon name="x" />
      </button>
    </div>
  );
}

function Card({ data, v }: { data: Data; v: Video }) {
  return (
    <article className="card" data-vid={v.id}>
      <div className="card-media">
        <a href={`#/watch/${v.id}`} tabIndex={-1} aria-hidden="true">
          <img src={thumb(v.id)} alt="" loading="lazy" />
        </a>
        <span className="kind">{v.type}</span>
        <CardActions v={v} />
      </div>
      <h3 className="card-title">
        <a href={`#/watch/${v.id}`}>{v.t}</a>
      </h3>
      <p className="card-meta">{v.ch}</p>
      <div className="card-foot">
        <TopicLink data={data} id={v.cats[0]} />
        <YearStrip data={data} v={v} />
      </div>
    </article>
  );
}

function Lead({ data, v }: { data: Data; v: Video }) {
  const s = useStore();
  const later = s.later.includes(v.id);
  return (
    <section className="lead" aria-label="Top pick" data-vid={v.id}>
      <div className="lead-media card">
        <a href={`#/watch/${v.id}`} aria-label={`Watch ${v.t}`}>
          <img src={thumb(v.id)} alt="" />
        </a>
        <span className="lead-kicker" aria-hidden="true">Top pick</span>
        <span className="kind">{v.type}</span>
        <CardActions v={v} />
      </div>
      <div className="lead-body">
        <h2 className="lead-title card-title"><a href={`#/watch/${v.id}`}>{v.t}</a></h2>
        <p className="card-meta lead-meta">
          <span>{v.ch}</span>
          <TopicLink data={data} id={v.cats[0]} />
        </p>
        {v.q && (
          <blockquote className="lead-quote">
            <p>
              “{v.q}”{v.qy && <cite> HN, {v.qy}</cite>}
            </p>
          </blockquote>
        )}
        <div className="lead-hn">
          <p className="hn-line">
            Recommended by <strong>{v.recs}</strong> {v.recs === 1 ? "person" : "people"} in{" "}
            <strong>{v.rm}</strong> different {v.rm === 1 ? "month" : "months"}
          </p>
          <YearStrip data={data} v={v} big />
        </div>
        <div className="lead-actions">
          <a className="btn primary" href={`#/watch/${v.id}`}>Watch</a>
          <button className="btn" aria-pressed={later} onClick={() => toggleLaterWithNote(v)}>
            <Icon name="clock" />{later ? "Saved" : "Watch later"}
          </button>
        </div>
      </div>
    </section>
  );
}

function Grid({ data, items }: { data: Data; items: Ranked[] }) {
  return (
    <div className="feed">
      {items.map((r) => (
        <Card key={r.v.id} data={data} v={r.v} />
      ))}
    </div>
  );
}

function Feed({ data, items, empty }: { data: Data; items: Ranked[]; empty?: React.ReactNode }) {
  if (!items.length)
    return (
      <div className="frame-msg">
        <p>{empty}</p>
      </div>
    );
  return <Grid data={data} items={items} />;
}

function Shelf({ data, title, sub, items }: { data: Data; title: string; sub: string; items: Ranked[] }) {
  if (items.length < 4) return null;
  return (
    <section className="shelf" aria-label={title}>
      <div className="shelf-head">
        <h2 className="section-title">{title}</h2>
        <p className="sub">{sub}</p>
      </div>
      <div className="shelf-row">
        {items.map((r) => (
          <Card key={r.v.id} data={data} v={r.v} />
        ))}
      </div>
    </section>
  );
}

function useMore(step: number, resetKey: unknown) {
  const [n, setN] = useState(step);
  useEffect(() => setN(step), [resetKey, step]);
  return [n, () => setN((x) => x + step)] as const;
}

function TypeTabs({
  value,
  onChange,
  counts,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  counts?: Record<string, number>;
}) {
  const tabs = [
    { id: null as string | null, label: "All", short: "All" },
    ...TYPE_GROUPS.map((g) => ({ id: g.id as string | null, label: g.label, short: g.short })),
  ];
  return (
    <div className="tabs" role="tablist" aria-label="Kind of video">
      {tabs.map((t) => {
        const n = counts ? (t.id === null ? counts.all : counts[t.id!]) : undefined;
        if (n === 0) return null;
        return (
          <button key={t.label} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}>
            <span className="long">{t.label}</span>
            <span className="short">{t.short}</span>
            {n !== undefined && <span className="tab-n">{fmt(n)}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ---------- pages ----------

function Home({ data }: { data: Data }) {
  const s = useStore();
  const [n, more] = useMore(37, s.type);
  const items = useMemo(() => forYou(data, s, n, s.type), [data, s, n]);
  const areas = new Set(items.map((r) => data.meta.cats[r.v.cats[0]]?.area)).size;
  const topics = new Set(items.map((r) => r.v.cats[0])).size;
  const [y0, y1] = data.meta.years;
  const inFeed = useMemo(() => new Set(items.map((r) => r.v.id)), [items]);
  const match = typeMatch(s.type);
  const decade = useMemo(
    () => shelf(data, s, (v) => match(v) && v.years[0] <= y1 - 10 && (litIn(data, v, y1) || litIn(data, v, y1 - 1)), 10, inFeed),
    [data, s, inFeed], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const fresh = useMemo(
    () => shelf(data, s, (v) => match(v) && v.years[0] >= y1 - 2, 10, new Set([...inFeed, ...decade.map((r) => r.v.id)])),
    [data, s, inFeed, decade], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const lead = items[0];
  const a = items.slice(1, 13);
  const b = items.slice(13, 25);
  const rest = items.slice(25);
  return (
    <>
      <section className="hero">
        <Sunset />
        <div className="hero-copy">
          <h1>For you</h1>
          <p className="hero-sub">
            {items.length} picks across {topics} topics in {areas} of 16 areas, from {fmt(data.videos.length)} videos Hacker
            News kept recommending, {y0} to {y1}.
            {s.liked.length > 0 ? ` Steered by ${s.liked.length} ${s.liked.length === 1 ? "like" : "likes"}.` : ""}
          </p>
          <div className="hero-actions">
            <button className="btn primary" onClick={actions.shuffle} title="Shuffle (s)">
              <Icon name="shuffle" />Shuffle
            </button>
            <button className="btn on-sky" onClick={() => surpriseMe(data)} title="Surprise me (r)">
              <Icon name="spark" />Surprise me
            </button>
            <span className="mix">{s.shuffle > 0 ? "Shuffled mix" : "Today's mix"}</span>
          </div>
        </div>
      </section>
      <TypeTabs value={s.type} onChange={actions.setType} />
      {!lead ? (
        <div className="frame-msg">
          <p>No videos of this kind left. Choose All, or undo a few Not for me picks on the Tune page.</p>
        </div>
      ) : (
        <>
          <Lead data={data} v={lead.v} />
          <Grid data={data} items={a} />
          <Shelf data={data} title="Still recommended a decade on" sub={`First recommended by ${y1 - 10} and still recommended in ${y1 - 1} or ${y1}`} items={decade} />
          {b.length > 0 && <Grid data={data} items={b} />}
          <Shelf data={data} title="New on Hacker News" sub={`First recommended in ${y1 - 2} or later`} items={fresh} />
          {rest.length > 0 && <Grid data={data} items={rest} />}
          {items.length >= n && <button className="btn more" onClick={more}>Show more</button>}
        </>
      )}
    </>
  );
}

function SortSwitch({ value, onChange }: { value: TopicSort; onChange: (v: TopicSort) => void }) {
  const opts: [TopicSort, string][] = [
    ["lasting", "Most lasting"],
    ["foryou", "For you"],
  ];
  return (
    <div className="seg" role="radiogroup" aria-label="Order">
      {opts.map(([id, label]) => (
        <button key={id} role="radio" aria-checked={value === id} onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Listing({
  data,
  keyId,
  base,
  title,
  crumb,
  extra,
}: {
  data: Data;
  keyId: string;
  base: (v: Video) => boolean;
  title: string;
  crumb?: React.ReactNode;
  extra?: React.ReactNode;
}) {
  const s = useStore();
  const [type, setType] = useState<string | null>(null);
  const [sort, setSort] = useState<TopicSort>("lasting");
  useEffect(() => setType(null), [keyId]);
  const [n, more] = useMore(36, `${keyId}-${type}-${sort}`);
  const counts = useMemo(() => {
    const out: Record<string, number> = { all: countWhere(data, s, base) };
    for (const g of TYPE_GROUPS) {
      const m = typeMatch(g.id);
      out[g.id] = countWhere(data, s, (v) => base(v) && m(v));
    }
    return out;
  }, [data, s.hidden, keyId]); // eslint-disable-line react-hooks/exhaustive-deps
  const items = useMemo(() => {
    const m = typeMatch(type);
    return byTopic(data, s, (v) => base(v) && m(v), n, sort);
  }, [data, s, keyId, type, sort, n]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = type ? counts[type] : counts.all;
  return (
    <>
      <div className="title-row">
        <div>
          {crumb}
          <h1>{title}</h1>
          <p className="sub">{fmt(counts.all)} videos HN recommended</p>
        </div>
        <SortSwitch value={sort} onChange={setSort} />
      </div>
      {extra}
      <TypeTabs value={type} onChange={setType} counts={counts} />
      <Feed data={data} items={items} empty="Nothing here yet." />
      {items.length < total && (
        <button className="btn more" onClick={more}>
          Show more <span className="faint">{fmt(items.length)} of {fmt(total)}</span>
        </button>
      )}
    </>
  );
}

function Topic({ data, id }: { data: Data; id: string }) {
  const c = data.meta.cats[id];
  if (!c) return <NotFound what="topic" />;
  const area = data.meta.areas.find((a) => a.id === c.area);
  return (
    <Listing
      data={data}
      keyId={id}
      base={(v) => v.cats.includes(id)}
      title={c.name}
      crumb={
        area && (
          <a className="crumb" href={`#/area/${area.id}`}>
            <Icon name="back" size={14} />
            {area.name}
          </a>
        )
      }
    />
  );
}

function Area({ data, id }: { data: Data; id: string }) {
  const area = data.meta.areas.find((a) => a.id === id);
  if (!area) return <NotFound what="area" />;
  return (
    <Listing
      data={data}
      keyId={id}
      base={(v) => data.meta.cats[v.cats[0]]?.area === id}
      title={area.name}
      extra={
        <ul className="topic-row" aria-label={`Topics in ${area.name}`}>
          {area.cats.map((c) => (
            <li key={c}>
              <a href={`#/topic/${c}`}>
                {data.meta.cats[c].name} <span className="faint">{data.meta.cats[c].n}</span>
              </a>
            </li>
          ))}
        </ul>
      }
    />
  );
}

function NotFound({ what }: { what: string }) {
  return (
    <div className="frame-msg">
      <p>There's no {what} at this address.</p>
      <a className="text-btn" href="#/">Back to For you</a>
    </div>
  );
}

type SemState = { status: "loading" | "ready" | "failed"; scores?: Float32Array };

function Search({ data, q }: { data: Data; q: string }) {
  const [sem, setSem] = useState<SemState>({ status: "loading" });
  useEffect(() => {
    let live = true;
    setSem({ status: "loading" });
    semanticScores(q, data.meta.emb.model, data.meta.emb.dim).then(
      (scores) => live && setSem({ status: "ready", scores }),
      () => live && setSem({ status: "failed" }),
    );
    return () => {
      live = false;
    };
  }, [q, data]);
  const items = useMemo(
    () => (sem.scores ? semanticSearch(data, q, sem.scores, 60) : search(data, q, 60)),
    [data, q, sem.scores],
  );
  const note =
    sem.status === "loading"
      ? "Matching words for now. Loading search by meaning (about 30 MB, first search only)…"
      : sem.status === "failed"
        ? "Search by meaning couldn't load, so these match words only."
        : "Ranked by meaning, with a boost for matching words.";
  return (
    <>
      <div className="title-row">
        <div>
          <h1>Results for “{q}”</h1>
          <p className="sub">
            {items.length === 60 ? "Top 60" : `${items.length} ${items.length === 1 ? "video" : "videos"}`}. {note}
          </p>
        </div>
      </div>
      <Feed data={data} items={items} empty={<>Nothing close to “{q}” yet. Try describing what you want to learn, in a few words.</>} />
    </>
  );
}

function Library({ data, which }: { data: Data; which: "liked" | "later" | "history" }) {
  const s = useStore();
  const ids = which === "history" ? s.history.map((h) => h.id) : s[which];
  const items: Ranked[] = ids
    .map((id) => data.byId.get(id))
    .filter((v): v is Video => !!v)
    .map((v) => ({ v, score: 0 }));
  const title = { liked: "Liked", later: "Watch later", history: "History" }[which];
  const empty = {
    liked: "Nothing liked yet. Liking a video moves similar ones up For you.",
    later: "Nothing saved yet. The clock on any video saves it here, and the player plays this list next.",
    history: "No history yet. Videos you open show up here, newest first.",
  }[which];
  return (
    <>
      <div className="title-row">
        <div>
          <h1>{title}</h1>
          <p className="sub">{items.length} {items.length === 1 ? "video" : "videos"}{which === "later" && items.length > 0 ? ", played in this order" : ""}</p>
        </div>
        {which === "later" && items.length > 0 && (
          <a className="btn primary" href={`#/watch/${items[0].v.id}?auto=1`}>
            <Icon name="next" />Play all
          </a>
        )}
        {which === "history" && items.length > 0 && (
          <button className="btn" onClick={actions.clearHistory}>Clear history</button>
        )}
      </div>
      <Feed data={data} items={items} empty={empty} />
    </>
  );
}

function Tune({ data }: { data: Data }) {
  const s = useStore();
  const w = weightsFor(data, s);
  const changed = Object.keys(s.weights).length > 0;
  const file = useRef<HTMLInputElement>(null);
  const exportLib = () => {
    const blob = new Blob([JSON.stringify({ ...snapshot(), exported: new Date().toISOString() }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "polymath-tube-library.json";
    a.click();
    URL.revokeObjectURL(a.href);
    toast("Library downloaded");
  };
  const importLib = async (f: File) => {
    try {
      actions.importState(JSON.parse(await f.text()));
      const now = snapshot();
      toast(`Library imported: ${now.liked.length} liked, ${now.later.length} saved, ${now.hidden.length} hidden`);
    } catch {
      toast("That file isn't a Polymath Tube library. Choose the .json file you downloaded here.");
    }
  };
  return (
    <>
      <div className="title-row">
        <div>
          <h1>Tune your feed</h1>
          <p className="sub">Turn an interest up and its videos rise in For you; at zero it drops out. Other topics still fill the rest.</p>
        </div>
        {changed && <button className="btn" onClick={actions.resetWeights}>Reset</button>}
      </div>
      <section className="panel">
        <h2 className="section-title">Interests</h2>
        <ul className="tune">
          {data.meta.facets.map((f, j) => (
            <li key={f.id}>
              <label htmlFor={`w-${f.id}`}>{f.short}</label>
              <input
                id={`w-${f.id}`}
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={w[j]}
                onChange={(e) => actions.setWeight(f.id, Number(e.target.value))}
              />
              <output htmlFor={`w-${f.id}`}>{w[j].toFixed(1)}</output>
            </li>
          ))}
        </ul>
      </section>
      <section className="panel">
        <h2 className="section-title">Playback</h2>
        <label className="switch-row">
          <span>
            <strong>Autoplay next</strong>
            <span className="faint">When a video ends, play the next one from Watch later, or the most similar video.</span>
          </span>
          <input type="checkbox" role="switch" checked={s.autoplay} onChange={actions.toggleAutoplay} />
        </label>
      </section>
      <section className="panel">
        <h2 className="section-title">Your library</h2>
        <p className="faint">
          Likes, Watch later, history and these settings live only in this browser. Download them to keep a copy or to
          move them to another device.
        </p>
        <div className="lib-actions">
          <button className="btn" onClick={exportLib}><Icon name="down" />Download library</button>
          <button className="btn" onClick={() => file.current?.click()}><Icon name="up" />Import library</button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importLib(f);
              e.target.value = "";
            }}
          />
        </div>
      </section>
      <section className="panel">
        <h2 className="section-title">Not for me</h2>
        {s.hidden.length === 0 ? (
          <p className="faint">Nothing hidden. The cross on a video hides it and pushes similar ones down.</p>
        ) : (
          <ul className="rows">
            {s.hidden.map((id) => {
              const v = data.byId.get(id);
              return v ? (
                <li key={id}>
                  <a href={`#/watch/${id}`}>{v.t}</a>
                  <button className="text-btn" onClick={() => actions.unhide(id)}>Undo</button>
                </li>
              ) : null;
            })}
          </ul>
        )}
      </section>
    </>
  );
}

/** Listens to the YouTube embed and calls onEnd when the video finishes. */
function usePlayerEnd(frame: React.RefObject<HTMLIFrameElement | null>, id: string, onEnd: () => void) {
  const cb = useRef(onEnd);
  cb.current = onEnd;
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const hello = () => {
      el.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), "*");
      el.contentWindow?.postMessage(JSON.stringify({ event: "command", func: "addEventListener", args: ["onStateChange"], id: 1, channel: "widget" }), "*");
    };
    el.addEventListener("load", hello);
    const on = (e: MessageEvent) => {
      if (e.source !== el.contentWindow || typeof e.data !== "string") return;
      try {
        const m = JSON.parse(e.data);
        const ended = (m.event === "onStateChange" && m.info === 0) || (m.event === "infoDelivery" && m.info?.playerState === 0);
        if (ended) cb.current();
      } catch {
        /* not a player message */
      }
    };
    window.addEventListener("message", on);
    return () => {
      el.removeEventListener("load", hello);
      window.removeEventListener("message", on);
    };
  }, [frame, id]);
}

function Watch({ data, id, auto }: { data: Data; id: string; auto: boolean }) {
  const s = useStore();
  const v = data.byId.get(id);
  const frame = useRef<HTMLIFrameElement>(null);
  const [mentions, setMentions] = useState<Mention[] | null>(null);
  const [failed, setFailed] = useState(false);
  const getMentions = () => {
    setFailed(false);
    setMentions(null);
    loadMentions().then(
      (m) => setMentions(m[id] ?? []),
      () => setFailed(true),
    );
  };
  useEffect(() => {
    if (v) actions.watched(v.id);
    getMentions();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const hiddenSet = new Set(s.hidden);
  const queue = v
    ? [
        ...s.later.filter((x) => x !== id).map((x) => data.byId.get(x)),
        ...v.sim.map(([sid]) => data.byId.get(sid)),
      ].filter((x, i, arr): x is Video => !!x && !hiddenSet.has(x.id) && x.id !== id && arr.findIndex((y) => y?.id === x.id) === i)
    : [];
  const next = queue[0];
  usePlayerEnd(frame, id, () => {
    if (snapshot().autoplay && next) go(`#/watch/${next.id}?auto=1`);
  });

  if (!v) return <NotFound what="video" />;
  const liked = s.liked.includes(v.id);
  const later = s.later.includes(v.id);
  const hidden = s.hidden.includes(v.id);
  const also = v.rel.map((rid) => data.byId.get(rid)).filter((x): x is Video => !!x && !hiddenSet.has(x.id));
  const fromLater = s.later.filter((x) => x !== id).length;
  const share = async () => {
    const url = `${location.origin}/#/watch/${v.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied");
    } catch {
      toast("Couldn't copy. The link is in the address bar.");
    }
  };

  return (
    <div className="watch">
      <div className="watch-main">
        <div className="player">
          <iframe
            ref={frame}
            key={v.id}
            src={`https://www.youtube-nocookie.com/embed/${v.id}?rel=0&enablejsapi=1&autoplay=${auto ? 1 : 0}&origin=${encodeURIComponent(location.origin)}`}
            title={v.t}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
        <div className="title-row watch-head">
          <div>
            <h1 className="watch-title">{v.t}</h1>
            <p className="sub">{v.ch} <span className="kind-inline">{v.type}</span></p>
          </div>
          <div className="actions">
            <button className="btn" aria-pressed={liked} onClick={() => actions.toggleLike(v.id)} title="Like (l)">
              <Icon name="heart" />{liked ? "Liked" : "Like"}
            </button>
            <button className="btn" aria-pressed={later} onClick={() => toggleLaterWithNote(v)} title="Watch later (w)">
              <Icon name="clock" />{later ? "Saved" : "Watch later"}
            </button>
            <button className="btn" onClick={share}><Icon name="link" />Copy link</button>
            <button className="btn quiet" aria-pressed={hidden} onClick={() => (hidden ? actions.unhide(v.id) : hideWithUndo(v))}>
              {hidden ? "Hidden from feed" : "Not for me"}
            </button>
          </div>
        </div>

        <section className="panel about-video">
          <h2 className="sr-only">About this video</h2>
          <ul className="topic-row">
            {v.cats.map((c) => (
              <li key={c}><TopicLink data={data} id={c} /></li>
            ))}
          </ul>
          <p className="summary">{v.sum}</p>
          <p className="faint">{v.why}</p>
        </section>

        <section className="panel hn">
          <h2 className="section-title">On Hacker News</h2>
          <p className="hn-line">
            Recommended by <strong>{v.recs}</strong> {v.recs === 1 ? "person" : "people"} in{" "}
            <strong>{v.rm}</strong> different {v.rm === 1 ? "month" : "months"},{" "}
            {v.years[0] === v.years[1] ? `in ${v.years[0]}` : `${v.years[0]} to ${v.years[1]}`}
          </p>
          <YearStrip data={data} v={v} big />
          <div className="comments">
            {failed && (
              <div className="frame-msg small">
                <p>The comments didn't load.</p>
                <button className="text-btn" onClick={getMentions}>Retry</button>
              </div>
            )}
            {!failed && mentions === null && <p className="faint">Loading comments…</p>}
            {mentions && mentions.length === 0 && <p className="faint">No recommending comments were kept for this one.</p>}
            {mentions?.map((m) => (
              <blockquote key={m.id}>
                <p>{m.x.replaceAll("[VIDEO]", "(this video)").replaceAll("[LINK]", "(link)")}</p>
                <footer>
                  <a href={hnUrl(m.id)} target="_blank" rel="noreferrer">{m.u}, {fmtMonth(m.m)}</a>
                  <span>on “{m.s}”</span>
                </footer>
              </blockquote>
            ))}
          </div>
        </section>
      </div>

      <aside className="watch-side" aria-label="More videos">
        <div className="side-title-row">
          <h2 className="section-title">Up next</h2>
          <label className="mini-switch">
            <input type="checkbox" role="switch" checked={s.autoplay} onChange={actions.toggleAutoplay} />
            Autoplay
          </label>
        </div>
        <p className="faint side-note">{fromLater > 0 ? `${fromLater} from Watch later, then similar videos` : "Similar videos"}</p>
        <SideList data={data} items={queue.slice(0, 8)} first />
        {also.length > 0 && (
          <>
            <h2 className="section-title side-gap">The same HN people also recommend</h2>
            <SideList data={data} items={also.slice(0, 6)} />
          </>
        )}
      </aside>
    </div>
  );
}

function SideList({ data, items, first = false }: { data: Data; items: Video[]; first?: boolean }) {
  return (
    <ul className="side-list">
      {items.map((v, i) => (
        <li key={v.id} data-vid={v.id} className={first && i === 0 ? "next" : undefined}>
          <a href={`#/watch/${v.id}`}>
            <img src={thumb(v.id)} alt="" loading="lazy" />
            <span>
              <strong>{v.t}</strong>
              <em>{v.ch}</em>
              <YearStrip data={data} v={v} />
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

const fmtMonth = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1).toLocaleString("en-US", { month: "short", year: "numeric" });
};

function About({ data }: { data: Data }) {
  return (
    <>
      <div className="title-row">
        <div>
          <h1>How it works</h1>
          <p className="sub">{fmt(data.videos.length)} videos, exported {data.meta.generated}, after removing duplicate uploads</p>
        </div>
      </div>
      <article className="panel prose">
        <h2 className="sr-only">The data and the ranking</h2>
        <p>
          <a href="https://hackertube.org" target="_blank" rel="noreferrer">HackerTube</a> read every Hacker News comment
          from 2007 to 2026 and kept the YouTube videos that at least three different people recommended, in at least
          three different months. It published that list as open data, and this site is built on it.
        </p>
        <p>
          For you starts from {data.meta.facets.length} interests, each a short description embedded with the same model
          HackerTube used (bge-small). Every video is scored against every interest, plus a share of how many months HN
          kept recommending it, plus a small nudge that changes each day so the mix doesn't go stale. The feed then
          spreads out: a second video from the same topic, area or channel costs points, and the first one from a new
          area earns some.
        </p>
        <p>
          Search runs that same model in your browser: your words become a vector and are compared with every video's,
          so “how CPUs really work” finds talks that never use those words. Matching words add a small boost. The model
          downloads once, on your first search.
        </p>
        <p>
          Liking a video brings its neighbours forward, and so do the videos its HN recommenders also recommended. “Not
          for me” pushes its neighbours back. Shuffle deals a new mix, and Surprise me opens one lasting pick at random.
          You can turn interests up or down on <a href="#/tune">Tune your feed</a>.
        </p>
        <p>
          The strip on each video marks the years, from 2007 to 2026, in which HN commenters recommended it: violet for
          a year with one or two recommending comments, pink for three or four, gold for five or more, among the up to
          20 the export keeps per video.
        </p>
        <p>
          Likes, Watch later, history and interest weights stay in this browser. Nothing is sent anywhere. Videos play
          through YouTube's privacy-enhanced embed.
        </p>
      </article>
    </>
  );
}
