export interface BaseData {
  id: string; 
}

export interface Client extends BaseData {
  ClientID: string;
  ClientGroup?: string;
  PriorityLevel?: number; 
  RequestedTaskIDs?: string[]; 
  AttributesJSON?: string;
}

export interface Worker extends BaseData {
  WorkerID: string;
  WorkerGroup?: string;
  Skills?: string[]; 
  AvailableSlots?: number[]; 
  MaxLoadPerPhase?: number; 
  MaxConcurrent?: number;
}

export interface Task extends BaseData {
  TaskID: string;
  RequiredSkills?: string[];
  PreferredPhases?: (number | string)[];
  Duration?: number;
  CoRunTaskIDs?: string[];
}

export type EntityType = 'clients' | 'workers' | 'tasks';

export interface ValidationError {
  rowId: any;
  entityType: EntityType;
  id: string;
  field: string;
  message: string;
  suggestion?: string;
}