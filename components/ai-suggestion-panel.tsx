"use client";

import { FC } from 'react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Lightbulb } from 'lucide-react';

interface AISuggestionPanelProps {
    suggestions: string[];
}

export const AISuggestionPanel: FC<AISuggestionPanelProps> = ({ suggestions }) => {
    if (suggestions.length === 0) return null;
    return (
        <Alert variant="default" className="border-blue-500 text-blue-700">
            <Lightbulb className="h-4 w-4" />
            <AlertTitle>AI Anomaly Detector</AlertTitle>
            <AlertDescription>
                <p className="mb-2">Potential anomalies detected in the data:</p>
                <ul className="list-disc list-inside space-y-1">
                    {suggestions.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
            </AlertDescription>
        </Alert>
    );
};