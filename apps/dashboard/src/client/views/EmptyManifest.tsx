export function EmptyManifest() {
  return (
    <div className="state">
      <div className="title">No runs yet</div>
      <div>The dashboard server can reach <code>reports/</code> but found no <code>manifest.json</code>.</div>
      <div>Generate the demo fixtures with:</div>
      <div><code>pnpm dashboard:fixtures</code></div>
    </div>
  );
}
