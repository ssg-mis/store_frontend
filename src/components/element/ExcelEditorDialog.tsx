import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '../ui/dialog';
import { Button } from '../ui/button';
import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { PuffLoader as Loader } from 'react-spinners';
import { toast } from 'sonner';
import { uploadFile } from '@/lib/fetchers';

interface ExcelEditorProps {
    fileUrl: string | null;
    open: boolean;
    onClose: () => void;
    onSave: (newUrl: string) => void;
}

export default function ExcelEditorDialog({ fileUrl, open, onClose, onSave }: ExcelEditorProps) {
    const [data, setData] = useState<string[][]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open || !fileUrl) {
            setData([]);
            return;
        }

        const loadExcel = async () => {
            setLoading(true);
            try {
                // Determine if we are bypassing CORS proxies or native fetching. 
                // Normally fetch handles it if S3 bucket has good CORS rules.
                const response = await fetch(fileUrl);
                if (!response.ok) throw new Error("Failed to fetch file");
                const arrayBuffer = await response.arrayBuffer();
                const workbook = XLSX.read(arrayBuffer, { type: 'buffer' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as string[][];
                
                // Ensure data is at least somewhat rectangular
                const maxCols = Math.max(...jsonData.map((row: any) => row?.length || 0), 0);
                const normalizedData = jsonData.map((row: any) => {
                    const newRow = Array.isArray(row) ? [...row] : [];
                    while (newRow.length < maxCols) newRow.push("");
                    return newRow;
                });

                if (normalizedData.length === 0) {
                    normalizedData.push(Array(maxCols || 1).fill(""));
                }
                
                setData(normalizedData);
            } catch (err: any) {
                console.error("Error loading excel:", err);
                toast.error("Could not load Excel file securely. It might be blocked by CORS.");
                onClose();
            } finally {
                setLoading(false);
            }
        };

        loadExcel();
    }, [fileUrl, open]);

    const handleSave = async () => {
        setSaving(true);
        try {
            // Convert 2D array back to worksheet
            const ws = XLSX.utils.aoa_to_sheet(data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
            const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
            
            // Create a File from the buffer
            const file = new File([excelBuffer], `updated_comparison_${Date.now()}.xlsx`, {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });

            // Upload the new file natively
            const newUrl = await uploadFile(file, import.meta.env.VITE_COMPARISON_SHEET_FOLDER);
            if (!newUrl) throw new Error("File upload failed");

            onSave(newUrl);
        } catch (error: any) {
            console.error("Error saving excel:", error);
            toast.error("Failed to save updates: " + error.message);
        } finally {
            setSaving(false);
        }
    };

    const handleCellChange = (rowIndex: number, colIndex: number, value: string) => {
        const newData = [...data];
        if (!newData[rowIndex]) newData[rowIndex] = [];
        newData[rowIndex][colIndex] = value;
        setData(newData);
    };

    const addRow = () => {
        if (data.length === 0) return setData([[""]]);
        const cols = data[0].length || 1;
        setData([...data, Array(cols).fill("")]);
    };
    
    const addCol = () => {
        if (data.length === 0) return setData([[""]]);
        setData(data.map(row => [...row, ""]));
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-[90vw] md:max-w-4xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Edit Excel Sheet</DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-auto border rounded-md my-4 flex flex-col min-h-[300px]">
                    {loading ? (
                        <div className="flex flex-1 items-center justify-center">
                            <Loader color="black" />
                        </div>
                    ) : (
                        <div className="p-2 space-y-4 flex flex-col flex-1">
                            <div className="flex gap-2 mb-2">
                                <Button size="sm" variant="outline" onClick={addRow}>+ Add Row</Button>
                                <Button size="sm" variant="outline" onClick={addCol}>+ Add Column</Button>
                            </div>
                            <div className="flex-1 overflow-auto border rounded">
                                <table className="w-full border-collapse">
                                    <tbody>
                                        {data.map((row, rIdx) => (
                                            <tr key={rIdx}>
                                                {row.map((cell, cIdx) => (
                                                    <td key={cIdx} className="border p-0">
                                                        <input 
                                                            className="w-full min-w-[100px] h-full p-2 text-sm outline-none focus:bg-muted font-mono"
                                                            value={cell || ""}
                                                            onChange={(e) => handleCellChange(rIdx, cIdx, e.target.value)}
                                                        />
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="outline" disabled={saving}>Cancel</Button>
                    </DialogClose>
                    <Button onClick={handleSave} disabled={saving || loading}>
                        {saving && <Loader size={16} color="white" className="mr-2"/>}
                        Save & Update
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
