// Cassia 2026-06-22: Aba Calendário — lê o projeto "2026 Macro Calendar" do Asana DIRETO (REST),
// sem banco. O app usa um Personal Access Token próprio (ASANA_ACCESS_TOKEN) — a conexão MCP é só
// da ferramenta de chat, não do app em produção.
// Campos customizados lidos (criados manualmente no Asana): "SKUs" (text), "Collection ID" (text),
// "Mercado" (dropdown US/BR/Ambos, opcional — na falta, o mercado é deduzido do nome).

export const MACRO_CALENDAR_PROJECT_GID = '1215108556694095';
const ASANA_BASE = 'https://app.asana.com/api/1.0';

export type Market = 'US' | 'BR';

export interface CalendarAction {
  gid: string;
  title: string;
  url: string;
  week: string;                       // seção do Asana (= semana)
  category: string[];                 // campo aCategory (Drop, Sale, ADS…)
  market: 'US' | 'BR' | 'BOTH';
  startOn: string | null;             // YYYY-MM-DD
  dueOn: string | null;               // YYYY-MM-DD
  completed: boolean;
  skus: string[];                     // campo "SKUs"
  collectionId: string | null;        // campo "Collection ID"
}

export function asanaConfigured(): boolean {
  return !!(process.env.ASANA_ACCESS_TOKEN || process.env.ASANA_PAT);
}

function token(): string {
  const t = process.env.ASANA_ACCESS_TOKEN || process.env.ASANA_PAT;
  if (!t) throw new Error('ASANA_ACCESS_TOKEN não configurado');
  return t;
}

/** Deduz o mercado pelo prefixo do nome: [US]/[ADS US] → US, [BR]/[ADS BR] → BR, senão BOTH. */
function marketFromName(name: string): 'US' | 'BR' | 'BOTH' {
  const us = /\[(?:[^\]]*\s)?US\s*\]/i.test(name);
  const br = /\[(?:[^\]]*\s)?BR\s*\]/i.test(name);
  if (us && !br) return 'US';
  if (br && !us) return 'BR';
  return 'BOTH';
}

function normalizeMarket(v: string | null | undefined, name: string): 'US' | 'BR' | 'BOTH' {
  const s = (v || '').trim().toUpperCase();
  if (s === 'US') return 'US';
  if (s === 'BR' || s === 'BRASIL' || s === 'BRAZIL') return 'BR';
  if (s === 'AMBOS' || s === 'BOTH' || s === 'US/BR') return 'BOTH';
  return marketFromName(name);
}

function splitSkus(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;\n]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

/** Valor textual de um custom field (text ou enum), tolerante ao formato do payload Asana. */
function cfValue(cf: any): string | null {
  if (!cf) return null;
  if (typeof cf.text_value === 'string' && cf.text_value) return cf.text_value;
  if (cf.enum_value && cf.enum_value.name) return cf.enum_value.name;
  if (Array.isArray(cf.multi_enum_values) && cf.multi_enum_values.length) {
    return cf.multi_enum_values.map((e: any) => e?.name).filter(Boolean).join(', ');
  }
  if (typeof cf.display_value === 'string' && cf.display_value) return cf.display_value;
  if (typeof cf.number_value === 'number') return String(cf.number_value);
  return null;
}

async function asanaGet(path: string): Promise<any> {
  const res = await fetch(`${ASANA_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token()}`, Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    throw new Error(`Asana ${res.status}: ${body}`);
  }
  return res.json();
}

const OPT_FIELDS = [
  'name', 'permalink_url', 'start_on', 'due_on', 'completed',
  'memberships.section.name',
  'custom_fields.name', 'custom_fields.display_value', 'custom_fields.text_value',
  'custom_fields.number_value', 'custom_fields.enum_value.name', 'custom_fields.multi_enum_values.name',
].join(',');

/** Lê todas as tarefas do 2026 Macro Calendar, normalizadas. */
export async function getMacroCalendar(): Promise<CalendarAction[]> {
  const actions: CalendarAction[] = [];
  let offset: string | null = null;
  let pages = 0;
  do {
    const q = `/projects/${MACRO_CALENDAR_PROJECT_GID}/tasks?limit=100&opt_fields=${encodeURIComponent(OPT_FIELDS)}${offset ? `&offset=${offset}` : ''}`;
    const json = await asanaGet(q);
    for (const t of json.data || []) {
      const name: string = t.name || '';
      const cfs: any[] = t.custom_fields || [];
      const byName = (n: string) => cfs.find((c) => (c.name || '').trim().toLowerCase() === n.toLowerCase());
      const category = (() => {
        const c = byName('aCategory');
        const v = cfValue(c);
        return v ? v.split(/,\s*/).map((s) => s.trim()).filter(Boolean) : [];
      })();
      const week = t.memberships?.find((m: any) => m.section?.name)?.section?.name?.replace(/\s+/g, ' ').trim() || 'Sem semana';
      actions.push({
        gid: t.gid,
        title: name,
        url: t.permalink_url || '',
        week,
        category,
        market: normalizeMarket(cfValue(byName('Mercado')), name),
        startOn: t.start_on || null,
        dueOn: t.due_on || null,
        completed: !!t.completed,
        skus: splitSkus(cfValue(byName('SKUs'))),
        collectionId: (cfValue(byName('Collection ID')) || '').replace(/[^0-9]/g, '') || null,
      });
    }
    offset = json.next_page?.offset || null;
    pages++;
  } while (offset && pages < 20);
  return actions;
}
