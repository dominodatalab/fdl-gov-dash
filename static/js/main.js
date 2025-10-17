// static/js/main.js
const DOMINO_API_BASE = window.location.origin + window.location.pathname.replace(/\/$/, '');
const ORIGINAL_API_BASE = window.DOMINO?.API_BASE || '';
console.log('window.DOMINO?.API_BASE', window.DOMINO?.API_BASE);
console.log('window.location.origin', window.location.origin);
console.log('window.location.pathname', window.location.pathname);
console.log('using proxy base', DOMINO_API_BASE);
console.log('proxying to', ORIGINAL_API_BASE);
const API_KEY = window.DOMINO?.API_KEY || null;

// Global state - single source of truth
let appState = {
    bundles: null,
    policies: {},
    evidence: {},
    models: {},
    tableData: [],
    securityScans: {} // Store security scan results by experiment ID
};

// Helper function to make proxy API calls
async function proxyFetch(apiPath, options = {}) {
    // Handle query parameters properly
    const [basePath, queryString] = apiPath.split('?');
    const targetParam = `target=${encodeURIComponent(ORIGINAL_API_BASE)}`;
    const finalQuery = queryString ? `${queryString}&${targetParam}` : targetParam;
    const url = `${DOMINO_API_BASE}/proxy/${basePath.replace(/^\//, '')}?${finalQuery}`;
    
    const defaultHeaders = {
        'X-Domino-Api-Key': API_KEY,
        'accept': 'application/json'
    };
    
    return fetch(url, {
        ...options,
        headers: {
            ...defaultHeaders,
            ...options.headers
        }
    });
}

// Security scan functions
async function triggerSecurityScan(modelName, modelVersion) {
    try {
        const basePath = window.location.pathname.replace(/\/$/, '');
        const response = await fetch(`${basePath}/security-scan-model`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                modelName: modelName,
                version: modelVersion,
                fileRegex: ".*",
                excludeRegex: "(^|/)(node_modules|\\.git|\\.venv|venv|env|__pycache__|\\.ipynb_checkpoints)(/|$)",
                semgrepConfig: "auto",
                includeIssues: true
            })
        });
        
        if (!response.ok) {
            throw new Error(`Security scan failed: ${response.status} ${response.statusText}`);
        }
        
        const result = await response.json();
        
        // Transform the response to match your display function expectations
        const transformedResult = {
            total_issues: result.scan?.total || 0,
            high_severity: result.scan?.high || 0,
            medium_severity: result.scan?.medium || 0,
            low_severity: result.scan?.low || 0,
            issues: result.issues || [],
            timestamp: Date.now()
        };
        
        return transformedResult;
    } catch (error) {
        console.error('Security scan error:', error);
        throw error;
    }
}

function showSecurityScanSpinner(buttonElement) {
    const originalText = buttonElement.innerHTML;
    buttonElement.innerHTML = '<span class="spinner"></span> Scanning...';
    buttonElement.disabled = true;
    return originalText;
}

function hideSecurityScanSpinner(buttonElement, originalText) {
    buttonElement.innerHTML = originalText;
    buttonElement.disabled = false;
}

function displaySecurityScanResults(results, containerElement) {
    const resultsHtml = `
        <div class="security-scan-results">
            <h4>Security Scan Results</h4>
            <div class="scan-summary">
                <div class="scan-stat">
                    <span class="stat-label">Total Issues:</span>
                    <span class="stat-value ${results.total_issues > 0 ? 'stat-warning' : 'stat-success'}">
                        ${results.total_issues || 0}
                    </span>
                </div>
                <div class="scan-stat">
                    <span class="stat-label">High Severity:</span>
                    <span class="stat-value ${(results.high_severity || 0) > 0 ? 'stat-danger' : 'stat-success'}">
                        ${results.high_severity || 0}
                    </span>
                </div>
                <div class="scan-stat">
                    <span class="stat-label">Medium Severity:</span>
                    <span class="stat-value ${(results.medium_severity || 0) > 0 ? 'stat-warning' : 'stat-success'}">
                        ${results.medium_severity || 0}
                    </span>
                </div>
                <div class="scan-stat">
                    <span class="stat-label">Low Severity:</span>
                    <span class="stat-value">${results.low_severity || 0}</span>
                </div>
            </div>
            ${results.issues && results.issues.length > 0 ? `
                <div class="scan-details">
                    <h5>Issues Found:</h5>
                    <div class="issues-list">
                        ${results.issues.slice(0, 5).map(issue => `
                            <div class="issue-item severity-${issue.severity?.toLowerCase() || 'unknown'}">
                                <div class="issue-title">${issue.test_name || 'Unknown Issue'}</div>
                                <div class="issue-file">${issue.filename || 'Unknown file'}:${issue.line_number || 'N/A'}</div>
                                <div class="issue-message">${issue.issue_text || 'No description available'}</div>
                            </div>
                        `).join('')}
                        ${results.issues.length > 5 ? `
                            <div class="more-issues">
                                ... and ${results.issues.length - 5} more issues
                            </div>
                        ` : ''}
                    </div>
                </div>
            ` : '<div class="no-issues">No security issues found!</div>'}
            <div class="scan-timestamp">
                <small>Scanned: ${new Date(results.timestamp || Date.now()).toLocaleString()}</small>
            </div>
        </div>
    `;
    
    containerElement.innerHTML = resultsHtml;
}

async function handleSecurityScan(modelName, modelVersion, buttonElement) {
    const resultsContainer = buttonElement.parentElement.querySelector('.security-scan-container') || 
                           (() => {
                               const container = document.createElement('div');
                               container.className = 'security-scan-container';
                               buttonElement.parentElement.appendChild(container);
                               return container;
                           })();
    
    
    const originalText = showSecurityScanSpinner(buttonElement);
    
    try {
        const results = await triggerSecurityScan(modelName, modelVersion);
        displaySecurityScanResults(results, resultsContainer);
    } catch (error) {
        resultsContainer.innerHTML = `
            <div class="security-scan-error">
                <h4>Security Scan Failed</h4>
                <p>Error: ${error.message}</p>
                <button onclick="handleSecurityScan('${modelName}', ${modelVersion}, this.parentElement.parentElement.querySelector('.security-scan-btn'))" class="btn btn-secondary">Retry Scan</button>
            </div>
        `;
    } finally {
        hideSecurityScanSpinner(buttonElement, originalText);
    }
}


// API Functions
// Updated API Functions - fetch both drafts AND results
async function fetchAllData() {
    try {
        // 1. Fetch bundles via proxy
        const bundlesResponse = await proxyFetch('api/governance/v1/bundles');
        
        if (!bundlesResponse.ok) throw new Error(`Bundles API: ${bundlesResponse.status}`);
        const bundlesData = await bundlesResponse.json();
        
        // Filter bundles with policies
        const filteredBundles = bundlesData.data?.filter(bundle => 
            bundle.state !== 'Archived' && 
            bundle.policies?.some(policy => policy.policyName?.toLowerCase().includes(''))
        ) || [];

        appState.bundles = filteredBundles;

        // 2. Collect all policy IDs
        const policyIds = new Set();
        filteredBundles.forEach(bundle => {
            bundle.policies?.forEach(policy => {
                if (policy.policyId) policyIds.add(policy.policyId);
            });
        });

        // 3. Fetch all policies in parallel via proxy
        const policyPromises = Array.from(policyIds).map(async policyId => {
            try {
                const response = await proxyFetch(`api/governance/v1/policies/${policyId}`);
                if (response.ok) {
                    appState.policies[policyId] = await response.json();
                }
            } catch (err) {
                console.error(`Policy ${policyId} failed:`, err);
            }
        });

        // 4. Fetch BOTH drafts and results in parallel
        const evidencePromises = filteredBundles.map(async bundle => {
            try {
                // Fetch drafts - use bundleID (capital I, capital D)
                const draftsResponse = await proxyFetch(`api/governance/v1/drafts/latest?bundleID=${bundle.id}`);
                const drafts = draftsResponse.ok ? await draftsResponse.json() : null;
                
                // Fetch results - use bundleID (capital I, capital D)
                const resultsResponse = await proxyFetch(`api/governance/v1/results/latest?bundleID=${bundle.id}`);
                const results = resultsResponse.ok ? await resultsResponse.json() : null;
                
                // Merge drafts and results
                // Results take precedence (they're published), drafts are fallback
                const merged = mergeEvidenceData(drafts, results);
                appState.evidence[bundle.id] = merged;
                
                console.log(`Bundle ${bundle.id}:`, {
                    draftsCount: drafts?.length || 0,
                    resultsCount: results?.length || 0,
                    mergedCount: merged?.length || 0
                });
                
            } catch (err) {
                console.error(`Evidence ${bundle.id} failed:`, err);
            }
        });

        // Wait for all API calls
        await Promise.all([...policyPromises, ...evidencePromises]);

        console.log('All data fetched:', appState);
        return true;
        
    } catch (error) {
        console.error('Failed to fetch data:', error);
        return false;
    }
}

// Helper function to merge drafts and results
function mergeEvidenceData(drafts, results) {
    // Create a map for quick lookup
    const evidenceMap = new Map();
    
    // Add drafts first
    if (Array.isArray(drafts)) {
        drafts.forEach(draft => {
            // Use evidenceId as the key
            evidenceMap.set(draft.evidenceId, {
                ...draft,
                source: 'draft'
            });
        });
    }
    
    // Override/add results (results are published, so they take precedence)
    if (Array.isArray(results)) {
        results.forEach(result => {
            // Results use 'artifactId' instead of 'evidenceId' sometimes
            const key = result.evidenceId || result.artifactId;
            
            // If we already have a draft for this evidence, check timestamps
            const existing = evidenceMap.get(key);
            if (existing) {
                // Results are newer/published, so they win
                evidenceMap.set(key, {
                    ...result,
                    source: 'result',
                    // Keep draft data if result is missing some fields
                    artifactContent: result.artifactContent || existing.artifactContent
                });
            } else {
                // New result not in drafts
                evidenceMap.set(key, {
                    ...result,
                    source: 'result'
                });
            }
        });
    }
    
    // Convert back to array
    return Array.from(evidenceMap.values());
}

// Update the processData function to handle the merged evidence
async function processData() {
    appState.tableData = [];
    console.log('Processing bundles...');

    for (const bundle of appState.bundles) {
        const attachmentModels = [];
        const bundleEvidence = appState.evidence[bundle.id] || [];
        const bundleEvidenceMap = {};

        // Map evidence by external ID for quick lookup
        if (Array.isArray(bundleEvidence)) {
            bundleEvidence.forEach(evidence => {
                const externalId = getEvidenceExternalId(evidence, bundle.policies);
                if (externalId) {
                    bundleEvidenceMap[externalId] = evidence;
                }
            });
        }
        
        // Log to see what data source we're using
        console.log(`Bundle ${bundle.name} evidence sources:`, 
            bundleEvidence.map(e => e.source).filter((v, i, a) => a.indexOf(v) === i)
        );
        // Collect model info from attachments
        for (const attachment of bundle.attachments || []) {
            if (attachment.type === 'ModelVersion' && attachment.identifier) {
                attachmentModels.push({
                    name: attachment.identifier.name,
                    version: attachment.identifier.version
                });
            }
        }
        const modelHallucinationKey = Object.keys(bundleEvidenceMap).find(k => k.includes("Model-Upload-and-Hallucination"));
        const modelHallucination = extractModelHallucination(bundleEvidenceMap[modelHallucinationKey]?.artifactContent);

        // Extract metadata from evidence (same as before)
        const metadata = {
            applicationId: bundleEvidenceMap['system-id']?.artifactContent || null,
            systemName: bundleEvidenceMap['system-name']?.artifactContent || null,
            modelName: bundleEvidenceMap['system-name']?.artifactContent || null,
            applicationType: bundleEvidenceMap['application-type']?.artifactContent || null,
            serviceLevel: bundleEvidenceMap['service-level']?.artifactContent || null,
            significanceRisk: bundleEvidenceMap['significance']?.artifactContent?.label || null,
            usageRisk: bundleEvidenceMap['usage']?.artifactContent?.label || null,
            complexityRisk: bundleEvidenceMap['complexity']?.artifactContent?.label || null,
            userType: bundleEvidenceMap['user-type']?.artifactContent || null,
            outputAuthorization: bundleEvidenceMap['output-authorization']?.artifactContent || null,
            expiryDate: bundleEvidenceMap['expiry-date']?.artifactContent || null,
            securityClassification: bundleEvidenceMap['Security-Classification-wa39']?.artifactContent || null,
            euAIActRisk: bundleEvidenceMap['eu-ai-act-risk-level']?.artifactContent || null,
            modelHealth: modelHallucination || null,
        };

        // Collect QA and approval data
        const qaData = {
            approvalsCount: bundle.stageApprovals?.length || 0,
            commentsCount: bundle.commentsCount || 0,
            approvals: bundle.stageApprovals || []
        };

        // Build bundle row data
        const bundleRowData = {
            bundleId: bundle.id,
            bundleName: bundle.name,
            bundleState: bundle.state,
            bundleCreatedAt: bundle.createdAt,
            bundleCreatedBy: bundle.createdBy?.name || 'Unknown',
            projectName: bundle.projectName || 'Unknown',
            projectOwner: bundle.projectOwner || 'Unknown',
            policyName: bundle.policyName || 'Unknown',
            policyId: bundle.policyId,
            
            // Attachments (models)
            attachmentModels: attachmentModels,
            modelNames: attachmentModels.map(m => m.name).join(', ') || 'N/A',
            modelVersions: attachmentModels.map(m => m.version).join(', ') || 'N/A',
            
            // Metadata
            ...metadata,
            
            // QA & Approvals
            ...qaData,
            
            // Raw data for potential future use
            policies: bundle.policies || [],
            evidence: bundleEvidence,
            gates: bundle.gates || [],
            stages: bundle.stages || []
        };

        if (
          bundleRowData.modelName &&
          typeof bundleRowData.modelName === 'string' &&
          bundleRowData.modelName.trim() !== '' &&
          bundleRowData.modelName.toLowerCase() !== 'unknown'
        ) {
          appState.tableData.push(bundleRowData);
        }
        console.log('Bundle Row Data:', bundleRowData);
    }

    console.log('All bundles processed:', {
        totalBundles: appState.tableData.length,
        tableData: appState.tableData
    });
}

// Helper function to extract model health
function extractModelHallucination(hallucinationContent) {
  if (!hallucinationContent) return null;

  try {
    // Case 1: It's an array of objects with a "Hallucination Score" field
    if (Array.isArray(hallucinationContent)) {
      for (const item of hallucinationContent) {
        const raw = item?.["Hallucination Score"];
        if (!raw) continue;

        // If it’s JSON, parse it and extract numeric value
        try {
          const parsed = JSON.parse(raw);
          if (typeof parsed?.value === "number") return parsed.value;
          if (typeof parsed?.hallucination_score === "number") return parsed.hallucination_score;
        } catch {
          // Not JSON — try to extract "hallucination_score: 0.08" pattern
          const match = raw.match(/([0-9]*\.?[0-9]+)/);
          if (match) return parseFloat(match[1]);
        }
      }
    }

    // Case 2: Plain object directly containing the score
    if (typeof hallucinationContent === "object" && hallucinationContent !== null) {
      const val = hallucinationContent.hallucination_score;
      if (typeof val === "number") return val;
    }

    // Case 3: Just a string directly
    if (typeof hallucinationContent === "string") {
      const match = hallucinationContent.match(/([0-9]*\.?[0-9]+)/);
      if (match) return parseFloat(match[1]);
    }

  } catch (err) {
    console.warn("Failed to extract hallucination score:", err);
  }

  return null;
}


// Helper function to get evidence external ID
function getEvidenceExternalId(evidence, bundlePolicies) {
    for (const policy of bundlePolicies || []) {
        const fullPolicy = appState.policies[policy.policyId];
        if (!fullPolicy?.stages) continue;
        
        for (const stage of fullPolicy.stages) {
            const evidenceDef = stage.evidenceSet?.find(def => def.id === evidence.evidenceId);
            if (evidenceDef) return evidenceDef.externalId;
        }
    }
    return null;
}

// Enhanced rendering function with security scan button
// Enhanced rendering function with security scan button
function renderTable() {
    const tbody = document.querySelector('.table-container tbody');
    if (!tbody) return;

    if (appState.tableData.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="12" style="text-align: center; padding: 40px; color: #888;">
                    No models found
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = appState.tableData.map((model, index) => `
        <tr>
            <td>
                <div class="model-name">${model.modelName}</div>
                <div class="model-type">ID: ${model.applicationId}</div>
            </td>
            <td><span class="user-name">${model.applicationType}</span></td>
            <td><span class="status-badge status-${model.serviceLevel?.toLowerCase().replace(/\s+/g, '-')}">${model.serviceLevel}</span></td>
            <td><span class="risk-level" data-risk="${model.significanceRisk}">${model.significanceRisk}</span></td>
            <td><span class="risk-level" data-risk="${model.usageRisk}">${model.usageRisk}</span></td>
            <td><span class="risk-level" data-risk="${model.complexityRisk}">${model.complexityRisk}</span></td>
            <td><span class="user-name">${model.userType}</span></td>
            <td>
              ${Array.isArray(model.outputAuthorization)
                  ? model.outputAuthorization.map(item => `<span class="pill">${item}</span>`).join('')
                  : `<span class="user-name">${model.outputAuthorization}</span>`}
            </td>
            <td><span class="user-name">${model.expiryDate}</span></td>
            <td><span class="user-name">${model.securityClassification}</span></td>
            <td><span class="user-name">${model.euAIActRisk}</span></td>
            <td><span class="user-name">${model.modelHealth ?? '-'}</span></td>
            <td>
                <button class="action-btn" onclick="toggleDetails(this, ${index})">
                    <span>Details</span>
                    <span class="arrow">▼</span>
                </button>
            </td>
        </tr>
        <tr id="details-${index}" class="expandable-row">
            <td colspan="13">
                <div class="expandable-content">
                    <div class="detail-section">
                        <h3>Model Details</h3>
                        <div class="detail-grid">
                            <div class="detail-item">
                                <div class="detail-label">Primary Policy Name</div>
                                <div class="detail-value">${model.policyName}</div>
                            </div>
                            <div class="detail-item">
                                <div class="detail-label">Policy ID</div>
                                <div class="detail-value">${model.policyId}</div>
                            </div>
                            <div class="detail-item">
                                <div class="detail-label">Bundle</div>
                                <div class="detail-value">${model.bundleName}</div>
                            </div>
                            ${model.experimentId ? `
                                <div class="detail-item">
                                    <div class="detail-label">Experiment ID</div>
                                    <div class="detail-value"><code>${model.experimentId}</code></div>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                        <div class="actions-row">
                            <button class="btn btn-primary" disabled>View Live Model Monitoring (disabled) </button>
                            <button class="btn btn-secondary" disabled>View Governing Bundles (disabled) </button>
                            <button class="btn btn-secondary" disabled>Run Security Scan (disabled) / Version</button>
                    </div>
                </div>
            </td>
        </tr>
    `).join('');
}

function showLoading() {
    const tbody = document.querySelector('.table-container tbody');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="12" style="text-align: center; padding: 40px;">
                    <div style="color: #543FDD; font-size: 18px;">Loading models...</div>
                </td>
            </tr>
        `;
    }
}

// Utility Functions
function getInitials(name) {
    return (name || 'Unknown').split(' ').map(n => n[0]).join('').toUpperCase();
}

function formatDate(date) {
    return date ? new Date(date).toLocaleDateString() : 'Unknown';
}

// Event Handlers
function toggleDetails(button, index) {
    const row = document.getElementById(`details-${index}`);
    const arrow = button.querySelector('.arrow');
    const isCurrentlyOpen = row.classList.contains('show');
    
    // Close all other rows first
    document.querySelectorAll('.expandable-row.show').forEach(r => r.classList.remove('show'));
    document.querySelectorAll('.arrow.rotated').forEach(a => a.classList.remove('rotated'));
    document.querySelectorAll('.action-btn.expanded').forEach(b => {
        b.classList.remove('expanded');
        b.querySelector('span').textContent = 'Details';
    });
    
    // If this row wasn't open, open it
    if (!isCurrentlyOpen) {
        row.classList.add('show');
        arrow.classList.add('rotated');
        button.classList.add('expanded');
        button.querySelector('span').textContent = 'Close';
    }
}

function filterByStatus(status) {
    const rows = document.querySelectorAll('tbody tr:not(.expandable-row)');
    rows.forEach(row => {
        if (status === 'all') {
            row.style.display = '';
        } else {
            const statusCell = row.querySelector('.status-badge');
            const matches = statusCell?.textContent.toLowerCase().includes(status.toLowerCase());
            row.style.display = matches ? '' : 'none';
        }
    });
}

// Main initialization function - simple flow
async function initializeDashboard() {
    console.log('Initializing Dashboard...');
    showLoading();
    
    // 1. Fetch all data
    const success = await fetchAllData();
    
    if (success) {
        // 2. Process data once (now async to fetch experiment IDs)
        await processData();
        
        // 3. Render table
        renderTable();
        
        console.log('Dashboard ready');
    } else {
        const tbody = document.querySelector('.table-container tbody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="12" style="text-align: center; padding: 40px; color: #e74c3c;">
                        Failed to load data
                    </td>
                </tr>
            `;
        }
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', initializeDashboard);

// Tab filtering
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', function(e) {
        e.preventDefault();
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        
        const filterValue = this.getAttribute('data-filter');
        filterByStatus(filterValue);
    });
});

