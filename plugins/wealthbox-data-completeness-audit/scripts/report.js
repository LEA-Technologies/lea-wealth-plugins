/**
 * HTML report generator for Wealthbox Data Completeness Audit.
 * LEA-branded with Tailwind CDN, matching Box/Egnyte/SharePoint report style.
 */

const fs = require('fs');

// LEA logo SVG (inline for offline rendering)
const LEA_LOGO_SVG = `<svg width="120" height="38" viewBox="0 0 933 295" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M93.0479 75.6914V219.524H248.387" stroke="#2E483E" stroke-width="36.6017" stroke-miterlimit="16" stroke-linecap="square"/>
  <path d="M540.383 148.345V166.645H558.684V148.345H540.383ZM540.383 75.6914H558.684V57.3905H540.383V75.6914ZM333.275 75.6914V57.3905H314.974V75.6914H333.275ZM333.275 219.524H314.974V237.825H333.275V219.524ZM540.383 237.825H558.684V201.223H540.383V237.825ZM333.264 166.645H540.383V130.044H333.264V166.645ZM558.684 148.345V75.6914H522.082V148.345H558.684ZM540.383 57.3905H333.275V93.9923H540.383V57.3905ZM314.974 75.6914V219.524H351.576V75.6914H314.974ZM333.275 237.825H540.383V201.223H333.275V237.825Z" fill="#2E483E"/>
  <path d="M632.435 150.448L632.435 132.147L614.134 132.147L614.134 150.448L632.435 150.448ZM632.435 219.525L614.134 219.525L614.134 237.826L632.435 237.826L632.435 219.525ZM839.554 219.525L839.554 237.826L857.855 237.826L857.855 219.525L839.554 219.525ZM839.554 78.5669L857.855 78.5669L857.855 60.266L839.554 60.266L839.554 78.5669ZM632.435 60.266L614.134 60.266L614.134 96.8677L632.435 96.8677L632.435 60.266ZM839.554 132.147L632.435 132.147L632.435 168.749L839.554 168.749L839.554 132.147ZM614.134 150.448L614.134 219.525L650.735 219.525L650.735 150.448L614.134 150.448ZM632.435 237.826L839.554 237.826L839.554 201.224L632.435 201.224L632.435 237.826ZM857.855 219.525L857.855 78.5669L821.253 78.5669L821.253 219.525L857.855 219.525ZM839.554 60.266L632.435 60.266L632.435 96.8677L839.554 96.8677L839.554 60.266Z" fill="#2E483E"/>
</svg>`;

// ── Data Completeness Report ─────────────────────────────────────

function generateAuditReport(auditData, firmName) {
  const { totalContacts, averageScore, needsAttention, fieldStats, contacts, skippedNonPerson } = auditData;

  // Group field stats by category
  const groups = {};
  for (const f of fieldStats) {
    if (!groups[f.group]) groups[f.group] = [];
    groups[f.group].push(f);
  }

  const groupOrder = ['Contact Basics', 'Personal', 'Relationship', 'Financial', 'Compliance'];

  // Score color
  function scoreColor(score) {
    if (score >= 80) return 'emerald';
    if (score >= 50) return 'amber';
    return 'red';
  }

  function severityColor(pct) {
    if (pct >= 90) return 'emerald';
    if (pct >= 60) return 'amber';
    return 'red';
  }

  function formatCurrency(val) {
    if (val == null) return '';
    return '$' + Number(val).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  const avgColor = scoreColor(averageScore);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Wealthbox Data Completeness Report${firmName ? ' - ' + firmName : ''}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @media print { .no-print { display: none; } }
  </style>
</head>
<body class="bg-gradient-to-br from-slate-50 to-slate-100 min-h-screen">
  <div class="max-w-[1200px] mx-auto px-4 py-8">

    <!-- Header -->
    <div class="bg-white rounded-xl shadow-sm p-6 mb-6 border border-slate-200">
      <div class="flex justify-between items-start">
        <div>
          <div class="flex items-center gap-4">
            ${LEA_LOGO_SVG}
            <div class="border-l border-slate-200 pl-4">
              <h1 class="text-2xl font-bold text-slate-900">Wealthbox Data Completeness Audit <span class="text-base font-normal text-slate-400">- a LEA Claude Skill</span></h1>
              <p class="text-slate-500 text-sm">${firmName || 'CRM Data Completeness Report'}</p>
            </div>
          </div>
        </div>
        <div class="text-right">
          <p class="text-sm text-slate-500">Generated</p>
          <p class="font-medium text-slate-700">${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
      </div>
    </div>

    <!-- Summary Cards -->
    <div class="grid grid-cols-3 gap-4 mb-6">
      <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5 text-center">
        <p class="text-sm text-slate-500 mb-1">Contacts Audited</p>
        <p class="text-3xl font-bold text-slate-900">${totalContacts}</p>
        ${skippedNonPerson > 0 ? `<p class="text-xs text-slate-400 mt-1">${skippedNonPerson} non-person records skipped</p>` : ''}
      </div>
      <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5 text-center">
        <p class="text-sm text-slate-500 mb-1">Average Data Completeness</p>
        <p class="text-3xl font-bold text-${avgColor}-600">${averageScore}%</p>
        <p class="text-xs text-slate-400 mt-1">weighted score across ${fieldStats.length} fields</p>
      </div>
      <div class="bg-white rounded-xl shadow-sm border border-${needsAttention > 0 ? 'red' : 'emerald'}-200 p-5 text-center ${needsAttention > 0 ? 'bg-red-50' : 'bg-emerald-50'}">
        <p class="text-sm text-slate-500 mb-1">Contacts Needing Attention</p>
        <p class="text-3xl font-bold text-${needsAttention > 0 ? 'red' : 'emerald'}-600">${needsAttention}</p>
        <p class="text-xs text-${needsAttention > 0 ? 'red' : 'emerald'}-500 mt-1">${needsAttention > 0 ? 'below 50% completeness score' : 'all contacts above 50%'}</p>
      </div>
    </div>

    <!-- Field Completeness -->
    <div class="bg-white rounded-xl shadow-sm border border-slate-200 mb-6">
      <div class="p-5 border-b border-slate-200">
        <div class="flex justify-between items-center">
          <div>
            <h2 class="text-lg font-semibold text-slate-800">Field Completeness</h2>
            <p class="text-slate-400 text-xs mt-1">How complete is each field across all ${totalContacts} contacts?</p>
          </div>
        </div>
      </div>
      <div class="p-5">
        ${groupOrder.map(groupName => {
          const fields = groups[groupName] || [];
          if (fields.length === 0) return '';
          return `
        <div class="mb-5 last:mb-0">
          <h3 class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">${groupName}</h3>
          <div class="space-y-2">
            ${fields.map(f => {
              const sev = severityColor(f.percentage);
              const barWidth = Math.max(f.percentage, 2);
              return `
            <div class="flex items-center gap-3">
              <div class="w-40 text-sm text-slate-700 font-medium">${f.label}</div>
              <div class="flex-1 bg-slate-100 rounded-full h-5 relative overflow-hidden">
                <div class="bg-${sev}-400 h-5 rounded-full transition-all" style="width: ${barWidth}%"></div>
              </div>
              <div class="w-14 text-right text-sm font-semibold text-${sev}-600">${f.percentage}%</div>
              <div class="w-24 text-right text-xs text-slate-400">${f.withData} of ${f.withData + f.withoutData}</div>
            </div>`;
            }).join('')}
          </div>
        </div>`;
        }).join('')}
      </div>
    </div>

    <!-- Contact Detail Table -->
    <div class="bg-white rounded-xl shadow-sm border border-slate-200 mb-6">
      <div class="p-5 border-b border-slate-200">
        <div class="flex justify-between items-center">
          <div>
            <h2 class="text-lg font-semibold text-slate-800">Contact Details</h2>
            <p class="text-slate-400 text-xs mt-1">All contacts sorted by completeness score (lowest first)</p>
          </div>
          <button onclick="exportCSV()" class="bg-emerald-600 text-white px-4 py-1.5 rounded-lg hover:bg-emerald-700 transition font-medium text-sm no-print">
            Export CSV
          </button>
        </div>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-slate-200 bg-slate-50">
              <th class="text-left py-3 px-4 font-semibold text-slate-700 min-w-[180px]">Name</th>
              <th class="text-left py-3 px-3 font-semibold text-slate-700 min-w-[180px]">Email</th>
              <th class="text-left py-3 px-3 font-semibold text-slate-700 min-w-[120px]">Phone</th>
              <th class="text-center py-3 px-3 font-semibold text-slate-700 min-w-[80px]">DOB</th>
              <th class="text-left py-3 px-3 font-semibold text-slate-700 min-w-[140px]">Household</th>
              <th class="text-right py-3 px-3 font-semibold text-slate-700 min-w-[90px]">Assets</th>
              <th class="text-center py-3 px-3 font-semibold text-slate-700 min-w-[70px]">Score</th>
              <th class="text-center py-3 px-3 font-semibold text-slate-700 min-w-[70px]">Missing</th>
            </tr>
          </thead>
          <tbody>
            ${contacts.map((c, i) => {
              const sc = scoreColor(c.score);
              return `
            <tr class="border-b border-slate-100 ${i % 2 === 0 ? '' : 'bg-slate-50/50'} hover:bg-slate-50">
              <td class="py-2.5 px-4 font-medium text-slate-900">${escapeHtml(c.name)}</td>
              <td class="py-2.5 px-3 text-slate-600">${c.email ? escapeHtml(c.email) : '<span class="text-red-400 text-xs">missing</span>'}</td>
              <td class="py-2.5 px-3 text-slate-600">${c.phone ? escapeHtml(c.phone) : '<span class="text-red-400 text-xs">missing</span>'}</td>
              <td class="py-2.5 px-3 text-center">${c.birth_date ? '<span class="text-emerald-600">&#10003;</span>' : '<span class="text-red-400 text-xs">missing</span>'}</td>
              <td class="py-2.5 px-3 text-slate-600">${c.household ? escapeHtml(c.household) : '<span class="text-red-400 text-xs">none</span>'}</td>
              <td class="py-2.5 px-3 text-right text-slate-600">${c.assets != null ? formatCurrency(c.assets) : '<span class="text-slate-300">-</span>'}</td>
              <td class="py-2.5 px-3 text-center"><span class="inline-block bg-${sc}-100 text-${sc}-700 text-xs font-semibold rounded-full px-2.5 py-0.5">${c.score}%</span></td>
              <td class="py-2.5 px-3 text-center">${c.missingCount > 0 ? `<span class="inline-block bg-amber-100 text-amber-700 text-xs font-semibold rounded-full w-7 h-7 leading-7">${c.missingCount}</span>` : '<span class="text-emerald-600">&#10003;</span>'}</td>
            </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Footer -->
    <div class="text-center text-sm text-slate-400 mt-8 mb-4">
      Want to fix this automatically? <a href="mailto:claude-skills@getlea.io" class="text-emerald-600 hover:underline font-medium">claude-skills@getlea.io</a>
    </div>

  </div>

  <script>
    const reportContacts = ${JSON.stringify(contacts)};

    function exportCSV() {
      const headers = ['Name', 'Email', 'Phone', 'Date of Birth', 'Household', 'Assets', 'Status', 'Score', 'Missing Fields Count', 'Missing Fields'];
      const rows = [headers];
      for (const c of reportContacts) {
        rows.push([
          c.name,
          c.email || '',
          c.phone || '',
          c.birth_date || '',
          c.household || '',
          c.assets != null ? c.assets : '',
          c.status || '',
          c.score + '%',
          c.missingCount,
          (c.missingFields || []).join('; ')
        ]);
      }
      const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'wealthbox-data-completeness-audit.csv';
      a.click();
    }
  </script>
</body>
</html>`;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Export ───────────────────────────────────────────────────

function generateReport(type, data, outputPath, firmName) {
  if (type !== 'audit') {
    throw new Error(`Unknown report type: ${type}. Expected 'audit'.`);
  }

  const html = generateAuditReport(data, firmName);
  fs.writeFileSync(outputPath, html);
  return outputPath;
}

module.exports = { generateReport };
