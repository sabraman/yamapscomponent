export type DeliveryDistrict = "CENTRAL" | "LENINSKY" | "PERVOMAISKY" | "UNKNOWN";

export type DeliveryPoint = {
  id: string;
  title: string;
  address: string;
  district: Exclude<DeliveryDistrict, "UNKNOWN">;
};

export type AssignmentStrategy =
  | "single-store"
  | "stable-random"
  | "fallback-central-stable-random";

export type DeliveryAssignment = {
  detectedDistrict: DeliveryDistrict;
  effectiveDistrict: Exclude<DeliveryDistrict, "UNKNOWN">;
  point: DeliveryPoint;
  pool: DeliveryPoint[];
  strategy: AssignmentStrategy;
  note?: string;
};

export const DISTRICT_LABELS: Record<DeliveryDistrict, string> = {
  CENTRAL: "Центральный (Октябрьский)",
  LENINSKY: "Ленинский",
  PERVOMAISKY: "Первомайский",
  UNKNOWN: "Не определён",
};

const DELIVERY_POINTS: DeliveryPoint[] = [
  {
    id: "center-egorova-14",
    title: "Центр, ул. Егорова 14",
    address: "г. Мурманск, ул. Егорова, 14 (ТехноЦентр, кафе Мама Миа)",
    district: "CENTRAL",
  },
  {
    id: "center-lenina-16a",
    title: "Центр, ул. Ленина 16а",
    address: "г. Мурманск, ул. Ленина, 16а (здание нового ЗАГСа)",
    district: "CENTRAL",
  },
  {
    id: "leninsky-geroev-58",
    title: "Ленинский, пр. Героев-Североморцев 58",
    address: "г. Мурманск, пр. Героев-Североморцев, 58",
    district: "LENINSKY",
  },
  {
    id: "pervomaysky-shevchenko-7b",
    title: "Первомайский, ул. Шевченко 7б",
    address: "г. Мурманск, ул. Шевченко, 7б (бывш. кафе Дорожное)",
    district: "PERVOMAISKY",
  },
  {
    id: "pervomaysky-kolskiy-57",
    title: "Первомайский, пр. Кольский 57",
    address: "г. Мурманск, пр. Кольский, 57",
    district: "PERVOMAISKY",
  },
];

const DELIVERY_POINTS_BY_ID = new Map(DELIVERY_POINTS.map((point) => [point.id, point]));

const DISTRICT_POOLS: Record<Exclude<DeliveryDistrict, "UNKNOWN">, string[]> = {
  CENTRAL: ["center-egorova-14", "center-lenina-16a"],
  LENINSKY: ["leninsky-geroev-58"],
  PERVOMAISKY: ["pervomaysky-shevchenko-7b", "pervomaysky-kolskiy-57"],
};

function normalizeText(input: string): string {
  return input.toLowerCase().replace(/ё/g, "е");
}

function includesAny(normalized: string, hints: string[]): boolean {
  return hints.some((hint) => normalized.includes(hint));
}

function resolvePool(district: Exclude<DeliveryDistrict, "UNKNOWN">): DeliveryPoint[] {
  return DISTRICT_POOLS[district]
    .map((id) => DELIVERY_POINTS_BY_ID.get(id))
    .filter((point): point is DeliveryPoint => Boolean(point));
}

function stableIndex(seed: string, size: number): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return hash % size;
}

export function inferDistrictFromText(text: string): DeliveryDistrict {
  const normalized = normalizeText(text);

  if (
    includesAny(normalized, [
      "ленинский",
      "ленинск",
      "leninsky",
      "leninskiy",
      "leninsk",
      "героев-северомор",
      "героев северомор",
      "severomor",
      "severomorcev",
      "severomortsev",
    ])
  ) {
    return "LENINSKY";
  }

  if (includesAny(normalized, ["первомай", "pervomay", "pervomaisk", "кольск", "kolsk"])) {
    return "PERVOMAISKY";
  }

  if (
    includesAny(normalized, [
      "октябр",
      "oktyabr",
      "oktjabr",
      "center",
      "central",
      "центр",
      "егоров",
      "egorov",
      "ленина",
      "lenina",
      "марата",
      "marata",
    ])
  ) {
    return "CENTRAL";
  }

  return "UNKNOWN";
}

export function assignPointForDistrict(detectedDistrict: DeliveryDistrict, seed: string): DeliveryAssignment {
  const effectiveDistrict = detectedDistrict === "UNKNOWN" ? "CENTRAL" : detectedDistrict;
  const pool = resolvePool(effectiveDistrict);

  if (pool.length === 0) {
    throw new Error(`No delivery points configured for district ${effectiveDistrict}`);
  }

  if (pool.length === 1) {
    return {
      detectedDistrict,
      effectiveDistrict,
      point: pool[0],
      pool,
      strategy: "single-store",
      note:
        detectedDistrict === "UNKNOWN"
          ? "Район не определён. Применён резервный маршрут на центр."
          : undefined,
    };
  }

  const choiceIndex = stableIndex(normalizeText(seed), pool.length);
  return {
    detectedDistrict,
    effectiveDistrict,
    point: pool[choiceIndex],
    pool,
    strategy: detectedDistrict === "UNKNOWN" ? "fallback-central-stable-random" : "stable-random",
    note:
      detectedDistrict === "UNKNOWN"
        ? "Район не определён. Использовано стабильное распределение по центральным точкам."
        : undefined,
  };
}
