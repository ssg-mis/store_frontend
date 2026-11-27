/**
 * Shows an indent product's optional Make (brand), e.g. under the product name.
 * Renders nothing when no make was entered, so existing rows look exactly as before.
 * `inline` keeps it on the same line (for compact text / chips).
 */
export default function MakeText({ make, inline = false, className = '' }: { make?: string | null; inline?: boolean; className?: string }) {
    const text = String(make ?? '').trim();
    if (!text) return null;
    if (inline) {
        return <span className={`text-[10px] text-muted-foreground whitespace-nowrap ${className}`} title={`Make: ${text}`}> (Make: {text})</span>;
    }
    return (
        <span className={`block text-[10px] text-muted-foreground leading-tight ${className}`} title={`Make: ${text}`}>
            Make: <span className="font-medium text-foreground/80">{text}</span>
        </span>
    );
}
