import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DISTRICT_LABELS,
  assignPointForDistrict,
  inferDistrictFromText,
  type DeliveryAssignment,
} from "@/lib/delivery-routing";

type Bounds = [[number, number], [number, number]];

type SuggestItem = {
  value?: string;
  displayName?: string;
};

type SuggestSelectEvent = {
  get: (name: "item") => SuggestItem | undefined;
};

type SuggestViewInstance = {
  events: {
    add: (name: "select", handler: (event: SuggestSelectEvent) => void) => void;
  };
  destroy?: () => void;
};

type GeocodeGeoObject = {
  geometry: {
    getBounds: () => Bounds | null;
    getCoordinates: () => [number, number];
  };
  properties: {
    get: (path: string) => unknown;
  };
};

type GeocodeResult = {
  geoObjects: {
    get: (index: number) => GeocodeGeoObject | undefined;
  };
};

type YMaps = {
  ready: (callback: () => void) => void;
  SuggestView: new (
    target: string | HTMLInputElement,
    options?: {
      boundedBy?: Bounds;
      strictBounds?: boolean;
    },
  ) => SuggestViewInstance;
  geocode: (
    request: string | [number, number],
    options?: {
      results?: number;
      kind?: "house" | "street" | "metro" | "district";
      boundedBy?: Bounds;
      strictBounds?: boolean;
    },
  ) => PromiseLike<GeocodeResult>;
};

declare global {
  interface Window {
    ymaps?: YMaps;
  }
}

type GeoSuggestSearchProps = {
  apiKey: string;
  suggestApiKey: string;
  placeholder?: string;
  label?: string;
  boundedBy?: Bounds;
  onSelect?: (value: string) => void;
};

const cityStatusToBadgeVariant = {
  idle: "outline",
  resolving: "secondary",
  applied: "default",
  error: "outline",
} as const;

const cityStatusText = {
  idle: "Без ограничения по городу",
  resolving: "Определяем город...",
  applied: "Ограничение по городу активно",
  error: "Город не найден",
} as const;

const assignmentStatusToBadgeVariant = {
  idle: "outline",
  resolving: "secondary",
  assigned: "default",
  error: "outline",
} as const;

const assignmentStatusText = {
  idle: "Маршрутизация не запущена",
  resolving: "Назначаем точку...",
  assigned: "Точка назначена",
  error: "Ошибка назначения",
} as const;

const strategyLabels: Record<DeliveryAssignment["strategy"], string> = {
  "single-store": "Фиксированная точка",
  "stable-random": "Стабильное распределение внутри района",
  "fallback-central-stable-random": "Резервное распределение по центру",
};

function toTextValue(input: unknown): string {
  return typeof input === "string" ? input : "";
}

function collectStringsDeep(value: unknown, output: Set<string>, depth = 0): void {
  if (depth > 6 || value == null) {
    return;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) {
      output.add(trimmed);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectStringsDeep(item, output, depth + 1);
    }
    return;
  }

  if (typeof value === "object") {
    for (const nestedValue of Object.values(value as Record<string, unknown>)) {
      collectStringsDeep(nestedValue, output, depth + 1);
    }
  }
}

function collectDistrictProbeText(geoObject: GeocodeGeoObject | undefined, selectedAddress: string): string {
  if (!geoObject) {
    return selectedAddress;
  }

  const parts = new Set<string>();
  const selected = selectedAddress.trim();
  if (selected) {
    parts.add(selected);
  }

  const directPaths = [
    "text",
    "name",
    "description",
    "metaDataProperty.GeocoderMetaData.text",
    "metaDataProperty.GeocoderMetaData.Address.formatted",
  ];

  for (const path of directPaths) {
    const value = toTextValue(geoObject.properties.get(path));
    if (value) {
      parts.add(value);
    }
  }

  collectStringsDeep(geoObject.properties.get("metaDataProperty"), parts);

  const components = geoObject.properties.get("metaDataProperty.GeocoderMetaData.Address.Components");
  if (Array.isArray(components)) {
    for (const component of components) {
      if (!component || typeof component !== "object") {
        continue;
      }

      const maybeName = (component as { name?: unknown }).name;
      const maybeKind = (component as { kind?: unknown }).kind;
      const name = toTextValue(maybeName);
      const kind = toTextValue(maybeKind);

      if (name) {
        parts.add(name);
      }
      if (kind) {
        parts.add(kind);
      }
    }
  }

  return Array.from(parts).join(" ");
}

let mapsScriptPromise: Promise<YMaps> | null = null;

function waitForYmaps(ymaps: YMaps): Promise<YMaps> {
  return new Promise((resolve) => {
    ymaps.ready(() => resolve(ymaps));
  });
}

function loadYandexMapsApi(apiKey: string, suggestApiKey: string): Promise<YMaps> {
  if (window.ymaps) {
    return waitForYmaps(window.ymaps);
  }

  if (mapsScriptPromise) {
    return mapsScriptPromise;
  }

  mapsScriptPromise = new Promise((resolve, reject) => {
    const scriptId = "ymaps-api-script";
    const existingScript = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener("load", () => {
        if (!window.ymaps) {
          reject(new Error("Yandex Maps loaded but ymaps is unavailable."));
          return;
        }
        waitForYmaps(window.ymaps).then(resolve).catch(reject);
      });
      existingScript.addEventListener("error", () => {
        reject(new Error("Failed to load Yandex Maps script."));
      });
      return;
    }

    const script = document.createElement("script");
    script.id = scriptId;
    script.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(
      apiKey,
    )}&suggest_apikey=${encodeURIComponent(suggestApiKey)}&lang=ru_RU`;
    script.async = true;
    script.onload = () => {
      if (!window.ymaps) {
        reject(new Error("Yandex Maps loaded but ymaps is unavailable."));
        return;
      }
      waitForYmaps(window.ymaps).then(resolve).catch(reject);
    };
    script.onerror = () => {
      reject(new Error("Failed to load Yandex Maps script."));
    };

    document.head.appendChild(script);
  });

  return mapsScriptPromise.catch((error) => {
    mapsScriptPromise = null;
    throw error;
  });
}

export function GeoSuggestSearch({
  apiKey,
  suggestApiKey,
  placeholder = "Начните вводить адрес...",
  label = "Адрес",
  boundedBy,
  onSelect,
}: GeoSuggestSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [selectedAddress, setSelectedAddress] = useState("");
  const [cityQuery, setCityQuery] = useState("Мурманск");
  const [activeCity, setActiveCity] = useState("");
  const [cityBounds, setCityBounds] = useState<Bounds | undefined>();
  const [cityStatus, setCityStatus] = useState<"idle" | "resolving" | "applied" | "error">(
    boundedBy ? "applied" : "idle",
  );
  const [assignmentStatus, setAssignmentStatus] = useState<
    "idle" | "resolving" | "assigned" | "error"
  >("idle");
  const [assignment, setAssignment] = useState<DeliveryAssignment | null>(null);
  const effectiveBounds = cityBounds ?? boundedBy;

  useEffect(() => {
    if (!apiKey || !suggestApiKey || !inputRef.current) {
      setStatus("error");
      return;
    }

    let cancelled = false;
    let suggestView: SuggestViewInstance | null = null;

    async function resolveAssignment(value: string) {
      try {
        setAssignmentStatus("resolving");
        const ymaps = await loadYandexMapsApi(apiKey, suggestApiKey);
        const normalizedValue = value.toLowerCase().replace(/ё/g, "е");
        const geocodeQuery =
          normalizedValue.includes("murmansk") || normalizedValue.includes("мурманск")
            ? value
            : `Мурманск, ${value}`;
        const geocodeResult = await ymaps.geocode(geocodeQuery, { results: 1 });
        const geoObject = geocodeResult.geoObjects.get(0);
        let probeText = collectDistrictProbeText(geoObject, value);

        // Second pass: reverse geocode by coordinates to explicitly fetch district metadata.
        const coordinates = geoObject?.geometry.getCoordinates();
        if (coordinates) {
          try {
            const districtResult = await ymaps.geocode(coordinates, {
              kind: "district",
              results: 1,
            });
            const districtObject = districtResult.geoObjects.get(0);
            const districtText = collectDistrictProbeText(districtObject, "");
            if (districtText) {
              probeText = `${probeText} ${districtText}`;
            }
          } catch {
            // Keep first-pass text if district reverse geocode is unavailable.
          }
        }

        const detectedDistrict = inferDistrictFromText(probeText);
        const nextAssignment = assignPointForDistrict(detectedDistrict, value);

        if (cancelled) {
          return;
        }

        setAssignment(nextAssignment);
        setAssignmentStatus("assigned");
      } catch {
        if (cancelled) {
          return;
        }

        setAssignment(null);
        setAssignmentStatus("error");
      }
    }

    async function setupSuggest() {
      try {
        setStatus("loading");
        const ymaps = await loadYandexMapsApi(apiKey, suggestApiKey);
        if (cancelled || !inputRef.current) {
          return;
        }

        suggestView = new ymaps.SuggestView(inputRef.current, {
          boundedBy: effectiveBounds,
          strictBounds: Boolean(effectiveBounds),
        });

        suggestView.events.add("select", (event) => {
          const item = event.get("item");
          const value = item?.value?.trim() ?? "";
          if (!value || cancelled) {
            return;
          }

          if (inputRef.current) {
            inputRef.current.value = value;
          }
          setSelectedAddress(value);
          onSelect?.(value);
          void resolveAssignment(value);
        });

        setStatus("ready");
      } catch {
        if (!cancelled) {
          setStatus("error");
        }
      }
    }

    setupSuggest();

    return () => {
      cancelled = true;
      suggestView?.destroy?.();
    };
  }, [apiKey, suggestApiKey, effectiveBounds, onSelect]);

  const applyCityLimit = async () => {
    const nextCity = cityQuery.trim();
    if (!nextCity) {
      setCityBounds(undefined);
      setActiveCity("");
      setCityStatus(boundedBy ? "applied" : "idle");
      return;
    }

    try {
      setCityStatus("resolving");
      const ymaps = await loadYandexMapsApi(apiKey, suggestApiKey);
      const geocodeResult = await ymaps.geocode(nextCity, { results: 1 });
      const firstResult = geocodeResult.geoObjects.get(0);
      const nextBounds = firstResult?.geometry.getBounds();
      if (!nextBounds) {
        setCityStatus("error");
        return;
      }

      setCityBounds(nextBounds);
      setActiveCity(nextCity);
      setCityStatus("applied");
    } catch {
      setCityStatus("error");
    }
  };

  const clearCityLimit = () => {
    setCityQuery("");
    setActiveCity("");
    setCityBounds(undefined);
    setCityStatus(boundedBy ? "applied" : "idle");
  };

  const clearSelection = () => {
    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.focus();
    }
    setSelectedAddress("");
    setAssignment(null);
    setAssignmentStatus("idle");
    onSelect?.("");
  };

  return (
    <Card className="border-white/40 bg-white/85">
      <CardHeader className="space-y-3">
        <CardTitle>Поиск адреса</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="geosuggest-city-input">Ограничение по городу</Label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              id="geosuggest-city-input"
              value={cityQuery}
              onChange={(event) => setCityQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void applyCityLimit();
                }
              }}
              placeholder="Пример: Мурманск"
              className="h-11 sm:flex-1"
            />
            <Button type="button" className="h-11 sm:min-w-28" onClick={() => void applyCityLimit()}>
              Применить
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-11 border border-input"
              onClick={clearCityLimit}
            >
              Сброс
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={cityStatusToBadgeVariant[cityStatus]}>{cityStatusText[cityStatus]}</Badge>
            <p className="font-body text-xs text-muted-foreground">
              {activeCity
                ? `Ограничено городом: ${activeCity}`
                : "Город не выбран. Подсказки без ограничения по городу."}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="geosuggest-address-input">{label}</Label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              id="geosuggest-address-input"
              ref={inputRef}
              placeholder={placeholder}
              autoComplete="off"
              className="h-11 sm:flex-1"
            />
            <Button
              type="button"
              variant="outline"
              className="h-11 min-w-24 border-amber-200 bg-amber-50/70"
              onClick={clearSelection}
            >
              Очистить
            </Button>
          </div>
        </div>

        {selectedAddress ? (
          <p className="rounded-md border border-dashed border-teal-800/20 bg-teal-50/60 px-3 py-2 font-body text-sm text-teal-900">
            Выбрано: <span className="font-semibold">{selectedAddress}</span>
          </p>
        ) : null}

        <section className="space-y-2 rounded-md border border-input/80 bg-white/50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-body text-sm font-semibold">Маршрутизация доставки</p>
            <Badge variant={assignmentStatusToBadgeVariant[assignmentStatus]}>
              {assignmentStatusText[assignmentStatus]}
            </Badge>
          </div>

          {assignment ? (
            <div className="space-y-1 font-body text-sm text-foreground">
              <p>
                Район: <span className="font-semibold">{DISTRICT_LABELS[assignment.detectedDistrict]}</span>
              </p>
              {assignment.detectedDistrict !== assignment.effectiveDistrict ? (
                <p className="text-xs text-muted-foreground">
                  Резервный пул: {DISTRICT_LABELS[assignment.effectiveDistrict]}
                </p>
              ) : null}
              <p>
                Назначенная точка: <span className="font-semibold">{assignment.point.title}</span>
              </p>
              <p className="text-xs text-muted-foreground">{assignment.point.address}</p>
              <p className="text-xs text-muted-foreground">
                Стратегия: {strategyLabels[assignment.strategy]} ({assignment.pool.length} точек в пуле)
              </p>
              {assignment.note ? (
                <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                  {assignment.note}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="font-body text-xs text-muted-foreground">
              Выберите адрес из подсказок, чтобы автоматически назначить точку доставки.
            </p>
          )}
        </section>

        {status === "error" ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 font-body text-sm text-destructive">
            Не удалось инициализировать Yandex Maps API. Проверьте API-ключи и лимиты.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
