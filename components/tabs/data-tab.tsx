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
import { FileUp, Download, Search, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';
import { AISuggestionPanel } from '../ai-suggestion-panel';

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

export const DataTab: FC<DataTabProps> = ({ clients, workers, tasks, saveData, saveSingleDoc }) => {
    const [errors, setErrors] = useState<ValidationError[]>([]);
    const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
    const [searchTerms, setSearchTerms] = useState({ clients: '', workers: '', tasks: '' });

    const dataMap = { clients, workers, tasks };

    const validateAllData = useCallback(() => {
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
            if (c.PriorityLevel === 1 && (c.RequestedTaskIDs?.length || 0) > 5) {
                allSuggestions.push(`Client ${c.ClientID} has the highest priority (1) but requests many tasks (${c.RequestedTaskIDs?.length}). This might be unusual.`);
            }
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
            itemToUpdate[field as keyof typeof itemToUpdate] = String(value).split(',').map(s => s.trim()).filter(Boolean).join(',');
        } else if (['PriorityLevel', 'Duration', 'MaxLoadPerPhase', 'MaxConcurrent'].includes(field)) {
            itemToUpdate[field as keyof typeof itemToUpdate] = (parseInt(String(value), 10) || 0).toString();
        } else {
            itemToUpdate[field as keyof typeof itemToUpdate] = value;
        }

        await saveSingleDoc(entityType, itemToUpdate);
        validateAllData();
    };

    const handleSearch = (entityType: EntityType, term: string) => {
        setSearchTerms(prev => ({ ...prev, [entityType]: term }));
    };

    const dataSections = [
        { title: 'Clients', entityType: 'clients' as EntityType, data: clients, onDrop: (files: File[]) => onDrop(files, 'clients') },
        { title: 'Workers', entityType: 'workers' as EntityType, data: workers, onDrop: (files: File[]) => onDrop(files, 'workers') },
        { title: 'Tasks', entityType: 'tasks' as EntityType, data: tasks, onDrop: (files: File[]) => onDrop(files, 'tasks') },
    ];

    return (
        <div className="space-y-6 mt-6">
            <ValidationPanel errors={errors} />
            <AISuggestionPanel suggestions={aiSuggestions} />
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