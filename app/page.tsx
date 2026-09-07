'use client';
/* oxlint-disable next/no-img-element -- Exhibition images are locally pre-sized; the full-image overlay deliberately preserves source pixels and an onError fallback. */
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  ArrowUpRight,
  Compass,
  Play,
  ImageIcon,
  Move,
  Volume2,
  VolumeX,
  Info,
  ChevronRight,
  ChevronLeft,
  Grid2X2,
  Upload,
  Share2,
  Download,
  Pause,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Expand,
  Film,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from '@/components/ui/hover-card';
import { Slider } from '@/components/ui/slider';
import {
  rooms,
  artworks,
  sourceDate,
  type Room,
  type Artwork,
} from '@/lib/gallery/data';
import { chambers } from '@/lib/gallery/layout';
import { TOUR_DURATION } from '@/lib/gallery/tour';
import type { GalleryEngine, Hit, GalleryLocation } from '@/lib/gallery/engine';
function Star() {
  return (
    <img
      className="gallery-logo"
      src="/brand/astra-gallery-logo-v2.png"
      alt="Astra Gallery"
    />
  );
}
function ProjectCredit({ expanded = false }: { expanded?: boolean }) {
  return (
    <>
      Works from{' '}
      <a
        href="https://codex-billboard.vercel.app/gallery"
        target="_blank"
        rel="noopener noreferrer"
      >
        Codex Billboards
      </a>
      , the community project by{' '}
      <a
        href="https://x.com/itsjessyin"
        target="_blank"
        rel="noopener noreferrer"
      >
        Jess (@itsjessyin)
      </a>
      .
      {expanded &&
        ' The original project lets people create, share and vote on Codex images. Astra Gallery brings those community submissions into an explorable museum.'}
    </>
  );
}
function Profile({ work }: { work: Artwork }) {
  return (
    <>
      <div className="profile-row">
        {work.profile?.avatar ? (
          <img className="avatar" src={work.profile.avatar} alt="" />
        ) : (
          <div className="avatar">{work.handle?.[0]?.toUpperCase() || '✦'}</div>
        )}
        <div>
          <a
            className="handle"
            href={work.handle ? `https://x.com/${work.handle}` : undefined}
            target="_blank"
            rel="noreferrer"
          >
            {work.handle ? '@' + work.handle : 'Anonymous creator'}
          </a>
          {work.profile?.name && (
            <div className="profile-name">{work.profile.name}</div>
          )}
        </div>
      </div>
      <p>
        {work.profile?.bio ||
          (work.handle
            ? 'A public bio is not available for this account.'
            : 'No Twitter handle was provided with this submission.')}
      </p>
      {work.profile?.followers != null && (
        <small>{work.profile.followers.toLocaleString()} followers · </small>
      )}
      <small>{work.votes.toLocaleString()} exhibition votes</small>
      {work.handle && (
        <a
          className="profile-link"
          href={`https://x.com/${work.handle}`}
          target="_blank"
          rel="noreferrer"
        >
          Open Twitter profile <ArrowUpRight size={14} />
        </a>
      )}
    </>
  );
}
export default function Gallery() {
  const host = useRef<HTMLDivElement>(null),
    engine = useRef<GalleryEngine | null>(null),
    audio = useRef<HTMLAudioElement>(null),
    hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    objectUrl = useRef<string | null>(null),
    uploadRequest = useRef({ generation: 0 });
  const [ready, setReady] = useState(false),
    [failed, setFailed] = useState(false),
    [room, setRoom] = useState<Room>(rooms[0]),
    [panel, setPanel] = useState<
      'rooms' | 'collection' | 'help' | 'film' | null
    >(null),
    [selected, setSelected] = useState<Artwork | null>(null),
    [hover, setHover] = useState<Hit>(null),
    [sound, setSound] = useState(false),
    [tour, setTour] = useState(false),
    [progress, setProgress] = useState(0),
    [collectionRoom, setCollectionRoom] = useState('all'),
    [toast, setToast] = useState(''),
    [customName, setCustomName] = useState(''),
    [lighting, setLighting] = useState(1.5),
    [uploadError, setUploadError] = useState(''),
    [loaded, setLoaded] = useState(0),
    [place, setPlace] = useState<GalleryLocation>({
      chamber: null,
      street: true,
      name: 'Codex Billboards',
    });
  const notify = useCallback((message: string) => {
    setToast(message);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 4200);
    return () => clearTimeout(t);
  }, [toast]);
  const select = useCallback((work: Artwork) => {
    setSelected(work);
    setHover(null);
    if (work.id !== 'your-billboard') {
      const u = new URL(location.href);
      u.searchParams.set('art', work.id);
      history.replaceState(null, '', u);
    }
  }, []);
  const closeArtwork = () => {
    setSelected(null);
    const u = new URL(location.href);
    u.searchParams.delete('art');
    history.replaceState(null, '', u);
  };
  const handleHover = useCallback((hit: Hit) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    if (hit && hit.work.id !== 'your-billboard') setHover(hit);
    else hoverTimer.current = setTimeout(() => setHover(null), 250);
  }, []);
  useEffect(() => {
    let gone = false;
    const uploadState = uploadRequest.current;
    import('@/lib/gallery/engine')
      .then(({ GalleryEngine }) => {
        if (gone || !host.current) return;
        try {
          const e = new GalleryEngine(host.current, {
            onReady: () => setReady(true),
            onProgress: setLoaded,
            onLocation: setPlace,
            onRoom: setRoom,
            onSelect: select,
            onHover: handleHover,
            onError: () => {
              setFailed(true);
              setReady(true);
            },
          });
          engine.current = e;
          e.tourClock = () =>
            audio.current && (!audio.current.paused || audio.current.ended)
              ? audio.current.currentTime
              : null;
          e.onTourProgress = setProgress;
          e.onTourEnd = () => {
            e.recoverWalkPosition();
            setTour(false);
            setSound(false);
            audio.current?.pause();
          };
          const id = new URL(location.href).searchParams.get('art');
          const work = artworks.find((a) => a.id === id);
          if (work) {
            e.focus(work);
            setSelected(work);
          }
        } catch {
          setFailed(true);
          setReady(true);
        }
      })
      .catch(() => {
        setFailed(true);
        setReady(true);
      });
    return () => {
      gone = true;
      uploadState.generation++;
      engine.current?.dispose();
      engine.current = null;
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
    };
  }, [select, handleHover]);
  useEffect(() => {
    if (engine.current) {
      engine.current.blocked = !!panel || !!selected;
      if (panel || selected) engine.current.keys.clear();
    }
    if (tour) {
      if (panel || selected) audio.current?.pause();
      else if (sound) void audio.current?.play().catch(() => setSound(false));
    }
  }, [panel, selected, tour, sound]);
  const navigate = (id: string) => {
    if (tour) {
      audio.current?.pause();
      setSound(false);
    }
    engine.current?.navigate(id);
    const theme =
      rooms.find((r) => r.id === id) ||
      chambers.find((c) => c.id === id)?.theme;
    if (theme) setRoom(theme);
    setPanel(null);
    setHover(null);
    setTour(false);
  };
  const playSound = async () => {
    if (!audio.current) return;
    if (sound) {
      audio.current.pause();
      if (engine.current) engine.current.tourClock = null;
      setSound(false);
    } else {
      try {
        if (tour) {
          audio.current.currentTime = engine.current?.tourTime || 0;
          if (engine.current)
            engine.current.tourClock = () =>
              audio.current && !audio.current.paused && !audio.current.ended
                ? audio.current.currentTime
                : null;
        }
        await audio.current.play();
        setSound(true);
      } catch {
        if (engine.current) engine.current.tourClock = null;
        setSound(false);
        notify('Audio could not play. Please try the sound button again.');
      }
    }
  };
  const toggleTour = async () => {
    if (tour) {
      engine.current?.stopTour();
      setTour(false);
      audio.current?.pause();
      setSound(false);
      return;
    }
    setPanel(null);
    setHover(null);
    if (engine.current)
      engine.current.tourClock = () =>
        audio.current && !audio.current.paused && !audio.current.ended
          ? audio.current.currentTime
          : null;
    engine.current?.startTour();
    setTour(true);
    if (audio.current) {
      audio.current.currentTime = 0;
      try {
        await audio.current.play();
        setSound(true);
      } catch {
        setSound(false);
        if (engine.current) engine.current.tourClock = null;
      }
    }
  };
  const share = async (work: Artwork) => {
    const url = new URL(location.origin + location.pathname);
    url.searchParams.set('art', work.id);
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Codex Billboards · Astra Gallery',
          text: `Discover ${work.handle ? '@' + work.handle + '’s billboard' : 'this billboard'} at Astra Gallery.`,
          url: url.href,
        });
      } else {
        await navigator.clipboard.writeText(url.href);
        notify('Artwork link copied.');
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        try {
          await navigator.clipboard.writeText(url.href);
          notify('Artwork link copied.');
        } catch {
          notify('Copy the artwork link from your browser’s address bar.');
        }
      }
    }
  };
  const upload = async (file: File | undefined) => {
    if (!file) return;
    const request = ++uploadRequest.current.generation;
    setUploadError('');
    if (
      !['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(
        file.type,
      )
    ) {
      setUploadError('Choose a JPG, PNG, WebP, or AVIF image.');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setUploadError('Please choose an image smaller than 25 MB.');
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      if (request !== uploadRequest.current.generation) {
        URL.revokeObjectURL(url);
        return;
      }
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 2048 / Math.max(img.width, img.height));
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas
        .getContext('2d')!
        .drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(
        (blob) => {
          if (request !== uploadRequest.current.generation) return;
          if (!blob) {
            setUploadError(
              'This image could not be processed. Try another image.',
            );
            return;
          }
          if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
          objectUrl.current = URL.createObjectURL(blob);
          engine.current?.setCustomImage(
            objectUrl.current,
            img.width,
            img.height,
          );
          setCustomName(file.name);
        },
        'image/webp',
        0.94,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      if (request !== uploadRequest.current.generation) return;
      setUploadError(
        'This image could not be opened. Please try another file.',
      );
    };
    img.src = url;
  };
  const saveStudio = () => {
    if (!engine.current) return;
    const a = document.createElement('a');
    a.href = engine.current.capture();
    a.download = 'my-billboard-at-astra.png';
    a.click();
    notify('Your gallery preview has been saved.');
  };
  const focusSelected = () => {
    if (!selected) return;
    if (tour) {
      audio.current?.pause();
      setSound(false);
    }
    engine.current?.focus(selected);
    setTour(false);
    setPanel(null);
    closeArtwork();
  };
  const fullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      notify('Full screen is unavailable in this browser.');
    }
  };
  useEffect(() => {
    const context = (
      document as unknown as {
        modelContext?: {
          registerTool: (tool: unknown, options: unknown) => void;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      context.registerTool(
        {
          name: 'explore_astra_room',
          description:
            'Navigate to a room in Astra Gallery. Available IDs: fame, city, nature, minimal, color, culture, studio.',
          inputSchema: {
            type: 'object',
            properties: {
              roomId: { type: 'string', enum: rooms.map((r) => r.id) },
            },
            required: ['roomId'],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false },
          execute: (input: unknown) => {
            const id = (input as { roomId?: string })?.roomId;
            const room = rooms.find((r) => r.id === id);
            if (!room) throw new Error('Unknown gallery room');
            if (!engine.current)
              throw new Error('The gallery is still opening');
            engine.current.navigate(room.id);
            setRoom(room);
            setPanel(null);
            setTour(false);
            return { room: room.name, artworks: room.works.length };
          },
        },
        { signal: lifecycle.signal },
      );
      context.registerTool(
        {
          name: 'open_astra_artwork',
          description: 'Open a billboard full screen by its catalog ID.',
          inputSchema: {
            type: 'object',
            properties: { artworkId: { type: 'string' } },
            required: ['artworkId'],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: true },
          execute: (input: unknown) => {
            const work = artworks.find(
              (a) => a.id === (input as { artworkId?: string })?.artworkId,
            );
            if (!work) throw new Error('Unknown artwork');
            select(work);
            return { id: work.id, handle: work.handle, votes: work.votes };
          },
        },
        { signal: lifecycle.signal },
      );
    } catch {}
    return () => lifecycle.abort();
  }, [select]);
  const list =
    collectionRoom === 'all'
      ? artworks
      : artworks.filter((a) => a.room === collectionRoom);
  const selectedRoom = selected
    ? rooms.find((r) => r.id === selected.room)
    : null;
  const siblingWorks = selectedRoom?.works || [];
  const workIndex = siblingWorks.findIndex((a) => a.id === selected?.id);
  return (
    <main className="museum">
      <div
        ref={host}
        className="viewport"
        role="application"
        aria-label="Interactive 3D gallery. Drag to look, use W A S D to walk. Use Collection for an accessible list of all artworks."
      />
      <audio
        ref={audio}
        src="/media/astra-rooms-of-light.mp3"
        preload="none"
        onEnded={() => setSound(false)}
      >
        <track
          kind="captions"
          src="/media/music-captions.vtt"
          srcLang="en"
          label="Instrumental music"
        />
      </audio>
      <header className="topbar">
        <div className="brand">
          <Star />
        </div>
        <div className="exhibition">
          <span>On exhibition</span>Codex Billboards
        </div>
        <div className="header-actions">
          <button className="glass-button" onClick={() => navigate('studio')}>
            <ImageIcon />
            <span className="button-label">Your billboard</span>
          </button>
          <button
            className="glass-button"
            onClick={() => {
              engine.current?.stopTour();
              setTour(false);
              audio.current?.pause();
              setSound(false);
              setPanel('film');
            }}
          >
            <Film />
            <span className="button-label">The film</span>
          </button>
          <button
            className="glass-button"
            aria-label="Visitor guide"
            onClick={() => setPanel('help')}
          >
            <Info />
          </button>
        </div>
      </header>
      <div className={`room-intro ${place.street ? 'street-intro' : ''}`}>
        <div className="eyebrow">
          {place.street
            ? 'Astra Gallery · After dark'
            : place.chamber
              ? `${place.chamber.number} / ${room.id === 'fame' ? 'Community favourites' : room.name}`
              : 'A moment between rooms'}
        </div>
        <h1>{place.name}</h1>
        <p className={place.street ? 'project-credit' : undefined}>
          {place.street ? (
            <ProjectCredit />
          ) : place.chamber ? (
            room.subtitle
          ) : place.name === 'The courtyard' ? (
            'Open sky, still water, and a new room in every direction.'
          ) : (
            'Follow the light. The Hall of Fame is through the left doorway.'
          )}
        </p>
        {place.street && !tour && (
          <button
            className="gold-button enter-gallery"
            disabled={!ready || failed}
            onClick={() => engine.current?.enterGallery()}
          >
            Enter the gallery <ArrowUpRight />
          </button>
        )}
      </div>
      <div className="status-pill">
        <span className="live-dot" />
        {artworks.length} works · {chambers.length} rooms
      </div>
      <div className="bottom-fade" />
      <div className="room-index">
        <span>{place.chamber?.number || '✦'}</span>
        <small>
          YOU ARE IN
          <br />
          {place.street ? 'THE STREET' : place.name.toUpperCase()}
        </small>
      </div>
      {!tour && place.chamber && room.id !== 'studio' && (
        <aside className="mini-card">
          <small>
            {room.id === 'fame'
              ? 'The Hall of Fame'
              : `${place.chamber.works.length} works in this room`}
          </small>
          <h3>
            {room.id === 'fame'
              ? 'Ten works. Thousands of voices.'
              : room.description.split('.')[0] + '.'}
          </h3>
          <p>
            {room.id === 'fame'
              ? 'The most-voted billboards, together in one room. Click any work to take a closer look.'
              : 'Continue through any doorway to discover the next room, or browse the whole collection.'}
          </p>
          <button
            className="glass-button"
            onClick={() => {
              setCollectionRoom(room.id);
              setPanel('collection');
            }}
          >
            View this collection <ArrowUpRight />
          </button>
        </aside>
      )}
      {place.chamber && room.id === 'studio' && !tour && (
        <aside className="studio-panel">
          <div className="eyebrow">The open studio</div>
          <h2>A wall for your idea.</h2>
          <p>Bring your own image and see it framed in the gallery’s light.</p>
          <label className="upload-label">
            <Upload size={18} />
            {customName ? 'Replace image' : 'Choose your image'}
            <input
              aria-label="Upload your billboard image"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              onChange={(e) => void upload(e.target.files?.[0])}
            />
          </label>
          <small>{customName || 'JPG, PNG, WebP or AVIF · up to 25 MB'}</small>
          {uploadError && (
            <p role="alert" style={{ color: '#efb4a0' }}>
              {uploadError}
            </p>
          )}
          <div className="studio-slider">
            <label id="lighting-label">
              Gallery lighting ·{' '}
              {lighting < 1 ? 'Soft' : lighting < 2 ? 'Warm' : 'Radiant'}
            </label>
            <Slider
              aria-labelledby="lighting-label"
              min={0.3}
              max={3}
              step={0.1}
              value={[lighting]}
              onValueChange={(v) => {
                const value = Array.isArray(v) ? v[0] : v;
                setLighting(value);
                engine.current?.setLighting(value);
              }}
            />
          </div>
          {customName && (
            <button
              className="gold-button"
              style={{ marginTop: 22, width: '100%' }}
              onClick={saveStudio}
            >
              <Download />
              Save gallery preview
            </button>
          )}
          <p style={{ fontSize: 12, marginBottom: 0 }}>
            Your image stays in this browser. It is never published.
          </p>
        </aside>
      )}
      {tour && (
        <>
          <div className="tour-progress">
            <div style={{ width: `${progress * 100}%` }} />
          </div>
          <div className="film-overlay-title">
            <div className="eyebrow">
              A guided journey ·{' '}
              {Math.min(TOUR_DURATION, Math.floor(progress * TOUR_DURATION))} /{' '}
              {TOUR_DURATION} seconds
            </div>
          </div>
        </>
      )}
      <div className="walkpad" aria-label="Touch movement controls">
        {[
          { key: 'w', icon: ArrowUp, label: 'Walk forward' },
          { key: 'a', icon: ArrowLeft, label: 'Step left' },
          { key: 's', icon: ArrowDown, label: 'Walk backward' },
          { key: 'd', icon: ArrowRight, label: 'Step right' },
        ].map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            className="glass-button"
            aria-label={label}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              engine.current?.interruptMotion();
              if (tour) {
                audio.current?.pause();
                setSound(false);
              }
              setTour(false);
              engine.current?.keys.add(key);
            }}
            onPointerUp={() => engine.current?.keys.delete(key)}
            onPointerCancel={() => engine.current?.keys.delete(key)}
            onLostPointerCapture={() => engine.current?.keys.delete(key)}
          >
            <Icon />
          </button>
        ))}
      </div>
      <footer className="toolbar">
        <div className="navigation">
          <button className="glass-button" onClick={() => setPanel('rooms')}>
            <Compass />
            Rooms
            <ChevronRight />
          </button>
          <button
            className="glass-button"
            onClick={() => {
              setCollectionRoom('all');
              setPanel('collection');
            }}
          >
            <Grid2X2 />
            <span className="secondary-hide">Collection</span>
          </button>
        </div>
        <div className="controls-hint">
          <Move size={15} />
          <span>Drag to look</span>
          <span className="key">W A S D</span>
          <span>to move</span>
        </div>
        <div className="navigation">
          <button
            className="glass-button secondary-hide"
            aria-label={sound ? 'Mute soundtrack' : 'Play soundtrack'}
            onClick={() => void playSound()}
          >
            {sound ? <Volume2 /> : <VolumeX />}
          </button>
          <button
            className="glass-button secondary-hide"
            aria-label="Toggle full screen"
            onClick={() => void fullscreen()}
          >
            <Expand />
          </button>
          <button
            className="gold-button"
            disabled={failed}
            onClick={() => void toggleTour()}
          >
            {tour ? <Pause size={17} /> : <Play size={17} />}
            <span>{tour ? 'End tour' : 'Take a tour'}</span>
          </button>
        </div>
      </footer>
      {hover && !panel && !selected && !tour && (
        <div
          className="workhover"
          style={{
            left: Math.max(
              12,
              Math.min(
                hover.x + 15,
                (typeof window !== 'undefined' ? window.innerWidth : 800) - 295,
              ),
            ),
            top: Math.max(
              90,
              Math.min(
                hover.y - 20,
                (typeof window !== 'undefined' ? window.innerHeight : 700) -
                  320,
              ),
            ),
          }}
          onMouseEnter={() => {
            if (hoverTimer.current) clearTimeout(hoverTimer.current);
          }}
          onMouseLeave={() => setHover(null)}
        >
          <Profile work={hover.work} />
          <button
            className="link-button"
            style={{ marginTop: 14 }}
            onClick={() => select(hover.work)}
          >
            View full artwork
          </button>
        </div>
      )}
      {toast && (
        <output className="toast-message" aria-live="polite">
          {toast}
        </output>
      )}
      {failed && (
        <div className="empty-webgl">
          <Star />
          <h2>The collection is still open.</h2>
          <p>
            Your browser could not start the 3D gallery. You can explore every
            artwork in the collection or watch the gallery film.
          </p>
          <button
            className="gold-button"
            onClick={() => setPanel('collection')}
          >
            Browse all {artworks.length} works <ArrowUpRight />
          </button>
        </div>
      )}
      {!ready && (
        <div className="loading">
          <Star />
          <p>Preparing the gallery · {Math.round(loaded * 100)}%</p>
          <div className="loading-track">
            <div style={{ width: `${loaded * 100}%` }} />
          </div>
          <small>Hanging every work before you arrive.</small>
        </div>
      )}
      <Dialog
        open={panel !== null}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
      >
        <DialogContent className="panel-content">
          {panel === 'rooms' && (
            <>
              <DialogTitle className="panel-title">
                An evening at Astra.
              </DialogTitle>
              <DialogDescription className="panel-desc">
                26 rooms around an open courtyard. Walk through the connecting
                doorways, or choose any room below.
              </DialogDescription>
              <div className="floorplan">
                <div className="courtyard-map">
                  <span>✦</span>
                  <strong>The courtyard</strong>
                  <small>Open sky · Reflecting pool</small>
                </div>
                {chambers.map((c) => (
                  <button
                    aria-label={`Room ${c.number}: ${c.name}, ${c.works.length} works`}
                    key={c.id}
                    className={`map-room ${place.chamber?.id === c.id ? 'active' : ''} ${c.finish}`}
                    style={{ gridColumn: c.col + 1, gridRow: c.row + 1 }}
                    onClick={() => navigate(c.id)}
                  >
                    <span>{c.number}</span>
                    <strong>{c.name}</strong>
                    <small>
                      {c.theme.id === 'studio'
                        ? 'Your image'
                        : `${c.works.length} works`}
                    </small>
                  </button>
                ))}
              </div>
              <div className="map-entrance">↑ Glass entrance · Street ↑</div>
              <div className="room-grid">
                {rooms.map((r) => (
                  <button
                    key={r.id}
                    className={`room-choice ${r.id === room.id ? 'active' : ''}`}
                    onClick={() => navigate(r.id)}
                  >
                    <span className="room-num">{r.number}</span>
                    <span>
                      <strong>{r.name}</strong>
                      <small>
                        {r.id === 'studio'
                          ? 'Your image, our gallery'
                          : `${r.works.length} works · ${r.id === 'fame' ? 'Top 10 voted' : `${chambers.filter((c) => c.theme.id === r.id).length} rooms`}`}
                      </small>
                    </span>
                    <ChevronRight size={17} style={{ marginLeft: 'auto' }} />
                  </button>
                ))}
              </div>
            </>
          )}

          {panel === 'collection' && (
            <>
              <DialogTitle className="panel-title">
                Codex Billboards
              </DialogTitle>
              <DialogDescription className="panel-desc">
                {artworks.length} distinct works, made by the community. Select
                a work to see it in full.
              </DialogDescription>
              <p className="project-credit">
                <ProjectCredit expanded />
              </p>
              <div className="list-room-nav">
                <button
                  className={collectionRoom === 'all' ? 'active' : ''}
                  onClick={() => setCollectionRoom('all')}
                >
                  All works
                </button>
                {rooms
                  .filter((r) => r.id !== 'studio')
                  .map((r) => (
                    <button
                      key={r.id}
                      className={collectionRoom === r.id ? 'active' : ''}
                      onClick={() => setCollectionRoom(r.id)}
                    >
                      {r.name}
                    </button>
                  ))}
              </div>
              <div className="collection-grid">
                {list.map((work) => (
                  <button
                    className="collection-card"
                    key={work.id}
                    onClick={() => select(work)}
                  >
                    <img
                      loading="lazy"
                      src={work.thumb}
                      alt={
                        work.title ||
                        `Billboard by ${work.handle || 'an anonymous creator'}`
                      }
                    />
                    <div>
                      <span>
                        {work.handle ? '@' + work.handle : 'Anonymous'}
                      </span>
                      <small>↑ {work.votes.toLocaleString()}</small>
                    </div>
                  </button>
                ))}
              </div>
              <p className="copyright-note">
                Votes captured {sourceDate}. Repeated submissions are
                represented once, retaining the highest-voted version.
                Curatorial descriptions are gallery labels. Artwork and creator
                attribution come from the{' '}
                <a
                  href="https://codex-billboard.vercel.app/gallery"
                  target="_blank"
                  rel="noreferrer"
                >
                  original exhibition
                </a>
                .
              </p>
            </>
          )}
          {panel === 'help' && (
            <>
              <DialogTitle className="panel-title">
                Make yourself at home.
              </DialogTitle>
              <DialogDescription className="panel-desc">
                Astra is a gallery you can wander through at your own pace.
              </DialogDescription>
              <p className="project-credit">
                <ProjectCredit expanded />
              </p>
              <div className="help-grid">
                <div className="help-item">
                  <strong>Look around</strong>Click and drag anywhere in the
                  gallery. On a phone, swipe across the room.
                </div>
                <div className="help-item">
                  <strong>Take a walk</strong>Use W A S D to move. Arrow keys
                  walk and turn. Hold Shift to move faster. On mobile, use the
                  direction pad.
                </div>
                <div className="help-item">
                  <strong>Meet the work</strong>Hover over a billboard or its
                  label to meet the creator. Click to view the complete image
                  and share its link.
                </div>
                <div className="help-item">
                  <strong>Choose your pace</strong>Use Rooms to jump between
                  spaces, Collection to browse every work, or Take a tour for a
                  cinematic journey.
                </div>
              </div>
              <p className="copyright-note">
                Votes and public creator profiles are a snapshot from{' '}
                {sourceDate}, not live rankings. Some submissions did not
                include a creator handle; some public profiles are unavailable.
                All original works remain credited as provided by their
                submitters.
              </p>
              <p className="copyright-note">
                Music: “Astra — Rooms of Light,” an original instrumental
                created for this exhibition.
              </p>
            </>
          )}
          {panel === 'film' && (
            <>
              <DialogTitle className="panel-title">Rooms of light.</DialogTitle>
              <DialogDescription className="panel-desc">
                An evening walk from the street, through the exhibition, and
                into the open studio. With time to stop and look.
              </DialogDescription>
              <video
                className="film-video"
                src="/media/astra-gallery-film.mp4"
                controls
                playsInline
                preload="metadata"
              >
                <track
                  kind="captions"
                  src="/media/music-captions.vtt"
                  srcLang="en"
                  label="English"
                />
              </video>
              <div className="film-caption">
                <span>2 minutes · Original score · Astra Gallery</span>
                <a href="/media/astra-gallery-film.mp4" download>
                  Download film{' '}
                  <Download size={14} style={{ display: 'inline' }} />
                </a>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) closeArtwork();
        }}
      >
        <DialogContent className="art-dialog">
          {selected && (
            <>
              <div className="art-image-wrap">
                <img
                  key={selected.id}
                  src={selected.imageUrl || selected.image}
                  alt={
                    selected.title ||
                    `Codex billboard by ${selected.handle || 'an anonymous creator'}`
                  }
                  onError={(e) => {
                    if (
                      e.currentTarget.src !==
                      new URL(selected.image, location.href).href
                    )
                      e.currentTarget.src = selected.image;
                  }}
                />
              </div>
              <div className="art-meta">
                <div>
                  <DialogTitle className="art-title">
                    {selected.handle ? (
                      <HoverCard>
                        <HoverCardTrigger
                          href={`https://x.com/${selected.handle}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          @{selected.handle}{' '}
                          <ArrowUpRight
                            size={14}
                            style={{ display: 'inline' }}
                          />
                        </HoverCardTrigger>
                        <HoverCardContent className="profile-popup">
                          <Profile work={selected} />
                        </HoverCardContent>
                      </HoverCard>
                    ) : (
                      'Anonymous creator'
                    )}
                  </DialogTitle>
                  <DialogDescription className="art-caption">
                    {selected.id === 'your-billboard'
                      ? 'Your billboard · Private studio preview'
                      : `${selected.votes.toLocaleString()} votes · ${selectedRoom?.name || 'Codex Billboards'}${selected.room === 'fame' ? ` · #${selected.rank}` : ''}`}
                  </DialogDescription>
                </div>
                <div className="art-actions">
                  {selected.id !== 'your-billboard' && (
                    <>
                      <button className="glass-button" onClick={focusSelected}>
                        <Compass />
                        View on the wall
                      </button>
                      <button
                        className="gold-button"
                        onClick={() => void share(selected)}
                      >
                        <Share2 size={16} />
                        Share
                      </button>
                    </>
                  )}
                  <div className="art-nav">
                    {siblingWorks.length > 1 && (
                      <>
                        <button
                          className="glass-button"
                          aria-label="Previous artwork"
                          onClick={() =>
                            select(
                              siblingWorks[
                                (workIndex - 1 + siblingWorks.length) %
                                  siblingWorks.length
                              ],
                            )
                          }
                        >
                          <ChevronLeft />
                        </button>
                        <button
                          className="glass-button"
                          aria-label="Next artwork"
                          onClick={() =>
                            select(
                              siblingWorks[
                                (workIndex + 1) % siblingWorks.length
                              ],
                            )
                          }
                        >
                          <ChevronRight />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
