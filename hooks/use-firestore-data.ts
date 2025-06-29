"use client";

import { useState, useEffect } from 'react';
import { onAuthStateChanged, User, signInAnonymously } from 'firebase/auth';
import { doc, onSnapshot, collection, writeBatch, getDocs, setDoc } from 'firebase/firestore';
import { auth, db, __app_id } from '@/lib/firebase';
import { Client, Worker, Task, EntityType } from '@/types';

export const useFirestoreData = () => {
    const [user, setUser] = useState<User | null>(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [clients, setClients] = useState<Client[]>([]);
    const [workers, setWorkers] = useState<Worker[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [rules, setRules] = useState<any[]>([]);
    const [priorities, setPriorities] = useState<any>({ fulfill: 50, workload: 30, priority: 20 });

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                setUser(user);
            } else {
                try {
                    const userCredential = await signInAnonymously(auth);
                    setUser(userCredential.user);
                } catch (error) {
                    console.error("Anonymous sign-in failed:", error);
                }
            }
            setIsAuthReady(true);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!isAuthReady || !user) return;

        const dataTypes: EntityType[] = ['clients', 'workers', 'tasks'];
        const stateSetters = { clients: setClients, workers: setWorkers, tasks: setTasks };

        const unsubscribes = dataTypes.map(type => {
            const collPath = `artifacts/${__app_id}/users/${user.uid}/${type}`;
            return onSnapshot(collection(db, collPath), (snapshot) => {
                const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
                stateSetters[type](data as any);
            }, (error) => {
                console.error(`Firestore listener error for ${type}:`, error);
            });
        });

        const rulesDocRef = doc(db, `artifacts/${__app_id}/users/${user.uid}/config/rules`);
        const unsubRules = onSnapshot(rulesDocRef, (doc) => {
            if (doc.exists()) setRules(doc.data().rules || []);
        });

        const prioritiesDocRef = doc(db, `artifacts/${__app_id}/users/${user.uid}/config/priorities`);
        const unsubPriorities = onSnapshot(prioritiesDocRef, (doc) => {
            if (doc.exists()) setPriorities(doc.data().priorities || {});
        });

        return () => {
            unsubscribes.forEach(unsub => unsub());
            unsubRules();
            unsubPriorities();
        };
    }, [isAuthReady, user]);

    const saveDataToFirestore = async (entityType: EntityType, data: any[]) => {
        if (!isAuthReady || !user) throw new Error("Auth not ready.");
        const collPath = `artifacts/${__app_id}/users/${user.uid}/${entityType}`;
        const batch = writeBatch(db);
        const querySnapshot = await getDocs(collection(db, collPath));
        querySnapshot.forEach(doc => batch.delete(doc.ref));
        data.forEach(item => {
            const { id, ...rest } = item;
            const docRef = doc(db, collPath, id);
            batch.set(docRef, rest);
        });
        await batch.commit();
    };
    
    const saveSingleDocToFirestore = async (entityType: EntityType, item: any) => {
        if (!isAuthReady || !user) throw new Error("Auth not ready.");
        const { id, ...rest } = item;
        if (!id) throw new Error("Item must have an ID to be saved.");
        const docRef = doc(db, `artifacts/${__app_id}/users/${user.uid}/${entityType}/${id}`);
        await setDoc(docRef, rest, { merge: true });
    };

    const saveConfigToFirestore = async (configType: 'rules' | 'priorities', data: any) => {
        if (!isAuthReady || !user) throw new Error("Auth not ready.");
        const docRef = doc(db, `artifacts/${__app_id}/users/${user.uid}/config/${configType}`);
        await setDoc(docRef, { [configType]: data });
    };

    return { user, isAuthReady, clients, workers, tasks, rules, priorities, saveDataToFirestore, saveSingleDocToFirestore, saveConfigToFirestore };
};