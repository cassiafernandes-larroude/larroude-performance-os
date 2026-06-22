// Cassia 2026-06-22: Aba Calendário — ações US/BR do Asana × resultado de vendas no BigQuery.
import { Suspense } from 'react';
import CalendarDashboard from '@/components/calendar/CalendarDashboard';

export const dynamic = 'force-dynamic';

export default function CalendarioPage() {
  return (
    <Suspense fallback={null}>
      <CalendarDashboard />
    </Suspense>
  );
}
