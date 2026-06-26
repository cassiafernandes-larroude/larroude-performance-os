// Cassia 2026-06-26: aba Forecast de produção (projeção YoY mesma estação × crescimento).
import ForecastView from '@/components/forecast-native/Forecast';

export const dynamic = 'force-dynamic';

export default function ForecastPage() {
  return <ForecastView />;
}
