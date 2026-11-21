export const PRIORITIES = ['Normal', 'Urgent', 'Very Urgent'] as const;
export type Priority = (typeof PRIORITIES)[number];

const rank = (p?: string | null) => Math.max(0, PRIORITIES.indexOf((p as Priority) || 'Normal'));
const TONE: Record<Priority, string> = {
    Normal: 'bg-slate-100 text-slate-700 border-slate-200',
    Urgent: 'bg-amber-100 text-amber-800 border-amber-300',
    'Very Urgent': 'bg-red-100 text-red-700 border-red-300 font-bold',
};

/** Highest priority among several lines (e.g. all products of one indent). */
export const highestPriority = (list: (string | null | undefined)[]): Priority =>
    PRIORITIES[Math.max(0, ...list.map(rank))];

export default function PriorityBadge({ priority }: { priority?: string | null }) {
    const p = PRIORITIES.includes(priority as Priority) ? (priority as Priority) : 'Normal';
    return (
        <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TONE[p]}`}>
            {p === 'Very Urgent' ? '🔥 ' : p === 'Urgent' ? '⚡ ' : ''}{p}
        </span>
    );
}
