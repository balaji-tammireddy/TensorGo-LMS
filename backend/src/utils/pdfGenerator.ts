import PDFDocument from 'pdfkit';
import path from 'path';
import { logger } from './logger';

export interface TimesheetReportEntry {
    employee_name: string;
    log_date: string;
    project_name: string;
    module_name: string;
    task_name: string;
    activity_name: string;
    duration: number;
    description: string;
    work_status: string;
    log_status: string;
    manager_name?: string;
}

export interface TimesheetReportFilters {
    employeeName?: string;
    projectName?: string;
    moduleName?: string;
    taskName?: string;
    activityName?: string;
    startDate?: string;
    endDate?: string;
}

export interface TimesheetReportData {
    entries: TimesheetReportEntry[];
    filters: TimesheetReportFilters;
    generatedBy: string;
    generatedAt: string;
}

export class PDFGenerator {
    private doc: PDFKit.PDFDocument;
    private pageNumber: number = 1;
    private readonly pageWidth: number = 595.28; // A4 width in points
    private readonly pageHeight: number = 841.89; // A4 height in points
    private readonly margin: number = 50;
    private readonly contentWidth: number;
    private yPosition: number;

    constructor() {
        this.doc = new PDFDocument({
            size: 'A4',
            margins: {
                top: this.margin,
                bottom: this.margin + 30, // Extra space for footer
                left: this.margin,
                right: this.margin
            },
            bufferPages: true
        });
        this.contentWidth = this.pageWidth - (2 * this.margin);
        this.yPosition = this.margin;
    }

    generateTimesheetReport(data: TimesheetReportData): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            try {
                const buffers: Buffer[] = [];

                this.doc.on('data', buffers.push.bind(buffers));
                this.doc.on('end', () => {
                    const pdfBuffer = Buffer.concat(buffers);
                    resolve(pdfBuffer);
                });
                this.doc.on('error', reject);

                // Generate PDF content
                this.addHeader();
                this.addFiltersSection(data.filters);
                this.addSummarySection(data.entries);
                this.addDataTable(data.entries);
                this.addFooter(data.generatedBy, data.generatedAt);

                // Add page numbers to all pages
                this.addPageNumbers();

                this.doc.end();
            } catch (error) {
                logger.error('[PDFGenerator] Error generating PDF:', error);
                reject(error);
            }
        });
    }

    private addHeader() {
        // Add logo
        const logoPath = path.join(__dirname, '../assets/logo.png');
        try {
            this.doc.image(logoPath, this.margin, this.yPosition, { width: 120 });
        } catch (error) {
            logger.warn('[PDFGenerator] Logo not found, skipping');
        }

        // Add title
        this.doc
            .fontSize(24)
            .font('Helvetica-Bold')
            .fillColor('#1e40af')
            .text('Timesheet Report', this.margin + 140, this.yPosition + 10, {
                width: this.contentWidth - 140
            });

        this.yPosition += 60;
        this.addHorizontalLine();
        this.yPosition += 20;
    }

    private addFiltersSection(filters: TimesheetReportFilters) {
        const hasFilters = Object.values(filters).some(v => v !== undefined && v !== null && v !== '');

        if (!hasFilters) {
            this.doc
                .fontSize(10)
                .font('Helvetica')
                .fillColor('#64748b')
                .text('Filters: All Records', this.margin, this.yPosition);
            this.yPosition += 30;
            return;
        }

        this.doc
            .fontSize(12)
            .font('Helvetica-Bold')
            .fillColor('#334155')
            .text('Filters Applied:', this.margin, this.yPosition);

        this.yPosition += 20;

        const filterEntries = [
            { label: 'Employee', value: filters.employeeName },
            { label: 'Project', value: filters.projectName },
            { label: 'Module', value: filters.moduleName },
            { label: 'Task', value: filters.taskName },
            { label: 'Activity', value: filters.activityName },
            { label: 'Date Range', value: filters.startDate && filters.endDate ? `${filters.startDate} to ${filters.endDate}` : filters.startDate || filters.endDate }
        ].filter(f => f.value);

        filterEntries.forEach(filter => {
            this.doc
                .fontSize(10)
                .font('Helvetica')
                .fillColor('#475569')
                .text(`• ${filter.label}: `, this.margin + 10, this.yPosition, { continued: true })
                .font('Helvetica-Bold')
                .fillColor('#1e293b')
                .text(filter.value || '');
            this.yPosition += 18;
        });

        this.yPosition += 10;
    }

    private addSummarySection(entries: TimesheetReportEntry[]) {
        const totalHours = entries.reduce((sum, e) => sum + e.duration, 0);
        const totalEntries = entries.length;
        const uniqueEmployees = new Set(entries.map(e => e.employee_name)).size;

        // Summary box
        const boxY = this.yPosition;
        this.doc
            .rect(this.margin, boxY, this.contentWidth, 60)
            .fillAndStroke('#eff6ff', '#3b82f6');

        this.yPosition += 15;

        const col1X = this.margin + 20;
        const col2X = this.margin + (this.contentWidth / 3);
        const col3X = this.margin + (2 * this.contentWidth / 3);

        this.doc
            .fontSize(10)
            .font('Helvetica')
            .fillColor('#1e40af')
            .text('Total Hours', col1X, this.yPosition)
            .text('Total Entries', col2X, this.yPosition)
            .text('Employees', col3X, this.yPosition);

        this.yPosition += 18;

        this.doc
            .fontSize(16)
            .font('Helvetica-Bold')
            .fillColor('#1e3a8a')
            .text(totalHours.toFixed(2), col1X, this.yPosition)
            .text(totalEntries.toString(), col2X, this.yPosition)
            .text(uniqueEmployees.toString(), col3X, this.yPosition);

        this.yPosition += 40;
    }

    private addDataTable(entries: TimesheetReportEntry[]) {
        if (entries.length === 0) {
            this.doc
                .fontSize(12)
                .font('Helvetica')
                .fillColor('#64748b')
                .text('No timesheet entries found for the selected filters.', this.margin, this.yPosition, {
                    align: 'center',
                    width: this.contentWidth
                });
            return;
        }

        // Table configuration
        const columns = [
            { label: 'Date', width: 70 },
            { label: 'Employee', width: 90 },
            { label: 'Project', width: 80 },
            { label: 'Task', width: 80 },
            { label: 'Activity', width: 80 },
            { label: 'Hours', width: 45 },
            { label: 'Status', width: 50 }
        ];

        // Table header
        this.checkPageBreak(40);
        const headerY = this.yPosition;

        this.doc
            .rect(this.margin, headerY, this.contentWidth, 25)
            .fillAndStroke('#1e40af', '#1e40af');

        let xPos = this.margin + 5;
        columns.forEach(col => {
            this.doc
                .fontSize(9)
                .font('Helvetica-Bold')
                .fillColor('#ffffff')
                .text(col.label, xPos, headerY + 8, { width: col.width, align: 'left' });
            xPos += col.width;
        });

        this.yPosition += 30;

        // Table rows
        entries.forEach((entry, index) => {
            this.checkPageBreak(30);

            const rowY = this.yPosition;
            const bgColor = index % 2 === 0 ? '#f8fafc' : '#ffffff';

            this.doc
                .rect(this.margin, rowY, this.contentWidth, 25)
                .fillAndStroke(bgColor, '#e2e8f0');

            xPos = this.margin + 5;

            const rowData = [
                new Date(entry.log_date).toLocaleDateString('en-GB'),
                entry.employee_name,
                entry.project_name,
                entry.task_name,
                entry.activity_name,
                entry.duration.toFixed(1),
                entry.log_status
            ];

            rowData.forEach((data, i) => {
                this.doc
                    .fontSize(8)
                    .font('Helvetica')
                    .fillColor('#334155')
                    .text(this.truncateText(data, columns[i].width - 5), xPos, rowY + 8, {
                        width: columns[i].width,
                        align: i === 5 ? 'right' : 'left'
                    });
                xPos += columns[i].width;
            });

            this.yPosition += 25;
        });
    }

    private addFooter(generatedBy: string, generatedAt: string) {
        const footerY = this.pageHeight - this.margin;

        this.doc
            .fontSize(8)
            .font('Helvetica')
            .fillColor('#64748b')
            .text(
                `Generated by ${generatedBy} on ${new Date(generatedAt).toLocaleString('en-GB')}`,
                this.margin,
                footerY,
                { align: 'left' }
            );
    }

    private addPageNumbers() {
        const range = this.doc.bufferedPageRange();
        for (let i = 0; i < range.count; i++) {
            this.doc.switchToPage(i);
            const footerY = this.pageHeight - this.margin;

            this.doc
                .fontSize(8)
                .font('Helvetica')
                .fillColor('#64748b')
                .text(
                    `Page ${i + 1} of ${range.count}`,
                    this.margin,
                    footerY,
                    { align: 'right', width: this.contentWidth }
                );
        }
    }

    private addHorizontalLine() {
        this.doc
            .moveTo(this.margin, this.yPosition)
            .lineTo(this.pageWidth - this.margin, this.yPosition)
            .strokeColor('#cbd5e1')
            .lineWidth(1)
            .stroke();
    }

    private checkPageBreak(requiredSpace: number) {
        if (this.yPosition + requiredSpace > this.pageHeight - this.margin - 40) {
            this.doc.addPage();
            this.yPosition = this.margin;
            this.pageNumber++;
        }
    }

    private truncateText(text: string, maxWidth: number): string {
        // Rough estimation: 1 char ≈ 5 points at font size 8
        const maxChars = Math.floor(maxWidth / 4);
        if (text.length > maxChars) {
            return text.substring(0, maxChars - 3) + '...';
        }
        return text;
    }
}

export const generateTimesheetPDF = async (data: TimesheetReportData): Promise<Buffer> => {
    const generator = new PDFGenerator();
    return generator.generateTimesheetReport(data);
};
