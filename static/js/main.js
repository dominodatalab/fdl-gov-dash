// static/js/main.js
const DOMINO_API_BASE = window.location.origin + window.location.pathname.replace(/\/$/, '');
const ORIGINAL_API_BASE = window.DOMINO?.API_BASE || '';
console.log('window.DOMINO?.API_BASE', window.DOMINO?.API_BASE);
console.log('window.location.origin', window.location.origin);
console.log('window.location.pathname', window.location.pathname);
console.log('using proxy base', DOMINO_API_BASE);
console.log('proxying to', ORIGINAL_API_BASE);
const API_KEY = window.DOMINO?.API_KEY || null;

// HARDCODED POLICY ID - Change this to filter by specific policy
const HARDCODED_POLICY_ID = '10177420-1d88-41f6-a029-60d47f3cd397';
const HARDCODED_Bundle_ID = '22b345af-651d-4258-ba49-2926829d8908';

// Global state - single source of truth
let appState = {
    bundles: null,
    policies: {},
    evidence: {},
    models: {},
    tableData: [],
    securityScans: {}, // Store security scan results by experiment ID
    qaData: {} // Store Q/A dictionaries by bundle ID
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
        
        // Filter bundles by HARDCODED_POLICY_ID
        const filteredBundles = bundlesData.data?.filter(bundle =>
            bundle.state !== 'Archived' &&
            bundle.policies?.some(policy => policy.policyId === HARDCODED_POLICY_ID)
        ) || [];

        console.log(`Filtering by policyId: ${HARDCODED_POLICY_ID}`);
        console.log(`Found ${filteredBundles.length} bundles matching policy ${HARDCODED_POLICY_ID}`);

        appState.bundles = filteredBundles;

        // 2. Use compute-policy endpoint to fetch policy, drafts, and results in one call
        const evidencePromises = filteredBundles.map(async bundle => {
            try {
                // Call compute-policy endpoint with bundleId and policyId
                const computeResponse = await proxyFetch('api/governance/v1/rpc/compute-policy', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        bundleId: bundle.id,
                        policyId: HARDCODED_POLICY_ID
                    })
                });

                if (!computeResponse.ok) {
                    throw new Error(`compute-policy failed: ${computeResponse.status}`);
                }

                const data = await computeResponse.json();

                // Store the policy (includes full evidence definitions)
                if (data.policy) {
                    appState.policies[data.policy.id] = data.policy;
                }

                // Only use results (published evidence), ignore drafts
                const results = (data.results || []).map(result => ({
                    ...result,
                    source: 'result'
                }));
                appState.evidence[bundle.id] = results;

                console.log(`Bundle ${bundle.id} (${bundle.name}):`, {
                    resultsCount: results.length
                });

            } catch (err) {
                console.error(`compute-policy for bundle ${bundle.id} failed:`, err);
            }
        });

        // Wait for all compute-policy calls
        await Promise.all(evidencePromises);

        console.log('All data fetched:', appState);
        return true;
        
    } catch (error) {
        console.error('Failed to fetch data:', error);
        return false;
    }
}

// Helper function to extract Q/A dictionary from bundle evidence
function extractQADictionary(bundleId, bundleEvidence, bundlePolicies) {
    const qaDict = {};

    if (!Array.isArray(bundleEvidence)) {
        return qaDict;
    }

    // For each evidence item, extract the question and answer
    bundleEvidence.forEach(evidence => {
        // Get the external ID which is often the question identifier
        const externalId = getEvidenceExternalId(evidence, bundlePolicies);

        // Get the question from policy definitions
        let question = externalId || evidence.evidenceId || 'Unknown';

        // Try to find the actual question text from the policy
        for (const policy of bundlePolicies || []) {
            const fullPolicy = appState.policies[policy.policyId];
            if (!fullPolicy?.stages) continue;

            for (const stage of fullPolicy.stages) {
                const evidenceDef = stage.evidenceSet?.find(def => def.id === evidence.evidenceId);
                if (evidenceDef) {
                    question = evidenceDef.name || evidenceDef.externalId || question;
                    break;
                }
            }
        }

        // Extract the answer from artifactContent
        let answer = evidence.artifactContent;

        // Format the answer based on type
        if (answer === null || answer === undefined) {
            answer = 'N/A';
        } else if (typeof answer === 'object') {
            // Handle complex objects
            if (answer.label) {
                answer = answer.label;
            } else if (Array.isArray(answer)) {
                answer = answer.join(', ');
            } else {
                answer = JSON.stringify(answer);
            }
        } else {
            answer = String(answer);
        }

        // Convert newlines to <br> tags with bullet points for multi-line content
        if (answer.includes('\n')) {
            answer = answer.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0)
                .map(line => `• ${line}`)
                .join('<br>');
        }

        qaDict[question] = {
            question: question,
            answer: answer,
            evidenceId: evidence.evidenceId,
            externalId: externalId,
            source: evidence.source,
            rawContent: evidence.artifactContent // Keep raw content for file extraction
        };
    });

    return qaDict;
}

// Helper function to extract all files from Q/A dictionary
function extractFilesFromQA(qaDict) {
    const files = [];

    for (const [question, qaObj] of Object.entries(qaDict)) {
        const rawContent = qaObj.rawContent;

        // Try to parse as file structure
        let parsed = null;
        try {
            if (typeof rawContent === 'object' && rawContent !== null) {
                parsed = rawContent;
            } else if (typeof rawContent === 'string') {
                const trimmed = rawContent.trim();
                if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                    parsed = JSON.parse(trimmed);
                }
            }
        } catch {
            // Not JSON, skip
            continue;
        }

        // Check if it has files
        if (parsed && parsed.files && Array.isArray(parsed.files) && parsed.files.length > 0) {
            parsed.files.forEach(file => {
                files.push({
                    name: file.name || 'Unknown file',
                    path: file.path,
                    sizeLabel: file.sizeLabel || '',
                    question: question, // Track which Q/A this came from
                    commit: parsed.commit
                });
            });
        }
    }

    return files;
}

// Update the processData function to handle the merged evidence
async function processData() {
    appState.tableData = [];
    appState.qaData = {};
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

        // Extract Q/A dictionary for this bundle
        const qaDict = extractQADictionary(bundle.id, bundleEvidence, bundle.policies);
        appState.qaData[bundle.id] = qaDict;

        // Log evidence count
        console.log(`Bundle ${bundle.name}: ${bundleEvidence.length} evidence items (results only)`);
        // Collect model info from attachments
        for (const attachment of bundle.attachments || []) {
            if (attachment.type === 'ModelVersion' && attachment.identifier) {
                attachmentModels.push({
                    name: attachment.identifier.name,
                    version: attachment.identifier.version
                });
            }
        }
        // Extract metadata from evidence using correct external IDs from your policy
        const metadata = {
            // Core model information
            modelId: bundleEvidenceMap['model-id']?.artifactContent || null,
            modelName: bundleEvidenceMap['model-name']?.artifactContent || null,
            modelDescription: bundleEvidenceMap['model-description']?.artifactContent || null,
            modelPurpose: bundleEvidenceMap['model-purpose']?.artifactContent || null,
            modelStatus: bundleEvidenceMap['model-status']?.artifactContent || null,

            // Business context
            businessLine: bundleEvidenceMap['business-line']?.artifactContent || null,
            businessUser: bundleEvidenceMap['business-user']?.artifactContent || null,

            // People
            modelOwner: bundleEvidenceMap['model-owner']?.artifactContent || null,
            modelDeveloper: bundleEvidenceMap['model-developer']?.artifactContent || null,
            modelValidator: bundleEvidenceMap['model-validator']?.artifactContent || null,

            // Risk assessment
            criticality: bundleEvidenceMap['criticality']?.artifactContent || null,
            complexity: bundleEvidenceMap['complexity']?.artifactContent || null,
            modelRiskTier: bundleEvidenceMap['model-risk-tier']?.artifactContent || null,
            clearance: bundleEvidenceMap['clearance']?.artifactContent || null,

            // Monitoring
            monitoringFrequency: bundleEvidenceMap['monitoring-frequency']?.artifactContent || null,

            // Validation artifacts
            validationId: bundleEvidenceMap['validation-id']?.artifactContent || null,
            eventType: bundleEvidenceMap['event-type']?.artifactContent || null,
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
            attachments: bundle.attachments || [], // All attachments for documents section
            
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

        // Add Q/A data to row
        bundleRowData.qaDict = qaDict;

        // Extract all files from Q/A evidence
        bundleRowData.evidenceFiles = extractFilesFromQA(qaDict);

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

    // Sort tableData by modelId (M001, M002, etc.)
    appState.tableData.sort((a, b) => {
        const idA = a.modelId || '';
        const idB = b.modelId || '';

        // Extract numeric part from model IDs (e.g., "M001" -> 1)
        const numA = parseInt(idA.replace(/\D/g, '')) || 0;
        const numB = parseInt(idB.replace(/\D/g, '')) || 0;

        // Sort by numeric part
        if (numA !== numB) {
            return numA - numB;
        }

        // Fallback to string comparison if numeric parts are equal
        return idA.localeCompare(idB);
    });

    console.log('Table data sorted by modelId');

    // IMPORTANT: Console log the Q/A dictionaries for inspection
    console.log('=== Q/A DICTIONARIES FOR ALL BUNDLES ===');
    console.log('Total bundles with Q/A data:', Object.keys(appState.qaData).length);

    for (const [bundleId, qaDict] of Object.entries(appState.qaData)) {
        const bundle = appState.bundles.find(b => b.id === bundleId);
        console.log(`\n--- Bundle: ${bundle?.name || bundleId} ---`);
        console.log('Q/A Dictionary:', qaDict);

        // Also log in a more readable format
        console.log('Questions and Answers:');
        for (const [key, value] of Object.entries(qaDict)) {
            console.log(`  Q: ${value.question}`);
            console.log(`  A: ${value.answer}`);
            console.log(`  External ID: ${value.externalId}`);
            console.log('  ---');
        }
    }
    console.log('=== END Q/A DICTIONARIES ===\n');

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

// Helper function to parse file JSON and create link HTML
function parseFileAnswer(answer, projectOwner, projectName) {
    // Try to parse as JSON
    let parsed;
    try {
        const trimmed = answer.trim();
        if ((trimmed.startsWith('{') && trimmed.endsWith('}'))) {
            parsed = JSON.parse(trimmed);
        } else {
            return answer; // Not JSON, return as-is
        }
    } catch {
        return answer; // Not valid JSON, return as-is
    }

    // Check if it has the file structure
    if (parsed && parsed.files && Array.isArray(parsed.files)) {
        if (parsed.files.length === 0) {
            // If it has a commit but no files, show commit info
            if (parsed.commit) {
                return `<span class="commit-info">📌 Commit: <code>${parsed.commit.substring(0, 8)}</code> (no files)</span>`;
            }
            return '<span class="no-files">No files uploaded</span>';
        }

        let result = '<div class="file-links-container">';

        // Create links for each file FIRST (these are the actual answers)
        result += parsed.files.map(file => {
            const fileName = file.name || 'Unknown file';
            const filePath = file.path;
            const fileSize = file.sizeLabel || '';

            if (filePath && projectOwner && projectName) {
                // URL encode the path
                const encodedPath = encodeURIComponent(filePath);
                const fileUrl = `https://se-demo.domino.tech/u/${projectOwner}/${projectName}/view-file/${encodedPath}`;

                return `<a href="${fileUrl}" target="_blank" class="file-link" title="Open ${fileName} in new tab">
                    <span class="file-icon">📄</span>
                    <span class="file-name">${fileName}</span>
                    ${fileSize ? `<span class="file-size">(${fileSize})</span>` : ''}
                    <span class="file-arrow">↗</span>
                </a>`;
            } else {
                return `<span class="file-info">📄 ${fileName} ${fileSize ? `(${fileSize})` : ''}</span>`;
            }
        }).join('');

        result += '</div>';

        // Add commit info as a footnote at the bottom if present
        if (parsed.commit) {
            result += `<div class="commit-info">📌 Commit: <code>${parsed.commit.substring(0, 8)}</code></div>`;
        }

        return result;
    }

    // Not a file structure, return original
    return answer;
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
    
    tbody.innerHTML = appState.tableData.map((model, index) => {
        // Helper to convert newlines to <br> tags with bullet points for multi-line content
        const nl2br = (str) => {
            if (!str) return 'N/A';
            const strVal = String(str);
            // If there are newlines, add bullet points
            if (strVal.includes('\n')) {
                return strVal.split('\n')
                    .map(line => line.trim())
                    .filter(line => line.length > 0)
                    .map(line => `• ${line}`)
                    .join('<br>');
            }
            return strVal;
        };

        return `
        <tr>
            <td>
                <div class="model-name">${model.modelName || 'N/A'}</div>
                <div class="model-type">${model.modelId || 'N/A'}</div>
            </td>
            <td><span class="user-name">${model.validationId || 'N/A'}</span></td>
            <td><span class="user-name">${nl2br(model.businessLine)}</span></td>
            <td><span class="status-badge status-${model.criticality?.toLowerCase().replace(/\s+/g, '-')}">${model.criticality || 'N/A'}</span></td>
            <td><span class="status-badge status-${model.complexity?.toLowerCase().replace(/\s+/g, '-')}">${model.complexity || 'N/A'}</span></td>
            <td><span class="user-name">${model.modelStatus || 'N/A'}</span></td>
            <td><span class="user-name">${nl2br(model.modelOwner)}</span></td>
            <td><span class="user-name">${nl2br(model.modelDeveloper)}</span></td>
            <td><span class="user-name">${nl2br(model.modelValidator)}</span></td>
            <td><span class="user-name">${model.monitoringFrequency || 'N/A'}</span></td>
            <td><span class="risk-level" data-risk="${model.modelRiskTier}">${model.modelRiskTier || 'N/A'}</span></td>
            <td><span class="risk-level" data-risk="${model.clearance}">${model.clearance || 'N/A'}</span></td>
            <td>
                <div class="actions-cell">
                    <a href="https://se-demo.domino.tech/u/${model.projectOwner}/${model.projectName}/governance/bundle/${model.bundleId}/policy/${model.policyId}/evidence"
                       target="_blank"
                       class="bundle-link"
                       title="Open bundle in new tab">
                        Bundle ↗
                    </a>
                    <button class="action-btn" onclick="toggleDetails(this, ${index})">
                        <span>Details</span>
                        <span class="arrow">▼</span>
                    </button>
                </div>
            </td>
        </tr>
        <tr id="details-${index}" class="expandable-row">
            <td colspan="13">
                <div class="expandable-content">
                    <div class="detail-section">
                        <h3 class="section-header">Model Details</h3>
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
                                <div class="detail-label">Bundle Name</div>
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
                    ${model.qaDict && Object.keys(model.qaDict).length > 0 ? `
                        <div class="detail-section">
                            <div class="section-header-row">
                                <div class="section-header-left">
                                    <h3 class="section-header">Evidence Questions & Answers</h3>
                                    <button class="qa-toggle-btn" onclick="toggleQASection(${index})">
                                        <span id="qa-toggle-icon-${index}">▼</span>
                                    </button>
                                </div>
                                <button class="btn btn-secondary btn-copy-qa" onclick="copyQAToClipboard(${index}, event)">
                                    Copy All Q/A
                                </button>
                            </div>
                            <div id="qa-content-${index}" class="qa-collapsible-content" style="display: block;">
                                <div class="qa-pagination-wrapper">
                                    <div id="qa-container-${index}" class="qa-container" data-current-page="0">
                                        ${Object.values(model.qaDict).map((qa, qaIndex) => {
                                            const parsedAnswer = parseFileAnswer(qa.answer, model.projectOwner, model.projectName);
                                            return `
                                            <div class="qa-item" data-qa-index="${qaIndex}">
                                                <div class="qa-question">${qa.question}</div>
                                                <div class="qa-answer">${parsedAnswer}</div>
                                            </div>
                                        `;
                                        }).join('')}
                                    </div>
                                    ${Object.keys(model.qaDict).length > 4 ? `
                                        <div class="qa-pagination-controls">
                                            <button class="qa-pagination-btn qa-prev" onclick="changeQAPage(${index}, -1)" disabled>
                                                ← Previous
                                            </button>
                                            <div class="qa-pagination-info">
                                                <span id="qa-page-info-${index}">Page 1 of ${Math.ceil(Object.keys(model.qaDict).length / 4)}</span>
                                            </div>
                                            <button class="qa-pagination-btn qa-next" onclick="changeQAPage(${index}, 1)">
                                                Next →
                                            </button>
                                        </div>
                                    ` : ''}
                                </div>
                            </div>
                        </div>
                    ` : '<div class="detail-section"><p>No Q/A data available</p></div>'}

                    ${(model.policies && model.policies.length > 0) || (model.attachments && model.attachments.length > 0) ? `
                        <div class="detail-section">
                            <div class="two-column-section">
                                <!-- Left Column: Underlying Policies -->
                                <div class="column-left">
                                    <h3 class="section-header">Underlying Policies</h3>
                                    ${model.policies && model.policies.length > 0 ? `
                                        <div class="policies-container">
                                            ${model.policies.map(policy => `
                                                <a href="https://se-demo.domino.tech/governance/policy/${policy.policyId}/ui-editor"
                                                   target="_blank"
                                                   class="policy-link"
                                                   title="Open ${policy.policyName} in new tab">
                                                    <span class="policy-name">${policy.policyName}</span>
                                                    <span class="policy-arrow">↗</span>
                                                </a>
                                            `).join('')}
                                        </div>
                                    ` : '<p class="no-data">No policies attached</p>'}
                                </div>

                                <!-- Right Column: Attached Documents -->
                                <div class="column-right">
                                    <h3 class="section-header">Attached Documents</h3>
                                    ${model.evidenceFiles && model.evidenceFiles.length > 0 ? `
                                        <div class="policies-container">
                                            ${model.evidenceFiles.map(file => {
                                                const fileName = file.name;
                                                const filePath = file.path;
                                                const fileSize = file.sizeLabel;
                                                const question = file.question;

                                                // Create link to file
                                                let href = '#';
                                                let linkTitle = `From: ${question}`;

                                                if (filePath && model.projectOwner && model.projectName) {
                                                    const encodedPath = encodeURIComponent(filePath);
                                                    href = `https://se-demo.domino.tech/u/${model.projectOwner}/${model.projectName}/view-file/${encodedPath}`;
                                                }

                                                return `
                                                    <a href="${href}"
                                                       target="_blank"
                                                       class="policy-link document-link"
                                                       title="${linkTitle}">
                                                        <span class="policy-name">
                                                            ${fileName}
                                                            ${fileSize ? `<span class="doc-size">(${fileSize})</span>` : ''}
                                                        </span>
                                                        <span class="policy-arrow">↗</span>
                                                    </a>
                                                `;
                                            }).join('')}
                                        </div>
                                    ` : '<p class="no-data">No documents attached</p>'}
                                </div>
                            </div>
                        </div>
                    ` : ''}

                    <div class="detail-section">
                        <h3 class="section-header">User Actions</h3>
                        <div class="actions-row">
                            <button class="btn btn-primary" disabled>View Live Model Monitoring (disabled) </button>
                            <button class="btn btn-secondary" disabled>Run Security Scan (disabled) / Version</button>
                        </div>
                    </div>
                </div>
            </td>
        </tr>
        `;
    }).join('');

    // Initialize pagination after rendering
    setTimeout(() => initializeQAPagination(), 0);
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

// Q&A Section Functions
function toggleQASection(index) {
    const content = document.getElementById(`qa-content-${index}`);
    const icon = document.getElementById(`qa-toggle-icon-${index}`);

    if (content.style.display === 'none') {
        content.style.display = 'block';
        icon.textContent = '▼';
    } else {
        content.style.display = 'none';
        icon.textContent = '▶';
    }
}

function changeQAPage(bundleIndex, direction) {
    const container = document.getElementById(`qa-container-${bundleIndex}`);
    const items = Array.from(container.querySelectorAll('.qa-item'));
    const itemsPerPage = 4; // 2 rows x 2 columns (responsive)
    const totalPages = Math.ceil(items.length / itemsPerPage);

    let currentPage = parseInt(container.dataset.currentPage || 0);
    currentPage += direction;

    // Clamp to valid range
    currentPage = Math.max(0, Math.min(currentPage, totalPages - 1));
    container.dataset.currentPage = currentPage;

    // Hide all items
    items.forEach(item => item.style.display = 'none');

    // Show items for current page
    const startIndex = currentPage * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, items.length);

    for (let i = startIndex; i < endIndex; i++) {
        items[i].style.display = 'block';
    }

    // Update pagination controls
    const detailsRow = container.closest('.expandable-row');
    const prevBtn = detailsRow.querySelector('.qa-prev');
    const nextBtn = detailsRow.querySelector('.qa-next');
    const pageInfo = document.getElementById(`qa-page-info-${bundleIndex}`);

    if (prevBtn) prevBtn.disabled = currentPage === 0;
    if (nextBtn) nextBtn.disabled = currentPage === totalPages - 1;
    if (pageInfo) pageInfo.textContent = `Page ${currentPage + 1} of ${totalPages}`;
}

// Initialize Q/A pagination on page load
function initializeQAPagination() {
    document.querySelectorAll('.qa-container[data-current-page]').forEach((container) => {
        const items = Array.from(container.querySelectorAll('.qa-item'));
        const itemsPerPage = 4;

        // Hide all items except first page
        items.forEach((item, index) => {
            if (index >= itemsPerPage) {
                item.style.display = 'none';
            }
        });
    });
}

// Helper function to flatten JSON for Google Sheets compatibility
function flattenJSONForSheets(value) {
    // Try to detect and parse JSON
    let parsed = null;

    // If it's already an object, use it directly
    if (typeof value === 'object' && value !== null) {
        parsed = value;
    } else if (typeof value === 'string') {
        // Try to parse as JSON
        const trimmed = value.trim();
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
            (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
            try {
                parsed = JSON.parse(trimmed);
            } catch {
                // Not valid JSON, treat as regular string
                return value;
            }
        } else {
            return value;
        }
    } else {
        return String(value);
    }

    // Now flatten the parsed object
    if (Array.isArray(parsed)) {
        // Handle arrays
        if (parsed.length === 0) return '';

        // If array of objects, extract key-value pairs
        if (typeof parsed[0] === 'object') {
            return parsed.map(item => {
                const pairs = Object.entries(item)
                    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
                    .join('; ');
                return pairs;
            }).join(' | ');
        }

        // Simple array
        return parsed.join(', ');
    } else if (typeof parsed === 'object') {
        // Handle objects - flatten to key=value pairs
        const entries = Object.entries(parsed);

        // Special handling for common patterns
        if (parsed.commit) {
            // Supporting Code pattern
            const parts = [];
            if (parsed.commit) parts.push(`commit=${parsed.commit}`);
            if (parsed.files && Array.isArray(parsed.files) && parsed.files.length > 0) {
                parts.push(`files=${parsed.files.map(f => f.name || f).join(', ')}`);
            }
            if (parsed.directories && Array.isArray(parsed.directories) && parsed.directories.length > 0) {
                parts.push(`directories=${parsed.directories.join(', ')}`);
            }
            return parts.join('; ');
        } else if (parsed.files && !parsed.commit) {
            // Model Validation Report / Monitoring Report pattern
            if (Array.isArray(parsed.files) && parsed.files.length > 0) {
                return parsed.files.map(f => {
                    if (typeof f === 'object') {
                        return `${f.name || f.path || 'file'} (${f.sizeLabel || ''})`.trim();
                    }
                    return f;
                }).join(', ');
            }
            return '';
        }

        // Generic object - flatten to key=value
        return entries
            .map(([key, val]) => {
                if (val === null || val === undefined) return null;
                if (Array.isArray(val)) {
                    if (val.length === 0) return null;
                    return `${key}=${val.join(', ')}`;
                }
                if (typeof val === 'object') {
                    return `${key}=${JSON.stringify(val)}`;
                }
                return `${key}=${val}`;
            })
            .filter(x => x !== null)
            .join('; ');
    }

    return String(parsed);
}

function copyQAToClipboard(index, event) {
    const model = appState.tableData[index];
    if (!model || !model.qaDict) {
        alert('No Q/A data available');
        return;
    }

    // Build CSV format: Question,Answer (copy ALL items, not just visible ones)
    let csvContent = 'Question,Answer\n';

    for (const [question, qaObj] of Object.entries(model.qaDict)) {
        // Clean up HTML tags and format for CSV
        const cleanQuestion = question.replace(/"/g, '""');

        // First, flatten any JSON in the answer
        let cleanAnswer = qaObj.answer
            .replace(/<br>/g, ' | ')  // Replace <br> with pipe separator
            .replace(/•/g, '')         // Remove bullet points
            .trim();

        // Flatten JSON objects to make them Sheets-friendly
        cleanAnswer = flattenJSONForSheets(cleanAnswer);

        // Now escape quotes for CSV
        cleanAnswer = String(cleanAnswer).replace(/"/g, '""');

        csvContent += `"${cleanQuestion}","${cleanAnswer}"\n`;
    }

    // Copy to clipboard
    navigator.clipboard.writeText(csvContent).then(() => {
        // Visual feedback
        const button = event.target;
        const originalText = button.textContent;
        button.textContent = '✓ Copied All!';
        button.style.background = 'var(--ok-bg)';
        button.style.color = 'var(--ok-fg)';

        setTimeout(() => {
            button.textContent = originalText;
            button.style.background = '';
            button.style.color = '';
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy:', err);
        alert('Failed to copy to clipboard');
    });
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
            // Model Status is in the 6th column (index 5)
            const statusCell = row.querySelectorAll('td')[5];
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

