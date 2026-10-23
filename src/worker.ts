import {parentPort, workerData} from 'node:worker_threads';
import {scan} from './scanner';
try {parentPort?.postMessage({scan: scan(workerData)});} catch {parentPort?.postMessage({error: 'The configuration could not be scanned.'});}
