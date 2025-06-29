"use client";

import React, { useState, useCallback, FC } from 'react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { useDropzone } from 'react-dropzone';

import { Client, Worker, Task, EntityType, ValidationError } from '@/types';
import { generateUniqueId, downloadCsv } from '@/lib/utils';

import { ValidationPanel } from '@/components/validation-panel';
import { EditableTable } from '@/components/editable-table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FileUp, Download, Search, UploadCloud, Bot } from 'lucide-react';
import { toast } from 'sonner';
import { AISuggestionPanel } from '../ai-suggestion-panel';
import { GoogleGenerativeAI } from "@google/generative-ai";

interface DataTabProps {
    clients: Client[];
    workers: Worker[];
    tasks: Task[];
    saveData: (entityType: EntityType, data: any[]) => Promise<void>;
    saveSingleDoc: (entityType: EntityType, item: any) => Promise<void>;
}

const mapHeader = (header: string): string => {
    const normalized = header.toLowerCase().replace(/[\s_-]/g, '');
    const map: { [key: string]: keyof (Client & Worker & Task) } = {
        clientid: 'ClientID', clientgroup: 'ClientGroup', prioritylevel: 'PriorityLevel', requestedtaskids: 'RequestedTaskIDs', attributesjson: 'AttributesJSON',
        workerid: 'WorkerID', workergroup: 'WorkerGroup', skills: 'Skills', availableslots: 'AvailableSlots', maxloadperphase: 'MaxLoadPerPhase', maxconcurrent: 'MaxConcurrent',
        taskid: 'TaskID', requiredskills: 'RequiredSkills', preferredphases: 'PreferredPhases', duration: 'Duration', coruntaskids: 'CoRunTaskIDs'
    };
    return map[normalized] || header;
};

// Server-side Gemini API call wrapper
const callGeminiAPI = async (prompt: string): Promise<string> => {
    try {
        const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY || '');
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error: any) {
        throw new Error(`Gemini API error: ${error.message}`);
    }
};

export const DataTab: FC<DataTabProps> = ({ clients, workers, tasks, saveData, saveSingleDoc }) => {
    const [errors, setErrors] = useState<ValidationError[]>([]);
    const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
    const [searchTerms, setSearchTerms] = useState({ clients: '', workers: '', tasks: '' });
    const [nlCommand, setNlCommand] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    const dataMap = { clients, workers, tasks };

    const validateAllData = useCallback(async () => {
        const allErrors: ValidationError[] = [];
        const allSuggestions: string[] = [];
        const allTaskIds = new Set(tasks.map(t => t.TaskID));
        const allWorkerSkills = new Set(workers.flatMap(w => w.Skills || []));
        const allRequiredSkills = new Set(tasks.flatMap(t => t.RequiredSkills || []));

        // Check duplicates
        const checkDuplicates = (items: any[], idKey: string, entityType: EntityType) => {
            const ids = new Set<string>();
            items.forEach(item => {
                const id = item[idKey] as string;
                if (!id) {
                    allErrors.push({
                        entityType, id: item.id, field: idKey, message: "Required ID is missing.",
                        rowId: undefined
                    });
                } else if (ids.has(id)) {
                    allErrors.push({
                        entityType, id, field: idKey, message: `Duplicate ID found: ${id}.`,
                        rowId: undefined
                    });
                }
                ids.add(id);
            });
        };

        checkDuplicates(clients, 'ClientID', 'clients');
        checkDuplicates(workers, 'WorkerID', 'workers');
        checkDuplicates(tasks, 'TaskID', 'tasks');

        // Validate clients
        clients.forEach(c => {
            if (c.PriorityLevel && (c.PriorityLevel < 1 || c.PriorityLevel > 5)) {
                allErrors.push({
                    entityType: 'clients', id: c.ClientID, field: 'PriorityLevel', message: 'Must be between 1-5.',
                    rowId: undefined
                });
            }
            if (c.AttributesJSON) {
                try { JSON.parse(c.AttributesJSON); }
                catch { allErrors.push({
                    entityType: 'clients', id: c.ClientID, field: 'AttributesJSON', message: 'Invalid JSON format.',
                    rowId: undefined
                }); }
            }
            c.RequestedTaskIDs?.forEach(tid => {
                if (!allTaskIds.has(tid)) {
                    allErrors.push({
                        entityType: 'clients', id: c.ClientID, field: 'RequestedTaskIDs', message: `Unknown TaskID: ${tid}.`,
                        rowId: undefined
                    });
                }
            });
        });

        // Validate workers
        workers.forEach(w => {
            if (w.MaxLoadPerPhase && w.MaxLoadPerPhase < 0) {
                allErrors.push({
                    entityType: 'workers', id: w.WorkerID, field: 'MaxLoadPerPhase', message: 'Cannot be negative.',
                    rowId: undefined
                });
            }
            if (w.MaxConcurrent && w.MaxConcurrent < 1) {
                allErrors.push({
                    entityType: 'workers', id: w.WorkerID, field: 'MaxConcurrent', message: 'Must be at least 1.',
                    rowId: undefined
                });
            }
            if (w.AvailableSlots?.some(s => isNaN(Number(s)))) {
                allErrors.push({
                    entityType: 'workers',
                    id: w.WorkerID,
                    field: 'AvailableSlots',
                    message: 'Contains non-numeric values.',
                    suggestion: w.AvailableSlots.map(s => String(s).replace(/\D/g, '')).join(', '),
                    rowId: undefined
                });
            }
        });

        // Validate tasks
        tasks.forEach(t => {
            if (t.Duration && t.Duration < 1) {
                allErrors.push({
                    entityType: 'tasks', id: t.TaskID, field: 'Duration', message: 'Must be at least 1.',
                    rowId: undefined
                });
            }
            t.RequiredSkills?.forEach(skill => {
                if (!allWorkerSkills.has(skill)) {
                    allErrors.push({
                        entityType: 'tasks', id: t.TaskID, field: 'RequiredSkills', message: `No worker has the required skill: ${skill}.`,
                        rowId: undefined
                    });
                }
            });
            if (t.PreferredPhases?.some(p => typeof p === 'string' && !/^\d+-\d+$/.test(p))) {
                allErrors.push({
                    entityType: 'tasks', id: t.TaskID, field: 'PreferredPhases', message: 'Invalid range format. Use "start-end".',
                    rowId: undefined
                });
            }
        });

        // Skill coverage
        allRequiredSkills.forEach(skill => {
            if (!allWorkerSkills.has(skill)) {
                allErrors.push({
                    entityType: 'tasks', id: 'Global', field: 'Skill Coverage', message: `The skill '${skill}' is required by a task but not provided by any worker.`,
                    rowId: undefined
                });
            }
        });

        // Gemini-powered suggestions for high-priority clients
        try {
            const highPriorityClients = clients.filter(c => c.PriorityLevel === 1 && (c.RequestedTaskIDs?.length || 0) > 5);
            if (highPriorityClients.length > 0) {
                setIsGenerating(true);
                const prompt = `Analyze clients with PriorityLevel 1 and more than 5 requested tasks. Suggest optimizations in plain text, one per line.\nClients: ${JSON.stringify(highPriorityClients)}`;
                const text = await callGeminiAPI(prompt);
                const suggestions = text.split('\n').filter(Boolean);
                allSuggestions.push(...suggestions);
            }
        } catch (error: any) {
            toast.error(`Error generating AI suggestions: ${error.message}`);
        } finally {
            setIsGenerating(false);
        }

        setErrors(allErrors);
        setAiSuggestions(allSuggestions);
    }, [clients, workers, tasks]);

    React.useEffect(() => {
        validateAllData();
    }, [validateAllData]);

    const onDrop = useCallback(async (acceptedFiles: File[], entityType: EntityType) => {
        const file = acceptedFiles[0];
        if (!file) return;

        try {
            const reader = new FileReader();
            reader.onabort = () => toast.error('File reading was aborted');
            reader.onerror = () => toast.error('File reading failed');
            reader.onload = async () => {
                try {
                    const data = reader.result;
                    let parsedData: any[];

                    if (file.name.endsWith('.csv')) {
                        parsedData = Papa.parse(data as string, { header: true, skipEmptyLines: true }).data;
                    } else if (file.name.endsWith('.xlsx')) {
                        const workbook = XLSX.read(data, { type: 'binary' });
                        parsedData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
                    } else {
                        throw new Error("Unsupported file type. Please use .csv or .xlsx.");
                    }

                    const transformedData = parsedData.map(row => {
                        const newRow: any = { id: generateUniqueId() };
                        for (const key in row) {
                            const mappedKey = mapHeader(key);
                            let value = row[key];
                            if (['RequestedTaskIDs', 'Skills', 'RequiredSkills', 'CoRunTaskIDs'].includes(mappedKey)) {
                                value = String(value).split(',').map(s => s.trim()).filter(Boolean);
                            } else if (['AvailableSlots', 'PreferredPhases'].includes(mappedKey)) {
                                value = String(value).replace(/[\[\]]/g, '').split(',').map(s => s.trim()).filter(Boolean);
                            } else if (['PriorityLevel', 'Duration', 'MaxLoadPerPhase', 'MaxConcurrent'].includes(mappedKey)) {
                                value = parseInt(String(value), 10);
                            }
                            newRow[mappedKey] = value;
                        }
                        return newRow;
                    }).filter(row => row.ClientID || row.WorkerID || row.TaskID);

                    await saveData(entityType, transformedData);
                    validateAllData();
                    toast.success(`${entityType} data uploaded successfully`);
                } catch (error: any) {
                    toast.error(`Error processing file: ${error.message}`);
                }
            };
            reader.readAsBinaryString(file);
        } catch (error: any) {
            toast.error(`Error processing file: ${error.message}`);
        }
    }, [saveData, validateAllData]);

    const handleUpdateCell = async (rowIndex: number, field: string, value: any, entityType: EntityType) => {
        const dataSet = dataMap[entityType];
        const itemToUpdate = { ...dataSet[rowIndex] };

        if (['RequestedTaskIDs', 'Skills', 'RequiredSkills', 'CoRunTaskIDs', 'AvailableSlots', 'PreferredPhases'].includes(field)) {
            const arrValue = String(value).split(',').map(s => s.trim()).filter(Boolean);
            // If the original field is a string, join the array back to a string
            if (typeof itemToUpdate[field as keyof typeof itemToUpdate] === 'string') {
                itemToUpdate[field as keyof typeof itemToUpdate] = arrValue.join(', ') as any;
            } else {
                itemToUpdate[field as keyof typeof itemToUpdate] = arrValue as any;
            }
        } else if (['PriorityLevel', 'Duration', 'MaxLoadPerPhase', 'MaxConcurrent'].includes(field)) {
            itemToUpdate[field as keyof typeof itemToUpdate] = String(parseInt(String(value), 10) || 0);
        } else {
            itemToUpdate[field as keyof typeof itemToUpdate] = value;
        }

        await saveSingleDoc(entityType, itemToUpdate);
        validateAllData();
    };

    const handleSearch = (entityType: EntityType, term: string) => {
        setSearchTerms(prev => ({ ...prev, [entityType]: term }));
    };

    const handleNaturalLanguageModify = async () => {
        if (!nlCommand) return;
        setIsGenerating(true);
        try {
            const prompt = `Parse the command to identify the entity (client, worker, task), ID, field, and value. Return a JSON object with entityType, id, field, and value.\nCommand: ${nlCommand}\nData: ${JSON.stringify({ clients, workers, tasks })}`;
            const text = await callGeminiAPI(prompt);

            let resultObj;
            try {
                resultObj = JSON.parse(text);
            } catch {
                const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/);
                if (jsonMatch) {
                    resultObj = JSON.parse(jsonMatch[1]);
                } else {
                    throw new Error('Invalid AI response format');
                }
            }

            const { entityType, id, field, value } = resultObj as { entityType: string; id: string; field: string; value: any };
            if (!entityType || !id || !field || value === undefined) {
                toast.error('Invalid command. Use format: Set [entity] [ID] [field] to [value], e.g., "Set Client C1 PriorityLevel to 3"');
                return;
            }

            const entityMap: { [key: string]: EntityType } = { client: 'clients', worker: 'workers', task: 'tasks' };
            const mappedEntityType = entityMap[entityType.toLowerCase()];
            if (!mappedEntityType) {
                toast.error(`Invalid entity type: ${entityType}`);
                return;
            }

            const dataSet = dataMap[mappedEntityType];
            const idKey = `${entityType.charAt(0).toUpperCase() + entityType.slice(1)}ID`;
            const item = dataSet.find(row => (row as any)[idKey] === id);

            if (!item) {
                toast.error(`${entityType} with ID ${id} not found.`);
                return;
            }

            const updatedItem = { ...item };
            if (['RequestedTaskIDs', 'Skills', 'RequiredSkills', 'CoRunTaskIDs', 'AvailableSlots', 'PreferredPhases'].includes(field)) {
                if (typeof updatedItem[field as keyof typeof updatedItem] === 'string') {
                    updatedItem[field as keyof typeof updatedItem] = String(value).split(',').map((s: string) => s.trim()).filter(Boolean).join(', ') as any;
                } else {
                    updatedItem[field as keyof typeof updatedItem] = String(value).split(',').map((s: string) => s.trim()).filter(Boolean) as any;
                }
            } else if (['PriorityLevel', 'MaxLoadPerPhase', 'MaxConcurrent', 'Duration'].includes(field)) {
                updatedItem[field as keyof typeof updatedItem] = String(parseInt(String(value), 10) || 0);
            } else {
                updatedItem[field as keyof typeof updatedItem] = value;
            }

            await saveSingleDoc(mappedEntityType, updatedItem);
            setNlCommand('');
            validateAllData();
            toast.success(`Successfully updated ${entityType} ${id}`);
        } catch (error: any) {
            toast.error(`Error modifying data: ${error.message}`);
        } finally {
            setIsGenerating(false);
        }
    };

    const applyAIFix = async (entityType: EntityType, id: string, field: string, suggestion: string) => {
        setIsGenerating(true);
        try {
            const prompt = `Validate and format the suggestion for the given entity, ID, and field. Return the validated value as plain text.\nEntity: ${entityType}, ID: ${id}, Field: ${field}, Suggestion: ${suggestion}`;
            const validatedSuggestion = await callGeminiAPI(prompt);

            const dataSet = dataMap[entityType];
            const idKey = `${entityType.slice(0, -1).charAt(0).toUpperCase() + entityType.slice(1, -1)}ID`;
            const item = dataSet.find(row => (row as any)[idKey] === id);
            if (!item) {
                toast.error(`${entityType} with ID ${id} not found.`);
                return;
            }

            const updatedItem = { ...item };
            if (['RequestedTaskIDs', 'Skills', 'RequiredSkills', 'CoRunTaskIDs', 'AvailableSlots', 'PreferredPhases'].includes(field)) {
                const arrValue = validatedSuggestion.split(',').map((s: string) => s.trim()).filter(Boolean);
                if (typeof updatedItem[field as keyof typeof updatedItem] === 'string') {
                    updatedItem[field as keyof typeof updatedItem] = arrValue.join(', ') as any;
                } else {
                    updatedItem[field as keyof typeof updatedItem] = arrValue as any;
                }
            } else if (['PriorityLevel', 'MaxLoadPerPhase', 'MaxConcurrent', 'Duration'].includes(field)) {
                updatedItem[field as keyof typeof updatedItem] = String(parseInt(validatedSuggestion, 10) || 0);
            } else {
                updatedItem[field as keyof typeof updatedItem] = validatedSuggestion;
            }

            await saveSingleDoc(entityType, updatedItem);
            validateAllData();
            toast.success(`Applied fix for ${entityType} ${id}`);
        } catch (error: any) {
            toast.error(`Error applying AI fix: ${error.message}`);
        } finally {
            setIsGenerating(false);
        }
    };

    const generateRuleRecommendations = async () => {
        setIsGenerating(true);
        try {
            const prompt = `Analyze client data for task co-occurrences and suggest rules in the format: "If task X is assigned, then assign task Y to the same worker." Return one rule per line.\nClients: ${JSON.stringify(clients)}`;
            const text = await callGeminiAPI(prompt);
            return text.split('\n').filter(Boolean);
        } catch (error: any) {
            toast.error(`Error generating rule recommendations: ${error.message}`);
            return [];
        } finally {
            setIsGenerating(false);
        }
    };

    const dataSections = [
        { title: 'Clients', entityType: 'clients' as EntityType, data: clients, onDrop: (files: File[]) => onDrop(files, 'clients') },
        { title: 'Workers', entityType: 'workers' as EntityType, data: workers, onDrop: (files: File[]) => onDrop(files, 'workers') },
        { title: 'Tasks', entityType: 'tasks' as EntityType, data: tasks, onDrop: (files: File[]) => onDrop(files, 'tasks') },
    ];

    return (
        <div className="space-y-6 mt-6">
            <ValidationPanel errors={errors} onFix={applyAIFix} />
            <AISuggestionPanel suggestions={aiSuggestions} />
            <Card>
                <CardHeader>
                    <CardTitle>Natural Language Data Modification</CardTitle>
                    <CardDescription>Modify data using plain English commands.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Input
                        value={nlCommand}
                        onChange={e => setNlCommand(e.target.value)}
                        placeholder="e.g., Set Client C1 PriorityLevel to 3 or Add skill Python to Worker W1"
                        disabled={isGenerating}
                    />
                    <Button onClick={handleNaturalLanguageModify} disabled={isGenerating}>
                        <Bot className="mr-2 h-4 w-4" />
                        {isGenerating ? 'Processing...' : 'Apply Command'}
                    </Button>
                </CardContent>
            </Card>
            {dataSections.map(({ title, entityType, data, onDrop: dropHandler }) => {
                const { getRootProps, getInputProps, isDragActive } = useDropzone({
                    onDrop: dropHandler,
                    accept: { 'text/csv': ['.csv'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] }
                });
                return (
                    <Card key={entityType}>
                        <CardHeader>
                            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                                <div>
                                    <CardTitle>{title}</CardTitle>
                                    <CardDescription>Manage {title.toLowerCase()} data. Drag & drop a file or click to upload.</CardDescription>
                                </div>
                                <Button variant="outline" onClick={() => downloadCsv(data, `${entityType}_cleaned.csv`)}>
                                    <Download className="mr-2 h-4 w-4" /> Download
                                </Button>
                            </div>
                            <div className="relative mt-4">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    type="search"
                                    placeholder={`Search ${title.toLowerCase()} (e.g., "duration > 5" or "phase 2")...`}
                                    className="w-full pl-8"
                                    value={searchTerms[entityType]}
                                    onChange={(e) => handleSearch(entityType, e.target.value)}
                                    disabled={isGenerating}
                                />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div
                                {...getRootProps()}
                                className={`p-6 border-2 border-dashed rounded-lg text-center cursor-pointer hover:border-primary transition-colors ${isDragActive ? 'border-primary bg-primary/10' : 'border-border'}`}
                            >
                                <input {...getInputProps()} />
                                <UploadCloud className="mx-auto h-12 w-12 text-muted-foreground" />
                                <p className="mt-2 text-sm text-muted-foreground">
                                    {isDragActive ? 'Drop the file here ...' : `Drag 'n' drop ${entityType}.csv/xlsx here, or click to select`}
                                </p>
                            </div>
                            <div className="mt-4">
                                <EditableTable
                                    entityType={entityType}
                                    data={data}
                                    errors={errors}
                                    onUpdate={handleUpdateCell}
                                    searchTerm={searchTerms[entityType]}
                                />
                            </div>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
};