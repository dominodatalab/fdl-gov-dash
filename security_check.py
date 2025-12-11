#!/usr/bin/env python3
"""
Security Scanner using Semgrep
Scans code in /mnt/imported/code/ and generates a stylized PDF report
"""

import os
import sys
import json
import subprocess
from datetime import datetime
from pathlib import Path

try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter, A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
    from reportlab.platypus import Image as RLImage
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
    REPORTLAB_AVAILABLE = True
except ImportError:
    print("WARNING: reportlab not available. Installing...")
    subprocess.run([sys.executable, "-m", "pip", "install", "reportlab"], check=True)
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter, A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
    from reportlab.platypus import Image as RLImage
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT


def run_semgrep_scan(target_dir):
    """
    Run Semgrep scan on the target directory
    Returns the scan results as a dictionary
    """
    print(f"Starting Semgrep scan on: {target_dir}")

    try:
        # Run semgrep with auto config (uses registry rules)
        result = subprocess.run(
            ["semgrep", "scan", "--config=auto", "--json", target_dir],
            capture_output=True,
            text=True,
            timeout=600  # 10 minute timeout
        )

        # Semgrep returns non-zero if findings are found, which is expected
        output = result.stdout

        if not output:
            print("WARNING: No output from Semgrep. Using stderr:")
            print(result.stderr)
            return {"results": [], "errors": []}

        scan_results = json.loads(output)
        print(f"Scan complete. Found {len(scan_results.get('results', []))} findings.")
        return scan_results

    except subprocess.TimeoutExpired:
        print("ERROR: Semgrep scan timed out")
        return {"results": [], "errors": ["Scan timed out"]}
    except json.JSONDecodeError as e:
        print(f"ERROR: Failed to parse Semgrep output: {e}")
        return {"results": [], "errors": [f"JSON parse error: {e}"]}
    except FileNotFoundError:
        print("ERROR: Semgrep not found. Please ensure it's installed.")
        return {"results": [], "errors": ["Semgrep not installed"]}
    except Exception as e:
        print(f"ERROR: Unexpected error during scan: {e}")
        return {"results": [], "errors": [str(e)]}


def categorize_findings(results):
    """
    Categorize findings by severity
    """
    categories = {
        "CRITICAL": [],
        "HIGH": [],
        "MEDIUM": [],
        "LOW": [],
        "INFO": []
    }

    for finding in results:
        severity = finding.get("extra", {}).get("severity", "INFO").upper()
        if severity not in categories:
            severity = "INFO"
        categories[severity].append(finding)

    return categories


def generate_pdf_report(scan_results, output_path):
    """
    Generate a professional-looking PDF report from scan results
    """
    print(f"Generating PDF report: {output_path}")

    # Create PDF document
    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        rightMargin=0.75*inch,
        leftMargin=0.75*inch,
        topMargin=0.75*inch,
        bottomMargin=0.75*inch
    )

    # Container for PDF elements
    story = []

    # Styles
    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=28,
        textColor=colors.HexColor('#1a1a1a'),
        spaceAfter=12,
        alignment=TA_CENTER,
        fontName='Helvetica-Bold'
    )

    subtitle_style = ParagraphStyle(
        'CustomSubtitle',
        parent=styles['Normal'],
        fontSize=12,
        textColor=colors.HexColor('#666666'),
        spaceAfter=20,
        alignment=TA_CENTER,
        fontName='Helvetica'
    )

    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=16,
        textColor=colors.HexColor('#2c3e50'),
        spaceAfter=12,
        spaceBefore=12,
        fontName='Helvetica-Bold'
    )

    # Title Section
    story.append(Paragraph("Security Scan Report", title_style))
    story.append(Paragraph(f"Generated on {datetime.now().strftime('%B %d, %Y at %H:%M:%S')}", subtitle_style))
    story.append(Spacer(1, 0.3*inch))

    # Summary Section
    results = scan_results.get("results", [])
    errors = scan_results.get("errors", [])

    categorized = categorize_findings(results)

    # Summary Statistics Table
    story.append(Paragraph("Executive Summary", heading_style))

    summary_data = [
        ['Metric', 'Count'],
        ['Total Findings', str(len(results))],
        ['Critical', str(len(categorized['CRITICAL']))],
        ['High', str(len(categorized['HIGH']))],
        ['Medium', str(len(categorized['MEDIUM']))],
        ['Low', str(len(categorized['LOW']))],
        ['Info', str(len(categorized['INFO']))],
    ]

    summary_table = Table(summary_data, colWidths=[3.5*inch, 2.5*inch])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#34495e')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 12),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('TOPPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#ecf0f1')),
        ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#bdc3c7')),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 10),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8f9fa')]),
        ('TOPPADDING', (0, 1), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 8),
    ]))

    story.append(summary_table)
    story.append(Spacer(1, 0.3*inch))

    # Severity color mapping
    severity_colors = {
        'CRITICAL': colors.HexColor('#c0392b'),
        'HIGH': colors.HexColor('#e74c3c'),
        'MEDIUM': colors.HexColor('#f39c12'),
        'LOW': colors.HexColor('#f1c40f'),
        'INFO': colors.HexColor('#3498db')
    }

    # Detailed Findings
    if results:
        story.append(PageBreak())
        story.append(Paragraph("Detailed Findings", heading_style))
        story.append(Spacer(1, 0.2*inch))

        for severity in ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']:
            findings = categorized[severity]
            if findings:
                # Severity header
                severity_header = Paragraph(
                    f"{severity} Severity ({len(findings)} findings)",
                    ParagraphStyle(
                        'SeverityHeader',
                        parent=styles['Heading3'],
                        fontSize=14,
                        textColor=severity_colors[severity],
                        spaceAfter=10,
                        fontName='Helvetica-Bold'
                    )
                )
                story.append(severity_header)

                # Findings table
                for idx, finding in enumerate(findings[:20], 1):  # Limit to 20 per severity
                    check_id = finding.get('check_id', 'Unknown')
                    message = finding.get('extra', {}).get('message', 'No description')
                    path = finding.get('path', 'Unknown file')
                    line = finding.get('start', {}).get('line', '?')

                    # Truncate long messages
                    if len(message) > 200:
                        message = message[:197] + "..."

                    finding_data = [
                        ['Rule', check_id],
                        ['File', f"{path}:{line}"],
                        ['Description', message],
                    ]

                    finding_table = Table(finding_data, colWidths=[1.2*inch, 5.3*inch])
                    finding_table.setStyle(TableStyle([
                        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#ecf0f1')),
                        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
                        ('FONTSIZE', (0, 0), (-1, -1), 9),
                        ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
                        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#bdc3c7')),
                        ('TOPPADDING', (0, 0), (-1, -1), 6),
                        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                        ('LEFTPADDING', (0, 0), (-1, -1), 8),
                        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
                    ]))

                    story.append(finding_table)
                    story.append(Spacer(1, 0.15*inch))

                if len(findings) > 20:
                    story.append(Paragraph(
                        f"<i>... and {len(findings) - 20} more {severity} findings</i>",
                        styles['Normal']
                    ))
                    story.append(Spacer(1, 0.2*inch))
    else:
        story.append(Paragraph(
            " No security issues found!",
            ParagraphStyle(
                'Success',
                parent=styles['Normal'],
                fontSize=14,
                textColor=colors.HexColor('#27ae60'),
                alignment=TA_CENTER,
                fontName='Helvetica-Bold'
            )
        ))

    # Errors section
    if errors:
        story.append(PageBreak())
        story.append(Paragraph("Scan Errors", heading_style))
        for error in errors:
            error_text = str(error).replace('<', '&lt;').replace('>', '&gt;')
            story.append(Paragraph(f"• {error_text}", styles['Normal']))
            story.append(Spacer(1, 0.1*inch))

    # Build PDF
    doc.build(story)
    print(f"PDF report generated successfully: {output_path}")


def main():
    """
    Main execution function
    """
    # Target directory to scan
    target_dir = "/mnt/imported/code/"

    # Ensure target directory exists
    if not os.path.exists(target_dir):
        print(f"ERROR: Target directory does not exist: {target_dir}")
        sys.exit(1)

    # Setup artifact directory
    artifact_dir = os.environ.get("DOMINO_ARTIFACTS_DIR", "/mnt/artifacts")
    os.makedirs(artifact_dir, exist_ok=True)

    # Run Semgrep scan
    scan_results = run_semgrep_scan(target_dir)

    # Generate PDF report
    artifact_path = os.path.join(artifact_dir, "security_scan_report.pdf")
    generate_pdf_report(scan_results, artifact_path)

    print(f"\n{'='*60}")
    print(f"Security scan complete!")
    print(f"Report saved to: {artifact_path}")
    print(f"{'='*60}\n")

    # Return exit code based on findings
    results = scan_results.get("results", [])
    critical_count = sum(1 for r in results if r.get("extra", {}).get("severity", "").upper() == "CRITICAL")
    high_count = sum(1 for r in results if r.get("extra", {}).get("severity", "").upper() == "HIGH")

    if critical_count > 0:
        print(f"�  Found {critical_count} CRITICAL severity issues")
        return 2
    elif high_count > 0:
        print(f"�  Found {high_count} HIGH severity issues")
        return 1
    else:
        print(" No critical or high severity issues found")
        return 0


if __name__ == "__main__":
    sys.exit(main())
