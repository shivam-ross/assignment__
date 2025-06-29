"use client";

import React, { useState, FC } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';

import { generateUniqueId, downloadJson } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Download, Bot, PlusCircle } from 'lucide-react';
import { toast } from 'sonner';

// Initialize Google Generative AI
const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY!);

interface RulesTabProps {
    rules: any[];
    onUpdate: (rules: any[]) => void;
}

const generateRuleFromAI = async (prompt: string): Promise<any> => {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        
        const fullPrompt = `
        Convert the following natural language rule into a structured JSON format.
        The output should be a JSON object with "type" and "params" properties.
        
        Supported rule types:
        1. CO_RUN - Tasks that must run together
           Example: { "type": "CO_RUN", "params": { "taskIds": ["T1", "T2"] } }
        
        2. EXCLUSION - Tasks that cannot run together
           Example: { "type": "EXCLUSION", "params": { "taskIds": ["T3", "T4"] } }
        
        3. SEQUENTIAL - Tasks that must run in sequence
           Example: { "type": "SEQUENTIAL", "params": { "taskIds": ["T5", "T6"] } }
        
        Input rule: "${prompt}"
        
        Respond with ONLY the JSON object, no additional text or markdown formatting.
        `;

        const result = await model.generateContent(fullPrompt);
        const response = await result.response;
        const text = response.text();

        // Try to parse the response directly
        try {
            return JSON.parse(text);
        } catch (e) {
            // If direct parse fails, try to extract JSON from markdown
            const jsonMatch = text.match(/{[\s\S]*}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            throw new Error("Could not parse AI response");
        }
    } catch (error: any) {
        console.error("AI generation error:", error);
        throw new Error(`AI generation failed: ${error.message}`);
    }
};

export const RulesTab: FC<RulesTabProps> = ({ rules, onUpdate }) => {
    const [naturalLanguageRule, setNaturalLanguageRule] = useState('');
    const [isConverting, setIsConverting] = useState(false);

    const handleNaturalLanguageConvert = async () => {
        if (!naturalLanguageRule.trim()) {
            toast.error("Please enter a rule description");
            return;
        }

        setIsConverting(true);
        try {
            const aiResponseJson = await generateRuleFromAI(naturalLanguageRule);
            
            if (!aiResponseJson.type || !aiResponseJson.params) {
                throw new Error("Invalid rule format from AI");
            }

            onUpdate([...rules, { 
                id: generateUniqueId(), 
                type: aiResponseJson.type,
                params: aiResponseJson.params 
            }]);
            
            setNaturalLanguageRule('');
            toast.success("Rule successfully generated");
        } catch (error: any) {
            console.error("Rule generation error:", error);
            toast.error(`Failed to generate rule: ${error.message}`);
        } finally {
            setIsConverting(false);
        }
    };

    const addRule = (type: string) => {
        const newRule = { 
            id: generateUniqueId(), 
            type, 
            params: { taskIds: [] } 
        };
        onUpdate([...rules, newRule]);
    };

    const updateRuleParams = (id: string, newParams: any) => {
        const updatedRules = rules.map(r => 
            r.id === id ? { ...r, params: newParams } : r
        );
        onUpdate(updatedRules);
    };

    const deleteRule = (id: string) => {
        const updatedRules = rules.filter(r => r.id !== id);
        onUpdate(updatedRules);
    };

    return (
        <div className="space-y-6 mt-6">
            <Card>
                <CardHeader>
                    <CardTitle>Natural Language to Rule (AI-Powered)</CardTitle>
                    <CardDescription>
                        Describe a rule in plain English, and our AI will convert it into a structured format.
                        Examples: "Tasks T1 and T2 must run together", "T3 cannot run with T4", "T5 must run before T6"
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Input
                        value={naturalLanguageRule}
                        onChange={e => setNaturalLanguageRule(e.target.value)}
                        placeholder="e.g., 'Tasks T1, T2, and T5 must run together'"
                    />
                    <Button 
                        onClick={handleNaturalLanguageConvert} 
                        disabled={isConverting || !naturalLanguageRule.trim()}
                    >
                        <Bot className="mr-2 h-4 w-4" />
                        {isConverting ? 'Generating...' : 'Generate Rule with AI'}
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
                        <div className="flex gap-2">
                            <Button 
                                variant="secondary" 
                                onClick={() => addRule('CO_RUN')}
                            >
                                <PlusCircle className="mr-2 h-4 w-4" /> Add Co-run Rule
                            </Button>
                            <Button 
                                variant="outline" 
                                onClick={() => downloadJson(rules, 'rules.json')}
                            >
                                <Download className="mr-2 h-4 w-4" /> Export
                            </Button>
                        </div>
                     </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-4 pt-4">
                        {rules.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                No rules defined yet. Add rules using the AI generator or manual buttons.
                            </div>
                        ) : (
                            rules.map(rule => (
                                <div key={rule.id} className="border p-4 rounded-md bg-secondary/50">
                                    <div className="flex justify-between items-start">
                                        <h4 className="font-semibold text-foreground">
                                            {rule.type.replace('_', ' ')} Rule
                                        </h4>
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            onClick={() => deleteRule(rule.id)}
                                            className="text-red-500 hover:text-red-600"
                                        >
                                            Delete
                                        </Button>
                                    </div>
                                    
                                    {['CO_RUN', 'EXCLUSION', 'SEQUENTIAL'].includes(rule.type) && (
                                        <div className="mt-2 space-y-2">
                                            <label className="text-sm font-medium">
                                                Task IDs (comma-separated):
                                            </label>
                                            <Input
                                                value={rule.params.taskIds?.join(', ') || ''}
                                                onChange={e => updateRuleParams(
                                                    rule.id, 
                                                    { 
                                                        taskIds: e.target.value
                                                            .split(',')
                                                            .map(s => s.trim())
                                                            .filter(Boolean)
                                                    }
                                                )}
                                                placeholder="T1, T2, T3"
                                            />
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};