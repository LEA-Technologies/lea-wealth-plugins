/**
 * HTML report generator for Practifi Agreement Compliance.
 * Shows cross-reference between CRM households and vault agreements.
 */

const fs = require('fs');

const LEA_LOGO_SVG = `<svg width="120" height="38" viewBox="0 0 933 295" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M93.0479 75.6914V219.524H248.387" stroke="#2E483E" stroke-width="36.6017" stroke-miterlimit="16" stroke-linecap="square"/>
  <path d="M540.383 148.345V166.645H558.684V148.345H540.383ZM540.383 75.6914H558.684V57.3905H540.383V75.6914ZM333.275 75.6914V57.3905H314.974V75.6914H333.275ZM333.275 219.524H314.974V237.825H333.275V219.524ZM540.383 237.825H558.684V201.223H540.383V237.825ZM333.264 166.645H540.383V130.044H333.264V166.645ZM558.684 148.345V75.6914H522.082V148.345H558.684ZM540.383 57.3905H333.275V93.9923H540.383V57.3905ZM314.974 75.6914V219.524H351.576V75.6914H314.974ZM333.275 237.825H540.383V201.223H333.275V237.825Z" fill="#2E483E"/>
  <path d="M632.435 150.448L632.435 132.147L614.134 132.147L614.134 150.448L632.435 150.448ZM632.435 219.525L614.134 219.525L614.134 237.826L632.435 237.826L632.435 219.525ZM839.554 219.525L839.554 237.826L857.855 237.826L857.855 219.525L839.554 219.525ZM839.554 78.5669L857.855 78.5669L857.855 60.266L839.554 60.266L839.554 78.5669ZM632.435 60.266L614.134 60.266L614.134 96.8677L632.435 96.8677L632.435 60.266ZM839.554 132.147L632.435 132.147L632.435 168.749L839.554 168.749L839.554 132.147ZM614.134 150.448L614.134 219.525L650.735 219.525L650.735 150.448L614.134 150.448ZM632.435 237.826L839.554 237.826L839.554 201.224L632.435 201.224L632.435 237.826ZM857.855 219.525L857.855 78.5669L821.253 78.5669L821.253 219.525L857.855 219.525ZM839.554 60.266L632.435 60.266L632.435 96.8677L839.554 96.8677L839.554 60.266Z" fill="#2E483E"/>
</svg>`;

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function generateComplianceReport(data) {
  const {
    platform, totalPfHouseholds, totalVaultFolders,
    totalMatched, totalUnmatchedPf, totalUnmatchedVault,
    withAllAgreements, missingAny,
    matched, unmatchedPf, unmatchedVault
  } = data;

  const platformLabel = { box: 'Box', sharepoint: 'SharePoint', egnyte: 'Egnyte' }[platform] || platform;
  const matchRate = totalPfHouseholds > 0 ? Math.round((totalMatched / totalPfHouseholds) * 100) : 0;
  const complianceRate = totalMatched > 0 ? Math.round((withAllAgreements / totalMatched) * 100) : 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Practifi Agreement Compliance Report</title>
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
              <h1 class="text-2xl font-bold text-slate-900">Agreement Compliance Report <span class="text-base font-normal text-slate-400">- a LEA Claude Skill</span></h1>
              <p class="text-slate-500 text-sm">Practifi + ${platformLabel}</p>
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
    <div class="grid grid-cols-4 gap-4 mb-6">
      <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5 text-center">
        <p class="text-sm text-slate-500 mb-1">Practifi Households</p>
        <p class="text-3xl font-bold text-slate-900">${totalPfHouseholds}</p>
        <p class="text-xs text-slate-400 mt-1">accounts with contacts</p>
      </div>
      <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5 text-center">
        <p class="text-sm text-slate-500 mb-1">Vault Folders</p>
        <p class="text-3xl font-bold text-slate-900">${totalVaultFolders}</p>
        <p class="text-xs text-slate-400 mt-1">in ${platformLabel}</p>
      </div>
      <div class="bg-white rounded-xl shadow-sm border border-${matchRate >= 80 ? 'emerald' : matchRate >= 50 ? 'amber' : 'red'}-200 p-5 text-center ${matchRate >= 80 ? 'bg-emerald-50' : matchRate >= 50 ? 'bg-amber-50' : 'bg-red-50'}">
        <p class="text-sm text-slate-500 mb-1">Match Rate</p>
        <p class="text-3xl font-bold text-${matchRate >= 80 ? 'emerald' : matchRate >= 50 ? 'amber' : 'red'}-600">${matchRate}%</p>
        <p class="text-xs text-slate-400 mt-1">${totalMatched} of ${totalPfHouseholds} matched</p>
      </div>
      <div class="bg-white rounded-xl shadow-sm border border-${complianceRate >= 80 ? 'emerald' : complianceRate >= 50 ? 'amber' : 'red'}-200 p-5 text-center ${complianceRate >= 80 ? 'bg-emerald-50' : complianceRate >= 50 ? 'bg-amber-50' : 'bg-red-50'}">
        <p class="text-sm text-slate-500 mb-1">Full Compliance</p>
        <p class="text-3xl font-bold text-${complianceRate >= 80 ? 'emerald' : complianceRate >= 50 ? 'amber' : 'red'}-600">${complianceRate}%</p>
        <p class="text-xs text-slate-400 mt-1">${withAllAgreements} have CEA + IMA + IPS</p>
      </div>
    </div>

    <!-- Matched Households Table -->
    <div class="bg-white rounded-xl shadow-sm border border-slate-200 mb-6">
      <div class="p-5 border-b border-slate-200">
        <div class="flex justify-between items-center">
          <div>
            <h2 class="text-lg font-semibold text-slate-800">Household Agreement Coverage</h2>
            <p class="text-slate-400 text-xs mt-1">${totalMatched} households matched between Practifi and ${platformLabel}</p>
          </div>
          <button onclick="exportCSV()" class="bg-emerald-600 text-white px-4 py-1.5 rounded-lg hover:bg-emerald-700 transition font-medium text-sm no-print">Export CSV</button>
        </div>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-slate-200 bg-slate-50">
              <th class="text-left py-3 px-4 font-semibold text-slate-700 min-w-[200px]">Household</th>
              <th class="text-left py-3 px-3 font-semibold text-slate-700 min-w-[180px]">Vault Folder</th>
              <th class="text-center py-3 px-3 font-semibold text-slate-700">Members</th>
              <th class="text-center py-3 px-3 font-semibold text-slate-700">Files</th>
              <th class="text-center py-3 px-3 font-semibold text-slate-700"><span class="text-emerald-600">CEA</span></th>
              <th class="text-center py-3 px-3 font-semibold text-slate-700"><span class="text-blue-600">IMA</span></th>
              <th class="text-center py-3 px-3 font-semibold text-slate-700"><span class="text-violet-600">IPS</span></th>
              <th class="text-center py-3 px-3 font-semibold text-slate-700"><span class="text-amber-600">CA</span></th>
              <th class="text-center py-3 px-3 font-semibold text-slate-700">Status</th>
            </tr>
          </thead>
          <tbody>
            ${matched.sort((a, b) => {
              const aComplete = a.hasCEA && a.hasIMA && a.hasIPS;
              const bComplete = b.hasCEA && b.hasIMA && b.hasIPS;
              if (aComplete !== bComplete) return aComplete ? 1 : -1;
              return a.householdName.localeCompare(b.householdName);
            }).map((m, i) => {
              const complete = m.hasCEA && m.hasIMA && m.hasIPS;
              return `
            <tr class="border-b border-slate-100 ${i % 2 === 0 ? '' : 'bg-slate-50/50'} hover:bg-slate-50">
              <td class="py-2.5 px-4 font-medium text-slate-900">${escapeHtml(m.householdName)}</td>
              <td class="py-2.5 px-3 text-slate-600">${escapeHtml(m.vaultFolder)}</td>
              <td class="py-2.5 px-3 text-center text-slate-600">${m.memberCount}</td>
              <td class="py-2.5 px-3 text-center text-slate-600">${m.totalFiles}</td>
              <td class="py-2.5 px-3 text-center">${m.hasCEA ? '<span class="text-emerald-600 font-bold">&#10003;</span>' : '<span class="text-red-400 font-semibold">&#10007;</span>'}</td>
              <td class="py-2.5 px-3 text-center">${m.hasIMA ? '<span class="text-emerald-600 font-bold">&#10003;</span>' : '<span class="text-red-400 font-semibold">&#10007;</span>'}</td>
              <td class="py-2.5 px-3 text-center">${m.hasIPS ? '<span class="text-emerald-600 font-bold">&#10003;</span>' : '<span class="text-red-400 font-semibold">&#10007;</span>'}</td>
              <td class="py-2.5 px-3 text-center">${m.hasCA ? '<span class="text-emerald-600 font-bold">&#10003;</span>' : '<span class="text-slate-300">-</span>'}</td>
              <td class="py-2.5 px-3 text-center">${complete ? '<span class="inline-block bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-full px-2.5 py-0.5">Complete</span>' : '<span class="inline-block bg-red-100 text-red-700 text-xs font-semibold rounded-full px-2.5 py-0.5">Gaps</span>'}</td>
            </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>

    ${unmatchedPf.length > 0 ? `
    <!-- Unmatched Practifi Households -->
    <div class="bg-white rounded-xl shadow-sm border border-amber-200 mb-6">
      <div class="p-5 border-b border-amber-200 bg-amber-50">
        <h2 class="text-lg font-semibold text-amber-800">Practifi Households Without Vault Match</h2>
        <p class="text-amber-600 text-xs mt-1">${unmatchedPf.length} households in Practifi have no matching folder in ${platformLabel}</p>
      </div>
      <div class="p-5">
        <div class="grid grid-cols-3 gap-2">
          ${unmatchedPf.map(u => `
          <div class="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-sm">
            <span class="font-medium text-slate-800">${escapeHtml(u.householdName)}</span>
            <span class="text-slate-400 ml-1">(${u.memberCount} members)</span>
          </div>`).join('')}
        </div>
      </div>
    </div>` : ''}

    ${unmatchedVault.length > 0 ? `
    <!-- Unmatched Vault Folders -->
    <div class="bg-white rounded-xl shadow-sm border border-slate-200 mb-6">
      <div class="p-5 border-b border-slate-200">
        <h2 class="text-lg font-semibold text-slate-800">Vault Folders Without Practifi Match</h2>
        <p class="text-slate-400 text-xs mt-1">${unmatchedVault.length} folders in ${platformLabel} have no matching Practifi household</p>
      </div>
      <div class="p-5">
        <div class="grid grid-cols-3 gap-2">
          ${unmatchedVault.map(u => `
          <div class="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-sm">
            <span class="font-medium text-slate-800">${escapeHtml(u.folderName)}</span>
            <span class="text-slate-400 ml-1">(${u.totalFiles} files, ${u.agreementCount} agreements)</span>
          </div>`).join('')}
        </div>
      </div>
    </div>` : ''}

    <!-- Footer -->
    <div class="text-center text-sm text-slate-400 mt-8 mb-4">
      Want to fix this automatically? <a href="mailto:claude-skills@getlea.io" class="text-emerald-600 hover:underline font-medium">claude-skills@getlea.io</a>
    </div>

  </div>

  <script>
    const reportData = ${JSON.stringify(matched)};
    const unmatchedPfData = ${JSON.stringify(unmatchedPf)};

    function exportCSV() {
      const headers = ['Household', 'Vault Folder', 'Members', 'Total Files', 'CEA', 'IMA', 'IPS', 'CA', 'Status'];
      const rows = [headers];
      for (const m of reportData) {
        const complete = m.hasCEA && m.hasIMA && m.hasIPS;
        rows.push([
          m.householdName, m.vaultFolder, m.memberCount, m.totalFiles,
          m.hasCEA ? 'Yes' : 'No', m.hasIMA ? 'Yes' : 'No',
          m.hasIPS ? 'Yes' : 'No', m.hasCA ? 'Yes' : 'No',
          complete ? 'Complete' : 'Gaps'
        ]);
      }
      for (const u of unmatchedPfData) {
        rows.push([u.householdName, 'NO MATCH', u.memberCount, '', '', '', '', '', 'No Vault Match']);
      }
      const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'practifi-agreement-compliance.csv';
      a.click();
    }
  </script>
</body>
</html>`;
}

function generateReport(type, data, outputPath) {
  if (type !== 'compliance') {
    throw new Error(`Unknown report type: ${type}. Expected 'compliance'.`);
  }
  const html = generateComplianceReport(data);
  fs.writeFileSync(outputPath, html);
  return outputPath;
}

module.exports = { generateReport };
