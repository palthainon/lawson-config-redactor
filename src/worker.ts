import {parentPort, workerData} from 'node:worker_threads';
import {scan} from './scanner';
try {parentPort?.postMessage({scan: scan(typeof workerData==='string'?workerData:workerData.source,typeof workerData==='string'?'cisco-ios':workerData.profile)});} catch {parentPort?.postMessage({error: 'The configuration could not be scanned.'});}
