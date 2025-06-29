"use client";

import { FC } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from './ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { EntityType, ValidationError } from '@/types';

interface EditableTableProps {
    entityType: EntityType;
    data: any[];
    errors: ValidationError[];
    onUpdate: (rowIndex: number, field: string, value: any, entityType: EntityType) => void | Promise<void>;
    searchTerm: string;
}

export const EditableTable: FC<EditableTableProps> = ({ entityType, data, errors, onUpdate, searchTerm }) => {
    if (data.length === 0) {
        return <p className="text-muted-foreground text-center py-8">No data loaded. Please upload a file.</p>;
    }

    const headers = Object.keys(data[0]).filter(h => h !== 'id');
    const entityIdKey = headers[0];

    const filteredData = data.filter(row => {
    if (!searchTerm) return true;
    const lowerSearchTerm = searchTerm.toLowerCase();

    const match = lowerSearchTerm.match(/(duration|prioritylevel)\s*(>|<|=)\s*(\d+)/);
    if (match) {
        const [, key, operator, value] = match;
        const rowValue = row[key] as number;
        if (!rowValue) return false;
        const numValue = parseInt(value, 10);
        if (operator === '>') return rowValue > numValue;
        if (operator === '<') return rowValue < numValue;
        if (operator === '=') return rowValue === numValue;
    }

    const phaseMatch = lowerSearchTerm.match(/phase\s*(\d+)/);
    if (phaseMatch) {
        const [, phase] = phaseMatch;
        const numPhase = parseInt(phase, 10);
        return row.PreferredPhases?.includes(numPhase) || row.AvailableSlots?.includes(numPhase);
    }

    return Object.values(row).some(val =>
        String(val).toLowerCase().includes(lowerSearchTerm)
    );
});

    function getCellError(rowId: any, header: string): string | undefined {
        const error = errors.find(
            (err) => err.rowId === rowId && err.field === header
        );
        return error ? error.message : undefined;
    }

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    {headers.map(header => <TableHead key={header}>{header}</TableHead>)}
                </TableRow>
            </TableHeader>
            <TableBody>
                {filteredData.map((row, rowIndex) => (
                    <TableRow key={row.id}>
                        {headers.map(header => {
                            const errorMsg = getCellError(row[entityIdKey], header);
                            return (
                                <TableCell key={`${row.id}-${header}`} className={errorMsg ? "bg-destructive/10" : ""}>
                                    <TooltipProvider delayDuration={100}>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Input
                                                    defaultValue={Array.isArray(row[header]) ? row[header].join(', ') : row[header] ?? ''}
                                                    onBlur={(e) => onUpdate(rowIndex, header, e.target.value, entityType)}
                                                    className={`h-8 border-transparent hover:border-border focus-visible:ring-1 focus-visible:ring-ring ${errorMsg ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                                                />
                                            </TooltipTrigger>
                                            {errorMsg && <TooltipContent><p>{errorMsg}</p></TooltipContent>}
                                        </Tooltip>
                                    </TooltipProvider>
                                </TableCell>
                            );
                        })}
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
};