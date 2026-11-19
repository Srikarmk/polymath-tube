import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { hnUrl, loadData, loadMentions, thumb, type Data, type Mention, type Video } from "./data";
import {
  byTopic,
  countWhere,
  forYou,
  litIn,
  quality,
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
import { actions, FINISH_MARGIN, isInProgress, snapshot, useStore, type Progress, type State } from "./store";
import { dismiss, toast, useToast } from "./toast";

// ---------- routing (hash, so the site is fully static) ----------

type Route =
  | { page: "home" }
  | { page: "topic"; id: string }
  | { page: "area"; id: string }
  | { page: "watch"; id: string; auto: boolean; list: string | null }
  | { page: "playlists" }
  | { page: "playlist"; id: string }
  | { page: "year"; y: number }
  | { page: "channel"; name: string }
  | { page: "search"; q: string }
  | { page: "liked" | "later" | "history" | "tune" | "about" };

function parse(hash: string): Route {
  const [path, qs] = hash.replace(/^#\/?/, "").split("?");
  const parts = path.split("/").filter(Boolean);
  const params = new URLSearchParams(qs ?? "");
  switch (parts[0]) {
    case "watch":
      return { page: "watch", id: parts[1], auto: params.get("auto") === "1", list: params.get("list") };
    case "playlists":
      return { page: "playlists" };
    case "playlist":
      return { page: "playlist", id: parts[1] };
    case "year":
      return { page: "year", y: Number(parts[1]) };
    case "channel":
      return { page: "channel", name: decodeURIComponent(parts.slice(1).join("/")) };
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
  list: "M2.5 4h8M2.5 8h8M2.5 12h5M12.5 9.5v5M10 12h5",
  cal: "M2.5 4h11v9.5h-11zM2.5 7h11M5.5 2.5v3M10.5 2.5v3",
  cmd: "M5.5 5.5h5v5h-5zM5.5 5.5a2 2 0 1 1 0-0.01M10.5 5.5a2 2 0 1 1 0-.01M5.5 10.5a2 2 0 1 0 0 .01M10.5 10.5a2 2 0 1 0 0 .01",
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

function YearStrip({ data, v, big = false, link = false }: { data: Data; v: Video; big?: boolean; link?: boolean }) {
  const [y0, y1] = data.meta.years;
  const lit = [...v.ry].map(Number);
  const years = lit.map((n, i) => (n ? y0 + i : 0)).filter(Boolean);
  const label = years.length
    ? `Recommended on Hacker News in ${years.length} ${years.length === 1 ? "year" : "different years"}: ${years.join(", ")}`
    : "Not recommended in the comments kept";
  return (
    <span className={big ? "strip big" : "strip"} role={link ? "group" : "img"} aria-label={label} title={big ? undefined : label}>
      <span className="strip-cells">
        {lit.map((n, i) => {
          const l = n === 0 ? 0 : n < 3 ? 1 : n < 5 ? 2 : 3;
          return link && n ? (
            <a key={i} className="cell" data-l={l} href={`#/year/${y0 + i}`} title={`What HN recommended in ${y0 + i}`} aria-label={`Time machine: ${y0 + i}`} />
          ) : (
            <span key={i} className="cell" data-l={l} />
          );
        })}
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
  const [palette, setPalette] = useState(false);
  const route = useRoute();
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((x) => !x);
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);
  useEffect(() => {
    setPalette(false);
    closeListMenu();
  }, [route]);
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
        <button className="btn ghost jump" onClick={() => setPalette(true)} title="Jump to anything (⌘K)">
          <Icon name="cmd" />
          <span>Jump to</span>
          <kbd>⌘K</kbd>
        </button>
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
      {palette && data && <Palette data={data} onClose={() => setPalette(false)} />}
      {data && <ListMenu data={data} />}
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
      return <Watch key={route.id} data={data} id={route.id} auto={route.auto} list={route.list} />;
    case "playlists":
      return <Playlists data={data} />;
    case "playlist":
      return <PlaylistPage data={data} id={route.id} />;
    case "year":
      return <YearPage data={data} year={route.y} />;
    case "channel":
      return <ChannelPage data={data} name={route.name} />;
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
        case "p":
          if (v) {
            const anchor = cardEl ?? document.querySelector<HTMLElement>(".watch-head .actions") ?? document.body;
            openListMenu(v.id, anchor);
            e.preventDefault();
          }
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
    ["⌘K", "Jump to a topic, year, channel, video or page"],
    ["/", "Search by meaning"],
    ["j  k", "Next and previous video"],
    ["Enter", "Open the focused video"],
    ["w", "Save to or remove from Watch later"],
    ["l", "Like the focused or playing video"],
    ["p", "Save the focused or playing video to a playlist"],
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
        <li>
          <a href="#/playlists" aria-current={route.page === "playlists" || route.page === "playlist" ? "page" : undefined}>
            <Icon name="list" />Playlists{s.playlists.length > 0 && <span className="count">{s.playlists.length}</span>}
          </a>
        </li>
        <li>
          <a href={`#/year/${data ? data.meta.years[1] : 2026}`} aria-current={route.page === "year" ? "page" : undefined}>
            <Icon name="cal" />Time machine
          </a>
        </li>
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
      <button
        className="chip-btn"
        aria-pressed={s.playlists.some((p) => p.ids.includes(v.id))}
        onClick={(e) => openListMenu(v.id, e.currentTarget)}
        aria-label={`Save ${v.t} to a playlist`}
        title="Save to playlist (p)"
      >
        <Icon name="list" />
      </button>
      <button className="chip-btn" onClick={() => hideWithUndo(v)} aria-label={`Not for me: hide ${v.t}`} title="Not for me (x)">
        <Icon name="x" />
      </button>
    </div>
  );
}

function Card({ data, v }: { data: Data; v: Video }) {
  const s = useStore();
  return (
    <article className="card" data-vid={v.id}>
      <div className="card-media">
        <a href={`#/watch/${v.id}`} tabIndex={-1} aria-hidden="true">
          <img src={thumb(v.id)} alt="" loading="lazy" />
        </a>
        <ProgressBar p={s.progress[v.id]} />
        <span className="kind">{v.type}</span>
        <CardActions v={v} />
      </div>
      <h3 className="card-title">
        <a href={`#/watch/${v.id}`}>{v.t}</a>
      </h3>
      <p className="card-meta"><ChannelLink name={v.ch} /></p>
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

function Shelf({ data, title, sub, items, min = 4 }: { data: Data; title: string; sub: string; items: Ranked[]; min?: number }) {
  if (items.length < min) return null;
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
  const going = Object.entries(s.progress)
    .filter(([id, p]) => isInProgress(p) && data.byId.has(id) && !s.hidden.includes(id))
    .sort((x, y) => y[1].at - x[1].at)
    .slice(0, 10)
    .map(([id]) => ({ v: data.byId.get(id)!, score: 0 }));
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
          {going.length > 0 && (
            <Shelf data={data} title="Continue watching" sub="Picks up where you stopped" items={going} min={1} />
          )}
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

/**
 * Talks to the YouTube embed: calls onTime with (seconds in, length) as it plays and onEnd when it
 * finishes. The embed reports through postMessage once it is told we are listening.
 */
function usePlayer(
  frame: React.RefObject<HTMLIFrameElement | null>,
  id: string,
  onTime: (t: number, d: number) => void,
  onEnd: () => void,
) {
  const cbs = useRef({ onTime, onEnd });
  cbs.current = { onTime, onEnd };
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    let duration = 0;
    let ended = false;
    const hello = () => {
      el.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), "*");
      el.contentWindow?.postMessage(JSON.stringify({ event: "command", func: "addEventListener", args: ["onStateChange"], id: 1, channel: "widget" }), "*");
    };
    el.addEventListener("load", hello);
    const on = (e: MessageEvent) => {
      if (e.source !== el.contentWindow || typeof e.data !== "string") return;
      let m: { event?: string; info?: unknown };
      try {
        m = JSON.parse(e.data);
      } catch {
        return;
      }
      const info = (m.info ?? {}) as { duration?: number; currentTime?: number; playerState?: number };
      if (m.event === "infoDelivery") {
        if (typeof info.duration === "number" && info.duration > 0) duration = info.duration;
        if (typeof info.currentTime === "number" && duration > 0) cbs.current.onTime(info.currentTime, duration);
      }
      const isEnd = (m.event === "onStateChange" && m.info === 0) || (m.event === "infoDelivery" && info.playerState === 0);
      if (isEnd && !ended) {
        ended = true;
        cbs.current.onEnd();
      }
    };
    window.addEventListener("message", on);
    return () => {
      el.removeEventListener("load", hello);
      window.removeEventListener("message", on);
    };
  }, [frame, id]);
}

/** Sends a command to the embed, e.g. seekTo. Exposed for testing autoplay. */
function playerCommand(el: HTMLIFrameElement | null, func: string, args: unknown[] = []) {
  el?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args, id: 1, channel: "widget" }), "*");
}

const fmtClock = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
};

function Watch({ data, id, auto, list }: { data: Data; id: string; auto: boolean; list: string | null }) {
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
  // Resume point is read once per video, so saving progress doesn't reload the player.
  const [startAt] = useState(() => {
    const p = snapshot().progress[id];
    return isInProgress(p) ? Math.max(0, p!.t - 3) : 0;
  });
  useEffect(() => {
    if (v) actions.watched(v.id);
    getMentions();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const playlist = list ? s.playlists.find((p) => p.id === list) : undefined;
  const hiddenSet = new Set(s.hidden);
  const fromList = playlist ? playlist.ids.slice(playlist.ids.indexOf(id) + 1) : [];
  const queue = v
    ? [
        ...fromList.map((x) => data.byId.get(x)),
        ...s.later.filter((x) => x !== id).map((x) => data.byId.get(x)),
        ...v.sim.map(([sid]) => data.byId.get(sid)),
      ].filter((x, i, arr): x is Video => !!x && !hiddenSet.has(x.id) && x.id !== id && arr.findIndex((y) => y?.id === x.id) === i)
    : [];
  const next = queue[0];
  const lastSave = useRef(0);
  usePlayer(
    frame,
    id,
    (t, d) => {
      const now = Date.now();
      if (now - lastSave.current < 5000) return;
      lastSave.current = now;
      actions.setProgress(id, t, d);
    },
    () => {
      const p = snapshot().progress[id];
      if (p) actions.setProgress(id, p.d, p.d);
      if (!snapshot().autoplay || !next) return;
      const keepList = playlist && fromList.includes(next.id) ? `&list=${playlist.id}` : "";
      go(`#/watch/${next.id}?auto=1${keepList}`);
    },
  );

  if (!v) return <NotFound what="video" />;
  const liked = s.liked.includes(v.id);
  const later = s.later.includes(v.id);
  const hidden = s.hidden.includes(v.id);
  const inLists = s.playlists.filter((p) => p.ids.includes(v.id)).length;
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
  const queueNote = [
    playlist && fromList.length ? `${fromList.length} more in “${playlist.name}”` : "",
    fromLater > 0 ? `${fromLater} from Watch later` : "",
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="watch">
      <div className="watch-main">
        <div className="player">
          <iframe
            ref={frame}
            key={v.id}
            data-testid="player"
            src={`https://www.youtube-nocookie.com/embed/${v.id}?rel=0&enablejsapi=1&autoplay=${auto ? 1 : 0}${startAt ? `&start=${Math.floor(startAt)}` : ""}&origin=${encodeURIComponent(location.origin)}`}
            title={v.t}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
        {startAt > 0 && <p className="resume-note">Resuming at {fmtClock(startAt)}. <button className="text-btn" onClick={() => playerCommand(frame.current, "seekTo", [0, true])}>Start over</button></p>}
        <div className="title-row watch-head">
          <div>
            <h1 className="watch-title">{v.t}</h1>
            <p className="sub">
              <ChannelLink name={v.ch} /> <span className="kind-inline">{v.type}</span>
            </p>
          </div>
          <div className="actions">
            <button className="btn" aria-pressed={liked} onClick={() => actions.toggleLike(v.id)} title="Like (l)">
              <Icon name="heart" />{liked ? "Liked" : "Like"}
            </button>
            <button className="btn" aria-pressed={later} onClick={() => toggleLaterWithNote(v)} title="Watch later (w)">
              <Icon name="clock" />{later ? "Saved" : "Watch later"}
            </button>
            <button className="btn" aria-pressed={inLists > 0} onClick={(e) => openListMenu(v.id, e.currentTarget)} title="Save to a playlist (p)">
              <Icon name="list" />{inLists > 0 ? `In ${inLists} ${inLists === 1 ? "playlist" : "playlists"}` : "Save to playlist"}
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
          <YearStrip data={data} v={v} big link />
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
        <p className="faint side-note">{queueNote ? `${queueNote}, then similar videos` : "Similar videos"}</p>
        <SideList data={data} items={queue.slice(0, 8)} first listId={playlist && fromList.length ? playlist.id : undefined} />
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

function SideList({ data, items, first = false, listId }: { data: Data; items: Video[]; first?: boolean; listId?: string }) {
  const s = useStore();
  return (
    <ul className="side-list">
      {items.map((v, i) => (
        <li key={v.id} data-vid={v.id} className={first && i === 0 ? "next" : undefined}>
          <a href={`#/watch/${v.id}${listId && i === 0 ? `?list=${listId}` : ""}`}>
            <span className="side-thumb">
              <img src={thumb(v.id)} alt="" loading="lazy" />
              <ProgressBar p={s.progress[v.id]} />
            </span>
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

// ---------- small pieces shared by the new pages ----------

function ChannelLink({ name }: { name: string }) {
  return (
    <a className="channel-link" href={`#/channel/${encodeURIComponent(name)}`}>
      {name}
    </a>
  );
}

function ProgressBar({ p }: { p?: Progress }) {
  if (!p || !(p.d > 0) || p.t < 30) return null;
  const done = p.t >= p.d - FINISH_MARGIN;
  return (
    <span className={done ? "progress done" : "progress"} aria-label={done ? "Watched" : `Watched ${fmtClock(p.t)} of ${fmtClock(p.d)}`}>
      <span style={{ width: `${Math.min(100, (p.t / p.d) * 100)}%` }} />
    </span>
  );
}

// ---------- the playlist menu: one floating menu for the whole app ----------

type MenuAt = { vid: string; x: number; top: number; bottom: number } | null;
let menuAt: MenuAt = null;
const menuListeners = new Set<() => void>();
function openListMenu(vid: string, anchor: HTMLElement) {
  const r = anchor.getBoundingClientRect();
  const w = 280;
  menuAt = { vid, x: Math.max(12, Math.min(window.innerWidth - w - 12, r.right - w)), top: r.top, bottom: r.bottom };
  menuListeners.forEach((l) => l());
}
function closeListMenu() {
  menuAt = null;
  menuListeners.forEach((l) => l());
}

function ListMenu({ data }: { data: Data }) {
  const at = useSyncExternalStore(
    (l) => {
      menuListeners.add(l);
      return () => menuListeners.delete(l);
    },
    () => menuAt,
  );
  const s = useStore();
  const [name, setName] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!at) return;
    setName("");
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) closeListMenu();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && closeListMenu();
    const scroll = () => closeListMenu();
    setTimeout(() => document.addEventListener("mousedown", away), 0);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", scroll, { passive: true });
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", scroll);
    };
  }, [at]);
  if (!at) return null;
  const v = data.byId.get(at.vid);
  if (!v) return null;
  // Open below the button when there is room, otherwise above it; never over the button itself.
  const below = window.innerHeight - at.bottom > 330 || at.top < 330;
  const place = below ? { top: at.bottom + 8 } : { bottom: window.innerHeight - at.top + 8 };
  return (
    <div className="list-menu" ref={box} role="dialog" aria-label="Save to playlist" style={{ left: at.x, ...place }}>
      <p className="list-menu-title">Save to playlist</p>
      {s.playlists.length === 0 && <p className="faint list-menu-empty">No playlists yet. Name your first one below.</p>}
      <ul>
        {s.playlists.map((p) => (
          <li key={p.id}>
            <label>
              <input
                type="checkbox"
                checked={p.ids.includes(v.id)}
                onChange={() => {
                  const had = p.ids.includes(v.id);
                  actions.togglePlaylistItem(p.id, v.id);
                  toast(had ? `Removed from “${p.name}”` : `Saved to “${p.name}”`);
                }}
              />
              <span>{p.name}</span>
              <span className="faint">{p.ids.length}</span>
            </label>
          </li>
        ))}
      </ul>
      <form
        className="list-menu-new"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          actions.createPlaylist(name, v.id);
          toast(`Created “${name.trim()}” with this video`);
          closeListMenu();
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New playlist name" aria-label="New playlist name" autoFocus={s.playlists.length === 0} />
        <button className="btn primary small" type="submit" disabled={!name.trim()}>Create</button>
      </form>
    </div>
  );
}

// ---------- playlists ----------

function Playlists({ data }: { data: Data }) {
  const s = useStore();
  const [name, setName] = useState("");
  return (
    <>
      <div className="title-row">
        <div>
          <h1>Playlists</h1>
          <p className="sub">{s.playlists.length} {s.playlists.length === 1 ? "playlist" : "playlists"}. Add any video with the list button on its card or player.</p>
        </div>
        <form
          className="inline-new"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            const id = actions.createPlaylist(name);
            setName("");
            go(`#/playlist/${id}`);
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New playlist name" aria-label="New playlist name" />
          <button className="btn primary" type="submit" disabled={!name.trim()}>Create</button>
        </form>
      </div>
      {s.playlists.length === 0 ? (
        <div className="frame-msg">
          <p>No playlists yet. Name one above, or press the list button on any video to start one with it.</p>
        </div>
      ) : (
        <div className="lists">
          {s.playlists.map((p) => {
            const vids = p.ids.map((x) => data.byId.get(x)).filter((x): x is Video => !!x);
            return (
              <a key={p.id} className="list-card" href={`#/playlist/${p.id}`}>
                <span className="list-cover">
                  {vids.slice(0, 4).map((x) => <img key={x.id} src={thumb(x.id)} alt="" loading="lazy" />)}
                  {vids.length === 0 && <span className="list-cover-empty">Empty</span>}
                </span>
                <strong>{p.name}</strong>
                <span className="faint">{vids.length} {vids.length === 1 ? "video" : "videos"}</span>
              </a>
            );
          })}
        </div>
      )}
    </>
  );
}

function PlaylistPage({ data, id }: { data: Data; id: string }) {
  const s = useStore();
  const p = s.playlists.find((x) => x.id === id);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(p?.name ?? "");
  useEffect(() => setName(p?.name ?? ""), [p?.name]);
  if (!p) return <NotFound what="playlist" />;
  const vids = p.ids.map((x) => data.byId.get(x)).filter((x): x is Video => !!x);
  const remove = () => {
    const copy = p;
    actions.deletePlaylist(p.id);
    go("#/playlists");
    toast(`Deleted “${copy.name}”`, { label: "Undo", run: () => actions.restorePlaylist(copy) });
  };
  return (
    <>
      <div className="title-row">
        <div>
          <a className="crumb" href="#/playlists"><Icon name="back" size={14} />Playlists</a>
          {editing ? (
            <form
              className="rename"
              onSubmit={(e) => {
                e.preventDefault();
                actions.renamePlaylist(p.id, name);
                setEditing(false);
              }}
            >
              <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Playlist name" autoFocus />
              <button className="btn small" type="submit">Save</button>
            </form>
          ) : (
            <h1>{p.name}</h1>
          )}
          <p className="sub">{vids.length} {vids.length === 1 ? "video" : "videos"}, played in this order</p>
        </div>
        <div className="actions">
          {vids.length > 0 && (
            <a className="btn primary" href={`#/watch/${vids[0].id}?auto=1&list=${p.id}`}><Icon name="next" />Play all</a>
          )}
          {!editing && <button className="btn" onClick={() => setEditing(true)}>Rename</button>}
          <button className="btn quiet" onClick={remove}>Delete</button>
        </div>
      </div>
      {vids.length === 0 ? (
        <div className="frame-msg">
          <p>This playlist is empty. Press the list button on any video to add it here.</p>
          <a className="text-btn" href="#/">Browse For you</a>
        </div>
      ) : (
        <ol className="list-rows">
          {vids.map((v, i) => (
            <li key={v.id} data-vid={v.id}>
              <span className="list-n">{i + 1}</span>
              <a className="list-thumb" href={`#/watch/${v.id}?list=${p.id}`}>
                <img src={thumb(v.id)} alt="" loading="lazy" />
                <ProgressBar p={s.progress[v.id]} />
              </a>
              <span className="list-text card-title">
                <a href={`#/watch/${v.id}?list=${p.id}`}>{v.t}</a>
                <em><ChannelLink name={v.ch} /></em>
              </span>
              <span className="list-tools">
                <button className="icon-btn" onClick={() => actions.moveInPlaylist(p.id, v.id, -1)} disabled={i === 0} aria-label={`Move ${v.t} up`}><Icon name="up" /></button>
                <button className="icon-btn" onClick={() => actions.moveInPlaylist(p.id, v.id, 1)} disabled={i === vids.length - 1} aria-label={`Move ${v.t} down`}><Icon name="down" /></button>
                <button className="icon-btn" onClick={() => actions.togglePlaylistItem(p.id, v.id)} aria-label={`Remove ${v.t} from this playlist`}><Icon name="x" /></button>
              </span>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

// ---------- the HN time machine ----------

function yearCounts(data: Data) {
  const [y0, y1] = data.meta.years;
  const n = new Array(y1 - y0 + 1).fill(0);
  for (const v of data.videos) if (v.recs > 0) for (let i = 0; i < n.length; i++) if (v.ry[i] !== "0") n[i]++;
  return n as number[];
}

function YearPage({ data, year }: { data: Data; year: number }) {
  const s = useStore();
  const [y0, y1] = data.meta.years;
  const y = Number.isFinite(year) ? Math.min(y1, Math.max(y0, year)) : y1;
  const i = y - y0;
  const counts = useMemo(() => yearCounts(data), [data]);
  const max = Math.max(...counts);
  const [n, more] = useMore(36, y);
  const hidden = new Set(s.hidden);
  const all = useMemo(
    () =>
      data.videos
        .filter((v) => v.recs > 0 && v.ry[i] !== "0" && !hidden.has(v.id))
        .map((v) => ({ v, score: Number(v.ry[i]) * 2 + quality(v) + (v.years[0] === y ? 1 : 0) }))
        .sort((a, b) => b.score - a.score),
    [data, i, s.hidden], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const firsts = all.filter((r) => r.v.years[0] === y).length;
  return (
    <>
      <div className="title-row">
        <div>
          <h1>Time machine: {y}</h1>
          <p className="sub">
            {fmt(all.length)} videos HN commenters recommended in {y}, {fmt(firsts)} of them for the first time. Most-recommended that year first.
          </p>
        </div>
        <div className="actions">
          <a className="btn" href={`#/year/${y - 1}`} aria-disabled={y <= y0} onClick={(e) => y <= y0 && e.preventDefault()}><Icon name="back" />{y - 1}</a>
          <a className="btn" href={`#/year/${y + 1}`} aria-disabled={y >= y1} onClick={(e) => y >= y1 && e.preventDefault()}>{y + 1}<span className="flip"><Icon name="back" /></span></a>
        </div>
      </div>
      <nav className="years" aria-label="Choose a year">
        {counts.map((c, k) => (
          <a key={k} href={`#/year/${y0 + k}`} aria-current={k === i ? "page" : undefined} title={`${y0 + k}: ${fmt(c)} videos`}>
            <span className="year-bar" style={{ height: `${Math.max(4, (c / max) * 100)}%` }} />
            <span className="year-n">{fmt(c)}</span>
            <span className="year-y">{String(y0 + k).slice(2)}</span>
          </a>
        ))}
      </nav>
      <Feed data={data} items={all.slice(0, n)} empty={`Nothing was recommended in ${y} among the comments kept.`} />
      {all.length > n && (
        <button className="btn more" onClick={more}>
          Show more <span className="faint">{fmt(n)} of {fmt(all.length)}</span>
        </button>
      )}
    </>
  );
}

// ---------- channels ----------

function ChannelPage({ data, name }: { data: Data; name: string }) {
  const s = useStore();
  const hidden = new Set(s.hidden);
  const vids = data.videos.filter((v) => v.ch === name && !hidden.has(v.id)).sort((a, b) => b.score - a.score);
  if (!vids.length) return <NotFound what="channel" />;
  const recs = vids.reduce((a, v) => a + v.recs, 0);
  const first = Math.min(...vids.map((v) => v.years[0]));
  const last = Math.max(...vids.map((v) => v.years[1]));
  const topics = [...new Set(vids.map((v) => v.cats[0]))].slice(0, 8);
  return (
    <>
      <div className="title-row">
        <div>
          <p className="crumb">Channel</p>
          <h1>{name}</h1>
          <p className="sub">
            {vids.length} {vids.length === 1 ? "video" : "videos"} HN recommended, {fmt(recs)} recommendations in all,{" "}
            {first === last ? `in ${first}` : `${first} to ${last}`}
          </p>
        </div>
      </div>
      <ul className="topic-row">
        {topics.map((c) => (
          <li key={c}><TopicLink data={data} id={c} /></li>
        ))}
      </ul>
      <Feed data={data} items={vids.map((v) => ({ v, score: v.score }))} />
    </>
  );
}

// ---------- command palette ----------

type Hit = { kind: string; label: string; sub?: string; href: string };

function paletteHits(data: Data, s: State, q: string): Hit[] {
  const t = q.trim().toLowerCase();
  const [y0, y1] = data.meta.years;
  const pages: Hit[] = [
    { kind: "Page", label: "For you", href: "#/" },
    { kind: "Page", label: "Watch later", sub: `${s.later.length} saved`, href: "#/later" },
    { kind: "Page", label: "Liked", href: "#/liked" },
    { kind: "Page", label: "History", href: "#/history" },
    { kind: "Page", label: "Playlists", sub: `${s.playlists.length}`, href: "#/playlists" },
    { kind: "Page", label: "Time machine", sub: `${y0} to ${y1}`, href: `#/year/${y1}` },
    { kind: "Page", label: "Tune your feed", href: "#/tune" },
    { kind: "Page", label: "How it works", href: "#/about" },
  ];
  if (!t) return [...pages, ...s.playlists.slice(0, 4).map((p) => ({ kind: "Playlist", label: p.name, sub: `${p.ids.length} videos`, href: `#/playlist/${p.id}` }))];
  const has = (x: string) => x.toLowerCase().includes(t);
  const out: Hit[] = pages.filter((p) => has(p.label));
  const yr = Number(t);
  if (/^\d{4}$/.test(t) && yr >= y0 && yr <= y1) out.unshift({ kind: "Year", label: `Time machine: ${yr}`, href: `#/year/${yr}` });
  for (const p of s.playlists) if (has(p.name)) out.push({ kind: "Playlist", label: p.name, sub: `${p.ids.length} videos`, href: `#/playlist/${p.id}` });
  for (const a of data.meta.areas) if (has(a.name)) out.push({ kind: "Area", label: a.name, href: `#/area/${a.id}` });
  for (const [id, c] of Object.entries(data.meta.cats)) if (has(c.name)) out.push({ kind: "Topic", label: c.name, sub: `${c.n} videos`, href: `#/topic/${id}` });
  const chans = new Map<string, number>();
  const vids: Hit[] = [];
  for (const v of data.videos) {
    if (has(v.ch)) chans.set(v.ch, (chans.get(v.ch) ?? 0) + 1);
    if (vids.length < 8 && has(v.t)) vids.push({ kind: "Video", label: v.t, sub: v.ch, href: `#/watch/${v.id}` });
  }
  [...chans.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).forEach(([ch, n]) => out.push({ kind: "Channel", label: ch, sub: `${n} videos`, href: `#/channel/${encodeURIComponent(ch)}` }));
  out.push(...vids);
  out.push({ kind: "Search", label: `Search by meaning for “${q.trim()}”`, href: `#/search?q=${encodeURIComponent(q.trim())}` });
  return out.slice(0, 40);
}

function Palette({ data, onClose }: { data: Data; onClose: () => void }) {
  const s = useStore();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const hits = useMemo(() => paletteHits(data, s, q), [data, s, q]);
  useEffect(() => setSel(0), [q]);
  const pick = (h?: Hit) => {
    if (!h) return;
    onClose();
    go(h.href);
  };
  return (
    <div className="dialog-wrap palette-wrap" onClick={onClose}>
      <div className="dialog palette" role="dialog" aria-modal="true" aria-label="Jump to" onClick={(e) => e.stopPropagation()}>
        <div className="palette-input">
          <Icon name="search" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Jump to a topic, year, channel, video or page"
            aria-label="Jump to"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((x) => Math.min(hits.length - 1, x + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setSel((x) => Math.max(0, x - 1)); }
              else if (e.key === "Enter") { e.preventDefault(); pick(hits[sel]); }
              else if (e.key === "Escape") onClose();
            }}
          />
          <kbd>esc</kbd>
        </div>
        <ul className="palette-hits" role="listbox">
          {hits.map((h, k) => (
            <li key={h.kind + h.href + k} role="option" aria-selected={k === sel} onMouseEnter={() => setSel(k)} onClick={() => pick(h)}>
              <span className="hit-kind">{h.kind}</span>
              <span className="hit-label">{h.label}</span>
              {h.sub && <span className="hit-sub">{h.sub}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
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
