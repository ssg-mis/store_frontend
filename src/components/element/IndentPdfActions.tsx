import { useEffect, useState } from 'react';
import { pdf } from '@react-pdf/renderer';
import { Eye, Download, Printer, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { fetchIndentDetail, fetchIndentMasterData } from '@/lib/fetchers';
import { formatDate } from '@/lib/utils';
import IndentPdf, { type IndentPdfProps } from './IndentPdf';

// Firm aliases (shown as "Division" on the PDF) are loaded once and shared by every row.
let firmAliasPromise: Promise<Record<string, string>> | null = null;
function getFirmAliases() {
    if (!firmAliasPromise) {
        firmAliasPromise = fetchIndentMasterData()
            .then((m: any) => m?.firmAliases || {})
            .catch(() => {
                firmAliasPromise = null;
                return {};
            });
    }
    return firmAliasPromise;
}

// Builds the PDF props from the full indent record (all product lines of the indent).
async function buildIndentPdfProps(indentNo: string): Promise<IndentPdfProps> {
    const [detail, aliases]: [any, Record<string, string>] = await Promise.all([
        fetchIndentDetail(indentNo),
        getFirmAliases(),
    ]);
    const items: any[] = detail?.items || [];
    return {
        division: aliases[detail?.firm] || detail?.firm || '',
        departmentName: detail?.department || '',
        indentNo: detail?.indentNumber || indentNo,
        indentDate: detail?.createdAt ? formatDate(new Date(detail.createdAt)) : '',
        indentType: detail?.indentType || '',
        siteToBeUsed: detail?.areaOfUse || '',
        indenterName: detail?.indenter || '',
        items: items.map((it) => ({
            particulars: it.productName || '',
            quantity: it.quantity ?? '',
            uom: it.uom || '',
        })),
    };
}

async function generateIndentPdfBlob(indentNo: string): Promise<Blob> {
    const props = await buildIndentPdfProps(indentNo);
    return pdf(<IndentPdf {...props} />).toBlob();
}

function fileName(indentNo: string) {
    return `Indent_${indentNo}.pdf`;
}

function downloadBlob(blob: Blob, indentNo: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName(indentNo);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function printBlob(blob: Blob) {
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.src = url;
    const cleanup = () => {
        iframe.remove();
        URL.revokeObjectURL(url);
    };
    iframe.onload = () => {
        try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
        } catch {
            // Browser blocked printing from the frame: open the PDF so it can be printed from the viewer.
            window.open(url, '_blank', 'noopener,noreferrer');
        }
        setTimeout(cleanup, 60000);
    };
    document.body.appendChild(iframe);
}

type Action = 'view' | 'download' | 'print';

export default function IndentPdfActions({ indentNo }: { indentNo: string }) {
    const [busy, setBusy] = useState<Action | null>(null);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!previewBlob) return;
        const url = URL.createObjectURL(previewBlob);
        setPreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [previewBlob]);

    if (!indentNo) return <span className="text-muted-foreground">—</span>;

    const run = async (action: Action) => {
        if (busy) return;
        setBusy(action);
        try {
            const blob = await generateIndentPdfBlob(indentNo);
            if (action === 'view') {
                setPreviewBlob(blob);
                setPreviewOpen(true);
            } else if (action === 'download') {
                downloadBlob(blob, indentNo);
            } else {
                printBlob(blob);
            }
        } catch (err) {
            console.error('Error generating indent PDF:', err);
            toast.error('Failed to generate Indent PDF');
        } finally {
            setBusy(null);
        }
    };

    const iconBtn = (action: Action, title: string, Icon: typeof Eye) => (
        <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-7 w-7"
            title={title}
            aria-label={title}
            disabled={!!busy}
            onClick={(e) => {
                e.stopPropagation();
                run(action);
            }}
        >
            {busy === action ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
        </Button>
    );

    return (
        <>
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                {iconBtn('view', 'View PDF', Eye)}
                {iconBtn('download', 'Download PDF', Download)}
                {iconBtn('print', 'Print PDF', Printer)}
            </div>

            <Dialog
                open={previewOpen}
                onOpenChange={(open) => {
                    setPreviewOpen(open);
                    if (!open) {
                        setPreviewBlob(null);
                        setPreviewUrl(null);
                    }
                }}
            >
                <DialogContent className="max-w-[95vw] sm:max-w-4xl h-[90vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Indent PDF - {indentNo}</DialogTitle>
                    </DialogHeader>
                    <div className="flex-1 min-h-0 rounded-md border overflow-hidden bg-muted">
                        {previewUrl ? (
                            <iframe src={previewUrl} title={`Indent ${indentNo}`} className="w-full h-full" />
                        ) : (
                            <div className="flex h-full items-center justify-center">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        )}
                    </div>
                    <DialogFooter className="gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            disabled={!previewBlob}
                            onClick={() => previewBlob && downloadBlob(previewBlob, indentNo)}
                        >
                            <Download className="h-4 w-4 mr-1" /> Download
                        </Button>
                        <Button
                            type="button"
                            disabled={!previewBlob}
                            onClick={() => previewBlob && printBlob(previewBlob)}
                        >
                            <Printer className="h-4 w-4 mr-1" /> Print
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
