import { useState } from "react";
import { GeoSuggestSearch } from "@/components/geosuggest-search";

const YANDEX_JS_API_KEY =
  import.meta.env.VITE_YANDEX_JS_API_KEY ?? "1cd4fe32-a89c-4281-84a0-ce18b0ae86b7";
const YANDEX_SUGGEST_API_KEY =
  import.meta.env.VITE_YANDEX_SUGGEST_API_KEY ??
  "502ee284-681e-4922-9652-9952632bc185";

function App() {
  const [selectedAddress, setSelectedAddress] = useState("");

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f7f2e7] px-4 py-10 text-foreground sm:px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(217,119,6,0.15),_transparent_55%),radial-gradient(ellipse_at_bottom_right,_rgba(14,116,144,0.14),_transparent_50%)]" />
      <div className="pointer-events-none absolute right-0 top-0 h-64 w-64 -translate-y-1/4 translate-x-1/4 rounded-full bg-[#f97316]/20 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-0 h-72 w-72 -translate-x-1/4 translate-y-1/4 rounded-full bg-[#0f766e]/20 blur-3xl" />

      <section className="relative mx-auto flex max-w-2xl flex-col gap-6 animate-fade-in-up">
        <div className="space-y-3">
          <h1 className="font-display text-4xl font-semibold leading-tight sm:text-5xl">
            Поиск адреса
          </h1>
          <p className="max-w-xl font-body text-base text-muted-foreground sm:text-lg">
            Ограничьте поиск городом, выберите адрес из подсказок Яндекса, и заказ будет
            автоматически направлен на нужную точку по вашим правилам районов Мурманска.
          </p>
        </div>

        <GeoSuggestSearch
          apiKey={YANDEX_JS_API_KEY}
          suggestApiKey={YANDEX_SUGGEST_API_KEY}
          placeholder="Начните вводить адрес..."
          onSelect={setSelectedAddress}
        />

        <p className="font-mono text-xs text-muted-foreground">
          Выбранное значение:
          <span className="ml-2 rounded bg-black/5 px-2 py-1">
            {selectedAddress || "Пока не выбрано"}
          </span>
        </p>
      </section>
    </main>
  );
}

export default App;
