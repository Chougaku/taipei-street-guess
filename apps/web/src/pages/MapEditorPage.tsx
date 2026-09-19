import { isInTaipei, randomPointInGeometry, TAIPEI_BBOX, type LatLng, type MapVisibility } from '@tg/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Map, Polygon, useMap, useMapsLibrary, type MapMouseEvent } from '@vis.gl/react-google-maps';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { IconChevronLeft } from '../components/icons.tsx';
import { ErrorView, FullScreenLoader, Spinner } from '../components/Status.tsx';
import { toast } from '../components/Toast.tsx';
import { api, ApiError, type EditorLocation } from '../lib/api.ts';
import { env } from '../lib/env.ts';
import { useIsCompact } from '../lib/hooks.ts';

const MIN_PUBLIC = 5;

/** Location markers as a Data layer (handles thousands of points far better than DOM markers). */
function PointsLayer({ locations, selected, onSelect }: { locations: EditorLocation[]; selected: number | null; onSelect(i: number): void }) {
  const map = useMap();
  const layer = useRef<google.maps.Data | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!map) return;
    const data = new google.maps.Data({ map });
    data.addListener('click', (e: google.maps.Data.MouseEvent) => onSelectRef.current(Number(e.feature.getProperty('i'))));
    layer.current = data;
    return () => data.setMap(null);
  }, [map]);

  useEffect(() => {
    const data = layer.current;
    if (!data) return;
    data.forEach((f) => data.remove(f));
    locations.forEach((l, i) => data.add({ geometry: new google.maps.Data.Point(l), properties: { i } }));
    data.setStyle((f) => {
      const isSel = Number(f.getProperty('i')) === selected;
      return {
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: isSel ? 8 : 5,
          fillColor: isSel ? '#ff5a36' : '#14b8a6',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 1.5,
        },
        zIndex: isSel ? 2 : 1,
      };
    });
  }, [locations, selected]);
  return null;
}

function PanoPreview({ loc, onView }: { loc: EditorLocation; onView(v: { heading: number; pitch: number; zoom: number }): void }) {
  const { t } = useTranslation();
  const lib = useMapsLibrary('streetView');
  const el = useRef<HTMLDivElement>(null);
  const sv = useRef<google.maps.StreetViewPanorama | null>(null);

  useEffect(() => {
    if (!lib || !el.current) return;
    if (!sv.current) {
      sv.current = new lib.StreetViewPanorama(el.current, {
        disableDefaultUI: true,
        addressControl: false,
        showRoadLabels: false,
        linksControl: false,
        clickToGo: false,
        zoomControl: true,
      });
    }
    if (loc.panoId) sv.current.setPano(loc.panoId);
    else sv.current.setPosition(loc);
    sv.current.setPov({ heading: loc.heading, pitch: loc.pitch });
    sv.current.setZoom(loc.zoom);
  }, [lib, loc]);

  return (
    <div>
      <div ref={el} className="h-56 w-full overflow-hidden rounded-xl bg-panel-2" />
      <button
        className="btn-secondary mt-2 w-full py-2 text-sm"
        onClick={() => {
          const p = sv.current;
          if (!p) return;
          onView({ heading: Math.round(p.getPov().heading), pitch: Math.round(p.getPov().pitch), zoom: Math.round(p.getZoom() * 10) / 10 });
          toast(t('editor.viewSaved'));
        }}
      >
        {t('editor.setView')}
      </button>
    </div>
  );
}

function parseImport(text: string): EditorLocation[] {
  const data = JSON.parse(text) as unknown;
  const arr = Array.isArray(data) ? data : (data as { customCoordinates?: unknown[] }).customCoordinates;
  if (!Array.isArray(arr)) throw new Error('bad format');
  return arr
    .map((x) => x as Record<string, unknown>)
    .filter((x) => typeof x.lat === 'number' && typeof x.lng === 'number')
    .map((x) => ({
      panoId: typeof x.panoId === 'string' ? x.panoId : null,
      lat: x.lat as number,
      lng: x.lng as number,
      heading: Number(x.heading) || 0,
      pitch: Number(x.pitch) || 0,
      zoom: Number(x.zoom) || 0,
    }));
}

export default function MapEditorPage() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const compact = useIsCompact();
  const svLib = useMapsLibrary('streetView');
  const service = useMemo(() => (svLib ? new svLib.StreetViewService() : null), [svLib]);

  const { data: maps, error } = useQuery({ queryKey: ['maps', 'mine-editor', id], queryFn: async () => {
    const me = await api.me();
    const list = await api.listMaps({ owner: me.id, sort: 'new' });
    const m = list.find((x) => x.id === id);
    if (!m) throw new ApiError(404, 'not_found', 'Map not found');
    return m;
  } });
  const { data: serverLocations } = useQuery({ queryKey: ['map-locations', id], queryFn: () => api.mapLocations(id!), enabled: !!maps });

  const [locations, setLocations] = useState<EditorLocation[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [mode, setMode] = useState<'click' | 'polygon'>('click');
  const [polygon, setPolygon] = useState<LatLng[]>([]);
  const [genCount, setGenCount] = useState(20);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [meta, setMeta] = useState<{ name: string; description: string; visibility: MapVisibility } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (serverLocations && !dirty) setLocations(serverLocations.map((l) => ({ ...l })));
    // Only on (re)load from the server.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverLocations]);
  useEffect(() => {
    if (maps && !meta) setMeta({ name: maps.name, description: maps.description, visibility: maps.visibility });
  }, [maps, meta]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const panoIds = useMemo(() => new Set(locations.map((l) => l.panoId)), [locations]);

  /** Snap to the nearest official (Google-owned) panorama. */
  const snap = async (p: LatLng, radius = 50): Promise<EditorLocation | null> => {
    if (!service) return null;
    try {
      const { data } = await service.getPanorama({
        location: p,
        radius,
        sources: [google.maps.StreetViewSource.GOOGLE],
        preference: google.maps.StreetViewPreference.NEAREST,
      });
      const pos = data.location?.latLng;
      if (!data.location?.pano || !pos) return null;
      return { panoId: data.location.pano, lat: pos.lat(), lng: pos.lng(), heading: Math.round(Math.random() * 360), pitch: 0, zoom: 0 };
    } catch {
      return null;
    }
  };

  const add = (locs: EditorLocation[]) => {
    if (locs.length === 0) return;
    setLocations((prev) => [...prev, ...locs]);
    setDirty(true);
  };

  const onMapClick = async (e: MapMouseEvent) => {
    const p = e.detail.latLng;
    if (!p) return;
    if (mode === 'polygon') {
      setPolygon((prev) => [...prev, p]);
      return;
    }
    if (!isInTaipei(p)) return toast(t('editor.outside'));
    const loc = await snap(p);
    if (!loc) return toast(t('editor.noPano'));
    if (!isInTaipei(loc)) return toast(t('editor.outside'));
    if (panoIds.has(loc.panoId)) return toast(t('editor.duplicate'));
    add([loc]);
    setSelected(locations.length);
  };

  const generate = async () => {
    if (polygon.length < 3) return;
    const ring = [...polygon, polygon[0]!].map((p) => [p.lng, p.lat]);
    const geom = { type: 'Polygon' as const, coordinates: [ring] };
    const found: EditorLocation[] = [];
    const seen = new Set(panoIds);
    const maxAttempts = genCount * 5;
    let attempts = 0;
    setProgress({ done: 0, total: genCount });
    const worker = async () => {
      while (found.length < genCount && attempts < maxAttempts) {
        attempts++;
        const loc = await snap(randomPointInGeometry(geom, Math.random), 100);
        if (loc && isInTaipei(loc) && !seen.has(loc.panoId)) {
          seen.add(loc.panoId);
          found.push(loc);
          setProgress({ done: found.length, total: genCount });
        }
      }
    };
    await Promise.all(Array.from({ length: 5 }, worker));
    add(found.slice(0, genCount));
    setProgress(null);
    setPolygon([]);
    toast(t('editor.imported', { count: Math.min(found.length, genCount) }));
  };

  const save = useMutation({
    mutationFn: async () => {
      if (meta && maps && (meta.name !== maps.name || meta.description !== maps.description)) {
        await api.updateMap(id!, { name: meta.name, description: meta.description });
      }
      const res = await api.saveMapLocations(id!, locations);
      if (meta && meta.visibility !== res.map.visibility) {
        if (meta.visibility === 'public' && res.saved < MIN_PUBLIC) throw new ApiError(409, 'too_few', t('editor.needMore', { count: MIN_PUBLIC }));
        await api.updateMap(id!, { visibility: meta.visibility });
      }
      return res;
    },
    onSuccess: (res) => {
      setDirty(false);
      toast(t('editor.saved', { saved: res.saved, skipped: res.skipped }));
      void qc.invalidateQueries({ queryKey: ['map-locations', id] });
      void qc.invalidateQueries({ queryKey: ['maps'] });
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : t('errors.generic')),
  });
  const remove = useMutation({
    mutationFn: () => api.deleteMap(id!),
    onSuccess: () => {
      setDirty(false);
      void qc.invalidateQueries({ queryKey: ['maps'] });
      navigate('/maps');
    },
  });

  if (error) return <ErrorView error={error} />;
  if (!maps || !meta) return <FullScreenLoader />;

  const sel = selected !== null ? locations[selected] : null;
  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ name: meta.name, customCoordinates: locations }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${meta.name || 'map'}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const panel = (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/maps" className="btn-ghost -ml-2 px-2" aria-label={t('app.back')}>
          <IconChevronLeft />
        </Link>
        <h1 className="flex-1 truncate text-lg font-black">{t('editor.title')}</h1>
        <span className="text-sm text-muted">{t('editor.count', { count: locations.length })}</span>
      </div>
      <input
        value={meta.name}
        maxLength={40}
        onChange={(e) => {
          setMeta({ ...meta, name: e.target.value });
          setDirty(true);
        }}
        className="w-full rounded-xl bg-panel-2 px-3 py-2 font-bold ring-1 ring-line focus:outline-none focus:ring-accent"
      />
      <textarea
        value={meta.description}
        maxLength={300}
        rows={2}
        placeholder={t('maps.description')}
        onChange={(e) => {
          setMeta({ ...meta, description: e.target.value });
          setDirty(true);
        }}
        className="w-full rounded-xl bg-panel-2 px-3 py-2 text-sm ring-1 ring-line focus:outline-none focus:ring-accent"
      />
      <select
        value={meta.visibility}
        onChange={(e) => {
          setMeta({ ...meta, visibility: e.target.value as MapVisibility });
          setDirty(true);
        }}
        className="w-full rounded-lg bg-panel-2 px-3 py-2 ring-1 ring-line"
      >
        {(['private', 'unlisted', 'public'] as const).map((v) => (
          <option key={v} value={v}>
            {t(`maps.visibility.${v}`)}
          </option>
        ))}
      </select>

      <div className="grid grid-cols-2 gap-1 rounded-xl bg-panel-2 p-1">
        {(['click', 'polygon'] as const).map((m) => (
          <button key={m} className={`rounded-lg py-2 text-sm font-bold ${mode === m ? 'bg-accent text-white' : 'text-muted'}`} onClick={() => setMode(m)}>
            {t(`editor.${m}Mode`)}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted">{mode === 'click' ? t('editor.clickHint') : t('editor.polygonHint')}</p>
      {mode === 'polygon' && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={1}
            max={500}
            value={genCount}
            onChange={(e) => setGenCount(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
            className="w-20 rounded-lg bg-panel-2 px-2 py-2 ring-1 ring-line"
          />
          <button className="btn-primary flex-1 py-2 text-sm" disabled={polygon.length < 3 || !!progress} onClick={() => void generate()}>
            {progress ? t('editor.generating', progress) : t('editor.generate', { count: genCount })}
          </button>
          <button className="btn-ghost px-2 py-2 text-sm" onClick={() => setPolygon([])}>
            {t('editor.clearPolygon')}
          </button>
        </div>
      )}

      {sel && (
        <div className="card space-y-2 p-3">
          <p className="text-sm font-bold">{t('editor.selected')}</p>
          <PanoPreview
            loc={sel}
            onView={(v) => {
              setLocations((prev) => prev.map((l, i) => (i === selected ? { ...l, ...v } : l)));
              setDirty(true);
            }}
          />
          <button
            className="btn-ghost w-full py-2 text-sm text-bad"
            onClick={() => {
              setLocations((prev) => prev.filter((_, i) => i !== selected));
              setSelected(null);
              setDirty(true);
            }}
          >
            {t('editor.remove')}
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button className="btn-secondary py-2 text-sm" onClick={() => fileInput.current?.click()}>
          {t('editor.import')}
        </button>
        <button className="btn-secondary py-2 text-sm" onClick={exportJson}>
          {t('editor.export')}
        </button>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try {
            const imported = parseImport(await f.text()).filter((l) => !l.panoId || !panoIds.has(l.panoId));
            add(imported);
            toast(t('editor.imported', { count: imported.length }));
          } catch {
            toast(t('editor.importError'));
          }
        }}
      />
      <button className="btn-primary w-full" disabled={save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? <Spinner className="size-5" /> : t('editor.save')}
      </button>
      {dirty && <p className="text-center text-xs text-accent-2">{t('editor.unsaved')}</p>}
      <div className="flex justify-between">
        <Link to={`/maps/${maps.slug}`} className="btn-ghost px-2 py-1 text-sm">
          ▶ {t('editor.play')}
        </Link>
        <button className="btn-ghost px-2 py-1 text-sm text-bad" onClick={() => confirm(t('editor.deleteConfirm')) && remove.mutate()}>
          {t('editor.deleteMap')}
        </button>
      </div>
    </div>
  );

  return (
    <div className={`game-screen flex bg-ink ${compact ? 'flex-col' : ''}`} lang={i18n.language}>
      <div className="relative min-h-0 flex-1">
        <Map
          id="editor-map"
          className="absolute inset-0"
          mapId={env.googleMapId}
          defaultCenter={{ lat: (TAIPEI_BBOX[1] + TAIPEI_BBOX[3]) / 2, lng: (TAIPEI_BBOX[0] + TAIPEI_BBOX[2]) / 2 }}
          defaultZoom={12}
          gestureHandling="greedy"
          clickableIcons={false}
          disableDefaultUI
          zoomControl
          draggableCursor="crosshair"
          onClick={(e) => void onMapClick(e)}
        >
          <PointsLayer locations={locations} selected={selected} onSelect={setSelected} />
          {polygon.length > 0 && <Polygon paths={polygon} strokeColor="#ff5a36" strokeWeight={2} fillColor="#ff5a36" fillOpacity={0.15} clickable={false} />}
        </Map>
      </div>
      <aside className={`overflow-y-auto bg-panel p-4 safe-bottom ${compact ? 'max-h-[50dvh] border-t border-line' : 'w-[380px] border-l border-line'}`}>{panel}</aside>
    </div>
  );
}
