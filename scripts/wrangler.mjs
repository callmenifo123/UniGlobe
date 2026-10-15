import {spawnSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const config=process.env.XDG_CONFIG_HOME||join(tmpdir(),'uniglobe-tool-config');
mkdirSync(config,{recursive:true});
const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js',...process.argv.slice(2)],{stdio:'inherit',env:{...process.env,XDG_CONFIG_HOME:config,WRANGLER_SEND_METRICS:'false'}});
process.exit(result.status??1);
