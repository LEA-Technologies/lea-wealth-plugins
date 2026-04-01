/**
 * HTML report generator — LEA-branded agreement report with Tailwind CDN.
 */

const fs = require('fs');

// LEA logo SVG (inline for offline rendering)
const LEA_LOGO_SVG = `<svg width="120" height="38" viewBox="0 0 933 295" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M93.0479 75.6914V219.524H248.387" stroke="#2E483E" stroke-width="36.6017" stroke-miterlimit="16" stroke-linecap="square"/>
  <path d="M540.383 148.345V166.645H558.684V148.345H540.383ZM540.383 75.6914H558.684V57.3905H540.383V75.6914ZM333.275 75.6914V57.3905H314.974V75.6914H333.275ZM333.275 219.524H314.974V237.825H333.275V219.524ZM540.383 237.825H558.684V201.223H540.383V237.825ZM333.264 166.645H540.383V130.044H333.264V166.645ZM558.684 148.345V75.6914H522.082V148.345H558.684ZM540.383 57.3905H333.275V93.9923H540.383V57.3905ZM314.974 75.6914V219.524H351.576V75.6914H314.974ZM333.275 237.825H540.383V201.223H333.275V237.825Z" fill="#2E483E"/>
  <path d="M632.435 150.448L632.435 132.147L614.134 132.147L614.134 150.448L632.435 150.448ZM632.435 219.525L614.134 219.525L614.134 237.826L632.435 237.826L632.435 219.525ZM839.554 219.525L839.554 237.826L857.855 237.826L857.855 219.525L839.554 219.525ZM839.554 78.5669L857.855 78.5669L857.855 60.266L839.554 60.266L839.554 78.5669ZM632.435 60.266L614.134 60.266L614.134 96.8677L632.435 96.8677L632.435 60.266ZM839.554 132.147L632.435 132.147L632.435 168.749L839.554 168.749L839.554 132.147ZM614.134 150.448L614.134 219.525L650.735 219.525L650.735 150.448L614.134 150.448ZM632.435 237.826L839.554 237.826L839.554 201.224L632.435 201.224L632.435 237.826ZM857.855 219.525L857.855 78.5669L821.253 78.5669L821.253 219.525L857.855 219.525ZM839.554 60.266L632.435 60.266L632.435 96.8677L839.554 96.8677L839.554 60.266Z" fill="#2E483E"/>
</svg>`;

// Agreement type classification — maps matched patterns to type abbreviations.
// Order matters: first match wins (CEA > IMA > IPS > CA).
const AGREEMENT_TYPE_RULES = [
  { type: 'CEA', patterns: [/client\s*engagement\s*agreement/i, /\bcea\b/i] },
  { type: 'IMA', patterns: [/investment\s*management\s*agreement/i, /\bima\b/i] },
  { type: 'IPS', patterns: [/investment\s*policy\s*statement/i, /\bips\b/i] },
  { type: 'CA',  patterns: [/client\s*agreement/i] },
];

const AGREEMENT_TYPES = ['CA', 'IMA', 'IPS', 'CEA'];
const AGREEMENT_TYPE_LABELS = {
  CA: 'Client Agreement',
  IMA: 'Investment Management Agreement',
  IPS: 'Investment Policy Statement',
  CEA: 'Client Engagement Agreement',
};

function classifyAgreement(matchedPatterns) {
  if (!matchedPatterns || matchedPatterns.length === 0) return 'CA';
  for (const rule of AGREEMENT_TYPE_RULES) {
    for (const rulePattern of rule.patterns) {
      if (matchedPatterns.some(mp => mp === rulePattern.source)) {
        return rule.type;
      }
    }
  }
  return 'CA';
}

// ── Agreement Report ────────────────────────────────────────

function generateAgreementReport(households, firmName) {
  const totalHouseholds = households.length;
  const totalAgreements = households.reduce((sum, h) => sum + h.agreementCount, 0);

  // Build per-household type counts
  const householdRows = households.sort((a, b) => a.name.localeCompare(b.name)).map(h => {
    const typeCounts = { CA: 0, IMA: 0, IPS: 0, CEA: 0 };
    for (const a of h.agreements) {
      const type = classifyAgreement(a.matchedPatterns);
      typeCounts[type]++;
    }
    const hasAny = Object.values(typeCounts).some(v => v > 0);
    const hasMultiple = Object.values(typeCounts).some(v => v >= 2);
    return { name: h.name, totalFiles: h.totalFiles, agreements: h.agreements, typeCounts, hasAny, hasMultiple };
  });

  const multiplesCount = householdRows.filter(h => h.hasMultiple).length;

  const missingAll = householdRows.filter(h => !h.hasAny).length;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Client Agreement Coverage${firmName ? ' — ' + firmName : ''}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @media print { .no-print { display: none; } }
  </style>
</head>
<body class="bg-gradient-to-br from-slate-50 to-slate-100 min-h-screen">
  <div class="max-w-[1400px] mx-auto px-4 py-8">

    <!-- Header -->
    <div class="bg-white rounded-xl shadow-sm p-6 mb-6 border border-slate-200">
      <div class="flex justify-between items-start">
        <div>
          <div class="flex items-center gap-4">
            ${LEA_LOGO_SVG}
            <div class="border-l border-slate-200 pl-4">
              <h1 class="text-2xl font-bold text-slate-900">Client Agreement Coverage <span class="text-base font-normal text-slate-400">— a LEA Claude Skill</span></h1>
              <p class="text-slate-500 text-sm">${firmName || 'Agreement Report'}</p>
            </div>
          </div>
        </div>
        <div class="text-right">
          <p class="text-sm text-slate-500">Generated</p>
          <p class="font-medium text-slate-700">${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
      </div>
    </div>

    <!-- Summary + CSV -->
    <div class="flex justify-between items-center mb-6">
      <p class="text-slate-600 text-sm"><strong>${totalHouseholds} households</strong> with <strong>${totalAgreements} total agreements</strong> and <strong>${multiplesCount} potential multiples</strong></p>
      <button onclick="exportCSV()" class="bg-emerald-600 text-white px-4 py-1.5 rounded-lg hover:bg-emerald-700 transition font-medium text-sm no-print">
        Export CSV
      </button>
    </div>

    <!-- Agreement Coverage Table -->
    <div class="bg-white rounded-xl shadow-sm border border-slate-200 mb-6 overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-slate-200 bg-slate-50">
            <th class="text-left py-3 px-4 font-semibold text-slate-700 sticky left-0 bg-slate-50 min-w-[200px]">Household</th>
            <th class="text-center py-3 px-2 font-semibold text-slate-700 min-w-[60px]">Files</th>
            ${AGREEMENT_TYPES.map(type => `<th class="text-center py-3 px-2 font-semibold text-slate-700 min-w-[60px]"><span class="text-xs">${AGREEMENT_TYPE_LABELS[type]}</span></th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${householdRows.map((h, i) => {
            const missingRow = !h.hasAny;
            const rowBg = missingRow ? 'bg-red-50' : (i % 2 === 0 ? '' : 'bg-slate-50/50');
            const stickyBg = missingRow ? 'bg-red-50' : (i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50');
            return `
          <tr class="border-b border-slate-100 ${rowBg} hover:bg-slate-50">
            <td class="py-2.5 px-4 font-medium text-slate-900 sticky left-0 ${stickyBg}">${h.name}</td>
            <td class="py-2.5 px-2 text-center font-medium text-slate-700">${h.totalFiles}</td>
            ${AGREEMENT_TYPES.map(type => {
              const count = h.typeCounts[type];
              if (count >= 2) {
                return `<td class="py-2.5 px-2 text-center"><span class="inline-block bg-amber-100 text-amber-700 text-xs font-semibold rounded-full w-7 h-7 leading-7">${count}</span></td>`;
              } else if (count === 0) {
                return `<td class="py-2.5 px-2 text-center"><span class="text-red-400 font-semibold">0</span></td>`;
              } else {
                return `<td class="py-2.5 px-2 text-center text-slate-700 font-medium">${count}</td>`;
              }
            }).join('')}
          </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>

    <!-- Client Agreement Coverage -->
    <div class="bg-white rounded-xl shadow-sm p-5 mb-6 border border-slate-200">
      <h2 class="text-lg font-semibold text-slate-800 mb-1">Client Agreement Coverage</h2>
      <p class="text-slate-400 text-xs mb-4">Rollup across all agreement types found in your households</p>
      <div class="flex gap-3">
        <div class="rounded-lg border ${missingAll === 0 ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'} p-3 w-56">
          <div class="text-xs font-semibold text-slate-700">Households Missing Client Agreements</div>
          <div class="text-2xl font-bold ${missingAll === 0 ? 'text-emerald-600' : 'text-red-600'} mt-1">${missingAll}</div>
          <div class="text-xs ${missingAll === 0 ? 'text-emerald-600' : 'text-red-600'} mt-1">${missingAll === 0 ? 'All households covered' : missingAll + ' of ' + totalHouseholds + ' missing'}</div>
        </div>
        <div class="rounded-lg border ${multiplesCount === 0 ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'} p-3 w-56">
          <div class="text-xs font-semibold text-slate-700">Households with Duplicate Agreements</div>
          <div class="text-2xl font-bold ${multiplesCount === 0 ? 'text-emerald-600' : 'text-amber-600'} mt-1">${multiplesCount}</div>
          <div class="text-xs ${multiplesCount === 0 ? 'text-emerald-600' : 'text-amber-600'} mt-1">${multiplesCount === 0 ? 'No duplicates found' : multiplesCount + ' household' + (multiplesCount !== 1 ? 's' : '') + ' with 2+'}</div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="text-center text-sm text-slate-400 mt-8 mb-4">
      Got questions? Want more? <a href="mailto:claude-skills@getlea.io" class="text-emerald-600 hover:underline">claude-skills@getlea.io</a>
    </div>

  </div>

  <script>
    const reportData = ${JSON.stringify(households)};

    // Agreement type classifier (mirrors server-side logic)
    const TYPE_RULES = [
      { type: 'CEA', patterns: [/client\\s*engagement\\s*agreement/i, /\\bcea\\b/i] },
      { type: 'IMA', patterns: [/investment\\s*management\\s*agreement/i, /\\bima\\b/i] },
      { type: 'IPS', patterns: [/investment\\s*policy\\s*statement/i, /\\bips\\b/i] },
      { type: 'CA',  patterns: [/client\\s*agreement/i] },
    ];

    const TYPE_LABELS = {
      CA: 'Client Agreement',
      IMA: 'Investment Management Agreement',
      IPS: 'Investment Policy Statement',
      CEA: 'Client Engagement Agreement',
    };

    function classifyAgreementType(matchedPatterns) {
      if (!matchedPatterns || matchedPatterns.length === 0) return 'CA';
      for (const rule of TYPE_RULES) {
        for (const rp of rule.patterns) {
          if (matchedPatterns.some(mp => rp.source === mp)) return rule.type;
        }
      }
      return 'CA';
    }

    function exportCSV() {
      const TYPES = ['CA', 'IMA', 'IPS', 'CEA'];
      const rows = [['Household', 'Files', 'Client Agreement', 'Investment Management Agreement', 'Investment Policy Statement', 'Client Engagement Agreement']];
      for (const h of reportData) {
        const counts = { CA: 0, IMA: 0, IPS: 0, CEA: 0 };
        for (const a of (h.agreements || [])) {
          const type = classifyAgreementType(a.matchedPatterns);
          counts[type]++;
        }
        rows.push([h.name, h.totalFiles, counts.CA, counts.IMA, counts.IPS, counts.CEA]);
      }
      const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'client-agreement-coverage.csv';
      a.click();
    }
  </script>
</body>
</html>`;
}

// ── Export ───────────────────────────────────────────────────

function generateReport(type, data, outputPath, firmName) {
  if (type !== 'agreement') {
    throw new Error(`Unknown report type: ${type}`);
  }

  const html = generateAgreementReport(data, firmName);
  fs.writeFileSync(outputPath, html);
  return outputPath;
}

module.exports = { generateReport };
