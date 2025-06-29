"use client";

import React, { FC } from 'react';

// Utils and Components
import { downloadJson } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Download } from 'lucide-react';

interface PrioritizationTabProps {
    priorities: any;
    onUpdate: (priorities: any) => void;
}

export const PrioritizationTab: FC<PrioritizationTabProps> = ({ priorities, onUpdate }) => {
    
    const handleSliderChange = (key: string, value: number[]) => {
        onUpdate({ ...priorities, [key]: value[0] });
    };

    const applyPreset = (profile: 'balanced' | 'fulfill' | 'workload') => {
        const presets = {
            balanced: { fulfill: 50, workload: 30, priority: 20 },
            fulfill: { fulfill: 80, workload: 10, priority: 10 },
            workload: { fulfill: 20, workload: 70, priority: 10 },
        };
        onUpdate(presets[profile]);
    };

    const criteria = [
        { key: 'fulfill', label: 'Maximize Fulfillment', description: 'Prioritize completing as many tasks as possible.' },
        { key: 'workload', label: 'Minimize Workload', description: 'Prioritize keeping worker loads low and balanced.' },
        { key: 'priority', label: 'Client Priority', description: 'Prioritize tasks from high-priority clients.' },
    ];

    return (
        <div className="space-y-6 mt-6">
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <div>
                            <CardTitle>Prioritization & Weights</CardTitle>
                            <CardDescription>Adjust the importance of goals for the allocation engine.</CardDescription>
                        </div>
                        <Button variant="outline" onClick={() => downloadJson(priorities, 'priorities.json')}>
                           <Download className="mr-2 h-4 w-4" /> Download Config
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-8">
                     <div>
                        <Label className="font-semibold">Preset Profiles</Label>
                        <div className="flex gap-2 mt-2">
                            <Button variant="secondary" onClick={() => applyPreset('balanced')}>Balanced</Button>
                            <Button variant="secondary" onClick={() => applyPreset('fulfill')}>Max Fulfillment</Button>
                            <Button variant="secondary" onClick={() => applyPreset('workload')}>Min Workload</Button>
                        </div>
                    </div>
                    <div className="space-y-6">
                        {criteria.map(({ key, label, description }) => (
                            <div key={key} className="space-y-3">
                                <Label htmlFor={key} className="text-base">{label}</Label>
                                <p className="text-sm text-muted-foreground">{description}</p>
                                <div className="flex items-center gap-4">
                                    <Slider
                                        id={key}
                                        min={0}
                                        max={100}
                                        step={5}
                                        value={[priorities[key] || 0]}
                                        onValueChange={(val) => handleSliderChange(key, val)}
                                    />
                                    <span className="font-bold text-primary w-12 text-center">{priorities[key] || 0}%</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};