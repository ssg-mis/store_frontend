import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, FileText, ImageIcon, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';

export const isImageUrl = (url?: string | null) =>
    !!url && /\.(png|jpe?g|gif|webp|bmp|svg|avif)(\?|#|$)/i.test(url);

const fileNameFromUrl = (url: string) => {
    try {
        return decodeURIComponent(url.split('?')[0].split('/').pop() || 'file');
    } catch {
        return 'file';
    }
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;
const STEP = 0.5;

/** Image viewer dialog with zoom in / out (buttons, mouse wheel, double-click) and drag-to-pan. */
export function ImageViewerDialog({ url, onClose }: { url: string | null; onClose: () => void }) {
    const [zoom, setZoom] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

    useEffect(() => {
        setZoom(1);
        setOffset({ x: 0, y: 0 });
    }, [url]);

    const applyZoom = useCallback((next: number) => {
        const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
        setZoom(z);
        if (z === 1) setOffset({ x: 0, y: 0 });
    }, []);

    return (
        <Dialog open={!!url} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent
                className="w-[95vw] max-w-[95vw] sm:max-w-4xl p-3 gap-2"
                onClick={(e) => e.stopPropagation()}
            >
                <DialogHeader className="px-1 pr-8">
                    <DialogTitle className="flex items-center gap-2 text-sm">
                        <ImageIcon className="h-4 w-4" />
                        <span className="truncate">{url ? fileNameFromUrl(url) : 'Preview'}</span>
                    </DialogTitle>
                    <DialogDescription className="sr-only">Attachment image preview with zoom</DialogDescription>
                </DialogHeader>
                {url && (
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-center gap-1">
                            <Button type="button" size="sm" variant="outline" onClick={() => applyZoom(zoom - STEP)} disabled={zoom <= MIN_ZOOM} title="Zoom out">
                                <ZoomOut className="h-4 w-4" />
                            </Button>
                            <span className="w-14 text-center text-xs tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
                            <Button type="button" size="sm" variant="outline" onClick={() => applyZoom(zoom + STEP)} disabled={zoom >= MAX_ZOOM} title="Zoom in">
                                <ZoomIn className="h-4 w-4" />
                            </Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => applyZoom(1)} disabled={zoom === 1} title="Reset">
                                <RotateCcw className="h-4 w-4" />
                            </Button>
                            <a href={url} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                                Open original <ExternalLink className="h-3 w-3" />
                            </a>
                        </div>
                        <div
                            className="relative h-[70vh] overflow-hidden rounded-md bg-muted select-none"
                            style={{ cursor: zoom > 1 ? (drag.current ? 'grabbing' : 'grab') : 'zoom-in' }}
                            onWheel={(e) => applyZoom(zoom + (e.deltaY < 0 ? 0.25 : -0.25))}
                            onDoubleClick={() => applyZoom(zoom > 1 ? 1 : 2)}
                            onPointerDown={(e) => {
                                if (zoom <= 1) return;
                                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                                drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
                            }}
                            onPointerMove={(e) => {
                                if (!drag.current) return;
                                setOffset({
                                    x: drag.current.ox + e.clientX - drag.current.x,
                                    y: drag.current.oy + e.clientY - drag.current.y,
                                });
                            }}
                            onPointerUp={() => { drag.current = null; }}
                            onPointerCancel={() => { drag.current = null; }}
                        >
                            <img
                                src={url}
                                alt="Attachment"
                                draggable={false}
                                className="absolute inset-0 h-full w-full object-contain"
                                style={{
                                    transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                                    transition: drag.current ? 'none' : 'transform 0.15s ease-out',
                                }}
                            />
                        </div>
                        <p className="text-center text-[11px] text-muted-foreground">Scroll or use +/- to zoom · drag to move · double-click to toggle</p>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

/**
 * Attachment cell content: image thumbnail that opens the zoomable viewer.
 * Non-image files (PDF etc.) render as a link that opens in a new tab.
 */
export function AttachmentThumb({ url, size = 'md' }: { url?: string | null; size?: 'sm' | 'md' }) {
    const [open, setOpen] = useState(false);

    if (!url) return <span className="text-muted-foreground">—</span>;

    if (!isImageUrl(url)) {
        return (
            <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 rounded-md border bg-background px-1.5 py-1 text-xs text-primary hover:bg-muted"
                title={fileNameFromUrl(url)}
            >
                <FileText className="h-3.5 w-3.5 shrink-0" />
                View
            </a>
        );
    }

    return (
        <>
            <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setOpen(true); }}
                className={`group overflow-hidden rounded-md border bg-muted shrink-0 ${size === 'sm' ? 'h-8 w-8' : 'h-12 w-12'}`}
                title="Click to view / zoom"
            >
                <img src={url} alt="Attachment" loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-110" />
            </button>
            <ImageViewerDialog url={open ? url : null} onClose={() => setOpen(false)} />
        </>
    );
}
