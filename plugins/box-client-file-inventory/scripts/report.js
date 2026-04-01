/**
 * HTML report generator — LEA-branded inventory report with Tailwind CDN.
 */

const fs = require('fs');

const FILE_TYPE_CATEGORIES = {
  'PDFs': ['.pdf'],
  'Word': ['.doc', '.docx'],
  'Spreadsheets': ['.xls', '.xlsx', '.csv'],
  'Images': ['.jpg', '.jpeg', '.png', '.gif', '.tiff', '.bmp'],
  'Presentations': ['.ppt', '.pptx'],
  'Text': ['.txt', '.rtf']
};

function categorizeFile(filename) {
  const ext = ('.' + filename.split('.').pop()).toLowerCase();
  for (const [category, exts] of Object.entries(FILE_TYPE_CATEGORIES)) {
    if (exts.includes(ext)) return category;
  }
  return 'Other';
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

// LEA logo SVG (inline for offline rendering)
const LEA_LOGO_SVG = `<svg width="120" height="38" viewBox="0 0 933 295" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M93.0479 75.6914V219.524H248.387" stroke="#2E483E" stroke-width="36.6017" stroke-miterlimit="16" stroke-linecap="square"/>
  <path d="M540.383 148.345V166.645H558.684V148.345H540.383ZM540.383 75.6914H558.684V57.3905H540.383V75.6914ZM333.275 75.6914V57.3905H314.974V75.6914H333.275ZM333.275 219.524H314.974V237.825H333.275V219.524ZM540.383 237.825H558.684V201.223H540.383V237.825ZM333.264 166.645H540.383V130.044H333.264V166.645ZM558.684 148.345V75.6914H522.082V148.345H558.684ZM540.383 57.3905H333.275V93.9923H540.383V57.3905ZM314.974 75.6914V219.524H351.576V75.6914H314.974ZM333.275 237.825H540.383V201.223H333.275V237.825Z" fill="#2E483E"/>
  <path d="M632.435 150.448L632.435 132.147L614.134 132.147L614.134 150.448L632.435 150.448ZM632.435 219.525L614.134 219.525L614.134 237.826L632.435 237.826L632.435 219.525ZM839.554 219.525L839.554 237.826L857.855 237.826L857.855 219.525L839.554 219.525ZM839.554 78.5669L857.855 78.5669L857.855 60.266L839.554 60.266L839.554 78.5669ZM632.435 60.266L614.134 60.266L614.134 96.8677L632.435 96.8677L632.435 60.266ZM839.554 132.147L632.435 132.147L632.435 168.749L839.554 168.749L839.554 132.147ZM614.134 150.448L614.134 219.525L650.735 219.525L650.735 150.448L614.134 150.448ZM632.435 237.826L839.554 237.826L839.554 201.224L632.435 201.224L632.435 237.826ZM857.855 219.525L857.855 78.5669L821.253 78.5669L821.253 219.525L857.855 219.525ZM839.554 60.266L632.435 60.266L632.435 96.8677L839.554 96.8677L839.554 60.266Z" fill="#2E483E"/>
</svg>`;

// Tag colors for document categories
const TAG_COLORS = {
  'Trust & Estate': { bg: 'bg-violet-100', text: 'text-violet-700', border: 'border-violet-200' },
  'Statements': { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200' },
  'Tax Documents': { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' },
  'Insurance': { bg: 'bg-teal-100', text: 'text-teal-700', border: 'border-teal-200' },
  'Agreements': { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200' },
  'Real Estate': { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200' },
  'Identity & Personal': { bg: 'bg-pink-100', text: 'text-pink-700', border: 'border-pink-200' },
  'Financial Planning': { bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-indigo-200' },
  'Correspondence': { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' },
  'Unknown': { bg: 'bg-gray-100', text: 'text-gray-500', border: 'border-gray-200' }
};

function getTagColor(tag) {
  return TAG_COLORS[tag] || TAG_COLORS['Unknown'];
}

// ── Inventory Report ────────────────────────────────────────

function generateInventoryReport(households, firmName) {
  const totalFiles = households.reduce((sum, h) => sum + h.totalFiles, 0);
  const emptyFolders = households.filter(h => h.totalFiles === 0).length;

  // Aggregate document tags across all households
  const tagBreakdown = {};
  for (const h of households) {
    for (const file of h.files) {
      const tags = file.tags || ['Unknown'];
      for (const tag of tags) {
        tagBreakdown[tag] = (tagBreakdown[tag] || 0) + 1;
      }
    }
  }
  const sortedTags = Object.entries(tagBreakdown).sort((a, b) => b[1] - a[1]);

  // Always show all category columns in fixed order (exclude Unknown — it gets its own column)
  const ALL_CATEGORIES = [
    'Agreements', 'Tax Documents', 'Statements', 'Trust & Estate',
    'Insurance', 'Financial Planning', 'Identity & Personal',
    'Real Estate', 'Correspondence'
  ];
  const categoryTags = ALL_CATEGORIES;

  // Build per-household tag counts for the table
  const householdRows = households.sort((a, b) => a.name.localeCompare(b.name)).map(h => {
    const tags = {};
    for (const file of h.files) {
      for (const tag of (file.tags || ['Unknown'])) {
        tags[tag] = (tags[tag] || 0) + 1;
      }
    }
    return { name: h.name, totalFiles: h.totalFiles, unknownCount: tags['Unknown'] || 0, tags };
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Box File Inventory Report${firmName ? ' — ' + firmName : ''}</title>
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
              <h1 class="text-2xl font-bold text-slate-900">Box File Inventory <span class="text-base font-normal text-slate-400">— a LEA Claude Skill</span></h1>
              <p class="text-slate-500 text-sm">${firmName || 'Client File Report'}</p>
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
      <p class="text-slate-600 text-sm"><strong>${households.length} households</strong> with <strong>${totalFiles.toLocaleString()} total files</strong> inventoried</p>
      <button onclick="exportCSV()" class="bg-emerald-600 text-white px-4 py-1.5 rounded-lg hover:bg-emerald-700 transition font-medium text-sm no-print">
        Export CSV
      </button>
    </div>

    <!-- Household Coverage Table -->
    <div class="bg-white rounded-xl shadow-sm border border-slate-200 mb-6 overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-slate-200 bg-slate-50">
            <th class="text-left py-3 px-4 font-semibold text-slate-700 sticky left-0 bg-slate-50 min-w-[200px]">Household</th>
            <th class="text-center py-3 px-2 font-semibold text-slate-700 min-w-[60px]">Files</th>
            <th class="text-center py-3 px-2 font-medium min-w-[70px] border-r border-slate-200"><span class="text-xs text-amber-600">Needs Review</span></th>
            ${categoryTags.map(tag => {
              const colors = getTagColor(tag);
              return `<th class="text-center py-3 px-2 font-medium min-w-[50px]"><span class="text-xs ${colors.text}">${tag}</span></th>`;
            }).join('')}
          </tr>
        </thead>
        <tbody>
          ${householdRows.map((h, i) => `
          <tr class="border-b border-slate-100 ${i % 2 === 0 ? '' : 'bg-slate-50/50'} hover:bg-slate-50">
            <td class="py-2.5 px-4 font-medium text-slate-900 sticky left-0 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}">${h.name}</td>
            <td class="py-2.5 px-2 text-center font-medium ${h.totalFiles === 0 ? 'text-amber-600' : 'text-slate-700'}">${h.totalFiles}</td>
            <td class="py-2.5 px-2 text-center border-r border-slate-200">${h.unknownCount > 0 ? `<span class="inline-block bg-amber-100 text-amber-700 text-xs font-semibold rounded-full w-7 h-7 leading-7">${h.unknownCount}</span>` : `<span class="text-slate-300 text-xs">0</span>`}</td>
            ${categoryTags.map(tag => {
              const count = h.tags[tag] || 0;
              if (count > 0) {
                return `<td class="py-2.5 px-2 text-center text-slate-700 font-medium">${count}</td>`;
              } else {
                return `<td class="py-2.5 px-2 text-center"><span class="text-red-400 font-semibold">0</span></td>`;
              }
            }).join('')}
          </tr>`).join('')}
        </tbody>
      </table>
    </div>

    <!-- Client Document Coverage -->
    <div class="bg-white rounded-xl shadow-sm p-5 mb-6 border border-slate-200">
      <h2 class="text-lg font-semibold text-slate-800 mb-1">Client Document Coverage</h2>
      <p class="text-slate-400 text-xs mb-4">What percentage of your households have each document type on file?</p>
      <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
        ${ALL_CATEGORIES.map(tag => {
          const count = tagBreakdown[tag] || 0;
          const hhWithTag = households.filter(h => h.files.some(f => (f.tags || []).includes(tag))).length;
          const hhMissing = households.length - hhWithTag;
          const hhPct = households.length > 0 ? Math.round((hhWithTag / households.length) * 100) : 0;
          const severity = hhPct >= 80 ? 'emerald' : hhPct >= 50 ? 'amber' : 'red';
          return `
        <div class="rounded-lg border ${severity === 'emerald' ? 'border-emerald-200 bg-emerald-50' : severity === 'amber' ? 'border-amber-200 bg-amber-50' : 'border-red-200 bg-red-50'} p-3">
          <div class="text-xs font-semibold text-slate-700">${tag}</div>
          <div class="text-2xl font-bold ${severity === 'emerald' ? 'text-emerald-600' : severity === 'amber' ? 'text-amber-600' : 'text-red-600'} mt-1">${hhPct}%</div>
          <div class="text-xs ${severity === 'emerald' ? 'text-emerald-600' : severity === 'amber' ? 'text-amber-600' : 'text-red-600'} mt-1">${hhMissing === 0 ? 'All households covered' : hhMissing + ' of ' + households.length + ' households missing'}</div>
        </div>`;
        }).join('')}
      </div>
    </div>

    <!-- Footer -->
    <div class="text-center text-sm text-slate-400 mt-8 mb-4">
      Got questions? Want more? <a href="mailto:claude-skills@getlea.io" class="text-emerald-600 hover:underline">claude-skills@getlea.io</a>
    </div>

  </div>

  <script>
    const reportData = ${JSON.stringify(households)};

    function exportCSV() {
      const CATEGORIES = [
        'Agreements', 'Tax Documents', 'Statements', 'Trust & Estate',
        'Insurance', 'Financial Planning', 'Identity & Personal',
        'Real Estate', 'Correspondence'
      ];
      const rows = [['Household', 'Files', 'Needs Review', ...CATEGORIES]];
      for (const h of reportData) {
        const tags = {};
        for (const f of h.files) {
          for (const tag of (f.tags || ['Unknown'])) {
            tags[tag] = (tags[tag] || 0) + 1;
          }
        }
        rows.push([h.name, h.totalFiles, tags['Unknown'] || 0, ...CATEGORIES.map(c => tags[c] || 0)]);
      }
      const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'box-file-inventory.csv';
      a.click();
    }
  </script>
</body>
</html>`;
}

// ── Export ───────────────────────────────────────────────────

function generateReport(type, data, outputPath, firmName) {
  if (type !== 'inventory') {
    throw new Error(`Unknown report type: ${type}`);
  }

  const html = generateInventoryReport(data, firmName);
  fs.writeFileSync(outputPath, html);
  return outputPath;
}

module.exports = { generateReport, categorizeFile, formatBytes, FILE_TYPE_CATEGORIES };
