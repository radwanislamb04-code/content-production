import { useCallback, useEffect, useState } from "react";
import {
  Cloud,
  CloudDrizzle,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  MapPin,
  Sun,
  Wind,
  Zap,
  Search,
} from "lucide-react";

type Weather = {
  city: string;
  temp: number;
  feels: number;
  humidity: number;
  wind: number;
  code: number;
};

function iconFor(code: number) {
  if (code === 0) return Sun;
  if (code <= 2) return CloudSun;
  if (code === 3 || code === 45 || code === 48) return Cloud;
  if (code >= 51 && code <= 57) return CloudDrizzle;
  if (code >= 71 && code <= 77) return CloudSnow;
  if (code >= 95) return Zap;
  return CloudRain;
}

function labelFor(code: number) {
  if (code === 0) return "Clear sky";
  if (code <= 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Foggy";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code >= 61 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Rain showers";
  if (code >= 95) return "Thunderstorm";
  return "Cloudy";
}

async function fetchWeather(lat: number, lon: number, city?: string) {
  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m`,
  );
  const json = await res.json();
  const c = json.current;
  let name = city;
  if (!name) {
    try {
      const g = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`,
      ).then((r) => r.json());
      name = g.city || g.locality || g.principalSubdivision || "Your location";
    } catch {
      name = "Your location";
    }
  }
  return {
    city: name ?? "Your location",
    temp: Math.round(c.temperature_2m),
    feels: Math.round(c.apparent_temperature),
    humidity: Math.round(c.relative_humidity_2m),
    wind: Math.round(c.wind_speed_10m),
    code: c.weather_code as number,
  } satisfies Weather;
}

export function WeatherCard() {
  const [data, setData] = useState<Weather | null>(null);
  const [loading, setLoading] = useState(true);
  const [needCity, setNeedCity] = useState(false);
  const [query, setQuery] = useState("");
  const [err, setErr] = useState("");

  const loadCity = useCallback(async (name: string) => {
    if (!name.trim()) return;
    setLoading(true);
    setErr("");
    try {
      const g = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
          name,
        )}&count=1`,
      ).then((r) => r.json());
      const hit = g.results?.[0];
      if (!hit) {
        setErr("City not found");
        setLoading(false);
        return;
      }
      setData(await fetchWeather(hit.latitude, hit.longitude, hit.name));
      setNeedCity(false);
    } catch {
      setErr("Could not load weather");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLoading(false);
      setNeedCity(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const w = await fetchWeather(
            pos.coords.latitude,
            pos.coords.longitude,
          );
          if (!cancelled) setData(w);
        } catch {
          if (!cancelled) setNeedCity(true);
        }
        if (!cancelled) setLoading(false);
      },
      () => {
        if (cancelled) return;
        setNeedCity(true);
        setLoading(false);
      },
      { timeout: 8000 },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const Icon = data ? iconFor(data.code) : Cloud;

  return (
    <div className="aios-glass relative overflow-hidden rounded-xl border border-line bg-gradient-to-br from-[#101513] to-[#0A0E0C] p-4">
      <div className="pointer-events-none absolute -left-8 bottom--8 h-24 w-24 rounded-full bg-[rgba(82,255,46,0.08)] blur-2xl" />

      {loading ? (
        <div className="space-y-3">
          <div className="h-4 w-24 animate-pulse rounded bg-surface" />
          <div className="h-10 w-32 animate-pulse rounded bg-surface" />
          <div className="h-3 w-full animate-pulse rounded bg-surface" />
        </div>
      ) : needCity || !data ? (
        <div>
          <div className="mb-2 text-xs text-mute">
            Location unavailable — pick a city
          </div>
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadCity(query)}
              placeholder="e.g. Dhaka"
              className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2.5 py-2 text-[13px] text-fg outline-none placeholder:text-mute focus:border-lime"
            />
            <button
              onClick={() => loadCity(query)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-line bg-surface text-lime transition-colors hover:border-lime"
              aria-label="Search city"
            >
              <Search size={15} />
            </button>
          </div>
          {err && <div className="mt-2 text-[11px] text-err">{err}</div>}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5 text-xs text-fg2">
              <MapPin size={13} className="shrink-0 text-lime" />
              <span className="truncate">{data.city}</span>
            </div>
            <button
              onClick={() => setNeedCity(true)}
              className="shrink-0 text-[11px] text-mute transition-colors hover:text-lime"
            >
              Change
            </button>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <Icon size={40} className="shrink-0 text-lime aios-float" />
            <div className="min-w-0">
              <div className="text-[clamp(1.6rem,7vw,2rem)] font-bold leading-none text-fg">
                {data.temp}°
              </div>
              <div className="mt-1 truncate text-xs text-fg2">
                {labelFor(data.code)} · Feels {data.feels}°
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-4 border-t border-line pt-3 text-[12px] text-fg2">
            <span className="flex items-center gap-1.5">
              <Droplets size={13} className="text-lime" /> {data.humidity}%
            </span>
            <span className="flex items-center gap-1.5">
              <Wind size={13} className="text-lime" /> {data.wind} km/h
            </span>
          </div>
        </>
      )}
    </div>
  );
}
