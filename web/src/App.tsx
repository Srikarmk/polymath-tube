import { useEffect, useMemo, useRef, useState } from "react";
import { hnUrl, loadData, loadMentions, thumb, type Data, type Mention, type Video } from "./data";
import { byTopic, forYou, search, weightsFor, type Ranked } from "./rank";
import { actions, useStore } from "./store";

// ---------- routing (hash, so the site is fully static) ----------

type Route =
  | { page: "home" }
  | { page: "topic"; id: string }
  | { page: "area"; id: string }
  | { page: "watch"; id: string }
  | { page: "search"; q: string }
  | { page: "liked" | "later" | "history" | "threads" | "about" };

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
    case "liked":
    case "later":
    case "history":
    case "threads":
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

// ---------- app ----------

export default function App() {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState(false);
  const route = useRoute();
  useEffect(() => {
    loadData().then(setData, () => setErr(true));
  }, []);

  return (
    <div className="shell">
      <Header route={route} />
      <div className="body">
        {data && <Rail data={data} route={route} />}
        <main className="main" id="main">
          {err && <p className="empty">The video list didn't load. Check your connection and reload the page.</p>}
          {!data && !err && <p className="empty">Loading 6,427 videos…</p>}
          {data && <Page data={data} route={route} />}
        </main>
      </div>
      <footer className="foot">
        Picks, summaries and comments come from{" "}
        <a href="https://hackertube.org" target="_blank" rel="noreferrer">HackerTube</a>'s open data (ODC-By 1.0),
        built from the{" "}
        <a href="https://huggingface.co/datasets/open-index/hacker-news" target="_blank" rel="noreferrer">Hacker News archive</a>.
        <a href="#/about">How it works</a>
      </footer>
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
    case "threads":
      return <Threads data={data} />;
    case "about":
      return <About data={data} />;
  }
}

// ---------- chrome ----------

function Header({ route }: { route: Route }) {
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
    <header className="top">
      <a className="mark" href="#/" aria-label="Polymath Tube home">
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <rect width="32" height="32" rx="8" />
          <path d="M12 9.5v13l11-6.5z" />
        </svg>
        <span>Polymath Tube</span>
      </a>
      <form
        className="search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) go(`#/search?q=${encodeURIComponent(q.trim())}`);
        }}
      >
        <input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search talks, lectures, channels"
          aria-label="Search"
        />
        <kbd aria-hidden="true">/</kbd>
      </form>
      <nav className="lib" aria-label="Your library">
        <a href="#/liked" aria-current={route.page === "liked" ? "page" : undefined}>Liked</a>
        <a href="#/later" aria-current={route.page === "later" ? "page" : undefined}>Watch later</a>
        <a href="#/history" aria-current={route.page === "history" ? "page" : undefined}>History</a>
      </nav>
    </header>
  );
}

/** The area a route is in, so the rail can open it. */
function currentArea(data: Data, route: Route) {
  if (route.page === "area") return route.id;
  if (route.page === "topic") return data.meta.cats[route.id]?.area;
  if (route.page === "watch") {
    const v = data.byId.get(route.id);
    return v ? data.meta.cats[v.cats[0]]?.area : undefined;
  }
  return undefined;
}

function Rail({ data, route }: { data: Data; route: Route }) {
  const openArea = currentArea(data, route);
  return (
    <aside className="rail" aria-label="Topics">
      <a className="rail-home" href="#/" aria-current={route.page === "home" ? "page" : undefined}>
        For you
      </a>
      <a className="rail-tune" href="#/threads" aria-current={route.page === "threads" ? "page" : undefined}>
        Tune your feed
      </a>
      <p className="rail-head">Topics</p>
      <ul className="areas">
        {data.meta.areas.map((a) => {
          const open = a.id === openArea;
          return (
            <li key={a.id} className={open ? "open" : undefined}>
              <a href={`#/area/${a.id}`} aria-current={route.page === "area" && route.id === a.id ? "page" : undefined}>
                {a.name}
              </a>
              {open && (
                <ul className="cats">
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
    </aside>
  );
}

// ---------- cards ----------

function TopicLink({ data, id }: { data: Data; id: string }) {
  const c = data.meta.cats[id];
  if (!c) return null;
  return <a className="topic" href={`#/topic/${id}`}>{c.name}</a>;
}

function Card({ data, r }: { data: Data; r: Ranked }) {
  const { v } = r;
  return (
    <article className="card">
      <a href={`#/watch/${v.id}`} className="card-link">
        <div className="thumb">
          <img src={thumb(v.id)} alt="" loading="lazy" />
          <span className="kind">{v.type}</span>
        </div>
        <h3>{v.t}</h3>
      </a>
      <p className="channel">{v.ch}</p>
      <TopicLink data={data} id={v.cats[0]} />
      <p className="hover-why">{v.why}</p>
    </article>
  );
}

function Grid({ data, items, empty }: { data: Data; items: Ranked[]; empty?: React.ReactNode }) {
  if (!items.length) return <div className="empty">{empty}</div>;
  return (
    <div className="grid">
      {items.map((r) => (
        <Card key={r.v.id} data={data} r={r} />
      ))}
    </div>
  );
}

function useMore(step: number, resetKey: unknown) {
  const [n, setN] = useState(step);
  useEffect(() => setN(step), [resetKey, step]);
  return [n, () => setN((x) => x + step)] as const;
}

// ---------- pages ----------

function Home({ data }: { data: Data }) {
  const s = useStore();
  const [n, more] = useMore(36, null);
  const items = useMemo(() => forYou(data, s, n), [data, s, n]);
  return (
    <>
      <h1 className="sr-only">For you</h1>
      <Grid data={data} items={items} />
      <button className="more" onClick={more}>Show more</button>
    </>
  );
}

function Topic({ data, id }: { data: Data; id: string }) {
  const s = useStore();
  const [n, more] = useMore(36, id);
  const c = data.meta.cats[id];
  const items = useMemo(() => (c ? byTopic(data, s, (v) => v.cats.includes(id), n) : []), [data, s, id, n, c]);
  if (!c) return <p className="empty">No topic called “{id}”. <a href="#/">Back to For you</a></p>;
  const area = data.meta.areas.find((a) => a.id === c.area);
  return (
    <>
      <section className="intro">
        {area && <a className="crumb" href={`#/area/${area.id}`}>{area.name}</a>}
        <h1>{c.name}</h1>
        <p>{c.n} videos. HN's most lasting picks come first.</p>
      </section>
      <Grid data={data} items={items} />
      {items.length < c.n && <button className="more" onClick={more}>Show more</button>}
    </>
  );
}

function Area({ data, id }: { data: Data; id: string }) {
  const s = useStore();
  const [n, more] = useMore(36, id);
  const area = data.meta.areas.find((a) => a.id === id);
  const items = useMemo(
    () => (area ? byTopic(data, s, (v) => data.meta.cats[v.cats[0]]?.area === id, n) : []),
    [data, s, id, n, area],
  );
  if (!area) return <p className="empty">No area called “{id}”. <a href="#/">Back to For you</a></p>;
  return (
    <>
      <section className="intro">
        <h1>{area.name}</h1>
        <ul className="chips">
          {area.cats.map((c) => (
            <li key={c}>
              <a href={`#/topic/${c}`}>{data.meta.cats[c].name}</a>
            </li>
          ))}
        </ul>
      </section>
      <Grid data={data} items={items} />
      <button className="more" onClick={more}>Show more</button>
    </>
  );
}

function Search({ data, q }: { data: Data; q: string }) {
  const items = useMemo(() => search(data, q, 60), [data, q]);
  return (
    <>
      <section className="intro">
        <h1>“{q}”</h1>
        <p>{items.length ? `${items.length === 60 ? "Top 60" : items.length} matches in titles, channels, topics and summaries.` : ""}</p>
      </section>
      <Grid data={data} items={items} empty={<>Nothing matches “{q}”. Try a broader word, or browse a topic on the left.</>} />
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
    liked: "Nothing liked yet. Liking a video moves similar ones up your feed.",
    later: "Nothing saved. Use Watch later on any video page to keep it here.",
    history: "No history yet. Videos you open show up here.",
  }[which];
  return (
    <>
      <section className="intro row">
        <h1>{title}</h1>
        {which === "history" && items.length > 0 && (
          <button className="ghost" onClick={actions.clearHistory}>Clear history</button>
        )}
      </section>
      <Grid data={data} items={items} empty={empty} />
    </>
  );
}

function Threads({ data }: { data: Data }) {
  const s = useStore();
  const w = weightsFor(data, s);
  return (
    <>
      <section className="intro row">
        <div>
          <h1>Tune your feed</h1>
          <p>Turn an interest up and its videos rise in For you; set it to zero to drop it. Other topics still fill the rest of the feed.</p>
        </div>
        <button className="ghost" onClick={actions.resetWeights}>Reset</button>
      </section>
      <ul className="tune">
        {data.meta.facets.map((f, j) => (
          <li key={f.id}>
            <div>
              <span className="tune-name">{f.short}</span>
            </div>
            <input
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={w[j]}
              aria-label={`Weight for ${f.short}`}
              onChange={(e) => actions.setWeight(f.id, Number(e.target.value))}
            />
            <output>{w[j].toFixed(1)}</output>
          </li>
        ))}
      </ul>
      {s.hidden.length > 0 && (
        <section className="hidden-list">
          <h2>Marked not for me</h2>
          <ul>
            {s.hidden.map((id) => {
              const v = data.byId.get(id);
              return v ? (
                <li key={id}>
                  <a href={`#/watch/${id}`}>{v.t}</a>
                  <button className="ghost small" onClick={() => actions.unhide(id)}>Undo</button>
                </li>
              ) : null;
            })}
          </ul>
        </section>
      )}
    </>
  );
}

function Watch({ data, id }: { data: Data; id: string }) {
  const s = useStore();
  const v = data.byId.get(id);
  const [mentions, setMentions] = useState<Mention[] | null>(null);
  useEffect(() => {
    if (v) actions.watched(v.id);
    setMentions(null);
    loadMentions().then((m) => setMentions(m[id] ?? []), () => setMentions([]));
  }, [id]);

  if (!v) return <p className="empty">This video isn't in the list. <a href="#/">Back to For you</a></p>;
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
        <h1 className="watch-title">{v.t}</h1>
        <div className="watch-bar">
          <p className="channel">{v.ch}</p>
          <div className="actions">
            <button aria-pressed={liked} onClick={() => actions.toggleLike(v.id)}>{liked ? "Liked" : "Like"}</button>
            <button aria-pressed={later} onClick={() => actions.toggleLater(v.id)}>{later ? "Saved" : "Watch later"}</button>
            <button
              aria-pressed={hidden}
              className="quiet"
              onClick={() => (hidden ? actions.unhide(v.id) : actions.hide(v.id))}
            >
              {hidden ? "Hidden from feed" : "Not for me"}
            </button>
          </div>
        </div>

        <section className="why-here">
          <ul className="chips">
            {v.cats.map((c) => (
              <li key={c}>
                <TopicLink data={data} id={c} />
              </li>
            ))}
          </ul>
          <p className="summary">{v.sum}</p>
          <p className="hn-why">{v.why}</p>
          <p className="stats">
            Recommended by {v.recs} {v.recs === 1 ? "person" : "different people"} on HN,{" "}
            {v.years[0] === v.years[1] ? `in ${v.years[0]}` : `from ${v.years[0]} to ${v.years[1]}`}.
          </p>
        </section>

        <section className="comments">
          <h2>What Hacker News said</h2>
          {mentions === null && <p className="muted">Loading comments…</p>}
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
        </section>
      </div>

      <aside className="watch-side">
        <h2>Similar</h2>
        <SideList items={similar.slice(0, 8)} />
        {also.length > 0 && (
          <>
            <h2>The same HN people also recommend</h2>
            <SideList items={also.slice(0, 6)} />
          </>
        )}
      </aside>
    </div>
  );
}

function SideList({ items }: { items: Video[] }) {
  return (
    <ul className="side">
      {items.map((v) => (
        <li key={v.id}>
          <a href={`#/watch/${v.id}`}>
            <img src={thumb(v.id)} alt="" loading="lazy" />
            <span>
              <strong>{v.t}</strong>
              <em>{v.ch}</em>
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
    <article className="about">
      <h1>How this works</h1>
      <p>
        <a href="https://hackertube.org" target="_blank" rel="noreferrer">HackerTube</a> read every Hacker News comment
        from 2007 to 2026 and kept the YouTube videos that at least three different people recommended, in at least
        three different months. It published that list as open data, and this site is built on it.
      </p>
      <p>
        For you starts from {data.meta.facets.length} interests, each a short description embedded with the same model
        HackerTube used (bge-small). Every video is scored against every interest, plus a share of how long HN has kept
        recommending it. The feed then spreads out: a second video from the same topic or area costs points, and the
        first one from a new area earns some, so For you ranges across all 16 areas. Liking a video brings its
        neighbours forward and “Not for me” pushes them back. You can turn interests up or down on the{" "}
        <a href="#/threads">Tune your feed</a> page.
      </p>
      <p>
        Likes, Watch later, history and interest weights stay in this browser. Nothing is sent anywhere. Videos play
        through YouTube's privacy-enhanced embed.
      </p>
      <p className="muted">Data exported {data.meta.generated}. {data.videos.length.toLocaleString()} videos after removing duplicate uploads.</p>
    </article>
  );
}
