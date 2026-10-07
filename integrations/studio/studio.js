import { start } from './app.mjs';
import { startSupervision } from './supervision.mjs';
import { startManagement } from './management.mjs';
import { startFiles } from './files.mjs';
start();
startSupervision();
startManagement();
startFiles();
