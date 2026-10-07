import { start } from './app.mjs';
import { startSupervision } from './supervision.mjs';
import { startManagement } from './management.mjs';
start();
startSupervision();
startManagement();
