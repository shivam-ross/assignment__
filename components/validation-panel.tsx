"use client";

import { FC } from 'react';
import { AlertCircle, CheckCircle, Lightbulb } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ValidationError } from '@/types';

interface ValidationPanelProps {
    errors: ValidationError[];
}

export const ValidationPanel: FC<ValidationPanelProps> = ({ errors }) => {
    if (errors.length === 0) {
        return (
            <Alert variant="default" className="border-green-500 text-green-700">
                <CheckCircle className="h-4 w-4" />
                <AlertTitle>All Clear!</AlertTitle>
                <AlertDescription>
                    No validation errors found in the loaded data.
                </AlertDescription>
            </Alert>
        );
    }

    return (
        <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Validation Errors ({errors.length} found)</AlertTitle>
            <AlertDescription>
                <ul className="mt-2 list-disc list-inside space-y-1 max-h-48 overflow-y-auto">
                    {errors.map((err, index) => (
                        <li key={index}>
                           <span className="font-semibold capitalize">{err.entityType} (ID: {err.id}, Field: {err.field}):</span> {err.message}
                           {err.suggestion && (
                                <span className="ml-2 text-xs font-semibold bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded-full inline-flex items-center">
                                    <Lightbulb className="h-3 w-3 mr-1" />
                                    Suggestion: {err.suggestion}
                                </span>
                           )}
                        </li>
                    ))}
                </ul>
            </AlertDescription>
        </Alert>
    );
};