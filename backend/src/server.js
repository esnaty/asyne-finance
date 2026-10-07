import { app } from './app.js';
import { migrate,pool } from './db.js';
await migrate();
const server=app.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('Asyne Finance API ready on :3000'));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(async()=>{await pool.end();process.exit(0);}));
