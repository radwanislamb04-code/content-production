import { ClockCard } from "./ClockCard";
import { WeatherCard } from "./WeatherCard";
import { QuoteCard } from "./QuoteCard";

export function ProductivityPanel() {
  return (
    <div className="w-full space-y-3 lg:max-w-[320px]">
      <ClockCard />
      <WeatherCard />
      <QuoteCard />
    </div>
  );
}
