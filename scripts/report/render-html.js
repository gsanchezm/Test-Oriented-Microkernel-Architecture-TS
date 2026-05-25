// Renders the single-file HTML test-run dashboard. Takes the aggregate
// produced by build-test-report.js (one cucumber summary per platform,
// the Gatling sims map, and the visual summary) and produces a static
// HTML document with one tab per surface.

const fs = require('fs');
const path = require('path');

const escape = (s) =>
    String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

const fmtMs = (ns) => {
    const ms = Number(ns) / 1e6;
    if (!isFinite(ms)) return '—';
    if (ms < 1) return `${ms.toFixed(2)} ms`;
    if (ms < 1000) return `${ms.toFixed(0)} ms`;
    return `${(ms / 1000).toFixed(2)} s`;
};

function pill(status) {
    const map = {
        passed:  { cls: 'pill pill-pass', label: '✓ pass' },
        failed:  { cls: 'pill pill-fail', label: '✕ fail' },
        skipped: { cls: 'pill pill-skip', label: '○ skipped' },
        unknown: { cls: 'pill pill-skip', label: 'unknown' },
    };
    const v = map[status] || map.unknown;
    return `<span class="${v.cls}">${v.label}</span>`;
}

function getLogoBase64(filename) {
    try {
        const p = path.join(process.cwd(), 'assets', 'logos', filename);
        if (!fs.existsSync(p)) return '';
        const buf = fs.readFileSync(p);
        const ext = path.extname(filename).substring(1);
        const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
        return `data:${mime};base64,${buf.toString('base64')}`;
    } catch (e) {
        return '';
    }
}

function getMiniChartHtml(passed, failed, skipped, type = 'e2e') {
    const total = passed + failed + skipped;
    if (total === 0) return `<div class="hero-sub" style="margin-top:14px;">Not Run</div>`;

    let passLabel = 'Pass';
    let failLabel = 'Fail';
    let skipLabel = 'Skip';
    let showSkipped = true;

    if (type === 'gatling') {
        passLabel = 'OK';
        failLabel = 'KO';
        showSkipped = false;
    } else if (type === 'pixelmatch') {
        passLabel = 'Verif';
        failLabel = 'Drift';
        skipLabel = 'Base';
    }

    const radius = 10;
    const strokeWidth = 20;
    const circumference = 2 * Math.PI * radius;

    const passStroke = (passed / total) * circumference;
    const failStroke = (failed / total) * circumference;
    const skipStroke = (skipped / total) * circumference;

    let offset = 0;
    const passDash = `${passStroke} ${circumference}`;
    const passOffset = offset;
    offset -= passStroke;
    const failDash = `${failStroke} ${circumference}`;
    const failOffset = offset;
    offset -= failStroke;
    const skipDash = `${skipStroke} ${circumference}`;
    const skipOffset = offset;

    return `
        <div style="display: flex; align-items: center; gap: 20px; margin-top: 16px;">
            <div style="width: 80px; height: 80px; border-radius: 50%; overflow: hidden; flex-shrink: 0;">
                <svg width="80" height="80" viewBox="0 0 40 40" style="transform: rotate(-90deg);">
                    <circle cx="20" cy="20" r="${radius}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="${strokeWidth}" />
                    ${passed > 0 ? `<circle cx="20" cy="20" r="${radius}" fill="none" stroke="var(--ok)" stroke-width="${strokeWidth}" stroke-dasharray="${passDash}" stroke-dashoffset="${passOffset}" />` : ''}
                    ${failed > 0 ? `<circle cx="20" cy="20" r="${radius}" fill="none" stroke="var(--bad)" stroke-width="${strokeWidth}" stroke-dasharray="${failDash}" stroke-dashoffset="${failOffset}" />` : ''}
                    ${skipped > 0 ? `<circle cx="20" cy="20" r="${radius}" fill="none" stroke="var(--warn)" stroke-width="${strokeWidth}" stroke-dasharray="${skipDash}" stroke-dashoffset="${skipOffset}" />` : ''}
                </svg>
            </div>
            <div style="display: flex; flex-direction: column; gap: 6px; font-size: 14px; font-family: var(--mono); font-weight: 700;">
                ${passed > 0 ? `<div style="display: flex; align-items: center; gap: 8px;"><span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--ok);"></span><span style="color: var(--text);">${passed} <span style="color: var(--muted); font-size: 11px; font-weight: 600;">${passLabel}</span></span></div>` : ''}
                ${failed > 0 ? `<div style="display: flex; align-items: center; gap: 8px;"><span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--bad);"></span><span style="color: var(--text);">${failed} <span style="color: var(--muted); font-size: 11px; font-weight: 600;">${failLabel}</span></span></div>` : ''}
                ${skipped > 0 && showSkipped ? `<div style="display: flex; align-items: center; gap: 8px;"><span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--warn);"></span><span style="color: var(--text);">${skipped} <span style="color: var(--muted); font-size: 11px; font-weight: 600;">${skipLabel}</span></span></div>` : ''}
            </div>
        </div>
    `;
}

function getSpeedometerHtml(gatlingData) {
    const sims = Object.values(gatlingData || {}).filter(s => s.available);
    if (sims.length === 0) return `<div class="hero-sub" style="margin-top:14px;">Not Run</div>`;
    
    let totalOk = 0;
    let totalReq = 0;
    sims.forEach(s => {
        totalOk += s.ok || 0;
        totalReq += s.total || 0;
    });
    
    if (totalReq === 0) return `<div class="hero-sub" style="margin-top:14px;">No Requests</div>`;
    
    const ratio = totalOk / totalReq;
    const angle = (ratio * 180) - 90;
    
    return `
        <div style="margin-top: 16px; position: relative; width: 160px; height: 80px;">
            <svg viewBox="0 0 100 50" style="width: 160px; height: 80px; overflow: visible;">
                <defs>
                    <linearGradient id="speed-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stop-color="var(--bad)" />
                        <stop offset="50%" stop-color="var(--warn)" />
                        <stop offset="100%" stop-color="var(--ok)" />
                    </linearGradient>
                </defs>
                <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="rgba(255, 255, 255, 0.08)" stroke-width="8" stroke-linecap="round" />
                <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="url(#speed-grad)" stroke-width="8" stroke-linecap="round" opacity="0.9" />
                <g style="transform: rotate(${angle}deg); transform-origin: 50px 50px;">
                    <line x1="50" y1="50" x2="50" y2="12" stroke="#fff" stroke-width="3" stroke-linecap="round" />
                    <circle cx="50" cy="50" r="4" fill="#fff" />
                </g>
            </svg>
            <div style="text-align: center; font-family: var(--mono); font-size: 15px; margin-top: 12px; font-weight: 700;">
                ${(ratio * 100).toFixed(1)}% OK
            </div>
        </div>
    `;
}

function renderOverviewTab(data) {
    return `
        <div class="overview-grid">
            <div class="tool-card">
                <div class="tool-head">
                    <img src="${getLogoBase64('playwright-logo.svg')}" alt="Playwright" />
                    <h3>Playwright</h3>
                </div>
                ${getMiniChartHtml(data.playwright.passed || 0, data.playwright.failed || 0, data.playwright.skipped || 0, 'e2e')}
            </div>
            <div class="tool-card">
                <div class="tool-head">
                    <div style="width: 32px; height: 32px; background: var(--surface-3); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 16px;">⚡</div>
                    <h3>API</h3>
                </div>
                ${getMiniChartHtml(data.api.passed || 0, data.api.failed || 0, data.api.skipped || 0, 'e2e')}
            </div>
            <div class="tool-card">
                <div class="tool-head">
                    <img src="${getLogoBase64('appium-logo.png')}" alt="Appium" />
                    <h3>Appium</h3>
                </div>
                <div class="appium-split">
                    <div class="appium-platform">
                        <div class="appium-label">Android</div>
                        ${getMiniChartHtml(data.android.passed || 0, data.android.failed || 0, data.android.skipped || 0, 'e2e')}
                    </div>
                    <div class="appium-platform">
                        <div class="appium-label">iOS</div>
                        ${getMiniChartHtml(data.ios.passed || 0, data.ios.failed || 0, data.ios.skipped || 0, 'e2e')}
                    </div>
                </div>
            </div>
            <div class="tool-card">
                <div class="tool-head">
                    <img src="${getLogoBase64('gatling.png')}" alt="Gatling" />
                    <h3>Gatling</h3>
                </div>
                ${getSpeedometerHtml(data.gatling)}
            </div>
            <div class="tool-card">
                <div class="tool-head">
                    <img src="${getLogoBase64('pixelmatch-logo.png')}" alt="Visual" />
                    <h3>Visual</h3>
                </div>
                ${getMiniChartHtml(data.visual.verified || 0, data.visual.fail || 0, data.visual.bootstrapped || 0, 'pixelmatch')}
            </div>
        </div>
    `;
}

// ---- cucumber ------------------------------------------------------------

function renderScenarios(feature) {
    return feature.scenarios
        .map((s) => {
            const cls = s.status === 'failed' ? 'scenario scenario-fail' : 'scenario';
            const error = s.error
                ? `<div class="error">
                       <div class="error-step">at step: <code>${escape(s.error.step)}</code></div>
                       <div class="error-msg">${escape(s.error.message)}</div>
                   </div>`
                : '';
            return `
                <div class="${cls}">
                    <div class="scenario-head">
                        ${pill(s.status)}
                        <span class="scenario-name">${escape(s.name)}</span>
                        <span class="scenario-time">${fmtMs(s.durationNs)}</span>
                    </div>
                    ${error}
                </div>`;
        })
        .join('');
}

function conclusionCucumber(label, summary) {
    if (!summary.available || summary.total === 0) {
        return `No scenarios executed under <strong>${escape(label)}</strong>.`;
    }
    const { total, passed, failed, skipped, errorGroups } = summary;
    const rate = total ? Math.round((passed / total) * 100) : 0;
    const lines = [];
    if (failed === 0) {
        lines.push(`Everything passed under <strong>${escape(label)}</strong> — ${passed}/${total} scenarios green.`);
    } else if (passed > 0) {
        lines.push(`Partial run under <strong>${escape(label)}</strong>: ${passed}/${total} pass (${rate}%), ${failed} fail${failed === 1 ? '' : 's'}, ${skipped} skipped.`);
    } else {
        lines.push(`Severe regression under <strong>${escape(label)}</strong>: every scenario failed (${failed}/${total}).`);
    }

    if (errorGroups && errorGroups.length > 0) {
        const fragments = errorGroups
            .sort((a, b) => b.count - a.count)
            .map((g) => {
                const sample = g.scenarios.slice(0, 3).map((n) => `<code>${escape(n)}</code>`).join(', ');
                const more = g.scenarios.length > 3 ? ` and ${g.scenarios.length - 3} more` : '';
                return `<li><strong>${escape(g.message)}</strong> &mdash; affects ${sample}${more}.</li>`;
            });
        lines.push(`<div class="why"><p>Root cause grouping:</p><ul>${fragments.join('')}</ul></div>`);
    }
    return lines.join('<br><br>');
}

function renderCucumberTab(label, summary) {
    if (!summary.available) {
        return `<div class="hero hero-skip">
            <div class="hero-icon">○</div>
            <div class="hero-numbers">
                <div class="hero-headline">${escape(label)} — Not Run</div>
                <div class="hero-sub">No <code>reports/${escape((summary.platform || '').toLowerCase())}.json</code> found.</div>
            </div>
        </div>`;
    }

    const heroClass = summary.failed === 0
        ? 'hero hero-ok'
        : summary.passed === 0 ? 'hero hero-bad' : 'hero hero-warn';
    const heroIcon = summary.failed === 0 ? '✓' : summary.passed === 0 ? '✕' : '!';

    const cards = summary.features
        .map((f) => `
            <details class="feature" ${f.failed > 0 ? 'open' : ''}>
                <summary>
                    <span class="feature-name">${escape(f.name)}</span>
                    <span class="feature-meta">${f.passed}/${f.total} pass${f.failed > 0 ? ` &middot; ${f.failed} fail` : ''}</span>
                    <code class="feature-uri">${escape(f.uri)}</code>
                </summary>
                <div class="scenarios">${renderScenarios(f)}</div>
            </details>`)
        .join('');

    return `
        <div class="${heroClass}">
            <div class="hero-icon">${heroIcon}</div>
            <div class="hero-numbers">
                <div class="hero-headline">${summary.passed}/${summary.total} scenarios passed</div>
                <div class="hero-sub">${summary.failed} failed &middot; ${summary.skipped} skipped &middot; total step time ${fmtMs(summary.durationNs)}</div>
            </div>
        </div>
        <div class="conclusion">${conclusionCucumber(label, summary)}</div>
        <h3>Per feature</h3>
        ${cards}`;
}

// ---- gatling -------------------------------------------------------------

function renderGatlingCard(sim) {
    if (!sim.available) {
        return `<div class="gatling-card"><h3>${escape(sim.label)}</h3><p>(no log available)</p></div>`;
    }
    const allOk = sim.ko === 0;
    const cls = allOk ? 'gatling-card gatling-ok' : 'gatling-card gatling-bad';
    const errs = sim.errors.length
        ? `<div class="errors"><strong>Errors:</strong><ul>${sim.errors
              .map((e) => `<li>${escape(e.message)} — <code>${e.count}</code> (${escape(e.share)})</li>`)
              .join('')}</ul></div>`
        : '';
    const reqs = sim.requests.length
        ? `<div class="reqs"><strong>Per request:</strong><ul>${sim.requests
              .map((r) => `<li>${escape(r.name)}: ${r.ok}/${r.total} OK${r.ko ? ` &middot; <span class="ko">${r.ko} KO</span>` : ''}</li>`)
              .join('')}</ul></div>`
        : '';
    return `
        <div class="${cls}">
            <h3>${escape(sim.label)}</h3>
            <div class="kpi">
                <div><span class="kpi-label">Total req</span><span class="kpi-val">${sim.total}</span></div>
                <div><span class="kpi-label">OK</span><span class="kpi-val ok">${sim.ok}</span></div>
                <div><span class="kpi-label">KO</span><span class="kpi-val ko">${sim.ko}</span></div>
                <div><span class="kpi-label">Throughput</span><span class="kpi-val">${sim.throughput} rps</span></div>
            </div>
            <table class="rt">
                <thead><tr><th>min</th><th>mean</th><th>p50</th><th>p75</th><th>p95</th><th>p99</th><th>max</th></tr></thead>
                <tbody><tr>
                    <td>${sim.rt.min}</td><td>${sim.rt.mean}</td><td>${sim.rt.p50}</td>
                    <td>${sim.rt.p75}</td><td>${sim.rt.p95}</td><td>${sim.rt.p99}</td><td>${sim.rt.max}</td>
                </tr></tbody>
            </table>
            ${reqs}
            ${errs}
        </div>`;
}

// ---- visual --------------------------------------------------------------

function visualStatusPill(r) {
    if (r.baselineCreated) return `<span class="pill pill-boot">⊕ baselined</span>`;
    if (r.status === 'PASS') return `<span class="pill pill-pass">✓ verified</span>`;
    return `<span class="pill pill-fail">✕ drift</span>`;
}

function visualKeyPath(r) {
    const segs = [r.feature, r.snapshotId, r.platform, r.viewport].filter(Boolean);
    if (r.market) segs.push(String(r.market).toLowerCase());
    if (r.language) segs.push(String(r.language).toLowerCase());
    return segs.join(' / ');
}

function conclusionVisual(summary) {
    if (!summary.available || summary.total === 0) {
        return `No visual snapshots ran. Either <code>PLUGIN_PIXELMATCH=false</code>, no <code>@visual</code>-tagged scenarios reached the After hook, or this run targeted a non-UI driver.`;
    }
    const { total, fail, bootstrapped, verified } = summary;
    const lines = [];
    if (fail === 0) {
        lines.push(`All ${total} visual snapshots accounted for. <strong>${verified} verified</strong> against an existing baseline; <strong>${bootstrapped} bootstrapped</strong> (no baseline yet — current capture becomes the new baseline).`);
    } else {
        lines.push(`<strong>${fail}/${total} snapshots failed</strong>: ${verified} verified, ${bootstrapped} bootstrapped, ${fail} drift. Drift = either a legitimate UI change (regenerate baselines via <code>update-visual-baselines.yml</code>) or a snapshot-key collision.`);
    }
    return lines.join('<br><br>');
}

function renderVisualTab(visual) {
    if (!visual.available) {
        return `<div class="hero hero-skip">
            <div class="hero-icon">○</div>
            <div class="hero-numbers">
                <div class="hero-headline">Visual — Not Run</div>
                <div class="hero-sub">No <code>visual-results/</code> entries.</div>
            </div>
        </div>
        <div class="conclusion">${conclusionVisual(visual)}</div>`;
    }

    const groups = new Map();
    for (const r of visual.results) {
        const k = r.feature || 'unknown';
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(r);
    }

    const groupCards = [...groups.entries()]
        .map(([feature, results]) => {
            const fPass = results.filter((r) => r.status === 'PASS').length;
            const fFail = results.length - fPass;
            const rows = results.map((r) => {
                const diff = r.diffPixels !== null && r.diffPixels !== undefined
                    ? `${r.diffPixels} px (${((r.diffRatio ?? 0) * 100).toFixed(3)}%)`
                    : '—';
                const err = r.errorMessage
                    ? `<div class="error-msg">${escape(r.errorMessage)}</div>`
                    : '';
                
                let imagesHtml = '';
                if (r.resultPath) {
                    const reportsAbs = path.join(process.cwd(), 'reports');
                    const dir = path.dirname(r.resultPath);
                    const relDir = path.relative(reportsAbs, dir).replace(/\\/g, '/');

                    // Baselines live at visual-baselines/<rest>/baseline.png, where <rest>
                    // is the subpath of result.json after visual-results/<runId>/.
                    // Deriving (vs. honoring r.baselinePath which can be a foreign absolute
                    // path from CI) keeps the report portable across machines.
                    const m = r.resultPath.match(/visual-results[\\/][^\\/]+[\\/](.+?)[\\/]result\.json$/);
                    const baselineRel = m
                        ? path.relative(
                              reportsAbs,
                              path.join(process.cwd(), 'visual-baselines', m[1], 'baseline.png'),
                          ).replace(/\\/g, '/')
                        : null;

                    const baselineLabel = r.baselineCreated ? 'Baseline (new)' : 'Baseline';
                    const rightLabel = r.status === 'FAIL' ? 'Diff' : 'Actual';
                    const rightSrc = r.status === 'FAIL' ? `${relDir}/diff.png` : `${relDir}/actual.png`;
                    const rightBorder = r.status === 'FAIL' ? 'var(--bad)' : 'var(--border)';

                    imagesHtml = `
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 12px;">
                            <div>
                                <div style="font-size: 11px; color: var(--muted); margin-bottom: 4px;">${baselineLabel}</div>
                                ${baselineRel
                                    ? `<img src="${baselineRel}" style="max-width: 100%; border: 1px solid var(--border); border-radius: 6px;" onerror="this.replaceWith(Object.assign(document.createElement('div'),{style:'font-size:11px;color:var(--muted);padding:16px;border:1px dashed var(--border);border-radius:6px;',textContent:'baseline.png not on disk'}))" />`
                                    : `<div style="font-size: 11px; color: var(--muted); padding: 16px; border: 1px dashed var(--border); border-radius: 6px;">No baseline path</div>`}
                            </div>
                            <div>
                                <div style="font-size: 11px; color: var(--muted); margin-bottom: 4px;">${rightLabel}</div>
                                <img src="${rightSrc}" style="max-width: 100%; border: 1px solid ${rightBorder}; border-radius: 6px;" onerror="this.style.display='none'" />
                            </div>
                        </div>
                    `;
                }

                return `
                    <div class="scenario ${r.status === 'FAIL' ? 'scenario-fail' : ''}">
                        <div class="scenario-head" style="cursor: pointer;" onclick="const d = this.nextElementSibling; d.style.display = d.style.display === 'none' ? 'block' : 'none'">
                            ${visualStatusPill(r)}
                            <span class="scenario-name">${escape(visualKeyPath(r))}</span>
                            <span class="scenario-time">${diff}</span>
                        </div>
                        <div class="scenario-details" style="display: ${r.status === 'FAIL' ? 'block' : 'none'};">
                            ${err}
                            ${imagesHtml}
                        </div>
                    </div>`;
            }).join('');
            return `
                <details class="feature" ${fFail > 0 ? 'open' : ''}>
                    <summary>
                        <span class="feature-name">${escape(feature)}</span>
                        <span class="feature-meta">${fPass}/${results.length} pass${fFail > 0 ? ` · ${fFail} drift` : ''}</span>
                    </summary>
                    <div class="scenarios">${rows}</div>
                </details>`;
        })
        .join('');

    const heroClass = visual.fail === 0 ? 'hero hero-ok' : visual.pass === 0 ? 'hero hero-bad' : 'hero hero-warn';
    const heroIcon = visual.fail === 0 ? '✓' : visual.pass === 0 ? '✕' : '!';

    return `
        <div class="${heroClass}">
            <div class="hero-icon">${heroIcon}</div>
            <div class="hero-numbers">
                <div class="hero-headline">${visual.verified} verified · ${visual.bootstrapped} baselined · ${visual.fail} drift</div>
                <div class="hero-sub">${visual.total} snapshots over ${visual.runIds.length} run${visual.runIds.length === 1 ? '' : 's'} · ${visual.runIds.join(', ')}</div>
            </div>
        </div>
        <div class="conclusion">${conclusionVisual(visual)}</div>
        <h3>Per feature</h3>
        ${groupCards}`;
}

function conclusionGatling(simsArray) {
    const available = simsArray.filter((s) => s.available);
    if (available.length === 0) return 'No Gatling runs found.';
    const lines = [];
    for (const sim of available) {
        if (sim.ko === 0) {
            lines.push(`<strong>${escape(sim.label)}</strong> ran ${sim.total} request${sim.total === 1 ? '' : 's'} clean — p95 = ${sim.rt.p95} ms.`);
        } else {
            const errSummary = sim.errors.map((e) => `&ldquo;${escape(e.message)}&rdquo; (${e.count})`).join(', ') || '(none recorded)';
            lines.push(`<strong>${escape(sim.label)}</strong> saw ${sim.ko}/${sim.total} failures. Errors: ${errSummary}.`);
        }
    }
    return lines.join('<br>');
}

function renderGatlingTab(gatlingMap) {
    const simsArray = Object.values(gatlingMap);
    const available = simsArray.filter((s) => s.available);
    const totalReq = available.reduce((a, s) => a + (s.total || 0), 0);
    const totalKo = available.reduce((a, s) => a + (s.ko || 0), 0);
    const heroOk = totalKo === 0 && totalReq > 0;
    const heroBad = available.length > 0 && available.every((s) => s.ko === s.total && s.total > 0);
    const heroClass = available.length === 0 ? 'hero hero-skip' : heroOk ? 'hero hero-ok' : heroBad ? 'hero hero-bad' : 'hero hero-warn';
    const heroIcon = available.length === 0 ? '○' : heroOk ? '✓' : heroBad ? '✕' : '!';

    // Only render cards for sims that actually ran — keeps the grid readable
    // when only a subset of the 6 known sims has logs available.
    const cards = available.map(renderGatlingCard).join('') || '<p class="muted">No Gatling logs available for this run.</p>';

    return `
        <div class="${heroClass}">
            <div class="hero-icon">${heroIcon}</div>
            <div class="hero-numbers">
                <div class="hero-headline">${totalReq - totalKo}/${totalReq} requests OK</div>
                <div class="hero-sub">${totalKo} failed across ${available.length} simulation${available.length === 1 ? '' : 's'}</div>
            </div>
        </div>
        <div class="conclusion">${conclusionGatling(simsArray)}</div>
        <div class="gatling-grid">${cards}</div>`;
}

// ---- shell ---------------------------------------------------------------

function renderHtml(data) {
    const { playwright, api, android, ios, gatling, visual } = data;

    return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>OmniPizza · Test Run Report</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg:          #1b003a;
    --surface-1:   #230443;
    --surface-2:   #2e0755;
    --surface-3:   #3d0b60;
    --accent:      #a855f7;
    --accent-2:    #7c3aed;
    --glow:        rgba(168, 85, 247, 0.35);
    --glow-sm:     rgba(168, 85, 247, 0.15);
    --text:        #ffffff;
    --text-muted:  rgba(255,255,255,0.6);
    --border:      rgba(168, 85, 247, 0.25);
    --radius:      14px;
    --ok: #73bf69; --warn: #ff9830; --bad: #f2495c;
    --font:      'Segoe UI', system-ui, -apple-system, sans-serif;
    --font-mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    --mono: var(--font-mono);
    --panel: var(--surface-1); --panel-2: var(--surface-2); --muted: var(--text-muted);
  }
  html { scroll-behavior: smooth; }
  html, body { background: var(--bg); color: var(--text); font-family: var(--font); line-height: 1.6; }
  body { padding: 0 24px 48px; max-width: 1200px; margin: 0 auto; position: relative; z-index: 1; overflow-x: hidden; }
  body::before {
    content: '';
    position: fixed;
    inset: 0;
    background:
      radial-gradient(ellipse 50% 40% at 15% 8%,  rgba(168, 85, 247, 0.22), transparent 65%),
      radial-gradient(ellipse 45% 35% at 88% 18%, rgba(124, 58, 237, 0.28), transparent 65%),
      radial-gradient(ellipse 55% 45% at 12% 92%, rgba(21,  0,   46,  0.55), transparent 70%),
      radial-gradient(ellipse 40% 35% at 92% 95%, rgba(168, 85, 247, 0.10), transparent 65%);
    pointer-events: none;
    z-index: 0;
  }
  header { display: flex; align-items: baseline; justify-content: space-between; gap: 24px; padding: 32px 0 16px; flex-wrap: wrap; }
  header .header-left { display: flex; flex-direction: column; gap: 8px; }
  .tag {
    display: inline-block;
    font-size: .7rem;
    font-weight: 600;
    letter-spacing: .12em;
    text-transform: uppercase;
    color: var(--accent);
    background: rgba(168,85,247,.12);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 4px 14px;
    align-self: flex-start;
  }
  h1 {
    margin: 0;
    font-size: clamp(1.8rem, 4vw, 2.4rem);
    font-weight: 800;
    line-height: 1.1;
    background: linear-gradient(135deg, #fff 30%, var(--accent));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  h1 .brand { color: var(--accent); -webkit-text-fill-color: var(--accent); }
  .subtitle { color: var(--muted); font-size: 13px; font-family: var(--font-mono); }
  nav.tabs {
    display: flex;
    gap: 4px;
    margin: 8px -24px 24px;
    padding: 0 24px;
    border-bottom: 1px solid var(--border);
    flex-wrap: wrap;
    position: sticky;
    top: 0;
    z-index: 10;
    background: rgba(27,0,58,.85);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
  }
  nav.tabs button { background: transparent; color: var(--text-muted); border: none; border-bottom: 2px solid transparent; padding: 14px 20px; cursor: pointer; font-size: 14px; font-weight: 600; transition: color .2s, border-color .2s, background .2s; }
  nav.tabs button.active { color: var(--text); border-bottom-color: var(--accent); }
  nav.tabs button:hover { color: var(--text); background: rgba(168,85,247,.06); }
  .sub-tabs { display: flex; gap: 8px; margin-bottom: 20px; border-bottom: 1px solid var(--border); }
  .sub-tab-btn { background: transparent; color: var(--text-muted); border: none; border-bottom: 2px solid transparent; padding: 8px 16px; cursor: pointer; font-size: 13px; font-weight: 600; transition: color .2s, border-color .2s; }
  .sub-tab-btn.active { color: var(--text); border-bottom-color: var(--accent); }
  .sub-tab-btn:hover { color: var(--text); }
  .sub-tab { display: none; }
  .sub-tab.active { display: block; }
  .tab { display: none; }
  .tab.active { display: block; }
  .hero { display: flex; align-items: center; gap: 24px; padding: 24px 28px; border-radius: var(--radius); background: var(--panel); border-left: 6px solid var(--accent); margin-bottom: 24px; box-shadow: 0 12px 32px rgba(0,0,0,0.3); }
  .hero-ok { border-left-color: var(--ok); }
  .hero-warn { border-left-color: var(--warn); }
  .hero-bad { border-left-color: var(--bad); }
  .hero-skip { border-left-color: var(--muted); }
  .hero-icon { font-size: 40px; font-weight: 800; color: var(--accent); }
  .hero-ok .hero-icon { color: var(--ok); }
  .hero-warn .hero-icon { color: var(--warn); }
  .hero-bad .hero-icon { color: var(--bad); }
  .hero-skip .hero-icon { color: var(--muted); }
  .hero-headline { font-size: 22px; font-weight: 700; }
  .hero-sub { color: var(--muted); font-size: 13px; margin-top: 4px; }
  .conclusion { background: var(--panel); padding: 18px 22px; border-radius: var(--radius); line-height: 1.6; font-size: 14px; margin-bottom: 24px; border: 1px solid var(--border); }
  .conclusion .why { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); }
  .conclusion ul { margin: 8px 0 0; padding-left: 22px; }
  .conclusion code { font-family: var(--mono); font-size: 12px; background: var(--panel-2); padding: 1px 6px; border-radius: 4px; }
  h3 { font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: var(--muted); margin: 24px 0 12px; }
  .overview-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
    margin-bottom: 32px;
  }
  @media (max-width: 900px) { .overview-grid { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 560px) { .overview-grid { grid-template-columns: 1fr; } }
  .appium-split { display: flex; flex-direction: column; gap: 20px; margin-top: 4px; }
  .appium-platform { display: flex; flex-direction: column; gap: 2px; }
  .appium-label { font-size: 12px; color: var(--muted); font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
  .tool-card { background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); padding: 36px; transition: border-color .2s, box-shadow .2s, transform .2s; display: flex; flex-direction: column; }
  .tool-card:hover { border-color: var(--accent); box-shadow: 0 0 40px var(--glow); transform: translateY(-4px); }
  .tool-head { display: flex; align-items: center; gap: 14px; margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 14px; }
  .tool-head img { height: 32px; width: auto; object-fit: contain; }
  .tool-head h3 { margin: 0; color: var(--text); text-transform: none; font-size: 18px; letter-spacing: 0; }
  details.feature { background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius); margin-bottom: 10px; transition: border-color .2s, box-shadow .2s; }
  details.feature:hover { border-color: var(--accent); box-shadow: 0 0 20px var(--glow-sm); }
  details.feature summary { padding: 14px 18px; cursor: pointer; display: flex; align-items: center; gap: 14px; list-style: none; }
  details.feature summary::-webkit-details-marker { display: none; }
  details.feature summary::before { content: "▸"; color: var(--muted); transition: transform 0.2s; }
  details.feature[open] summary::before { transform: rotate(90deg); }
  .feature-name { font-weight: 600; flex: 1; }
  .feature-meta { color: var(--muted); font-size: 12px; }
  .feature-uri { font-family: var(--mono); font-size: 11px; color: var(--muted); }
  .scenarios { padding: 0 18px 14px; }
  .scenario { background: var(--panel-2); border: 1px solid var(--border); border-radius: 8px; padding: 12px 16px; margin-bottom: 8px; }
  .scenario-fail { border-color: var(--bad); }
  .scenario-head { display: flex; align-items: center; gap: 12px; }
  .scenario-name { flex: 1; font-size: 13px; }
  .scenario-time { color: var(--muted); font-size: 11px; font-family: var(--mono); }
  .pill { font-size: 10px; padding: 3px 8px; border-radius: 99px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; }
  .pill-pass { background: rgba(115, 191, 105, 0.15); color: var(--ok); }
  .pill-fail { background: rgba(242, 73, 92, 0.15); color: var(--bad); }
  .pill-skip { background: rgba(255, 152, 48, 0.15); color: var(--warn); }
  .pill-boot { background: rgba(168, 85, 247, 0.18); color: var(--accent); }
  .error { margin-top: 10px; padding: 10px 12px; background: rgba(242, 73, 92, 0.08); border-left: 3px solid var(--bad); border-radius: 4px; font-size: 12px; }
  .error-step { color: var(--muted); margin-bottom: 4px; }
  .error-msg { font-family: var(--mono); color: var(--bad); white-space: pre-wrap; }
  .gatling-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 800px) { .gatling-grid { grid-template-columns: 1fr; } }
  .gatling-card { background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius); padding: 28px; transition: border-color .2s, box-shadow .2s; }
  .gatling-card:hover { border-color: var(--accent); box-shadow: 0 0 28px var(--glow-sm); }
  .gatling-card h3 { margin: 0 0 14px; color: var(--text); text-transform: none; letter-spacing: 0; font-size: 16px; }
  .gatling-ok { border-left: 4px solid var(--ok); }
  .gatling-bad { border-left: 4px solid var(--bad); }
  .kpi { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
  .kpi > div { background: var(--panel-2); border-radius: 8px; padding: 10px; text-align: center; }
  .kpi-label { display: block; color: var(--muted); font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
  .kpi-val { font-size: 20px; font-weight: 700; font-family: var(--mono); }
  .kpi-val.ok { color: var(--ok); }
  .kpi-val.ko { color: var(--bad); }
  .rt { width: 100%; border-collapse: collapse; font-size: 11px; font-family: var(--mono); margin-bottom: 14px; }
  .rt th { color: var(--muted); padding: 6px 8px; text-align: right; border-bottom: 1px solid var(--border); }
  .rt td { padding: 8px; text-align: right; }
  .reqs ul, .errors ul { margin: 6px 0; padding-left: 20px; font-size: 12px; }
  .ko { color: var(--bad); font-weight: 700; }
  footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid var(--border); color: var(--muted); font-size: 11px; text-align: center; }
  footer code { font-family: var(--mono); }
</style>
</head>
<body>
<header>
  <div class="header-left">
    <span class="tag">Atomic Helix Model · Test Run</span>
    <h1><span class="brand">Omni</span>Pizza · Test Run Report</h1>
  </div>
  <span class="subtitle">${new Date().toLocaleString()}</span>
</header>

<nav class="tabs">
  <button class="tab-btn active" data-tab="overview">Overview</button>
  <button class="tab-btn" data-tab="playwright">Playwright (web)</button>
  <button class="tab-btn" data-tab="api">API</button>
  <button class="tab-btn" data-tab="appium">Appium (mobile)</button>
  <button class="tab-btn" data-tab="gatling">Gatling (perf)</button>
  <button class="tab-btn" data-tab="visual">Visual</button>
</nav>

<section id="tab-overview" class="tab active">${renderOverviewTab(data)}</section>
<section id="tab-playwright" class="tab">${renderCucumberTab('Playwright (HEADLESS=false)', playwright)}</section>
<section id="tab-api"        class="tab">${renderCucumberTab('DRIVER=api', api)}</section>
<section id="tab-appium"     class="tab">
  <nav class="sub-tabs">
    <button class="sub-tab-btn active" data-subtab="android">Android</button>
    <button class="sub-tab-btn" data-subtab="ios">iOS</button>
  </nav>
  <div id="subtab-android" class="sub-tab active">${renderCucumberTab('Android (Appium / Mobilewright)', android)}</div>
  <div id="subtab-ios" class="sub-tab">${renderCucumberTab('iOS (Appium / Mobilewright)', ios)}</div>
</section>
<section id="tab-gatling"    class="tab">${renderGatlingTab(gatling)}</section>
<section id="tab-visual"     class="tab">${renderVisualTab(visual)}</section>

<footer>
  Generated by <code>scripts/build-test-report.js</code> · OmniPizza @ <code>${escape(process.env.BASE_URL || 'render')}</code>
</footer>

<script>
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + id));
    });
  });
  document.querySelectorAll('.sub-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.subtab;
      document.querySelectorAll('.sub-tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.sub-tab').forEach((t) => t.classList.toggle('active', t.id === 'subtab-' + id));
    });
  });
</script>
</body>
</html>`;
}

module.exports = { renderHtml };
