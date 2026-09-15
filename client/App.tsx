import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Download,
  Film,
  Heart,
  Image as ImageIcon,
  LayoutGrid,
  LockKeyhole,
  Menu,
  Moon,
  Play,
  Search,
  ShieldCheck,
  Sun,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type PointerEvent, type ReactNode } from "react";

type MediaItem = {
  id: string;
  name: string;
  kind: "image" | "video";
  size: number;
  date: string | null;
  url: string;
  previewUrl: string;
  fileExtension: string;
};

type Report = {
  generatedAt: string;
  archiveFilesDiscovered: number;
  imagesImported: number;
  videosImported: number;
  unsupportedFiles: number;
  duplicateGroups: string[][];
  failedImports: number;
  missingPreviews: number;
  finalMediaItems: number;
  originalBytes: number;
  items: MediaItem[];
};

type View = "home" | "gallery" | "report";
type Filter = "all" | "image" | "video" | "favorites";

const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" });
const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });

function formatDate(date: string | null) {
  return date ? dateFormatter.format(new Date(date)) : "No date";
}

function monthLabel(date: string | null) {
  return date ? monthFormatter.format(new Date(date)) : "No date";
}

function formatBytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function displayName(name: string) {
  return name.replace(/\.[^.]+$/, "").replaceAll("_", " ");
}

function imageItems(items: MediaItem[]) {
  return items.filter((item) => item.kind === "image");
}

const riseIn = {
  hidden: { opacity: 0, y: 22, filter: "blur(8px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.72, ease: [0.22, 1, 0.36, 1] } },
};

const pageIn = {
  initial: { opacity: 0, y: 24, filter: "blur(10px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -18, filter: "blur(8px)" },
  transition: { duration: 0.62, ease: [0.22, 1, 0.36, 1] },
};

function App() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [view, setView] = useState<View>("home");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "name">("newest");
  const [favorites, setFavorites] = useState<string[]>(() => JSON.parse(localStorage.getItem("little-universe-favorites") || "[]"));
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [isDark, setIsDark] = useState(() => localStorage.getItem("little-universe-theme") === "dark");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");

  const refreshLibrary = async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const [mediaResponse, reportResponse] = await Promise.all([
        fetch("/api/media"),
        fetch("/api/report"),
      ]);
      if (!mediaResponse.ok || !reportResponse.ok) throw new Error("The gallery could not be refreshed.");
      const [media, importReport] = await Promise.all([mediaResponse.json(), reportResponse.json()]);
      setItems(media.items || []);
      setReport(importReport);
    } catch {
      setLoadError("I couldn't refresh Laiba’s photos. Try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetch("/api/auth/status")
      .then((response) => response.json())
      .then((status) => {
        setAuthenticated(Boolean(status.authenticated));
        if (!status.authenticated) {
          setIsLoading(false);
          return null;
        }
        return Promise.all([
          fetch("/api/media").then((response) => response.json()),
          fetch("/api/report").then((response) => response.json()),
        ]);
      })
      .then((result) => {
        if (!result) return;
        const [media, importReport] = result;
        setItems(media.items || []);
        setReport(importReport);
      })
      .catch(() => setLoadError("I couldn't open Laiba’s photos. Try refreshing."))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    localStorage.setItem("little-universe-favorites", JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? "dark" : "light";
    localStorage.setItem("little-universe-theme", isDark ? "dark" : "light");
  }, [isDark]);

  const filteredItems = useMemo(() => {
    const result = items.filter((item) => {
      const matchesQuery = !query || item.name.toLowerCase().includes(query.toLowerCase());
      const matchesFilter = filter === "all"
        || filter === item.kind
        || (filter === "favorites" && favorites.includes(item.id));
      return matchesQuery && matchesFilter;
    });
    return [...result].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      const left = a.date ? new Date(a.date).valueOf() : 0;
      const right = b.date ? new Date(b.date).valueOf() : 0;
      return sort === "newest" ? right - left : left - right;
    });
  }, [favorites, filter, items, query, sort]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (viewerIndex === null || filteredItems.length === 0) return;
      if (event.key === "Escape") setViewerIndex(null);
      if (event.key === "ArrowLeft") setViewerIndex((index) => index === null ? null : (index - 1 + filteredItems.length) % filteredItems.length);
      if (event.key === "ArrowRight") setViewerIndex((index) => index === null ? null : (index + 1) % filteredItems.length);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filteredItems.length, viewerIndex]);

  const toggleFavorite = (id: string) => {
    setFavorites((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const openGallery = (nextFilter: Filter = "all") => {
    setFilter(nextFilter);
    setView("gallery");
    setIsMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const featured = items.find((item) => item.name.startsWith("laiba picture 1.")) || imageItems(items)[0];
  const collage = imageItems(items).slice(1, 4);

  if (authenticated === null) return <BootScreen />;
  if (authenticated === false) return <AccessGate onUnlocked={() => { setAuthenticated(true); setIsLoading(true); window.location.reload(); }} />;

  return (
    <div className="app-shell">
      <header className="site-header">
        <button className="brand" onClick={() => setView("home")} aria-label="Go to home">
          <span className="brand-mark"><Heart size={14} fill="currentColor" /></span>
          <span><strong>Himel + Laiba</strong><em>for Laiba</em></span>
        </button>
        <nav className={isMenuOpen ? "main-nav is-open" : "main-nav"} aria-label="Main navigation">
          <button className={view === "home" ? "nav-link active" : "nav-link"} onClick={() => { setView("home"); setIsMenuOpen(false); }}>Home</button>
          <button className={view === "gallery" && filter === "all" ? "nav-link active" : "nav-link"} onClick={() => openGallery()}>Gallery</button>
          <button className={view === "gallery" && filter === "favorites" ? "nav-link active" : "nav-link"} onClick={() => openGallery("favorites")}>Favorites <span className="nav-count">{favorites.length}</span></button>
          <button className={view === "report" ? "nav-link active" : "nav-link"} onClick={() => { setView("report"); setIsMenuOpen(false); }}>Import report</button>
        </nav>
        <div className="header-actions">
          <button className="icon-button" onClick={() => setIsDark((value) => !value)} aria-label={isDark ? "Use light theme" : "Use dark theme"}>
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <div className="private-pill"><span className="status-dot" /> Private</div>
          <button className="menu-button icon-button" onClick={() => setIsMenuOpen((value) => !value)} aria-label="Toggle navigation"><Menu size={18} /></button>
        </div>
      </header>

      <main>
        <AnimatePresence mode="wait">
          {view === "home" && (
            <motion.div key="home" {...pageIn}>
              <HomeView items={items} featured={featured} collage={collage} report={report} onExplore={() => openGallery()} onIntegrity={() => setView("report")} />
            </motion.div>
          )}
          {view === "gallery" && (
            <motion.div key="gallery" {...pageIn}>
              <GalleryView
                items={filteredItems}
                total={items.length}
                filter={filter}
                query={query}
                sort={sort}
                favorites={favorites}
                isLoading={isLoading}
                loadError={loadError}
                onFilter={setFilter}
                onQuery={setQuery}
                onSort={setSort}
                onOpen={(index) => setViewerIndex(index)}
                onToggleFavorite={toggleFavorite}
                selectedIds={selectedIds}
                isUploading={isUploading}
                uploadStatus={uploadStatus}
                onToggleSelection={(id) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])}
                onToggleAll={() => setSelectedIds((current) => {
                  const visibleIds = filteredItems.map((item) => item.id);
                  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => current.includes(id));
                  return allVisibleSelected ? current.filter((id) => !visibleIds.includes(id)) : [...new Set([...current, ...visibleIds])];
                })}
                onClearSelection={() => setSelectedIds([])}
                onUpload={async (event) => {
                  const files = Array.from(event.target.files || []);
                  if (files.length === 0) return;
                  setIsUploading(true);
                  setUploadStatus(`Adding 0 of ${files.length}`);
                  setLoadError("");
                  let added = 0;
                  try {
                    for (const file of files) {
                      const response = await fetch("/api/media/upload", {
                        method: "POST",
                        headers: {
                          "Content-Type": file.type || "application/octet-stream",
                          "X-Filename": encodeURIComponent(file.name),
                        },
                        body: file,
                      });
                      if (!response.ok) {
                        const result = await response.json().catch(() => null);
                        throw new Error(result?.error || `Could not add ${file.name}.`);
                      }
                      added += 1;
                      setUploadStatus(`Adding ${added} of ${files.length}`);
                    }
                    await refreshLibrary();
                    setUploadStatus(`${added} ${added === 1 ? "file" : "files"} added`);
                  } catch (error) {
                    setLoadError(error instanceof Error ? error.message : "Some files could not be added.");
                    setUploadStatus(added ? `${added} added` : "");
                    await refreshLibrary();
                  } finally {
                    setIsUploading(false);
                    event.target.value = "";
                  }
                }}
                onDownloadSelected={() => {
                  if (selectedIds.length === 0) return;
                  const params = new URLSearchParams();
                  selectedIds.forEach((id) => params.append("file", id));
                  window.location.assign(`/api/media/download?${params.toString()}`);
                }}
                onDeleteSelected={async () => {
                  if (selectedIds.length === 0 || !window.confirm(`Delete ${selectedIds.length} selected ${selectedIds.length === 1 ? "file" : "files"}? This cannot be undone.`)) return;
                  const response = await fetch("/api/media", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ files: selectedIds }),
                  });
                  if (!response.ok) {
                    const result = await response.json().catch(() => null);
                    setLoadError(result?.error || "The selected files could not be deleted.");
                    return;
                  }
                  setFavorites((current) => current.filter((id) => !selectedIds.includes(id)));
                  setSelectedIds([]);
                  await refreshLibrary();
                }}
              />
            </motion.div>
          )}
          {view === "report" && (
            <motion.div key="report" {...pageIn}>
              <IntegrityView report={report} onBack={() => setView("home")} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="site-footer">
        <span className="footer-mark"><Heart size={13} fill="currentColor" /></span>
        <p>For my beautiful Laiba</p>
        <span>Always yours</span>
      </footer>

      <AnimatePresence>
        {viewerIndex !== null && filteredItems[viewerIndex] && (
          <MediaViewer
            item={filteredItems[viewerIndex]}
            isFavorite={favorites.includes(filteredItems[viewerIndex].id)}
            onClose={() => setViewerIndex(null)}
            onPrevious={() => setViewerIndex((index) => index === null ? null : (index - 1 + filteredItems.length) % filteredItems.length)}
            onNext={() => setViewerIndex((index) => index === null ? null : (index + 1) % filteredItems.length)}
            onToggleFavorite={() => toggleFavorite(filteredItems[viewerIndex].id)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function BootScreen() {
  return (
    <div className="boot-screen">
      <div className="boot-mark"><Heart size={15} fill="currentColor" /></div>
      <div className="boot-skeleton" />
      <p>Opening Laiba’s photos</p>
    </div>
  );
}

function AccessGate({ onUnlocked }: { onUnlocked: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const unlock = async (event: FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/auth/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "That code did not work.");
      onUnlocked();
    } catch (unlockError) {
      setError(unlockError instanceof Error ? unlockError.message : "That code did not work.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="access-gate">
      <div className="access-card">
        <div className="access-mark"><LockKeyhole size={20} /></div>
        <span className="section-kicker">For my beautiful Laiba</span>
        <h1>Just for you</h1>
        <p>Enter our code to open your photos and videos.</p>
        <form onSubmit={unlock}>
          <label className="access-input">
            <LockKeyhole size={14} />
            <input type="password" value={code} onChange={(event) => setCode(event.target.value)} placeholder="Access code" autoFocus />
            <button type="submit" disabled={isSubmitting}>{isSubmitting ? "Opening" : "Open"}</button>
          </label>
          {error && <div className="access-error">{error}</div>}
        </form>
        <span className="access-footnote"><ShieldCheck size={13} /> Just between us</span>
      </div>
    </div>
  );
}

function HomeView({ items, featured, collage, report, onExplore, onIntegrity }: {
  items: MediaItem[];
  featured?: MediaItem;
  collage: MediaItem[];
  report: Report | null;
  onExplore: () => void;
  onIntegrity: () => void;
}) {
  const recent = items.slice(0, 3);
  const total = report?.finalMediaItems ?? items.length;
  const photos = report?.imagesImported ?? imageItems(items).length;
  const videos = report?.videosImported ?? items.filter((item) => item.kind === "video").length;

  return (
    <div className="home-page">
      <section className="hero-section page-width">
        <motion.div className="hero-copy" initial="hidden" animate="visible" transition={{ staggerChildren: 0.11, delayChildren: 0.12 }}>
          <motion.div className="eyebrow" variants={riseIn}>For my beautiful Laiba</motion.div>
          <motion.h1 variants={riseIn}>My beautiful<br /><span>Laiba.</span></motion.h1>
          <motion.p className="hero-subtitle" variants={riseIn}>Every photo here makes me think of you.</motion.p>
          <motion.div className="hero-actions" variants={riseIn}>
            <button className="primary-button" onClick={onExplore}>Open gallery <ArrowRight size={16} /></button>
            <button className="text-button" onClick={onIntegrity}><ShieldCheck size={15} /> See import report</button>
          </motion.div>
          <motion.div className="hero-meta" variants={riseIn}>
            <div><strong>{total || "—"}</strong><span>items</span></div>
            <div className="meta-divider" />
            <div><strong>{photos || "—"}</strong><span>photos</span></div>
            <div className="meta-divider" />
            <div><strong>{videos || "—"}</strong><span>videos</span></div>
          </motion.div>
        </motion.div>
        <HeroVisual featured={featured} collage={collage} />
      </section>

      <section className="featured-section page-width">
        <div className="section-heading">
          <div><span className="section-kicker">More of you</span><h2>Laiba</h2></div>
          <button className="text-button" onClick={onExplore}>View gallery <ArrowRight size={15} /></button>
        </div>
        {recent.length > 0 ? (
          <motion.div className="recent-grid" initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.22 }} transition={{ staggerChildren: 0.12 }}>
            {recent.map((item, index) => (
              <motion.div key={item.id} variants={riseIn}>
                <HomeMemoryCard item={item} featured={index === 0} />
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <div className="empty-state"><h2>No media yet</h2><p>Imported photos will show here.</p></div>
        )}
      </section>

      <motion.section className="archive-note page-width" initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.35 }} transition={{ staggerChildren: 0.14 }}>
        <motion.div variants={riseIn}>
          <span className="section-kicker">A little note</span>
          <h2>For my beautiful<br />Laiba.</h2>
        </motion.div>
        <motion.div className="archive-note-copy" variants={riseIn}>
          <p>I made this place for you. I can search, save favorites, and open the originals whenever I miss you.</p>
          <button className="text-button" onClick={onIntegrity}>Check the import report <ArrowRight size={15} /></button>
        </motion.div>
      </motion.section>
    </div>
  );
}

function HeroVisual({ featured, collage }: { featured?: MediaItem; collage: MediaItem[] }) {
  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
    const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
    event.currentTarget.style.setProperty("--pointer-x", x.toFixed(3));
    event.currentTarget.style.setProperty("--pointer-y", y.toFixed(3));
  };

  const resetPointer = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.style.setProperty("--pointer-x", "0");
    event.currentTarget.style.setProperty("--pointer-y", "0");
  };

  return (
    <div className="hero-visual" aria-label="A selection of Laiba’s photos" onPointerMove={handlePointerMove} onPointerLeave={resetPointer}>
      {featured && (
        <motion.div className="hero-featured-photo" initial={{ opacity: 0, rotate: 8, y: 30, scale: 0.94 }} animate={{ opacity: 1, rotate: 2, y: 0, scale: 1 }} transition={{ duration: 1.05, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}>
          <div className="hero-featured-inner">
            <img src={featured.previewUrl} alt={displayName(featured.name)} />
            <div className="photo-caption"><span>{formatDate(featured.date)}</span><Heart size={14} fill="currentColor" /></div>
          </div>
        </motion.div>
      )}
      {collage.map((item, index) => (
        <div key={item.id} className={`hero-small-photo small-${index + 1}`} style={{ animationDelay: `${0.48 + index * 0.12}s` }}>
          <img src={item.previewUrl} alt={displayName(item.name)} />
        </div>
      ))}
      <div className="hero-index">01 / for Laiba</div>
      <span className="hero-orbit orbit-one" />
      <span className="hero-orbit orbit-two" />
    </div>
  );
}

function HomeMemoryCard({ item, featured }: { item: MediaItem; featured?: boolean }) {
  return (
    <div className={featured ? "home-memory-card featured" : "home-memory-card"}>
      <div className="home-card-media">
        {item.previewUrl ? <img src={item.previewUrl} loading="lazy" alt={displayName(item.name)} /> : <div className="video-fallback"><Film size={24} /><span>Video</span></div>}
        {item.kind === "video" && <span className="video-chip"><Play size={10} fill="currentColor" /> video</span>}
      </div>
      <div className="home-card-meta"><span>{formatDate(item.date)}</span><Heart size={13} /></div>
    </div>
  );
}

function GalleryView({ items, total, filter, query, sort, favorites, isLoading, loadError, onFilter, onQuery, onSort, onOpen, onToggleFavorite, selectedIds, isUploading, uploadStatus, onToggleSelection, onToggleAll, onClearSelection, onUpload, onDownloadSelected, onDeleteSelected }: {
  items: MediaItem[];
  total: number;
  filter: Filter;
  query: string;
  sort: "newest" | "oldest" | "name";
  favorites: string[];
  isLoading: boolean;
  loadError: string;
  onFilter: (value: Filter) => void;
  onQuery: (value: string) => void;
  onSort: (value: "newest" | "oldest" | "name") => void;
  onOpen: (index: number) => void;
  onToggleFavorite: (id: string) => void;
  selectedIds: string[];
  isUploading: boolean;
  uploadStatus: string;
  onToggleSelection: (id: string) => void;
  onToggleAll: () => void;
  onClearSelection: () => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onDownloadSelected: () => void;
  onDeleteSelected: () => void;
}) {
  const groups = useMemo(() => {
    const output: { label: string; items: MediaItem[] }[] = [];
    items.forEach((item) => {
      const label = monthLabel(item.date);
      const group = output.find((entry) => entry.label === label);
      if (group) group.items.push(item);
      else output.push({ label, items: [item] });
    });
    return output;
  }, [items]);
  const allVisibleSelected = items.length > 0 && items.every((item) => selectedIds.includes(item.id));

  return (
    <div className="gallery-page page-width">
      <div className="gallery-topline">
        <div><span className="section-kicker">Laiba’s photos</span><h1>Gallery <span>{total} items</span></h1><p>Everything I want to keep close.</p></div>
        <div className="gallery-top-actions">
          <label className="soft-button upload-button">
            <Upload size={15} /> {isUploading ? "Adding…" : "Add photos"}
            <input type="file" accept="image/*,video/*" multiple disabled={isUploading} onChange={onUpload} />
          </label>
          <button className="soft-button" onClick={onToggleAll} disabled={items.length === 0}>{allVisibleSelected ? "Clear selection" : "Select all"}</button>
        </div>
      </div>
      <div className="gallery-toolbar">
        <div className="filter-tabs" role="tablist">
          {(["all", "image", "video", "favorites"] as Filter[]).map((value) => (
            <button key={value} className={filter === value ? "filter-tab active" : "filter-tab"} onClick={() => onFilter(value)}>
              {value === "all" ? "All" : value === "image" ? "Photos" : value === "video" ? "Videos" : "Favorites"}
              {value === "favorites" && <span>{favorites.length}</span>}
            </button>
          ))}
        </div>
        <div className="gallery-controls">
          <label className="search-field">
            <Search size={15} />
            <input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search filenames" aria-label="Search filenames" />
            {query && <button onClick={() => onQuery("")} aria-label="Clear search"><X size={14} /></button>}
          </label>
          <label className="sort-field"><span>Sort</span><select value={sort} onChange={(event) => onSort(event.target.value as "newest" | "oldest" | "name")}><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="name">Filename</option></select><ChevronDown size={13} /></label>
        </div>
      </div>
      {selectedIds.length > 0 && (
        <div className="selection-bar">
          <div><strong>{selectedIds.length}</strong> {selectedIds.length === 1 ? "item" : "items"} selected{uploadStatus && <span className="upload-status">{uploadStatus}</span>}</div>
          <div className="selection-actions">
            <button className="soft-button" onClick={onDownloadSelected}><Download size={15} /> Download ZIP</button>
            <button className="danger-button" onClick={onDeleteSelected}><Trash2 size={15} /> Delete</button>
            <button className="clear-selection" onClick={onClearSelection}>Clear</button>
          </div>
        </div>
      )}
      {selectedIds.length === 0 && uploadStatus && <div className="upload-status-line">{uploadStatus}</div>}
      {loadError && <div className="error-state">{loadError}</div>}
      {isLoading ? (
        <div className="loading-state" aria-label="Loading gallery"><div className="skeleton-grid"><div className="skeleton-block" /><div className="skeleton-block" /><div className="skeleton-block" /><div className="skeleton-block" /></div></div>
      ) : groups.length === 0 ? (
        <div className="empty-state"><Heart size={22} /><h2>Nothing here yet</h2><p>Try another filter or filename.</p></div>
      ) : (
        <div className="memory-groups">
          {groups.map((group) => (
            <section key={group.label} className="memory-group">
              <div className="group-heading"><h2>{group.label}</h2><span>{group.items.length} {group.items.length === 1 ? "item" : "items"}</span></div>
              <div className="masonry-grid">{group.items.map((item, index) => <MediaCard key={item.id} item={item} animationIndex={index} isFavorite={favorites.includes(item.id)} isSelected={selectedIds.includes(item.id)} onOpen={() => onOpen(items.indexOf(item))} onToggleFavorite={() => onToggleFavorite(item.id)} onToggleSelection={() => onToggleSelection(item.id)} />)}</div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function MediaCard({ item, animationIndex, isFavorite, isSelected, onOpen, onToggleFavorite, onToggleSelection }: { item: MediaItem; animationIndex: number; isFavorite: boolean; isSelected: boolean; onOpen: () => void; onToggleFavorite: () => void; onToggleSelection: () => void }) {
  return (
    <motion.article
      className={isSelected ? "media-card is-selected" : "media-card"}
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      whileHover={{ y: -7, scale: 1.012 }}
      whileTap={{ scale: 0.985 }}
      transition={{ duration: 0.58, delay: Math.min(animationIndex, 8) * 0.045, ease: [0.22, 1, 0.36, 1] }}
    >
      <button className="media-select" onClick={onToggleSelection} aria-label={isSelected ? `Deselect ${displayName(item.name)}` : `Select ${displayName(item.name)}`} aria-pressed={isSelected}>
        <AnimatePresence initial={false}>
          {isSelected && <motion.span initial={{ opacity: 0, scale: 0, rotate: -45 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} exit={{ opacity: 0, scale: 0, rotate: 45 }}><Check size={14} /></motion.span>}
        </AnimatePresence>
      </button>
      <button className="media-open" onClick={onOpen} aria-label={`Open ${displayName(item.name)}`}>
        {item.previewUrl ? <img src={item.previewUrl} loading="lazy" alt={displayName(item.name)} /> : <div className="video-fallback"><Film size={26} /><span>Video</span></div>}
        {item.kind === "video" && <span className="play-badge"><Play size={13} fill="currentColor" /></span>}
        <span className="media-shade" />
      </button>
      <div className="media-card-bottom"><span>{formatDate(item.date)}</span><motion.button whileTap={{ scale: 0.72, rotate: -18 }} className={isFavorite ? "favorite-button is-favorite" : "favorite-button"} onClick={onToggleFavorite} aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}><Heart size={15} fill={isFavorite ? "currentColor" : "none"} /></motion.button></div>
    </motion.article>
  );
}

function MediaViewer({ item, isFavorite, onClose, onPrevious, onNext, onToggleFavorite }: { item: MediaItem; isFavorite: boolean; onClose: () => void; onPrevious: () => void; onNext: () => void; onToggleFavorite: () => void }) {
  return (
    <motion.div className="viewer-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="viewer-shell" initial={{ opacity: 0, y: 28, scale: 0.95, filter: "blur(12px)" }} animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }} exit={{ opacity: 0, y: 18, scale: 0.97, filter: "blur(8px)" }} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }} onClick={(event) => event.stopPropagation()}>
        <div className="viewer-topbar">
          <div className="viewer-info"><span>{item.kind === "video" ? "Video" : "Photo"}</span><strong>{displayName(item.name)}</strong><small>{formatDate(item.date)}</small></div>
          <div className="viewer-actions"><a className="viewer-icon" href={item.url} download={item.name} aria-label="Download this item"><Download size={17} /></a><button className={isFavorite ? "viewer-icon is-favorite" : "viewer-icon"} onClick={onToggleFavorite} aria-label="Toggle favorite"><Heart size={17} fill={isFavorite ? "currentColor" : "none"} /></button><button className="viewer-icon" onClick={onClose} aria-label="Close viewer"><X size={19} /></button></div>
        </div>
        <div className="viewer-stage">
          <button className="viewer-nav previous" onClick={onPrevious} aria-label="Previous item"><ArrowLeft size={20} /></button>
          {item.kind === "video" ? <motion.video initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.55 }} src={item.url} poster={item.previewUrl} controls autoPlay playsInline /> : <motion.img initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.55 }} src={item.url} alt={displayName(item.name)} />}
          <button className="viewer-nav next" onClick={onNext} aria-label="Next item"><ArrowRight size={20} /></button>
        </div>
        <div className="viewer-bottom"><span>{item.fileExtension} · original</span><span>Use the arrow keys to move</span></div>
      </motion.div>
    </motion.div>
  );
}

function IntegrityView({ report, onBack }: { report: Report | null; onBack: () => void }) {
  const [search, setSearch] = useState("");
  const items = report?.items.filter((item) => item.name.toLowerCase().includes(search.toLowerCase())) || [];
  return (
    <div className="report-page page-width">
      <button className="back-button" onClick={onBack}><ArrowLeft size={15} /> Back home</button>
      <div className="report-heading"><div><span className="section-kicker">Laiba’s photos</span><h1>Everything is here</h1><p>A quick check that the files arrived safely.</p></div><div className="verified-badge"><Check size={14} /> Ready</div></div>
      {report ? (
        <>
          <div className="report-stat-grid">
            <ReportStat label="Files found" value={report.archiveFilesDiscovered} detail="for Laiba" icon={<LayoutGrid size={18} />} />
            <ReportStat label="Photos" value={report.imagesImported} detail={`${formatBytes(report.items.filter((item) => item.kind === "image").reduce((sum, item) => sum + item.size, 0))} of originals`} icon={<ImageIcon size={18} />} />
            <ReportStat label="Videos" value={report.videosImported} detail={`${formatBytes(report.items.filter((item) => item.kind === "video").reduce((sum, item) => sum + item.size, 0))} of originals`} icon={<Film size={18} />} />
            <ReportStat label="Previews" value={report.missingPreviews === 0 ? "All" : `${report.finalMediaItems - report.missingPreviews}/${report.finalMediaItems}`} detail={report.missingPreviews === 0 ? "ready to browse" : `${report.missingPreviews} missing`} icon={<ShieldCheck size={18} />} />
          </div>
          <div className="report-summary">
            <div><strong>{report.finalMediaItems} / {report.archiveFilesDiscovered}</strong><span>items ready in Laiba’s gallery</span></div>
            <div className="progress-track"><div className="progress-fill" style={{ width: `${report.archiveFilesDiscovered ? Math.min(100, (report.finalMediaItems / report.archiveFilesDiscovered) * 100) : 0}%` }} /></div>
            <span className="report-summary-note">{report.duplicateGroups.length ? `${report.duplicateGroups.length} duplicate groups found; originals kept.` : "No duplicate files found."}</span>
          </div>
          <div className="integrity-list">
            <div className="integrity-list-head">
              <div><h2>Gallery files</h2><span>Laiba filenames · {items.length} shown</span></div>
              <label className="search-field"><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a file" aria-label="Find a file" /></label>
            </div>
            <div className="integrity-table">
              {items.map((item) => (
                <div className="integrity-row" key={item.id}>
                  <div className={`integrity-icon ${item.kind}`}>{item.kind === "image" ? <ImageIcon size={15} /> : <Film size={15} />}</div>
                  <div className="integrity-file"><strong>{item.name}</strong><span>{item.fileExtension} · {formatBytes(item.size)}</span></div>
                  <span className="integrity-date">{formatDate(item.date)}</span>
                  <span className="integrity-ok"><Check size={13} /> ready</span>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : <div className="loading-state"><div className="skeleton-grid"><div className="skeleton-block" /><div className="skeleton-block" /></div></div>}
    </div>
  );
}

function ReportStat({ label, value, detail, icon }: { label: string; value: string | number; detail: string; icon: ReactNode }) {
  return <div className="report-stat"><div className="report-stat-icon">{icon}</div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

export default App;