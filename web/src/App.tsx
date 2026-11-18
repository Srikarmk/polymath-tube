import { useEffect, useMemo, useRef, useState } from "react";
import { hnUrl, loadData, loadMentions, thumb, type Data, type Mention, type Video } from "./data";
import {
  byTopic,
  countWhere,
  forYou,
  search,
  typeMatch,
  weightsFor,
  TYPE_GROUPS,
  type Ranked,
  type TopicSort,
} from "./rank";
import { actions, useStore } from "./store";

// ---------- routing (hash, so the site is fully static) ----------

type Route =
  | { page: "home" }
  | { page: "topic"; id: string }
  | { page: "area"; id: string }
  | { page: "watch"; id: string }
  | { page: "search"; q: string }
  | { page: "liked" | "later" | "history" | "tune" | "about" };

function parse(hash: string): Route {
  const [path, qs] = hash.replace(/^#\/?/, "").split("?");
  const parts = path.split("/").filter(Boolean);
  const params = new URLSearchParams(qs ?? "");
  switch (parts[0]) {
    case "watch":
      return { page: "watch", id: parts[1] };
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
};

function Icon({ name, size = 16 }: { name: keyof typeof paths; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}

function Mark() {
  return (
    <svg className="mark-glyph" viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="6" />
      <path d="M9.5 7v10l8-5z" />
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

// ---------- app ----------

export default function App() {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState(false);
  const [menu, setMenu] = useState(false);
  const route = useRoute();
  const load = () => {
    setErr(false);
    loadData().then(setData, () => setErr(true));
  };
  useEffect(load, []);
  useEffect(() => setMenu(false), [route]);

  return (
    <div className="shell">
      <aside className={menu ? "side open" : "side"} aria-label="Navigation">
        <div className="side-head">
          <a className="mark" href="#/" aria-label="Polymath Tube, For you">
            <Mark />
            <span>Polymath Tube</span>
          </a>
          <button className="icon-btn side-close" onClick={() => setMenu(false)} aria-label="Close menu">
            <Icon name="x" />
          </button>
        </div>
        <Nav data={data} route={route} />
      </aside>

      <header className="top">
        <button className="icon-btn menu-btn" onClick={() => setMenu(true)} aria-label="Open menu">
          <Icon name="menu" />
        </button>
        <a className="mark top-mark" href="#/" aria-label="Polymath Tube, For you">
          <Mark />
        </a>
        <SearchBox route={route} />
        <p className="stamp">
          {data ? `${fmt(data.videos.length)} videos` : ""} <span>HackerTube data, Oct 31, 2026</span>
        </p>
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
          Comments remain the work of their authors. <a href="#/about">How it works</a>
        </footer>
      </main>
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
      return <Watch data={data} id={route.id} />;
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
  }, [route.page]);
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
        placeholder="Search talks, lectures, channels, topics"
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

function Nav({ data, route }: { data: Data | null; route: Route }) {
  const s = useStore();
  const cur = (p: string) => (route.page === p ? "page" : undefined);
  const openArea = data ? currentArea(data, route) : undefined;
  return (
    <nav className="nav">
      <ul className="nav-main">
        <li><a href="#/" aria-current={cur("home")}><Icon name="home" />For you</a></li>
        <li>
          <a href="#/later" aria-current={cur("later")}>
            <Icon name="clock" />Watch later{s.later.length > 0 && <span className="count num">{s.later.length}</span>}
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
      </ul>
    </nav>
  );
}

function Skeleton() {
  return (
    <div className="skeleton" aria-label="Loading videos">
      <div className="bar" style={{ width: 120, height: 24 }} />
      <div className="bar" style={{ width: 360, height: 14, marginTop: 10 }} />
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
        onClick={() => actions.toggleLater(v.id)}
        aria-label={later ? `Remove ${v.t} from Watch later` : `Save ${v.t} to Watch later`}
        title={later ? "Saved to Watch later" : "Watch later"}
      >
        <Icon name="clock" />
      </button>
      <button className="chip-btn" onClick={() => actions.hide(v.id)} aria-label={`Not for me: hide ${v.t}`} title="Not for me">
        <Icon name="x" />
      </button>
    </div>
  );
}

function Card({ data, v }: { data: Data; v: Video }) {
  return (
    <article className="card">
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
    <section className="lead" aria-label="Top pick">
      <div className="lead-media card">
        <a href={`#/watch/${v.id}`} aria-label={`Watch ${v.t}`}>
          <img src={thumb(v.id)} alt="" />
        </a>
        <span className="kind">{v.type}</span>
        <CardActions v={v} />
      </div>
      <div className="lead-body">
        <h2 className="lead-title"><a href={`#/watch/${v.id}`}>{v.t}</a></h2>
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
            Recommended by <strong className="num">{v.recs}</strong> {v.recs === 1 ? "person" : "people"} in{" "}
            <strong className="num">{v.rm}</strong> different {v.rm === 1 ? "month" : "months"}
          </p>
          <YearStrip data={data} v={v} big />
        </div>
        <div className="lead-actions">
          <a className="btn primary" href={`#/watch/${v.id}`}>Watch</a>
          <button className="btn" aria-pressed={later} onClick={() => actions.toggleLater(v.id)}>
            <Icon name="clock" />{later ? "Saved" : "Watch later"}
          </button>
        </div>
      </div>
    </section>
  );
}

function Feed({ data, items, lead = false, empty }: { data: Data; items: Ranked[]; lead?: boolean; empty?: React.ReactNode }) {
  if (!items.length)
    return (
      <div className="frame-msg">
        <p>{empty}</p>
      </div>
    );
  const rest = lead ? items.slice(1) : items;
  return (
    <>
      {lead && <Lead data={data} v={items[0].v} />}
      <div className="feed">
        {rest.map((r) => (
          <Card key={r.v.id} data={data} v={r.v} />
        ))}
      </div>
    </>
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
            {n !== undefined && <span className="tab-n num">{fmt(n)}</span>}
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
  return (
    <>
      <div className="title-row">
        <div>
          <h1>For you</h1>
          <p className="sub">
            {items.length} picks across {topics} topics in {areas} of 16 areas
            {s.liked.length > 0 ? `, steered by ${s.liked.length} ${s.liked.length === 1 ? "like" : "likes"}` : ""}.
            {s.shuffle > 0 ? " Shuffled." : " Today's mix."}
          </p>
        </div>
        <button className="btn primary" onClick={actions.shuffle}>
          <Icon name="shuffle" />Shuffle
        </button>
      </div>
      <TypeTabs value={s.type} onChange={actions.setType} />
      <Feed data={data} items={items} lead empty="No videos of this kind left. Choose All, or undo a few Not for me picks on the Tune page." />
      {items.length >= n && <button className="btn more" onClick={more}>Show more</button>}
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
          <p className="sub"><span className="num">{fmt(counts.all)}</span> videos HN recommended</p>
        </div>
        <SortSwitch value={sort} onChange={setSort} />
      </div>
      {extra}
      <TypeTabs value={type} onChange={setType} counts={counts} />
      <Feed data={data} items={items} empty="Nothing here yet." />
      {items.length < total && (
        <button className="btn more" onClick={more}>
          Show more <span className="muted num">{fmt(items.length)} of {fmt(total)}</span>
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
                {data.meta.cats[c].name} <span className="num">{data.meta.cats[c].n}</span>
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

function Search({ data, q }: { data: Data; q: string }) {
  const items = useMemo(() => search(data, q, 60), [data, q]);
  return (
    <>
      <div className="title-row">
        <div>
          <h1>Results for “{q}”</h1>
          <p className="sub">
            {items.length === 60 ? "Top 60 matches" : `${items.length} ${items.length === 1 ? "match" : "matches"}`} in titles,
            channels, topics and summaries
          </p>
        </div>
      </div>
      <Feed data={data} items={items} empty={<>Nothing matches “{q}”. Try a broader word, or browse a topic from the menu.</>} />
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
    later: "Nothing saved yet. The clock on any video saves it here.",
    history: "No history yet. Videos you open show up here, newest first.",
  }[which];
  return (
    <>
      <div className="title-row">
        <div>
          <h1>{title}</h1>
          <p className="sub"><span className="num">{items.length}</span> {items.length === 1 ? "video" : "videos"}</p>
        </div>
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
        <h2 className="panel-title">Interests</h2>
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
              <output htmlFor={`w-${f.id}`} className="num">{w[j].toFixed(1)}</output>
            </li>
          ))}
        </ul>
      </section>
      <section className="panel">
        <h2 className="panel-title">Not for me</h2>
        {s.hidden.length === 0 ? (
          <p className="muted">Nothing hidden. The cross on a video hides it and pushes similar ones down.</p>
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

function Watch({ data, id }: { data: Data; id: string }) {
  const s = useStore();
  const v = data.byId.get(id);
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

  if (!v) return <NotFound what="video" />;
  const liked = s.liked.includes(v.id);
  const later = s.later.includes(v.id);
  const hidden = s.hidden.includes(v.id);
  const similar = v.sim.map(([sid]) => data.byId.get(sid)).filter((x): x is Video => !!x && !s.hidden.includes(x.id));
  const also = v.rel.map((rid) => data.byId.get(rid)).filter((x): x is Video => !!x);

  return (
    <div className="watch">
      <div className="watch-main">
        <div className="player">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${v.id}?rel=0`}
            title={v.t}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
        <div className="title-row watch-head">
          <div>
            <h1>{v.t}</h1>
            <p className="sub">{v.ch} <span className="kind-inline">{v.type}</span></p>
          </div>
          <div className="actions">
            <button className="btn" aria-pressed={liked} onClick={() => actions.toggleLike(v.id)}>
              <Icon name="heart" />{liked ? "Liked" : "Like"}
            </button>
            <button className="btn" aria-pressed={later} onClick={() => actions.toggleLater(v.id)}>
              <Icon name="clock" />{later ? "Saved" : "Watch later"}
            </button>
            <button className="btn quiet" aria-pressed={hidden} onClick={() => (hidden ? actions.unhide(v.id) : actions.hide(v.id))}>
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
          <p className="muted">{v.why}</p>
        </section>

        <section className="panel hn">
          <h2 className="panel-title">On Hacker News</h2>
          <p className="hn-line">
            Recommended by <strong className="num">{v.recs}</strong> {v.recs === 1 ? "person" : "people"} in{" "}
            <strong className="num">{v.rm}</strong> different {v.rm === 1 ? "month" : "months"},{" "}
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
            {!failed && mentions === null && <p className="muted">Loading comments…</p>}
            {mentions && mentions.length === 0 && <p className="muted">No recommending comments were kept for this one.</p>}
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
        <h2 className="side-title">Similar</h2>
        <SideList data={data} items={similar.slice(0, 8)} />
        {also.length > 0 && (
          <>
            <h2 className="side-title">The same HN people also recommend</h2>
            <SideList data={data} items={also.slice(0, 6)} />
          </>
        )}
      </aside>
    </div>
  );
}

function SideList({ data, items }: { data: Data; items: Video[] }) {
  return (
    <ul className="side-list">
      {items.map((v) => (
        <li key={v.id}>
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
          Liking a video brings its neighbours forward, and so do the videos its HN recommenders also recommended. “Not
          for me” pushes its neighbours back. Shuffle deals a new mix. You can turn interests up or down on{" "}
          <a href="#/tune">Tune your feed</a>.
        </p>
        <p>
          The orange strip on each video marks the years, from 2007 to 2026, in which HN commenters recommended it. A
          brighter cell is a year with more recommending comments among the up to 20 the export keeps per video.
        </p>
        <p>
          Likes, Watch later, history and interest weights stay in this browser. Nothing is sent anywhere. Videos play
          through YouTube's privacy-enhanced embed.
        </p>
      </article>
    </>
  );
}
