"use client";

import React, { useState, FC } from 'react';

import { generateUniqueId, downloadJson } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Download, Bot, PlusCircle } from 'lucide-react';

interface RulesTabProps {
    rules: any[];
    onUpdate: (rules: any[]) => void;
}

const generateRuleFromAI = async (prompt: string): Promise<any> => {
    console.log("--- CONCEPTUAL API CALL TO GEMINI ---");
    console.log("Prompt:", prompt);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const lowerCaseRule = prompt.toLowerCase();
    if (lowerCaseRule.includes("run together") || lowerCaseRule.includes("co-run")) {
        const taskIds = prompt.match(/T\d+/g) || [];
        return { type: 'CO_RUN', params: { taskIds } };
    }
    return { type: 'UNKNOWN', params: { message: "Could not parse rule."} };
};


export const RulesTab: FC<RulesTabProps> = ({ rules, onUpdate }) => {
    const [naturalLanguageRule, setNaturalLanguageRule] = useState('');
    const [isConverting, setIsConverting] = useState(false);

    const handleNaturalLanguageConvert = async () => {
        if (!naturalLanguageRule) return;
        setIsConverting(true);

        const promptForLLM = `Convert the following rule into a JSON object with 'type' and 'params' keys. Rule: "${naturalLanguageRule}"`;
        const aiResponseJson = await generateRuleFromAI(promptForLLM);
        
        onUpdate([...rules, { id: generateUniqueId(), ...aiResponseJson }]);
        setNaturalLanguageRule('');
        setIsConverting(false);
    };

    const addRule = (type: string) => {
        const newRule = { id: generateUniqueId(), type, params: {} };
        onUpdate([...rules, newRule]);
    };

    const updateRuleParams = (id: string, newParams: any) => {
        const updatedRules = rules.map(r => r.id === id ? { ...r, params: newParams } : r);
        onUpdate(updatedRules);
    };

    return (
        <div className="space-y-6 mt-6">
            <Card>
                <CardHeader>
                    <CardTitle>Natural Language to Rule (AI-Powered)</CardTitle>
                    <CardDescription>Describe a rule in plain English, and our AI will attempt to convert it into a structured format.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Input
                        value={naturalLanguageRule}
                        onChange={e => setNaturalLanguageRule(e.target.value)}
                        placeholder="e.g., 'Tasks T1, T2, and T5 must run together'"
                    />
                    <Button onClick={handleNaturalLanguageConvert} disabled={isConverting}>
                        <Bot className="mr-2 h-4 w-4" />
                        {isConverting ? 'Converting...' : 'Generate Rule with AI'}
                    </Button>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                     <div className="flex justify-between items-center">
                        <div>
                            <CardTitle>Defined Rules</CardTitle>
                            <CardDescription>Manually add or edit allocation rules.</CardDescription>
                        </div>
                        <Button variant="outline" onClick={() => downloadJson(rules, 'rules.json')}>
                            <Download className="mr-2 h-4 w-4" />
                            Download Rules
                        </Button>
                     </div>
                </CardHeader>
                <CardContent className="space-y-4">
                     <div className="flex gap-2">
                        <Button variant="secondary" onClick={() => addRule('CO_RUN')}>
                            <PlusCircle className="mr-2 h-4 w-4" /> Add Co-run Rule
                        </Button>
                    </div>
                    <div className="space-y-4 pt-4">
                        {rules.map(rule => (
                            <div key={rule.id} className="border p-4 rounded-md bg-secondary/50">
                                <h4 className="font-semibold text-foreground">Rule Type: {rule.type}</h4>
                                {rule.type === 'CO_RUN' && (
                                    <div className="mt-2 space-y-2">
                                        <label className="text-sm font-medium">Task IDs (comma-separated):</label>
                                        <Input
                                            defaultValue={rule.params.taskIds?.join(', ')}
                                            onChange={e => updateRuleParams(rule.id, { taskIds: e.target.value.split(',').map(s => s.trim()) })}
                                        />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};