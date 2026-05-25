interface KpiItem {
  label: string;
  value: string | number;
  tone?: 'pass' | 'fail' | 'skip';
  sub?: string;
}

export function KpiStrip({ items }: { items: KpiItem[] }) {
  return (
    <div className="kpis">
      {items.map((it, i) => (
        <div className="kpi" key={`${i}-${it.label}`}>
          <div className="label">{it.label}</div>
          <div className={'value ' + (it.tone ?? '')}>{it.value}</div>
          {it.sub && <div className="sub">{it.sub}</div>}
        </div>
      ))}
    </div>
  );
}
