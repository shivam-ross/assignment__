"use client";

import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';

import { useFirestoreData } from '../hooks/use-firestore-data';

import { Header } from '../components/header';
import { DataTab } from '../components/tabs/data-tab';
import { RulesTab } from '../components/tabs/rules-tab';
import { PrioritizationTab } from '../components/tabs/prioritization-tab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";

export default function DataAlchemistPage() {
    const { 
        user, 
        isAuthReady, 
        clients, 
        workers, 
        tasks, 
        rules, 
        priorities, 
        saveDataToFirestore, 
        saveSingleDocToFirestore, 
        saveConfigToFirestore 
    } = useFirestoreData();
    
    const [loadingProgress, setLoadingProgress] = useState(0);

    useEffect(() => {
        if (!isAuthReady) {
            const interval = setInterval(() => {
                setLoadingProgress(prev => (prev >= 90 ? 90 : prev + 10));
            }, 200);
            return () => clearInterval(interval);
        } else {
            setLoadingProgress(100);
        }
    }, [isAuthReady]);

    if (!isAuthReady || loadingProgress < 100) {
        return (
            <div className="min-h-screen bg-background flex flex-col justify-center items-center gap-4 px-4">
                <div className="w-full max-w-md text-center">
                    <h1 className="text-2xl font-bold text-foreground">Data Alchemist 🧙‍♂️</h1>
                    <p className="text-muted-foreground mt-2">Authenticating and initializing application...</p>
                    <Progress value={loadingProgress} className="w-full mt-4" />
                </div>
            </div>
        );
    }
    
    return (
        <div className="min-h-screen bg-secondary/40">
            <Header userId={user?.uid || null} />
            <main className="container mx-auto p-4 md:p-6">
                <Tabs defaultValue="data" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="data">Data Ingestion & Validation</TabsTrigger>
                        <TabsTrigger value="rules">Rule Definition</TabsTrigger>
                        <TabsTrigger value="prioritization">Prioritization & Weights</TabsTrigger>
                    </TabsList>
                    <TabsContent value="data">
                        <DataTab 
                            clients={clients}
                            workers={workers}
                            tasks={tasks}
                            saveData={saveDataToFirestore}
                            saveSingleDoc={saveSingleDocToFirestore}
                        />
                    </TabsContent>
                    <TabsContent value="rules">
                       <RulesTab rules={rules} onUpdate={(newRules) => saveConfigToFirestore('rules', newRules)} />
                    </TabsContent>
                    <TabsContent value="prioritization">
                       <PrioritizationTab priorities={priorities} onUpdate={(newP) => saveConfigToFirestore('priorities', newP)} />
                    </TabsContent>
                </Tabs>
            </main>
        </div>
    );
}